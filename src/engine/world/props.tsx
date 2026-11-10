// Low-poly prop views. Each receives its (time-resolved) params plus the mood's practical-light
// multipliers. Pure in props: anything animated reads `t`.
import { RoundedBox } from "@react-three/drei";
import type { ReactNode } from "react";
import { rand } from "../core/time";
import type { Mood } from "../lighting/moods";
import { PROPS } from "./props.data";
import type { PropCue } from "./layout";
import { FloatingIsland, LightBridge, Planet, SpaceRocks, Starfield } from "./floating-space/FloatingSpace";
import { DustMotes, GiantKeyboard, GiantScreen, RubberDuck } from "./micro-keyboard/MicroKeyboard";
import { SCREEN_PRESETS, ScreenSurface, type DrawFn, type ScreenContent } from "./Screen";

export type PropViewProps = {
  id: string;
  params: Record<string, unknown>;
  /** Time each param last changed (screens start animating from there). */
  since: Record<string, number>;
  t: number;
  practicals: Mood["practicals"];
  /** Optional custom screen draw functions supplied by a video, keyed by preset name. */
  screens?: Record<string, DrawFn>;
  /** This item's props cues in time order (for views whose state depends on several changes, e.g. key presses). */
  cues?: PropCue[];
};

const param = <T,>(kind: string, props: PropViewProps, key: string): T =>
  (props.params[key] ?? PROPS[kind].params[key].default) as T;

const Std: React.FC<{ color: string; rough?: number; metal?: number; emissive?: string; ei?: number }> = ({ color, rough = 0.7, metal = 0, emissive, ei }) => (
  <meshStandardMaterial color={color} roughness={rough} metalness={metal} flatShading emissive={emissive} emissiveIntensity={ei} />
);

const Desk: React.FC<PropViewProps> = (props) => {
  const color = param<string>("desk", props, "color");
  const legs = param<string>("desk", props, "legColor");
  const w = param<number>("desk", props, "width");
  return (
    <group>
      <RoundedBox args={[w, 0.05, 0.75]} radius={0.012} position={[0, 0.735, 0]} castShadow receiveShadow>
        <Std color={color} rough={0.6} />
      </RoundedBox>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.06), 0.355, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.05, 0.71, 0.66]} />
          <Std color={legs} rough={0.5} metal={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.45, 0.3]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.2, 0.3, 0.03]} />
        <Std color={legs} rough={0.5} metal={0.3} />
      </mesh>
      <RoundedBox args={[0.42, 0.5, 0.6]} radius={0.01} position={[w / 2 - 0.32, 0.45, 0]} castShadow receiveShadow>
        <Std color={color} rough={0.65} />
      </RoundedBox>
    </group>
  );
};

const OfficeChair: React.FC<PropViewProps> = (props) => {
  const color = param<string>("office_chair", props, "color");
  const accent = param<string>("office_chair", props, "accent");
  return (
    <group>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <mesh position={[0, 0.05, 0.16]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.018, 0.022, 0.32, 6]} />
            <Std color="#1c1f27" metal={0.4} rough={0.4} />
          </mesh>
          <mesh position={[0, 0.03, 0.3]} castShadow>
            <sphereGeometry args={[0.03, 6, 5]} />
            <Std color="#0f1115" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.24, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 0.36, 8]} />
        <Std color="#9ca3af" metal={0.8} rough={0.3} />
      </mesh>
      <RoundedBox args={[0.52, 0.09, 0.5]} radius={0.035} position={[0, 0.45, 0.02]} castShadow receiveShadow>
        <Std color={color} rough={0.85} />
      </RoundedBox>
      <group position={[0, 0.82, -0.25]} rotation={[-0.12, 0, 0]}>
        <RoundedBox args={[0.48, 0.56, 0.08]} radius={0.035} castShadow receiveShadow>
          <Std color={color} rough={0.85} />
        </RoundedBox>
        <mesh position={[0, 0.2, 0.045]}>
          <boxGeometry args={[0.3, 0.035, 0.01]} />
          <Std color={accent} />
        </mesh>
      </group>
      <mesh position={[0, 0.56, -0.2]} castShadow>
        <boxGeometry args={[0.05, 0.25, 0.05]} />
        <Std color="#1c1f27" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.27, 0.6, 0.02]} castShadow>
          <boxGeometry args={[0.05, 0.03, 0.3]} />
          <Std color="#1c1f27" />
        </mesh>
      ))}
    </group>
  );
};

const Monitor: React.FC<PropViewProps> = (props) => {
  const content = (props.params.screen ?? { preset: "code" }) as ScreenContent;
  const preset = SCREEN_PRESETS[content.preset];
  const brightness = props.practicals.screens * (content.preset === "off" ? 0 : 1);
  return (
    <group>
      <mesh position={[0, 0.008, -0.03]} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.016, 0.18]} />
        <Std color="#22242b" metal={0.5} rough={0.4} />
      </mesh>
      <mesh position={[0, 0.14, -0.06]} castShadow>
        <boxGeometry args={[0.05, 0.26, 0.03]} />
        <Std color="#22242b" metal={0.5} rough={0.4} />
      </mesh>
      <RoundedBox args={[0.62, 0.38, 0.03]} radius={0.01} position={[0, 0.31, -0.02]} castShadow>
        <Std color={param<string>("monitor", props, "bezel")} rough={0.4} metal={0.2} />
      </RoundedBox>
      <group position={[0, 0.31, -0.003]}>
        <ScreenSurface
          width={0.575}
          height={0.335}
          content={content}
          draw={props.screens?.[content.preset]}
          t={props.t}
          since={props.since.screen ?? 0}
          brightness={Math.max(0.05, brightness)}
        />
      </group>
      {brightness > 0.01 ? (
        <pointLight position={[0, 0.3, 0.35]} color={preset?.glow ?? "#88aaff"} intensity={0.3 * brightness} distance={1.4} decay={2} />
      ) : null}
    </group>
  );
};

const Keyboard: React.FC<PropViewProps> = (props) => (
  <group>
    <RoundedBox args={[0.44, 0.022, 0.15]} radius={0.006} position={[0, 0.011, 0]} castShadow receiveShadow>
      <Std color={param<string>("keyboard", props, "color")} rough={0.5} />
    </RoundedBox>
    {[0, 1, 2, 3].map((r) => (
      <mesh key={r} position={[0, 0.025, -0.05 + r * 0.033]}>
        <boxGeometry args={[0.4 - (r === 3 ? 0.14 : 0), 0.008, 0.025]} />
        <Std color="#3a3e4a" rough={0.6} />
      </mesh>
    ))}
  </group>
);

export const Mug: React.FC<PropViewProps> = (props) => {
  const color = param<string>("mug", props, "color");
  const steam = param<boolean>("mug", props, "steam");
  return (
    <group>
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.042, 0.038, 0.1, 10]} />
        <Std color={color} rough={0.35} />
      </mesh>
      <mesh position={[0, 0.098, 0]}>
        <cylinderGeometry args={[0.036, 0.036, 0.004, 10]} />
        <Std color="#3b2416" rough={0.2} />
      </mesh>
      <mesh position={[0.05, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.024, 0.008, 6, 10, Math.PI]} />
        <Std color={color} rough={0.35} />
      </mesh>
      {steam
        ? [0, 1, 2].map((i) => {
            const u = (props.t * 0.35 + i / 3) % 1;
            return (
              <mesh key={i} position={[Math.sin(props.t * 2 + i * 2) * 0.01, 0.12 + u * 0.12, 0]} scale={0.5 + u * 0.8}>
                <sphereGeometry args={[0.008, 6, 4]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.18 * (1 - u)} depthWrite={false} />
              </mesh>
            );
          })
        : null}
    </group>
  );
};

const DeskLamp: React.FC<PropViewProps> = (props) => {
  const color = param<string>("desk_lamp", props, "color");
  const on = param<boolean>("desk_lamp", props, "on");
  const light = param<string>("desk_lamp", props, "light");
  const k = on ? props.practicals.lamp : 0;
  return (
    <group>
      <mesh position={[0, 0.012, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.09, 0.024, 10]} />
        <Std color={color} rough={0.45} metal={0.2} />
      </mesh>
      <mesh position={[0, 0.16, -0.03]} rotation={[-0.25, 0, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.3, 6]} />
        <Std color="#2b2d33" metal={0.6} rough={0.3} />
      </mesh>
      <mesh position={[0, 0.34, 0.03]} rotation={[0.9, 0, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.2, 6]} />
        <Std color="#2b2d33" metal={0.6} rough={0.3} />
      </mesh>
      <group position={[0, 0.42, 0.12]} rotation={[1.1, 0, 0]}>
        <mesh castShadow>
          <coneGeometry args={[0.07, 0.11, 10, 1, true]} />
          <meshStandardMaterial color={color} roughness={0.45} flatShading side={2} />
        </mesh>
        <mesh position={[0, -0.03, 0]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshBasicMaterial color={on ? light : "#555"} toneMapped={false} />
        </mesh>
      </group>
      {k > 0.01 ? <pointLight position={[0, 0.3, 0.2]} color={light} intensity={0.8 * k} distance={2.0} decay={2} /> : null}
    </group>
  );
};

const Plant: React.FC<PropViewProps> = (props) => {
  const pot = param<string>("plant", props, "pot");
  const leaves = param<string>("plant", props, "leaves");
  const s = param<number>("plant", props, "scale");
  return (
    <group scale={s}>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.17, 0.12, 0.32, 8]} />
        <Std color={pot} rough={0.8} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => {
        const a = rand(props.id, "leafA", i) * Math.PI * 2;
        const tilt = 0.35 + rand(props.id, "leafT", i) * 0.6;
        const h = 0.45 + rand(props.id, "leafH", i) * 0.35;
        return (
          <group key={i} position={[0, 0.3, 0]} rotation={[0, a, tilt]}>
            <mesh position={[0, h / 2, 0]} scale={[0.12, h / 2, 0.05]} castShadow>
              <icosahedronGeometry args={[1, 0]} />
              <Std color={leaves} rough={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

const BOOK_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#e5e7eb", "#1f2937"];
const Bookshelf: React.FC<PropViewProps> = (props) => {
  const wood = param<string>("bookshelf", props, "color");
  const seed = param<string>("bookshelf", props, "seed");
  const shelves = [0.06, 0.48, 0.9, 1.32];
  return (
    <group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.485, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.03, 1.8, 0.35]} />
          <Std color={wood} />
        </mesh>
      ))}
      <mesh position={[0, 0.9, -0.165]} receiveShadow>
        <boxGeometry args={[0.97, 1.8, 0.02]} />
        <Std color={wood} rough={0.9} />
      </mesh>
      {[...shelves, 1.78].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.97, 0.025, 0.34]} />
          <Std color={wood} />
        </mesh>
      ))}
      {shelves.map((y, si) => {
        let x = -0.44;
        const books: ReactNode[] = [];
        for (let i = 0; x < 0.4 && i < 24; i++) {
          const bw = 0.03 + rand(seed, si, i, "w") * 0.04;
          const bh = 0.24 + rand(seed, si, i, "h") * 0.13;
          if (rand(seed, si, i, "gap") > 0.88) {
            x += bw * 1.6;
            continue;
          }
          books.push(
            <mesh key={i} position={[x + bw / 2, y + 0.0125 + bh / 2, 0.01]} castShadow>
              <boxGeometry args={[bw, bh, 0.24]} />
              <Std color={BOOK_COLORS[Math.floor(rand(seed, si, i, "c") * BOOK_COLORS.length)]} rough={0.8} />
            </mesh>,
          );
          x += bw + 0.004;
        }
        return <group key={si}>{books}</group>;
      })}
    </group>
  );
};

const Rug: React.FC<PropViewProps> = (props) => (
  <group>
    <mesh position={[0, 0.004, 0]} receiveShadow>
      <boxGeometry args={[2.4, 0.008, 1.8]} />
      <Std color={param<string>("rug", props, "border")} rough={1} />
    </mesh>
    <mesh position={[0, 0.009, 0]} receiveShadow>
      <boxGeometry args={[2.2, 0.004, 1.6]} />
      <Std color={param<string>("rug", props, "color")} rough={1} />
    </mesh>
  </group>
);

const skyline: DrawFn = ({ ctx, w, h }, params) => {
  const seed = String(params.seed ?? "city");
  const tint = String(params.tint ?? "#3c5bd6");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#050816");
  g.addColorStop(1, tint);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rand(seed, "star", i) * 0.6})`;
    ctx.fillRect(rand(seed, "sx", i) * w, rand(seed, "sy", i) * h * 0.45, 2, 2);
  }
  let x = 0;
  for (let i = 0; x < w; i++) {
    const bw = 40 + rand(seed, "bw", i) * 90;
    const bh = h * (0.25 + rand(seed, "bh", i) * 0.5);
    ctx.fillStyle = "#0a0f22";
    ctx.fillRect(x, h - bh, bw, bh);
    for (let wy = h - bh + 12; wy < h - 10; wy += 18) {
      for (let wx = x + 8; wx < x + bw - 10; wx += 16) {
        if (rand(seed, "lit", i, wx, wy) > 0.72) {
          ctx.fillStyle = rand(seed, "warm", i, wx) > 0.5 ? "#ffd38a" : "#9fd3ff";
          ctx.fillRect(wx, wy, 7, 9);
        }
      }
    }
    x += bw + 6;
  }
};

const Window: React.FC<PropViewProps> = (props) => {
  const frame = param<string>("window", props, "frame");
  const seed = param<string>("window", props, "seed");
  return (
    <group>
      <group position={[0, 0.6, 0.0]}>
        <ScreenSurface
          width={1.2}
          height={1.1}
          content={{ preset: "skyline", seed, tint: props.practicals.window }}
          draw={skyline}
          t={0}
          brightness={props.practicals.windowIntensity}
          resolution={768}
        />
      </group>
      {[
        [0, 0.02, 1.3, 0.04],
        [0, 1.18, 1.3, 0.04],
        [-0.63, 0.6, 0.04, 1.2],
        [0.63, 0.6, 0.04, 1.2],
        [0, 0.6, 0.03, 1.12],
        [0, 0.6, 1.22, 0.03],
      ].map(([x, y, w, h], i) => (
        <mesh key={i} position={[x, y, 0.03]} castShadow>
          <boxGeometry args={[w, h, 0.06]} />
          <Std color={frame} rough={0.5} />
        </mesh>
      ))}
    </group>
  );
};

export const PROP_VIEWS: Record<string, React.FC<PropViewProps>> = {
  desk: Desk,
  office_chair: OfficeChair,
  monitor: Monitor,
  keyboard: Keyboard,
  mug: Mug,
  desk_lamp: DeskLamp,
  plant: Plant,
  bookshelf: Bookshelf,
  rug: Rug,
  window: Window,
  giant_keyboard: GiantKeyboard,
  giant_screen: GiantScreen,
  rubber_duck: RubberDuck,
  dust_motes: DustMotes,
  floating_island: FloatingIsland,
  light_bridge: LightBridge,
  starfield: Starfield,
  planet: Planet,
  space_rocks: SpaceRocks,
};

