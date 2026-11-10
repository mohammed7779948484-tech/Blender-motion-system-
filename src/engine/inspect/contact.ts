// Contact: hands and forearms don't pass through the head or into furniture; recipe contacts land
// (the hand reaches the grip/drop/tap point, the IK target was reachable); characters stand on
// something. Thresholds are depths, not mere touching: a palm on a face is contact, not clipping.
import { moveSegments } from "../actors/rig";
import type { Vec3 } from "../core/time";
import { PROPS } from "../world/props.data";
import { itemAnchor, itemWorld } from "../world/layout";
import { dist3, segmentDistance, type InspectContext } from "./context";
import { hitCollector, type Finding } from "./findings";

/** How far (metres, at scale 1) an axis may sit inside the head before it reads as passing through it. */
const FOREARM_IN_HEAD = 0.04;
const HAND_IN_HEAD = 0.06;
/** A palm centre this far below an item's top surface, with the forearm coming through it from above, has pierced it. */
const HAND_THROUGH_TOP = 0.04;
/** A contact misses when the palm ends this far (at scale 1) from its target. */
const MISS = 0.1;
/** Gap under a character that reads as floating (metres, at scale 1). */
const FLOAT = 0.03;

type Support = { top: number; contains: (x: number, z: number) => boolean; id: string };

/** Surfaces something can stand on: the floor, marks, item tops (footprints) and item anchors. */
const supports = (ctx: InspectContext): Support[] => {
  const { layout } = ctx.r;
  const out: Support[] = [];
  if (layout.shell.floor !== "none") out.push({ id: "floor", top: 0, contains: () => true });
  for (const [name, m] of Object.entries(layout.marks)) out.push({ id: `mark ${name}`, top: m.position[1], contains: (x, z) => Math.hypot(x - m.position[0], z - m.position[2]) < 0.5 });
  for (const it of layout.items) {
    const meta = PROPS[it.kind];
    const size = it.size ?? meta?.size;
    const w = itemWorld(layout, it.id);
    if (size) {
      const [sx, sy, sz] = size.map((v) => v * w.scale);
      const top = meta?.origin === "top" ? w.position[1] : w.position[1] + sy;
      const c = Math.cos(-w.yaw);
      const s = Math.sin(-w.yaw);
      out.push({
        id: it.id,
        top,
        contains: (x, z) => {
          const dx = x - w.position[0];
          const dz = z - w.position[2];
          return Math.abs(dx * c + dz * s) <= sx / 2 && Math.abs(-dx * s + dz * c) <= sz / 2;
        },
      });
    }
    for (const name of Object.keys(meta?.anchors ?? {})) {
      const p = itemAnchor(layout, it.id, name);
      out.push({ id: `${it.id}.${name}`, top: p[1], contains: (x, z) => Math.hypot(x - p[0], z - p[2]) < 0.4 * w.scale });
    }
  }
  return out;
};

/** Depth of a point inside a yaw-rotated box (0 outside). */
const boxDepth = (p: Vec3, b: { center: Vec3; half: Vec3; yaw: number }) => {
  const dx = p[0] - b.center[0];
  const dz = p[2] - b.center[2];
  const c = Math.cos(-b.yaw);
  const s = Math.sin(-b.yaw);
  const l = [dx * c + dz * s, p[1] - b.center[1], -dx * s + dz * c];
  return Math.max(0, Math.min(b.half[0] - Math.abs(l[0]), b.half[1] - Math.abs(l[1]), b.half[2] - Math.abs(l[2])));
};

export const contactChecks = (ctx: InspectContext): Finding[] => {
  const out = hitCollector(ctx.fps);
  const items = ctx.sweep.query.occluders.filter((b) => !b.id.startsWith("wall:"));
  const ground = supports(ctx);

  ctx.frames.forEach((fr, f) => {
    const t = f / ctx.fps;
    for (const a of ctx.actors) {
      const frame = fr.actors.find((x) => x.id === a.id);
      const body = ctx.body(f, a.id);
      if (!frame) continue;
      const castAllow = ctx.castAllow(a.id);

      // Limbs through the head.
      const head = body?.parts.find((p) => p.name === "head");
      if (body && head) {
        for (const part of body.parts) {
          const isForearm = part.name.startsWith("forearm");
          const isHand = part.name.startsWith("hand");
          if (!isForearm && !isHand) continue;
          const depth = head.r - (isHand ? dist3(part.a, head.a) : segmentDistance(head.a, part.a, part.b));
          const limit = (isHand ? HAND_IN_HEAD : FOREARM_IN_HEAD) * frame.scale;
          if (depth > limit) {
            const cue = ctx.responsible(a.id, t, ["override", "gesture", "pose", "turn"]);
            out.add(f, { key: `clip:${a.id}:${part.name}`, check: "contact", kind: "penetration", level: "warning", object: `${a.id}.${part.name}`, with: `${a.id}.head`, source: cue?.source, related: cue?.related, intent: "clipping", accepted: ctx.accepted("clipping", cue?.allow, castAllow), measure: depth, message: `${a.id}'s ${part.name} goes ${(depth * 100).toFixed(0)} cm into the head — blending joint angles straight can sweep through the body: add an in-between \`joints\` cue, slow the transition, or use a recipe (\`do: "facepalm"\`)` });
          }
        }
        // Forearms piercing the top of furniture (held items excluded). Item volumes are coarse bounding boxes
        // (a desk's includes the empty space under it): a hand under a desk is hidden, not clipping. What shows
        // is an arm coming down through the top: elbow above the surface, palm below it, crossing inside it.
        for (const side of ["L", "R"] as const) {
          const hand = body.points[`hand${side}`];
          const elbow = body.points[`elbow${side}`];
          if (!hand || !elbow) continue;
          const held = new Set(Object.values(frame.held));
          for (const b of items) {
            if (held.has(b.id)) continue;
            const top = b.center[1] + b.half[1];
            const sunk = top - hand[1];
            if (sunk <= HAND_THROUGH_TOP * frame.scale || elbow[1] <= top) continue;
            const u = (elbow[1] - top) / (elbow[1] - hand[1]);
            const cross: Vec3 = [elbow[0] + (hand[0] - elbow[0]) * u, top, elbow[2] + (hand[2] - elbow[2]) * u];
            // Well inside the footprint (beyond the forearm's radius): grazing an edge is not piercing.
            const inFootprint = boxDepth([cross[0], b.center[1], cross[2]], b) > 0.05 * frame.scale && boxDepth([hand[0], b.center[1], hand[2]], b) > 0;
            if (inFootprint) {
              const cue = ctx.responsible(a.id, t, ["override", "pose", "gesture", "move", "turn"]);
              out.add(f, { key: `item:${a.id}:${side}:${b.id}`, check: "contact", kind: "penetration", level: "warning", object: `${a.id}.hand${side}`, with: b.id, source: cue?.source, related: cue?.related, intent: "clipping", accepted: ctx.accepted("clipping", cue?.allow, castAllow), measure: sunk, message: `${a.id}'s ${side === "L" ? "left" : "right"} forearm goes down through the top of "${b.id}" (palm ${(sunk * 100).toFixed(0)} cm below it) — raise the reach target/anchor, or move the actor` });
            }
          }
        }
      }

      // Standing on something (not during vertical moves: jumps, falls, climbs).
      const [x, y, z] = frame.position;
      if (!inVerticalMove(ctx, a.id, t)) {
        const under = ground.filter((s) => s.contains(x, z));
        const scale = frame.scale;
        const supported = under.some((s) => s.top >= y - FLOAT * scale && s.top <= y + 0.25 * scale);
        if (!supported) {
          const below = under.filter((s) => s.top < y).sort((p, q) => q.top - p.top)[0];
          const gap = below ? y - below.top : Infinity;
          out.add(f, { key: `float:${a.id}`, check: "contact", kind: "floating", level: "warning", object: `${a.id}.feet`, with: below?.id, source: ctx.placementSource(a.id, t), intent: "floating", accepted: ctx.accepted("floating", castAllow), measure: gap, message: Number.isFinite(gap) ? `${a.id} stands ${(gap * 100).toFixed(0)} cm above ${below!.id} — put it on a mark or the surface height (y)` : `${a.id} has nothing under it — place it on a mark or a surface` });
        }
      }
    }
  });

  // Recipe contacts: reachable, and the hand gets there.
  for (const c of ctx.trace.contacts) {
    const f = Math.min(ctx.frames.length - 1, Math.round(c.at * ctx.fps));
    const frame = ctx.frameOf(f, c.actor);
    const hand = c.side ? ctx.body(f, c.actor)?.points[`hand${c.side}`] : undefined;
    const scale = frame?.scale ?? 1;
    if (c.reached === false) out.add(f, { key: `reach:${c.actor}:${c.at}`, check: "contact", kind: "unreachable", level: "warning", object: `${c.actor}.hand${c.side ?? ""}`, with: c.what, source: c.source, message: `the ${c.what} target is out of ${c.actor}'s reach — move the actor closer, or move the target` });
    else if (hand) {
      const d = dist3(hand, c.point);
      if (d > MISS * scale) out.add(f, { key: `miss:${c.actor}:${c.at}`, check: "contact", kind: "missed-contact", level: "warning", object: `${c.actor}.hand${c.side}`, with: c.what, source: c.source, measure: d, message: `the hand stops ${(d * 100).toFixed(0)} cm from the ${c.what} point — a later cue may override the reach, or the actor moved` });
    }
  }
  return out.findings();
};

/** Whether `id` is in the middle of a move that changes height (a jump, fall or climb: deliberately airborne). */
const inVerticalMove = (ctx: InspectContext, id: string, t: number) => {
  const track = ctx.tracks[id];
  return !!track && moveSegments(track).some((s) => t >= s.start - 1e-6 && t <= s.end + 1e-6 && Math.abs(s.to[1] - s.from[1]) > 0.02);
};
