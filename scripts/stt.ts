// Local speech-to-text for take validation: ffmpeg's built-in whisper filter (whisper.cpp) with a ggml model.
// Free and offline once the model file is present; without it validation says "words not verified".
//   model: $WHISPER_MODEL, else ~/.cache/remotion-system/whisper/ggml-tiny.en-q5_1.bin
//   (https://huggingface.co/ggerganov/whisper.cpp — the tiny English model, ~31 MB)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const whisperModel = () => process.env.WHISPER_MODEL ?? path.join(os.homedir(), ".cache", "remotion-system", "whisper", "ggml-tiny.en-q5_1.bin");

let broken: string | null = null;

/** Why speech-to-text can't run here, or null when it can. */
export const sttUnavailable = (): string | null => {
  if (broken) return broken;
  const model = whisperModel();
  if (!fs.existsSync(model)) return `no whisper model at ${model}`;
  const probe = spawnSync("ffmpeg", ["-hide_banner", "-h", "filter=whisper"], { encoding: "utf8" });
  if (probe.status !== 0 || !/whisper AVOptions/.test(probe.stdout + probe.stderr)) return "this ffmpeg has no whisper filter";
  return null;
};

/** Transcript of a WAV (null when speech-to-text is unavailable or fails; the reason is kept for the report). */
export const transcribe = (wavPath: string): string | null => {
  if (sttUnavailable()) return null;
  const model = whisperModel();
  // Filter option values can't carry a Windows drive colon unescaped: run next to the model, use relative names.
  const dir = path.dirname(model);
  const out = `stt-${process.pid}-${Date.now()}.txt`;
  const af = `aresample=16000,whisper=model=${path.basename(model)}:language=en:use_gpu=false:destination=${out}:format=text`;
  const res = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.resolve(wavPath), "-af", af, "-f", "null", "-"], { cwd: dir, encoding: "utf8" });
  const file = path.join(dir, out);
  try {
    if (res.status !== 0 || !fs.existsSync(file)) {
      broken = `whisper failed (${(res.stderr || "").split("\n").find((l) => /error|fail/i.test(l))?.trim().slice(0, 160) ?? `exit ${res.status}`})`;
      return null;
    }
    return fs.readFileSync(file, "utf8").replace(/\s+/g, " ").trim();
  } finally {
    fs.rmSync(file, { force: true });
  }
};

export const sttModelName = () => path.basename(whisperModel()).replace(/\.bin$/, "");
