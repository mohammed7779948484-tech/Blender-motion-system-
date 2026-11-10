// In-world accents: impact bursts (shards on ballistic arcs, a dust puff, a ground ring). Every
// particle's position is a closed-form function of time since the impact — no simulation state.
import { useMemo } from "react";
import * as THREE from "three";
import type { ResolvedFx } from "../core/fx";
import { rand, type Vec3 } from "../core/time";
import { useEpisode } from "../player/EpisodePlayer";
import { useFxPoint } from "./FxOverlay";

const G = 9.8;

const Impact: React.FC<{ fx: ResolvedFx }> = ({ fx }) => {
  const { t } = useEpisode();
  const point = useFxPoint(fx);
  const size = (fx.data.size as number) ?? 1;
  const count = (fx.data.count as number) ?? 18;
  const color = String(fx.data.color ?? "#ffd9a8");
  const shards = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = rand(fx.seed, i, "a") * Math.PI * 2;
        const up = 1.5 + rand(fx.seed, i, "u") * 2.6;
        const out = 1.2 + rand(fx.seed, i, "o") * 2.2;
        return { v: [Math.cos(a) * out, up, Math.sin(a) * out] as Vec3, s: 0.035 + rand(fx.seed, i, "s") * 0.05, spin: rand(fx.seed, i, "r") * 12 };
      }),
    [fx.seed, count],
  );
  const shardMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true }), [color]);
  if (!point) return null;
  const local = t - fx.at;
  const life = fx.end - fx.at;
  const u = Math.min(1, local / life);
  return (
    <group position={point} scale={size}>
      {shards.map((sh, i) => {
        const y = sh.v[1] * local - 0.5 * G * local * local;
        if (y < -0.05) return null;
        return (
          <mesh key={i} position={[sh.v[0] * local * 0.6, y, sh.v[2] * local * 0.6]} rotation={[sh.spin * local, sh.spin * local * 0.7, 0]} scale={sh.s * (1 - u * 0.6)} material={shardMat}>
            <icosahedronGeometry args={[1, 0]} />
          </mesh>
        );
      })}
      {/* dust puff */}
      <mesh position={[0, 0.08 + u * 0.12, 0]} scale={[0.2 + u * 0.75, 0.08 + u * 0.22, 0.2 + u * 0.75]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={color} transparent opacity={0.3 * (1 - u) ** 1.5} depthWrite={false} roughness={1} flatShading />
      </mesh>
      {/* ground ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={0.3 + u * 2.2}>
        <ringGeometry args={[0.8, 1, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6 * (1 - u) ** 2} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

export const FxWorld: React.FC = () => {
  const { resolved, t } = useEpisode();
  return (
    <>
      {resolved.fx
        .filter((f) => f.type === "impact" && t >= f.at && t <= f.end)
        .map((f) => (
          <Impact key={f.seed} fx={f} />
        ))}
    </>
  );
};
