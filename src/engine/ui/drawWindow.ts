// AppWindow, Canvas2D renderer: the same window model drawn into a screen texture (in-world
// monitors, giant screens, popups over any screen preset). Synchronous and pure in `local`.
import { FONTS } from "../fonts";
import { windowState, windowTheme, type WindowParams } from "./window";

const rr = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** Word-wraps `text` to `maxW`; returns lines. */
export const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxW: number) => {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
};

/** Draws the window filling the rect (x, y, w, h). Text scales with w (designed at w = 900). */
export const drawWindow = (ctx: CanvasRenderingContext2D, p: WindowParams, local: number, x: number, y: number, w: number, h: number) => {
  const s = windowState(p, local);
  const th = windowTheme(p);
  const u = w / 900;
  ctx.save();
  ctx.globalAlpha = s.enter;
  const k = 0.9 + 0.1 * s.enter;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(k, k);
  ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40 * u;
  ctx.fillStyle = th.panel;
  rr(ctx, 0, 0, w, h, 28 * u);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.textBaseline = "alphabetic";

  if (s.kind === "notification") {
    ctx.fillStyle = th.accent;
    rr(ctx, 30 * u, h / 2 - 38 * u, 76 * u, 76 * u, 20 * u);
    ctx.fill();
    ctx.font = `${42 * u}px ${FONTS.ui}`;
    ctx.textAlign = "center";
    ctx.fillText(s.icon, 68 * u, h / 2 + 15 * u);
    ctx.textAlign = "left";
    ctx.fillStyle = th.text;
    ctx.font = `800 ${34 * u}px ${FONTS.ui}`;
    ctx.fillText(s.title, 130 * u, h / 2 - 6 * u);
    ctx.fillStyle = th.muted;
    ctx.font = `${30 * u}px ${FONTS.ui}`;
    ctx.fillText(s.message, 130 * u, h / 2 + 34 * u);
    ctx.restore();
    return;
  }

  // chrome
  ctx.fillStyle = th.bg;
  rr(ctx, 0, 0, w, 64 * u, [28 * u, 28 * u, 0, 0]);
  ctx.fill();
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(34 * u + i * 30 * u, 32 * u, 9 * u, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = th.muted;
  ctx.font = `700 ${28 * u}px ${FONTS.ui}`;
  ctx.fillText(s.title, 130 * u, 42 * u);

  const pad = 28 * u;
  let cy = 64 * u + pad;
  if (s.kind === "chat") {
    ctx.font = `500 ${34 * u}px ${FONTS.ui}`;
    for (const it of s.items) {
      if (it.type !== "bubble") continue;
      const maxW = w * 0.7;
      const lines = it.typing ? ["•••"] : wrapText(ctx, it.text + (it.caret ? "▍" : ""), maxW - 44 * u);
      const bw = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44 * u);
      const bh = lines.length * 44 * u + 26 * u;
      const bx = it.from === "user" ? w - pad - bw : pad + 66 * u;
      if (cy + bh > h - pad) break;
      if (it.from === "ai") {
        ctx.fillStyle = th.accent;
        ctx.beginPath();
        ctx.arc(pad + 27 * u, cy + 27 * u, 27 * u, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.fillText("✳", pad + 27 * u, cy + 39 * u);
        ctx.textAlign = "left";
      }
      ctx.fillStyle = it.from === "user" ? th.user : th.ai;
      rr(ctx, bx, cy, bw, bh, 24 * u);
      ctx.fill();
      ctx.fillStyle = th.text;
      lines.forEach((l, i) => ctx.fillText(l, bx + 22 * u, cy + 44 * u + i * 44 * u));
      cy += bh + 18 * u;
    }
  } else if (s.kind === "terminal") {
    ctx.font = `${30 * u}px ${FONTS.code}`;
    const rows = Math.floor((h - cy - pad) / (44 * u));
    for (const it of s.items.slice(-rows)) {
      if (it.type !== "line") continue;
      ctx.fillStyle = it.color === "red" ? "#ff7b72" : it.color === "green" ? "#7ee787" : it.color === "command" ? th.text : th.muted;
      ctx.fillText(it.text + (it.caret ? "▍" : ""), pad, cy + 32 * u);
      cy += 44 * u;
    }
  } else if (s.kind === "dialog") {
    ctx.textAlign = "center";
    ctx.fillStyle = th.accent;
    ctx.font = `${84 * u}px ${FONTS.ui}`;
    ctx.fillText(s.icon, w / 2, cy + 80 * u);
    ctx.fillStyle = th.text;
    ctx.font = `800 ${42 * u}px ${FONTS.ui}`;
    ctx.fillText(s.title, w / 2, cy + 150 * u);
    ctx.fillStyle = th.muted;
    ctx.font = `${32 * u}px ${FONTS.ui}`;
    wrapText(ctx, s.message, w - 2 * pad).forEach((l, i) => ctx.fillText(l, w / 2, cy + 200 * u + i * 42 * u));
    const bw = 170 * u;
    const total = s.buttons.length * bw + (s.buttons.length - 1) * 14 * u;
    s.buttons.forEach((b, i) => {
      const bx = w / 2 - total / 2 + i * (bw + 14 * u);
      ctx.fillStyle = i === 0 ? th.accent : th.user;
      rr(ctx, bx, h - pad - 64 * u, bw, 60 * u, 14 * u);
      ctx.fill();
      ctx.fillStyle = i === 0 ? "#fff" : th.text;
      ctx.font = `700 ${28 * u}px ${FONTS.ui}`;
      ctx.fillText(b, bx + bw / 2, h - pad - 24 * u);
    });
    ctx.textAlign = "left";
  }
  ctx.restore();
};
