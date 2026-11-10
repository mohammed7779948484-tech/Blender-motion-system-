// Smooth keyframe interpolation shared by camera choreography and keyed joints: a cubic Hermite spline
// through every key with Catmull-Rom tangents in time (continuous speed, eased ends). Pure.
import type { Vec3 } from "./time";

/** Cubic Hermite spline through (t_i, v_i) with Catmull-Rom tangents in time; zero speed at the ends. */
export const splineAt = (times: number[], values: number[], t: number): number => {
  const n = times.length;
  if (n === 0) return NaN;
  if (n === 1 || t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let i = 0;
  while (i < n - 2 && t > times[i + 1]) i++;
  const t0 = times[i];
  const t1 = times[i + 1];
  const h = Math.max(1e-6, t1 - t0);
  const slope = (k: number) => (k <= 0 || k >= n - 1 ? 0 : (values[k + 1] - values[k - 1]) / Math.max(1e-6, times[k + 1] - times[k - 1]));
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const u = (t - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * values[i] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * values[i + 1] + (u3 - u2) * m1;
};

export const splineVec3 = (times: number[], values: Vec3[], t: number): Vec3 => [0, 1, 2].map((k) => splineAt(times, values.map((v) => v[k]), t)) as Vec3;

/**
 * Value of one keyed channel at t. `keys` carry optional values; a missing value holds the previous one.
 * `base` is the value at the shot start (the solver's own), used before the first key that sets it.
 */
export const keyedValue = <K extends { at: number }>(keys: K[], pick: (k: K) => number | undefined, base: number, shotStart: number, t: number) => {
  const times = [shotStart];
  const values = [base];
  let last = base;
  for (const k of keys) {
    const v = pick(k);
    last = v ?? last;
    if (k.at <= shotStart + 1e-6) {
      values[0] = last;
      continue;
    }
    times.push(k.at);
    values.push(last);
  }
  return splineAt(times, values, t);
};
