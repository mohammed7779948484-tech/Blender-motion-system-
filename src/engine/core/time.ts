// Pure time/math helpers. Everything here is a function of its inputs only, so any
// frame can be evaluated in any order (Remotion renders frames out of order, in parallel tabs).
import { Easing, random } from "remotion";
import { noise2D } from "@remotion/noise";

export type Vec3 = [number, number, number];

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
export const addVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subVec3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scaleVec3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const lengthVec3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const distVec3 = (a: Vec3, b: Vec3) => lengthVec3(subVec3(a, b));

/** Shortest-path angle interpolation (radians). */
export const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export const EASINGS = {
  linear: (x: number) => x,
  in: Easing.in(Easing.cubic),
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
  smooth: Easing.inOut(Easing.sin),
  backOut: Easing.out(Easing.back(1.6)),
  snap: Easing.out(Easing.exp),
} as const;
export type EaseName = keyof typeof EASINGS;

/** 0→1 progress of `t` through [start, start+duration], eased. Zero duration = step. */
export const progress = (
  t: number,
  start: number,
  duration: number,
  ease: EaseName = "inOut",
) => {
  if (duration <= 0) return t >= start ? 1 : 0;
  return EASINGS[ease](clamp01((t - start) / duration));
};

/** Seeded value in [0,1). Same keys → same value, on every render thread. */
export const rand = (seed: string, ...keys: (string | number)[]) =>
  random(`${seed}|${keys.join("|")}`);

/** Smooth seeded noise in [-1,1] sampled along time. */
export const noise = (seed: string, t: number, frequency = 1) =>
  noise2D(seed, t * frequency, 0.5);

/** Attack/sustain/release weight for a window [start, end]. */
export const envelope = (t: number, start: number, end: number, attack: number, release: number) => {
  if (t < start || t > end) return 0;
  const a = attack > 0 ? clamp01((t - start) / attack) : 1;
  const r = release > 0 ? clamp01((end - t) / release) : 1;
  return EASINGS.smooth(Math.min(a, r));
};
