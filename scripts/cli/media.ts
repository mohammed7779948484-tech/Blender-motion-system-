// Rendering commands: stills (contact sheets at shot middles, shot edges or findings; determinism check),
// preview (a short low-res range + a frame strip to judge motion), render (draft/final/master), review.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { auditAudio, isMissingFile } from "../../src/engine/audio/audit";
import type { ResolvedEpisode } from "../../src/engine/core/timeline";
import { createTrace, type Trace } from "../../src/engine/core/trace";
import { findingsFor } from "./check";
import { fail, flag, has, hasFfmpeg, npx, positional, publicExists, resolve, ROOT, SILENT } from "./shared";

/** A font for labels (drawtext); without one, sheets are unlabelled. */
const LABEL_FONT = ["C:/Windows/Fonts/arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
const drawLabel = (text: string, size: number) =>
  LABEL_FONT ? `drawtext=fontfile='${LABEL_FONT.replace(/:/g, "\\:")}':text='${text.replace(/[:'\\%]/g, " ")}':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=10:x=16:y=16,` : "";

type Still = { frame: number; label: string };

/**
 * Which frames to render: the middle of every shot (default), `--frames a,b,c`, `--edges` (each shot just
 * after it starts and just before it ends, plus recipe contact moments) or `--at findings` (the middle of
 * every open warning/error from inspect).
 */
const stillFrames = async (slug: string, r: ResolvedEpisode, trace: Trace): Promise<{ stills: Still[]; sheet: string }> => {
  const clampF = (f: number) => Math.min(r.durationInFrames - 1, Math.max(0, f));
  const shotLabel = (t: number) => {
    const k = r.shots.findIndex((s) => t >= s.at && t < s.end);
    return k >= 0 ? `shot ${k} ${r.shots[k].type}` : "";
  };
  const at = (t: number, extra = ""): Still => ({ frame: clampF(Math.round(t * r.fps)), label: `${t.toFixed(2)}s ${shotLabel(t)}${extra ? ` ${extra}` : ""}` });
  let stills: Still[];
  let sheet = "contact.png";
  const custom = flag("frames");
  if (custom) {
    stills = custom.split(",").map((s) => Number(s.trim())).map((f) => at(f / r.fps));
    sheet = "contact-frames.png";
  } else if (has("edges")) {
    stills = r.shots.flatMap((s) => [at(Math.min(s.end, s.at + 0.1), "start"), at(Math.max(s.at, s.end - 0.1), "end")]);
    stills.push(...trace.contacts.map((c) => at(c.at, `${c.actor} ${c.what}`)));
    sheet = "contact-edges.png";
  } else if (flag("at") === "findings") {
    const { findings } = await findingsFor(slug);
    stills = findings.filter((f) => !f.accepted && f.level !== "note").map((f) => at((f.from + f.to) / 2, `${f.kind} ${f.object}`));
    if (!stills.length) console.log("  no open warnings or errors — nothing to show");
    sheet = "contact-findings.png";
  } else stills = r.shots.map((s) => at((s.at + s.end) / 2));
  const byFrame = new Map<number, Still>();
  for (const s of stills) if (!byFrame.has(s.frame)) byFrame.set(s.frame, s);
  return { stills: [...byFrame.values()].sort((a, b) => a.frame - b.frame), sheet };
};

export const stills = async () => {
  const slug = positional[1] ?? fail("usage: stills <slug> [--frames a,b | --edges | --at findings] [--guides] [--verify]");
  const trace = createTrace();
  const { resolved: r } = await resolve(slug, { trace });
  const { stills: picks, sheet: sheetName } = await stillFrames(slug, r, trace);
  if (!picks.length) return;
  const frames = picks.map((p) => p.frame);
  const out = path.join("out", slug, "stills");
  fs.rmSync(path.join(ROOT, out), { recursive: true, force: true });
  npx(["remotion", "render", slug, out, "--sequence", `--frames=${frames.join(",")}`, "--image-format=png", SILENT, "--log=error"]);
  const files = fs.readdirSync(path.join(ROOT, out)).filter((f) => f.endsWith(".png")).sort();
  console.log(`✔ ${files.length} stills → ${out}/ (frames ${frames.join(", ")})`);
  if (hasFfmpeg() && files.length) {
    const tmp = path.join(ROOT, out, "_seq");
    fs.mkdirSync(tmp, { recursive: true });
    // --guides: shade where vertical-video platforms put their UI (top bar, caption/description area,
    // right-hand action rail) so faces, captions and titles can be checked against it.
    const guides = has("guides") && r.height > r.width ? "drawbox=x=0:y=0:w=iw:h=ih*0.10:color=red@0.3:t=fill,drawbox=x=0:y=ih*0.80:w=iw:h=ih*0.20:color=red@0.3:t=fill,drawbox=x=iw*0.86:y=ih*0.40:w=iw*0.14:h=ih*0.40:color=red@0.3:t=fill," : "";
    const size = Math.round(Math.min(r.width, r.height) * 0.045);
    files.forEach((f, i) => {
      const label = picks.find((p) => f.includes(String(p.frame).padStart(3, "0")))?.label ?? f;
      spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(ROOT, out, f), "-vf", `"${guides}${drawLabel(label, size)}scale=480:-1"`, path.join(tmp, `${String(i).padStart(4, "0")}.png`)], { stdio: "inherit", shell: true });
    });
    const cols = Math.min(4, files.length);
    const rows = Math.ceil(files.length / cols);
    const sheet = path.join("out", slug, sheetName);
    spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(tmp, "%04d.png"), "-vf", `"tile=${cols}x${rows}:padding=4:color=black"`, "-frames:v", "1", sheet], { stdio: "inherit", shell: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`✔ contact sheet → ${sheet} (in time order, left→right, top→bottom; each labelled with time and shot)`);
  } else console.log("  (install ffmpeg on PATH for a contact sheet)");

  if (has("verify")) {
    // Re-render the same frames in a single tab, in order: a different visiting order than the parallel run.
    const vout = path.join("out", slug, "verify");
    fs.rmSync(path.join(ROOT, vout), { recursive: true, force: true });
    npx(["remotion", "render", slug, vout, "--sequence", `--frames=${frames.join(",")}`, "--image-format=png", SILENT, "--concurrency=1", "--log=error"]);
    let identical = 0;
    const diffs: string[] = [];
    for (const f of files) {
      const a = fs.readFileSync(path.join(ROOT, out, f));
      const b = fs.readFileSync(path.join(ROOT, vout, f));
      if (a.equals(b)) {
        identical++;
        continue;
      }
      const psnr = hasFfmpeg() ? spawnSync("ffmpeg", ["-hide_banner", "-i", path.join(out, f), "-i", path.join(vout, f), "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8", shell: true }).stderr.match(/average:([\w.]+)/)?.[1] : "?";
      // How big and how widespread: max channel difference and number of differing pixels.
      const stat = (extra: string) =>
        hasFfmpeg() ? spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(out, f), "-i", path.join(vout, f), "-filter_complex", `"[0:v][1:v]blend=all_mode=difference,format=gray${extra},signalstats,metadata=mode=print:file=-"`, "-f", "null", "-"], { encoding: "utf8", shell: true }).stdout : "";
      const max = stat("").match(/YMAX=(\d+)/)?.[1] ?? "?";
      const frac = Number(stat(",geq=lum='gt(lum(X\,Y)\,0)*255'").match(/YAVG=([\d.]+)/)?.[1] ?? NaN);
      const px = Number.isNaN(frac) ? "?" : String(Math.round((frac / 255) * r.width * r.height));
      diffs.push(`${f}: PSNR ${psnr} dB, max difference ${max}/255 on ${px} pixels${Number(max) <= 4 ? " (harmless GPU noise)" : ""}`);
    }
    console.log(`✔ determinism: ${identical}/${files.length} frames byte-identical across render orders`);
    for (const d of diffs) console.log(`⚠ ${d}`);
    if (diffs.some((d) => /PSNR (\d+)/.test(d) && Number(/PSNR ([\d.]+)/.exec(d)![1]) < 45)) fail("frames differ between render orders");
  }
};

/**
 * A short range at reduced size to judge motion: an MP4 (with sound) and a strip of evenly spaced frames
 * you can look at. Drafts are allowed (estimated timing for unvoiced lines).
 */
export const preview = async () => {
  const slug = positional[1] ?? fail("usage: preview <slug> --from <s> --to <s> [--scale 0.5] [--strip 8]");
  const { resolved: r } = await resolve(slug);
  const from = Math.max(0, Number(flag("from") ?? 0));
  const to = Math.min(r.duration, Number(flag("to") ?? Math.min(r.duration, from + 4)));
  if (!(to > from)) fail("preview needs --from < --to (seconds)");
  const scale = Number(flag("scale") ?? 0.5);
  const n = Math.max(2, Number(flag("strip") ?? 8));
  const f0 = Math.round(from * r.fps);
  const f1 = Math.min(r.durationInFrames - 1, Math.round(to * r.fps));
  const mp4 = path.join("out", slug, "preview.mp4");
  fs.mkdirSync(path.join(ROOT, "out", slug), { recursive: true });
  const draftProps = process.platform === "win32" ? `--props="{\\"draft\\":true}"` : `'--props={"draft":true}'`;
  npx(["remotion", "render", slug, mp4, `--frames=${f0}-${f1}`, `--scale=${scale}`, draftProps, "--log=error"]);
  console.log(`✔ preview ${from.toFixed(2)}–${to.toFixed(2)}s at ${scale}× → ${mp4}`);
  if (!hasFfmpeg()) return;
  const every = Math.max(1, Math.floor((f1 - f0 + 1) / n));
  const portrait = r.height > r.width;
  const cols = portrait ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / cols);
  const size = Math.round(Math.min(r.width, r.height) * scale * 0.06);
  const strip = path.join("out", slug, "preview-strip.png");
  const label = LABEL_FONT ? `drawtext=fontfile='${LABEL_FONT.replace(/:/g, "\\:")}':text='%{pts\\:flt\\:${from}}s':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6:x=8:y=8,` : "";
  const res = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mp4, "-vf", `"select='not(mod(n\\,${every}))',${label}scale=${portrait ? 270 : 480}:-1,tile=${cols}x${rows}:padding=4:color=black"`, "-frames:v", "1", "-fps_mode", "vfr", strip], { stdio: "inherit", shell: true });
  if (res.status !== 0) fail("could not build the frame strip (ffmpeg error above)");
  console.log(`✔ frame strip → ${strip} (every ${every} frames from ${from.toFixed(2)}s; look at it to judge motion)`);
};

export const render = async () => {
  const slug = positional[1] ?? fail("usage: render <slug> [--draft] [--out file] [--timeout ms]");
  const { resolved: r } = await resolve(slug); // fail fast on invalid direction
  const draft = has("draft");
  const audio = auditAudio(r, publicExists);
  for (const w of audio.warnings) console.log(`⚠ ${w}`);
  const blocking = draft ? audio.errors.filter(isMissingFile) : audio.errors;
  if (blocking.length) fail(`not ready for a ${draft ? "draft" : "final"} render:\n${blocking.map((e) => `  • ${e}`).join("\n")}${draft ? "" : "\n  (render a draft with --draft)"}`);
  const out = flag("out") ?? path.join("out", `${slug}${draft ? "-draft" : ""}.mp4`);
  const timeout = flag("timeout");
  const draftProps = process.platform === "win32" ? `--props="{\\"draft\\":true}"` : `'--props={"draft":true}'`;
  const master = has("master");
  // Mastering reads the render and writes `out`, so they must be different files (ffmpeg cannot edit in place).
  const target = master ? (/\.mp4$/.test(out) ? out.replace(/\.mp4$/, ".unmastered.mp4") : `${out}.unmastered.mp4`) : out;
  npx(["remotion", "render", slug, target, "--log=info", ...(draft ? [draftProps] : []), ...(timeout ? [`--timeout=${timeout}`] : [])]);
  if (master) {
    // Social platforms normalise to about -14 LUFS: master the soundtrack there (two-pass loudnorm,
    // true peak -1.5 dBTP) and copy the video stream untouched.
    if (!hasFfmpeg()) fail("--master needs ffmpeg on PATH");
    const measure = spawnSync("ffmpeg", ["-hide_banner", "-i", target, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { cwd: ROOT, encoding: "utf8" }).stderr;
    const m = JSON.parse(measure.slice(measure.lastIndexOf("{"), measure.lastIndexOf("}") + 1)) as Record<string, string>;
    const af = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", target, "-c:v", "copy", "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "256k", out], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) fail(`mastering failed: ${r.stderr}`);
    fs.rmSync(path.join(ROOT, target), { force: true });
    console.log(`✔ mastered to -14 LUFS (was ${m.input_i} LUFS, true peak ${m.input_tp} dBTP)`);
  }
  console.log(`✔ rendered ${out}${draft ? " (draft)" : ""}`);
};

/** Post-render review: a frame sheet of every shot/accent from the MP4, plus loudness and mix balance. */
export const review = async () => {
  const slug = positional[1] ?? fail("usage: review <slug>   (after render)");
  const mp4 = flag("file") ?? path.join("out", `${slug}.mp4`);
  if (!fs.existsSync(path.join(ROOT, mp4))) fail(`${mp4} not found — run \`npm run cli -- render ${slug}\` first`);
  if (!hasFfmpeg()) fail("review needs ffmpeg on PATH");
  const { resolved: r } = await resolve(slug);
  const run = (a: string[]) => spawnSync("ffmpeg", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });

  // Frames: the middle of every shot and the peak of every screen accent, in time order.
  const times = [...new Set([...r.shots.map((s) => (s.at + s.end) / 2), ...r.fx.filter((f) => f.type !== "shake").map((f) => Math.min(f.end - 0.05, f.at + 0.35))].map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
  const dir = path.join("out", slug, "review");
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  times.forEach((t, i) => run(["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-1", path.join(dir, `${String(i).padStart(3, "0")}.png`)]));
  const cols = Math.min(6, times.length);
  run(["-v", "error", "-y", "-i", path.join(dir, "%03d.png"), "-filter_complex", `tile=${cols}x${Math.ceil(times.length / cols)}:padding=4`, "-frames:v", "1", path.join("out", slug, "review-sheet.png")]);
  console.log(`✔ review sheet → out/${slug}/review-sheet.png (${times.length} frames at ${times.map((t) => t.toFixed(1)).join(", ")} s)`);

  // Loudness (EBU R128) and true peak.
  const ebu = run(["-hide_banner", "-nostats", "-i", mp4, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
  const lufs = ebu.match(/I:\s+(-?[\d.]+) LUFS/g)?.at(-1)?.match(/-?[\d.]+/)?.[0];
  const tp = ebu.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.at(-1)?.match(/-?[\d.]+/)?.[0];
  console.log(`loudness: ${lufs} LUFS integrated (social platforms normalise around -14), true peak ${tp} dBFS${Number(tp) > -1 ? "  ⚠ above -1 dBFS" : ""}`);

  // Mix: dialogue level over spoken words vs a 0.25 s window at each sound; sounds that land on words.
  const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", mp4, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { cwd: ROOT, maxBuffer: 1 << 28 }).stdout as Buffer;
  const sr = 16000;
  const n = pcm.length / 2;
  let clipped = 0;
  for (let i = 0; i < n; i++) if (Math.abs(pcm.readInt16LE(i * 2)) >= 32700) clipped++;
  const rms = (a: number, b: number) => {
    let s = 0;
    const i0 = Math.max(0, Math.floor(a * sr));
    const i1 = Math.min(n, Math.floor(b * sr));
    for (let i = i0; i < i1; i++) s += (pcm.readInt16LE(i * 2) / 32768) ** 2;
    return Math.sqrt(s / Math.max(1, i1 - i0));
  };
  const dB = (v: number) => 20 * Math.log10(Math.max(1e-9, v));
  const hits = r.sfx.map((s) => s.at);
  const words = r.lines.flatMap((l) => l.words.map((w) => ({ line: l.id, text: w.text, a: l.start + w.start, b: l.start + w.end })));
  const clean = words.filter((w) => !hits.some((h) => h > w.a - 0.35 && h < w.b + 0.05));
  const dialogue = clean.length ? Math.sqrt(clean.reduce((s, w) => s + rms(w.a, w.b) ** 2, 0) / clean.length) : 0;
  console.log(`clipped samples: ${clipped}${clipped ? "  ⚠" : ""}; dialogue level ${dialogue ? dB(dialogue).toFixed(1) : "—"} dBFS RMS`);
  for (const s of r.sfx) {
    const rel = dialogue ? dB(rms(s.at, s.at + 0.25)) - dB(dialogue) : NaN;
    const on = words.find((w) => s.at >= w.a - 0.05 && s.at <= w.b);
    const loud = rel > 6 ? "  ⚠ much louder than the voices" : "";
    console.log(`  ${s.src.replace(/^.*\//, "").padEnd(20)} @${s.at.toFixed(2).padStart(6)}s  ${Number.isNaN(rel) ? "" : `${rel >= 0 ? "+" : ""}${rel.toFixed(1)} dB vs dialogue`}${on ? `  ⚠ lands on "${on.text}" (${on.line})` : ""}${loud}`);
  }
  console.log("Now watch the MP4 with sound and write the editorial review (hook, pacing, timing, acting, readability, mix, payoff).");
};
