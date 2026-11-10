// Loads a video folder for Node tools (CLI, tests): episode.json, the optional pure video.data.ts
// (custom environments/actors/kinds) and the cached voice manifest, then resolves it.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ActorDefinition } from "../src/engine/actors/rig";
import type { VideoData } from "../src/engine/player/defineVideo";
import { resolveEpisode, type ResolveContext, type ResolvedEpisode } from "../src/engine/core/timeline";
import type { Trace } from "../src/engine/core/trace";
import { readManifest } from "./voice";

/** Video folders (each has an episode.json), sorted. */
export const videoSlugs = (root: string) =>
  fs
    .readdirSync(path.join(root, "videos"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, "videos", d.name, "episode.json")))
    .map((d) => d.name)
    .sort();

export const loadVideo = async (root: string, slug: string) => {
  const dir = path.join(root, "videos", slug);
  const file = path.join(dir, "episode.json");
  if (!fs.existsSync(file)) throw new Error(`videos/${slug}/episode.json not found (npm run cli -- list videos)`);
  const episode: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  let data: VideoData = {};
  const dataFile = path.join(dir, "video.data.ts");
  if (fs.existsSync(dataFile)) {
    const mod = await import(pathToFileURL(dataFile).href);
    data = (mod.default?.default ?? mod.default ?? mod.data ?? {}) as VideoData;
  }
  const ctx: ResolveContext = { environments: data.environments, actors: data.actorDefs, components: data.componentKinds ?? [], screens: data.screenKinds ?? [] };
  return { episode, data, ctx, manifest: readManifest(root, slug) };
};

/**
 * Resolve a video (throws the resolver's problem list). `actorDefs` are its custom actors, for scene evaluation;
 * pass a `trace` to record where every cue came from (inspect, explain).
 */
export const resolveVideo = async (root: string, slug: string, opts: { trace?: Trace } = {}): Promise<{ resolved: ResolvedEpisode; actorDefs: Record<string, ActorDefinition> }> => {
  const { episode, ctx, manifest } = await loadVideo(root, slug);
  return { resolved: resolveEpisode(episode, manifest, { ...ctx, trace: opts.trace }), actorDefs: ctx.actors ?? {} };
};
