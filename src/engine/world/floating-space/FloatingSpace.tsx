// Views for the floating-space world. Everything is a pure function of the props: shapes come from
// seeds (Remotion `random`), drift/bob/twinkle/pulses from t (sin or seeded noise), never from
// accumulated state. The nebula is a shader of the view direction (no textures to load).
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { noise, rand } from "../../core/time";
import { PROPS } from "../props.data";
import type { PropViewProps } from "../props";
import { BRIDGE_THICKNESS, ISLAND_DEPTH, ISLAND_INNER, SKY_RADIUS } from "./space";

const param = <T,>(kind: string, props: PropViewProps, key: string): T => (props.params[key] ?? PROPS[kind].params[key].default) as T;
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- islands

type Tri = [THREE.Vector3, THREE.Vector3, THREE.Vector3];

/** Faceted island mesh (non-indexed, one colour per face): flat moss top at y = 0, rock below. */
const islandGeometry = (seed: string, rockHex: string, topHex: string) => {
  const N = 12;
  const angle = (i: number) => ((i + (rand(seed, i, "a") - 0.5) * 0.35) / N) * TAU;
  const outline = Array.from({ length: N }, (_, i) => ISLAND_INNER + (1 - ISLAND_INNER) * rand(seed, i, "r"));
  // Rings from the top edge down to the tip: [y, radius factor, jitter].
  const rings: [number, number, number][] = [
    [0, 1, 0],
    [-0.11, 1.025, 0],
    [-0.36, 0.9, 0.12],
    [-0.7, 0.62, 0.22],
    [-1.02, 0.34, 0.3],
  ];
  const ring = rings.map(([y, k, j], r) =>
    Array.from({ length: N }, (_, i) => {
      const rad = outline[i] * k * (1 - j / 2 + j * rand(seed, i, r, "k"));
      const a = angle(i) + (r ? (rand(seed, i, r, "t") - 0.5) * 0.12 : 0);
      return new THREE.Vector3(Math.sin(a) * rad, y + (r > 1 ? (rand(seed, i, r, "y") - 0.5) * 0.12 : 0), Math.cos(a) * rad);
    }),
  );
  const tip = new THREE.Vector3((rand(seed, "tx") - 0.5) * 0.25, -ISLAND_DEPTH, (rand(seed, "tz") - 0.5) * 0.25);
  const rock = new THREE.Color(rockHex);
  const top = new THREE.Color(topHex);
  const faces: { tri: Tri; color: THREE.Color }[] = [];
  const centre = new THREE.Vector3(0, 0, 0);
  for (let i = 0; i < N; i++) {
    const n = (i + 1) % N;
    faces.push({ tri: [centre, ring[0][i], ring[0][n]], color: top.clone().multiplyScalar(0.94 + 0.1 * rand(seed, i, "top")) });
    // Moss skirt, slightly darker, then rock bands getting darker toward the tip.
    for (let r = 0; r < rings.length - 1; r++) {
      const shade = r === 0 ? top.clone().multiplyScalar(0.72) : rock.clone().multiplyScalar((1.08 - r * 0.13) * (0.85 + 0.25 * rand(seed, i, r, "c")));
      const [a, b, c, d] = [ring[r][i], ring[r][n], ring[r + 1][n], ring[r + 1][i]];
      faces.push({ tri: [a, d, b], color: shade }, { tri: [b, d, c], color: shade.clone().multiplyScalar(0.94) });
    }
    const last = ring[rings.length - 1];
    faces.push({ tri: [last[i], tip, last[n]], color: rock.clone().multiplyScalar(0.55) });
  }
  const pos = new Float32Array(faces.length * 9);
  const col = new Float32Array(faces.length * 9);
  faces.forEach(({ tri, color }, f) => {
    tri.forEach((v, k) => {
      pos.set([v.x, v.y, v.z], f * 9 + k * 3);
      col.set([color.r, color.g, color.b], f * 9 + k * 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
};

const Crystal: React.FC<{ position: THREE.Vector3Tuple; height: number; tilt: [number, number]; color: string; hang?: boolean }> = ({ position, height, tilt, color, hang }) => (
  <mesh position={position} rotation={[tilt[0] + (hang ? Math.PI : 0), 0, tilt[1]]} scale={[height * 0.32, height, height * 0.32]} castShadow>
    {/* a stretched octahedron, its lower point sunk into the rock */}
    <octahedronGeometry args={[0.5, 0]} />
    <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} roughness={0.25} flatShading />
  </mesh>
);

const PEBBLE_GEOMETRY = new THREE.DodecahedronGeometry(1, 0);

export const FloatingIsland: React.FC<PropViewProps> = (props) => {
  const seed = String(param<string>("floating_island", props, "seed"));
  const rockColor = param<string>("floating_island", props, "rock");
  const topColor = param<string>("floating_island", props, "top");
  const crystal = param<string>("floating_island", props, "crystal");
  const crystals = Math.max(0, Math.round(param<number>("floating_island", props, "crystals")));
  const bob = param<number>("floating_island", props, "bob");
  const spin = param<number>("floating_island", props, "spin");
  const geometry = useMemo(() => islandGeometry(seed, rockColor, topColor), [seed, rockColor, topColor]);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }), []);
  // Rim crystals only in the back arc (local yaw 125°–235°, away from the camera side and from where
  // bridges and standing spots usually are; rotate the island to aim it). A few hang under the rock.
  const rim = useMemo(
    () =>
      Array.from({ length: crystals }, (_, i) => {
        const a = (125 + (110 * (i + 0.2 + 0.6 * rand(seed, i, "ca"))) / crystals) * DEG;
        const r = ISLAND_INNER * (0.72 + 0.16 * rand(seed, i, "cr"));
        const h = 0.14 + 0.12 * rand(seed, i, "ch");
        return { position: [Math.sin(a) * r, h * 0.3, Math.cos(a) * r] as THREE.Vector3Tuple, height: h, tilt: [(rand(seed, i, "cx") - 0.5) * 0.5, (rand(seed, i, "cz") - 0.5) * 0.5] as [number, number] };
      }),
    [seed, crystals],
  );
  const hanging = useMemo(
    () =>
      Array.from({ length: Math.min(3, crystals) }, (_, i) => {
        // Rooted in the lowest rock band (r ≈ 0.3 at y ≈ -1.05), pointing down past the tip's sides.
        const a = TAU * (i / 3 + rand(seed, i, "ha") * 0.2);
        const r = 0.2 + 0.1 * rand(seed, i, "hr");
        const h = 0.2 + 0.14 * rand(seed, i, "hh");
        return { position: [Math.sin(a) * r, -1.08 - 0.3 * h, Math.cos(a) * r] as THREE.Vector3Tuple, height: h, tilt: [(rand(seed, i, "hx") - 0.5) * 0.4, (rand(seed, i, "hz") - 0.5) * 0.4] as [number, number] };
      }),
    [seed, crystals],
  );
  // Flat pebbles toward the rim (low enough to walk over).
  const pebbles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = TAU * rand(seed, i, "ga");
        const r = ISLAND_INNER * (0.6 + 0.32 * rand(seed, i, "gr"));
        const s = 0.025 + 0.03 * rand(seed, i, "gs");
        return { position: [Math.sin(a) * r, s * 0.15, Math.cos(a) * r] as THREE.Vector3Tuple, scale: [s * 1.3, s * 0.55, s] as THREE.Vector3Tuple, yaw: TAU * rand(seed, i, "gy") };
      }),
    [seed],
  );
  const period = 5 + 3 * rand(seed, "period");
  const y = bob ? bob * Math.sin((props.t / period) * TAU + rand(seed, "phase") * TAU) : 0;
  return (
    <group position={[0, y, 0]} rotation={[0, spin * props.t * DEG, 0]}>
      <mesh geometry={geometry} material={material} castShadow receiveShadow />
      {pebbles.map((g, i) => (
        <mesh key={i} geometry={PEBBLE_GEOMETRY} position={g.position} rotation={[0, g.yaw, 0]} scale={g.scale} castShadow receiveShadow>
          <meshStandardMaterial color={rockColor} roughness={0.9} flatShading />
        </mesh>
      ))}
      {rim.map((c, i) => (
        <Crystal key={`r${i}`} {...c} color={crystal} />
      ))}
      {hanging.map((c, i) => (
        <Crystal key={`h${i}`} {...c} color={crystal} hang />
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- light bridge

export const LightBridge: React.FC<PropViewProps> = (props) => {
  const length = param<number>("light_bridge", props, "length");
  const width = param<number>("light_bridge", props, "width");
  const color = param<string>("light_bridge", props, "color");
  const speed = param<number>("light_bridge", props, "speed");
  const glow = useMemo(() => new THREE.Color(color).multiplyScalar(2.4), [color]);
  const deck = useMemo(() => new THREE.Color(color).multiplyScalar(0.28), [color]);
  const pulses = 3;
  return (
    <group>
      <mesh position={[0, -BRIDGE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[length, BRIDGE_THICKNESS, width]} />
        <meshStandardMaterial color={deck} emissive={color} emissiveIntensity={0.35} roughness={0.3} metalness={0.2} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0.012, s * (width / 2 - 0.03)]}>
          <boxGeometry args={[length, 0.024, 0.04]} />
          <meshBasicMaterial color={glow} toneMapped={false} />
        </mesh>
      ))}
      {Array.from({ length: pulses }, (_, i) => {
        const u = (((props.t * speed + i / pulses) % 1) + 1) % 1;
        const fade = Math.sin(u * Math.PI);
        return (
          <mesh key={i} position={[(u - 0.5) * length, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.16, width - 0.1]} />
            <meshBasicMaterial color={glow} transparent opacity={0.55 * fade} depthWrite={false} toneMapped={false} />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------------------------------------------------------------- sky: nebula dome + stars

// Nebula dome as a shader of the view direction: smooth at any lens (a canvas texture shows its
// dithering when magnified), no seams or poles. Value noise is a pure function of position + seed.
const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uSky;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform vec3 uBand;
uniform vec3 uOffset;
uniform float uBrightness;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return v;
}
void main() {
  vec3 d = normalize(vDir);
  // A soft band of clouds along a tilted great circle, denser on the -Z half (behind the set).
  float band = exp(-pow(dot(d, uBand) / 0.3, 2.0));
  float back = 0.55 + 0.45 * smoothstep(0.2, -0.8, d.z);
  vec3 p = d * 2.4 + uOffset;
  float n1 = fbm(p);
  float n2 = fbm(p * 1.7 + 7.3);
  float n3 = fbm(p * 3.1 + 2.1);
  vec3 col = uSky * (0.75 + 0.5 * band);
  col += uA * smoothstep(0.38, 0.82, n1) * (0.25 + 0.75 * band) * back * 0.5;
  col += uB * smoothstep(0.45, 0.85, n2) * band * back * 0.4;
  col += uC * smoothstep(0.55, 0.9, n3) * (0.2 + 0.8 * band) * back * 0.28;
  // Dark dust lanes give the clouds structure.
  col *= 1.0 - 0.6 * smoothstep(0.5, 0.72, fbm(p * 2.3 + 4.0)) * band;
  gl_FragColor = vec4(col * uBrightness, 1.0);
  #include <colorspace_fragment>
}`;

const dotTexture = () => {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const STAR_TINTS = ["#a9c1ff", "#ffffff", "#ffffff", "#ffe2b8"].map((h) => new THREE.Color(h));
/** Star layers: share of the stars, world size at ~50 m, brightness. */
const STAR_LAYERS = [
  { share: 0.84, size: 0.17, glow: 0.9 },
  { share: 0.14, size: 0.3, glow: 1.5 },
  { share: 0.02, size: 0.55, glow: 2.6 },
];

const StarLayer: React.FC<{ seed: string; count: number; layer: number; twinkle: number; brightness: number; t: number; map: THREE.Texture }> = ({ seed, count, layer, twinkle, brightness, t, map }) => {
  const spec = STAR_LAYERS[layer];
  const stars = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const z = 2 * rand(seed, layer, i, "z") - 1;
        const phi = TAU * rand(seed, layer, i, "p");
        const r = SKY_RADIUS * (0.88 + 0.08 * rand(seed, layer, i, "r"));
        const s = Math.sqrt(1 - z * z);
        return {
          p: [Math.cos(phi) * s * r, z * r, Math.sin(phi) * s * r] as const,
          tint: STAR_TINTS[Math.floor(rand(seed, layer, i, "c") * STAR_TINTS.length) % STAR_TINTS.length],
          level: 0.45 + 0.55 * rand(seed, layer, i, "l"),
          hz: 0.25 + 1.2 * rand(seed, layer, i, "f"),
          phase: TAU * rand(seed, layer, i, "ph"),
        };
      }),
    [seed, count, layer],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(stars.flatMap((s) => s.p)), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.computeBoundingSphere();
    return g;
  }, [stars, count]);
  // Twinkle recomputed from t every frame (no accumulation), before the frame is drawn.
  useLayoutEffect(() => {
    const col = geometry.getAttribute("color") as THREE.BufferAttribute;
    stars.forEach((s, i) => {
      const k = spec.glow * brightness * s.level * (1 - twinkle * 0.5 * (1 + Math.sin(t * s.hz * TAU + s.phase)));
      col.setXYZ(i, s.tint.r * k, s.tint.g * k, s.tint.b * k);
    });
    col.needsUpdate = true;
  });
  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={-1}>
      <pointsMaterial map={map} size={spec.size} sizeAttenuation vertexColors transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} toneMapped={false} />
    </points>
  );
};

export const Starfield: React.FC<PropViewProps> = (props) => {
  const seed = String(param<string>("starfield", props, "seed"));
  const count = Math.max(0, Math.round(param<number>("starfield", props, "count")));
  const twinkle = param<number>("starfield", props, "twinkle");
  const nebula = param<string[]>("starfield", props, "nebula");
  const sky = param<string>("starfield", props, "sky");
  const brightness = param<number>("starfield", props, "brightness");
  const nebulaKey = nebula.join(",");
  const material = useMemo(() => {
    const [a, b, c] = nebulaKey.split(",");
    const tilt = (rand(seed, "tilt") - 0.5) * 0.7;
    const turn = rand(seed, "turn") * TAU;
    return new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSky: { value: new THREE.Color(sky) },
        uA: { value: new THREE.Color(a ?? sky) },
        uB: { value: new THREE.Color(b ?? a ?? sky) },
        uC: { value: new THREE.Color(c ?? a ?? sky) },
        uBand: { value: new THREE.Vector3(Math.sin(turn) * tilt, 1, Math.cos(turn) * tilt).normalize() },
        uOffset: { value: new THREE.Vector3(rand(seed, "ox") * 50, rand(seed, "oy") * 50, rand(seed, "oz") * 50) },
        uBrightness: { value: 1 },
      },
    });
  }, [seed, sky, nebulaKey]);
  material.uniforms.uBrightness.value = brightness;
  const dot = useMemo(dotTexture, []);
  return (
    <group>
      <mesh renderOrder={-2} frustumCulled={false} material={material}>
        <sphereGeometry args={[SKY_RADIUS, 64, 32]} />
      </mesh>
      {STAR_LAYERS.map((l, i) => (
        <StarLayer key={i} seed={seed} layer={i} count={Math.round(count * l.share)} twinkle={twinkle} brightness={brightness} t={props.t} map={dot} />
      ))}
    </group>
  );
};

// ---------------------------------------------------------------- planet

const planetGeometry = (radius: number, seed: string, colorHex: string, bandHex: string) => {
  const g = new THREE.IcosahedronGeometry(radius, 3);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const main = new THREE.Color(colorHex);
  const band = new THREE.Color(bandHex);
  const freq = 5 + 3 * rand(seed, "freq");
  const phase = TAU * rand(seed, "phase");
  // One colour per face (latitude bands with a seeded wobble) keeps the faceted look.
  for (let f = 0; f < pos.count; f += 3) {
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3 / radius;
    const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3 / radius;
    const u = 0.5 + 0.5 * Math.sin(y * freq + phase + 0.6 * Math.sin(x * 3 + phase));
    const c = main.clone().lerp(band, u * u).multiplyScalar(0.9 + 0.15 * rand(seed, f, "shade"));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
};

export const Planet: React.FC<PropViewProps> = (props) => {
  const radius = param<number>("planet", props, "radius");
  const color = param<string>("planet", props, "color");
  const band = param<string>("planet", props, "band");
  const ring = param<string>("planet", props, "ring");
  const tilt = param<number>("planet", props, "tilt");
  const seed = String(param<string>("planet", props, "seed"));
  const spin = param<number>("planet", props, "spin");
  const geometry = useMemo(() => planetGeometry(radius, seed, color, band), [radius, seed, color, band]);
  return (
    // Tilting the spin axis toward +Z opens the ring (and the bands) to cameras on the set's front side.
    <group rotation={[tilt * DEG, 0, 15 * DEG]}>
      <mesh geometry={geometry} rotation={[0, spin * props.t * DEG, 0]}>
        <meshStandardMaterial vertexColors flatShading roughness={0.85} emissive={band} emissiveIntensity={0.06} fog={false} />
      </mesh>
      {ring !== "none" ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[radius * 1.35, radius * 1.95, 64, 1]} />
          <meshStandardMaterial color={ring} side={THREE.DoubleSide} transparent opacity={0.55} roughness={0.8} flatShading fog={false} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  );
};

// ---------------------------------------------------------------- drifting rocks

const ROCK_GEOMETRY = new THREE.IcosahedronGeometry(1, 0);

export const SpaceRocks: React.FC<PropViewProps> = (props) => {
  const count = Math.max(0, Math.round(param<number>("space_rocks", props, "count")));
  const inner = param<number>("space_rocks", props, "inner");
  const outer = param<number>("space_rocks", props, "outer");
  const [y0, y1] = param<number[]>("space_rocks", props, "height");
  const color = param<string>("space_rocks", props, "color");
  const seed = String(param<string>("space_rocks", props, "seed"));
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }), [color]);
  const rocks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        // Yaw 45°–315°: the 90° cone toward +Z (where cameras usually are) stays clear.
        const a = Math.PI * (0.25 + 1.5 * rand(seed, i, "a"));
        const r = Math.sqrt(inner * inner + (outer * outer - inner * inner) * rand(seed, i, "r"));
        const s = 0.18 + 0.85 * rand(seed, i, "s") ** 2;
        return {
          p: [Math.sin(a) * r, y0 + (y1 - y0) * rand(seed, i, "y"), Math.cos(a) * r] as const,
          scale: [s * (0.7 + 0.6 * rand(seed, i, "sx")), s * (0.6 + 0.5 * rand(seed, i, "sy")), s * (0.7 + 0.6 * rand(seed, i, "sz"))] as THREE.Vector3Tuple,
          rot: [TAU * rand(seed, i, "rx"), TAU * rand(seed, i, "ry"), 0] as const,
          spin: [(rand(seed, i, "wx") - 0.5) * 40, (rand(seed, i, "wy") - 0.5) * 40] as const,
        };
      }),
    [count, inner, outer, y0, y1, seed],
  );
  const t = props.t;
  return (
    <group>
      {rocks.map((k, i) => (
        <mesh
          key={i}
          geometry={ROCK_GEOMETRY}
          material={material}
          position={[k.p[0] + noise(`${seed}${i}x`, t, 0.05) * 0.6, k.p[1] + noise(`${seed}${i}y`, t, 0.04) * 0.5, k.p[2] + noise(`${seed}${i}z`, t, 0.05) * 0.6]}
          rotation={[k.rot[0] + k.spin[0] * t * DEG, k.rot[1] + k.spin[1] * t * DEG, 0]}
          scale={k.scale}
        />
      ))}
    </group>
  );
};
