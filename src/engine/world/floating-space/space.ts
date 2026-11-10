// Floating-space world dimensions (pure data). Islands are sized with the item's `scale`: at scale 1
// the walkable top is a flat disc of ~1 m radius AT the item's origin and the rock hangs below it, so
// an island placed at y = 0 has its top at y = 0 whatever its size.
import type { Vec3 } from "../../core/time";

export const ISLAND_RADIUS = 1;
/** Rock depth below the top surface (tip of the island), at scale 1. */
export const ISLAND_DEPTH = 1.35;
/** The irregular top edge never comes closer than this fraction of the radius: stand inside it. */
export const ISLAND_INNER = 0.86;

export const BRIDGE_THICKNESS = 0.07;
export const BRIDGE_WIDTH = 1.0;

/** Sky dome radius around the starfield item; stars sit just inside it. Camera far plane is 80 m. */
export const SKY_RADIUS = 54;

type Pt = [number, number];

/**
 * A straight bridge between two points on the ground plane, overlapping both ends by `overlap` metres:
 * position (its centre), rotation (yaw in degrees, local +X along the span) and length.
 */
export const bridgeBetween = (from: Pt, to: Pt, y = 0) => {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const length = Math.hypot(dx, dz);
  return {
    position: [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2] as Vec3,
    rotation: Math.round((Math.atan2(-dz, dx) * 180 * 1000) / Math.PI) / 1000,
    length: Math.round(length * 1000) / 1000,
  };
};

/** Point `s` metres along the line from a to b (ground plane). */
export const along = (a: Pt, b: Pt, s: number): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return [round(a[0] + ((b[0] - a[0]) * s) / l), round(a[1] + ((b[1] - a[1]) * s) / l)];
};
