// Renders a resolved episode: set, actors, lights, camera, post, audio and captions — all
// computed from the current frame. Videos extend it with custom components, a `scene` (extra
// 3D content) and an `overlay` (extra 2D content); both can read everything via hooks.
import { ThreeCanvas } from "@remotion/three";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { AbsoluteFill, getInputProps, useCurrentFrame, useRemotionEnvironment, useVideoConfig } from "remotion";
import { ActorView } from "../actors/Actor";
import { ACTORS } from "../actors";
import type { Actor } from "../actors/types";
import type { ActorFrame } from "../actors/rig";
import { Captions } from "../audio/Captions";
import { Soundtrack } from "../audio/Soundtrack";
import { CinematicCamera, PostFX } from "../camera/Camera";
import type { CameraFrame, SceneQuery } from "../camera/solve";
import type { ResolvedEpisode } from "../core/timeline";
import type { Vec3 } from "../core/time";
import { FONTS } from "../fonts";
import { Lighting } from "../lighting/Lighting";
import type { Mood } from "../lighting/moods";
import { itemParamsAt } from "../world/layout";
import { PROP_VIEWS, type PropViewProps } from "../world/props";
import type { DrawFn } from "../world/Screen";
import { SetView } from "../world/SetView";
import "../world/shaderGuards";
import { FxOverlay } from "../fx/FxOverlay";
import { cameraWithFx, chromaAt } from "../fx/state";
import { FxWorld } from "../fx/FxWorld";
import { buildTracks, evaluateScene, makeQuery } from "./scene";

export type VideoExtras = {
  /** Custom actors (definition + view) used by this video's cast. */
  actors?: Record<string, Actor>;
  /** Components for custom set item kinds (placed via `set.add`). */
  components?: Record<string, React.FC<PropViewProps>>;
  /** Custom screen presets: `{ "preset": "<name>" }` on any monitor uses these draw functions. */
  screens?: Record<string, DrawFn>;
  /** Extra 3D content rendered inside the canvas. */
  scene?: React.FC;
  /** Extra 2D content rendered above the 3D (below captions). */
  overlay?: React.FC;
};

export type EpisodeState = {
  resolved: ResolvedEpisode;
  frame: number;
  t: number;
  actors: Record<string, ActorFrame>;
  camera: CameraFrame;
  mood: Mood;
  query: SceneQuery;
};

const EpisodeContext = createContext<EpisodeState | null>(null);

export const useEpisode = (): EpisodeState => {
  const s = useContext(EpisodeContext);
  if (!s) throw new Error("useEpisode() must be used inside <EpisodePlayer> (scene/overlay components)");
  return s;
};

/** `{active, progress 0..1, local seconds, data}` for a named timeline event. */
export const useEvent = (name: string) => {
  const { resolved, t } = useEpisode();
  const e = [...resolved.events].reverse().find((x) => x.name === name && t >= x.at);
  if (!e) return { active: false, progress: 0, local: 0, data: {} as Record<string, unknown>, started: false };
  const dur = Math.max(1e-6, e.end - e.at);
  return { active: t <= e.end, progress: Math.min(1, (t - e.at) / dur), local: t - e.at, data: e.data, started: true };
};

/** World position of "actor.anchor" (e.g. "rayan.face") at the current frame. */
export const useAnchor = (ref: string): Vec3 | undefined => {
  const { query, t } = useEpisode();
  const [id, anchor = "head"] = ref.split(".");
  return query.anchor(id, anchor, t);
};

const HeldItem: React.FC<{ item: string; resolved: ResolvedEpisode; t: number; mood: Mood; scale: number; components?: VideoExtras["components"] }> = ({ item, resolved, t, mood, scale, components }) => {
  const setItem = resolved.layout.items.find((i) => i.id === item);
  const kind = setItem?.kind ?? item;
  const View = components?.[kind] ?? PROP_VIEWS[kind];
  if (!View) return null;
  const { params, since } = setItem ? itemParamsAt(setItem, resolved.props, t) : { params: {}, since: {} };
  // Keep real-world prop size regardless of the actor's scale.
  return (
    <group scale={1 / scale}>
      <View id={item} params={params} since={since} t={t} practicals={mood.practicals} />
    </group>
  );
};

export const EpisodePlayer: React.FC<{ resolved: ResolvedEpisode; children?: ReactNode } & VideoExtras> = ({ resolved, actors: customActors, components, screens, scene: Scene, overlay: Overlay, children }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const env = useRemotionEnvironment();
  const t = frame / fps;

  const views = useMemo(() => ({ ...ACTORS, ...customActors }), [customActors]);
  const tracks = useMemo(() => buildTracks(resolved, Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v.def]))), [resolved, views]);
  const query = useMemo(() => makeQuery(resolved, tracks), [resolved, tracks]);
  const scene = evaluateScene(resolved, tracks, query, t);
  // Accents that act on the camera / post: shake offsets the one frame everything uses (camera,
  // callout projection), the glitch drives the chromatic aberration. Pure in t.
  const camera = cameraWithFx(resolved.fx, scene.camera, t);
  const chroma = chromaAt(resolved.fx, resolved.post, t);

  const held = new Set<string>();
  for (const a of scene.actors) for (const item of Object.values(a.held)) held.add(item);

  const state: EpisodeState = {
    resolved,
    frame,
    t,
    actors: Object.fromEntries(scene.actors.map((a) => [a.id, a])),
    camera,
    mood: scene.mood,
    query,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: scene.mood.background }}>
      <ThreeCanvas width={width} height={height} shadows="percentage" dpr={1} gl={{ antialias: false, preserveDrawingBuffer: true }}>
        <EpisodeContext.Provider value={state}>
          <Lighting mood={scene.mood} t={t} shadowRadius={resolved.layout.shadowRadius} />
          <SetView layout={resolved.layout} t={t} practicals={scene.mood.practicals} cues={resolved.props} hidden={held} components={components} screens={screens} />
          {scene.actors.map((a, i) => {
            const ra = resolved.actors[i];
            const view = views[ra.actor];
            if (!view) return null;
            const heldNodes = Object.fromEntries(
              Object.entries(a.held).map(([socket, item]) => [socket, <HeldItem key={socket} item={item} resolved={resolved} t={t} mood={scene.mood} scale={a.scale} components={components} />]),
            );
            return <ActorView key={a.id} actor={view} frame={a} appearance={ra.appearance} held={heldNodes} />;
          })}
          <CinematicCamera frame={camera} />
          <FxWorld />
          {Scene ? <Scene /> : null}
          {children}
          <PostFX focus={camera.focus} bloom={scene.mood.bloom} chroma={chroma} />
        </EpisodeContext.Provider>
      </ThreeCanvas>
      <EpisodeContext.Provider value={state}>
        {Overlay ? <Overlay /> : null}
        <FxOverlay />
      </EpisodeContext.Provider>
      <Captions resolved={resolved} />
      {/* `--props={"silent":true}` (used for still sequences) skips audio entirely. */}
      {getInputProps().silent === true ? null : <Soundtrack resolved={resolved} />}
      {env.isStudio && resolved.warnings.length ? (
        <AbsoluteFill style={{ pointerEvents: "none", alignItems: "flex-start", padding: 16 }}>
          <div style={{ fontFamily: FONTS.code, fontSize: 18, color: "#111", background: "#fde047", padding: "6px 10px", borderRadius: 6, maxWidth: "70%" }}>
            {resolved.warnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
