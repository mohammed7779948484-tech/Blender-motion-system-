// Shared plumbing for the CLI commands: arguments, failure, npx/ffmpeg and video resolution.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Trace } from "../../src/engine/core/trace";
import { resolveVideo } from "../video";

export const ROOT = process.cwd();

export const args = process.argv.slice(2);
export const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? "" : undefined;
};
export const has = (name: string) => args.includes(`--${name}`);
/** Flags that take no value (everything else consumes the next token). */
export const BOOLEAN_FLAGS = ["--force", "--verify", "--draft", "--guides", "--check", "--master", "--json", "--edges", "--camera", "--report", "--no-stt", "--analyze"];
export const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !BOOLEAN_FLAGS.includes(args[i - 1])));

export const fail = (msg: string): never => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
export const npx = (cmd: string[]) => {
  const r = spawnSync("npx", cmd, { stdio: "inherit", shell: true, cwd: ROOT });
  if (r.status !== 0) fail(`npx ${cmd.join(" ")} failed`);
};
// Sparse --frames lists crash Remotion's inline audio mixing; stills don't need audio anyway.
// npx runs through a shell: cmd.exe needs escaped double quotes, POSIX shells need single quotes.
export const SILENT = process.platform === "win32" ? `--props="{\\"silent\\":true}"` : `'--props={"silent":true}'`;
export const hasFfmpeg = () => spawnSync("ffmpeg", ["-version"], { shell: true }).status === 0;

export const videoDir = (slug: string) => path.join(ROOT, "videos", slug);
export const publicExists = (p: string) => fs.existsSync(path.join(ROOT, "public", p));

/** Resolved episode plus the video's custom actor definitions (for scene evaluation). */
export const resolve = async (slug: string, opts: { trace?: Trace } = {}) => {
  try {
    return await resolveVideo(ROOT, slug, opts);
  } catch (e) {
    return fail((e as Error).message);
  }
};
