// explain: why an actor or the camera is in its state at time t — every layer (placement, pose,
// emotion, gestures, look, joints overrides, holds, speech) with its progress and the episode.json
// entry it came from, plus how fast key points move and the findings at that moment.
import { moveSegments } from "../actors/rig";
import type { FocusTarget } from "../camera/solve";
import { envelope, progress, type Vec3 } from "../core/time";
import { sourceOf } from "../core/trace";
import { dist3, type InspectContext } from "./context";
import { formatFinding, type Finding } from "./findings";

const f2 = (v: number) => v.toFixed(2);
const v3 = (p: Vec3) => `[${p.map(f2).join(", ")}]`;
const pct = (u: number) => `${Math.round(u * 100)}%`;
const src = (ctx: InspectContext, cue: object) => sourceOf(ctx.trace, cue) ?? "(engine)";
const describeTarget = (t: unknown): string => (t === null ? "nothing (looks ahead)" : t === "camera" ? "the camera" : Array.isArray(t) ? v3(t as Vec3) : typeof t === "object" && t && "actor" in t ? `${(t as { actor: string }).actor}.${(t as { anchor?: string }).anchor ?? "head"}` : String(t));
const describeFocus = (f: FocusTarget | "auto" | "none" | undefined) => (!f || f === "auto" ? "auto (speaker, else first subject)" : f === "none" ? "none" : Array.isArray(f) ? v3(f) : "actor" in f ? `${f.actor}.${f.anchor ?? "face"}` : `${f.item}.${f.anchor ?? "center"}`);

const overlapping = (findings: Finding[], t: number, object: (o: string) => boolean) => findings.filter((f) => t >= f.from - 0.05 && t <= f.to + 0.05 && object(f.object));

export const explainActor = (ctx: InspectContext, id: string, t: number, findings: Finding[] = []): string[] => {
  const track = ctx.tracks[id];
  if (!track) return [`no actor "${id}" (cast: ${ctx.actors.map((a) => a.id).join(", ")})`];
  const f = Math.max(0, Math.min(ctx.frames.length - 1, Math.round(t * ctx.fps)));
  const frame = ctx.frameOf(f, id)!;
  const out: string[] = [`${id} (${track.def.id}) at ${f2(t)}s, frame ${f}`];
  const last = <T extends { at: number }>(cues: T[]) => cues.filter((c) => c.at <= t).at(-1);

  // Placement.
  const seg = moveSegments(track).find((s) => t >= s.start && t <= s.end);
  out.push(`  place    ${v3(frame.position)} yaw ${f2((frame.yaw * 180) / Math.PI)}° scale ${frame.scale}${seg ? `  moving ${v3(seg.from)} → ${v3(seg.to)} ${pct(progress(t, seg.start, seg.end - seg.start, "linear"))} (ease ${seg.ease}) ← ${src(ctx, seg.cue)}` : `  ← ${ctx.placementSource(id, t) ?? "cast"}`}`);
  // Pose / emotion.
  const pose = last(track.poses);
  out.push(`  pose     ${frame.pose}${pose ? ` (${pct(progress(t, pose.at, pose.transition ?? 0.4, "linear"))} in) ← ${src(ctx, pose)}` : " (default)"}`);
  const emo = last(track.emotions);
  out.push(`  emotion  ${emo ? `${emo.emotion} (${pct(progress(t, emo.at, emo.transition ?? 0.22, "linear"))} in) ← ${src(ctx, emo)}` : `${track.def.defaultEmotion} (default)`}`);
  // Gestures.
  for (const g of track.gestures) {
    const gd = track.def.gestures[g.gesture];
    const dur = (gd?.duration ?? 1) / (g.speed ?? 1);
    if (t >= g.at && t <= g.at + dur) out.push(`  gesture  ${g.gesture} ${pct((t - g.at) / dur)}${g.intensity !== undefined ? ` ×${g.intensity}` : ""} ← ${src(ctx, g)}`);
  }
  // Look.
  const look = last(track.looks);
  if (look) out.push(`  look     ${describeTarget(look.target)} (${pct(progress(t, look.at, look.transition ?? 0.35, "linear"))} in) ← ${src(ctx, look)}`);
  // Joints overrides.
  for (const o of track.overrides) {
    const blend = o.blend ?? 0.25;
    const w = envelope(t, o.at, o.duration === undefined ? Infinity : o.at + o.duration, blend, blend);
    if (w > 0) out.push(`  joints   weight ${f2(w)} (${o.mode ?? "absolute"}, blend ${blend}s) ${Object.keys(o.set).join(", ")} ← ${src(ctx, o)}`);
  }
  // Holds and speech.
  for (const [socket, item] of Object.entries(frame.held)) {
    const h = track.holds.filter((x) => x.at <= t && x.socket === socket).at(-1);
    out.push(`  holds    ${item} in ${socket}${h ? ` ← ${src(ctx, h)}` : ""}`);
  }
  const line = ctx.r.lines.find((l) => l.speaker === id && t >= l.start && t <= l.end);
  if (line) out.push(`  speaks   ${line.id} "${line.text}" talk ${f2(track.talk?.(t) ?? 0)}`);
  // Key points and their speed (m per frame) from the previous frame.
  const body = ctx.body(f, id);
  const prev = f > 0 ? ctx.body(f - 1, id) : undefined;
  if (body) {
    const pts = ["head", "handL", "handR", "footL", "footR"].filter((k) => body.points[k]);
    out.push(`  points   ${pts.map((k) => `${k} ${v3(body.points[k])}${prev?.points[k] ? ` Δ${f2(dist3(body.points[k], prev.points[k]))}` : ""}`).join("  ")}`);
  }
  for (const fi of overlapping(findings, t, (o) => o === id || o.startsWith(`${id}.`))) out.push(`  finding  ${formatFinding(fi)}`);
  return out;
};

export const explainCamera = (ctx: InspectContext, t: number, findings: Finding[] = []): string[] => {
  const f = Math.max(0, Math.min(ctx.frames.length - 1, Math.round(t * ctx.fps)));
  const cam = ctx.frames[f].camera;
  const k = ctx.shotOf[f];
  const shot = ctx.r.shots[k];
  const out = [`camera at ${f2(t)}s, frame ${f}: shot ${k} ${shot.type}${shot.subjects.length ? ` on ${shot.subjects.join("+")}` : ""} ${f2(shot.at)}–${f2(shot.end)}s (${pct((t - shot.at) / Math.max(1e-6, shot.end - shot.at))}) ← ${src(ctx, shot)}`];
  const authored = (["angle", "height", "distance", "lens", "fov", "size", "offset", "position", "target", "roll", "lock", "blend"] as const).filter((key) => shot[key] !== undefined).map((key) => `${key} ${JSON.stringify(shot[key])}`);
  if (authored.length) out.push(`  authored ${authored.join(", ")}`);
  if (shot.moves?.length) out.push(`  moves    ${shot.moves.map((m) => `${m.type}${m.amount !== undefined ? ` ${m.amount}` : ""} (${m.ease ?? "smooth"})`).join(", ")} — each spans the whole shot`);
  if (shot.track || shot.follow) out.push(`  tracking ${shot.track ? `track ${JSON.stringify(shot.track)}` : ""}${shot.follow ? ` follow ${JSON.stringify(shot.follow)}` : ""}`);
  out.push(`  pose     position ${v3(cam.position)} target ${v3(cam.target)} fov ${f2(cam.fov)}°${cam.roll ? ` roll ${f2(cam.roll)}°` : ""}`);
  out.push(`  focus    ${describeFocus(shot.focus)}${cam.focus ? ` → ${v3(cam.focus.point)} at ${f2(cam.focus.distance)} m (bokeh ${f2(cam.focus.bokeh)})` : " (no depth of field)"}`);
  const shake = ctx.r.fx.filter((x) => x.type === "shake" && t >= x.at && t <= x.end);
  if (shake.length) out.push(`  shake    ${shake.map((x) => sourceOf(ctx.trace, x) ?? "fx").join(", ")}`);
  for (const fi of overlapping(findings, t, (o) => o === "camera")) out.push(`  finding  ${formatFinding(fi)}`);
  return out;
};
