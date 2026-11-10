// Pure cinematic camera solver.
//
// Two layers per shot:
//   1. layout (once per shot): side/angle, an occlusion-safe offset, base distance & lens,
//      chosen from subject anchors sampled across the WHOLE shot → no mid-shot pops.
//   2. per frame (`cameraAt`): aim, position and focus recomputed from anchors at time t.
//      Tracking uses a fixed time-window average over the subject's pure trajectory, so it is
//      smooth, continuous and identical for any frame visit order.
// Corrections only touch values the solver derived; authored values are used exactly.
import type { Intent } from "../core/behaviour";
import { clamp, lerp, lerpVec3, noise, progress, type EaseName, type Vec3 } from "../core/time";
import { keyedValue, splineAt, splineVec3 } from "../core/spline";
import { arcBlend, lifeOffset } from "./choreo";
import type { Box, CameraSpot } from "../world/layout";

export type ShotType = "establishing" | "wide" | "full" | "medium" | "close" | "two-shot" | "over-shoulder" | "insert" | "custom";
export const SHOT_TYPES: Record<ShotType, string> = {
  establishing: "Set camera spot (environment `cameras`); `spot` picks one.",
  wide: "Subject(s) small in frame with lots of set around them.",
  full: "Head to feet.",
  medium: "Head to waist.",
  close: "Head and shoulders.",
  "two-shot": "Two (or more) subjects together, head to waist.",
  "over-shoulder": "Over `over` actor's shoulder onto the subject.",
  insert: "Detail of a set item (`item` + optional `anchor`, e.g. a monitor's \"screen\").",
  custom: "Explicit `position` / `target` / `fov`.",
};

export type MoveType = "static" | "push-in" | "pull-out" | "truck" | "orbit" | "crane" | "handheld" | "life";
export const MOVES: Record<MoveType, string> = {
  static: "Locked off.",
  "push-in": "Moves toward the aim point (amount = fraction of distance, default 0.22).",
  "pull-out": "Moves away (amount default 0.3).",
  truck: "Slides sideways (amount = metres, default 0.6).",
  orbit: "Circles the aim point (amount = degrees, default 30).",
  crane: "Rises (amount = metres, default 0.6; negative descends).",
  handheld: "Seeded organic shake (amount = metres, default 0.012).",
  life: "Barely visible breathing camera: slow push + drift (amount = intensity, default 1). Opt-in.",
};
/** A move over [at, at + duration] (defaults: the whole shot). */
export type MoveSpec = { type: MoveType; amount?: number; ease?: EaseName; at?: number; duration?: number };
/** Solver-space keyframe (angle in degrees around the subject's facing; values hold until changed). */
export type ShotKey = { at: number; angle?: number; distance?: number; size?: number; height?: "eye" | "low" | "high" | number; lens?: number; fov?: number; offset?: [number, number]; roll?: number };
/** World-space keyframe for authored flights. */
export type PathKey = { at: number; position: Vec3; target: Vec3; lens?: number; fov?: number; roll?: number };
export type Tracking = boolean | { lag?: number; lead?: number };

export type FocusTarget = { actor: string; anchor?: string } | { item: string; anchor?: string } | Vec3;

export type Shot = {
  at: number;
  end: number;
  type: ShotType;
  subjects: string[];
  over?: string;
  spot?: string;
  item?: string;
  itemAnchor?: string;
  size?: number;
  angle?: number;
  height?: "eye" | "low" | "high" | number;
  distance?: number;
  lens?: number;
  fov?: number;
  position?: Vec3;
  target?: Vec3;
  offset?: [number, number];
  roll?: number;
  moves?: MoveSpec[];
  keys?: ShotKey[];
  path?: PathKey[];
  track?: Tracking;
  follow?: Tracking;
  focus?: "auto" | "none" | FocusTarget;
  rack?: { at: number; to: FocusTarget; duration?: number }[];
  dof?: "auto" | "off" | { bokeh?: number; range?: number };
  lock?: boolean;
  allowOcclusion?: string[];
  blend?: number;
  /** Findings in this shot the director accepts on purpose (core/behaviour.ts INTENTS). */
  allow?: Intent[];
  /** Engine 2: auto focus holds the last speaker among the subjects and pulls over this many seconds. */
  focusPull?: number;
  /** Engine 2: the blend into this shot arcs around the subject. */
  arcBlend?: boolean;
};

/** What the solver needs to know about the world. All functions must be pure in their args. */
export type SceneQuery = {
  aspect: number;
  anchor: (actor: string, anchor: string, t: number) => Vec3 | undefined;
  facing: (actor: string, t: number) => number;
  actorBox: (actor: string, t: number) => Box | undefined;
  actorIds: string[];
  item: (id: string, anchor: string) => Vec3 | undefined;
  itemYaw: (id: string) => number | undefined;
  itemSize: (id: string) => Vec3 | undefined;
  spot: (name: string) => CameraSpot | undefined;
  occluders: Box[];
  bounds?: { min: Vec3; max: Vec3 };
  speakerAt?: (t: number) => string | undefined;
  /** Dialogue lines sorted by start (for focus that holds the last speaker). */
  lines?: { speaker: string; start: number; end: number }[];
};

export type CameraFrame = {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  roll: number;
  focus: { distance: number; range: number; bokeh: number; point: Vec3 } | null;
  shot: number;
};

const DEG = Math.PI / 180;
const UP: Vec3 = [0, 1, 0];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dirFromYaw = (yaw: number): Vec3 => [Math.sin(yaw), 0, Math.cos(yaw)];

// ---------------------------------------------------------------- lens & framing specs

/** Vertical FOV (deg) for a focal length on the image's SHORT side (24 mm), so lenses look alike in 16:9 and 9:16. */
export const lensToFov = (mm: number, aspect: number) => {
  const shortHalf = Math.atan(12 / mm);
  return (aspect >= 1 ? 2 * shortHalf : 2 * Math.atan(Math.tan(shortHalf) / aspect)) / DEG;
};
const hfovOf = (vfovDeg: number, aspect: number) => 2 * Math.atan(Math.tan((vfovDeg * DEG) / 2) * aspect);

type Spec = { lens: number; fill: number; angle: number; dof: { bokeh: number; range: number } | null };
const SPECS: Record<ShotType, Spec> = {
  establishing: { lens: 28, fill: 0.5, angle: 0, dof: null },
  wide: { lens: 28, fill: 0.42, angle: 25, dof: null },
  full: { lens: 35, fill: 0.84, angle: 20, dof: { bokeh: 2, range: 1.4 } },
  medium: { lens: 40, fill: 0.86, angle: 15, dof: { bokeh: 3.5, range: 0.7 } },
  close: { lens: 50, fill: 0.9, angle: 18, dof: { bokeh: 6, range: 0.3 } },
  "two-shot": { lens: 35, fill: 0.82, angle: 0, dof: { bokeh: 2.5, range: 1.0 } },
  "over-shoulder": { lens: 45, fill: 0.85, angle: 0, dof: { bokeh: 5, range: 0.45 } },
  insert: { lens: 35, fill: 0.8, angle: 10, dof: { bokeh: 5, range: 0.2 } },
  custom: { lens: 35, fill: 1, angle: 0, dof: null },
};

type Window = { center: Vec3; top: number; bottom: number; face: number; halfWidth: number; facing: number; heads: Vec3[] };

/** Vertical framing window of the shot's subjects at time t. */
const framingWindow = (shot: Shot, q: SceneQuery, t: number): Window | null => {
  if (shot.type === "insert" && shot.item) {
    const c = q.item(shot.item, shot.itemAnchor ?? "center");
    if (!c) return null;
    const size = q.itemSize(shot.item) ?? [0.4, 0.4, 0.4];
    const h = Math.max(0.12, shot.itemAnchor === "screen" ? size[1] * 0.75 : size[1]) * (shot.size ?? 1);
    return { center: c, top: c[1] + h / 2, bottom: c[1] - h / 2, face: c[1], halfWidth: (size[0] / 2) * (shot.size ?? 1), facing: q.itemYaw(shot.item) ?? 0, heads: [c] };
  }
  const ids = shot.subjects.length ? shot.subjects : q.actorIds.slice(0, 1);
  const tops: number[] = [];
  const bottoms: number[] = [];
  const faces: number[] = [];
  const heads: Vec3[] = [];
  let fx = 0;
  let fz = 0;
  let halfW = 0;
  for (const id of ids) {
    const top = q.anchor(id, "top", t);
    const face = q.anchor(id, "face", t) ?? q.anchor(id, "head", t);
    const head = q.anchor(id, "head", t);
    const waist = q.anchor(id, "waist", t);
    const feet = q.anchor(id, "feet", t);
    if (!top || !face || !head || !waist || !feet) continue;
    const span = top[1] - face[1];
    const bottom =
      shot.type === "close" ? Math.max(feet[1], face[1] - 1.1 * span) :
      shot.type === "over-shoulder" ? lerp(face[1], waist[1], 0.55) :
      shot.type === "medium" || shot.type === "two-shot" ? waist[1] - 0.1 * (top[1] - waist[1]) :
      feet[1] - 0.04 * (top[1] - feet[1]);
    tops.push(top[1]);
    bottoms.push(bottom);
    faces.push(face[1]);
    heads.push(head);
    const yaw = q.facing(id, t);
    fx += Math.sin(yaw);
    fz += Math.cos(yaw);
    const box = q.actorBox(id, t);
    halfW = Math.max(halfW, box ? Math.max(box.half[0], box.half[2]) : 0.25);
  }
  if (!heads.length) return null;
  const top = Math.max(...tops);
  const bottom = Math.min(...bottoms);
  const cx = heads.reduce((s, h) => s + h[0], 0) / heads.length;
  const cz = heads.reduce((s, h) => s + h[2], 0) / heads.length;
  let spread = 0;
  for (const h of heads) spread = Math.max(spread, Math.hypot(h[0] - cx, h[2] - cz));
  const sizeK = shot.size ?? 1;
  const mid = (top + bottom) / 2;
  return {
    center: [cx, mid, cz],
    top: mid + ((top - mid) * sizeK),
    bottom: mid - ((mid - bottom) * sizeK),
    face: faces.reduce((s, f) => s + f, 0) / faces.length,
    halfWidth: (spread + halfW * 1.2) * sizeK,
    facing: Math.atan2(fx, fz),
    heads,
  };
};

// ---------------------------------------------------------------- occlusion & bounds

/** Does the segment a→b pass through the box? (slab test in the box's yaw frame) */
export const segmentHitsBox = (a: Vec3, b: Vec3, box: Box) => {
  const c = Math.cos(-box.yaw);
  const s = Math.sin(-box.yaw);
  const local = (p: Vec3): Vec3 => {
    const x = p[0] - box.center[0];
    const z = p[2] - box.center[2];
    return [x * c + z * s, p[1] - box.center[1], -x * s + z * c];
  };
  const p = local(a);
  const d = sub(local(b), p);
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const h = box.half[i];
    if (Math.abs(d[i]) < 1e-9) {
      if (p[i] < -h || p[i] > h) return false;
      continue;
    }
    let ta = (-h - p[i]) / d[i];
    let tb = (h - p[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  // Ignore grazing hits at the very ends (camera or target touching a surface).
  return t1 - t0 > 1e-3 && t0 < 0.985;
};

const insideBounds = (p: Vec3, b?: SceneQuery["bounds"]) =>
  !b || (p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2]);

/** Continuous soft clamp: identity well inside, eases into the limit (no jumps for moving cameras). */
const softClamp = (x: number, min: number, max: number, k = 0.25) => {
  if (x > max - k) x = max - k * Math.exp(-(x - (max - k)) / k);
  if (x < min + k) x = min + k * Math.exp((x - (min + k)) / k);
  return x;
};

// ---------------------------------------------------------------- per-frame helpers

/** Fixed-window causal average of a pure trajectory: smooth, lagging, order-independent. */
const smoothed = (f: (t: number) => Vec3 | null, t: number, window: number): Vec3 | null => {
  if (window <= 0) return f(t);
  const n = 12;
  let wsum = 0;
  let acc: Vec3 = [0, 0, 0];
  for (let k = 0; k <= n; k++) {
    const v = f(t - (window * k) / n);
    if (!v) continue;
    const w = Math.exp(-3 * (k / n) * (k / n));
    acc = add(acc, mul(v, w));
    wsum += w;
  }
  return wsum ? mul(acc, 1 / wsum) : null;
};

const lagOf = (v: Shot["track"], fallback: number) => (typeof v === "object" && v.lag !== undefined ? v.lag : fallback);
const leadOf = (v: Shot["track"]) => (typeof v === "object" && v.lead !== undefined ? v.lead : 0);

// ---------------------------------------------------------------- layout

export type ShotLayout = {
  /** World yaw of the direction from aim to camera. */
  yaw: number;
  /** The subjects' facing (or a two-shot's perpendicular) that `angle` is measured from. */
  baseYaw: number;
  /** Framing heights the shot's `height` refers to (face, top, bottom of the subjects mid-shot). */
  heights?: { face: number; top: number; bottom: number };
  /** Camera height above (or below) the aim point. */
  rise: number;
  distance: number;
  fov: number;
  offset: [number, number];
  /** Static aim used when not tracking. */
  aim: Vec3;
  /** Fixed body position for authored/establishing/over-shoulder shots. */
  fixed?: { position: Vec3; target: Vec3 };
  /** Vertical framing span in metres. */
  span: number;
  /** aim.y minus the subjects' mean window centre (keeps tracking aim at the framed height). */
  aimDY?: number;
  warnings: string[];
};

const layoutCache = new WeakMap<SceneQuery, Map<Shot, ShotLayout>>();

const sampleTimes = (shot: Shot) => {
  const d = Math.max(0.001, shot.end - shot.at);
  return [0, 0.25, 0.5, 0.75, 0.999].map((u) => shot.at + u * d);
};

const heightRise = (shot: Pick<Shot, "height">, w: Pick<Window, "top" | "bottom" | "face">, aimY: number) => {
  const span = w.top - w.bottom;
  const h = shot.height ?? "eye";
  const camY =
    h === "eye" ? w.face - 0.03 * span :
    h === "low" ? w.bottom + 0.15 * span :
    h === "high" ? w.top + 0.7 * span :
    w.face + h;
  return camY - aimY;
};

export const shotLayout = (shot: Shot, q: SceneQuery): ShotLayout => {
  let perQuery = layoutCache.get(q);
  if (!perQuery) layoutCache.set(q, (perQuery = new Map()));
  const cached = perQuery.get(shot);
  if (cached) return cached;
  const result = computeLayout(shot, q);
  perQuery.set(shot, result);
  return result;
};

const computeLayout = (shot: Shot, q: SceneQuery): ShotLayout => {
  const spec = SPECS[shot.type];
  const warnings: string[] = [];
  const fovAuthored = shot.fov !== undefined || shot.lens !== undefined;
  const baseFov = shot.fov ?? lensToFov(shot.lens ?? spec.lens, q.aspect);

  // Fully authored / spot-based shots: used exactly as written.
  if (shot.type === "custom" || shot.type === "establishing" || (shot.position && shot.target)) {
    const spot = shot.type === "establishing" ? q.spot(shot.spot ?? "establishing") : undefined;
    if (shot.type === "establishing" && !spot && !shot.position) warnings.push(`camera spot "${shot.spot ?? "establishing"}" not found`);
    const position = shot.position ?? spot?.position ?? [0, 1.6, 4];
    const target = shot.target ?? spot?.target ?? [0, 1, 0];
    const fov = shot.fov ?? (shot.lens ? lensToFov(shot.lens, q.aspect) : spot?.fov ?? 40);
    const d = sub(position, target);
    const yaw = Math.atan2(d[0], d[2]);
    return { yaw, baseYaw: yaw, rise: d[1], distance: len(d), fov, offset: [0, 0], aim: target, fixed: { position, target }, span: 2, warnings };
  }

  const times = sampleTimes(shot);
  const windows = times.map((t) => framingWindow(shot, q, t)).filter((w): w is Window => w !== null);
  if (!windows.length) {
    warnings.push(`shot at ${shot.at.toFixed(2)}s has no resolvable subject`);
    return { yaw: 0, baseYaw: 0, rise: 0.2, distance: 3, fov: baseFov, offset: [0, 0], aim: [0, 1, 0], span: 1, warnings };
  }
  const w0 = windows[Math.floor(windows.length / 2)];
  const top = Math.max(...windows.map((w) => w.top));
  const bottom = Math.min(...windows.map((w) => w.bottom));
  const aim: Vec3 = [
    windows.reduce((s, w) => s + w.center[0], 0) / windows.length,
    (top + bottom) / 2,
    windows.reduce((s, w) => s + w.center[2], 0) / windows.length,
  ];
  const span = top - bottom;

  // Over-the-shoulder: camera rides behind the foreground actor.
  if (shot.type === "over-shoulder" && shot.over) {
    return overShoulder(shot, q, w0, span, baseFov, fovAuthored, warnings);
  }

  // Base direction: in front of the subject(s), rotated by the shot angle.
  let baseYaw = w0.facing;
  if (shot.type === "two-shot" && w0.heads.length >= 2) {
    const a = w0.heads[0];
    const b = w0.heads[w0.heads.length - 1];
    const v = sub(b, a);
    let perp: Vec3 = norm([v[2], 0, -v[0]]);
    if (dot(perp, dirFromYaw(w0.facing)) < 0) perp = mul(perp, -1);
    baseYaw = Math.atan2(perp[0], perp[2]);
  }
  const angleAuthored = shot.angle !== undefined;
  const angle = (shot.angle ?? spec.angle) * DEG;

  // Distance that fits the span vertically AND the subject width horizontally.
  const fitDistance = (fov: number, yaw: number) => {
    const right = cross(dirFromYaw(yaw), UP);
    let half = 0;
    for (const w of windows) {
      for (const h of w.heads) half = Math.max(half, Math.abs(dot(sub(h, aim), right)));
      half = Math.max(half, w.halfWidth * 0.5);
    }
    half += windows[0].halfWidth * 0.5;
    const dv = span / spec.fill / 2 / Math.tan((fov * DEG) / 2);
    const dh = half / 0.85 / Math.tan(hfovOf(fov, q.aspect) / 2);
    return Math.max(dv, dh, 0.25);
  };

  const rise = heightRise(shot, w0, aim[1]);
  let fov = baseFov;
  const distanceAuthored = shot.distance !== undefined;
  const build = (yaw: number, distance: number) => {
    const horiz = Math.sqrt(Math.max(0.01, distance * distance - rise * rise));
    return add(aim, add(mul(dirFromYaw(yaw), horiz), [0, rise, 0]));
  };
  // The flat fit above ignores perspective: a camera above/below the aim with a wide lens sees the
  // near end of the span larger. Back off until the span's ends fit the lens's angular budget.
  const fitPerspective = (yaw: number, d: number) => {
    const budget = Math.tan((fov * DEG) / 2) * spec.fill;
    for (let i = 0; i < 8; i++) {
      const cam = build(yaw, d);
      const fwd = norm(sub(aim, cam));
      let worst = 0;
      for (const y of [top, bottom]) {
        const v = sub([aim[0], y, aim[2]], cam);
        const along = dot(v, fwd);
        worst = Math.max(worst, len(sub(v, mul(fwd, along))) / Math.max(1e-3, along));
      }
      if (worst <= budget * 1.001) break;
      d *= worst / budget;
    }
    return d;
  };
  const fit = (yaw: number) => fitPerspective(yaw, fitDistance(fov, yaw));

  const excluded = new Set([...shot.subjects, ...(shot.allowOcclusion ?? []), ...(shot.over ? [shot.over] : []), ...(shot.item ? [shot.item] : [])]);
  const clearFor = (yaw: number, distance: number) => {
    const fixedCam = build(yaw, distance);
    for (const t of times) {
      const w = framingWindow(shot, q, t);
      if (!w) continue;
      // A follow camera travels with its subject, so test where it will actually be at each sample.
      const cam = shot.follow ? add(fixedCam, sub(w.center, aim)) : fixedCam;
      const targets = shot.type === "insert" ? [w.center] : w.heads.map((h) => [h[0], w.face, h[2]] as Vec3);
      for (const target of targets) {
        for (const box of q.occluders) if (!excluded.has(box.id) && segmentHitsBox(cam, target, box)) return box.id;
        for (const id of q.actorIds) {
          if (excluded.has(id)) continue;
          const b = q.actorBox(id, t);
          if (b && segmentHitsBox(cam, target, b)) return id;
        }
      }
    }
    return null;
  };

  let yaw = baseYaw + angle;
  let distance = shot.distance ?? fit(yaw);

  // Occlusion: search nearby angles (only when the angle was not authored and the shot isn't locked).
  const blocker = clearFor(yaw, distance);
  if (blocker) {
    if (shot.lock || angleAuthored) {
      warnings.push(`camera view to subject is blocked by "${blocker}" (angle authored/locked, not corrected)`);
    } else {
      const offsets = [12, -12, 24, -24, 36, -36, 50, -50, 70, -70];
      const found = offsets.map((o) => baseYaw + angle + o * DEG).find((y) => clearFor(y, shot.distance ?? fit(y)) === null);
      if (found !== undefined) {
        yaw = found;
        distance = shot.distance ?? fit(yaw);
      } else if (!distanceAuthored) {
        // Last resort: move in front of the blocker on the requested angle, widening the lens.
        let d = distance;
        while (d > 0.25 && clearFor(yaw, d) !== null) d *= 0.88;
        if (clearFor(yaw, d) === null) {
          if (!fovAuthored) fov = clamp((2 * Math.atan(Math.tan((fov * DEG) / 2) * (distance / d))) / DEG, 10, 70);
          warnings.push(`moved camera closer to clear "${blocker}"`);
          distance = d;
        } else warnings.push(`no clear angle found around "${blocker}"; keeping the requested angle`);
      } else {
        warnings.push(`no clear angle found around "${blocker}"; keeping the requested angle`);
      }
    }
  }

  // Pan-only tracking keeps the camera body still: back off until every sampled moment fits.
  if (shot.track && !shot.follow && !distanceAuthored) {
    for (let iter = 0; iter < 3; iter++) {
      const cam = build(yaw, distance);
      let deficit = 0;
      for (const w of windows) {
        const need = (w.top - w.bottom) / spec.fill / 2 / Math.tan((fov * DEG) / 2);
        deficit = Math.max(deficit, need - len(sub(cam, w.center)));
      }
      if (deficit <= 0.01) break;
      distance += deficit;
    }
  }

  // Bounds: pull the camera in (and widen the lens to keep the framing) if it would leave the set.
  if (q.bounds && !insideBounds(build(yaw, distance), q.bounds)) {
    if (shot.lock || distanceAuthored) {
      warnings.push("camera is outside the set bounds (distance authored/locked, not corrected)");
    } else {
      let d = distance;
      while (d > 0.3 && !insideBounds(build(yaw, d), q.bounds)) d *= 0.95;
      if (!fovAuthored) {
        const needed = 2 * Math.atan(Math.tan((fov * DEG) / 2) * (distance / d)) / DEG;
        fov = clamp(needed, 10, 70);
      } else {
        warnings.push("pulled camera inside bounds with an authored lens: framing will be tighter");
      }
      distance = d;
    }
  }

  // Lead room: place a single subject off-centre, away from where it looks.
  let offset: [number, number] = shot.offset ?? [0, 0];
  if (!shot.offset && w0.heads.length === 1 && (shot.type === "close" || shot.type === "medium")) {
    const toCam = dirFromYaw(yaw);
    const facing = dirFromYaw(w0.facing);
    const side = dot(cross(toCam, facing), UP);
    offset = [clamp(side * 0.5, -0.22, 0.22), 0];
  }

  const meanCenterY = windows.reduce((s, w) => s + w.center[1], 0) / windows.length;
  return { yaw, baseYaw, rise, distance, fov, offset, aim, span, aimDY: aim[1] - meanCenterY, heights: { face: w0.face, top: w0.top, bottom: w0.bottom }, warnings };
};

const overShoulder = (shot: Shot, q: SceneQuery, w: Window, span: number, baseFov: number, fovAuthored: boolean, warnings: string[]): ShotLayout => {
  const t = shot.at + Math.min(0.5, (shot.end - shot.at) / 2);
  const over = shot.over!;
  const oHead = q.anchor(over, "head", t);
  const oTop = q.anchor(over, "top", t);
  const target: Vec3 = [w.center[0], lerp(w.face, w.center[1], 0.3), w.center[2]];
  if (!oHead || !oTop) {
    warnings.push(`over-shoulder actor "${over}" not found`);
    return { yaw: 0, baseYaw: 0, rise: 0, distance: 2, fov: baseFov, offset: [0, 0], aim: target, span, warnings };
  }
  const size = oTop[1] - (q.anchor(over, "feet", t)?.[1] ?? 0);
  const k = clamp(size / 1.78, 0.15, 3);
  // `side` picks which of the foreground actor's shoulders we look past (negative angle = other side).
  const side = shot.angle !== undefined && shot.angle < 0 ? -1 : 1;
  const back = norm([oHead[0] - target[0], 0, oHead[2] - target[2]]);
  const left = cross(back, UP); // camera-left when looking from behind `over` toward the subject
  // Look past a point just outside the foreground actor's silhouette so it sits at the frame edge.
  // Offsets scale with its width (a small mascot needs less room than its height suggests).
  const halfW = q.actorBox(over, t)?.half[0] ?? 0.25 * k;
  const pivot = add(oHead, add(mul(left, side * (halfW * 1.3 + 0.05)), [0, -0.12 * k, 0]));
  const dir = norm(sub(pivot, target));
  const position: Vec3 = add(add(pivot, mul(dir, 0.45 + halfW * 1.5)), [0, (shot.height === "high" ? 0.35 : 0.12) * k, 0]);
  const distance = len(sub(position, target));
  const fov = fovAuthored ? baseFov : clamp((2 * Math.atan(span / 0.75 / 2 / distance)) / DEG, 22, 55);
  const d = sub(position, target);
  const yaw = Math.atan2(d[0], d[2]);
  return { yaw, baseYaw: yaw, rise: d[1], distance, fov, offset: shot.offset ?? [side * 0.12, 0], aim: target, fixed: { position, target }, span, warnings };
};

// ---------------------------------------------------------------- evaluation

const subjectCenter = (shot: Shot, q: SceneQuery, layout: ShotLayout) => (t: number): Vec3 | null => {
  const w = framingWindow(shot, q, t);
  return w ? [w.center[0], w.center[1] + (layout.aimDY ?? 0), w.center[2]] : null;
};

const resolveFocus = (target: FocusTarget, q: SceneQuery, t: number): Vec3 | undefined => {
  if (Array.isArray(target)) return target;
  if ("actor" in target) return q.anchor(target.actor, target.anchor ?? "face", t);
  return q.item(target.item, target.anchor ?? "center");
};

const applyMoves = (shot: Shot, t: number, position: Vec3, target: Vec3, index: number, tracking: boolean) => {
  let pos = position;
  let aim = target;
  for (const m of shot.moves ?? []) {
    const start = m.at ?? shot.at;
    const u = progress(t, start, m.duration ?? shot.end - start, m.ease ?? "smooth");
    const toCam = sub(pos, aim);
    if (m.type === "push-in") pos = add(aim, mul(toCam, 1 - (m.amount ?? 0.22) * u));
    else if (m.type === "pull-out") pos = add(aim, mul(toCam, 1 + (m.amount ?? 0.3) * u));
    else if (m.type === "truck") {
      const right = norm(cross(mul(toCam, -1), UP));
      const shift = mul(right, (m.amount ?? 0.6) * (u - 0.5));
      pos = add(pos, shift);
      if (!tracking) aim = add(aim, shift);
    } else if (m.type === "orbit") {
      const a = (m.amount ?? 30) * DEG * (u - 0.5);
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos = add(aim, [toCam[0] * c + toCam[2] * s, toCam[1], -toCam[0] * s + toCam[2] * c]);
    } else if (m.type === "crane") pos = add(pos, [0, (m.amount ?? 0.6) * (u - 0.5), 0]);
    else if (m.type === "handheld") {
      const a = m.amount ?? 0.012;
      const seed = `handheld-${index}`;
      pos = add(pos, [noise(seed + "x", t, 0.9) * a, noise(seed + "y", t, 1.1) * a, noise(seed + "z", t, 0.7) * a]);
      aim = add(aim, [noise(seed + "ax", t, 0.8) * a * 0.6, noise(seed + "ay", t, 1.0) * a * 0.6, 0]);
    } else if (m.type === "life") {
      const o = lifeOffset(`life-${index}`, t, u, m.amount ?? 1, toCam, norm(cross(mul(toCam, -1), UP)));
      pos = add(pos, o.pos);
      aim = add(aim, o.aim);
    }
  }
  return { pos, aim };
};

/** The layout's framing values at time t, after the shot's keyframes (or the layout itself without keys). */
const keyedLayout = (shot: Shot, q: SceneQuery, L: ShotLayout, t: number) => {
  const keys = shot.keys;
  if (!keys?.length || L.fixed) return { yaw: L.yaw, rise: L.rise, distance: L.distance, fov: L.fov, offset: L.offset, roll: shot.roll ?? 0 };
  const at = shot.at;
  const value = (pick: (k: ShotKey) => number | undefined, base: number) => keyedValue(keys, pick, base, at, t);
  const angle = value((k) => k.angle, (L.yaw - L.baseYaw) / DEG);
  const heights = L.heights;
  return {
    yaw: L.baseYaw + angle * DEG,
    rise: value((k) => (k.height !== undefined && heights ? heightRise({ height: k.height }, heights, L.aim[1]) : undefined), L.rise),
    distance: value((k) => k.distance ?? (k.size !== undefined ? L.distance * k.size : undefined), L.distance),
    fov: value((k) => k.fov ?? (k.lens !== undefined ? lensToFov(k.lens, q.aspect) : undefined), L.fov),
    offset: [value((k) => k.offset?.[0], L.offset[0]), value((k) => k.offset?.[1], L.offset[1])] as [number, number],
    roll: value((k) => k.roll, shot.roll ?? 0),
  };
};

/** An authored flight: position, target, lens and roll follow world-space keyframes (moves still apply on top). */
const pathFrame = (shot: Shot, q: SceneQuery, t: number, index: number): CameraFrame => {
  const keys = shot.path!;
  const times = keys.map((k) => k.at);
  const baseFov = shot.fov ?? lensToFov(shot.lens ?? 35, q.aspect);
  const fov = splineAt(times, keys.map((k) => k.fov ?? (k.lens !== undefined ? lensToFov(k.lens, q.aspect) : baseFov)), t);
  const moved = applyMoves(shot, t, splineVec3(times, keys.map((k) => k.position), t), splineVec3(times, keys.map((k) => k.target), t), index, false);
  const L = shotLayout(shot, q);
  return { position: moved.pos, target: moved.aim, fov, roll: splineAt(times, keys.map((k) => k.roll ?? shot.roll ?? 0), t), focus: focusFor(shot, q, t, moved.pos, L), shot: index };
};

/** Camera for one shot at time t (no blending). */
export const shotFrame = (shot: Shot, q: SceneQuery, t: number, index = 0): CameraFrame => {
  if (shot.path?.length) return pathFrame(shot, q, t, index);
  const L = shotLayout(shot, q);
  const K = keyedLayout(shot, q, L, t);
  const tracking = !!shot.track || !!shot.follow;
  const center = subjectCenter(shot, q, L);

  let position: Vec3;
  let target: Vec3;
  if (L.fixed) {
    position = L.fixed.position;
    target = L.fixed.target;
    if (shot.track && !shot.target) target = smoothed(center, t + leadOf(shot.track), lagOf(shot.track, 0.35)) ?? target;
  } else {
    const horiz = Math.sqrt(Math.max(0.01, K.distance * K.distance - K.rise * K.rise));
    const offsetFromAim = add(mul(dirFromYaw(K.yaw), horiz), [0, K.rise, 0]);
    const base = shot.follow ? smoothed(center, t + leadOf(shot.follow), lagOf(shot.follow, 0.7)) ?? L.aim : L.aim;
    position = add(base, offsetFromAim);
    target = shot.track || shot.follow ? smoothed(center, t + leadOf(shot.track ?? shot.follow), lagOf(shot.track ?? shot.follow, 0.35)) ?? L.aim : L.aim;
  }

  // Screen-space composition offset: shift the aim so the subject lands off-centre.
  if (K.offset[0] !== 0 || K.offset[1] !== 0) {
    const toCam = sub(position, target);
    const dist = len(toCam);
    const right = norm(cross(mul(toCam, -1), UP));
    const halfH = Math.tan((K.fov * DEG) / 2) * dist;
    const halfW = halfH * q.aspect;
    target = add(target, add(mul(right, -K.offset[0] * halfW), [0, -K.offset[1] * halfH, 0]));
  }

  const moved = applyMoves(shot, t, position, target, index, tracking);
  position = moved.pos;
  target = moved.aim;
  // Derived cameras are kept inside the set; authored distances and keyframed choreography are used exactly.
  if (q.bounds && !L.fixed && !shot.lock && shot.distance === undefined && !shot.keys?.length) {
    position = [softClamp(position[0], q.bounds.min[0], q.bounds.max[0]), softClamp(position[1], q.bounds.min[1], q.bounds.max[1]), softClamp(position[2], q.bounds.min[2], q.bounds.max[2])];
  }

  return { position, target, fov: K.fov, roll: K.roll, focus: focusFor(shot, q, t, position, L), shot: index };
};

const focusFor = (shot: Shot, q: SceneQuery, t: number, position: Vec3, L: ShotLayout): CameraFrame["focus"] => {
  if (shot.dof === "off" || shot.focus === "none") return null;
  const spec = SPECS[shot.type].dof;
  const authored = typeof shot.dof === "object" ? shot.dof : undefined;
  if (!spec && !authored) return null;
  const bokeh = authored?.bokeh ?? spec?.bokeh ?? 3;
  const range = authored?.range ?? Math.max(0.15, (spec?.range ?? 0.6) * Math.max(0.5, L.span / 0.6));

  const auto = (): FocusTarget | undefined => {
    if (shot.type === "insert" && shot.item) return { item: shot.item, anchor: shot.itemAnchor ?? "center" };
    const speaker = q.speakerAt?.(t);
    if (speaker && shot.subjects.includes(speaker)) return { actor: speaker };
    return shot.subjects[0] ? { actor: shot.subjects[0] } : undefined;
  };
  const authoredFocus = shot.focus && shot.focus !== "auto" ? shot.focus : undefined;
  let point: Vec3 | undefined;
  if (!authoredFocus && shot.focusPull !== undefined && shot.type !== "insert" && shot.subjects.length) {
    point = pulledFocus(shot, q, t, shot.focusPull);
  } else {
    const base = authoredFocus ?? auto();
    point = base ? resolveFocus(base, q, t) : undefined;
  }
  for (const r of shot.rack ?? []) {
    if (t < r.at) break;
    const next = resolveFocus(r.to, q, t);
    if (point && next) point = lerpVec3(point, next, progress(t, r.at, r.duration ?? 0.6, "inOut"));
    else point = next ?? point;
  }
  if (!point) return null;
  return { distance: len(sub(point, position)), range, bokeh, point };
};

/**
 * Engine 2 auto focus: the last subject who spoke (the first subject before anyone does), pulled smoothly
 * from the previous one over `pull` seconds when it changes — no snapping in pauses or between lines.
 */
const pulledFocus = (shot: Shot, q: SceneQuery, t: number, pull: number): Vec3 | undefined => {
  let current = shot.subjects[0];
  let previous: string | undefined;
  let since = -Infinity;
  for (const l of q.lines ?? []) {
    if (l.start > t) break;
    if (!shot.subjects.includes(l.speaker) || l.speaker === current) continue;
    previous = current;
    current = l.speaker;
    since = l.start;
  }
  const now = resolveFocus({ actor: current }, q, t);
  if (!previous || !now || t - since >= pull) return now;
  const before = resolveFocus({ actor: previous }, q, t);
  return before ? lerpVec3(before, now, progress(t, since, pull, "smooth")) : now;
};

/** The camera at time t for a shot list (sorted by `at`), including blends between shots. */
export const cameraAt = (shots: Shot[], q: SceneQuery, t: number): CameraFrame => {
  let k = 0;
  for (let i = 0; i < shots.length; i++) if (shots[i].at <= t) k = i;
  const shot = shots[k];
  const frame = shotFrame(shot, q, t, k);
  if (k > 0 && shot.blend && t < shot.at + shot.blend) {
    const prev = shotFrame(shots[k - 1], q, t, k - 1);
    const u = progress(t, shot.at, shot.blend, "inOut");
    // Engine 2 arcs around the subject; engine 1 moves in a straight line (which can pass through it).
    const pose = shot.arcBlend ? arcBlend(prev, frame, u) : { position: lerpVec3(prev.position, frame.position, u), target: lerpVec3(prev.target, frame.target, u) };
    return {
      position: pose.position,
      target: pose.target,
      fov: lerp(prev.fov, frame.fov, u),
      roll: lerp(prev.roll, frame.roll, u),
      focus: frame.focus && prev.focus ? { ...frame.focus, distance: lerp(prev.focus.distance, frame.focus.distance, u), bokeh: lerp(prev.focus.bokeh, frame.focus.bokeh, u) } : frame.focus,
      shot: k,
    };
  }
  return frame;
};

/** Project a world point to normalized device coords (x,y in [-1,1] when on screen). */
export const project = (frame: CameraFrame, p: Vec3, aspect: number) => {
  const forward = norm(sub(frame.target, frame.position));
  const right = norm(cross(forward, UP));
  const up = cross(right, forward);
  const rel = sub(p, frame.position);
  const z = dot(rel, forward);
  const tanV = Math.tan((frame.fov * DEG) / 2);
  const X = dot(rel, right) / (z * tanV);
  const Y = dot(rel, up) / (z * tanV);
  if (!frame.roll) return { x: X / aspect, y: Y, depth: z };
  // The camera is rolled about its view axis (see CinematicCamera), so the image rotates the other way.
  const r = frame.roll * DEG;
  return { x: (X * Math.cos(r) + Y * Math.sin(r)) / aspect, y: -X * Math.sin(r) + Y * Math.cos(r), depth: z };
};
