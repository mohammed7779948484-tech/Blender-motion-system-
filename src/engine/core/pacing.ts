// Editorial heuristics for short-form pacing (soft warnings, never errors) and a time-sorted beat
// sheet for reviewing an episode without rendering. Pure.
import type { ResolvedEpisode } from "./timeline";

export type Beat = { at: number; end?: number; kind: "line" | "cut" | "action" | "sfx" | "fx" | "event" | "props" | "light"; text: string };

/** Everything that happens on screen or in the soundtrack, in time order. */
export const beatSheet = (r: ResolvedEpisode): Beat[] => {
  const beats: Beat[] = [];
  for (const l of r.lines) beats.push({ at: l.start, end: l.end, kind: "line", text: `${l.voiced ? "♪" : "·"} ${l.id} ${l.speaker}: ${l.text}` });
  r.shots.forEach((s, i) => beats.push({ at: s.at, kind: "cut", text: `${i === 0 ? "open" : "cut"}: ${s.type}${s.subjects.length ? ` ${s.subjects.join("+")}` : s.item ? ` ${s.item}` : ""}${s.moves?.length ? ` (${s.moves.map((m) => m.type).join(", ")})` : ""}` }));
  for (const a of r.actors) {
    for (const g of a.gestures) beats.push({ at: g.at, end: g.at + 1, kind: "action", text: `${a.id} ${g.gesture}` });
    for (const m of a.moves) beats.push({ at: m.at, end: m.at + (m.duration ?? 1), kind: "action", text: `${a.id} moves` });
    for (const p of a.poses) if (p.at > 0) beats.push({ at: p.at, end: p.at + (p.transition ?? 0.4), kind: "action", text: `${a.id} → ${p.pose}` });
    for (const e of a.emotions) if (e.at > 0) beats.push({ at: e.at, end: e.at + 0.4, kind: "action", text: `${a.id} feels ${e.emotion}` });
    for (const h of a.holds) beats.push({ at: h.at, end: h.at + 0.3, kind: "action", text: `${a.id} ${h.item ? `holds ${h.item}` : `releases ${h.socket}`}` });
    for (const o of a.overrides) beats.push({ at: o.at, end: o.at + (o.duration ?? 0.5), kind: "action", text: `${a.id} joints` });
  }
  for (const s of r.sfx) beats.push({ at: s.at, end: s.at + 0.3, kind: "sfx", text: `sfx ${s.src.replace(/^.*\//, "")}` });
  for (const f of r.fx ?? []) beats.push({ at: f.at, end: f.end, kind: "fx", text: `fx ${f.type}${typeof f.data.text === "string" ? ` "${f.data.text}"` : typeof f.data.kind === "string" ? ` ${f.data.kind}` : ""}` });
  for (const e of r.events) beats.push({ at: e.at, end: e.end, kind: "event", text: `event ${e.name}` });
  for (const p of r.props) beats.push({ at: p.at, end: p.at + 0.5, kind: "props", text: `${p.item} ← ${Object.keys(p.set).join(", ")}` });
  for (const m of r.moods) beats.push({ at: m.at, end: m.at + (m.transition ?? 0), kind: "light", text: `mood ${typeof m.mood === "string" ? m.mood : "custom"}` });
  return beats.sort((x, y) => x.at - y.at);
};

/** A pacing observation; `intent` names the `allow` entry that marks it as deliberate. */
export type PacingFinding = { kind: "hook" | "dead-air"; intent: "slow-open" | "silence"; at: number; text: string };

/** Pacing observations: nothing happening in the first `hook` seconds, or stretches over `deadAir` seconds. */
export const pacingFindings = (r: ResolvedEpisode, opts: { hook?: number; deadAir?: number } = {}): PacingFinding[] => {
  const hook = opts.hook ?? 1.5;
  const dead = opts.deadAir ?? 1.5;
  const beats = beatSheet(r).filter((b) => !(b.kind === "cut" && b.at === 0));
  const found: PacingFinding[] = [];
  if (!beats.some((b) => b.at < hook)) found.push({ kind: "hook", intent: "slow-open", at: 0, text: `pacing: nothing is said, heard or changes in the first ${hook}s — open on the hook (a line, a sound hit, an action or a cut)` });
  // Gaps where nothing is active (lines, moves, events span time; cuts/sfx/props count as instants).
  const spans = beats.map((b) => [b.at, Math.max(b.end ?? b.at, b.at + 0.25)] as const).sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  const lastBusy = Math.max(0, ...spans.map((s) => s[1]));
  for (const [a, b] of spans) {
    if (a - cursor > dead && cursor < lastBusy) found.push({ kind: "dead-air", intent: "silence", at: cursor, text: `pacing: ${(a - cursor).toFixed(1)}s of dead air ${cursor.toFixed(2)}–${a.toFixed(2)}s (no line, action, cut or sound)` });
    cursor = Math.max(cursor, b);
  }
  return found;
};

/** Short-form pacing notes: a hook in the first 1.5 s and no dead air longer than 1.5 s. */
export const pacingNotes = (r: ResolvedEpisode, opts: { hook?: number; deadAir?: number } = {}): string[] => pacingFindings(r, opts).map((f) => f.text);
