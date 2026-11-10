// What every check shares: the swept frames, each actor's body volumes per frame, the shot on screen,
// the cue most likely responsible for an actor's state at a time, and intent lookup. Built once.
import { ACTOR_DEFS } from "../actors/defs";
import { moveSegments, worldEffectors, type ActorDefinition, type ActorFrame, type ActorTrack, type Effectors } from "../actors/rig";
import { project, type CameraFrame } from "../camera/solve";
import { accepts, type Intent } from "../core/behaviour";
import type { Vec3 } from "../core/time";
import type { ResolvedActor, ResolvedEpisode } from "../core/timeline";
import { allowOf, createTrace, sourceOf, type Trace } from "../core/trace";
import { createSweep, type Sweep, type VisualFrame } from "./sweep";

export type CueKind = "move" | "turn" | "override" | "gesture" | "pose" | "look";
export type ResponsibleCue = { kind: CueKind; cue: object; source?: string; allow: Intent[]; ease?: string; /** Other cues active at the same time. */ related: string[] };

export type InspectContext = {
  r: ResolvedEpisode;
  sweep: Sweep;
  frames: VisualFrame[];
  trace: Trace;
  defs: Record<string, ActorDefinition>;
  fps: number;
  width: number;
  height: number;
  aspect: number;
  /** Shot index on screen at each frame. */
  shotOf: number[];
  actors: ResolvedActor[];
  tracks: Record<string, ActorTrack>;
  frameOf: (frame: number, id: string) => ActorFrame | undefined;
  /** World-space body volumes of an actor at a frame (undefined for anatomies without effectors). */
  body: (frame: number, id: string) => Effectors | undefined;
  /** Screen position in pixels (y down) and depth of a world point for a camera, or null behind it. */
  toScreen: (camera: CameraFrame, p: Vec3) => { x: number; y: number; depth: number; ndc: { x: number; y: number } } | null;
  /** Radius in pixels of a world-space sphere of radius `r` at `depth`. */
  pxRadius: (camera: CameraFrame, r: number, depth: number) => number;
  /** Cues of `id` whose effect window contains t, most decisive first (in `order`). */
  responsible: (id: string, t: number, order?: CueKind[]) => ResponsibleCue | undefined;
  /** Where an actor's placement came from (the last move that ended before t, else its cast entry). */
  placementSource: (id: string, t: number) => string | undefined;
  /** Intents on the actor's cast entry. */
  castAllow: (id: string) => Intent[];
  /** Whether `intent` is accepted by the episode or any of the given intent lists. */
  accepted: (intent: Intent, ...lists: (readonly Intent[] | undefined)[]) => boolean;
};

const DEFAULT_ORDER: CueKind[] = ["move", "turn", "override", "gesture", "pose", "look"];

export const createContext = (r: ResolvedEpisode, opts: { actorDefs?: Record<string, ActorDefinition>; trace?: Trace } = {}): InspectContext => {
  const trace = opts.trace ?? createTrace();
  const defs = { ...ACTOR_DEFS, ...opts.actorDefs };
  const sweep = createSweep(r, opts.actorDefs);
  const frames = Array.from({ length: sweep.frames }, (_, f) => sweep.at(f));
  const tracks = Object.fromEntries(sweep.tracks.map((t) => [t.id, t]));
  const aspect = r.width / r.height;
  const bodies = new Map<string, Effectors | undefined>();
  const frameOf = (frame: number, id: string) => frames[frame]?.actors.find((a) => a.id === id);

  const windows = (track: ActorTrack, kind: CueKind): { cue: object; from: number; to: number; ease?: string }[] => {
    switch (kind) {
      case "move":
        return moveSegments(track).map((s) => ({ cue: s.cue, from: s.start, to: s.end, ease: s.ease }));
      case "turn":
        return track.turns.map((c) => ({ cue: c, from: c.at, to: c.at + (c.duration ?? 0.4) }));
      case "override":
        return track.overrides.map((c) => ({ cue: c, from: c.at, to: c.at + (c.duration ?? Infinity) + (c.blend ?? 0.25) }));
      case "gesture":
        return track.gestures.map((c) => ({ cue: c, from: c.at, to: c.at + (track.def.gestures[c.gesture]?.duration ?? 1) / (c.speed ?? 1) }));
      case "pose":
        return track.poses.map((c) => ({ cue: c, from: c.at, to: c.at + (c.transition ?? 0.4) }));
      case "look":
        return track.looks.map((c) => ({ cue: c, from: c.at, to: c.at + (c.transition ?? 0.35) }));
    }
  };

  return {
    r,
    sweep,
    frames,
    trace,
    defs,
    fps: r.fps,
    width: r.width,
    height: r.height,
    aspect,
    shotOf: frames.map((f) => f.camera.shot),
    actors: r.actors,
    tracks,
    frameOf,
    body: (frame, id) => {
      const key = `${frame}:${id}`;
      if (!bodies.has(key)) {
        const a = frameOf(frame, id);
        const def = defs[r.actors.find((x) => x.id === id)?.actor ?? ""];
        bodies.set(key, a && def ? worldEffectors(a, def) : undefined);
      }
      return bodies.get(key);
    },
    toScreen: (camera, p) => {
      const n = project(camera, p, aspect);
      if (n.depth <= 0) return null;
      return { x: ((n.x + 1) / 2) * r.width, y: ((1 - n.y) / 2) * r.height, depth: n.depth, ndc: { x: n.x, y: n.y } };
    },
    pxRadius: (camera, radius, depth) => (radius / (depth * Math.tan((camera.fov * Math.PI) / 360))) * (r.height / 2),
    responsible: (id, t, order = DEFAULT_ORDER) => {
      const track = tracks[id];
      if (!track) return undefined;
      const active = order.flatMap((kind) => windows(track, kind).filter((w) => t >= w.from - 1e-6 && t <= w.to + 1e-6).reverse().map((w) => ({ kind, w })));
      if (!active.length) return undefined;
      const { kind, w } = active[0];
      const related = [...new Set(active.slice(1).map((a) => sourceOf(trace, a.w.cue)).filter((s): s is string => !!s && s !== sourceOf(trace, w.cue)))];
      return { kind, cue: w.cue, source: sourceOf(trace, w.cue), allow: allowOf(trace, w.cue), ease: w.ease, related };
    },
    placementSource: (id, t) => {
      const track = tracks[id];
      if (!track) return undefined;
      const last = moveSegments(track).filter((s) => s.start <= t).at(-1);
      return last ? sourceOf(trace, last.cue) : sourceOf(trace, track.start);
    },
    castAllow: (id) => allowOf(trace, tracks[id]?.start),
    accepted: (intent, ...lists) => accepts(intent, r.behaviour, ...lists.map((allow) => ({ allow }))),
  };
};

/** Distance from point p to the segment a–b. */
export const segmentDistance = (p: Vec3, a: Vec3, b: Vec3) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const u = len2 > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2)) : 0;
  return Math.hypot(ap[0] - ab[0] * u, ap[1] - ab[1] * u, ap[2] - ab[2] * u);
};

export const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Closest distance between segments p1–q1 and p2–q2. */
export const segmentSegmentDistance = (p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3) => {
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return Math.hypot(...r);
  if (a <= 1e-12) t = clamp01(f / e);
  else {
    const c = dot(d1, r);
    if (e <= 1e-12) s = clamp01(-c / a);
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) (t = 0), (s = clamp01(-c / a));
      else if (t > 1) (t = 1), (s = clamp01((b - c) / a));
    }
  }
  return Math.hypot(p1[0] + d1[0] * s - (p2[0] + d2[0] * t), p1[1] + d1[1] * s - (p2[1] + d2[1] * t), p1[2] + d1[2] * s - (p2[2] + d2[2] * t));
};
