// Generates (or refreshes) the cached dialogue audio for a video:
//   public/videos/<slug>/voice/<line>-<hash>.wav  +  public/videos/<slug>/voice.json
// Providers: "elevenlabs" (API, needs ELEVENLABS_API_KEY), "system" (offline Windows voices),
// "fixture" (deterministic synthetic babble; any OS; used by tests). Unchanged lines are skipped.
// Every clip is analysed (energy, loudness, tags; cached clips are backfilled for free) and, when a local
// whisper model exists, checked by speech-to-text. `takes` adds alternative takes stored as `<id>#<n>`.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyzeClip, ANALYSIS_VERSION, tagsFromAlignment, wordErrorRate } from "../src/engine/audio/analysis";
import { parseEpisode, type Episode, type EpisodeVoice } from "../src/engine/core/schema";
import { sttModelName, sttUnavailable, transcribe } from "./stt";
import {
  DEFAULT_ELEVEN_VOICES,
  ELEVEN_STITCH_MODELS,
  stripTags,
  envelopeFromSamples,
  hashString,
  splitWords,
  takeKey,
  takeSeed,
  VOICE_PROVIDERS,
  voiceFingerprint,
  voiceRequest,
  voiceStaleReason,
  wordsFromAlignment,
  type VoiceLine,
  type VoiceManifest,
  type VoiceProvider,
  type VoiceRequest,
  type Word,
} from "../src/engine/audio/speech";

export type Provider = VoiceProvider;

// ---------------------------------------------------------------- WAV helpers

export const readWav = (buf: Buffer): { sampleRate: number; samples: Float32Array } => {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let off = 12;
  let fmt: { channels: number; sampleRate: number; bits: number; format: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") {
      if (!fmt) throw new Error("WAV data before fmt chunk");
      if (size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8; // streamed WAVs
      const data = buf.subarray(off + 8, off + 8 + size);
      const bytes = fmt.bits / 8;
      const frames = Math.floor(data.length / (bytes * fmt.channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let acc = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const p = (i * fmt.channels + c) * bytes;
          acc += fmt.bits === 16 ? data.readInt16LE(p) / 32768 : fmt.format === 3 ? data.readFloatLE(p) : (data[p] - 128) / 128;
        }
        samples[i] = acc / fmt.channels;
      }
      return { sampleRate: fmt.sampleRate, samples };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
};

export const writeWav = (samples: Float32Array, sampleRate: number): Buffer => {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};

/** Raw PCM16 (as returned by some APIs) → WAV. */
const pcmToWav = (pcm: Buffer, sampleRate: number) => {
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return writeWav(samples, sampleRate);
};

// ---------------------------------------------------------------- providers

type Clip = { wav: Buffer; words: Word[]; /** Tag timings from the provider's alignment. */ tags?: { tag: string; start: number; end: number }[] };
export type LineJob = { id: string; text: string; voice: EpisodeVoice | undefined; speakerIndex: number; previous?: string; next?: string; /** Alternative take (0 = the original seed). */ take?: number };

export { DEFAULT_ELEVEN_VOICES };

/** Thrown for ElevenLabs HTTP errors; carries only status + API error code (never request headers). */
export class ElevenLabsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(`ElevenLabs ${status}${code ? ` ${code}` : ""}: ${detail}`);
  }
}

const elevenError = async (res: Response, what: string) => {
  const body = await res.text();
  let code = "";
  let message = body.slice(0, 300);
  try {
    const j = JSON.parse(body) as { detail?: { status?: string; code?: string; message?: string } | string };
    if (typeof j.detail === "object" && j.detail) {
      code = j.detail.status ?? j.detail.code ?? "";
      message = (j.detail.message ?? message).slice(0, 300);
    } else if (typeof j.detail === "string") message = j.detail.slice(0, 300);
  } catch {
    /* not JSON */
  }
  return new ElevenLabsError(res.status, code, `${what}: ${message}`);
};

export const elevenLabsRequest = (job: LineJob, apiKey: string) => {
  const req = voiceRequest("elevenlabs", job.text, job.voice, job.speakerIndex, job.take ?? 0) as Extract<VoiceRequest, { provider: "elevenlabs" }>;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${req.voiceId}/with-timestamps?output_format=${req.format}`;
  const body = {
    text: req.text,
    model_id: req.model,
    voice_settings: req.settings,
    seed: takeSeed(job.text, job.take ?? 0),
    ...(ELEVEN_STITCH_MODELS.includes(req.model) ? { previous_text: job.previous && stripTags(job.previous), next_text: job.next && stripTags(job.next) } : {}),
  };
  return { url, req, init: { method: "POST", headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) } };
};

export const elevenLabsClip = async (job: LineJob, apiKey: string, fetchImpl: typeof fetch = fetch, saveResponse?: string): Promise<Clip> => {
  const { url, init, req } = elevenLabsRequest(job, apiKey);
  const res = await fetchImpl(url, init);
  if (!res.ok) throw await elevenError(res, `text-to-speech (${job.id})`);
  const json = (await res.json()) as { audio_base64: string; alignment?: Parameters<typeof wordsFromAlignment>[0] | null; normalized_alignment?: Parameters<typeof wordsFromAlignment>[0] | null };
  const raw = Buffer.from(json.audio_base64, "base64");
  if (saveResponse) {
    // Debug/fixture capture: response shape with the audio reduced to its header (no request headers, no key).
    fs.mkdirSync(saveResponse, { recursive: true });
    const { audio_base64: _a, ...rest } = json;
    fs.writeFileSync(path.join(saveResponse, `${job.id}.json`), JSON.stringify({ request: { model: req.model, format: req.format, text: req.text, settings: req.settings }, audio: { bytes: raw.length, header_base64: raw.subarray(0, 44).toString("base64") }, ...rest }, null, 1));
  }
  const wav = raw.toString("ascii", 0, 4) === "RIFF" ? raw : pcmToWav(raw, 24000);
  const alignment = json.alignment ?? json.normalized_alignment;
  return { wav, words: alignment ? wordsFromAlignment(alignment) : [], tags: alignment ? tagsFromAlignment(alignment) : [] };
};

export type ElevenLabsAccount = {
  tier: string;
  /** Credits used / available this period (null when the key may not read the subscription). */
  used: number | null;
  limit: number | null;
  models: { id: string; tts: boolean; maxChars?: number }[];
  voices: { id: string; name: string; category: string; labels: Record<string, string> }[];
  notes: string[];
};

/** Plan tier and credit usage (free call); null when the key can't read the subscription. */
export const elevenLabsUsage = async (apiKey: string, fetchImpl: typeof fetch = fetch): Promise<{ tier: string; used: number; limit: number } | null> => {
  try {
    const res = await fetchImpl("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": apiKey, Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { tier?: unknown; character_count?: unknown; character_limit?: unknown };
    if (typeof j.tier !== "string" || typeof j.character_count !== "number" || typeof j.character_limit !== "number") return null;
    return { tier: j.tier, used: j.character_count, limit: j.character_limit };
  } catch {
    return null;
  }
};

/** Free (no credits): which models, plan and voices this key can use. Never logs the key. */
export const elevenLabsAccount = async (apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ElevenLabsAccount> => {
  const get = (p: string) => fetchImpl(`https://api.elevenlabs.io${p}`, { headers: { "xi-api-key": apiKey, Accept: "application/json" } });
  const notes: string[] = [];
  const out: ElevenLabsAccount = { tier: "unknown", used: null, limit: null, models: [], voices: [], notes };

  const sub = await get("/v1/user/subscription");
  if (sub.ok) {
    const j = (await sub.json()) as { tier?: string; character_count?: number; character_limit?: number };
    out.tier = j.tier ?? "unknown";
    out.used = j.character_count ?? null;
    out.limit = j.character_limit ?? null;
  } else {
    const err = await elevenError(sub, "subscription");
    if (err.status === 401 && err.code !== "missing_permissions") throw err; // invalid key: a real blocker
    notes.push(`subscription not readable (${err.status} ${err.code || ""}: ${err.message.replace(/^.*?: /, "").slice(0, 120)}); tier unknown`);
  }

  const models = await get("/v1/models");
  if (models.ok) {
    for (const m of (await models.json()) as { model_id: string; can_do_text_to_speech?: boolean; maximum_text_length_per_request?: number }[])
      out.models.push({ id: m.model_id, tts: m.can_do_text_to_speech !== false, maxChars: m.maximum_text_length_per_request });
  } else {
    const err = await elevenError(models, "models");
    if (err.status === 401 && err.code !== "missing_permissions") throw err;
    notes.push(`models not readable (${err.status} ${err.code || ""}: ${err.message.replace(/^.*?: /, "").slice(0, 120)})`);
  }

  const voices = await get("/v2/voices?page_size=100");
  if (voices.ok) {
    const j = (await voices.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[] };
    for (const v of j.voices ?? []) out.voices.push({ id: v.voice_id, name: v.name, category: v.category ?? "", labels: v.labels ?? {} });
  } else {
    const err = await elevenError(voices, "voices");
    notes.push(`voices not readable (${err.status} ${err.code || ""}: ${err.message.replace(/^.*?: /, "").slice(0, 120)})`);
  }
  return out;
};

export const elevenLabsSfx = async (prompt: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> => {
  const res = await fetchImpl("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt, prompt_influence: 0.4 }),
  });
  if (!res.ok) throw await elevenError(res, "sound-generation");
  return Buffer.from(await res.arrayBuffer());
};

const SAPI_SCRIPT = `
param([string]$JobFile)
$job = Get-Content -Raw -Encoding UTF8 $JobFile | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice($job.voice)
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($job.out, $fmt)
$words = New-Object System.Collections.ArrayList
$s.add_SpeakProgress({ param($sender, $e) [void]$words.Add(@{ text = $e.Text; ms = $e.AudioPosition.TotalMilliseconds }) })
$s.SpeakSsml($job.ssml)
$s.SetOutputToNull()
$s.Dispose()
ConvertTo-Json -Compress -InputObject @($words)
`;

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const systemClip = (job: LineJob, tmpDir: string): Clip => {
  if (process.platform !== "win32") throw new Error("system voices need Windows (use --provider fixture or elevenlabs)");
  const { voice, rate, pitch, text } = voiceRequest("system", job.text, job.voice, job.speakerIndex, job.take ?? 0) as Extract<VoiceRequest, { provider: "system" }>;
  const prosody = `<prosody rate="${rate >= 0 ? "+" : ""}${rate * 6}%"${pitch ? ` pitch="${xml(pitch)}"` : ""}>${xml(text)}</prosody>`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${prosody}</speak>`;
  const out = path.join(tmpDir, `sapi-${hashString(`${job.id}${job.text}#${job.take ?? 0}`)}.wav`);
  const scriptFile = path.join(tmpDir, "sapi.ps1");
  const jobFile = path.join(tmpDir, `job-${job.id}.json`);
  fs.writeFileSync(scriptFile, SAPI_SCRIPT);
  fs.writeFileSync(jobFile, JSON.stringify({ voice, ssml, out }));
  const stdout = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile, "-JobFile", jobFile], { encoding: "utf8" });
  const wav = fs.readFileSync(out);
  const { samples, sampleRate } = readWav(wav);
  // SAPI reports AudioPosition assuming 16 kHz; we render at 16 kHz so it maps 1:1.
  const starts = (JSON.parse(stdout.trim() || "[]") as { text: string; ms: number }[]).map((w) => ({ text: w.text, start: (w.ms / 1000) * (16000 / sampleRate) }));
  return { wav, words: endsFromEnergy(starts, samples, sampleRate, splitWords(job.text)) };
};

/** Word end = where speech energy drops before the next word (or the clip end). Uses the script's words for display text. */
const endsFromEnergy = (starts: { text: string; start: number }[], samples: Float32Array, sampleRate: number, display: string[]): Word[] => {
  const env = envelopeFromSamples(samples, sampleRate, 100);
  const duration = samples.length / sampleRate;
  const lastLoud = (() => {
    for (let i = env.values.length - 1; i >= 0; i--) if (env.values[i] > 0.05) return i / 100;
    return duration;
  })();
  return starts.map((w, i) => {
    const next = starts[i + 1]?.start ?? lastLoud + 0.05;
    let end = next - 0.02;
    for (let t = next - 0.02; t > w.start + 0.08; t -= 0.01) {
      if ((env.values[Math.round(t * 100)] ?? 0) > 0.08) {
        end = Math.min(next - 0.02, t + 0.04);
        break;
      }
    }
    return { text: display[i] ?? w.text, start: w.start, end: Math.max(w.start + 0.06, end) };
  });
};

/** Deterministic babble: syllable bursts with a speaker-specific pitch. Any OS, no network. */
export const fixtureClip = (job: LineJob): Clip => {
  const sr = 16000;
  const words = splitWords(job.text);
  const f0 = 105 + (job.speakerIndex % 3) * 55;
  const chunks: number[] = [];
  const out: Word[] = [];
  let t = 0.08;
  const pushSilence = (sec: number) => {
    for (let i = 0; i < Math.round(sec * sr); i++) chunks.push(0);
  };
  pushSilence(0.08);
  words.forEach((w, wi) => {
    const start = t;
    const syllables = Math.max(1, Math.round(w.replace(/[^a-z]/gi, "").length / 3));
    for (let s = 0; s < syllables; s++) {
      const seed = job.take ? `${job.text}#${job.take}` : job.text;
      const len = 0.11 + (parseInt(hashString(`${seed}|${wi}|${s}`).slice(0, 2), 16) / 255) * 0.08;
      const n = Math.round(len * sr);
      const pitch = f0 * (1 + 0.12 * Math.sin(wi * 1.7 + s));
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        const amp = Math.sin((i / n) * Math.PI) ** 0.7 * 0.35;
        chunks.push(amp * (Math.sin(2 * Math.PI * pitch * x) * 0.6 + Math.sin(2 * Math.PI * pitch * 2.02 * x) * 0.25 + Math.sin(2 * Math.PI * pitch * 3.1 * x) * 0.15));
      }
      t += len;
    }
    out.push({ text: w, start, end: t });
    const gap = /[.!?]$/.test(w) ? 0.28 : /[,;:]$/.test(w) ? 0.16 : 0.06;
    pushSilence(gap);
    t += gap;
  });
  pushSilence(0.12);
  return { wav: writeWav(Float32Array.from(chunks), sr), words: out };
};

// ---------------------------------------------------------------- orchestration

export type VoiceOptions = {
  provider?: Provider;
  force?: boolean;
  /** Repo root (tests point this at a temp copy). */
  root?: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  /** ElevenLabs plan tier recorded as clip provenance (from `voice --check`). */
  tier?: string;
  /** Save each ElevenLabs response (audio reduced to its header) here, e.g. for test fixtures. */
  saveResponse?: string;
  /** Alternative takes per line id (total count incl. take 0), e.g. { l3: 3 }. */
  takes?: Record<string, number>;
  /** Refuse a paid run that would use more credits (≈ characters, tags included). */
  maxCredits?: number;
  /** Speech-to-text validation when a local model exists (default true). */
  stt?: boolean;
  /** Re-analyse every clip (analysis is otherwise computed once and backfilled when missing). */
  analyze?: boolean;
  log?: (msg: string) => void;
};

/** Offline default for this machine. */
const localProvider = (): Provider => (process.platform === "win32" ? "system" : "fixture");

export const parseProvider = (value: string | undefined): Provider | undefined => {
  if (value === undefined) return undefined;
  if (!(VOICE_PROVIDERS as string[]).includes(value)) throw new Error(`unknown provider "${value}" (use ${VOICE_PROVIDERS.join(", ")})`);
  return value as Provider;
};

/**
 * Sticky provider choice. Paid ElevenLabs generation only happens when asked for explicitly
 * (`--provider elevenlabs`): a key in .env alone never switches an episode to paid voices. Without a
 * flag an episode keeps the provider its manifest already uses (a paid manifest still needs the flag
 * before buying new lines — see generateVoices), else the local offline voice.
 */
export const pickProvider = (opts: VoiceOptions, manifest: VoiceManifest | null = null): Provider => {
  if (opts.provider) return parseProvider(opts.provider)!;
  const used = Object.values(manifest?.lines ?? {}).map((l) => l.provider);
  if (!used.length) return localProvider();
  const counts = new Map<Provider, number>();
  for (const p of used) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

export const loadEpisodeFile = (root: string, slug: string): Episode => {
  const file = path.join(root, "videos", slug, "episode.json");
  if (!fs.existsSync(file)) throw new Error(`No episode at ${file}`);
  return parseEpisode(JSON.parse(fs.readFileSync(file, "utf8")));
};

export const voiceDir = (root: string, slug: string) => path.join(root, "public", "videos", slug);

export const readManifest = (root: string, slug: string): VoiceManifest | null => {
  const file = path.join(voiceDir(root, slug), "voice.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as VoiceManifest) : null;
};

const writeManifest = (dir: string, manifest: VoiceManifest) => {
  const file = path.join(dir, "voice.json");
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(manifest));
  fs.renameSync(`${file}.tmp`, file);
};

export const generateVoices = async (slug: string, opts: VoiceOptions = {}) => {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? console.log;
  const ep = loadEpisodeFile(root, slug);
  const old = readManifest(root, slug);
  const provider = pickProvider(opts, old);
  const explicit = opts.provider !== undefined;
  const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY ?? "";
  const dir = voiceDir(root, slug);
  fs.mkdirSync(path.join(dir, "voice"), { recursive: true });
  const speakers = Object.keys(ep.cast);
  const speakerIndex = (id: string) => Math.max(0, speakers.indexOf(id));
  for (const id of Object.keys(opts.takes ?? {})) if (!ep.dialogue.some((l) => l.id === id)) throw new Error(`--takes: no line "${id}" in ${slug}`);

  // Every (line, take) the episode needs: take 0, the requested alternative takes, and the selected take.
  const jobs = ep.dialogue.flatMap((line, i) => {
    const selected = typeof line.take === "number" ? line.take : (line.take?.n ?? 0);
    const n = Math.max(1, opts.takes?.[line.id] ?? 0, selected + 1);
    return Array.from({ length: n }, (_, take) => ({ line, i, take, key: takeKey(line.id, take) }));
  });
  // Which need audio? Fresh = same provider, file present, unchanged effective request.
  const todo = new Set(
    jobs
      .filter(({ line, key }) => {
        const prev = old?.lines[key];
        if (opts.force || !prev || prev.provider !== provider) return true;
        if (!fs.existsSync(path.join(root, "public", prev.file))) return true;
        return voiceStaleReason(prev, line.text, ep.cast[line.speaker]?.voice, speakerIndex(line.speaker)) !== null;
      })
      .map((j) => j.key),
  );
  if (provider === "elevenlabs" && todo.size) {
    if (!explicit) throw new Error(`${todo.size} clip(s) need new ElevenLabs audio. Paid generation needs an explicit flag: re-run with --provider elevenlabs. (--provider system re-voices ALL lines offline and discards the existing paid clips.)`);
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (put it in .env)");
    const chars = jobs.filter((j) => todo.has(j.key)).reduce((n, j) => n + j.line.text.length, 0);
    log(`  elevenlabs: ${todo.size} clip(s), ${chars} characters ≈ ${chars} credits to generate`);
    if (opts.maxCredits !== undefined && chars > opts.maxCredits) throw new Error(`this run would use about ${chars} credits, over --max-credits ${opts.maxCredits}: nothing was generated`);
  }
  const before = provider === "elevenlabs" && todo.size ? await elevenLabsUsage(apiKey, opts.fetchImpl) : null;
  if (before) log(`  plan: ${before.tier}, ${before.used}/${before.limit} credits used before this run`);
  const tier = opts.tier ?? before?.tier ?? "unknown";

  // Start from the old manifest so an interrupted run never forgets clips it already paid for.
  const manifest: VoiceManifest = { version: 1, lines: { ...(old?.lines ?? {}) } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "voice-"));
  let stats = { analysed: 0, transcribed: 0, stt: "" };
  let generated = 0;
  try {
    for (const { line, i, take, key } of jobs) {
      if (!todo.has(key)) continue;
      const voice = ep.cast[line.speaker]?.voice;
      const job: LineJob = { id: line.id, text: line.text, voice, speakerIndex: speakerIndex(line.speaker), previous: ep.dialogue[i - 1]?.text, next: ep.dialogue[i + 1]?.text, take };
      const req = voiceRequest(provider, line.text, voice, job.speakerIndex, take);
      const hash = voiceFingerprint(req);
      log(`  ${provider}: ${key} (${line.speaker}) "${line.text.slice(0, 60)}"`);
      const clip = provider === "elevenlabs" ? await elevenLabsClip(job, apiKey, opts.fetchImpl, opts.saveResponse) : provider === "system" ? systemClip(job, tmp) : fixtureClip(job);
      const { samples, sampleRate } = readWav(clip.wav);
      const file = `videos/${slug}/voice/${key.replace("#", "-t")}-${hash}.wav`;
      fs.writeFileSync(path.join(root, "public", file), clip.wav);
      const duration = samples.length / sampleRate;
      const words = clip.words.length ? clip.words : evenWords(line.text, duration);
      const prev = manifest.lines[key];
      const entry: VoiceLine = { file, hash, scheme: 2, provider, text: line.text, duration, words, envelope: envelopeFromSamples(samples, sampleRate, 60), generatedAt: new Date().toISOString() };
      if (req.provider === "elevenlabs") Object.assign(entry, { model: req.model, voiceId: req.voiceId, format: req.format, tier });
      if (take > 0) entry.take = take;
      entry.analysis = analyzeClip({ samples, sampleRate, text: line.text, words, alignedTags: clip.tags });
      manifest.lines[key] = entry;
      writeManifest(dir, manifest); // after every clip: a later failure keeps this one
      if (prev && prev.file !== file) fs.rmSync(path.join(root, "public", prev.file), { force: true });
      generated++;
    }

    // Analysis for cached clips (free: no new audio), then speech-to-text where it hasn't run yet.
    let analysed = 0;
    for (const [key, e] of Object.entries(manifest.lines)) {
      if (!opts.analyze && e.analysis?.v === ANALYSIS_VERSION) continue;
      const wavPath = path.join(root, "public", e.file);
      if (!fs.existsSync(wavPath)) continue;
      const { samples, sampleRate } = readWav(fs.readFileSync(wavPath));
      const stt = e.analysis?.stt;
      e.analysis = { ...analyzeClip({ samples, sampleRate, text: e.text, words: e.words }), ...(stt ? { stt } : {}) };
      analysed++;
      log(`  analysed ${key}`);
    }
    let transcribed = 0;
    const why = opts.stt === false ? "skipped (--no-stt)" : sttUnavailable();
    if (!why) {
      for (const [key, e] of Object.entries(manifest.lines)) {
        if (!e.analysis || e.analysis.stt) continue;
        const heard = transcribe(path.join(root, "public", e.file));
        if (heard === null) break;
        e.analysis.stt = { text: heard, wer: wordErrorRate(e.text, heard), model: sttModelName() };
        transcribed++;
        log(`  speech-to-text ${key}: "${heard}" (word error ${(e.analysis.stt.wer * 100).toFixed(0)} %)`);
      }
    }
    const sttNote = why ?? sttUnavailable();
    if (sttNote) log(`  speech-to-text: ${sttNote} — words not verified`);
    if (analysed || transcribed) writeManifest(dir, manifest);
    stats = { analysed, transcribed, stt: sttNote ?? `ok (${sttModelName()})` };

    // Generated sound effects (sfx entries with a `prompt`), cached next to the voices.
    for (const s of ep.sfx) {
      if (!s.prompt) continue;
      const target = path.join(dir, s.sound.replace(/^videos\/[^/]+\//, ""));
      if (fs.existsSync(target) && !opts.force) continue;
      if (provider !== "elevenlabs") {
        log(`  ! sfx "${s.sound}" needs ElevenLabs to generate (prompt: ${s.prompt}); add the file manually or set a key`);
        continue;
      }
      if (!explicit) throw new Error(`sfx "${s.sound}" needs paid ElevenLabs generation: re-run with --provider elevenlabs`);
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (put it in .env)");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await elevenLabsSfx(s.prompt, apiKey, opts.fetchImpl));
      log(`  sfx: ${s.sound}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (before && generated) {
      const after = await elevenLabsUsage(apiKey, opts.fetchImpl);
      // The account counter can lag a few seconds (v4 measured at 1 credit per character, tags included).
      if (after) log(`  credits used so far this period: ${after.used}/${after.limit}${after.used === before.used ? " (counter not updated yet — expect about 1 credit per character; check `voice --check` later)" : ` (this run: ${after.used - before.used})`}`);
    }
  }

  // Forget lines that no longer exist (with their takes; takes of living lines are kept: they were paid for),
  // then drop clips nothing references.
  const ids = new Set(ep.dialogue.map((l) => l.id));
  for (const key of Object.keys(manifest.lines)) if (!ids.has(key.split("#")[0])) delete manifest.lines[key];
  writeManifest(dir, manifest);
  for (const f of fs.readdirSync(path.join(dir, "voice"))) {
    const keep = Object.values(manifest.lines).some((l) => l.file.endsWith(`/${f}`));
    if (!keep) fs.rmSync(path.join(dir, "voice", f), { force: true });
  }
  return { provider, generated, skipped: jobs.length - generated, ...stats, manifest };
};

const evenWords = (text: string, duration: number): Word[] => {
  const words = splitWords(text);
  const per = (duration - 0.2) / Math.max(1, words.length);
  return words.map((w, i) => ({ text: w, start: 0.1 + i * per, end: 0.1 + (i + 0.85) * per }));
};

