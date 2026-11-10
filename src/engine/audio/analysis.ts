// Clip analysis, edge trimming, levels and take validation for dialogue clips. Pure: the samples come
// from the caller (scripts/voice.ts decodes the WAV in Node); the resolver only reads the stored numbers.
//
//   analyzeClip    noise floor, energy segments (where there is sound, incl. breaths and sighs the word
//                  alignment doesn't cover), K-weighted loudness, peak, clipping, the tail level, tag spans, f0
//   autoTrim       head/tail in and out points that never cut into sound, a word or a performed tag
//   lineGain       the dB that brings a line to its speaker's level (a deliberate `gain` on top)
//   validateClip   tier-1 checks of a take (clipping, cut-off tail, nonverbal tags performed, words spoken)
import { splitWords, stripTags, TAG_RE, type Word } from "./speech";

export const ANALYSIS_VERSION = 1;

export type Span = [number, number];
/** A performance tag (`[sighs]`) placed in the clip: from ElevenLabs alignment, or between its neighbouring words. */
export type TagSpan = {
  tag: string;
  start: number;
  end: number;
  /** A sound of its own (sigh, laugh, breath…) rather than a delivery note ([cheerfully]). */
  nonverbal: boolean;
  source: "alignment" | "position";
  /** Extent of any energy inside the span (even soft, ≥ floor + 3 dB), or null when nothing sounds there. */
  energy: Span | null;
};

export type ClipAnalysis = {
  v: number;
  duration: number;
  /** dBFS: RMS of 10 ms frames, 10th percentile. */
  noiseFloor: number;
  /** dBFS sample peak, and how many samples hit full scale. */
  peak: number;
  clipped: number;
  /** Integrated loudness (ITU-R BS.1770, gated), LUFS. */
  loudness: number;
  /** Peak RMS of the 60 Hz mouth envelope before its normalisation (relative loudness for speech motion). */
  envPeak: number;
  /** Where there is sound (≥ floor + 6 dB and ≥ -60 dBFS), seconds. */
  segments: Span[];
  tags: TagSpan[];
  /** dBFS of the last 30 ms (a clip that ends mid-sound was cut off). */
  tail: number;
  /** Pitch of voiced frames (Hz), when there are enough of them. */
  f0: { median: number; p10: number; p90: number } | null;
  /** Speech-to-text validation, when a model was available. */
  stt?: { text: string; wer: number; model: string };
};

const NONVERBAL = /sigh|laugh|giggl|chuckl|gasp|breath|inhal|exhal|cough|throat|sniff|groan|yawn|scream|sob|cry|hum\b|snort|whistl|mumbl|grunt|pant/i;
export const isNonverbal = (tag: string) => NONVERBAL.test(tag);

const db = (x: number) => (x > 1e-10 ? 20 * Math.log10(x) : -200);
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const FRAME = 0.01;

/** RMS dBFS of consecutive 10 ms frames (floored at -100). */
export const frameLevels = (samples: Float32Array, sampleRate: number): number[] => {
  const hop = Math.round(sampleRate * FRAME);
  const out: number[] = [];
  for (let a = 0; a < samples.length; a += hop) {
    const b = Math.min(samples.length, a + hop);
    let s = 0;
    for (let i = a; i < b; i++) s += samples[i] * samples[i];
    out.push(Math.max(-100, db(Math.sqrt(s / Math.max(1, b - a)))));
  }
  return out;
};

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return -100;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
export const median = (xs: number[]) => {
  if (!xs.length) return -100;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Runs of frames at or above `thr` (gaps < 60 ms merged, runs < 20 ms dropped), in seconds. */
const runs = (levels: number[], thr: number, from = 0, to = levels.length): Span[] => {
  const out: Span[] = [];
  let start = -1;
  for (let i = from; i <= to; i++) {
    const loud = i < to && levels[i] >= thr;
    if (loud && start < 0) start = i;
    if (!loud && start >= 0) {
      const prev = out[out.length - 1];
      if (prev && start * FRAME - prev[1] < 0.06) prev[1] = i * FRAME;
      else out.push([start * FRAME, i * FRAME]);
      start = -1;
    }
  }
  return out.filter(([a, b]) => b - a >= 0.02 - 1e-9);
};

/** ITU-R BS.1770: K-weighting (pre-filter + RLB high-pass, any sample rate), 400 ms blocks, absolute + relative gates. */
export const integratedLoudness = (samples: Float32Array, sampleRate: number): number => {
  const biquad = (x: Float32Array, b: number[], a: number[]) => {
    const y = new Float32Array(x.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    return y;
  };
  let K = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  let Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const pre = biquad(samples, [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
  K = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const w = biquad(pre, [1, -2, 1], [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]);
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const ms: number[] = [];
  for (let a = 0; a < w.length; a += step) {
    const b = Math.min(w.length, a + block);
    let s = 0;
    for (let i = a; i < b; i++) s += w[i] * w[i];
    ms.push(s / Math.max(1, b - a));
    if (b === w.length) break;
  }
  const lufs = (m: number) => -0.691 + 10 * Math.log10(Math.max(1e-20, m));
  const abs = ms.filter((m) => lufs(m) > -70);
  if (!abs.length) return -70;
  const rel = lufs(abs.reduce((p, m) => p + m, 0) / abs.length) - 10;
  const gated = abs.filter((m) => lufs(m) > rel);
  return Math.round(lufs(gated.reduce((p, m) => p + m, 0) / gated.length) * 100) / 100;
};

/** Median/p10/p90 pitch (Hz) of loud, periodic 40 ms frames (normalised autocorrelation, 70–400 Hz). */
const pitch = (samples: Float32Array, sampleRate: number, levels: number[], thr: number) => {
  const win = Math.round(0.04 * sampleRate);
  const lo = Math.floor(sampleRate / 400);
  const hi = Math.ceil(sampleRate / 70);
  const f0s: number[] = [];
  for (let f = 0; f < levels.length; f += 2) {
    if (levels[f] < thr + 15) continue;
    const a = Math.round(f * FRAME * sampleRate);
    if (a + win + hi > samples.length) break;
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += samples[a + i] * samples[a + i];
    let best = 0;
    let lag = 0;
    for (let L = lo; L <= hi; L++) {
      let r = 0;
      let e1 = 0;
      for (let i = 0; i < win; i++) {
        r += samples[a + i] * samples[a + i + L];
        e1 += samples[a + i + L] * samples[a + i + L];
      }
      const n = r / Math.sqrt(e0 * e1 + 1e-12);
      if (n > best) [best, lag] = [n, L];
    }
    if (best > 0.6 && lag) f0s.push(sampleRate / lag);
  }
  if (f0s.length < 5) return null;
  return { median: Math.round(percentile(f0s, 0.5)), p10: Math.round(percentile(f0s, 0.1)), p90: Math.round(percentile(f0s, 0.9)) };
};

type Alignment = { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };

/** Character-level alignment → tag spans (the characters of `[sighs]` carry times in ElevenLabs alignment). */
export const tagsFromAlignment = (a: Alignment): { tag: string; start: number; end: number }[] => {
  const out: { tag: string; start: number; end: number }[] = [];
  let cur: { tag: string; start: number; end: number } | null = null;
  a.characters.forEach((ch, i) => {
    if (ch === "[") cur = { tag: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    if (!cur) return;
    cur.tag += ch;
    cur.end = a.character_end_times_seconds[i];
    if (ch === "]") {
      out.push(cur);
      cur = null;
    }
  });
  return out;
};

/** Tags in script order, with the index of the word each follows (-1 = before the first word). */
export const tagPositions = (text: string): { tag: string; after: number }[] => {
  const out: { tag: string; after: number }[] = [];
  const re = new RegExp(TAG_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push({ tag: m[0], after: splitWords(text.slice(0, m.index)).length - 1 });
  return out;
};

export type AnalyzeInput = {
  samples: Float32Array;
  sampleRate: number;
  text: string;
  words: Word[];
  /** Tag timings from the provider's alignment, when it gave any. */
  alignedTags?: { tag: string; start: number; end: number }[];
};

export const analyzeClip = ({ samples, sampleRate, text, words, alignedTags = [] }: AnalyzeInput): ClipAnalysis => {
  const duration = samples.length / sampleRate;
  const levels = frameLevels(samples, sampleRate);
  const noiseFloor = Math.round(percentile(levels, 0.1) * 10) / 10;
  const thr = Math.max(noiseFloor + 6, -60);
  let peakAbs = 0;
  let clipped = 0;
  for (const x of samples) {
    const v = Math.abs(x);
    if (v > peakAbs) peakAbs = v;
    if (v >= 0.999) clipped++;
  }
  // The same 60 Hz RMS frames the mouth envelope is normalised by (envelopeFromSamples).
  const hop = sampleRate / 60;
  let envPeak = 0;
  for (let i = 0; i * hop < samples.length; i++) {
    const a = Math.floor(i * hop);
    const b = Math.min(samples.length, Math.floor((i + 1) * hop));
    let s = 0;
    for (let j = a; j < b; j++) s += samples[j] * samples[j];
    envPeak = Math.max(envPeak, Math.sqrt(s / Math.max(1, b - a)));
  }
  const tailN = Math.min(samples.length, Math.round(0.03 * sampleRate));
  let tailS = 0;
  for (let i = samples.length - tailN; i < samples.length; i++) tailS += samples[i] * samples[i];

  // Tags: aligned times when they are real spans, else the gap between the neighbouring words.
  const tags: TagSpan[] = tagPositions(text).map((p, i) => {
    const al = alignedTags[i];
    const usable = !!al && al.end - al.start >= 0.05 && al.tag === p.tag;
    const start = usable ? al.start : p.after < 0 ? 0 : (words[p.after]?.end ?? 0);
    const end = Math.max(start, usable ? al.end : (words[p.after + 1]?.start ?? duration));
    const soft = runs(levels, Math.max(noiseFloor + 3, -66), Math.floor(start / FRAME), Math.min(levels.length, Math.ceil(end / FRAME)));
    const energy: Span | null = soft.length ? [round3(soft[0][0]), round3(soft[soft.length - 1][1])] : null;
    return { tag: p.tag, start: round3(start), end: round3(end), nonverbal: isNonverbal(p.tag), source: usable ? "alignment" : "position", energy };
  });

  return {
    v: ANALYSIS_VERSION,
    duration: round3(duration),
    noiseFloor,
    peak: Math.round(db(peakAbs) * 100) / 100,
    clipped,
    loudness: integratedLoudness(samples, sampleRate),
    envPeak: Math.round(envPeak * 1e5) / 1e5,
    segments: runs(levels, thr).map(([a, b]) => [round3(a), round3(b)] as Span),
    tags,
    tail: Math.round(Math.max(-100, db(Math.sqrt(tailS / Math.max(1, tailN)))) * 10) / 10,
    f0: pitch(samples, sampleRate, levels, thr),
  };
};

// ---------------------------------------------------------------- trimming

/** Edge cuts only past this much quiet (s); a cut keeps padding before the first and after the last sound. */
export const TRIM = { quiet: 0.12, padIn: 0.06, padOut: 0.2 };

export type Trim = { start: number; end: number; /** Protected things that reach past the detected sound (kept, reported). */ kept: string[] };

/**
 * Where a word really sounds: from its start to the end of the sound it belongs to. Alignment often stretches a
 * line's last word to the end of the file; that silence is not the word.
 */
const wordSpan = (a: ClipAnalysis, w: Word): Span => {
  const within = a.segments.filter(([s]) => s < w.end);
  const soundEnd = within.length ? within[within.length - 1][1] : w.end;
  return [w.start, Math.max(w.start + 0.05, Math.min(w.end, soundEnd))];
};

/** Everything a trim may not remove: sound, words and the energy of performed tags. */
const protectedSpans = (a: ClipAnalysis, words: Word[]) => [
  ...a.segments.map((s) => ({ span: s, what: "sound" })),
  ...words.map((w) => ({ span: wordSpan(a, w), what: `word "${w.text}"` })),
  ...a.tags.filter((t) => t.energy).map((t) => ({ span: t.energy!, what: `tag ${t.tag}` })),
];

/**
 * Head and tail in/out points (file seconds). Never removes sound, a word or a performed tag; pauses inside
 * the line are untouched; no cut where the quiet edge is 120 ms or less.
 */
export const autoTrim = (a: ClipAnalysis, words: Word[]): Trim => {
  const kept: string[] = [];
  const prot = protectedSpans(a, words);
  if (!prot.length) return { start: 0, end: a.duration, kept };
  const first = Math.min(...prot.map((p) => p.span[0]));
  const last = Math.max(...prot.map((p) => p.span[1]));
  const firstSound = a.segments.length ? a.segments[0][0] : Infinity;
  const lastSound = a.segments.length ? a.segments[a.segments.length - 1][1] : -Infinity;
  for (const p of prot) {
    if (p.what === "sound") continue;
    if (p.span[0] === first && first < firstSound - 0.01) kept.push(`${p.what} starts ${((firstSound - first) * 1000).toFixed(0)} ms before the detected sound`);
    if (p.span[1] === last && last > lastSound + 0.01) kept.push(`${p.what} ends ${((last - lastSound) * 1000).toFixed(0)} ms after the detected sound`);
  }
  const start = first > TRIM.quiet ? Math.max(0, first - TRIM.padIn) : 0;
  const end = a.duration - last > TRIM.quiet ? Math.min(a.duration, last + TRIM.padOut) : a.duration;
  return { start: round3(start), end: round3(end), kept };
};

/** Protected spans a trim window would cut into (always empty for `autoTrim`; a hand-set `trim` may not be). */
export const trimmedProtected = (a: ClipAnalysis, words: Word[], t: { start: number; end: number }) =>
  protectedSpans(a, words).filter(({ span: [s, e] }) => s < t.start - 1e-6 || e > t.end + 1e-6);

// ---------------------------------------------------------------- levels

/** dB that brings a line to `target` LUFS (at most -12/+6 dB), plus a deliberate `gain`; the peak stays ≤ -1 dBFS. */
export const lineGain = (a: ClipAnalysis, target: number, authored = 0) => {
  const auto = a.loudness > -69 ? Math.max(-12, Math.min(6, target - a.loudness)) : 0;
  return Math.round(Math.min(auto + authored, -1 - a.peak) * 100) / 100;
};

// ---------------------------------------------------------------- validation

/** Words for comparing a transcript with the script (lower case, no punctuation or tags). */
export const normWords = (text: string) =>
  stripTags(text)
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Word error rate of `heard` against `script` (word-level Levenshtein distance / script length). */
export const wordErrorRate = (script: string, heard: string) => {
  const r = normWords(script);
  const h = normWords(heard);
  if (!r.length) return h.length ? 1 : 0;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.round((prev[h.length] / r.length) * 1000) / 1000;
};

/** Speech-to-text passes at or below this word error rate (a small local model mishears a little). */
export const WER_PASS = 0.2;

export type Validation = { ok: boolean; problems: string[]; notes: string[] };

/** Tier 1 (technical): clipping, a cut-off tail, nonverbal tags actually performed, the words actually spoken. */
export const validateClip = (a: ClipAnalysis): Validation => {
  const problems: string[] = [];
  const notes: string[] = [];
  if (a.clipped > 8 || a.peak > -0.1) problems.push(`clipping (peak ${a.peak.toFixed(1)} dBFS, ${a.clipped} samples at full scale)`);
  if (a.tail > Math.max(a.noiseFloor + 20, -40)) problems.push(`cut off: the clip ends mid-sound (last 30 ms at ${a.tail.toFixed(0)} dBFS)`);
  for (const t of a.tags) if (t.nonverbal && !t.energy) problems.push(`${t.tag} not performed (no sound where it belongs, ${t.start.toFixed(2)}–${t.end.toFixed(2)} s)`);
  if (a.stt) {
    if (a.stt.wer > WER_PASS) problems.push(`speech-to-text heard "${a.stt.text}" (word error ${(a.stt.wer * 100).toFixed(0)} %)`);
  } else notes.push("words not verified (no speech-to-text model)");
  return { ok: problems.length === 0, problems, notes };
};
