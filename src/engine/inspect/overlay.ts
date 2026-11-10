// Overlays: captions and screen text don't cover a visible face. Caption and accent rectangles are
// estimates (no text measurement outside the browser), so this flags clear overlaps, not near misses.
import { captionRect, type Rect } from "../audio/captionLayout";
import { FX_PLACE, calloutGeometry, fxPoint } from "../fx/state";
import type { ResolvedFx } from "../core/fx";
import type { Intent } from "../core/behaviour";
import { allowOf, sourceOf } from "../core/trace";
import type { InspectContext } from "./context";
import { hitCollector, type Finding } from "./findings";

/** Head radius (metres, scale 1) to size a face on screen when the anatomy has no head volume. */
const HEAD_R = 0.2;

/** Distance (px) from a point to a rectangle (0 inside). */
const rectDistance = (x: number, y: number, r: Rect) => Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h)));

/** Estimated rectangle of a screen accent at time t (text, window, callout label), or null. */
const fxRect = (ctx: InspectContext, fx: ResolvedFx, f: number): Rect | null => {
  const { width: W, height: H } = ctx;
  const u = Math.min(W, H) / 1080;
  const orient = H > W ? "portrait" : "landscape";
  const pos = fx.data.position as "top" | "center" | "bottom" | [number, number] | undefined;
  const at = (w: number, h: number, def: "top" | "center"): Rect => {
    const p = pos ?? def;
    if (Array.isArray(p)) return { x: p[0] * W - w / 2, y: p[1] * H - h / 2, w, h };
    if (p === "top") return { x: (W - w) / 2, y: H * FX_PLACE.top[orient], w, h };
    if (p === "bottom") return { x: (W - w) / 2, y: H * (1 - FX_PLACE.bottom[orient]) - h, w, h };
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  };
  if (fx.type === "text") {
    const size = Number(fx.data.size ?? 150) * u;
    const chars = String(fx.data.text ?? "").length;
    const w = Math.min(W * 0.86, chars * size * 0.62);
    const lines = Math.max(1, Math.ceil((chars * size * 0.62) / (W * 0.86)));
    return at(w, lines * size * 1.05, "top");
  }
  if (fx.type === "window") {
    const kind = fx.data.kind as string;
    const w = W * Number(fx.data.width ?? (H > W ? 0.86 : 0.5));
    const h = kind === "notification" ? 150 * u : kind === "dialog" ? 360 * u : 520 * u;
    return at(w, h, kind === "notification" ? "top" : "center");
  }
  if (fx.type === "callout") {
    const point = fxPoint(fx, (actor, anchor) => ctx.frameOf(f, actor)?.anchors[anchor]);
    const g = point ? calloutGeometry(fx, ctx.frames[f].camera, point, W, H) : null;
    if (!g) return null;
    const w = String(fx.data.text ?? "").length * 66 * u * 0.68 + 48 * u;
    const h = 82 * u;
    return { x: g.lx - w / 2, y: g.ly - h / 2, w, h };
  }
  return null;
};

export const overlayChecks = (ctx: InspectContext): Finding[] => {
  const out = hitCollector(ctx.fps);
  const { r } = ctx;
  ctx.frames.forEach((fr, f) => {
    const shot = r.shots[ctx.shotOf[f]];
    const rects: { rect: Rect; label: string; source?: string; allow?: readonly Intent[] }[] = [];
    const page = fr.caption >= 0 ? ctx.sweep.pages[fr.caption] : undefined;
    if (page && r.captions.style !== "none") {
      const name = r.actors.find((a) => a.id === page.speaker)?.name ?? page.speaker;
      rects.push({ rect: captionRect(page, r.captions.style, ctx.width, ctx.height, name), label: "caption" });
    }
    for (const i of fr.fx) {
      const fx = r.fx[i];
      const rect = fxRect(ctx, fx, f);
      if (rect) rects.push({ rect, label: `fx[${i}] ${fx.type}`, source: sourceOf(ctx.trace, fx), allow: allowOf(ctx.trace, fx) });
    }
    if (!rects.length) return;
    for (const a of ctx.actors) {
      const body = ctx.body(f, a.id);
      const face = body?.points.face ?? ctx.frameOf(f, a.id)?.anchors.face;
      if (!face) continue;
      const s = ctx.toScreen(fr.camera, face);
      if (!s || Math.abs(s.ndc.x) > 1 || Math.abs(s.ndc.y) > 1) continue;
      const headR = (body?.parts.find((p) => p.name === "head" || p.name === "body")?.r ?? HEAD_R * a.scale) * 0.8;
      const rpx = ctx.pxRadius(fr.camera, headR, s.depth);
      for (const o of rects) {
        // Covered: the text reaches the middle of the face (eyes, nose, mouth), not just the chin or hair.
        if (rectDistance(s.x, s.y, o.rect) > rpx * 0.25) continue;
        out.add(f, {
          key: `cover:${a.id}:${o.label}`,
          check: "overlay",
          kind: o.label === "caption" ? "caption-over-face" : "text-over-face",
          level: "warning",
          object: `${a.id}.face`,
          with: o.label,
          source: o.source ?? (shot ? sourceOf(ctx.trace, shot) : undefined),
          intent: "text-over-face",
          accepted: ctx.accepted("text-over-face", shot?.allow, o.allow),
          message:
            o.label === "caption"
              ? `the caption covers ${a.id}'s face — reframe (shot \`offset\`/size) so the face sits above the caption band`
              : `${o.label} (estimated size) covers ${a.id}'s face — move it (\`position\`) or reframe`,
        });
      }
    }
  });
  return out.findings();
};
