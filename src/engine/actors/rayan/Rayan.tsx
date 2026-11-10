// Rayan's low-poly geometry. Joints are plain groups whose transforms come straight from the
// evaluated channel map; no state, no useFrame. Materials are per instance (appearance is local).
import { useMemo } from "react";
import * as THREE from "three";
import type { Channels } from "../rig";
import type { ActorViewProps } from "../types";
import { rayanDef } from "./rayan.data";

type Look = {
  jacketColor: string;
  shirtColor: string;
  pantsColor: string;
  skinColor: string;
  hairColor: string;
  badgeColor: string;
  glasses: boolean;
  headphones: boolean;
};

const defaults = Object.fromEntries(
  Object.entries(rayanDef.appearance).map(([k, v]) => [k, v.default]),
) as Look;

const useMaterials = (look: Look) =>
  useMemo(() => {
    const flat = { flatShading: true };
    const std = (color: string, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({ color, roughness, ...flat, ...extra });
    return {
      skin: std(look.skinColor, 0.65, { metalness: 0.05 }),
      hair: std(look.hairColor, 0.8),
      jacket: std(look.jacketColor, 0.55, { metalness: 0.08 }),
      shirt: std(look.shirtColor, 0.8),
      pants: std(look.pantsColor, 0.75),
      shoes: std("#18181b", 0.6),
      sole: std("#f4f4f5", 0.5),
      dark: new THREE.MeshStandardMaterial({ color: "#14141f", roughness: 0.95 }),
      white: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.2 }),
      rim: new THREE.MeshStandardMaterial({ color: "#27272a", roughness: 0.3, metalness: 0.8 }),
      lens: new THREE.MeshBasicMaterial({ color: "#dff3ff", transparent: true, opacity: 0.07, depthWrite: false }),
      badge: std(look.badgeColor, 0.4, { emissive: look.badgeColor, emissiveIntensity: 2.2 }),
      headphones: std("#3f3f46", 0.4, { metalness: 0.5 }),
    };
  }, [look.skinColor, look.hairColor, look.jacketColor, look.shirtColor, look.pantsColor, look.badgeColor]);

type Mats = ReturnType<typeof useMaterials>;

const rot = (c: Channels, joint: string): [number, number, number] => [
  c[`${joint}.x`] ?? 0,
  c[`${joint}.y`] ?? 0,
  c[`${joint}.z`] ?? 0,
];

const Faceted: React.FC<{
  r: number;
  detail?: number;
  scale?: [number, number, number];
  position?: [number, number, number];
  material: THREE.Material;
}> = ({ r, detail = 2, scale, position, material }) => (
  <mesh position={position} scale={scale} material={material} castShadow receiveShadow>
    <icosahedronGeometry args={[r, detail]} />
  </mesh>
);

const Cyl: React.FC<{
  top: number;
  bottom: number;
  height: number;
  segments?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  material: THREE.Material;
}> = ({ top, bottom, height, segments = 7, position, rotation, scale, material }) => (
  <mesh position={position} rotation={rotation} scale={scale} material={material} castShadow receiveShadow>
    <cylinderGeometry args={[top, bottom, height, segments]} />
  </mesh>
);

const Arm: React.FC<{ side: 1 | -1; c: Channels; m: Mats; held?: React.ReactNode }> = ({ side, c, m, held }) => {
  const s = side === 1 ? "L" : "R";
  return (
    <group position={[side * 0.25, 0.38, 0]} rotation={rot(c, `shoulder${s}`)}>
      <Faceted r={0.085} detail={1} scale={[1, 1.1, 1]} position={[side * 0.02, -0.02, 0]} material={m.jacket} />
      <Cyl top={0.072} bottom={0.065} height={0.23} position={[side * 0.02, -0.12, 0]} material={m.jacket} />
      <group position={[side * 0.02, -0.23, 0]} rotation={rot(c, `elbow${s}`)}>
        <Faceted r={0.062} detail={1} material={m.jacket} />
        <Cyl top={0.064} bottom={0.052} height={0.21} position={[0, -0.105, 0]} material={m.jacket} />
        <group position={[0, -0.22, 0]} rotation={rot(c, `wrist${s}`)}>
          <Faceted r={0.048} detail={1} scale={[0.85, 1.15, 0.65]} position={[0, -0.025, 0]} material={m.skin} />
          <Cyl top={0.014} bottom={0.016} height={0.045} segments={5} position={[side * -0.035, -0.02, 0.025]} rotation={[0.6, 0, side * 0.5]} material={m.skin} />
          <group name={`hand${s}`} position={[0, -0.04, 0.04]}>
            {held}
          </group>
        </group>
      </group>
    </group>
  );
};

const Leg: React.FC<{ side: 1 | -1; c: Channels; m: Mats }> = ({ side, c, m }) => {
  const s = side === 1 ? "L" : "R";
  return (
    <group position={[side * 0.1, -0.05, 0]} rotation={rot(c, `hip${s}`)}>
      <Cyl top={0.082} bottom={0.068} height={0.34} position={[0, -0.17, 0]} material={m.pants} />
      <group position={[0, -0.34, 0]} rotation={[c[`knee${s}.x`], 0, 0]}>
        <Cyl top={0.066} bottom={0.052} height={0.31} position={[0, -0.155, 0]} material={m.pants} />
        <group position={[0, -0.31, 0.035]}>
          <mesh position={[0, 0.015, 0]} material={m.shoes} castShadow>
            <boxGeometry args={[0.11, 0.065, 0.19]} />
          </mesh>
          <mesh position={[0, -0.025, 0]} material={m.sole} castShadow>
            <boxGeometry args={[0.118, 0.025, 0.205]} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

const HAIR_STRANDS: [number, number, number, number, number, number, number, number, number][] = [
  [0.18, 0.22, 0.12, 1.1, 1.1, 0.6, 0.3, 0.2, -0.45],
  [-0.18, 0.22, 0.12, 1.1, 1.1, 0.6, 0.3, -0.2, 0.45],
  // Fringe: wide ends tucked into the cap, tips sweeping forward and down over the forehead.
  [0.08, 0.34, 0.16, 1.3, 0.9, 0.55, 1.95, 0.15, -0.35],
  [-0.07, 0.35, 0.16, 1.4, 0.9, 0.55, 1.95, -0.15, 0.3],
  [0.23, 0.16, 0.0, 0.8, 1.2, 0.9, 0.0, 0.0, -0.25],
  [-0.23, 0.16, 0.0, 0.8, 1.2, 0.9, 0.0, 0.0, 0.25],
];

const Eye: React.FC<{ x: number; lid: number; c: Channels; m: Mats }> = ({ x, lid, c, m }) => (
  <group position={[x, 0.015, 0]}>
    <mesh position={[c["pupil.x"], c["pupil.y"], 0.01]} material={m.dark}>
      <boxGeometry args={[0.028, 0.042, 0.02]} />
      <mesh position={[0.006, 0.01, 0.002]} material={m.white}>
        <boxGeometry args={[0.008, 0.008, 0.022]} />
      </mesh>
    </mesh>
    {/* Upper lid: a thin skin plate that grows down from the top of the eye to close it. */}
    {lid > 0.03 ? (
      <mesh position={[0, 0.021 - lid * 0.0215, 0.022]} scale={[1, lid, 1]} material={m.skin}>
        <boxGeometry args={[0.034, 0.043, 0.004]} />
      </mesh>
    ) : null}
  </group>
);

const Mouth: React.FC<{ c: Channels; m: Mats }> = ({ c, m }) => {
  const wide = c["mouth.wide"];
  const smile = c["mouth.smile"];
  const half = 0.021 * wide;
  return (
    <group position={[0, -0.075, 0.004]}>
      <mesh scale={[wide, c["mouth.open"], 1]} material={m.dark}>
        <boxGeometry args={[0.042, 0.045, 0.02]} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh
          key={side}
          position={[side * (half + 0.006), smile * 0.006, 0]}
          rotation={[0, 0, side * smile * 0.7]}
          material={m.dark}
        >
          <boxGeometry args={[0.016, 0.009, 0.02]} />
        </mesh>
      ))}
    </group>
  );
};

export const Rayan: React.FC<ActorViewProps> = ({ channels: c, appearance, held }) => {
  const look = { ...defaults, ...(appearance as Partial<Look>) };
  const m = useMaterials(look);
  return (
    <group name="rayan">
      <group position={[0, c["pelvis.y"], 0]} rotation={[c["pelvis.x"], 0, 0]}>
        <Cyl top={0.18} bottom={0.17} height={0.16} segments={8} material={m.pants} />
        <group position={[0, 0.06, 0]} rotation={rot(c, "torso")}>
          <Cyl top={0.17} bottom={0.16} height={0.44} segments={8} position={[0, 0.22, 0.02]} material={m.shirt} />
          <mesh position={[0, 0.28, 0.185]} scale={[1, 1, 0.35]} material={m.badge}>
            <octahedronGeometry args={[0.045, 0]} />
          </mesh>
          <Cyl top={0.24} bottom={0.26} height={0.45} segments={9} position={[0, 0.22, -0.01]} scale={[1.08, 1, 0.92]} material={m.jacket} />
          {[1, -1].map((side) => (
            <mesh key={side} position={[side * 0.11, 0.22, 0.17]} rotation={[0, 0, side * 0.05]} material={m.jacket} castShadow>
              <boxGeometry args={[0.08, 0.44, 0.08]} />
            </mesh>
          ))}
          <mesh position={[0, 0.44, 0]} rotation={[Math.PI / 2, 0, Math.PI * 0.82]} material={m.jacket} castShadow>
            <torusGeometry args={[0.165, 0.055, 7, 12, Math.PI * 1.35]} />
          </mesh>
          {look.headphones ? (
            <group position={[0, 0.43, 0.01]}>
              <mesh rotation={[Math.PI / 2, 0, Math.PI * 0.9]} material={m.headphones}>
                <torusGeometry args={[0.14, 0.018, 6, 12, Math.PI * 1.2]} />
              </mesh>
              {[1, -1].map((side) => (
                <mesh key={side} position={[side * 0.13, -0.02, 0.08]} rotation={[0, side * 0.4, Math.PI / 2]} material={m.headphones}>
                  <cylinderGeometry args={[0.055, 0.055, 0.04, 8]} />
                </mesh>
              ))}
            </group>
          ) : null}

          <group position={[0, 0.46, 0]}>
            <Cyl top={0.065} bottom={0.075} height={0.1} position={[0, 0.03, 0]} material={m.skin} />
            <group position={[0, 0.07, 0]} rotation={rot(c, "head")}>
              <Faceted r={0.24} scale={[1.02, 0.96, 0.95]} position={[0, 0.19, 0]} material={m.skin} />
              {[1, -1].map((side) => (
                <Faceted key={side} r={0.045} detail={1} scale={[0.5, 1, 0.8]} position={[side * 0.235, 0.18, -0.01]} material={m.skin} />
              ))}
              {[1, -1].map((side) => (
                <mesh key={side} position={[side * 0.125, 0.14, 0.205]} scale={[1.2, 0.7, 0.4]}>
                  <icosahedronGeometry args={[0.035, 1]} />
                  <meshStandardMaterial color="#e58c7c" roughness={0.7} flatShading transparent opacity={c.blush} depthWrite={false} />
                </mesh>
              ))}
              <group position={[0, 0.19, 0.215]}>
                <Eye x={0.075} lid={c.lidL} c={c} m={m} />
                <Eye x={-0.075} lid={c.lidR} c={c} m={m} />
                <mesh position={[0.075, c["browL.y"], 0.014]} rotation={[0, 0, c["browL.rz"]]} material={m.hair}>
                  <boxGeometry args={[0.065, 0.016, 0.02]} />
                </mesh>
                <mesh position={[-0.075, c["browR.y"], 0.014]} rotation={[0, 0, c["browR.rz"]]} material={m.hair}>
                  <boxGeometry args={[0.065, 0.016, 0.02]} />
                </mesh>
                {look.glasses ? (
                  <group position={[0, 0.015, 0.026]}>
                    {[1, -1].map((side) => (
                      <group key={side} position={[side * 0.082, 0, 0]}>
                        <mesh material={m.rim}>
                          <torusGeometry args={[0.072, 0.007, 8, 20]} />
                        </mesh>
                        <mesh position={[0, 0, 0.002]} material={m.lens}>
                          <circleGeometry args={[0.068, 16]} />
                        </mesh>
                      </group>
                    ))}
                    <mesh position={[0, 0.01, 0]} rotation={[0, 0, Math.PI / 2]} material={m.rim}>
                      <cylinderGeometry args={[0.006, 0.006, 0.03, 6]} />
                    </mesh>
                  </group>
                ) : null}
                <Mouth c={c} m={m} />
              </group>
              <group>
                <Faceted r={0.252} scale={[1.04, 0.95, 1.02]} position={[0, 0.25, -0.05]} material={m.hair} />
                {HAIR_STRANDS.map(([x, y, z, sx, sy, sz, rx, ry, rz], i) => (
                  <Cyl key={i} top={0.02} bottom={0.065} height={0.24} segments={5} position={[x, y, z]} scale={[sx, sy, sz]} rotation={[rx, ry, rz]} material={m.hair} />
                ))}
              </group>
              <group name="head" position={[0, 0.45, 0]}>
                {held?.head}
              </group>
            </group>
          </group>
          <Arm side={1} c={c} m={m} held={held?.handL} />
          <Arm side={-1} c={c} m={m} held={held?.handR} />
        </group>
        <Leg side={1} c={c} m={m} />
        <Leg side={-1} c={c} m={m} />
      </group>
    </group>
  );
};
