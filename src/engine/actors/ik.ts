// Closed-form two-bone arm reach (shoulder ball joint + elbow hinge) for joint-angle actors. Pure,
// deterministic, no iteration: used at resolve time to turn "reach that point" into channel values.
import * as THREE from "three";
import type { Vec3 } from "../core/time";

export type ArmRig = {
  /** Shoulder pivot in the parent (torso) frame. */
  shoulder: Vec3;
  /** Elbow pivot relative to the shoulder (unrotated). */
  elbow: Vec3;
  /** Hand (grip point) relative to the elbow (unrotated, wrist straight). */
  hand: Vec3;
  /** Preferred elbow direction in the torso frame (e.g. down and outward). */
  pole: Vec3;
};

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

/** Hand position in the torso frame for shoulder Euler (XYZ) + elbow hinge angle about X. */
export const armFK = (rig: ArmRig, shoulder: Vec3, elbowX: number): Vec3 => {
  const qs = new THREE.Quaternion().setFromEuler(new THREE.Euler(shoulder[0], shoulder[1], shoulder[2], "XYZ"));
  const qe = new THREE.Quaternion().setFromEuler(new THREE.Euler(elbowX, 0, 0, "XYZ"));
  const local = v(rig.elbow).add(v(rig.hand).applyQuaternion(qe));
  return v(rig.shoulder).add(local.applyQuaternion(qs)).toArray() as Vec3;
};

/**
 * Shoulder Euler + elbow hinge that put the hand on `target` (torso frame). Out-of-reach targets get a
 * straight arm pointing at them (that is also how "point at" works). The elbow bends forward (negative X).
 */
export const armIK = (rig: ArmRig, target: Vec3): { shoulder: Vec3; elbowX: number; reached: boolean } => {
  // Shoulder→hand distance as a function of the hinge angle θ (rotation about X), exactly, for bone
  // offsets that are not purely vertical: |E + Rx(θ)·H|² = a² + b² + 2(Ex·Hx + A cosθ + B sinθ).
  const [ex, ey, ez] = rig.elbow;
  const [hx, hy, hz] = rig.hand;
  const a2 = ex * ex + ey * ey + ez * ez;
  const b2 = hx * hx + hy * hy + hz * hz;
  const A = ey * hy + ez * hz;
  const B = ez * hy - ey * hz;
  const R = Math.hypot(A, B);
  const psi = Math.atan2(B, A);
  const toTarget = v(target).sub(v(rig.shoulder));
  const d = toTarget.length();
  const dist2 = (k: number) => a2 + b2 + 2 * (ex * hx + R * k); // k = cos(θ − ψ)
  const dMax = Math.sqrt(dist2(1));
  const dMin = Math.sqrt(Math.max(0, dist2(-1)));
  const reached = d <= dMax - 1e-4 && d >= dMin + 1e-4;
  const dc = Math.min(dMax - 1e-4, Math.max(dMin + 1e-4, d));
  const k = Math.min(1, Math.max(-1, (dc * dc - a2 - b2 - 2 * ex * hx) / (2 * R)));
  // Two hinge solutions; elbows bend forward (θ ≤ 0), so take the more negative one in range.
  const candidates = [psi + Math.acos(k), psi - Math.acos(k)].map((th) => Math.atan2(Math.sin(th), Math.cos(th)));
  const elbowX = candidates.filter((th) => th <= 0.05).sort((x, y) => Math.abs(x) - Math.abs(y))[0] ?? Math.min(...candidates);
  // Arm chain with that bend, in the shoulder's unrotated frame.
  const qe = new THREE.Quaternion().setFromEuler(new THREE.Euler(elbowX, 0, 0, "XYZ"));
  const handLocal = v(rig.elbow).add(v(rig.hand).applyQuaternion(qe));
  // 1) swing the chain so the hand lies on the target direction.
  const dir = toTarget.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(handLocal.clone().normalize(), dir);
  // 2) twist about that direction so the elbow points as close to the pole as possible.
  const elbowNow = v(rig.elbow).applyQuaternion(q);
  const proj = (p: THREE.Vector3) => p.clone().sub(dir.clone().multiplyScalar(p.dot(dir)));
  const e = proj(elbowNow);
  const p = proj(v(rig.pole));
  if (e.lengthSq() > 1e-10 && p.lengthSq() > 1e-10) {
    e.normalize();
    p.normalize();
    const angle = Math.atan2(new THREE.Vector3().crossVectors(e, p).dot(dir), e.dot(p));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, angle));
  }
  const euler = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return { shoulder: [euler.x, euler.y, euler.z], elbowX, reached };
};

/** A nested frame: origin + the chain of Euler (XYZ) rotations of its ancestor groups, outermost first. */
export type Frame = { position: Vec3; rotations: Vec3[] };

const frameQuat = (f: Frame) => {
  const q = new THREE.Quaternion();
  for (const r of f.rotations) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ")));
  return q;
};
/** The frame of a group nested in `parent` at `offset` (parent-local), rotated by Euler XYZ `rotation`. */
export const childFrame = (parent: Frame, offset: Vec3, rotation: Vec3): Frame => ({ position: outOfFrame(parent, offset), rotations: [...parent.rotations, rotation] });

/** Frame-local point → parent space. */
export const outOfFrame = (f: Frame, local: Vec3): Vec3 => v(local).applyQuaternion(frameQuat(f)).add(v(f.position)).toArray() as Vec3;
/** Parent-space point → frame-local. */
export const inFrame = (f: Frame, point: Vec3): Vec3 => v(point).sub(v(f.position)).applyQuaternion(frameQuat(f).invert()).toArray() as Vec3;
