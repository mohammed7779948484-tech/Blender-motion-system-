// Scene plan: runs the composition in "probe" mode (src/factory/FactoryPlayer.tsx), collects the
// sampled scene graph of every frame and reduces it to one file per shot that Blender can build:
// objects (hierarchy, asset tags, static or per-frame transforms and visibility), materials,
// lights, camera, plus shared geometry and texture stores.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { ResolvedEpisode } from "../../src/engine/core/timeline";
import type { ProbeFrame, ProbeObject } from "../../src/factory/probe";

export const PLAN_VERSION = 3;
const sha = (s: string | Buffer) => crypto.createHash("sha1").update(s).digest("hex");

type Frame = ProbeFrame & {
  camera: { p: number[]; q: number[]; fov: number; shot: number; focus: { distance: number; range: number; bokeh: number } | null };
  scene: { background?: number[]; fog?: unknown; environmentIntensity?: number };
};

export type ShotInfo = { name: string; index: number; type: string; start: number; end: number; hash: string; file: string };
export type PlanIndex = { version: number; slug: string; fps: number; width: number; height: number; frames: number; shots: ShotInfo[]; unsupported: string[]; probeSeconds: number };

export const planDir = (root: string, slug: string) => path.join(root, "out", slug, "plan");

/** Run the probe render and return every frame's sample. */
const probe = async (root: string, slug: string, frames: number, range?: [number, number]): Promise<Map<number, Frame>> => {
  const got = new Map<number, Frame>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const m = /^\/frame\/(\d+)/.exec(req.url ?? "");
      if (m && req.method === "POST") got.set(Number(m[1]), JSON.parse(Buffer.concat(chunks).toString("utf8")) as Frame);
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      res.end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  const tmp = path.join("out", slug, "plan", "_probe");
  fs.rmSync(path.join(root, tmp), { recursive: true, force: true });
  const props = JSON.stringify({ mode: "probe", endpoint: `http://127.0.0.1:${port}`, silent: true });
  // One tab, in order: object identity (uuid) must stay stable across frames.
  const cmd = ["remotion", "render", slug, tmp, "--sequence", "--image-format=jpeg", "--scale=0.1", "--concurrency=1", `--props='${props}'`, "--log=error"];
  if (range) cmd.push(`--frames=${range[0]}-${range[1]}`);
  const code = await new Promise<number>((ok) => spawn("npx", cmd, { stdio: "inherit", shell: true, cwd: root }).on("exit", (c) => ok(c ?? 1)));
  server.close();
  fs.rmSync(path.join(root, tmp), { recursive: true, force: true });
  if (code !== 0) throw new Error("scene probe render failed");
  const want = range ? range[1] - range[0] + 1 : frames;
  if (got.size < want) throw new Error(`scene probe returned ${got.size}/${want} frames`);
  return got;
};

type Track = { first: number; last: number; rec: ProbeObject; P: number[][]; Q: number[][]; S: number[][]; V: number[]; L?: { color: number[][]; intensity: number[] }; mat: (string | undefined)[] };

const constant = (rows: number[][]) => rows.every((r) => r.every((v, i) => Math.abs(v - rows[0][i]) < 1e-5));

const matKeyOf = (kind: string, m: Record<string, unknown>) => {
  const c = (m.color as number[] | undefined) ?? [1, 1, 1];
  const hx = (v: number[]) => v.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, "0")).join("");
  const parts = [String(m.type).replace(/^Mesh|Material$/g, ""), hx(c)];
  if (typeof m.roughness === "number") parts.push(`r${Math.round((m.roughness as number) * 100)}`);
  if (m.metalness) parts.push(`m${Math.round((m.metalness as number) * 100)}`);
  if (m.emissive && (m.emissive as number[]).some((v) => v > 0)) parts.push(`e${hx(m.emissive as number[])}x${m.emissiveIntensity}`);
  if ((m.opacity as number) < 1) parts.push(`a${Math.round((m.opacity as number) * 100)}`);
  if (m.flat) parts.push("flat");
  if (m.side === 2) parts.push("ds");
  if (m.vertexColors) parts.push("vc");
  if (m.additive) parts.push("add");
  return `${kind}/${parts.join("_")}`;
};

export const buildPlan = async (root: string, slug: string, r: ResolvedEpisode, opts: { range?: [number, number] } = {}): Promise<PlanIndex> => {
  const dir = planDir(root, slug);
  fs.mkdirSync(path.join(dir, "tex"), { recursive: true });
  const t0 = Date.now();
  const frames = await probe(root, slug, r.durationInFrames, opts.range);
  const probeSeconds = (Date.now() - t0) / 1000;
  const order = [...frames.keys()].sort((a, b) => a - b);
  const F0 = order[0];
  const N = order.length;

  // Stores shared by all shots.
  const geomFile = path.join(dir, "geoms.json");
  const geoms: Record<string, Record<string, unknown>> = {};
  const geomKey = new Map<string, string>(); // three uuid → content key
  const texSha = new Map<string, string>(); // "uuid@version" → sha
  const unsupported = new Set<string>();
  for (const f of order) {
    const fr = frames.get(f)!;
    for (const [id, g] of Object.entries(fr.geometries)) {
      const key = `${String(g.kind).replace(/Geometry$/, "")}-${sha(`${g.sig}|${g.position}|${g.index ?? ""}|${g.color ?? ""}`).slice(0, 10)}`;
      geomKey.set(id, key);
      geoms[key] ??= g;
    }
    for (const [id, url] of Object.entries(fr.textures)) {
      const buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
      const h = sha(buf).slice(0, 16);
      texSha.set(id, h);
      const file = path.join(dir, "tex", `${h}.png`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
    }
    fr.unsupported.forEach((u) => unsupported.add(u));
  }
  fs.writeFileSync(geomFile, JSON.stringify(geoms));

  // Tracks per object lifetime (uuid + geometry: a swapped geometry is a new object for Blender).
  const tracks = new Map<string, Track>();
  const mats: Map<number, Record<string, Record<string, unknown>>> = new Map();
  for (const f of order) {
    const fr = frames.get(f)!;
    mats.set(f, fr.materials);
    for (const o of fr.objects) {
      const key = `${o.id}|${o.geom ?? ""}`;
      let t = tracks.get(key);
      if (!t) tracks.set(key, (t = { first: f, last: f, rec: o, P: [], Q: [], S: [], V: [], mat: [], ...(o.light ? { L: { color: [], intensity: [] } } : {}) }));
      // Absent frames in between (unmounted, then mounted again with the same uuid): hold, invisible.
      while (t.first + t.P.length < f) {
        t.P.push(t.P[t.P.length - 1]);
        t.Q.push(t.Q[t.Q.length - 1]);
        t.S.push(t.S[t.S.length - 1]);
        t.V.push(0);
        t.mat.push(t.mat[t.mat.length - 1]);
        t.L?.color.push(t.L.color[t.L.color.length - 1]);
        t.L?.intensity.push(0);
      }
      // Keep quaternions on one hemisphere so keyframe interpolation never takes the long way round.
      const prev = t.Q[t.Q.length - 1];
      const q = prev && prev[0] * o.q[0] + prev[1] * o.q[1] + prev[2] * o.q[2] + prev[3] * o.q[3] < 0 ? o.q.map((v) => -v) : o.q;
      t.P.push(o.p);
      t.Q.push(q);
      t.S.push(o.s);
      t.V.push(o.vis ? 1 : 0);
      t.mat.push(o.mat);
      if (t.L && o.light) {
        t.L.color.push(o.light.color as number[]);
        t.L.intensity.push(o.light.intensity as number);
      }
      t.last = f;
    }
  }

  // Asset tags: actors are `actor:<id>` groups, set items are children of `set:<env>` named by item id.
  const byId = new Map<string, ProbeObject>();
  for (const t of tracks.values()) byId.set(t.rec.id, t.rec);
  const actorKind = new Map(r.actors.map((a) => [a.id, a.actor]));
  const itemKind = new Map(r.layout.items.map((i) => [i.id, i.kind]));
  const assetOf = (o: ProbeObject): { asset: string; kind: string } => {
    let cur: ProbeObject | undefined = o;
    let child: ProbeObject | undefined;
    while (cur) {
      if (cur.name.startsWith("held:")) return { asset: cur.name, kind: itemKind.get(cur.name.slice(5)) ?? cur.name.slice(5) };
      if (cur.name.startsWith("actor:")) return { asset: cur.name, kind: actorKind.get(cur.name.slice(6)) ?? cur.name.slice(6) };
      if (cur.name === "shell") return { asset: "shell", kind: `shell-${r.layout.env}` };
      if (cur.name.startsWith("set:") && child && itemKind.has(child.name)) return { asset: `item:${child.name}`, kind: itemKind.get(child.name)! };
      child = cur;
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }
    return { asset: "scene", kind: `scene-${slug}` };
  };

  // Shots = runs of the camera's shot index.
  const shotRuns: { index: number; start: number; end: number }[] = [];
  for (const f of order) {
    const k = frames.get(f)!.camera.shot;
    const last = shotRuns[shotRuns.length - 1];
    if (last && last.index === k && last.end === f) last.end = f + 1;
    else shotRuns.push({ index: k, start: f, end: f + 1 });
  }

  const shots: ShotInfo[] = [];
  for (const run of shotRuns) {
    const { start, end } = run;
    const n = end - start;
    const slice = <T,>(t: Track, arr: T[]): T[] => {
      const out: T[] = [];
      for (let f = start; f < end; f++) out.push(arr[Math.min(arr.length - 1, Math.max(0, f - t.first))]);
      return out;
    };
    const present = (t: Track, f: number) => f >= t.first && f <= t.last;
    const objects: Record<string, unknown>[] = [];
    const usedMats = new Map<string, { kind: string; frames: (Record<string, unknown> | undefined)[] }>();
    const live = new Set<string>();
    // Pass 1: which objects matter in this shot (visible mesh/light, and their ancestors).
    const visibleIn = (t: Track) => {
      for (let f = start; f < end; f++) if (present(t, f) && t.V[f - t.first]) return true;
      return false;
    };
    const trackOfObj = new Map<string, Track[]>();
    for (const t of tracks.values()) trackOfObj.set(t.rec.id, [...(trackOfObj.get(t.rec.id) ?? []), t]);
    for (const [key, t] of tracks) {
      if (!(t.rec.geom || t.rec.light) || !visibleIn(t)) continue;
      live.add(key);
      let p = t.rec.parent;
      while (p) {
        for (const pt of trackOfObj.get(p) ?? []) live.add(`${pt.rec.id}|${pt.rec.geom ?? ""}`);
        p = byId.get(p)?.parent ?? null;
      }
    }
    for (const [key, t] of tracks) {
      if (!live.has(key)) continue;
      const P = slice(t, t.P);
      const Q = slice(t, t.Q);
      const S = slice(t, t.S);
      const V = Array.from({ length: n }, (_, i) => (present(t, start + i) ? t.V[start + i - t.first] : 0));
      const { asset, kind } = assetOf(t.rec);
      const o: Record<string, unknown> = {
        key,
        id: t.rec.id,
        parent: t.rec.parent,
        name: t.rec.name,
        type: t.rec.type,
        asset,
        kind,
        P: constant(P) ? P[0] : P.flat(),
        Q: constant(Q) ? Q[0] : Q.flat(),
        S: constant(S) ? S[0] : S.flat(),
        V: V.every((v) => v === V[0]) ? V[0] : V,
      };
      if (t.rec.geom) {
        o.geom = geomKey.get(t.rec.geom);
        o.shadow = t.rec.shadow;
        if (t.rec.points) o.points = t.rec.points;
        // The material of the first frame the object is visible in this shot.
        const mids = slice(t, t.mat);
        const mid = mids.find((m, i) => m && V[i]) ?? mids.find(Boolean);
        if (mid) {
          const mk = `${kind}|${mid}`;
          o.mat = mk;
          if (!usedMats.has(mk)) usedMats.set(mk, { kind, frames: Array.from({ length: n }, (_, i) => mats.get(start + i)?.[mid]) });
        }
      }
      if (t.L && t.rec.light) {
        const col = slice(t, t.L.color);
        const inten = slice(t, t.L.intensity).map((v, i) => (V[i] ? v : 0));
        o.light = { ...t.rec.light, color: constant(col) ? col[0] : col.flat(), intensity: inten.every((v) => v === inten[0]) ? inten[0] : inten };
        o.V = 1; // lights are switched by intensity (keeps them editable in Blender)
      }
      objects.push(o);
    }
    // Materials: static spec + only the properties that animate in this shot.
    const materials: Record<string, unknown> = {};
    for (const [mk, { kind, frames: fr }] of usedMats) {
      const firstDef = fr.find(Boolean)!;
      const filled = fr.map((m) => m ?? firstDef);
      const anim: Record<string, unknown> = {};
      for (const prop of ["color", "emissive"] as const) {
        const rows = filled.map((m) => (m[prop] as number[] | undefined) ?? [0, 0, 0]);
        if (firstDef[prop] && !constant(rows)) anim[prop] = rows.flat();
      }
      for (const prop of ["emissiveIntensity", "opacity"] as const) {
        const vals = filled.map((m) => (m[prop] as number | undefined) ?? 1);
        if (vals.some((v) => Math.abs(v - vals[0]) > 1e-5)) anim[prop] = vals;
      }
      const maps: Record<string, unknown> = {};
      for (const prop of ["map", "emissiveMap"] as const) {
        if (!firstDef[prop]) continue;
        const shas = filled.map((m) => texSha.get(m[prop] as string) ?? "");
        maps[prop] = shas.every((s) => s === shas[0]) ? shas[0] : shas;
      }
      const animated = Object.keys(anim).length > 0 || Object.values(maps).some(Array.isArray);
      materials[mk] = { ...firstDef, map: undefined, emissiveMap: undefined, ...maps, anim, lib: animated || firstDef.map || firstDef.emissiveMap ? null : matKeyOf(kind, firstDef) };
    }
    const cams = order.filter((f) => f >= start && f < end).map((f) => frames.get(f)!.camera);
    const bgs = order.filter((f) => f >= start && f < end).map((f) => frames.get(f)!.scene.background ?? [0, 0, 0]);
    const shot = r.shots[run.index];
    const body = {
      version: PLAN_VERSION,
      slug,
      name: `shot-${String(start).padStart(4, "0")}`,
      index: run.index,
      type: shot?.type ?? "shot",
      start,
      end,
      fps: r.fps,
      width: r.width,
      height: r.height,
      camera: { P: cams.flatMap((c) => c.p), Q: cams.flatMap((c) => c.q), fov: cams.map((c) => c.fov), focus: cams.map((c) => (c.focus ? [c.focus.distance, c.focus.bokeh] : [0, 0])).flat() },
      background: constant(bgs) ? bgs[0] : bgs.flat(),
      environmentIntensity: frames.get(start)!.scene.environmentIntensity ?? 0,
      objects,
      materials,
    };
    const text = JSON.stringify(body);
    const file = path.join(dir, `${body.name}.json`);
    fs.writeFileSync(file, text);
    shots.push({ name: body.name, index: run.index, type: body.type, start, end, hash: sha(text).slice(0, 16), file: path.relative(root, file) });
  }
  const index: PlanIndex = { version: PLAN_VERSION, slug, fps: r.fps, width: r.width, height: r.height, frames: N, shots, unsupported: [...unsupported], probeSeconds };
  if (!opts.range || F0 === 0) fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(index, null, 1));
  return index;
};
