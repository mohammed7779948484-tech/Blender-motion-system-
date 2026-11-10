// Camera: the rendered camera never sits inside set geometry; cuts land between words and change the
// framing enough; cuts keep two characters on their sides of the line; focus lands on something
// visible and doesn't jump within a shot.
import type { CameraFrame, FocusTarget, Shot } from "../camera/solve";
import type { Vec3 } from "../core/time";
import { sourceOf } from "../core/trace";
import type { Box } from "../world/layout";
import type { InspectContext } from "./context";
import { hitCollector, type Finding } from "./findings";

/** Depth (metres) of a point inside a yaw-rotated box, or 0 when outside. */
const insideDepth = (p: Vec3, b: Box) => {
  const dx = p[0] - b.center[0];
  const dz = p[2] - b.center[2];
  const c = Math.cos(-b.yaw);
  const s = Math.sin(-b.yaw);
  const local = [dx * c + dz * s, p[1] - b.center[1], -dx * s + dz * c];
  const depth = Math.min(b.half[0] - Math.abs(local[0]), b.half[1] - Math.abs(local[1]), b.half[2] - Math.abs(local[2]));
  return Math.max(0, depth);
};

const focusName = (shot: Shot): string => {
  const f: FocusTarget | "auto" | "none" | undefined = shot.focus;
  if (!f || f === "auto" || f === "none") return "focus point";
  if (Array.isArray(f)) return `[${f.map((v) => v.toFixed(2)).join(", ")}]`;
  return "actor" in f ? `${f.actor}.${f.anchor ?? "face"}` : `${f.item}.${f.anchor ?? "center"}`;
};

/** Horizontal yaw (radians) of the camera's view direction. */
const viewYaw = (c: CameraFrame) => Math.atan2(c.target[0] - c.position[0], c.target[2] - c.position[2]);
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export const cameraChecks = (ctx: InspectContext): Finding[] => {
  const out = hitCollector(ctx.fps);
  const { r } = ctx;
  const boxes = ctx.sweep.query.occluders.filter((b) => !b.id.startsWith("wall:"));
  const floor = r.layout.shell.floor !== "none";

  ctx.frames.forEach((fr, f) => {
    const k = ctx.shotOf[f];
    const shot = r.shots[k];
    const source = shot ? sourceOf(ctx.trace, shot) : undefined;
    const cam = fr.camera;

    // Inside geometry (or under the floor).
    for (const b of boxes) {
      const d = insideDepth(cam.position, b);
      if (d > 0.01) out.add(f, { key: `inside:${k}:${b.id}`, check: "camera", kind: "inside-occluder", level: "error", object: "camera", with: b.id, source, measure: d, message: `the camera is inside "${b.id}" — shorten the move, change the angle/position, or remove/move the item for this shot` });
    }
    if (floor && cam.position[1] < 0.03) out.add(f, { key: `floor:${k}`, check: "camera", kind: "inside-occluder", level: "error", object: "camera", with: "floor", source, measure: 0.03 - cam.position[1], message: "the camera is below the floor — raise it (height) or shorten the move" });

    // Focus on something the viewer can't see.
    if (cam.focus) {
      const s = ctx.toScreen(cam, cam.focus.point);
      // Auto focus follows the subject: if it leaves the frame on purpose (offscreen), so does the focus.
      const autoFocus = !shot?.focus || shot.focus === "auto";
      const accepted = ctx.accepted("soft-focus", shot?.allow) || (autoFocus && ctx.accepted("offscreen", shot?.allow));
      if (!s || Math.abs(s.ndc.x) > 1.05 || Math.abs(s.ndc.y) > 1.05)
        out.add(f, { key: `focusoff:${k}`, check: "camera", kind: "focus-off-screen", level: "warning", object: "camera", with: shot ? focusName(shot) : "focus point", source, intent: "soft-focus", accepted, message: "the focus is on something outside the frame, so what is visible is soft — focus on a subject in the shot (`focus`) or use `dof: \"off\"`" });
      // Focus jumping within a shot (no cut).
      const prev = ctx.frames[f - 1]?.camera;
      if (prev?.focus && ctx.shotOf[f - 1] === k) {
        const rel = Math.abs(cam.focus.distance - prev.focus.distance) / Math.max(0.1, prev.focus.distance);
        if (rel > 0.25) out.add(f, { key: `focusjump:${k}`, check: "camera", kind: "focus-jump", level: "warning", object: "camera", source, intent: "soft-focus", accepted: ctx.accepted("soft-focus", shot?.allow), measure: rel, message: `focus snaps ${(rel * 100).toFixed(0)}% in one frame (usually the speaker changed) — rack it (\`rack\`) or frame one subject` });
      }
    }
  });

  // Cuts.
  r.shots.forEach((shot, k) => {
    if (k === 0 || shot.blend) return;
    const source = sourceOf(ctx.trace, shot);
    // The first frame showing the new shot, and the last one showing the previous shot.
    const fCut = Math.min(ctx.frames.length - 1, Math.ceil(shot.at * ctx.fps - 1e-9));
    const cutFrames = ctx.shotOf[fCut] === k && ctx.shotOf[fCut - 1] === k - 1;
    const after = cutFrames ? ctx.frames[fCut]?.camera : undefined;
    const before = cutFrames ? ctx.frames[fCut - 1]?.camera : undefined;
    const accept = (intent: Parameters<InspectContext["accepted"]>[0]) => ctx.accepted(intent, shot.allow);

    // Mid-word cut.
    for (const l of r.lines)
      for (const w of l.words) {
        const a = l.start + w.start + 0.04;
        const b = l.start + w.end - 0.04;
        if (shot.at > a && shot.at < b)
          out.add(fCut, { key: `midword:${k}`, check: "camera", kind: "cut-mid-word", level: "warning", object: "camera", source, intent: "mid-word-cut", accepted: accept("mid-word-cut"), message: `the cut lands inside "${w.text}" (${l.id}) — cut on the word's start/end (\`${l.id}.word:N\` / \`.word:N.end\`) or in a pause` });
      }
    if (!after || !before) return;

    // Jump cut: same subjects, nearly the same angle and distance.
    const prev = r.shots[k - 1];
    const same = prev.subjects.length > 0 && prev.subjects.length === shot.subjects.length && prev.subjects.every((s) => shot.subjects.includes(s));
    if (same) {
      const dPrev = Math.hypot(before.target[0] - before.position[0], before.target[1] - before.position[1], before.target[2] - before.position[2]);
      const dNext = Math.hypot(after.target[0] - after.position[0], after.target[1] - after.position[1], after.target[2] - after.position[2]);
      const ratio = Math.max(dPrev, dNext) / Math.max(1e-6, Math.min(dPrev, dNext));
      const lens = Math.max(before.fov, after.fov) / Math.max(1e-6, Math.min(before.fov, after.fov));
      const turn = angleBetween(viewYaw(before), viewYaw(after));
      if (turn < (30 * Math.PI) / 180 && ratio * lens < 1.3)
        out.add(fCut, { key: `jump:${k}`, check: "camera", kind: "jump-cut", level: "warning", object: "camera", source, intent: "jump-cut", accepted: accept("jump-cut"), message: `cut to almost the same framing of ${shot.subjects.join("+")} (${((turn * 180) / Math.PI).toFixed(0)}° turn, ${ratio.toFixed(2)}× distance) — change size by ~30%+ or angle by ~30°+` });
    }

    // Crossing the line between the two characters both shots are about.
    const pair = [...new Set([...prev.subjects, ...shot.subjects])];
    if (pair.length === 2 && prev.subjects.length && shot.subjects.length) {
      const [A, B] = pair.map((id) => ctx.frameOf(fCut, id)?.anchors.head);
      if (A && B) {
        const side = (c: CameraFrame) => (B[0] - A[0]) * (c.position[2] - A[2]) - (B[2] - A[2]) * (c.position[0] - A[0]);
        const s0 = side(before);
        const s1 = side(after);
        if (Math.sign(s0) !== Math.sign(s1) && Math.abs(s0) > 0.05 && Math.abs(s1) > 0.05)
          out.add(fCut, { key: `line:${k}`, check: "camera", kind: "cross-line", level: "note", object: "camera", with: pair.join("–"), source, intent: "cross-line", accepted: accept("cross-line"), message: `the cut crosses the line between ${pair.join(" and ")}, so they swap screen sides — keep the camera on one side (angle) or show the move` });
      }
    }
  });
  return out.findings();
};
