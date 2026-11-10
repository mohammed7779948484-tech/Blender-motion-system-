// Shot grammar and pacing: observations phrased as questions (notes), with thresholds from the
// episode's profile. Static runs, very short shots and silences are often exactly right.
import { profileOf } from "../core/behaviour";
import { pacingFindings } from "../core/pacing";
import { sourceOf } from "../core/trace";
import type { InspectContext } from "./context";
import type { Finding } from "./findings";

export const grammarChecks = (ctx: InspectContext): Finding[] => {
  const { r } = ctx;
  const profile = profileOf(r.behaviour);
  const out: Finding[] = [];

  // Runs of static shots (no move, track or follow).
  const isStatic = (k: number) => {
    const s = r.shots[k];
    return !s.moves?.some((m) => m.type !== "static") && !s.track && !s.follow;
  };
  let runStart = -1;
  for (let k = 0; k <= r.shots.length; k++) {
    if (k < r.shots.length && isStatic(k)) {
      if (runStart < 0) runStart = k;
      continue;
    }
    if (runStart >= 0 && k - runStart >= profile.staticRun) {
      const shots = r.shots.slice(runStart, k);
      out.push({
        check: "grammar",
        kind: "static-run",
        level: "note",
        object: "camera",
        from: shots[0].at,
        to: shots.at(-1)!.end,
        source: `${sourceOf(ctx.trace, shots[0]) ?? `shot ${runStart}`} … ${sourceOf(ctx.trace, shots.at(-1)!) ?? `shot ${k - 1}`}`,
        intent: "static",
        accepted: ctx.accepted("static", ...shots.map((s) => s.allow)),
        measure: k - runStart,
        message: `${k - runStart} static shots in a row — intended stillness? Otherwise give some a move (push-in, truck, orbit, follow) where the scene has energy`,
      });
    }
    runStart = -1;
  }

  // Very short shots (except the last).
  r.shots.slice(0, -1).forEach((s) => {
    const len = s.end - s.at;
    if (len < profile.minShot)
      out.push({ check: "grammar", kind: "short-shot", level: "note", object: "camera", from: s.at, to: s.end, source: sourceOf(ctx.trace, s), intent: "quick-cuts", accepted: ctx.accepted("quick-cuts", s.allow), measure: len, message: `a ${len.toFixed(2)} s shot — readable? Hold it longer unless it is a deliberate flash/montage cut` });
  });

  // Pacing (hook, dead air).
  for (const p of pacingFindings(r, profile)) out.push({ check: "pacing", kind: p.kind, level: "note", object: "episode", from: p.at, to: p.at, intent: p.intent, accepted: ctx.accepted(p.intent), message: p.text.replace(/^pacing: /, "") });
  return out;
};
