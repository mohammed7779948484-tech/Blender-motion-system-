// Factory commands: recipe → scene plan → editable Blender scenes → cached shot renders → composite.
//   plan <slug>            sample the directed scene (probe) into out/<slug>/plan/
//   scenes <slug>          build/refresh library/*.blend and videos/<slug>/scenes/shot-*.blend
//   shots <slug>           render shots that changed (cache: out/<slug>/cache/<key>/)
//   compose <slug>         Blender frames + overlays + captions + audio → out/<slug>.mp4 (+ .srt/.vtt)
//   build <slug>           all of the above, with a timing/reuse report
//   status <slug>          what would be rebuilt / re-rendered and why
//   open <slug> <shot>     the Blender command to open a shot scene
//   scene-edit <slug> <shot> --script file.py | --py "code"   edit a scene headlessly (same as a manual save)
//   edit <slug> camera|action|line|set ...                   patch the recipe from the command line
//   library                list shared asset files and who links them
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { ResolvedEpisode } from "../../src/engine/core/timeline";
import { buildPlan, PLAN_VERSION, planDir, type PlanIndex, type ShotInfo } from "../factory/plan";
import { args, fail, flag, has, positional, resolve, ROOT } from "./shared";

const RENDER_VERSION = 1;
const sha = (s: string | Buffer) => crypto.createHash("sha1").update(s).digest("hex");
const shaFile = (f: string) => sha(fs.readFileSync(f));
const rel = (f: string) => path.relative(ROOT, f);
const now = () => Date.now();
const secs = (t0: number) => Math.round((now() - t0) / 100) / 10;

export const blenderBin = (): string => {
  const cands = [process.env.BLENDER, "blender", ...(fs.existsSync("/opt/blender") ? fs.readdirSync("/opt/blender").map((d) => `/opt/blender/${d}/blender`) : []), "/Applications/Blender.app/Contents/MacOS/Blender"];
  for (const c of cands) if (c && spawnSync(c, ["--version"], { encoding: "utf8" }).status === 0) return c;
  return fail("Blender not found: install Blender 5.2 LTS and put it on PATH or set BLENDER=/path/to/blender (README: Setup)");
};

const blender = (argv: string[], log: string): { ok: boolean; out: string } => {
  const r = spawnSync(blenderBin(), argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, out);
  return { ok: r.status === 0 && !/Traceback \(most recent call last\)/.test(out), out };
};

// ------------------------------------------------------------------ plan
const walk = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) e.name === "scenes" || walk(p, out);
    else if (/\.(tsx?|json)$/.test(e.name)) out.push(p);
  }
  return out;
};

/** Everything the probe result depends on: the resolved episode and the code that draws it. */
const planInputHash = (slug: string, r: ResolvedEpisode) => {
  const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "videos", slug))].sort();
  return sha(`${PLAN_VERSION}|${JSON.stringify(r)}|${files.map((f) => `${rel(f)}:${shaFile(f)}`).join("|")}`).slice(0, 16);
};

type StoredPlan = PlanIndex & { inputHash: string };
const readPlan = (slug: string): StoredPlan | null => {
  const f = path.join(planDir(ROOT, slug), "plan.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as StoredPlan) : null;
};

const ensurePlan = async (slug: string, r: ResolvedEpisode, force = false): Promise<{ plan: StoredPlan; reused: boolean; seconds: number }> => {
  const t0 = now();
  const inputHash = planInputHash(slug, r);
  const old = readPlan(slug);
  if (!force && old && old.inputHash === inputHash && old.shots.every((s) => fs.existsSync(path.join(ROOT, s.file)))) return { plan: old, reused: true, seconds: secs(t0) };
  const index = await buildPlan(ROOT, slug, r);
  const plan: StoredPlan = { ...index, inputHash };
  fs.writeFileSync(path.join(planDir(ROOT, slug), "plan.json"), JSON.stringify(plan, null, 1));
  return { plan, reused: false, seconds: secs(t0) };
};

// ------------------------------------------------------------------ scenes
type SceneEntry = { planHash: string; blendSha: string; libraries: string[]; builtAt: string };
type Manifest = { shots: Record<string, SceneEntry> };
const scenesDir = (slug: string) => path.join(ROOT, "videos", slug, "scenes");
const manifestFile = (slug: string) => path.join(scenesDir(slug), "manifest.json");
const readManifest = (slug: string): Manifest => (fs.existsSync(manifestFile(slug)) ? (JSON.parse(fs.readFileSync(manifestFile(slug), "utf8")) as Manifest) : { shots: {} });
const blendOf = (slug: string, name: string) => path.join(scenesDir(slug), `${name}.blend`);

type SceneState = "missing" | "current" | "stale" | "edited" | "edited-stale";
const sceneState = (slug: string, s: ShotInfo, m: Manifest): SceneState => {
  const f = blendOf(slug, s.name);
  const e = m.shots[s.name];
  if (!fs.existsSync(f) || !e) return "missing";
  const edited = shaFile(f) !== e.blendSha;
  const stale = e.planHash !== s.hash;
  return edited ? (stale ? "edited-stale" : "edited") : stale ? "stale" : "current";
};

const ensureScenes = (slug: string, plan: StoredPlan, opts: { force?: boolean; only?: string } = {}) => {
  const t0 = now();
  const m = readManifest(slug);
  const states = plan.shots.map((s) => ({ s, state: sceneState(slug, s, m) }));
  const todo = states.filter(({ s, state }) => (opts.only && s.name !== opts.only ? false : opts.force ? true : state === "missing" || state === "stale"));
  // Scenes of shots that no longer exist: remove untouched ones, keep hand-edited ones aside.
  const names = new Set(plan.shots.map((s) => s.name));
  const orphans: string[] = [];
  for (const [name, e] of Object.entries(m.shots)) {
    if (names.has(name)) continue;
    const f = blendOf(slug, name);
    if (fs.existsSync(f)) {
      if (shaFile(f) === e.blendSha) fs.rmSync(f);
      else {
        fs.mkdirSync(path.join(scenesDir(slug), "orphaned"), { recursive: true });
        fs.renameSync(f, path.join(scenesDir(slug), "orphaned", `${name}.blend`));
        orphans.push(name);
      }
    }
    delete m.shots[name];
  }
  let library: Record<string, { created: boolean; added: string[] }> = {};
  if (todo.length) {
    const report = path.join(planDir(ROOT, slug), "build-report.json");
    const job = path.join(planDir(ROOT, slug), "build-job.json");
    fs.writeFileSync(job, JSON.stringify({ root: ROOT, plan_dir: planDir(ROOT, slug), library_dir: path.join(ROOT, "library"), report, shots: todo.map(({ s }) => ({ plan: path.join(ROOT, s.file), blend: blendOf(slug, s.name) })) }));
    const r = blender(["-b", "--factory-startup", "--python", path.join(ROOT, "factory", "blender", "build.py"), "--", job], path.join(ROOT, "out", slug, "logs", "build.log"));
    if (!r.ok) fail(`Blender scene build failed — see out/${slug}/logs/build.log\n${r.out.split("\n").filter((l) => /Error|Traceback|File "/.test(l)).slice(-8).join("\n")}`);
    const rep = JSON.parse(fs.readFileSync(report, "utf8")) as { library: typeof library; shots: { name: string; libraries: string[] }[] };
    library = rep.library;
    for (const b of rep.shots) {
      const s = plan.shots.find((x) => x.name === b.name)!;
      m.shots[b.name] = { planHash: s.hash, blendSha: shaFile(blendOf(slug, b.name)), libraries: b.libraries, builtAt: new Date().toISOString() };
    }
  }
  fs.mkdirSync(scenesDir(slug), { recursive: true });
  fs.writeFileSync(manifestFile(slug), JSON.stringify(m, null, 1));
  return { states, built: todo.map(({ s }) => s.name), orphans, library, seconds: secs(t0) };
};

// ------------------------------------------------------------------ shots
type Profile = Record<string, unknown>;
const profileOf = (name: string): Profile => {
  const all = JSON.parse(fs.readFileSync(path.join(ROOT, "factory", "profiles.json"), "utf8")) as Record<string, Profile>;
  return all[name] ?? fail(`unknown render profile "${name}" (factory/profiles.json: ${Object.keys(all).join(", ")})`);
};

const renderKey = (slug: string, s: ShotInfo, m: Manifest, profile: Profile) => {
  const blend = blendOf(slug, s.name);
  const libs = (m.shots[s.name]?.libraries ?? []).map((l) => `${l}:${fs.existsSync(path.join(ROOT, l)) ? shaFile(path.join(ROOT, l)) : "missing"}`);
  // Animated screen textures live outside the .blend (image sequences in the plan).
  const planned = JSON.parse(fs.readFileSync(path.join(ROOT, s.file), "utf8")) as { materials: Record<string, { map?: unknown; emissiveMap?: unknown }> };
  const tex = sha(JSON.stringify(Object.values(planned.materials).map((x) => [x.map, x.emissiveMap])));
  return sha([RENDER_VERSION, shaFile(blend), ...libs, tex, JSON.stringify(profile), s.start, s.end].join("|")).slice(0, 20);
};

const cacheDir = (slug: string, key: string) => path.join(ROOT, "out", slug, "cache", key);
const frameName = (f: number) => `f${String(f).padStart(5, "0")}.png`;
const cached = (slug: string, key: string, s: ShotInfo) => fs.existsSync(path.join(cacheDir(slug, key), "done.json")) && fs.existsSync(path.join(cacheDir(slug, key), frameName(s.end - 1)));

const ensureShots = (slug: string, plan: StoredPlan, profileName: string, only?: string) => {
  const t0 = now();
  const profile = profileOf(profileName);
  const m = readManifest(slug);
  const results: { name: string; frames: number; state: "rendered" | "reused"; seconds: number; key: string }[] = [];
  for (const s of plan.shots) {
    if (!fs.existsSync(blendOf(slug, s.name))) fail(`scene ${rel(blendOf(slug, s.name))} is missing — run: npm run factory -- scenes ${slug}`);
    const key = renderKey(slug, s, m, profile);
    const dir = cacheDir(slug, key);
    if (cached(slug, key, s)) {
      results.push({ name: s.name, frames: s.end - s.start, state: "reused", seconds: 0, key });
      continue;
    }
    if (only && s.name !== only) fail(`shot ${s.name} has no cached render for profile "${profileName}" (render everything first, without --only)`);
    const t1 = now();
    fs.mkdirSync(dir, { recursive: true });
    const job = path.join(dir, "job.json");
    fs.writeFileSync(job, JSON.stringify({ out_dir: dir, profile }));
    process.stdout.write(`  rendering ${s.name} (${s.end - s.start} frames, ${profileName}) … `);
    const r = blender(["-b", blendOf(slug, s.name), "--python", path.join(ROOT, "factory", "blender", "render.py"), "--", job], path.join(ROOT, "out", slug, "logs", `render-${s.name}.log`));
    if (!r.ok || !fs.existsSync(path.join(dir, frameName(s.end - 1)))) fail(`render of ${s.name} failed — see out/${slug}/logs/render-${s.name}.log`);
    fs.writeFileSync(path.join(dir, "done.json"), JSON.stringify({ shot: s.name, start: s.start, end: s.end, profile: profileName, seconds: secs(t1) }));
    console.log(`${secs(t1)} s`);
    results.push({ name: s.name, frames: s.end - s.start, state: "rendered", seconds: secs(t1), key });
  }
  // One flat frame folder for the compositor (hard links into the cache).
  const frames = path.join(ROOT, "out", slug, "frames");
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  for (const [i, s] of plan.shots.entries()) for (let f = s.start; f < s.end; f++) fs.linkSync(path.join(cacheDir(slug, results[i].key), frameName(f)), path.join(frames, frameName(f)));
  return { results, seconds: secs(t0), profile: profileName };
};

// ------------------------------------------------------------------ compose
const stamp = (t: number, sep: string) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}${sep}${p(ms % 1000, 3)}`;
};

/** Sidecar subtitles (the burned-in captions use the same line timings). */
export const writeSidecars = (r: ResolvedEpisode, base: string) => {
  const lines = r.lines.filter((l) => l.text.trim());
  const name = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
  fs.writeFileSync(`${base}.srt`, lines.map((l, i) => `${i + 1}\n${stamp(l.start, ",")} --> ${stamp(l.end, ",")}\n${name(l.speaker)}: ${l.text}\n`).join("\n"));
  fs.writeFileSync(`${base}.vtt`, `WEBVTT\n\n${lines.map((l) => `${stamp(l.start, ".")} --> ${stamp(l.end, ".")}\n<v ${name(l.speaker)}>${l.text}\n`).join("\n")}`);
};

const compose = async (slug: string, r: ResolvedEpisode, out: string, extra: { frames?: string; captions?: boolean } = {}) => {
  const t0 = now();
  const dir = path.join(ROOT, "out", slug, "frames");
  if (!fs.existsSync(path.join(dir, frameName(r.durationInFrames - 1)))) fail(`rendered frames are incomplete in out/${slug}/frames — run: npm run factory -- shots ${slug}`);
  const server = http.createServer((req, res) => {
    const f = path.join(dir, path.basename(req.url ?? ""));
    if (!fs.existsSync(f)) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": "image/png", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  const props = JSON.stringify({ mode: "comp", frames: `http://127.0.0.1:${port}`, ...(extra.captions === false ? { captions: false } : {}) });
  const cmd = ["remotion", "render", slug, out, `--props='${props}'`, "--log=error", ...(extra.frames ? [`--frames=${extra.frames}`] : [])];
  const code = await new Promise<number>((ok) => spawn("npx", cmd, { stdio: "inherit", shell: true, cwd: ROOT }).on("exit", (c) => ok(c ?? 1)));
  server.close();
  if (code !== 0) fail("composite render failed");
  if (!extra.frames) writeSidecars(r, path.join(ROOT, out.replace(/\.mp4$/, "")));
  return { out, seconds: secs(t0) };
};

// ------------------------------------------------------------------ commands
const slugArg = (usage: string) => positional[1] ?? fail(`usage: ${usage}`);

export const plan = async () => {
  const slug = slugArg("plan <slug> [--force]");
  const { resolved } = await resolve(slug);
  const p = await ensurePlan(slug, resolved, has("force"));
  console.log(`✔ scene plan ${p.reused ? "up to date" : "sampled"} (${p.plan.frames} frames, ${p.plan.shots.length} shots, ${p.seconds} s) → out/${slug}/plan/`);
  for (const u of p.plan.unsupported) console.log(`⚠ not transferable to Blender: ${u}`);
};

const printScenes = (slug: string, s: ReturnType<typeof ensureScenes>) => {
  const label: Record<SceneState, string> = { missing: "built", stale: "rebuilt (recipe changed)", current: "up to date", edited: "kept — edited by hand", "edited-stale": "kept — edited by hand, but the recipe changed since (rebuild with --force --only <shot> to discard the edits)" };
  for (const { s: shot, state } of s.states) console.log(`  ${s.built.includes(shot.name) && (state === "current" || state.startsWith("edited")) ? "rebuilt (forced)" : label[state]}: videos/${slug}/scenes/${shot.name}.blend  [${shot.type}, frames ${shot.start}–${shot.end - 1}]`);
  for (const [kind, l] of Object.entries(s.library)) if (l.created || l.added.length) console.log(`  library/${kind}.blend ${l.created ? "created" : `+${l.added.length} datablocks`}`);
  for (const o of s.orphans) console.log(`⚠ ${o} no longer exists in the recipe; its hand-edited scene moved to videos/${slug}/scenes/orphaned/`);
};

export const scenes = async () => {
  const slug = slugArg("scenes <slug> [--force] [--only shot-0148]");
  const { resolved } = await resolve(slug);
  const p = await ensurePlan(slug, resolved);
  const s = ensureScenes(slug, p.plan, { force: has("force"), only: flag("only") });
  console.log(`✔ scenes (${s.built.length} built, ${s.seconds} s)`);
  printScenes(slug, s);
};

export const shots = async () => {
  const slug = slugArg("shots <slug> [--profile final|draft|blocking]");
  const p = readPlan(slug) ?? fail(`no scene plan — run: npm run factory -- scenes ${slug}`);
  const s = ensureShots(slug, p, flag("profile") ?? "final");
  console.log(`✔ shots: ${s.results.filter((x) => x.state === "rendered").length} rendered, ${s.results.filter((x) => x.state === "reused").length} reused (${s.seconds} s) → out/${slug}/frames/`);
};

export const composeCmd = async () => {
  const slug = slugArg("compose <slug> [--out file.mp4]");
  const { resolved } = await resolve(slug);
  const c = await compose(slug, resolved, flag("out") ?? path.join("out", `${slug}.mp4`));
  console.log(`✔ composed ${c.out} (+ .srt, .vtt) in ${c.seconds} s`);
};

export const build = async () => {
  const slug = slugArg("build <slug> [--profile final|draft|blocking] [--force] [--out file.mp4]");
  const profile = flag("profile") ?? "final";
  const t0 = now();
  const { resolved } = await resolve(slug);
  const tResolve = secs(t0);
  const p = await ensurePlan(slug, resolved, has("force"));
  console.log(`✔ plan ${p.reused ? "reused" : "sampled"} (${p.seconds} s)`);
  const s = ensureScenes(slug, p.plan, { force: has("force") });
  console.log(`✔ scenes: ${s.built.length} built, ${p.plan.shots.length - s.built.length} kept (${s.seconds} s)`);
  printScenes(slug, s);
  const sh = ensureShots(slug, p.plan, profile);
  console.log(`✔ shots: ${sh.results.filter((x) => x.state === "rendered").length} rendered, ${sh.results.filter((x) => x.state === "reused").length} reused (${sh.seconds} s)`);
  const out = flag("out") ?? path.join("out", profile === "final" ? `${slug}.mp4` : `${slug}-${profile}.mp4`);
  const c = await compose(slug, resolved, out);
  const report = {
    slug,
    profile,
    at: new Date().toISOString(),
    totalSeconds: secs(t0),
    steps: { resolve: tResolve, plan: { seconds: p.seconds, reused: p.reused }, scenes: { seconds: s.seconds, built: s.built }, shots: { seconds: sh.seconds, results: sh.results }, compose: c.seconds },
    output: out,
  };
  fs.writeFileSync(path.join(ROOT, "out", slug, "build-report.json"), JSON.stringify(report, null, 1));
  fs.appendFileSync(path.join(ROOT, "out", slug, "build-log.jsonl"), `${JSON.stringify(report)}\n`);
  console.log(`✔ ${out} (+ .srt, .vtt) — total ${report.totalSeconds} s  [plan ${p.seconds} · scenes ${s.seconds} · shots ${sh.seconds} · compose ${c.seconds}]`);
};

export const status = async () => {
  const slug = slugArg("status <slug> [--profile final]");
  const { resolved } = await resolve(slug);
  const p = readPlan(slug);
  if (!p) return console.log("no scene plan yet — run build");
  const fresh = p.inputHash === planInputHash(slug, resolved);
  console.log(`plan: ${fresh ? "up to date" : "STALE (recipe or code changed) — the next build re-samples it"}`);
  const m = readManifest(slug);
  const profile = profileOf(flag("profile") ?? "final");
  for (const s of p.shots) {
    const st = sceneState(slug, s, m);
    const key = st === "missing" ? "" : renderKey(slug, s, m, profile);
    console.log(`  ${s.name}  ${s.type.padEnd(14)} frames ${String(s.start).padStart(4)}–${String(s.end - 1).padEnd(4)}  scene: ${st.padEnd(12)}  render: ${key && cached(slug, key, s) ? "cached" : "needed"}`);
  }
};

export const open = async () => {
  const slug = slugArg("open <slug> <shot>");
  const shot = positional[2] ?? fail("usage: open <slug> <shot>   (shot names: npm run factory -- status <slug>)");
  const f = blendOf(slug, shot);
  if (!fs.existsSync(f)) fail(`${rel(f)} not found`);
  const bin = blenderBin();
  if (process.env.DISPLAY || process.platform !== "linux") spawn(bin, [f], { detached: true, stdio: "ignore" }).unref();
  console.log(`${bin} ${f}\n(save in Blender; the next build keeps your edit and re-renders only this shot)`);
};

export const sceneEdit = async () => {
  const slug = slugArg('scene-edit <slug> <shot> --script file.py | --py "python"');
  const shot = positional[2] ?? fail("usage: scene-edit <slug> <shot> --script file.py");
  const f = blendOf(slug, shot);
  if (!fs.existsSync(f)) fail(`${rel(f)} not found`);
  const script = flag("script");
  const code = script ? fs.readFileSync(script, "utf8") : flag("py") ?? fail("give --script file.py or --py code");
  const tmp = path.join(ROOT, "out", slug, "logs", "scene-edit.py");
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.writeFileSync(tmp, `import bpy\nbpy.context.preferences.filepaths.save_version = 0\nscene = bpy.context.scene\n${code}\nbpy.ops.wm.save_mainfile()\n`);
  const r = blender(["-b", f, "--python", tmp], path.join(ROOT, "out", slug, "logs", "scene-edit.log"));
  if (!r.ok) fail(`scene edit failed — see out/${slug}/logs/scene-edit.log`);
  console.log(`✔ edited ${rel(f)} (now hand-edited: builds keep it and re-render only this shot)`);
};

export const library = () => {
  const dir = path.join(ROOT, "library");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".blend")) : [];
  const users = new Map<string, string[]>();
  for (const v of fs.readdirSync(path.join(ROOT, "videos"))) {
    const mf = manifestFile(v);
    if (!fs.existsSync(mf)) continue;
    const libs = new Set(Object.values((JSON.parse(fs.readFileSync(mf, "utf8")) as Manifest).shots).flatMap((s) => s.libraries));
    for (const l of libs) users.set(l, [...(users.get(l) ?? []), v]);
  }
  for (const f of files.sort()) console.log(`  library/${f.padEnd(28)} ${(fs.statSync(path.join(dir, f)).size / 1024).toFixed(0).padStart(5)} KB  used by: ${(users.get(`library/${f}`) ?? []).join(", ") || "—"}`);
  console.log(`${files.length} shared asset files. Edit one in Blender and every scene that links it changes on the next build.`);
};

/** Recipe patches from the command line; the result is validated and rolled back when invalid. */
export const edit = async () => {
  const slug = slugArg("edit <slug> camera|action|line|set ...");
  const what = positional[2];
  const file = path.join(ROOT, "videos", slug, "episode.json");
  const before = fs.readFileSync(file, "utf8");
  const ep = JSON.parse(before) as Record<string, unknown> & { camera?: unknown[]; actions?: unknown[]; dialogue?: { id: string; text: string }[] };
  const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
  const time = (v: string | undefined) => (v === undefined ? fail("--at <time> is required (seconds or a dialogue reference like l2.word:3)") : /^-?[\d.]+$/.test(v) ? Number(v) : v);
  const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  if (what === "camera") {
    const move = flag("move");
    (ep.camera ??= []).push(clean({ at: time(flag("at")), shot: flag("shot") ?? "close", subject: flag("subject"), item: flag("item"), angle: num(flag("angle")), size: num(flag("size")), move: move ? clean({ type: move, amount: num(flag("amount")) }) : undefined }));
  } else if (what === "action") {
    (ep.actions ??= []).push(clean({ at: time(flag("at")), actor: flag("actor") ?? fail("--actor is required"), gesture: flag("gesture"), pose: flag("pose"), emotion: flag("emotion"), look: flag("look"), do: flag("do"), item: flag("item"), target: flag("target") }));
  } else if (what === "line") {
    const id = positional[3] ?? fail('usage: edit <slug> line <id> --text "..."');
    const line = ep.dialogue?.find((l) => l.id === id) ?? fail(`no dialogue line "${id}"`);
    line.text = flag("text") ?? fail("--text is required");
  } else if (what === "set") {
    const keyPath = positional[3] ?? fail("usage: edit <slug> set <dot.path> --value <json>");
    const raw = flag("value") ?? fail("--value <json> is required");
    let value: unknown = raw;
    try {
      value = JSON.parse(raw);
    } catch {
      /* plain string */
    }
    const keys = keyPath.split(".");
    let cur = ep as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) cur = (cur[k] ??= {}) as Record<string, unknown>;
    cur[keys[keys.length - 1]] = value;
  } else fail("usage: edit <slug> camera --at <t> --shot close --subject rayan [--move push-in --amount 0.2] | action --at <t> --actor rayan --gesture wave | line l2 --text \"...\" | set <dot.path> --value <json>");
  fs.writeFileSync(file, `${JSON.stringify(ep, null, 2)}\n`);
  const check = spawnSync(process.execPath, ["--no-deprecation", "--import", "tsx", path.join(ROOT, "scripts", "cli.ts"), "validate", slug], { cwd: ROOT, encoding: "utf8" });
  if (check.status !== 0) {
    fs.writeFileSync(file, before);
    fail(`the edit made the recipe invalid and was rolled back:\n${(check.stdout + check.stderr).split("\n").filter((l) => l.includes("✖")).join("\n")}`);
  }
  console.log(`✔ videos/${slug}/episode.json updated (${what}); run: npm run factory -- build ${slug}`);
  void args;
};

export const factoryCommands = { plan, scenes, shots, compose: composeCmd, build, status, open, "scene-edit": sceneEdit, library, edit };
