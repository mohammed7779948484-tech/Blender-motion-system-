// "Meet Pairly" — a vertical promo on a custom launch stage. Everything specific to this video
// (stage components, holo screen drawings, overlays) lives here; the shared engine is untouched.
import { Backdrop, MeshReflectorMaterial, RoundedBox, SpotLight } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { AbsoluteFill, interpolate, random, spring, useVideoConfig } from "remotion";
import * as THREE from "three";
import { clamp01, defineVideo, FONTS, ScreenSurface, useEpisode, useEvent, type DrawFn, type PropViewProps } from "../../src/engine";
import episode from "./episode.json";
import data from "./video.data";

// ---------------------------------------------------------------- lights-on helper

/** 0..1 how "on" the stage lights are; staggered per `order` with a deterministic flicker. */
const useLightsOn = (order = 0) => {
  const lights = useEvent("lights-on");
  const { t } = useEpisode();
  if (!lights.started) return 0;
  const u = clamp01(lights.progress * 4 - order * 0.6);
  const flicker = u > 0 && u < 1 ? (random(`flicker-${order}-${Math.floor(t * 20)}`) > 0.45 ? 1 : 0.15) : 1;
  return u * flicker;
};

// ---------------------------------------------------------------- set components

// MeshReflectorMaterial renders its mirror view before the main pass updates shadow maps, so the
// reflected shadows would come from the previous frame (render-order dependent). This tiny 1×1
// pre-render refreshes the shadow maps first. (useFrame here only orders rendering; no animation.)
const ShadowPrepass: React.FC = () => {
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1), []);
  useFrame(({ gl, scene, camera }) => {
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(scene, camera);
    gl.setRenderTarget(prev);
  }, -1);
  return null;
};

const StageFloor: React.FC<PropViewProps> = () => (
  <>
  <ShadowPrepass />
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
    <circleGeometry args={[9, 48]} />
    <MeshReflectorMaterial
      color="#0b0618"
      roughness={0.55}
      metalness={0.35}
      blur={[300, 90]}
      mixBlur={1}
      mixStrength={2.4}
      resolution={512}
      mirror={0.5}
      depthScale={0.6}
      minDepthThreshold={0.4}
      maxDepthThreshold={1.3}
    />
  </mesh>
  </>
);

const Cyclorama: React.FC<PropViewProps> = () => (
  <Backdrop floor={1.6} segments={24} scale={[30, 11, 8]} position={[0, -0.02, 0]} receiveShadow>
    <meshStandardMaterial color="#140a2c" roughness={0.9} />
  </Backdrop>
);

const Podium: React.FC<PropViewProps> = () => {
  const on = useLightsOn(1);
  const label = useMemo<DrawFn>(
    () =>
      ({ ctx, w, h }) => {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 ${h * 0.62}px ${FONTS.display}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("PAIRLY", w / 2, h / 2 + 4);
      },
    [],
  );
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.72, 0.8, 0.5, 10]} />
        <meshStandardMaterial color="#1b1036" roughness={0.35} metalness={0.4} flatShading />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.73, 0.022, 6, 40]} />
        <meshBasicMaterial color={[0.4 + 2.6 * on, 0.3 + 0.5 * on, 2.4 * on + 0.2]} toneMapped={false} />
      </mesh>
      <group position={[0, 0.27, 0.79]}>
        <ScreenSurface width={0.9} height={0.2} content={{ preset: "label" }} draw={label} t={0} brightness={0.4 + 1.6 * on} resolution={512} />
      </group>
    </group>
  );
};

const HoloScreen: React.FC<PropViewProps> = (props) => {
  const on = useLightsOn(2);
  const seed = String(props.params.seed ?? "s");
  const preset = String(props.params.preset ?? "logo");
  const float = Math.sin(props.t * 0.9 + random(seed) * 6) * 0.05;
  const draw = props.screens?.[preset];
  return (
    <group position={[0, float, 0]} scale={0.6 + 0.4 * on}>
      <RoundedBox args={[1.32, 0.86, 0.02]} radius={0.02} position={[0, 0, -0.012]}>
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.18 * on} toneMapped={false} />
      </RoundedBox>
      <ScreenSurface width={1.24} height={0.78} content={{ preset, ...props.params }} draw={draw} t={props.t} since={props.since.preset ?? 0} brightness={1.4 * on} />
    </group>
  );
};

const NeonBar: React.FC<PropViewProps> = (props) => {
  const color = String(props.params.color ?? "#ff3ea5");
  const on = useLightsOn(Number(props.params.order ?? 0));
  const c = new THREE.Color(color).multiplyScalar(0.15 + 3.2 * on);
  return (
    <group>
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[0.07, 3.4, 0.07]} />
        <meshBasicMaterial color={c} toneMapped={false} />
      </mesh>
      {on > 0.05 ? <pointLight position={[0, 1.6, 0.4]} color={color} intensity={2.2 * on} distance={4.5} decay={2} /> : null}
    </group>
  );
};

// ---------------------------------------------------------------- holo screen drawings

const panel = (ctx: CanvasRenderingContext2D, w: number, h: number, title: string) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(10, 30, 60, 0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = "#67e8f9";
  ctx.font = `700 34px ${FONTS.code}`;
  ctx.fillText(title, 40, 64);
};

const SCREENS: Record<string, DrawFn> = {
  checks: ({ ctx, w, h, t, since }) => {
    panel(ctx, w, h, "pairly test --watch");
    const tests = ["auth.test.ts", "cart.test.ts", "deploy.test.ts", "snacks.test.ts", "payments.test.ts"];
    const n = Math.min(tests.length, Math.floor(Math.max(0, t - since) / 0.45));
    ctx.font = `600 40px ${FONTS.code}`;
    tests.forEach((name, i) => {
      const done = i < n;
      ctx.fillStyle = done ? "#4ade80" : "rgba(255,255,255,0.35)";
      ctx.fillText(`${done ? "✓" : "○"} ${name}`, 50, 140 + i * 66);
    });
    ctx.fillStyle = "#4ade80";
    ctx.font = `800 44px ${FONTS.ui}`;
    ctx.fillText(`${n} passed`, 50, h - 50);
  },
  bugs: ({ ctx, w, h, t, since }) => {
    panel(ctx, w, h, "open bugs");
    const left = Math.max(0, 12 - Math.floor(Math.max(0, t - since) * 6));
    ctx.textAlign = "center";
    ctx.fillStyle = left === 0 ? "#4ade80" : "#fb7185";
    ctx.font = `900 ${h * 0.5}px ${FONTS.display}`;
    ctx.fillText(String(left), w / 2, h * 0.68);
    ctx.font = `600 36px ${FONTS.ui}`;
    ctx.fillStyle = "#e0f2fe";
    ctx.fillText(left === 0 ? "all fixed" : "fixing…", w / 2, h * 0.88);
    ctx.textAlign = "left";
  },
  logo: ({ ctx, w, h, t }) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    const shift = (Math.sin(t * 0.8) + 1) / 2;
    g.addColorStop(0, "#ff3ea5");
    g.addColorStop(0.35 + 0.3 * shift, "#a78bfa");
    g.addColorStop(1, "#22d3ee");
    ctx.fillStyle = g;
    ctx.textAlign = "center";
    ctx.font = `900 ${h * 0.42}px ${FONTS.display}`;
    ctx.fillText("PAIRLY", w / 2, h * 0.56);
    ctx.font = `600 ${h * 0.09}px ${FONTS.code}`;
    ctx.fillStyle = "#e0f2fe";
    ctx.fillText("your AI pair programmer", w / 2, h * 0.78);
    ctx.textAlign = "left";
  },
  pass: ({ ctx, w, h, t, since }) => {
    panel(ctx, w, h, "CI / main");
    const pop = clamp01((t - since) / 0.25);
    ctx.textAlign = "center";
    ctx.fillStyle = "#4ade80";
    ctx.font = `900 ${h * 0.2 * (0.7 + 0.3 * pop)}px ${FONTS.display}`;
    ctx.fillText("ALL TESTS", w / 2, h * 0.5);
    ctx.fillText("PASSED ✓", w / 2, h * 0.75);
    ctx.textAlign = "left";
  },
};

// ---------------------------------------------------------------- 3D extras

const StageSpots: React.FC = () => {
  const on = useLightsOn(0);
  if (on < 0.02) return null;
  return (
    <>
      {[
        { p: [-2.6, 5, 1.5], c: "#ff6ad5" },
        { p: [3.4, 5, 1.2], c: "#67e8f9" },
      ].map(({ p, c }, i) => (
        <SpotLight key={i} position={p as [number, number, number]} target-position={[0.55, 0.8, -0.2]} color={c} angle={0.38} penumbra={0.6} distance={9} attenuation={6.5} anglePower={4} intensity={14 * on} opacity={0.35 * on} castShadow={false} />
      ))}
    </>
  );
};

// ---------------------------------------------------------------- 2D overlays

const Confetti: React.FC<{ local: number }> = ({ local }) => {
  const { width, height } = useVideoConfig();
  const colors = ["#ff3ea5", "#22d3ee", "#a78bfa", "#4ade80", "#facc15"];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 70 }, (_, i) => {
        const x0 = random(`cx${i}`) * width;
        const delay = random(`cd${i}`) * 0.8;
        const tt = Math.max(0, local - delay);
        const y = -40 + tt * (260 + random(`cv${i}`) * 260) + 60 * tt * tt;
        const x = x0 + Math.sin(tt * 3 + i) * 40;
        if (y > height + 40 || tt === 0) return null;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: 16, height: 26, background: colors[i % colors.length], rotate: `${tt * 300 + i * 40}deg`, borderRadius: 3 }} />;
      })}
    </AbsoluteFill>
  );
};

const Overlay: React.FC = () => {
  const { fps, width, height } = useVideoConfig();
  const title = useEvent("title");
  const beat = useEvent("beat");
  const end = useEvent("endcard");
  const unit = width / 1080;
  const pop = (local: number) => spring({ frame: local * fps, fps, config: { damping: 11, mass: 0.55 } });

  return (
    <>
      {title.started && title.active ? (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: height * 0.12, opacity: interpolate(title.progress, [0.8, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <div style={{ fontFamily: FONTS.code, color: "#67e8f9", fontSize: 44 * unit, letterSpacing: 12 * unit, opacity: pop(title.local) }}>MEET</div>
          <div style={{ fontFamily: FONTS.display, fontWeight: 900, fontSize: 190 * unit, color: "#fff", scale: String(0.5 + 0.5 * pop(title.local - 0.15)), textShadow: `0 0 ${40 * unit}px #ff3ea5` }}>PAIRLY</div>
        </AbsoluteFill>
      ) : null}
      {beat.started && beat.active ? (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: height * 0.1 }}>
          <div style={{ fontFamily: FONTS.display, fontWeight: 900, fontSize: 92 * unit, color: "#111", background: String(beat.data.color ?? "#4ade80"), padding: `${10 * unit}px ${34 * unit}px`, borderRadius: 24 * unit, rotate: `${(Number(beat.data.tilt ?? -3) * (1 - pop(beat.local))).toFixed(2)}deg`, scale: String(0.4 + 0.6 * pop(beat.local)), boxShadow: `0 ${10 * unit}px 0 rgba(0,0,0,0.35)` }}>
            {String(beat.data.text ?? "")}
          </div>
        </AbsoluteFill>
      ) : null}
      {end.started ? (
        <>
          <AbsoluteFill style={{ background: `rgba(5, 2, 12, ${0.55 * clamp01(end.local / 0.5)})` }} />
          <Confetti local={end.local} />
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 24 * unit }}>
            <div style={{ fontFamily: FONTS.display, fontWeight: 900, fontSize: 210 * unit, color: "#fff", scale: String(pop(end.local)), textShadow: `0 0 ${50 * unit}px #a78bfa` }}>PAIRLY</div>
            <div style={{ fontFamily: FONTS.ui, fontWeight: 700, fontSize: 58 * unit, color: "#e0f2fe", opacity: clamp01((end.local - 0.4) / 0.4) }}>Ship with confidence.</div>
            <div style={{ fontFamily: FONTS.code, fontSize: 36 * unit, color: "#67e8f9", opacity: clamp01((end.local - 0.9) / 0.4) }}>$ npx pairly init</div>
          </AbsoluteFill>
        </>
      ) : null}
    </>
  );
};

export default defineVideo({
  episode,
  ...data,
  components: { stage_floor: StageFloor, cyclorama: Cyclorama, podium: Podium, holo_screen: HoloScreen, neon_bar: NeonBar },
  screens: SCREENS,
  scene: StageSpots,
  overlay: Overlay,
});
