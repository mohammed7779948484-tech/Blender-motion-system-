// Speech data shared by the voice generator (Node) and the renderer (browser). Pure.
//
// Mouth animation here is AMPLITUDE-DRIVEN stylized mouthing: an RMS envelope of the voice clip
// opens the mouth. It is not phoneme lip-sync (no visemes); a phoneme track (e.g. from Rhubarb)
// would be the upgrade path, consumed the same way through an actor's `life` signals.
import type { Caption } from "@remotion/captions";
import type { ClipAnalysis } from "./analysis";
import { SFX_INFO } from "./sfx.data";

export type Word = { text: string; start: number; end: number };
export type Envelope = { rate: number; values: number[] };

export type VoiceProvider = "elevenlabs" | "system" | "fixture";
export const VOICE_PROVIDERS: VoiceProvider[] = ["elevenlabs", "system", "fixture"];

export type VoiceLine = {
  /** Path relative to public/. */
  file: string;
  /** Scheme 2: fingerprint of the effective request (see voiceFingerprint). Legacy: lineHash. */
  hash: string;
  scheme?: 2;
  provider: VoiceProvider;
  text: string;
  duration: number;
  words: Word[];
  envelope: Envelope;
  /** Provenance (scheme 2). */
  model?: string;
  voiceId?: string;
  format?: string;
  /** ElevenLabs plan tier at generation time ("free" clips are non-commercial). */
  tier?: string;
  generatedAt?: string;
  /** Alternative take number (absent = take 0, the line's original seed). */
  take?: number;
  /** Measured in Node at voice time (backfilled for cached clips, free): energy, loudness, tags, validation. */
  analysis?: ClipAnalysis;
};
/** Lines by id; alternative takes are stored as `<id>#<n>` (take 0 is the plain id, so old caches stay valid). */
export type VoiceManifest = { version: 1; lines: Record<string, VoiceLine> };

/** Manifest key of a line's take. */
export const takeKey = (id: string, take = 0) => (take > 0 ? `${id}#${take}` : id);

/** FNV-1a 32-bit — tiny, identical in Node and the browser. */
export const hashString = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

/** Legacy (scheme 1) cache key: text + raw cast overrides + provider. Kept to recognise old clips. */
export const lineHash = (text: string, voice: unknown, provider: string) => hashString(`${provider}|${text}|${JSON.stringify(voice ?? {})}`);

// ---------------------------------------------------------------- effective voice requests

/** Cast voice settings as written in episode.json (mirrors the schema's Voice object). */
export type CastVoice = {
  elevenlabs?: { voiceId: string; model?: string; settings?: Record<string, number> };
  system?: string;
  rate?: number;
  pitch?: string;
};

/**
 * Premade ElevenLabs voices used when a cast member has no voiceId, by cast order (override per cast
 * `voice.elevenlabs.voiceId`). Confirmed usable via `voice --check` on 2026-10-18: Liam (young,
 * energetic creator), Jessica (cute, playful), Will (young, relaxed), Laura (quirky).
 */
export const DEFAULT_ELEVEN_VOICES = ["TX3LPaxmHKxFdv7VOQHJ", "cgSgspJ2msm6clMCkdW9", "bIHbv24MWmeRgasZH58o", "FGY2WhTYpPnrIDTdsKH5"];
export const DEFAULT_ELEVEN_MODEL = "eleven_v4";
export const ELEVEN_FORMAT = "wav_24000";
/** Voice settings each model accepts, with defaults (v3/v4: stability + similarity only, no style/speed). */
export const ELEVEN_MODEL_SETTINGS: Record<string, Record<string, number>> = {
  eleven_v4: { stability: 0.5, similarity_boost: 0.75 },
  eleven_v4_turbo: { stability: 0.5, similarity_boost: 0.75 },
  eleven_v3: { stability: 0.5, similarity_boost: 0.75 },
};
export const DEFAULT_ELEVEN_SETTINGS: Record<string, number> = { stability: 0.45, similarity_boost: 0.75, style: 0.3 };
/** Models documented to use previous_text/next_text for continuity (not v3; v4 unverified, so off). */
export const ELEVEN_STITCH_MODELS = ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5", "eleven_turbo_v2", "eleven_flash_v2"];
/** Models that perform inline audio tags like [laughs] instead of reading them aloud. */
export const ELEVEN_TAG_MODELS = ["eleven_v3", "eleven_v4", "eleven_v4_turbo"];
export const DEFAULT_SYSTEM_VOICES = ["Microsoft David Desktop", "Microsoft Zira Desktop", "Microsoft Mark"];

// ---------------------------------------------------------------- audio tags

/** Inline performance tags such as `[laughs]` or `[clears throat]` (expressive ElevenLabs models). */
export const TAG_RE = /\[[^\]\n]{1,40}\]/g;
/** Text with performance tags removed (what offline voices read and captions show). */
export const stripTags = (text: string) => text.replace(TAG_RE, " ").replace(/\s+/g, " ").trim();
export const hasTags = (text: string) => new RegExp(TAG_RE.source).test(text);

export type VoiceRequest = (
  | { provider: "elevenlabs"; text: string; voiceId: string; model: string; settings: Record<string, number>; format: string }
  | { provider: "system"; text: string; voice: string; rate: number; pitch?: string }
  | { provider: "fixture"; text: string; speakerIndex: number }
) & { /** Alternative take (only present for take ≥ 1, so take-0 fingerprints never change). */ take?: number };

/** Offline system voices vary a take by speaking rate (SAPI has no seed): take n → this offset in rate steps. */
const SYSTEM_TAKE_RATE = [0, -1, 1, -2, 2];

/**
 * Exactly what a provider will be asked to synthesise, with every default filled in. Pure. A take ≥ 1 is a
 * variant of the same line: another seed (ElevenLabs, fixture) or another speaking rate (system voices).
 */
export const voiceRequest = (provider: VoiceProvider, text: string, voice: CastVoice | undefined, speakerIndex: number, take = 0): VoiceRequest => {
  const req = baseRequest(provider, text, voice, speakerIndex);
  if (take <= 0) return req;
  if (req.provider === "system") return { ...req, rate: req.rate + (SYSTEM_TAKE_RATE[take] ?? take), take };
  return { ...req, take };
};

/** ElevenLabs seed of a take (take 0 = the seed every cached clip was made with). */
export const takeSeed = (text: string, take = 0) => parseInt(hashString(take > 0 ? `${text}#${take}` : text).slice(0, 7), 16);

const baseRequest = (provider: VoiceProvider, text: string, voice: CastVoice | undefined, speakerIndex: number): VoiceRequest => {
  if (provider === "elevenlabs") {
    const el = voice?.elevenlabs;
    const model = el?.model ?? DEFAULT_ELEVEN_MODEL;
    const allowed = ELEVEN_MODEL_SETTINGS[model];
    const settings = allowed
      ? { ...allowed, ...Object.fromEntries(Object.entries(el?.settings ?? {}).filter(([k]) => k in allowed)) }
      : { ...DEFAULT_ELEVEN_SETTINGS, ...(el?.settings ?? {}) };
    return {
      provider,
      text: ELEVEN_TAG_MODELS.includes(model) ? text : stripTags(text),
      voiceId: el?.voiceId ?? DEFAULT_ELEVEN_VOICES[speakerIndex % DEFAULT_ELEVEN_VOICES.length],
      model,
      settings,
      format: ELEVEN_FORMAT,
    };
  }
  // Offline voices would read "[laughs]" aloud: they get the tag-free text.
  if (provider === "system") return { provider, text: stripTags(text), voice: voice?.system ?? DEFAULT_SYSTEM_VOICES[speakerIndex % DEFAULT_SYSTEM_VOICES.length], rate: voice?.rate ?? 0, ...(voice?.pitch ? { pitch: voice.pitch } : {}) };
  return { provider, text: stripTags(text), speakerIndex };
};

const stable = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`
    : JSON.stringify(v);

/** Scheme-2 cache key: changes exactly when the synthesised audio would change. */
export const voiceFingerprint = (req: VoiceRequest) => hashString(`v2|${stable(req)}`);

/** Why a cached clip no longer matches the episode, or null when it is fresh. */
export const voiceStaleReason = (entry: VoiceLine, text: string, voice: CastVoice | undefined, speakerIndex: number): string | null => {
  if (entry.text !== text) return "text changed";
  if (entry.scheme === 2) {
    const req = voiceRequest(entry.provider, text, voice, speakerIndex, entry.take ?? 0);
    if (voiceFingerprint(req) === entry.hash) return null;
    if (req.provider === "elevenlabs") {
      if (entry.model && entry.model !== req.model) return `model changed (${entry.model} → ${req.model})`;
      if (entry.voiceId && entry.voiceId !== req.voiceId) return `voice changed (${entry.voiceId} → ${req.voiceId})`;
    }
    return `${entry.provider} voice settings changed`;
  }
  return entry.hash === lineHash(text, voice, entry.provider) ? null : `${entry.provider} voice settings changed`;
};

/** Split text into display words (keeps punctuation attached; performance tags are not words). */
export const splitWords = (text: string) => stripTags(text).split(/\s+/).filter(Boolean);

/** Rough timing for lines that have no generated audio yet. */
export const estimateWords = (text: string): { duration: number; words: Word[] } => {
  const words = splitWords(text);
  const per = 0.36;
  let t = 0.05;
  const out = words.map((w) => {
    const d = per * Math.min(2, Math.max(0.6, w.length / 5));
    const word = { text: w, start: t, end: t + d * 0.9 };
    t += d;
    return word;
  });
  return { duration: t + 0.25, words: out };
};

/** RMS envelope (0..1, peak-normalised) at `rate` Hz from mono PCM samples in [-1,1]. */
export const envelopeFromSamples = (samples: Float32Array, sampleRate: number, rate = 60): Envelope => {
  const hop = sampleRate / rate;
  const n = Math.ceil(samples.length / hop);
  const values: number[] = [];
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * hop);
    const b = Math.min(samples.length, Math.floor((i + 1) * hop));
    let s = 0;
    for (let j = a; j < b; j++) s += samples[j] * samples[j];
    const rms = Math.sqrt(s / Math.max(1, b - a));
    values.push(rms);
    peak = Math.max(peak, rms);
  }
  // Normalise, gate the noise floor, light 3-tap smoothing; keep 3 decimals to stay compact.
  const norm = values.map((v) => Math.max(0, (v / peak - 0.06) / 0.94));
  return {
    rate,
    values: norm.map((v, i) => Math.round(((norm[i - 1] ?? v) * 0.25 + v * 0.5 + (norm[i + 1] ?? v) * 0.25) * 1000) / 1000),
  };
};

export const sampleEnvelope = (env: Envelope, localT: number) => {
  const x = localT * env.rate;
  const i = Math.floor(x);
  if (i < 0 || i >= env.values.length) return 0;
  const a = env.values[i];
  const b = env.values[i + 1] ?? 0;
  return a + (b - a) * (x - i);
};

/**
 * Speech motion (engine 2): the mouth opens a hair before the sound (`lead`) and closes with a short exponential
 * release instead of snapping shut between syllables; `scale` is the line's loudness relative to the speaker's
 * loudest line, so quiet lines read smaller. Closed form in t (a max over a few past samples), no state.
 */
export const shapedTalk = (env: Envelope, localT: number, scale = 1, lead = 0.03, release = 0.07) => {
  const t = localT + lead;
  let v = sampleEnvelope(env, t);
  const step = 1 / env.rate;
  for (let j = 1; j * step <= release * 3; j++) v = Math.max(v, sampleEnvelope(env, t - j * step) * Math.exp(-(j * step) / release));
  return v * scale;
};

/** Slow speech energy for body motion (head, torso, hands, the mascot's whole body): a ±0.2 s average, peak ≈ 1. */
export const slowTalk = (env: Envelope, localT: number, scale = 1, half = 0.2) => {
  let sum = 0;
  const n = 9;
  for (let i = 0; i < n; i++) sum += sampleEnvelope(env, localT - half + (2 * half * i) / (n - 1));
  return Math.min(1, (sum / n) * 1.8) * scale;
};

/** Envelope synthesised from word timings, for lines without audio (keeps mouths moving in preview). */
export const envelopeFromWords = (words: Word[], duration: number, rate = 60): Envelope => {
  const values: number[] = [];
  for (let i = 0; i < Math.ceil(duration * rate); i++) {
    const t = i / rate;
    const w = words.find((x) => t >= x.start && t <= x.end);
    values.push(w ? Math.round(Math.sin(((t - w.start) / Math.max(0.05, w.end - w.start)) * Math.PI) * 800) / 1000 : 0);
  }
  return { rate, values };
};

/** Absolute-time captions (Remotion `Caption` format) for one line. */
export const lineCaptions = (words: Word[], lineStart: number): Caption[] =>
  words.map((w, i) => ({
    text: (i === 0 ? "" : " ") + w.text,
    startMs: Math.round((lineStart + w.start) * 1000),
    endMs: Math.round((lineStart + w.end) * 1000),
    timestampMs: Math.round((lineStart + (w.start + w.end) / 2) * 1000),
    confidence: null,
  }));

/** Character-level alignment (ElevenLabs `alignment`) → words. Characters inside `[tags]` are skipped. */
export const wordsFromAlignment = (a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] => {
  const words: Word[] = [];
  let cur: Word | null = null;
  let inTag = false;
  a.characters.forEach((ch, i) => {
    if (ch === "[") inTag = true;
    const skip = inTag;
    if (ch === "]") inTag = false;
    if (/\s/.test(ch) || skip) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    cur.text += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
};

/** Sound library by name → public-relative file (local CC0 kit) or URL (remote legacy). Details: SFX_INFO. */
export const SFX_LIBRARY: Record<string, string> = Object.fromEntries(Object.entries(SFX_INFO).map(([k, v]) => [k, v.file]));
