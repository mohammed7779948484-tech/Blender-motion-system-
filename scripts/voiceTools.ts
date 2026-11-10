// Looking at and listening to voice clips without guessing (Node, ffmpeg for PNG + labels):
//   showLine     waveform strip of one line/take: words, tags (and the energy inside them), sound segments,
//                the noise floor and the automatic trim points → out/<slug>/voice-<line>.png
//   auditionLine every take of a line in one WAV, each announced by n short beeps (take n-1)
//   reportTakes  tiers 1–2 for every line and take, plus the measured pick for lines nobody auditioned
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { autoTrim, frameLevels } from "../src/engine/audio/analysis";
import { takeKey, type VoiceManifest } from "../src/engine/audio/speech";
import { lineTakes, measuredPick } from "../src/engine/audio/voiceReport";
import type { ResolvedEpisode } from "../src/engine/core/timeline";
import { readWav, writeWav } from "./voice";

const FONT = ["C:/Windows/Fonts/arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
const clean = (s: string) => s.replace(/[:'\\%,;[\]=]/g, " ").trim();

type RGB = [number, number, number];

export const showLine = (root: string, slug: string, manifest: VoiceManifest, id: string, take = 0): string => {
  const e = manifest.lines[takeKey(id, take)];
  if (!e) throw new Error(`no clip for ${takeKey(id, take)} (run voice ${slug} first)`);
  const a = e.analysis;
  if (!a) throw new Error(`${takeKey(id, take)} has no analysis yet: run \`npm run cli -- voice ${slug}\` (free)`);
  const { samples, sampleRate } = readWav(fs.readFileSync(path.join(root, "public", e.file)));
  const levels = frameLevels(samples, sampleRate);
  const W = Math.max(900, Math.min(3600, Math.round(a.duration * 320)));
  const H = 320;
  const px = Buffer.alloc(W * H * 3, 0);
  const put = (x: number, y: number, c: RGB, alpha = 1) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - alpha) + c[k] * alpha);
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB, alpha = 1) => {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) for (let y = Math.floor(y0); y < Math.ceil(y1); y++) put(x, y, c, alpha);
  };
  const X = (t: number) => (t / a.duration) * W;
  rect(0, 0, W, H, [18, 18, 22]);
  // Lanes: waveform 24–204, words 212–240, tags 246–272, sound 278–296.
  const mid = 114;
  const amp = 88;
  const trim = autoTrim(a, e.words);
  for (const s of a.segments) rect(X(s[0]), 24, X(s[1]), 204, [40, 70, 50]);
  let peak = 1e-6;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  const per = samples.length / W;
  for (let x = 0; x < W; x++) {
    let lo = 0;
    let hi = 0;
    for (let i = Math.floor(x * per); i < Math.min(samples.length, Math.floor((x + 1) * per)); i++) {
      lo = Math.min(lo, samples[i]);
      hi = Math.max(hi, samples[i]);
    }
    const loud = (levels[Math.floor((x / W) * levels.length)] ?? -100) > a.noiseFloor + 6;
    for (let y = mid - (hi / peak) * amp; y <= mid - (lo / peak) * amp; y++) put(x, y, loud ? [150, 230, 170] : [110, 110, 120]);
  }
  const floorY = (10 ** (a.noiseFloor / 20) / peak) * amp;
  for (let x = 0; x < W; x += 3) {
    put(x, mid - floorY, [255, 200, 80], 0.8);
    put(x, mid + floorY, [255, 200, 80], 0.8);
  }
  for (const w of e.words) rect(X(w.start), 212, Math.max(X(w.start) + 2, X(w.end) - 1), 240, [60, 110, 220]);
  for (const t of a.tags) {
    rect(X(t.start), 246, Math.max(X(t.start) + 2, X(t.end)), 272, t.nonverbal ? [200, 120, 40] : [120, 80, 170], 0.55);
    if (t.energy) rect(X(t.energy[0]), 252, X(t.energy[1]), 266, t.nonverbal ? [255, 160, 60] : [170, 120, 230]);
  }
  for (const s of a.segments) rect(X(s[0]), 278, X(s[1]), 296, [80, 200, 110]);
  // What the automatic trim removes, and the cut lines.
  rect(0, 0, X(trim.start), H, [200, 40, 40], 0.28);
  rect(X(trim.end), 0, W, H, [200, 40, 40], 0.28);
  rect(X(trim.start) - 1, 0, X(trim.start) + 1, H, [255, 70, 70]);
  rect(X(trim.end) - 1, 0, X(trim.end) + 1, H, [255, 70, 70]);

  const out = path.join(root, "out", slug, `voice-${id}${take ? `-t${take}` : ""}.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ppm = `${out}.ppm`;
  fs.writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`, "ascii"), px]));
  const labels: string[] = [];
  if (FONT) {
    const ff = FONT.replace(/:/g, "\\:");
    const text = (s: string, x: number, y: number, size: number, color = "white") => labels.push(`drawtext=fontfile='${ff}':text='${clean(s)}':x=${Math.round(x)}:y=${y}:fontsize=${size}:fontcolor=${color}`);
    text(`${takeKey(id, take)} - ${a.duration.toFixed(2)} s - floor ${a.noiseFloor.toFixed(0)} dB - ${a.loudness.toFixed(1)} LUFS - peak ${a.peak.toFixed(1)} dB - trim ${trim.start.toFixed(2)} to ${trim.end.toFixed(2)} s${a.stt ? ` - heard ${a.stt.text.slice(0, 60)}` : ""}`, 6, 4, 15);
    for (const w of e.words) text(w.text, X(w.start) + 2, 218, 13);
    for (const t of a.tags) text(t.tag, X(t.start) + 2, 252, 12, "black");
    text("words", W - 50, 218, 11, "gray");
    text("tags", W - 40, 252, 11, "gray");
    text("sound", W - 50, 280, 11, "gray");
  }
  const res = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", ppm, ...(labels.length ? ["-vf", labels.join(",")] : []), out], { encoding: "utf8" });
  fs.rmSync(ppm, { force: true });
  if (res.status !== 0) throw new Error(`ffmpeg failed drawing the strip: ${res.stderr.slice(0, 300)}`);
  return out;
};

/** All takes of a line in one WAV: before take n, n+1 short beeps, then the take, then a pause. */
export const auditionLine = (root: string, slug: string, manifest: VoiceManifest, id: string): { file: string; takes: number[] } => {
  const takes: number[] = [];
  for (let k = 0; k < 32; k++) if (manifest.lines[takeKey(id, k)]) takes.push(k);
  if (!takes.length) throw new Error(`no clips for ${id}`);
  const sr = 24000;
  const parts: Float32Array[] = [];
  const silence = (s: number) => new Float32Array(Math.round(s * sr));
  const beep = () => Float32Array.from({ length: Math.round(0.07 * sr) }, (_, i) => Math.sin((2 * Math.PI * 880 * i) / sr) * 0.25 * Math.sin((Math.PI * i) / (0.07 * sr)));
  for (const k of takes) {
    for (let b = 0; b <= k; b++) parts.push(beep(), silence(0.08));
    parts.push(silence(0.3));
    const { samples, sampleRate } = readWav(fs.readFileSync(path.join(root, "public", manifest.lines[takeKey(id, k)].file)));
    // Linear resample to the audition rate (takes of one line normally share a rate already).
    const n = Math.round((samples.length * sr) / sampleRate);
    parts.push(Float32Array.from({ length: n }, (_, i) => {
      const x = (i * sampleRate) / sr;
      const j = Math.floor(x);
      return (samples[j] ?? 0) + ((samples[j + 1] ?? 0) - (samples[j] ?? 0)) * (x - j);
    }));
    parts.push(silence(0.8));
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  const file = path.join(root, "out", slug, `audition-${id}.wav`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, writeWav(all, sr));
  return { file, takes };
};

/** Tier 1 + 2 table for every line and take; the measured pick for lines with takes and no director's choice. */
export const reportTakes = (r: ResolvedEpisode, manifest: VoiceManifest, pinned: (next: string, line: string) => boolean): string[] => {
  const out: string[] = [];
  for (const lt of lineTakes(r, manifest, pinned)) {
    out.push(`${lt.id} (${lt.speaker}) "${lt.text.slice(0, 70)}"${lt.slot !== undefined ? ` · slot ${lt.slot.toFixed(2)} s` : ""} · plays take ${lt.selected}${lt.choice ? ` (chosen by ${lt.choice.by}: ${lt.choice.why})` : ""}`);
    for (const t of lt.takes)
      out.push(
        `  take ${t.take}${t.take === lt.selected ? "*" : " "} ${t.validation.ok ? "✔" : "✖"} ${t.duration.toFixed(2)} s (trimmed ${t.trimmed.toFixed(2)}) · ${t.wordsPerSecond} w/s · ${t.pauses} pause(s) · ${t.loudness.toFixed(1)} LUFS · peak ${t.peak.toFixed(1)} · ${t.pitch}` +
          (t.validation.problems.length ? `\n      ✖ ${t.validation.problems.join("\n      ✖ ")}` : ""),
      );
    if (lt.takes.length > 1 && !lt.choice) {
      const pick = measuredPick(lt);
      out.push(pick ? `  → measured pick: take ${pick.take} — ${pick.why}` : "  → no take passes validation");
    }
  }
  return out;
};
