// Episode JSON → resolved, absolute-time, serializable direction data. Pure: the same function
// runs in calculateMetadata (browser), the CLI validator and tests (Node).
import { checkActorDef } from "../actors/check";
import { ACTOR_DEFS } from "../actors/defs";
import type { ActorDefinition, HoldCue, LookTarget, MoveCue, OverrideCue, TurnCue } from "../actors/rig";
import { autoTrim, lineGain, median, trimmedProtected } from "../audio/analysis";
import { estimateWords, envelopeFromWords, lineHash, SFX_LIBRARY, splitWords, takeKey, voiceStaleReason, type Envelope, type VoiceManifest, type Word } from "../audio/speech";
import type { FocusTarget, MoveSpec, Shot } from "../camera/solve";
import { MOODS, type MoodCue, type MoodRef } from "../lighting/moods";
import { ENVIRONMENTS } from "../world/environments";
import { itemAnchor, resolveLayout, type EnvironmentDef, type Layout, type PropCue, type SetOverrides } from "../world/layout";
import { COMMON_ITEM_PARAMS, PROPS } from "../world/props.data";
import { CODE_LANGS, COMMON_SCREEN_PARAMS, SCREEN_META } from "../world/screens.data";
import { SFX_INFO } from "../audio/sfx.data";
import { resolveBehaviour, type Behaviour, type Defaults, type Intent } from "./behaviour";
import { FX_INFO, type ResolvedFx } from "./fx";
import type { Trace } from "./trace";
import { baseAt, expandRecipe, type SubAction } from "./recipes";
import { parseEpisode, TIME_REF_RE, type Episode, type EpisodeAction, type EpisodeShot } from "./schema";
import type { Vec3 } from "./time";

export type ResolvedLine = {
  id: string;
  speaker: string;
  text: string;
  start: number;
  end: number;
  /** Public-relative audio path, absent when the voice hasn't been generated. */
  file?: string;
  /** Word timings relative to `start`. */
  words: Word[];
  envelope: Envelope;
  voiced: boolean;
  /** Voiced, but the clip was made with different voice settings (plays in drafts; final renders refuse). */
  stale?: boolean;
  /** Clip provenance (ElevenLabs plan tier, e.g. "free" = non-commercial). */
  provider?: string;
  tier?: string;
  /** The take that plays (absent = 0) and who chose it. */
  take?: number;
  takeChoice?: { by: "director" | "agent"; why: string };
  /** In/out points within the file (seconds; `from` is frame-aligned). Absent = the whole file. */
  clip?: { from: number; to: number };
  /** Level change in dB (automatic levelling + the line's `gain`). */
  gain?: number;
  /** Mouth size relative to the speaker's loudest line (speech motion). */
  talkScale?: number;
  /** Caption words when `caption` replaces the spoken text on screen. */
  display?: Word[];
};

export type ResolvedActor = {
  id: string;
  actor: string;
  name: string;
  color: string;
  scale: number;
  appearance: Record<string, unknown>;
  start: { position: Vec3; yaw: number };
  poses: { at: number; pose: string; transition?: number }[];
  emotions: { at: number; emotion: string; transition?: number; intensity?: number }[];
  gestures: { at: number; gesture: string; speed?: number; intensity?: number }[];
  looks: { at: number; target: LookTarget; transition?: number }[];
  moves: MoveCue[];
  turns: TurnCue[];
  overrides: OverrideCue[];
  holds: HoldCue[];
  /** Listening intensity for this character (cast `listen`; absent = the episode's `defaults.listen`). */
  listen?: number;
};

export type ResolvedEpisode = {
  id: string;
  title: string;
  fps: number;
  width: number;
  height: number;
  duration: number;
  durationInFrames: number;
  seed: string;
  /** Engine version, profile and episode-level intent: the only switch for new automatic behaviour. */
  behaviour: Behaviour;
  layout: Layout;
  initialMood: MoodRef;
  moods: MoodCue[];
  actors: ResolvedActor[];
  lines: ResolvedLine[];
  shots: Shot[];
  props: PropCue[];
  sfx: { at: number; src: string; volume: number; /** Library name and its license, when it is a library sound. */ name?: string; license?: string }[];
  events: { name: string; at: number; end: number; data: Record<string, unknown> }[];
  fx: ResolvedFx[];
  /** Post effects this episode needs (fixed for the whole render, so passes never change mid-render). */
  post: { chroma: boolean };
  music?: { src: string; volume: number; duck: number; attack: number; release: number; fadeOut: number };
  captions: { style: "subtitle" | "pop" | "none"; pageSeconds: number };
  warnings: string[];
};

export type ResolveContext = {
  environments?: Record<string, EnvironmentDef>;
  actors?: Record<string, ActorDefinition>;
  /** Names of custom item kinds the video provides components for. */
  components?: string[];
  /** Names of custom screen presets the video provides (`screens` in index.tsx / `screenKinds`). */
  screens?: string[];
  /** When given, filled with where each resolved cue came from (inspect/explain). */
  trace?: Trace;
};

const FORMATS = { landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080] } as const;
const PALETTE = ["#f59e0b", "#ff8a65", "#60a5fa", "#a78bfa", "#34d399", "#f472b6"];

export const resolveEpisode = (input: unknown, voice: VoiceManifest | null, ctx: ResolveContext = {}): ResolvedEpisode => {
  const ep: Episode = parseEpisode(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  const actorDefs = { ...ACTOR_DEFS, ...ctx.actors };
  const envs = { ...ENVIRONMENTS, ...ctx.environments };
  /** Records where a resolved object came from and its intents (only when tracing). */
  const traced = <T extends object>(obj: T, where: string, allow?: Intent[]): T => {
    ctx.trace?.entries.set(obj, allow?.length ? { source: where, allow } : { source: where });
    return obj;
  };

  // ---- format
  const preset = ep.format?.preset ? FORMATS[ep.format.preset] : FORMATS.landscape;
  const width = ep.format?.width ?? preset[0];
  const height = ep.format?.height ?? preset[1];
  const fps = ep.format?.fps ?? 30;
  const behaviour = resolveBehaviour(ep);

  // ---- set
  const env = envs[ep.set.environment];
  if (!env) throw new Error(`Unknown environment "${ep.set.environment}". Known: ${Object.keys(envs).join(", ")}`);
  const layout = resolveLayout(env, ep.set as SetOverrides, errors);
  for (const it of layout.items) {
    if (!PROPS[it.kind] && !(ctx.components ?? []).includes(it.kind)) errors.push(`set item "${it.id}": unknown kind "${it.kind}" (not in the prop catalog or the video's components)`);
    else checkItemParams(it.kind, it.params ?? {}, `set item "${it.id}"`, ctx.screens ?? [], warnings);
  }
  const itemIds = new Set(layout.items.map((i) => i.id));
  for (const [id, def] of Object.entries(ctx.actors ?? {})) for (const p of checkActorDef(def)) errors.push(`${p} (from the video's actorDefs "${id}")`);

  // ---- dialogue timing
  const lines: ResolvedLine[] = [];
  const lineById = new Map<string, ResolvedLine>();
  const timeOf = (ref: number | string, where: string): number => {
    if (typeof ref === "number") return ref;
    const m = TIME_REF_RE.exec(ref);
    if (!m) {
      errors.push(`${where}: bad time "${ref}"`);
      return 0;
    }
    const [, id, kind, wordIdx, wordEdge, off] = m;
    const line = lineById.get(id);
    if (!line) {
      errors.push(`${where}: "${ref}" references unknown or later line "${id}"`);
      return 0;
    }
    let t = kind === "start" ? line.start : kind === "end" ? line.end : 0;
    if (wordIdx !== undefined) {
      const w = line.words[Number(wordIdx) - 1];
      if (!w) {
        errors.push(`${where}: line "${id}" has ${line.words.length} words, no word ${wordIdx}`);
        t = line.start;
      } else t = line.start + (wordEdge === "end" ? w.end : w.start);
    }
    return Math.max(0, t + (off ? Number(off) : 0));
  };

  let cursor = 0.6;
  let anyUnvoiced = false;
  const staleLines: string[] = [];
  const castOrder = Object.keys(ep.cast);
  ep.dialogue.forEach((l, i) => {
    if (!ep.cast[l.speaker]) errors.push(`dialogue ${l.id}: unknown speaker "${l.speaker}"`);
    if (lineById.has(l.id)) errors.push(`dialogue: duplicate line id "${l.id}"`);
    const start = l.at !== undefined ? timeOf(l.at, `dialogue ${l.id}`) : i === 0 ? cursor : cursor + (l.gap ?? 0.35);
    const take = typeof l.take === "number" ? l.take : (l.take?.n ?? 0);
    const vl = voice?.lines[takeKey(l.id, take)];
    if (take > 0 && !vl) warnings.push(`dialogue ${l.id}: take ${take} isn't generated — run \`npm run cli -- voice ${ep.id} --takes ${l.id}=${take + 1}\``);
    const stale = vl ? voiceStaleReason(vl, l.text, ep.cast[l.speaker]?.voice, Math.max(0, castOrder.indexOf(l.speaker))) : null;
    // A clip whose text changed can't be used at all; one whose voice settings changed still plays (draft) but is flagged.
    const voiced = !!vl && vl.text === l.text;
    if (stale) {
      warnings.push(`dialogue ${l.id}: voice clip is stale (${stale}) — run \`npm run cli -- voice ${ep.id}\``);
      staleLines.push(l.id);
    }
    if (!voiced) anyUnvoiced = true;
    const est = voiced ? null : estimateWords(l.text);
    let duration = voiced ? vl!.duration : est!.duration;
    // Alignment can run a few ms past the decoded audio; keep word times inside the clip.
    let words = voiced ? vl!.words.map((w) => ({ ...w, start: Math.min(w.start, vl!.duration), end: Math.min(w.end, vl!.duration) })) : est!.words;
    let envelope = voiced ? vl!.envelope : envelopeFromWords(words, duration);
    // Edge trim: in/out points on the untouched file (automatic on engine 2, or the line's own `trim`).
    let clip: ResolvedLine["clip"];
    const an = voiced ? vl!.analysis : undefined;
    if (voiced && l.trim !== false && (l.trim || (behaviour.defaults.trim && an))) {
      const auto = behaviour.defaults.trim && an ? autoTrim(an, words) : { start: 0, end: duration };
      // The in-point is frame-aligned (playback starts on a frame), rounded down so nothing audible is lost.
      const from = Math.floor((l.trim ? (l.trim.start ?? auto.start) : auto.start) * fps + 1e-6) / fps;
      const to = Math.min(duration, l.trim ? (l.trim.end ?? auto.end) : auto.end);
      if (to <= from + 0.05) errors.push(`dialogue ${l.id}: trim leaves nothing (${from.toFixed(2)}–${to.toFixed(2)} s)`);
      else if (from > 0 || to < duration - 1e-6) {
        if (an && l.trim) for (const p of trimmedProtected(an, words, { start: from, end: to })) warnings.push(`dialogue ${l.id}: trim ${from.toFixed(2)}–${to.toFixed(2)} s cuts into ${p.what} (${p.span[0].toFixed(2)}–${p.span[1].toFixed(2)} s)`);
        clip = { from, to };
        words = words.map((w) => ({ ...w, start: Math.max(0, w.start - from), end: Math.min(to - from, Math.max(0, w.end - from)) }));
        envelope = { rate: envelope.rate, values: envelope.values.slice(Math.round(from * envelope.rate), Math.round(to * envelope.rate)) };
        duration = to - from;
      }
    }
    const line: ResolvedLine = {
      id: l.id,
      speaker: l.speaker,
      text: l.text,
      start,
      end: start + duration,
      file: voiced ? vl!.file : undefined,
      words,
      envelope,
      voiced,
      ...(voiced && stale ? { stale: true } : {}),
      ...(voiced ? { provider: vl!.provider, ...(vl!.tier ? { tier: vl!.tier } : {}) } : {}),
      ...(take > 0 ? { take } : {}),
      ...(typeof l.take === "object" ? { takeChoice: { by: l.take.by, why: l.take.why } } : {}),
      ...(clip ? { clip } : {}),
      ...(l.caption ? { display: captionWords(l.caption, words) } : {}),
    };
    if (voiced && vl!.words.length !== splitWords(l.text).length)
      warnings.push(`dialogue ${l.id}: the voice has ${vl!.words.length} timed words but the script has ${splitWords(l.text).length} — "${l.id}.word:N" refs count the timed words`);
    lines.push(line);
    lineById.set(l.id, line);
    cursor = line.end;
  });
  // Two lines of the same speaker at once is almost always a timing mistake (interruptions use two speakers).
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++)
      // Measured to the last spoken word: starting a line in the previous clip's trailing silence is fine.
      if (lines[i].speaker === lines[j].speaker && lines[j].start < spokenEnd(lines[i]) - 0.05 && lines[i].start < spokenEnd(lines[j]) - 0.05)
        warnings.push(`dialogue ${lines[j].id} overlaps ${lines[i].id} (same speaker ${lines[i].speaker})`);
  // Levels and speech motion are relative to each speaker's own lines (measured clips only).
  for (const sp of new Set(lines.map((l) => l.speaker))) {
    const measured = lines.filter((l) => l.speaker === sp && l.voiced).map((l) => ({ l, an: voice!.lines[takeKey(l.id, l.take ?? 0)]?.analysis })).filter((x) => !!x.an);
    const target = median(measured.map((x) => x.an!.loudness));
    const loudest = Math.max(...measured.map((x) => x.an!.envPeak), 1e-9);
    for (const l of lines.filter((x) => x.speaker === sp)) {
      const an = measured.find((x) => x.l === l)?.an;
      const authored = ep.dialogue.find((d) => d.id === l.id)?.gain;
      const gain = behaviour.defaults.level && an ? lineGain(an, target, authored ?? 0) : authored;
      if (gain) l.gain = gain;
      if (behaviour.defaults.speechMotion && an) l.talkScale = Math.round(Math.min(1, an.envPeak / loudest) * 1000) / 1000;
    }
  }
  if (anyUnvoiced && ep.dialogue.length) warnings.push(`some lines have no generated voice (timing estimated) — run \`npm run cli -- voice ${ep.id}\``);

  // ---- places
  const markOrPoint = (p: Vec3 | string, where: string): Vec3 => {
    if (Array.isArray(p)) return p;
    const mark = layout.marks[p];
    if (mark) return mark.position;
    if (itemIds.has(p)) return itemAnchor(layout, p, "center");
    errors.push(`${where}: unknown place "${p}" (marks: ${Object.keys(layout.marks).join(", ")})`);
    return [0, 0, 0];
  };
  const castIds = Object.keys(ep.cast);
  const lookTarget = (p: Vec3 | string | null, where: string): LookTarget => {
    if (p === null) return null;
    if (Array.isArray(p)) return p;
    if (p === "camera") return "camera";
    const [head, anchor] = p.split(".");
    if (ep.cast[head]) return { actor: head, anchor: anchor ?? "face" };
    if (itemIds.has(head)) return itemAnchor(layout, head, anchor ?? "center");
    const mark = layout.marks[p];
    if (mark) return [mark.position[0], mark.position[1] + 1.2, mark.position[2]];
    errors.push(`${where}: unknown look target "${p}"`);
    return null;
  };

  // ---- actors
  const actors: ResolvedActor[] = castIds.map((id, i) => {
    const c = ep.cast[id];
    const def = actorDefs[c.actor];
    if (!def) {
      errors.push(`cast ${id}: unknown actor "${c.actor}" (known: ${Object.keys(actorDefs).join(", ")})`);
    }
    let position: Vec3 = [i * 0.8, 0, 0];
    let yaw = c.yaw ?? 0;
    if (c.at !== undefined) {
      if (typeof c.at === "string" && layout.marks[c.at]) {
        position = layout.marks[c.at].position;
        yaw = c.yaw ?? layout.marks[c.at].yaw;
      } else position = markOrPoint(c.at, `cast ${id}`);
    }
    const ra: ResolvedActor = {
      id,
      actor: c.actor,
      name: c.name ?? def?.name ?? id,
      color: c.color ?? PALETTE[i % PALETTE.length],
      scale: c.scale ?? 1,
      appearance: c.appearance ?? {},
      start: traced({ position, yaw }, `cast.${id}`, c.allow),
      poses: c.pose ? [traced({ at: 0, pose: c.pose, transition: 0 }, `cast.${id}`)] : [],
      emotions: c.emotion ? [traced({ at: 0, emotion: c.emotion, transition: 0 }, `cast.${id}`)] : [],
      gestures: [],
      looks: [],
      moves: [],
      turns: [],
      overrides: [],
      holds: [],
      ...(c.listen !== undefined ? { listen: c.listen } : {}),
    };
    if (def && c.pose && !def.poses[c.pose]) errors.push(`cast ${id}: unknown pose "${c.pose}" for ${c.actor}`);
    if (def && c.emotion && !def.emotions[c.emotion]) errors.push(`cast ${id}: unknown emotion "${c.emotion}" for ${c.actor}`);
    if (def) for (const k of Object.keys(c.appearance ?? {})) if (!def.appearance[k]) warnings.push(`cast ${id}: unknown appearance "${k}" for ${c.actor} (has: ${Object.keys(def.appearance).join(", ")})`);
    return ra;
  });
  const actorById = new Map(actors.map((a) => [a.id, a]));

  // Track positions through moves so mark arrivals can turn to the mark's yaw. Moves queue exactly
  // like the rig does (a move starting before the previous one ends waits for it).
  const lastPos = new Map(actors.map((a) => [a.id, a.start.position]));
  const moveFree = new Map(actors.map((a) => [a.id, -Infinity]));
  let contentEnd = 0;
  const sortedActions = [...ep.actions].map((a, i) => ({ a, i, t: timeOf(a.at, `actions[${i}]`) })).sort((x, y) => x.t - y.t || x.i - y.i);
  // Cues produced by recipes (merged with the authored props/sfx below).
  const recipeProps: PropCue[] = [];
  const recipeSfx: { at: number; sound: string; volume?: number; where: string }[] = [];
  const applyAction = (a: Omit<EpisodeAction, "at">, t: number, where: string) => {
    const allow = a.allow;
    contentEnd = Math.max(contentEnd, t + (a.transition ?? 0));
    const ra = actorById.get(a.actor);
    if (!ra) {
      errors.push(`${where}: unknown cast member "${a.actor}"`);
      return;
    }
    const def = actorDefs[ra.actor];
    if (a.pose) {
      if (def && !def.poses[a.pose]) errors.push(`${where}: unknown pose "${a.pose}" (has: ${Object.keys(def.poses).join(", ")})`);
      ra.poses.push(traced({ at: t, pose: a.pose, transition: a.transition }, where, allow));
    }
    if (a.emotion) {
      if (def && !def.emotions[a.emotion]) errors.push(`${where}: unknown emotion "${a.emotion}" (has: ${Object.keys(def.emotions).join(", ")})`);
      // `intensity` belongs to the gesture when there is one; otherwise it is how far toward the emotion.
      const intensity = a.intensity !== undefined && !a.gesture ? { intensity: Math.min(1, a.intensity) } : {};
      ra.emotions.push(traced({ at: t, emotion: a.emotion, transition: a.transition, ...intensity }, where, allow));
    }
    if (a.gesture) {
      if (def && !def.gestures[a.gesture]) errors.push(`${where}: unknown gesture "${a.gesture}" (has: ${Object.keys(def.gestures).join(", ")})`);
      ra.gestures.push(traced({ at: t, gesture: a.gesture, speed: a.speed, intensity: a.intensity }, where, allow));
      const gd = def?.gestures[a.gesture];
      if (gd) contentEnd = Math.max(contentEnd, t + gd.duration / (a.speed ?? 1));
    }
    if (a.look !== undefined) ra.looks.push(traced({ at: t, target: lookTarget(a.look, where), transition: a.transition }, where, allow));
    if (a.move) {
      const to = markOrPoint(a.move.to, where);
      const from = lastPos.get(ra.id)!;
      const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
      const speed = (a.move.speed ?? def?.walk.speed ?? 1) * ra.scale;
      const duration = a.move.duration ?? Math.max(0.2, dist / speed);
      const start = Math.max(t, moveFree.get(ra.id)!);
      if (start > t + 1e-6) warnings.push(`${where}: move starts before the previous move ends; it waits until ${start.toFixed(2)}s`);
      ra.moves.push(traced({ at: t, to, duration, face: a.move.face, ...(a.move.ease ? { ease: a.move.ease } : {}) }, where, allow));
      lastPos.set(ra.id, to);
      moveFree.set(ra.id, start + duration);
      contentEnd = Math.max(contentEnd, start + duration);
      if (typeof a.move.to === "string" && layout.marks[a.move.to] && a.move.face === undefined) {
        ra.turns.push(traced({ at: start + duration - 0.15, yaw: layout.marks[a.move.to].yaw, duration: 0.45 }, `${where} (turn on arrival)`, allow));
      }
    }
    if (a.turn !== undefined) {
      if (typeof a.turn === "number") ra.turns.push(traced({ at: t, yaw: a.turn, duration: a.transition }, where, allow));
      else {
        const other = typeof a.turn === "string" ? actorById.get(a.turn.split(".")[0]) : undefined;
        const toward = other ? lastPos.get(other.id)! : markOrPoint(a.turn, where);
        ra.turns.push(traced({ at: t, toward, duration: a.transition }, where, allow));
      }
    }
    if (a.hold) {
      for (const [socket, item] of Object.entries(a.hold)) {
        if (def && !def.sockets[socket]) errors.push(`${where}: ${ra.actor} has no socket "${socket}" (has: ${Object.keys(def.sockets).join(", ")})`);
        if (item !== null && !itemIds.has(item) && !PROPS[item] && !(ctx.components ?? []).includes(item)) errors.push(`${where}: hold item "${item}" is not a set item or prop kind`);
        ra.holds.push(traced({ at: t, socket, item }, where, allow));
      }
    }
    if (a.joints || a.keys) {
      // Keyed joints: a smooth spline through every key; `joints` (if any) are the values at the action's time.
      const keyed = a.keys?.map((k, j) => ({ at: timeOf(k.at, `${where}.keys[${j}]`), set: k.joints })).sort((x, y) => x.at - y.at);
      const keys = keyed && a.joints ? [{ at: t, set: a.joints }, ...keyed] : keyed;
      const set: Record<string, number> = { ...a.joints };
      for (const k of keys ?? []) for (const ch in k.set) if (!(ch in set)) set[ch] = k.set[ch];
      if (def) for (const k of Object.keys(set)) if (!def.channels[k]) errors.push(`${where}: ${ra.actor} has no channel "${k}"`);
      for (const k of keyed ?? []) {
        if (k.at < t - 1e-6) errors.push(`${where}: a joints key at ${k.at.toFixed(2)}s is before the action (${t.toFixed(2)}s)`);
        if (a.duration !== undefined && k.at > t + a.duration + 1e-6) warnings.push(`${where}: a joints key at ${k.at.toFixed(2)}s is after the override ends (${(t + a.duration).toFixed(2)}s)`);
      }
      ra.overrides.push(traced({ at: t, set, duration: a.duration, blend: a.transition, mode: a.mode, ...(keys ? { keys } : {}) }, where, allow));
      if (a.duration !== undefined) contentEnd = Math.max(contentEnd, t + a.duration + (a.transition ?? 0.25));
      if (keys) contentEnd = Math.max(contentEnd, keys[keys.length - 1].at);
    }
  };

  // An explicit item anchor must exist: a typo would otherwise fall back to the item centre silently.
  const badAnchor = (item: string, anchor: string, where: string) => {
    const kind = layout.items.find((i) => i.id === item)?.kind;
    const anchors = kind ? PROPS[kind]?.anchors : undefined;
    if (!anchors || anchor === "center" || anchors[anchor]) return false;
    errors.push(`${where}: "${item}" has no anchor "${anchor}" (has: ${Object.keys(anchors).join(", ") || "none"})`);
    return true;
  };
  const pointOf = (ref: Vec3 | string, at: number, where: string): Vec3 | null => {
    if (Array.isArray(ref)) return ref;
    const [head, anchor] = [ref.split(".")[0], ref.slice(ref.indexOf(".") + 1)];
    const hasAnchor = ref.includes(".");
    const other = actorById.get(head);
    if (other && actorDefs[other.actor]) {
      const b = baseAt(other, actorDefs[other.actor], at);
      return b.anchors[hasAnchor ? anchor : "chest"] ?? b.anchors.chest;
    }
    if (itemIds.has(head)) return hasAnchor && badAnchor(head, anchor, where) ? null : itemAnchor(layout, head, hasAnchor ? anchor : "center");
    if (layout.marks[ref]) return layout.marks[ref].position;
    errors.push(`${where}: unknown target "${ref}"`);
    return null;
  };
  const pressable = (ref: string) => {
    const [item, anchor] = [ref.split(".")[0], ref.slice(ref.indexOf(".") + 1)];
    const it = layout.items.find((i) => i.id === item);
    const press = it && PROPS[it.kind]?.press;
    if (!it || !press) return null;
    if (press.keyed) {
      if (!anchor.startsWith("key:")) return null;
      const key = anchor.slice(4);
      return { item, travel: press.travel * (it.scale ?? 1), set: (down: boolean) => ({ [press.param]: { [key]: down } }) };
    }
    return { item, travel: press.travel * (it.scale ?? 1), set: (down: boolean) => ({ [press.param]: down }) };
  };

  for (const { a, i, t } of sortedActions) {
    const where = `actions[${i}] (${a.actor} @ ${t.toFixed(2)}s)`;
    if (!a.do) {
      applyAction(a, t, where);
      continue;
    }
    const ra = actorById.get(a.actor);
    const def = ra && actorDefs[ra.actor];
    if (!ra || !def) {
      errors.push(`${where}: unknown cast member "${a.actor}"`);
      continue;
    }
    if (a.emotion) applyAction({ actor: a.actor, emotion: a.emotion, transition: a.transition }, t, where);
    const end = expandRecipe(a, t, {
      ra,
      def,
      layout,
      defaults: behaviour.defaults,
      where: `${where} do:${a.do}`,
      apply: (sub: SubAction) => applyAction({ ...sub, actor: a.actor, allow: [...(a.allow ?? []), ...(sub.allow ?? [])] }, sub.at, `${where} do:${a.do}${sub.step ? ` step '${sub.step}'` : ""}`),
      contact: (c) => ctx.trace?.contacts.push({ ...c, actor: a.actor, source: `${where} do:${a.do}${c.step ? ` step '${c.step}'` : ""}` }),
      pointOf: (ref, at) => pointOf(ref, at, `${where} do:${a.do}`),
      pressable,
      addProp: (at, item, set) => recipeProps.push(traced({ at, item, set }, `${where} do:${a.do}`)),
      addSfx: (at, sound, volume) => recipeSfx.push({ at, sound, volume, where: `${where} do:${a.do}` }),
      addItem: (item) => {
        layout.items.push(item);
        itemIds.add(item.id);
      },
      error: (msg) => errors.push(msg),
    });
    contentEnd = Math.max(contentEnd, end);
  }

  // ---- accents (fx): times, 3D targets, and their sounds
  const fx: ResolvedFx[] = ep.fx.map((f, i) => {
    const at = timeOf(f.at, `fx[${i}]`);
    const { type, at: _at, duration, sound, volume, allow, ...data } = f as typeof f & { on?: Vec3 | string };
    const where = `fx[${i}] (${type})`;
    let on: ResolvedFx["on"];
    const ref = (f as { on?: Vec3 | string }).on;
    if (ref !== undefined) {
      if (Array.isArray(ref)) on = ref;
      else {
        const [head, anchor] = ref.split(".");
        if (ep.cast[head]) on = { actor: head, anchor: anchor ?? "chest" };
        else if (itemIds.has(head)) {
          const anchor = ref.includes(".") ? ref.slice(ref.indexOf(".") + 1) : "center";
          if (!badAnchor(head, anchor, where)) on = itemAnchor(layout, head, anchor);
        }
        else if (layout.marks[ref]) on = layout.marks[ref].position;
        else errors.push(`${where}: unknown target "${ref}"`);
      }
    }
    if (sound) recipeSfx.push({ at, sound, volume, where });
    return traced({ type, at, end: at + (duration ?? FX_INFO[type].duration), data, ...(on ? { on } : {}), seed: `${ep.seed ?? ep.id}:fx${i}` }, where, allow);
  });
  contentEnd = Math.max(contentEnd, ...fx.map((f) => f.end));

  // ---- end time: the latest-ending thing in the episode (not just the last array entry).
  const events = ep.events.map((e, i) => {
    const at = timeOf(e.at, `events[${i}]`);
    return { name: e.name, at, end: at + (e.duration ?? 0), data: e.data ?? {} };
  });
  const cueTimes: { at: number; what: string }[] = [
    ...lines.map((l) => ({ at: l.end, what: `dialogue ${l.id} ends` })),
    ...events.map((e, i) => ({ at: e.end, what: `events[${i}] (${e.name})` })),
    ...ep.camera.map((c, i) => ({ at: timeOf(c.at, `camera[${i}]`), what: `camera[${i}] cut` })),
    ...ep.sfx.map((c, i) => ({ at: timeOf(c.at, `sfx[${i}]`), what: `sfx[${i}] (${c.sound})` })),
    ...ep.props.map((c, i) => ({ at: timeOf(c.at, `props[${i}]`), what: `props[${i}] (${c.item})` })),
    ...ep.lighting.map((c, i) => ({ at: timeOf(c.at, `lighting[${i}]`) + (c.transition ?? 0), what: `lighting[${i}]` })),
  ];
  const lastCue = Math.max(contentEnd, ...cueTimes.map((c) => c.at), 0);
  const duration = ep.end !== undefined ? timeOf(ep.end, "end") : Math.max(lastCue, 2) + 1.5;
  if (ep.end !== undefined) {
    for (const c of cueTimes) if (c.at > duration + 1e-6 && !c.what.includes("cut")) warnings.push(`${c.what} at ${c.at.toFixed(2)}s is after the end (${duration.toFixed(2)}s) and will be cut`);
    if (contentEnd > duration + 1e-6) warnings.push(`actions run until ${contentEnd.toFixed(2)}s, after the end (${duration.toFixed(2)}s)`);
  }

  // ---- camera
  const focusTarget = (f: Vec3 | string, where: string): FocusTarget => {
    if (Array.isArray(f)) return f;
    const [head, anchor] = f.split(".");
    if (ep.cast[head]) return { actor: head, anchor: anchor ?? "face" };
    if (itemIds.has(head)) return { item: head, anchor: anchor ?? "center" };
    errors.push(`${where}: unknown focus target "${f}"`);
    return [0, 1, 0];
  };
  const shotsIn = [...ep.camera].map((s, i) => ({ s, i, t: timeOf(s.at, `camera[${i}]`) })).sort((a, b) => a.t - b.t || a.i - b.i);
  for (const { i, t } of shotsIn) if (t >= duration) errors.push(`camera[${i}]: cut at ${t.toFixed(2)}s is at/after the end (${duration.toFixed(2)}s)`);
  const shots: Shot[] = shotsIn.map(({ s, i, t }, k) => traced(toShot(s, t, shotsIn[k + 1]?.t ?? duration, `camera[${i}]`, { errors, warnings, castIds, itemIds, layout, focusTarget, timeOf, defaults: behaviour.defaults }), `camera[${i}] (${s.shot})`, s.allow));

  // ---- lighting / props / sfx
  const checkMood = (m: MoodRef, where: string) => {
    if (typeof m === "string" && !MOODS[m]) errors.push(`${where}: unknown mood "${m}" (known: ${Object.keys(MOODS).join(", ")})`);
    if (typeof m === "object" && typeof m.base === "string" && !MOODS[m.base]) errors.push(`${where}: unknown base mood "${m.base}"`);
  };
  const initialMood = (ep.mood ?? env.defaultMood) as MoodRef;
  checkMood(initialMood, "mood");
  const moods: MoodCue[] = ep.lighting
    .map((l, i) => {
      checkMood(l.mood as MoodRef, `lighting[${i}]`);
      return traced({ at: timeOf(l.at, `lighting[${i}]`), mood: l.mood as MoodRef, transition: l.transition }, `lighting[${i}]`);
    })
    .sort((a, b) => a.at - b.at);
  const props: PropCue[] = [...ep.props
    .map((p, i) => {
      if (!itemIds.has(p.item)) errors.push(`props[${i}]: unknown set item "${p.item}"`);
      else checkItemParams(layout.items.find((it) => it.id === p.item)!.kind, p.set, `props[${i}] (${p.item})`, ctx.screens ?? [], warnings);
      return traced({ at: timeOf(p.at, `props[${i}]`), item: p.item, set: p.set }, `props[${i}]`);
    }), ...recipeProps]
    .sort((a, b) => a.at - b.at);
  // Sounds from recipes and fx[].sound are validated here too; `where` names the author's entry, not a merged index.
  const sfx = [...ep.sfx.map((s, i) => ({ ...s, where: `sfx[${i}]` })), ...recipeSfx.map((r) => ({ at: r.at as number | string, sound: r.sound, volume: r.volume, prompt: undefined, where: r.where }))]
    .map((s) => {
      // Library name, URL, or a file relative to the video's public folder (public/videos/<id>/...).
      const isFile = !SFX_LIBRARY[s.sound] && !/^https?:\/\//.test(s.sound);
      const src = SFX_LIBRARY[s.sound] ?? (isFile && !s.sound.startsWith("videos/") ? `videos/${ep.id}/${s.sound}` : s.sound);
      if (!SFX_LIBRARY[s.sound] && !/^https?:\/\//.test(s.sound) && !/\.(wav|mp3|ogg|m4a)$/i.test(s.sound)) {
        errors.push(`${s.where}: "${s.sound}" is not a library sound, URL or audio file in public/`);
      }
      const info = SFX_INFO[s.sound];
      return traced({ at: timeOf(s.at, s.where), src, volume: s.volume ?? 1, ...(info ? { name: s.sound, license: info.license } : {}) }, s.where);
    })
    .sort((a, b) => a.at - b.at);

  for (const a of actors) for (const k of ["poses", "emotions", "gestures", "looks", "turns", "overrides", "holds"] as const) (a[k] as { at: number }[]).sort((x, y) => x.at - y.at);

  const problems = [...new Set(errors)];
  if (problems.length) throw new Error(`Episode "${ep.id}" has ${problems.length} problem(s):\n${problems.map((e) => `  • ${e}`).join("\n")}`);

  return {
    id: ep.id,
    title: ep.title,
    fps,
    width,
    height,
    duration,
    durationInFrames: Math.max(1, Math.ceil(duration * fps)),
    seed: ep.seed ?? ep.id,
    behaviour,
    layout,
    initialMood,
    moods,
    actors,
    lines,
    shots,
    props,
    sfx,
    events,
    fx,
    post: { chroma: fx.some((f) => f.type === "glitch") },
    music: ep.music
      ? {
          src: ep.music.src,
          volume: ep.music.volume ?? 0.35,
          duck: ep.music.duck ?? 0.35,
          // Engine 2 ramps the duck and fades the bed out; engine 1 keeps the original hard switch.
          attack: ep.music.attack ?? (behaviour.engine >= 2 ? 0.25 : 0),
          release: ep.music.release ?? (behaviour.engine >= 2 ? 0.6 : 0),
          fadeOut: ep.music.fadeOut ?? (behaviour.engine >= 2 ? 0.6 : 0),
        }
      : undefined,
    captions: { style: ep.captions?.style ?? "subtitle", pageSeconds: ep.captions?.pageSeconds ?? 1.6 },
    warnings,
  };
};

const toShot = (
  s: EpisodeShot,
  at: number,
  end: number,
  where: string,
  h: {
    errors: string[];
    warnings: string[];
    castIds: string[];
    itemIds: Set<string>;
    layout: Layout;
    focusTarget: (f: Vec3 | string, where: string) => FocusTarget;
    timeOf: (ref: number | string, where: string) => number;
    defaults: Defaults;
  },
): Shot => {
  const subjects = s.subject === undefined ? [] : Array.isArray(s.subject) ? s.subject : [s.subject];
  if (s.shot !== "insert") for (const id of subjects) if (!h.castIds.includes(id)) h.errors.push(`${where}: unknown subject "${id}"`);
  if (s.over && !h.castIds.includes(s.over)) h.errors.push(`${where}: unknown over-shoulder actor "${s.over}"`);
  if (s.shot === "over-shoulder" && !s.over) h.errors.push(`${where}: over-shoulder needs "over"`);
  if (s.shot === "insert" && (!s.item || !h.itemIds.has(s.item))) h.errors.push(`${where}: insert needs a set "item" (got ${s.item ?? "none"})`);
  if (s.shot === "establishing" && s.spot && !h.layout.cameras[s.spot]) h.errors.push(`${where}: unknown camera spot "${s.spot}" (has: ${Object.keys(h.layout.cameras).join(", ")})`);
  if (s.shot === "custom" && (!s.position || !s.target)) h.errors.push(`${where}: custom shot needs position and target`);
  if (!["establishing", "custom", "insert"].includes(s.shot) && !subjects.length && !s.position) h.errors.push(`${where}: ${s.shot} shot needs a subject`);
  const moves: MoveSpec[] = (s.move === undefined ? [] : Array.isArray(s.move) ? s.move : [s.move]).map((m, j) =>
    typeof m === "string" ? { type: m } : { type: m.type, amount: m.amount, ease: m.ease, ...(m.at !== undefined ? { at: h.timeOf(m.at, `${where}.move[${j}]`) } : {}), ...(m.duration !== undefined ? { duration: m.duration } : {}) },
  );
  const fixed = s.shot === "custom" || s.shot === "establishing" || s.shot === "over-shoulder" || (!!s.position && !!s.target);
  const keys = s.keys?.map((k, j) => ({ ...k, at: h.timeOf(k.at, `${where}.keys[${j}]`) })).sort((a, b) => a.at - b.at);
  if (keys?.length && fixed) h.warnings.push(`${where}: keys follow the subject and apply to framed shots (close, medium, full…); a ${s.shot} shot ignores them — use "path" for an authored flight`);
  const path = s.path?.map((k, j) => ({ ...k, at: h.timeOf(k.at, `${where}.path[${j}]`) })).sort((a, b) => a.at - b.at);
  for (const k of [...(keys ?? []), ...(path ?? [])]) if (k.at < at - 1e-6 || k.at > end + 1e-6) h.warnings.push(`${where}: a keyframe at ${k.at.toFixed(2)}s is outside the shot (${at.toFixed(2)}–${end.toFixed(2)}s)`);
  // Opt-in subtle drift on shots without any authored motion.
  if (h.defaults.cameraLife > 0 && s.move === undefined && !keys?.length && !path?.length && !s.lock) moves.push({ type: "life", amount: h.defaults.cameraLife });
  return {
    at,
    end,
    type: s.shot,
    subjects: s.shot === "insert" ? [] : subjects,
    over: s.over,
    spot: s.spot,
    item: s.item,
    itemAnchor: s.anchor,
    size: s.size,
    angle: s.angle,
    height: s.height,
    distance: s.distance,
    lens: s.lens,
    fov: s.fov,
    position: s.position,
    target: s.target,
    offset: s.offset,
    roll: s.roll,
    moves,
    track: s.track,
    follow: s.follow,
    focus: s.focus === undefined || s.focus === "auto" || s.focus === "none" ? s.focus : h.focusTarget(s.focus, where),
    rack: s.rack?.map((r, i) => ({ at: h.timeOf(r.at, `${where}.rack[${i}]`), to: h.focusTarget(r.to, `${where}.rack[${i}]`), duration: r.duration })),
    dof: s.dof,
    lock: s.lock,
    allowOcclusion: s.allowOcclusion,
    blend: s.blend,
    ...(s.allow ? { allow: s.allow } : {}),
    ...(keys?.length ? { keys } : {}),
    ...(path?.length ? { path } : {}),
    ...(h.defaults.focusPull ? { focusPull: 0.45 } : {}),
    ...(h.defaults.arcBlend && s.blend ? { arcBlend: true } : {}),
  };
};

export { lineHash };

/** Caption words for a `caption` override: the timed words' times when the counts match, else spread over the speech. */
const captionWords = (caption: string, words: Word[]): Word[] => {
  const shown = splitWords(caption);
  if (shown.length === words.length) return words.map((w, i) => ({ ...w, text: shown[i] }));
  const t0 = words[0]?.start ?? 0;
  const t1 = words[words.length - 1]?.end ?? t0 + 0.4 * shown.length;
  const total = shown.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return shown.map((text) => {
    const a = t0 + ((t1 - t0) * acc) / total;
    acc += text.length + 1;
    return { text, start: a, end: t0 + ((t1 - t0) * (acc - 1)) / total };
  });
};

const spokenEnd = (l: ResolvedLine) => (l.words.length ? l.start + l.words[l.words.length - 1].end : l.end);

/** Warn (never fail) on params a catalog prop doesn't read, and on unknown screen presets/params. */
const checkItemParams = (kind: string, params: Record<string, unknown>, where: string, customScreens: string[], warnings: string[]) => {
  const meta = PROPS[kind];
  if (!meta) return; // custom components define their own params
  for (const [k, v] of Object.entries(params)) {
    const spec = meta.params[k] ?? COMMON_ITEM_PARAMS[k];
    if (!spec) {
      warnings.push(`${where}: "${kind}" has no param "${k}" (has: ${Object.keys(meta.params).join(", ")})`);
      continue;
    }
    if (spec.type !== "screen" || !v || typeof v !== "object") continue;
    const screen = v as Record<string, unknown>;
    const preset = String(screen.preset ?? "");
    if (customScreens.includes(preset)) continue; // the video's own drawing reads its own params
    const sm = SCREEN_META[preset];
    if (!sm) {
      warnings.push(`${where}: unknown screen preset "${preset}" (renders "off"; has: ${[...Object.keys(SCREEN_META), ...customScreens].join(", ")})`);
      continue;
    }
    if (preset === "code" && typeof screen.lang === "string" && !CODE_LANGS.includes(screen.lang)) warnings.push(`${where}: code screen lang "${screen.lang}" isn't highlighted (has: ${CODE_LANGS.join(", ")}); it shows as plain text`);
    for (const key of Object.keys(screen)) if (!sm.params[key] && !COMMON_SCREEN_PARAMS[key]) warnings.push(`${where}: screen preset "${preset}" has no param "${key}" (has: ${Object.keys(sm.params).join(", ")})`);
  }
};
