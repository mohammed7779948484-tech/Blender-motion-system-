// Takes and voice findings, from a resolved episode and its voice manifest. Pure.
//
// Three separate tiers, never blended into one score:
//   1. technical validation (pass/fail): clipping, cut-off tail, nonverbal tags performed, speech-to-text words
//   2. description (facts): duration and fit to its slot, pace, pauses, loudness, peak, pitch range
//   3. the artistic choice: the director auditions; an agent pick is labelled "measured, not heard"
import type { ResolvedEpisode } from "../core/timeline";
import { autoTrim, validateClip, type Validation } from "./analysis";
import { takeKey, type VoiceLine, type VoiceManifest } from "./speech";

export type TakeFacts = {
  take: number;
  duration: number;
  /** Duration after the automatic edge trim. */
  trimmed: number;
  wordsPerSecond: number;
  pauses: number;
  loudness: number;
  peak: number;
  /** Pitch: median Hz and the p10–p90 range in semitones. */
  pitch: string;
  validation: Validation;
};

export type LineTakes = {
  id: string;
  speaker: string;
  text: string;
  /** Seconds until the next line starts when that line is pinned (`at`), else undefined. */
  slot?: number;
  takes: TakeFacts[];
  selected: number;
  choice?: { by: "director" | "agent"; why: string };
};

const facts = (take: number, e: VoiceLine): TakeFacts | null => {
  const a = e.analysis;
  if (!a) return null;
  const t = autoTrim(a, e.words);
  const pauses = e.words.slice(1).filter((w, i) => w.start - e.words[i].end >= 0.3).length;
  const speech = e.words.length ? e.words[e.words.length - 1].end - e.words[0].start : 0;
  return {
    take,
    duration: a.duration,
    trimmed: Math.round((t.end - t.start) * 100) / 100,
    wordsPerSecond: speech > 0 ? Math.round((e.words.length / speech) * 10) / 10 : 0,
    pauses,
    loudness: a.loudness,
    peak: a.peak,
    pitch: a.f0 ? `${a.f0.median} Hz, ${(12 * Math.log2(a.f0.p90 / a.f0.p10)).toFixed(1)} st` : "—",
    validation: validateClip(a),
  };
};

/** Every line's generated takes with their facts (lines with analysis only). */
/**
 * `pinned(next, line)`: whether the next line's start is independent of this line (an absolute `at`, or a time
 * ref to another line) — only then is the time until it a slot this take must fit.
 */
export const lineTakes = (r: ResolvedEpisode, manifest: VoiceManifest, pinned: (next: string, line: string) => boolean = () => false): LineTakes[] =>
  r.lines.flatMap((l, i) => {
    const takes: TakeFacts[] = [];
    for (let k = 0; ; k++) {
      const e = manifest.lines[takeKey(l.id, k)];
      if (!e) {
        if (k > 0) break;
        continue;
      }
      const f = facts(k, e);
      if (f) takes.push(f);
      if (k > 32) break;
    }
    if (!takes.length) return [];
    const next = r.lines[i + 1];
    return [{ id: l.id, speaker: l.speaker, text: l.text, slot: next && pinned(next.id, l.id) ? Math.round((next.start - l.start) * 100) / 100 : undefined, takes, selected: l.take ?? 0, choice: l.takeChoice }];
  });

/**
 * A measured pick among the valid takes (for lines the director didn't audition): the one that fits its slot
 * (or keeps closest to take 0's length) and was heard most accurately. Says why; never claims it sounds better.
 */
export const measuredPick = (lt: LineTakes): { take: number; why: string } | null => {
  const valid = lt.takes.filter((t) => t.validation.ok);
  if (!valid.length) return null;
  const ref = lt.slot ?? lt.takes[0].trimmed;
  const best = [...valid].sort((a, b) => Math.abs(a.trimmed - ref) - Math.abs(b.trimmed - ref) || a.take - b.take)[0];
  const fit = lt.slot !== undefined ? `fits the ${lt.slot.toFixed(2)} s slot best (${best.trimmed.toFixed(2)} s)` : `closest to the original length (${best.trimmed.toFixed(2)} s)`;
  return { take: best.take, why: `measured, not heard: passes validation, ${fit}` };
};

/** Findings for `validate`: problems of the takes that play, and multi-take lines without a recorded choice. */
export const voiceFindings = (r: ResolvedEpisode, manifest: VoiceManifest | null): { warnings: string[]; notes: string[] } => {
  const warnings: string[] = [];
  const notes: string[] = [];
  if (!manifest) return { warnings, notes };
  const playing = r.lines.filter((l) => l.voiced).map((l) => ({ l, e: manifest.lines[takeKey(l.id, l.take ?? 0)] }));
  const measured = playing.filter((p) => p.e?.analysis);
  if (r.behaviour.engine >= 2 && measured.length < playing.length)
    notes.push(`${playing.length - measured.length} voice clip(s) have no analysis (trim, levels and speech motion skip them) — run \`npm run cli -- voice ${r.id}\` (free, no new audio)`);
  let unverified = 0;
  for (const { l, e } of measured) {
    const v = validateClip(e.analysis!);
    for (const p of v.problems) warnings.push(`line ${l.id}${l.take ? ` (take ${l.take})` : ""}: ${p}`);
    if (!e.analysis!.stt) unverified++;
  }
  if (unverified) notes.push(`${unverified} line(s) not checked by speech-to-text yet — the words spoken are unverified (needs the local whisper model; then run npm run cli -- voice ${r.id})`);
  for (const l of r.lines) {
    const n = Object.keys(manifest.lines).filter((k) => k === l.id || k.startsWith(`${l.id}#`)).length;
    if (n > 1 && !l.takeChoice) notes.push(`line ${l.id} has ${n} takes and no recorded choice — \`voice ${r.id} --audition ${l.id}\`, then \`"take": { "n": …, "by": "director" | "agent", "why": "…" }\``);
  }
  return { warnings, notes };
};
