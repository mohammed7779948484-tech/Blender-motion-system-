// The two factory render modes of a video composition (selected with --props mode):
//   probe — mounts the legacy 3D scene on a tiny canvas and posts every frame's scene graph to the
//           factory (no pixels are kept); the result becomes the Blender scene plan.
//   comp  — no 3D at all: Blender-rendered frames as the picture, with the unchanged 2D layers
//           (video overlay, fx overlay, captions) and the soundtrack on top.
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import { AbsoluteFill, Img, continueRender, delayRender, getInputProps, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { ActorView } from "../engine/actors/Actor";
import { ACTORS } from "../engine/actors";
import { Captions } from "../engine/audio/Captions";
import { Soundtrack } from "../engine/audio/Soundtrack";
import { CinematicCamera } from "../engine/camera/Camera";
import type { CameraFrame } from "../engine/camera/solve";
import type { ResolvedEpisode } from "../engine/core/timeline";
import { FxOverlay } from "../engine/fx/FxOverlay";
import { FxWorld } from "../engine/fx/FxWorld";
import { cameraWithFx } from "../engine/fx/state";
import { Lighting } from "../engine/lighting/Lighting";
import { EpisodeContext, type EpisodeState, type VideoExtras } from "../engine/player/EpisodePlayer";
import { buildTracks, evaluateScene, makeQuery } from "../engine/player/scene";
import { itemParamsAt } from "../engine/world/layout";
import { PROP_VIEWS } from "../engine/world/props";
import { SetView } from "../engine/world/SetView";
import "../engine/world/shaderGuards";
import { sampleScene, sceneExtras } from "./probe";

export type FactoryInput = { mode?: "probe" | "comp"; endpoint?: string; frames?: string; silent?: boolean; captions?: boolean };

const useEpisodeState = (resolved: ResolvedEpisode, customActors: VideoExtras["actors"]): EpisodeState & { views: typeof ACTORS } => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const views = useMemo(() => ({ ...ACTORS, ...customActors }), [customActors]);
  const tracks = useMemo(() => buildTracks(resolved, Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v.def]))), [resolved, views]);
  const query = useMemo(() => makeQuery(resolved, tracks), [resolved, tracks]);
  const scene = evaluateScene(resolved, tracks, query, t);
  const camera = cameraWithFx(resolved.fx, scene.camera, t);
  return { resolved, frame, t, actors: Object.fromEntries(scene.actors.map((a) => [a.id, a])), camera, mood: scene.mood, query, views };
};

const cameraPayload = (c: CameraFrame) => {
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...c.position), new THREE.Vector3(...c.target), new THREE.Vector3(0, 1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  if (c.roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (c.roll * Math.PI) / 180));
  return { p: c.position, q: [q.x, q.y, q.z, q.w], fov: c.fov, shot: c.shot, focus: c.focus ? { distance: c.focus.distance, range: c.focus.range, bokeh: c.focus.bokeh } : null };
};

const Probe: React.FC<{ frame: number; camera: CameraFrame; endpoint: string }> = ({ frame, camera, endpoint }) => {
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const handle = delayRender(`scene probe ${frame}`);
    const body = JSON.stringify({ ...sampleScene(scene, frame), camera: cameraPayload(camera), scene: sceneExtras(scene) });
    fetch(`${endpoint}/frame/${frame}`, { method: "POST", body, mode: "no-cors" })
      .catch(() => undefined)
      .finally(() => continueRender(handle));
    // One sample per frame; the scene object is stable for the life of the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);
  return null;
};

const HeldItem: React.FC<{ item: string; state: EpisodeState; scale: number; components?: VideoExtras["components"] }> = ({ item, state, scale, components }) => {
  const { resolved, t, mood } = state;
  const setItem = resolved.layout.items.find((i) => i.id === item);
  const kind = setItem?.kind ?? item;
  const View = components?.[kind] ?? PROP_VIEWS[kind];
  if (!View) return null;
  const { params, since } = setItem ? itemParamsAt(setItem, resolved.props, t) : { params: {}, since: {} };
  return (
    <group scale={1 / scale} name={`held:${item}`}>
      <View id={item} params={params} since={since} t={t} practicals={mood.practicals} />
    </group>
  );
};

export const ProbePlayer: React.FC<{ resolved: ResolvedEpisode } & VideoExtras> = ({ resolved, actors: customActors, components, screens, scene: Scene }) => {
  const state = useEpisodeState(resolved, customActors);
  const { width, height } = useVideoConfig();
  const input = getInputProps() as FactoryInput;
  const held = new Set<string>();
  for (const a of Object.values(state.actors)) for (const item of Object.values(a.held)) held.add(item);
  // The canvas is tiny on purpose: nothing reads its pixels, and software GL cost scales with its area.
  const k = 48 / Math.min(width, height);
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <ThreeCanvas width={Math.round(width * k)} height={Math.round(height * k)} dpr={1} gl={{ antialias: false }}>
        <EpisodeContext.Provider value={state}>
          <Lighting mood={state.mood} t={state.t} shadowRadius={resolved.layout.shadowRadius} />
          <SetView layout={resolved.layout} t={state.t} practicals={state.mood.practicals} cues={resolved.props} hidden={held} components={components} screens={screens} />
          {resolved.actors.map((ra) => {
            const a = state.actors[ra.id];
            const view = state.views[ra.actor];
            if (!view || !a) return null;
            const heldNodes = Object.fromEntries(Object.entries(a.held).map(([socket, item]) => [socket, <HeldItem key={socket} item={item} state={state} scale={a.scale} components={components} />]));
            return <ActorView key={a.id} actor={view} frame={a} appearance={ra.appearance} held={heldNodes} />;
          })}
          <CinematicCamera frame={state.camera} />
          <FxWorld />
          {Scene ? <Scene /> : null}
          <Probe frame={state.frame} camera={state.camera} endpoint={input.endpoint ?? ""} />
        </EpisodeContext.Provider>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};

export const CompPlayer: React.FC<{ resolved: ResolvedEpisode } & VideoExtras> = ({ resolved, actors: customActors, overlay: Overlay }) => {
  const state = useEpisodeState(resolved, customActors);
  const input = getInputProps() as FactoryInput;
  const src = `${input.frames}/f${String(state.frame).padStart(5, "0")}.png`;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Img src={src} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <EpisodeContext.Provider value={state}>
        {Overlay ? <Overlay /> : null}
        <FxOverlay />
      </EpisodeContext.Provider>
      {input.captions === false ? null : <Captions resolved={resolved} />}
      {input.silent === true ? null : <Soundtrack resolved={resolved} />}
    </AbsoluteFill>
  );
};
