// Pure whole-scene evaluation: resolved episode + time → actor frames, camera, mood.
// Used by the player, the validator and tests (Node-safe: no React).
import { ACTOR_DEFS } from "../actors/defs";
import { actorBase, actorFinal, type ActorBase, type ActorDefinition, type ActorFrame, type ActorTrack, type ListenSpec } from "../actors/rig";
import { sampleEnvelope, shapedTalk, slowTalk } from "../audio/speech";
import { cameraAt, type CameraFrame, type SceneQuery } from "../camera/solve";
import type { ResolvedActor, ResolvedEpisode, ResolvedLine } from "../core/timeline";
import { moodAt, type Mood } from "../lighting/moods";
import { itemAnchor, itemWorld, occluders } from "../world/layout";
import { PROPS } from "../world/props.data";

export const buildTracks = (r: ResolvedEpisode, defs: Record<string, ActorDefinition> = {}): ActorTrack[] => {
  const all = { ...ACTOR_DEFS, ...defs };
  return r.actors.map((a) => {
    const lines = r.lines.filter((l) => l.speaker === a.id);
    const listen = listenSpec(r, a, all[a.actor]);
    // Speech motion (engine 2): per-speaker loudness, attack/release on the mouth, a slow envelope for the body.
    const motion = r.behaviour.defaults.speechMotion;
    const speech = (t: number, f: (l: (typeof lines)[number], local: number) => number) => {
      let v = 0;
      for (const l of lines) if (t >= l.start - 0.05 && t <= l.end + 0.3) v = Math.max(v, f(l, t - l.start));
      return v;
    };
    return {
      id: a.id,
      def: all[a.actor],
      seed: `${r.seed}:${a.id}`,
      scale: a.scale,
      start: a.start,
      poses: a.poses,
      emotions: a.emotions,
      gestures: a.gestures,
      looks: a.looks,
      moves: a.moves,
      turns: a.turns,
      overrides: a.overrides,
      holds: a.holds,
      talk: motion
        ? (t: number) => speech(t, (l, local) => shapedTalk(l.envelope, local, l.talkScale ?? 1))
        : (t: number) => {
            let v = 0;
            for (const l of lines) if (t >= l.start && t <= l.end) v = Math.max(v, sampleEnvelope(l.envelope, t - l.start));
            return v;
          },
      ...(motion ? { talkBody: (t: number) => speech(t, (l, local) => slowTalk(l.envelope, local, l.talkScale ?? 1)) } : {}),
      ...(listen ? { listen } : {}),
    };
  });
};

/** Speech pauses that end a phrase (a word gap of ≥ 0.3 s) and the last spoken word, in absolute seconds. */
export const phraseEnds = (l: ResolvedLine): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < l.words.length; i++) if (l.words[i + 1].start - l.words[i].end >= 0.3) out.push(l.start + l.words[i].end);
  out.push(l.words.length ? l.start + l.words[l.words.length - 1].end : l.end);
  return out;
};

/** Opt-in listening (cast `listen`, else `defaults.listen`; 0 = restrained/off), timed by the actor's persona. */
const listenSpec = (r: ResolvedEpisode, a: ResolvedActor, def: ActorDefinition | undefined): ListenSpec | undefined => {
  const intensity = a.listen ?? r.behaviour.defaults.listen;
  if (!(intensity > 0)) return undefined;
  const persona = def?.persona?.listen;
  return {
    intensity,
    delay: persona?.delay ?? 0.3,
    nod: persona?.nod ?? 0.6,
    lines: r.lines.filter((l) => l.speaker !== a.id).map((l) => ({ speaker: l.speaker, start: l.start, end: l.end, pauses: phraseEnds(l) })),
    cuts: r.shots.slice(1).map((s) => s.at),
  };
};

export const makeQuery = (r: ResolvedEpisode, tracks: ActorTrack[]): SceneQuery => {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  // Cache of pure results keyed by the EXACT time (never rounded: nearby times must not share
  // an entry, or results would depend on evaluation order). Bounded; safe because actorBase is pure.
  const cache = new Map<string, Map<number, ActorBase>>();
  let size = 0;
  const base = (id: string, t: number) => {
    const track = byId.get(id);
    if (!track) return undefined;
    let perActor = cache.get(id);
    if (!perActor) cache.set(id, (perActor = new Map()));
    let b = perActor.get(t);
    if (!b) {
      if (size > 6000) {
        cache.clear();
        size = 0;
        cache.set(id, (perActor = new Map()));
      }
      b = actorBase(track, t);
      perActor.set(t, b);
      size++;
    }
    return b;
  };
  const items = new Map(r.layout.items.map((i) => [i.id, i]));
  return {
    aspect: r.width / r.height,
    anchor: (id, anchor, t) => base(id, t)?.anchors[anchor],
    facing: (id, t) => base(id, t)?.placement.yaw ?? 0,
    actorBox: (id, t) => {
      const b = base(id, t);
      const track = byId.get(id);
      if (!b || !track) return undefined;
      const feet = b.anchors.feet;
      const top = b.anchors.top;
      const half = (Math.max(track.def.size.width, track.def.size.depth) * track.scale) / 2;
      return { id, center: [feet[0], (feet[1] + top[1]) / 2, feet[2]], half: [half * 0.8, (top[1] - feet[1]) / 2, half * 0.8], yaw: b.placement.yaw };
    },
    actorIds: tracks.map((t) => t.id),
    item: (id, anchor) => (items.has(id) ? itemAnchor(r.layout, id, anchor) : undefined),
    itemYaw: (id) => (items.has(id) ? itemWorld(r.layout, id).yaw : undefined),
    itemSize: (id) => {
      const it = items.get(id);
      return it ? it.size ?? PROPS[it.kind]?.size : undefined;
    },
    spot: (name) => r.layout.cameras[name],
    occluders: occluders(r.layout),
    bounds: r.layout.bounds,
    speakerAt: (t) => r.lines.find((l) => t >= l.start && t <= l.end)?.speaker,
    lines: r.lines.map((l) => ({ speaker: l.speaker, start: l.start, end: l.end })).sort((a, b) => a.start - b.start),
  };
};

export type SceneFrame = { t: number; actors: ActorFrame[]; camera: CameraFrame; mood: Mood };

export const evaluateScene = (r: ResolvedEpisode, tracks: ActorTrack[], query: SceneQuery, t: number): SceneFrame => {
  const bases = tracks.map((tr) => actorBase(tr, t));
  const camera = cameraAt(r.shots, query, t);
  const anchorOf = (id: string, anchor: string) => query.anchor(id, anchor, t);
  const actors = tracks.map((tr, i) => actorFinal(tr, bases[i], t, { anchorOf, camera: camera.position }));
  return { t, actors, camera, mood: moodAt(r.moods, t, r.initialMood) };
};
