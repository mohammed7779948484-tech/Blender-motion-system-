// The visual state of an episode, frame by frame: everything the rendered picture depends on that
// is derived from the direction (actors, the rendered camera, mood, prop states, screen accents,
// the caption page), evaluated in Node without rendering (~1 ms per frame). It is the single
// source for the golden tests, `inspect` and the remix gate, so they always agree on what changed.
import type { ActorDefinition, ActorFrame, ActorTrack } from "../actors/rig";
import { captionIndexAt, captionPages, type CaptionPage } from "../audio/captionLayout";
import type { CameraFrame, SceneQuery } from "../camera/solve";
import type { ResolvedEpisode } from "../core/timeline";
import { activeScreenFx, cameraWithFx, chromaAt } from "../fx/state";
import type { Mood } from "../lighting/moods";
import { buildTracks, evaluateScene, makeQuery } from "../player/scene";
import { itemParamsAt } from "../world/layout";

export type VisualFrame = {
  frame: number;
  t: number;
  actors: ActorFrame[];
  /** The rendered camera: the shot's camera plus shake accents. */
  camera: CameraFrame;
  mood: Mood;
  /** Glitch (chromatic aberration) amount, when the episode has the pass. */
  chroma?: number;
  /** Per set item: its params and when each last changed (what prop views receive). */
  props: Record<string, { params: Record<string, unknown>; since: Record<string, number> }>;
  /** Indices into `resolved.fx` of the screen accents drawn on this frame. */
  fx: number[];
  /** Index into `pages` of the caption on screen, or -1. */
  caption: number;
};

export type Sweep = {
  resolved: ResolvedEpisode;
  tracks: ActorTrack[];
  query: SceneQuery;
  pages: CaptionPage[];
  frames: number;
  at: (frame: number) => VisualFrame;
};

export const createSweep = (r: ResolvedEpisode, actorDefs: Record<string, ActorDefinition> = {}): Sweep => {
  const tracks = buildTracks(r, actorDefs);
  const query = makeQuery(r, tracks);
  const pages = r.captions.style === "none" ? [] : captionPages(r);
  const at = (frame: number): VisualFrame => {
    const t = frame / r.fps;
    const scene = evaluateScene(r, tracks, query, t);
    return {
      frame,
      t,
      actors: scene.actors,
      camera: cameraWithFx(r.fx, scene.camera, t),
      mood: scene.mood,
      chroma: chromaAt(r.fx, r.post, t),
      props: Object.fromEntries(r.layout.items.map((it) => [it.id, itemParamsAt(it, r.props, t)])),
      fx: activeScreenFx(r.fx, t).map((f) => r.fx.indexOf(f)),
      caption: captionIndexAt(pages, t * 1000),
    };
  };
  return { resolved: r, tracks, query, pages, frames: r.durationInFrames, at };
};

const round6 = (x: number) => {
  const v = Math.round(x * 1e6) / 1e6;
  return v === 0 ? 0 : v; // no "-0"
};

/** Canonical text of a value: numbers rounded to 1e-6, so harmless float reordering is not a change. */
export const canonical = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" ? round6(x) : x));

const fnv = (s: string, basis: number) => {
  let h = basis;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

/** 64-bit text digest (two FNV-1a passes with different bases), identical in Node and the browser. */
export const digest = (s: string) => fnv(s, 0x811c9dc5) + fnv(s, 0x050c5d1f);

export type SweepDigest = { frames: number; total: string; /** One digest per second of footage (locates a change). */ seconds: string[] };

/** Digest of the whole visual state, per second and in total. */
export const digestSweep = (s: Sweep): SweepDigest => {
  const per = Math.max(1, Math.round(s.resolved.fps));
  const seconds: string[] = [];
  let chunk = "";
  for (let f = 0; f < s.frames; f++) {
    chunk += canonical(s.at(f));
    if ((f + 1) % per === 0 || f === s.frames - 1) {
      seconds.push(digest(chunk));
      chunk = "";
    }
  }
  return { frames: s.frames, total: digest(seconds.join("")), seconds };
};
