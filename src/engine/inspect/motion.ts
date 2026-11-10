// Motion: unintended teleports (a big jump between two frames without a cut) and jitter (fast
// back-and-forth) on actors' roots, heads and hands and on the camera. Cuts, shakes and moves with a
// snap/in ease are deliberate; `allow: ["abrupt"]` marks anything else as deliberate.
import type { Vec3 } from "../core/time";
import { sourceOf } from "../core/trace";
import { dist3, type InspectContext } from "./context";
import { hitCollector, type Finding } from "./findings";

/**
 * A teleport is a discontinuity: a point moving more than this fraction of the actor's height in one frame
 * (≈7.5 heights/s) AND at least SPIKE× the median step of the surrounding frames (fast smooth moves pass).
 */
const TELEPORT = 0.25;
const SPIKE = 3;
/** Jitter: at least this many direction reversals in 0.5 s, each step ≥ STEP metres, spanning ≥ SPAN metres. */
const REVERSALS = 4;
const STEP = 0.006;
const SPAN = 0.03;
const DELIBERATE_EASES = new Set(["snap", "in"]);

export const motionChecks = (ctx: InspectContext): Finding[] => {
  const out = hitCollector(ctx.fps);
  const n = ctx.frames.length;
  const cutAt = (f: number) => f > 0 && ctx.shotOf[f] !== ctx.shotOf[f - 1];
  const shaking = (f: number) => ctx.r.fx.some((x) => x.type === "shake" && f / ctx.fps >= x.at && f / ctx.fps <= x.end);

  const scan = (points: (f: number) => Vec3 | undefined, size: number, report: (f: number, kind: "teleport" | "jitter", measure: number) => void, skip: (f: number) => boolean = () => false) => {
    const steps: (Vec3 | null)[] = [];
    for (let f = 1; f < n; f++) {
      const a = points(f - 1);
      const b = points(f);
      if (!a || !b || cutAt(f) || skip(f)) {
        steps[f] = null;
        continue;
      }
      steps[f] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    }
    const len = (f: number) => (steps[f] ? Math.hypot(...steps[f]!) : undefined);
    for (let f = 1; f < n; f++) {
      const d = len(f);
      if (d === undefined || d <= TELEPORT * size) continue;
      const around: number[] = [];
      for (let g = f - 5; g <= f + 5; g++) if (g !== f && len(g) !== undefined) around.push(len(g)!);
      around.sort((x, y) => x - y);
      const median = around.length ? around[Math.floor(around.length / 2)] : 0;
      if (d > SPIKE * median) report(f, "teleport", d);
    }
    const win = Math.round(ctx.fps / 2);
    for (let f = win; f < n; f++) {
      let reversals = 0;
      let lo: Vec3 | undefined;
      let span = 0;
      for (let g = f - win + 2; g <= f; g++) {
        const s0 = steps[g - 1];
        const s1 = steps[g];
        if (!s0 || !s1) continue;
        const l0 = Math.hypot(...s0);
        const l1 = Math.hypot(...s1);
        if (l0 > STEP && l1 > STEP && s0[0] * s1[0] + s0[1] * s1[1] + s0[2] * s1[2] < 0) reversals++;
        const p = points(g);
        if (p) {
          lo ??= p;
          span = Math.max(span, dist3(lo, p));
        }
      }
      if (reversals >= REVERSALS && span > SPAN) report(f, "jitter", reversals);
    }
  };

  for (const a of ctx.actors) {
    const def = ctx.defs[a.actor];
    const size = (def?.size.height ?? 1.7) * a.scale;
    const parts: [string, (f: number) => Vec3 | undefined][] = [
      ["root", (f) => ctx.frameOf(f, a.id)?.position],
      ["head", (f) => ctx.body(f, a.id)?.points.head ?? ctx.frameOf(f, a.id)?.anchors.head],
      ["handL", (f) => ctx.body(f, a.id)?.points.handL],
      ["handR", (f) => ctx.body(f, a.id)?.points.handR],
    ];
    const rootJumps = new Set<number>();
    for (const [part, at] of parts) {
      scan(at, size, (f, kind, measure) => {
        if (kind === "jitter" && part.startsWith("hand")) return; // gestures (typing, waving) oscillate on purpose
        // A head or hand jumping with the whole body is the same event as the root's jump.
        if (kind === "teleport" && part === "root") rootJumps.add(f);
        else if (kind === "teleport" && rootJumps.has(f)) return;
        const t = f / ctx.fps;
        // What moves this point most: the root follows moves/turns; hands follow joints, poses, gestures.
        const order: Parameters<InspectContext["responsible"]>[2] = part === "root" ? ["move", "turn"] : part === "head" ? ["override", "look", "pose", "gesture", "turn", "move"] : ["override", "pose", "gesture", "move", "turn", "look"];
        const cue = ctx.responsible(a.id, t, order);
        const byEase = !!cue?.ease && DELIBERATE_EASES.has(cue.ease);
        out.add(f, {
          key: `${kind}:${a.id}:${part}`,
          check: "motion",
          kind,
          level: "warning",
          object: part === "root" ? a.id : `${a.id}.${part}`,
          source: cue?.source ?? ctx.placementSource(a.id, t),
          related: cue?.related,
          intent: "abrupt",
          accepted: byEase || ctx.accepted("abrupt", cue?.allow, ctx.castAllow(a.id)),
          measure,
          message:
            kind === "teleport"
              ? `${a.id}'s ${part} jumps ${measure.toFixed(2)} m in one frame — lengthen the move/transition, or use ease "snap"/allow "abrupt" if the jump is the point`
              : `${a.id}'s ${part} jitters back and forth — smooth the cue (longer transition, fewer overlapping cues)`,
        });
      });
    }
  }

  // The camera: jumps inside a shot (not at cuts/blends) and jitter outside shakes (shake frames are skipped).
  scan((f) => ctx.frames[f]?.camera.position, 1, (f, kind, measure) => {
    const cam = ctx.frames[f].camera;
    const dist = dist3(cam.position, cam.target);
    if (kind === "teleport" && measure < 0.2 * dist) return;
    const shot = ctx.r.shots[ctx.shotOf[f]];
    out.add(f, {
      key: `${kind}:camera:${ctx.shotOf[f]}`,
      check: "motion",
      kind,
      level: "warning",
      object: "camera",
      source: shot ? sourceOf(ctx.trace, shot) : undefined,
      intent: "abrupt",
      accepted: ctx.accepted("abrupt", shot?.allow),
      measure,
      message: kind === "teleport" ? `the camera jumps ${measure.toFixed(2)} m within a shot — check moves/blend/follow on this shot` : "the camera jitters — check handheld amount, follow lag or competing moves",
    });
  }, shaking);
  return out.findings();
};
