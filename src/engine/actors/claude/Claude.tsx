// Claude-style mascot geometry: a five-lobed starburst displaced from an icosahedron.
import { useMemo } from "react";
import * as THREE from "three";
import { rand } from "../../core/time";
import type { ActorViewProps } from "../types";
import { claudeDef } from "./claude.data";

const LOBES = [
  { dir: new THREE.Vector3(0, 1, 0), amp: 0.82, sharp: 10 },
  { dir: new THREE.Vector3(-0.88, 0.47, 0).normalize(), amp: 0.85, sharp: 10 },
  { dir: new THREE.Vector3(0.88, 0.47, 0).normalize(), amp: 0.85, sharp: 10 },
  { dir: new THREE.Vector3(-0.9, -0.44, 0).normalize(), amp: 0.72, sharp: 10 },
  { dir: new THREE.Vector3(0.9, -0.44, 0).normalize(), amp: 0.72, sharp: 10 },
];

// Built once; geometry is immutable and shared by every instance.
const bodyGeometry = (() => {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let boost = 0;
    for (const lobe of LOBES) boost += lobe.amp * Math.pow(Math.max(0, v.dot(lobe.dir)), lobe.sharp);
    const flatten = v.y < -0.55 ? (v.y + 0.55) * 0.12 : 0;
    // Key jitter by direction so duplicated (non-indexed) vertices move together.
    const key = `${Math.round(v.x * 1000)}_${Math.round(v.y * 1000)}_${Math.round(v.z * 1000)}`;
    const jitter = (rand("claude-body", key) - 0.5) * 0.0045;
    // Slimmer between the rays, full depth at the face (z) so the eyes sit on the surface.
    const r = 0.7 + 0.3 * Math.abs(v.z) + boost + flatten + jitter;
    pos.setXYZ(i, v.x * 0.112 * r, v.y * 0.098 * r, v.z * 0.082 * r);
  }
  geo.computeVertexNormals();
  return geo;
})();

const footGeometry = (() => {
  const geo = new THREE.IcosahedronGeometry(0.028, 1);
  geo.scale(1.12, 0.78, 1.22);
  geo.computeVertexNormals();
  return geo;
})();

const eyeGeometry = new THREE.BoxGeometry(0.017, 0.04, 0.012);

const defaults = Object.fromEntries(Object.entries(claudeDef.appearance).map(([k, v]) => [k, v.default])) as {
  bodyColor: string;
  eyeColor: string;
};

export const Claude: React.FC<ActorViewProps> = ({ channels: c, appearance, held }) => {
  const look = { ...defaults, ...(appearance as Partial<typeof defaults>) };
  const mats = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ color: look.bodyColor, roughness: 0.68, metalness: 0.03, flatShading: true }),
      eyes: new THREE.MeshStandardMaterial({ color: look.eyeColor, roughness: 0.9, metalness: 0 }),
    }),
    [look.bodyColor, look.eyeColor],
  );
  const stretch = c.squash + c["squash.emotion"];
  const inv = 1 / Math.sqrt(stretch);

  return (
    <group name="claude">
      {(["L", "R"] as const).map((s) => (
        <mesh
          key={s}
          geometry={footGeometry}
          material={mats.body}
          position={[(s === "L" ? 1 : -1) * 0.052, c[`foot${s}.y`], c[`foot${s}.z`]]}
          castShadow
          receiveShadow
        />
      ))}
      <group position={[0, c["body.y"], c["body.z"]]} rotation={[c["body.rx"], c["body.ry"], c["body.rz"]]}>
        <group scale={[inv, stretch, inv]}>
          <mesh geometry={bodyGeometry} material={mats.body} castShadow receiveShadow />
          <group position={[0, -0.004, 0.083]}>
            {(["L", "R"] as const).map((s) => (
              <group key={s} position={[c[`eye${s}.x`], c[`eye${s}.y`], 0]} rotation={[0, 0, c[`eye${s}.rz`]]}>
                <mesh geometry={eyeGeometry} material={mats.eyes} scale={[c[`eye${s}.sx`], Math.max(0.06, c[`eye${s}.sy`]), 1]} castShadow />
              </group>
            ))}
          </group>
          <group name="top" position={[0, 0.16, 0]}>
            {held?.top}
          </group>
          <group name="left" position={[0.16, 0.0, 0.03]}>
            {held?.left}
          </group>
          <group name="right" position={[-0.16, 0.0, 0.03]}>
            {held?.right}
          </group>
        </group>
      </group>
    </group>
  );
};
