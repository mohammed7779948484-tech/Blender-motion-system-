// Sets are data: a shell + a list of placed items + marks/camera spots. Episodes adjust them with
// override data instead of editing shared files. All functions here are pure.
import type { Vec3 } from "../core/time";
import { PROPS } from "./props.data";

export type SetItem = {
  id: string;
  /** Prop catalog id, or the name of a custom component supplied by the video. */
  kind: string;
  position: Vec3;
  /** Yaw in degrees. */
  rotation?: number;
  scale?: number;
  params?: Record<string, unknown>;
  /** Parent item id: position becomes relative to the parent's origin (e.g. monitor on a desk). */
  on?: string;
  /** Explicit occluder box size for custom kinds the catalog doesn't know. */
  size?: Vec3;
};

export type Mark = { position: Vec3; yaw: number; description?: string };
export type CameraSpot = { position: Vec3; target: Vec3; fov: number; description?: string };
/** Oriented box (yaw only) used for camera occlusion tests. */
export type Box = { id: string; center: Vec3; half: Vec3; yaw: number };

export type Shell = {
  /** Floor colour, or "none" for places without ground (sky, space): build your own surfaces. */
  floor: string;
  wall: string;
  trim: string;
  /** Interior extents: back wall at z=back, left wall at x=left. The +X/+Z sides are open to camera. */
  back: number;
  left: number;
  height: number;
  walls: { back: boolean; left: boolean };
};

export type EnvironmentDef = {
  id: string;
  description: string;
  shell: Shell;
  items: SetItem[];
  marks: Record<string, Mark>;
  cameras: Record<string, CameraSpot>;
  /** Region the camera may occupy (auto-corrections keep derived cameras inside). */
  bounds: { min: Vec3; max: Vec3 };
  defaultMood: string;
  /** Half-size (metres) of the key light's shadow area around the origin (default 4.5; big sets need more). */
  shadowRadius?: number;
};

export type SetOverrides = {
  remove?: string[];
  move?: Record<string, { position?: Vec3; rotation?: number; scale?: number }>;
  params?: Record<string, Record<string, unknown>>;
  add?: SetItem[];
  shell?: Partial<Omit<Shell, "walls">> & { walls?: Partial<Shell["walls"]> };
  marks?: Record<string, Mark>;
  cameras?: Record<string, CameraSpot>;
};

export type Layout = Omit<EnvironmentDef, "description" | "defaultMood"> & { env: string };

/**
 * Applies episode overrides to an environment. Problems (unknown ids, parents, cycles) are pushed to
 * `problems`, or thrown together when no array is given. Items with a broken `on` are kept at their
 * own position so later steps never crash on them.
 */
export const resolveLayout = (env: EnvironmentDef, o: SetOverrides = {}, problems?: string[]): Layout => {
  const issues: string[] = [];
  const known = new Set([...env.items.map((i) => i.id), ...(o.add ?? []).map((a) => a.id)]);
  for (const id of o.remove ?? []) if (!env.items.some((i) => i.id === id)) issues.push(`set.remove: unknown item "${id}"`);
  for (const id of Object.keys(o.move ?? {})) if (!known.has(id)) issues.push(`set.move: unknown item "${id}"`);
  for (const id of Object.keys(o.params ?? {})) if (!known.has(id)) issues.push(`set.params: unknown item "${id}"`);

  // Removing an item removes everything standing on it, at any depth.
  const parentOf = new Map(env.items.map((i) => [i.id, i.on]));
  const removed = new Set(o.remove ?? []);
  const isRemoved = (id: string, seen = new Set<string>()): boolean => {
    if (removed.has(id)) return true;
    const p = parentOf.get(id);
    if (!p || seen.has(id)) return false;
    seen.add(id);
    return isRemoved(p, seen);
  };
  const items: SetItem[] = env.items
    .filter((it) => !isRemoved(it.id))
    .map((it) => ({
      ...it,
      ...(o.move?.[it.id] ?? {}),
      params: { ...(it.params ?? {}), ...(o.params?.[it.id] ?? {}) },
    }));
  for (const add of o.add ?? []) {
    if (items.some((it) => it.id === add.id)) {
      issues.push(`set.add: item "${add.id}" already exists`);
      continue;
    }
    items.push({ ...add, ...(o.move?.[add.id] ?? {}), params: { ...(add.params ?? {}), ...(o.params?.[add.id] ?? {}) } });
  }

  // Parents must exist and must not loop.
  const byId = new Map(items.map((i) => [i.id, i]));
  const broken = new Set<string>();
  for (const it of items) {
    const chain = [it.id];
    let cur: SetItem = it;
    while (cur.on) {
      const parent = byId.get(cur.on);
      if (!parent) {
        issues.push(`set item "${cur.id}": parent "${cur.on}" ${removed.has(cur.on) ? "was removed" : "does not exist"}`);
        broken.add(cur.id);
        break;
      }
      if (chain.includes(parent.id)) {
        issues.push(`set item "${it.id}": parent cycle ${[...chain, parent.id].join(" → ")}`);
        broken.add(it.id);
        break;
      }
      chain.push(parent.id);
      cur = parent;
    }
  }
  // Detach broken links so nothing downstream recurses forever or throws mid-render.
  for (const it of items) if (broken.has(it.id)) delete it.on;
  const unique = [...new Set(issues)];
  if (unique.length) {
    if (problems) problems.push(...unique);
    else throw new Error(unique.join("\n"));
  }
  return {
    env: env.id,
    id: env.id,
    shell: { ...env.shell, ...o.shell, walls: { ...env.shell.walls, ...(o.shell?.walls ?? {}) } },
    items,
    marks: { ...env.marks, ...o.marks },
    cameras: { ...env.cameras, ...o.cameras },
    bounds: env.bounds,
    ...(env.shadowRadius ? { shadowRadius: env.shadowRadius } : {}),
  };
};

const DEG = Math.PI / 180;

/** World transform of an item (resolving `on` parents). */
export const itemWorld = (layout: Layout, id: string): { position: Vec3; yaw: number; scale: number } => {
  const it = layout.items.find((i) => i.id === id);
  if (!it) throw new Error(`Unknown set item "${id}"`);
  const yaw = (it.rotation ?? 0) * DEG;
  const scale = it.scale ?? 1;
  if (!it.on) return { position: it.position, yaw, scale };
  const parent = itemWorld(layout, it.on);
  const c = Math.cos(parent.yaw);
  const s = Math.sin(parent.yaw);
  const [x, y, z] = it.position;
  return {
    position: [
      parent.position[0] + (x * c + z * s) * parent.scale,
      parent.position[1] + y * parent.scale,
      parent.position[2] + (-x * s + z * c) * parent.scale,
    ],
    yaw: parent.yaw + yaw,
    scale: parent.scale * scale,
  };
};

/** World position of a named anchor on an item (catalog anchors), e.g. a monitor's screen. */
export const itemAnchor = (layout: Layout, id: string, anchor: string): Vec3 => {
  const it = layout.items.find((i) => i.id === id);
  if (!it) throw new Error(`Unknown set item "${id}"`);
  const meta = PROPS[it.kind];
  const half = (it.size ?? meta?.size ?? [0, 0, 0])[1] / 2;
  const local = meta?.anchors[anchor] ?? [0, meta?.origin === "top" ? -half : half, 0];
  const w = itemWorld(layout, id);
  const c = Math.cos(w.yaw);
  const s = Math.sin(w.yaw);
  return [
    w.position[0] + (local[0] * c + local[2] * s) * w.scale,
    w.position[1] + local[1] * w.scale,
    w.position[2] + (-local[0] * s + local[2] * c) * w.scale,
  ];
};

/** Occluder boxes for walls and solid items, for the camera solver. */
export const occluders = (layout: Layout, hidden: Set<string> = new Set()): Box[] => {
  const boxes: Box[] = [];
  const { shell } = layout;
  const h = shell.height / 2;
  if (shell.walls.back) boxes.push({ id: "wall:back", center: [0, h, shell.back - 0.1], half: [50, h, 0.1], yaw: 0 });
  if (shell.walls.left) boxes.push({ id: "wall:left", center: [shell.left - 0.1, h, 0], half: [0.1, h, 50], yaw: 0 });
  for (const it of layout.items) {
    if (hidden.has(it.id)) continue;
    const meta = PROPS[it.kind];
    if (meta && !meta.occluder) continue;
    const size = it.size ?? meta?.size;
    if (!size) continue;
    const w = itemWorld(layout, it.id);
    const [sx, sy, sz] = size.map((v) => v * w.scale);
    // Most props stand on their origin; "top"-origin ones (floating islands) hang below it.
    const cy = meta?.origin === "top" ? w.position[1] - sy / 2 : w.position[1] + sy / 2;
    boxes.push({ id: it.id, center: [w.position[0], cy, w.position[2]], half: [sx / 2, sy / 2, sz / 2], yaw: w.yaw });
  }
  return boxes;
};

export type PropCue = { at: number; item: string; set: Record<string, unknown> };

/** An item's params at time t (step changes). `since` = when each param last changed. */
export const itemParamsAt = (item: SetItem, cues: PropCue[], t: number) => {
  const params: Record<string, unknown> = { ...(item.params ?? {}) };
  const since: Record<string, number> = {};
  for (const cue of cues) {
    if (cue.at > t) break;
    if (cue.item !== item.id) continue;
    for (const k in cue.set) {
      params[k] = cue.set[k];
      since[k] = cue.at;
    }
  }
  return { params, since };
};
