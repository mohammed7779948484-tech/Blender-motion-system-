// Checks that need no rendering. validate: direction, audio readiness, solver notes, the beat sheet and
// every inspect finding. inspect: the findings alone, in detail or as JSON.
import fs from "node:fs";
import path from "node:path";
import { auditAudio, isMissingFile } from "../../src/engine/audio/audit";
import { voiceFindings } from "../../src/engine/audio/voiceReport";
import { shotLayout } from "../../src/engine/camera/solve";
import { beatSheet } from "../../src/engine/core/pacing";
import { createTrace } from "../../src/engine/core/trace";
import { createContext } from "../../src/engine/inspect/context";
import { explainActor, explainCamera } from "../../src/engine/inspect/explain";
import { formatFinding, type Finding } from "../../src/engine/inspect/findings";
import { inspectEpisode } from "../../src/engine/inspect/inspect";
import { buildTracks, makeQuery } from "../../src/engine/player/scene";
import { readManifest } from "../voice";
import { fail, flag, has, positional, publicExists, resolve, ROOT, videoDir } from "./shared";

const MARK = { error: "✖", warning: "⚠", note: "·" } as const;

/** Resolve with provenance and run every check. */
export const findingsFor = async (slug: string) => {
  const trace = createTrace();
  const { resolved, actorDefs } = await resolve(slug, { trace });
  return { resolved, actorDefs, trace, findings: inspectEpisode(resolved, { actorDefs, trace }) };
};

const printFindings = (findings: Finding[]) => {
  for (const f of findings.filter((x) => !x.accepted)) console.log(`${MARK[f.level]} ${formatFinding(f)}`);
  for (const f of findings.filter((x) => x.accepted)) console.log(`~ accepted by intent: ${formatFinding(f)}`);
};

const summary = (findings: Finding[]) => {
  const open = findings.filter((f) => !f.accepted);
  const n = (level: Finding["level"]) => open.filter((f) => f.level === level).length;
  return `${n("error")} error(s), ${n("warning")} warning(s), ${n("note")} note(s), ${findings.length - open.length} accepted`;
};

export const validate = async () => {
  const slug = positional[1] ?? fail("usage: validate <slug>");
  const { resolved: r, actorDefs, findings } = await findingsFor(slug);
  const problems: string[] = [];
  const notes: string[] = [...r.warnings];
  if (!fs.existsSync(path.join(videoDir(slug), "BRIEF.md"))) notes.push("no BRIEF.md: write the hook, beats and payoff before directing (npm run cli -- new writes a template)");
  // Missing files are errors even for drafts; unvoiced/stale lines only block final renders.
  const audio = auditAudio(r, publicExists);
  for (const e of audio.errors) (isMissingFile(e) ? problems : notes).push(e);
  notes.push(...audio.warnings);
  const manifest = readManifest(ROOT, slug);
  const vf = voiceFindings(r, manifest);
  notes.push(...vf.warnings, ...vf.notes);
  if (process.env.ELEVENLABS_API_KEY && manifest && Object.values(manifest.lines).some((l) => l.provider !== "elevenlabs")) notes.push("info: clips use offline voices; `voice <slug> --provider elevenlabs` would re-voice them (paid, changes timing)");
  // Solver notes (authored angles that are blocked, corrections it made).
  const q = makeQuery(r, buildTracks(r, actorDefs));
  r.shots.forEach((shot, i) => {
    for (const w of shotLayout(shot, q).warnings) notes.push(`shot ${i} (${shot.type}${shot.subjects.length ? ` ${shot.subjects.join("+")}` : ""} @ ${shot.at.toFixed(2)}s): ${w}`);
  });

  console.log(`${r.title} — ${r.width}×${r.height} @ ${r.fps}fps, ${r.duration.toFixed(2)}s (${r.durationInFrames} frames), ${r.shots.length} shots, ${r.lines.length} lines · engine ${r.behaviour.engine}, profile ${r.behaviour.profile}`);
  // Beat sheet: everything that happens, in time order (review pacing without rendering).
  for (const b of beatSheet(r)) console.log(`  ${b.at.toFixed(2).padStart(6)}${b.kind === "line" ? `–${b.end!.toFixed(2).padEnd(6)}` : " ".repeat(7)} ${b.kind.padEnd(6)} ${b.text}`);
  for (const n of notes) console.log(`⚠ ${n}`);
  printFindings(findings);
  for (const p of problems) console.log(`✖ ${p}`);
  const errors = findings.filter((f) => f.level === "error" && !f.accepted).length + problems.length;
  console.log(`inspect: ${summary(findings)}  (details/JSON: npm run cli -- inspect ${slug} [--json])`);
  if (errors) process.exit(1);
  console.log(`✔ ${slug} is valid${notes.length ? ` (${notes.length} other warning${notes.length > 1 ? "s" : ""})` : ""}`);
  console.log(audio.errors.length ? `  final render: not ready (${audio.errors.length} audio issue${audio.errors.length > 1 ? "s" : ""} above); drafts: \`render ${slug} --draft\`` : "  final render: ready");
};

/** Every check, with time, object, source and intent; `--json` for tools. Exits 1 on unaccepted errors. */
export const inspect = async () => {
  const slug = positional[1] ?? fail("usage: inspect <slug> [--json]");
  const t0 = performance.now();
  const { resolved: r, findings } = await findingsFor(slug);
  if (has("json")) console.log(JSON.stringify(findings, null, 1));
  else {
    printFindings(findings);
    console.log(`${r.id}: ${summary(findings)} over ${r.durationInFrames} frames in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  if (findings.some((f) => f.level === "error" && !f.accepted)) process.exit(1);
};

/** Why the camera / an actor is in its state at a time: every layer with its progress and source. */
export const explain = async () => {
  const slug = positional[1] ?? fail("usage: explain <slug> --t <seconds> [--actor <id> | --camera]");
  const t = Number(flag("t"));
  if (!Number.isFinite(t)) fail("explain needs --t <seconds>");
  const { resolved, actorDefs, trace, findings } = await findingsFor(slug);
  const ctx = createContext(resolved, { actorDefs, trace });
  const actor = flag("actor");
  const lines = actor ? explainActor(ctx, actor, t, findings) : has("camera") ? explainCamera(ctx, t, findings) : [...explainCamera(ctx, t, findings), ...resolved.actors.flatMap((a) => explainActor(ctx, a.id, t, findings))];
  console.log(lines.join("\n"));
};
