// Public API of the shared engine. Videos import from here only.
//
// High level: defineVideo + episode.json (+ optional custom components/scene/overlay).
// Low level: every primitive below can be used directly from scene code.

// Videos & playback
export { defineVideo, resolveContext, type VideoDefinition, type VideoModule, type VideoProps, type VideoData } from "./player/defineVideo";
export { EpisodePlayer, useEpisode, useEvent, useAnchor, type VideoExtras, type EpisodeState } from "./player/EpisodePlayer";
export { buildTracks, makeQuery, evaluateScene, type SceneFrame } from "./player/scene";

// Direction data
export { EpisodeSchema, parseEpisode, type Episode, type EpisodeInput } from "./core/schema";
export { resolveEpisode, type ResolvedEpisode, type ResolvedLine, type ResolvedActor, type ResolveContext } from "./core/timeline";
export * from "./core/time";
export { FX_INFO, FxSchemas, fxEnvelope, type FxType, type ResolvedFx } from "./core/fx";
export { expandRecipe } from "./core/recipes";
export { beatSheet, pacingNotes, pacingFindings, type PacingFinding } from "./core/pacing";
export * from "./core/behaviour";

// Inspection: the frame-by-frame visual state (golden tests, inspect, remix gate), checks and explanations
export { createSweep, digestSweep, canonical, digest, type Sweep, type SweepDigest, type VisualFrame } from "./inspect/sweep";
export { inspectEpisode, CHECKS } from "./inspect/inspect";
export { createContext, type InspectContext } from "./inspect/context";
export { explainActor, explainCamera } from "./inspect/explain";
export { formatFinding, sortFindings, type Finding, type Level, type Check } from "./inspect/findings";
export { createTrace, sourceOf, allowOf, type Trace, type TraceEntry, type Contact } from "./core/trace";

// Reusable screen-space components (also used by the `fx` cues and the "window" screen preset)
export { AppWindow, type AppWindowProps } from "./ui/AppWindow";
export { KineticText, type KineticTextProps, type KineticStyle } from "./ui/KineticText";
export { drawWindow, wrapText } from "./ui/drawWindow";
export { windowState, windowTheme, type WindowParams, type WindowKind } from "./ui/window";
export { FxOverlay, useFxPoint } from "./fx/FxOverlay";
export { FxWorld } from "./fx/FxWorld";
export { activeScreenFx, cameraWithFx, chromaAt, calloutGeometry, fxPoint, FX_PLACE, SCREEN_FX } from "./fx/state";

// Actors
export { ACTORS, rayanDef, claudeDef, Rayan, Claude } from "./actors";
export { ACTOR_DEFS } from "./actors/defs";
export { ActorView } from "./actors/Actor";
export * from "./actors/rig";
export type { Actor, ActorViewProps } from "./actors/types";

// World
export { PROPS, type PropMeta } from "./world/props.data";
export { PROP_VIEWS, Mug, type PropViewProps } from "./world/props";
export { SetView } from "./world/SetView";
export { ScreenSurface, SCREEN_PRESETS, type DrawFn, type DrawContext, type ScreenContent } from "./world/Screen";
export { ENVIRONMENTS } from "./world/environments";
export { KEYS, KEY_PITCH, KEY_TOP, KEY_TRAVEL, keyTop } from "./world/micro-keyboard/keys";
export { GiantKeyboard, GiantScreen, RubberDuck, DustMotes, keyStates, keyTravel } from "./world/micro-keyboard/MicroKeyboard";
export { ISLAND_DEPTH, ISLAND_INNER, SKY_RADIUS, bridgeBetween } from "./world/floating-space/space";
export { FloatingIsland, LightBridge, Starfield, Planet, SpaceRocks } from "./world/floating-space/FloatingSpace";
export * from "./world/layout";

// Camera, lighting, post
export * from "./camera/solve";
export { CinematicCamera, PostFX } from "./camera/Camera";
export { MOODS, moodAt, mixMoods, resolveMood, pulsedKey, type Mood, type MoodCue, type MoodRef } from "./lighting/moods";
export { Lighting } from "./lighting/Lighting";

// Audio & captions
export * from "./audio/speech";
export { Captions } from "./audio/Captions";
export { captionPages, captionIndexAt, CAPTION_LAYOUT, type CaptionPage } from "./audio/captionLayout";
export { Soundtrack } from "./audio/Soundtrack";
export { FONTS } from "./fonts";
