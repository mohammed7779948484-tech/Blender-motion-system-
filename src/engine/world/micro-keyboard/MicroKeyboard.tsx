// Views for the micro-keyboard world. Everything is a pure function of the props (t, params, cue
// history): key presses animate from the cue that changed them, dust drifts with seeded noise.
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp01, EASINGS, noise, rand } from "../../core/time";
import { FONTS } from "../../fonts";
import { PROPS } from "../props.data";
import type { PropViewProps } from "../props";
import { ScreenSurface, SCREEN_PRESETS, type ScreenContent } from "../Screen";
import { KEY_BASE, KEY_GAP, KEY_PITCH, KEY_TOP, KEY_TRAVEL, KEYBOARD_SIZE, KEYS } from "./keys";

const param = <T,>(kind: string, props: PropViewProps, key: string): T => (props.params[key] ?? PROPS[kind].params[key].default) as T;

/** Per-key pressed state at t: the last cue (or initial param) that set it, and when. */
export const keyStates = (initial: Record<string, unknown>, cues: PropViewProps["cues"], t: number) => {
  const state = new Map<string, { down: boolean; since: number }>();
  for (const [id, v] of Object.entries(initial)) state.set(id, { down: v === true, since: -Infinity });
  for (const c of cues ?? []) {
    if (c.at > t) break;
    const keys = c.set.keys;
    if (!keys || typeof keys !== "object") continue;
    for (const [id, v] of Object.entries(keys as Record<string, unknown>)) state.set(id, { down: v === true, since: c.at });
  }
  return state;
};

/** Metres a key is pushed down at t (fast press, slightly slower spring back). */
export const keyTravel = (s: { down: boolean; since: number } | undefined, t: number) => {
  if (!s) return 0;
  const u = s.since === -Infinity ? 1 : clamp01((t - s.since) / (s.down ? 0.07 : 0.14));
  return KEY_TRAVEL * (s.down ? EASINGS.out(u) : 1 - EASINGS.out(u));
};

const legendTexture = (label: string, w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = Math.round((256 * h) / w);
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const big = label.length <= 2;
  ctx.font = `700 ${big ? Math.min(c.height * 0.5, 120) : Math.min(c.height * 0.3, 64)}px ${FONTS.ui}`;
  if (big) ctx.fillText(label, c.width * 0.5, c.height * 0.48);
  else {
    ctx.textAlign = "left";
    ctx.fillText(label, c.width * 0.1, c.height * 0.78);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

export const GiantKeyboard: React.FC<PropViewProps> = (props) => {
  const color = param<string>("giant_keyboard", props, "color");
  const legend = param<string>("giant_keyboard", props, "legend");
  const glow = param<string>("giant_keyboard", props, "glow");
  const backlight = param<number>("giant_keyboard", props, "backlight");
  const highlight = new Set(param<string[]>("giant_keyboard", props, "highlight"));
  const initial = (props.params.keys ?? {}) as Record<string, unknown>;
  const states = keyStates(initial, props.cues, props.t);

  // Shared geometries per key width; legends drawn synchronously once (deterministic).
  const geo = useMemo(() => {
    const byWidth = new Map<number, THREE.BufferGeometry>();
    for (const k of KEYS) if (!byWidth.has(k.w)) byWidth.set(k.w, new RoundedBoxGeometry(k.w * KEY_PITCH - KEY_GAP, KEY_TOP - KEY_BASE, KEY_PITCH - KEY_GAP, 3, 0.07));
    return byWidth;
  }, []);
  const legends = useMemo(() => new Map(KEYS.filter((k) => k.label).map((k) => [k.id, legendTexture(k.label, k.w * KEY_PITCH - KEY_GAP - 0.14, KEY_PITCH - KEY_GAP - 0.14)])), []);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 }), [color]);
  const glowColor = useMemo(() => new THREE.Color(glow), [glow]);
  const h = KEY_TOP - KEY_BASE;

  return (
    <group>
      {/* recessed well + backlight glowing through the gaps */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[KEYBOARD_SIZE[0] + 0.5, KEYBOARD_SIZE[2] + 0.5]} />
        <meshStandardMaterial color="#0a0a0d" roughness={0.9} />
      </mesh>
      {backlight > 0 ? (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[KEYBOARD_SIZE[0], KEYBOARD_SIZE[2]]} />
          <meshBasicMaterial color={glowColor.clone().multiplyScalar(0.25 + 1.6 * backlight)} toneMapped={false} />
        </mesh>
      ) : null}
      {KEYS.map((k) => {
        const down = keyTravel(states.get(k.id), props.t);
        const lit = highlight.has(k.id);
        const tex = legends.get(k.id);
        return (
          <group key={k.id} position={[k.x, KEY_BASE + h / 2 - down, k.z]}>
            <mesh geometry={geo.get(k.w)} material={lit ? undefined : capMat} castShadow receiveShadow>
              {lit ? <meshStandardMaterial color={color} roughness={0.5} emissive={glow} emissiveIntensity={0.9} /> : null}
            </mesh>
            {tex ? (
              <mesh position={[0, h / 2 + 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[k.w * KEY_PITCH - KEY_GAP - 0.14, KEY_PITCH - KEY_GAP - 0.14]} />
                <meshStandardMaterial map={tex} transparent color={legend} emissive={glow} emissiveMap={tex} emissiveIntensity={0.35 + backlight * 0.9 + (lit ? 1.2 : 0)} roughness={0.6} />
              </mesh>
            ) : null}
          </group>
        );
      })}
      {/* trackpad in front of the keys */}
      <mesh position={[0, 0.006, KEYBOARD_SIZE[2] / 2 + 3.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[6.4, 4.2]} />
        <meshStandardMaterial color="#6f747c" roughness={0.35} metalness={0.4} />
      </mesh>
    </group>
  );
};

export const GiantScreen: React.FC<PropViewProps> = (props) => {
  const content = (props.params.screen ?? { preset: "code" }) as ScreenContent;
  const tilt = (param<number>("giant_screen", props, "tilt") * Math.PI) / 180;
  const brightness = props.practicals.screens * (content.preset === "off" ? 0 : 1);
  const glow = SCREEN_PRESETS[content.preset]?.glow ?? "#88aaff";
  return (
    <group>
      <group rotation={[-tilt, 0, 0]}>
        <mesh position={[0, 4.9, -0.12]} castShadow receiveShadow>
          <boxGeometry args={[15.6, 9.8, 0.22]} />
          <meshStandardMaterial color={param<string>("giant_screen", props, "bezel")} roughness={0.45} metalness={0.3} />
        </mesh>
        <group position={[0, 5.05, 0.002]}>
          <ScreenSurface width={14.6} height={8.95} content={content} draw={props.screens?.[content.preset]} t={props.t} since={props.since.screen ?? 0} brightness={Math.max(0.04, brightness)} resolution={2048} />
        </group>
      </group>
      {/* the screen lights the keyboard and the characters from behind */}
      <pointLight position={[0, 4.5, 2.6]} color={glow} intensity={14 * Math.max(0.02, brightness)} distance={18} decay={1.6} />
    </group>
  );
};

export const RubberDuck: React.FC<PropViewProps> = (props) => {
  const color = param<string>("rubber_duck", props, "color");
  return (
    <group>
      <mesh position={[0, 0.13, 0]} scale={[1, 0.78, 1.25]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.16, 1]} />
        <meshStandardMaterial color={color} roughness={0.45} flatShading />
      </mesh>
      <mesh position={[0, 0.285, 0.07]} castShadow>
        <icosahedronGeometry args={[0.1, 1]} />
        <meshStandardMaterial color={color} roughness={0.45} flatShading />
      </mesh>
      <mesh position={[0, 0.27, 0.17]} rotation={[Math.PI / 2, 0, 0]} scale={[1.3, 1, 0.55]} castShadow>
        <coneGeometry args={[0.045, 0.08, 6]} />
        <meshStandardMaterial color="#ff7a1a" roughness={0.5} flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.05, 0.31, 0.15]}>
          <sphereGeometry args={[0.016, 8, 6]} />
          <meshStandardMaterial color="#111111" roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.2, -0.2]} rotation={[0.8, 0, 0]} castShadow>
        <coneGeometry args={[0.05, 0.1, 5]} />
        <meshStandardMaterial color={color} roughness={0.45} flatShading />
      </mesh>
    </group>
  );
};

export const DustMotes: React.FC<PropViewProps> = (props) => {
  const count = Math.round(param<number>("dust_motes", props, "count"));
  const [w, hgt, d] = param<number[]>("dust_motes", props, "area");
  const seed = String(param<string>("dust_motes", props, "seed"));
  const color = param<string>("dust_motes", props, "color");
  const base = useMemo(() => Array.from({ length: count }, (_, i) => [(rand(seed, i, "x") - 0.5) * w, rand(seed, i, "y") * hgt, (rand(seed, i, "z") - 0.5) * d] as const), [count, w, hgt, d, seed]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    return g;
  }, [count]);
  // Positions are recomputed from t every frame (no accumulation), before the frame is drawn.
  useLayoutEffect(() => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    base.forEach(([x, y, z], i) => {
      pos.setXYZ(i, x + noise(`${seed}${i}x`, props.t, 0.06) * 0.7, y + noise(`${seed}${i}y`, props.t, 0.05) * 0.35, z + noise(`${seed}${i}z`, props.t, 0.06) * 0.7);
    });
    pos.needsUpdate = true;
    geometry.computeBoundingSphere();
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial color={color} size={0.035} sizeAttenuation transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </points>
  );
};
