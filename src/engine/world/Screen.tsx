// Animated device screens: a canvas texture redrawn every frame by a pure draw function of
// time. Stays inside WebGL, so DOF/bloom apply (unlike DOM overlays).
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tsLang from "shiki/langs/typescript.mjs";
import pyLang from "shiki/langs/python.mjs";
import bashLang from "shiki/langs/bash.mjs";
import jsonLang from "shiki/langs/json.mjs";
import cssLang from "shiki/langs/css.mjs";
import htmlLang from "shiki/langs/html.mjs";
import darkTheme from "shiki/themes/github-dark.mjs";
import { FONTS } from "../fonts";
import { clamp01 } from "../core/time";
import { drawWindow } from "../ui/drawWindow";
import type { WindowParams } from "../ui/window";
import { SCREEN_META, type ScreenMeta } from "./screens.data";

export type DrawContext = { ctx: CanvasRenderingContext2D; w: number; h: number; t: number; since: number };
export type DrawFn = (d: DrawContext, params: Record<string, unknown>) => void;
export type ScreenContent = { preset: string } & Record<string, unknown>;

const highlighter = createHighlighterCoreSync({
  themes: [darkTheme],
  langs: [tsLang, pyLang, bashLang, jsonLang, cssLang, htmlLang],
  engine: createJavaScriptRegexEngine(),
});
const tokenCache = new Map<string, { content: string; color?: string }[][]>();
const tokensFor = (code: string, lang: string) => {
  const key = `${lang}\u0000${code}`;
  let tokens = tokenCache.get(key);
  if (!tokens) {
    // Unknown languages render as plain text instead of crashing the render (validate warns about them).
    tokens = (highlighter.getLoadedLanguages() as string[]).includes(lang)
      ? highlighter.codeToTokensBase(code, { lang: lang as "typescript", theme: "github-dark" })
      : code.split("\n").map((line) => [{ content: line }]);
    tokenCache.set(key, tokens);
  }
  return tokens;
};

const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);

const chrome = (d: DrawContext, title: string, accent = "#58a6ff") => {
  const { ctx, w } = d;
  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, w, 54);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(30 + i * 30, 27, 9, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(130, 10, Math.min(360, w - 150), 44);
  ctx.fillStyle = accent;
  ctx.fillRect(130, 10, Math.min(360, w - 150), 3);
  ctx.fillStyle = "#c9d1d9";
  ctx.font = `24px ${FONTS.code}`;
  ctx.fillText(title, 150, 42);
};

export const SCREEN_PRESETS: Record<string, ScreenMeta & { draw: DrawFn }> = {
  code: {
    ...SCREEN_META.code,
    draw: (d, p) => {
      const { ctx, w, h, t, since } = d;
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, w, h);
      chrome(d, str(p.title, "deploy.ts"));
      const code = str(p.code, `export async function deploy() {\n  await build();\n  // TODO: tests\n  return ship("prod");\n}`);
      const speed = num(p.speed, 30);
      const visible = speed > 0 ? Math.floor(Math.max(0, t - since) * speed) : Infinity;
      const lines = tokensFor(code, str(p.lang, "typescript"));
      const size = num(p.fontSize, 30);
      ctx.font = `${size}px ${FONTS.code}`;
      let shown = 0;
      let cursor = { x: 80, y: 100 };
      lines.forEach((line, li) => {
        const y = 100 + li * size * 1.45;
        if (y > h - 10) return;
        ctx.fillStyle = "#484f58";
        ctx.fillText(String(li + 1).padStart(2, " "), 16, y);
        let x = 80;
        for (const tok of line) {
          const remaining = visible - shown;
          if (remaining <= 0) break;
          const text = tok.content.slice(0, remaining);
          shown += text.length;
          ctx.fillStyle = tok.color ?? "#c9d1d9";
          ctx.fillText(text, x, y);
          x += ctx.measureText(text).width;
          cursor = { x, y };
        }
        if (visible - shown > 0) shown += 1; // newline
      });
      if (Math.floor(t * 2.2) % 2 === 0) {
        ctx.fillStyle = "#58a6ff";
        ctx.fillRect(cursor.x + 2, cursor.y - size * 0.8, 3, size);
      }
    },
  },
  terminal: {
    ...SCREEN_META.terminal,
    draw: (d, p) => {
      const { ctx, w, h, t, since } = d;
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(0, 0, w, h);
      chrome(d, str(p.title, "zsh — ~/app"), "#7ee787");
      const lines = Array.isArray(p.lines) ? (p.lines as string[]) : ["$ npm run build", "+ compiled in 2.1s", "$ npm run deploy"];
      const n = Math.floor(Math.max(0, t - since) / num(p.interval, 0.5)) + 1;
      const size = 26;
      ctx.font = `${size}px ${FONTS.code}`;
      const shown = lines.slice(0, n);
      const maxRows = Math.floor((h - 80) / (size * 1.4));
      shown.slice(-maxRows).forEach((line, i) => {
        const color = line.startsWith("!") ? "#ff7b72" : line.startsWith("+") ? "#7ee787" : "#c9d1d9";
        ctx.fillStyle = color;
        ctx.fillText(line.replace(/^[!+]\s?/, ""), 24, 92 + i * size * 1.4);
      });
      if (Math.floor(t * 2.2) % 2 === 0) {
        ctx.fillStyle = "#c9d1d9";
        ctx.fillRect(24, 92 + Math.min(shown.length, maxRows) * size * 1.4 - size * 0.8, 14, size);
      }
    },
  },
  error: {
    ...SCREEN_META.error,
    draw: (d, p) => {
      const { ctx, w, h, t, since } = d;
      const flash = 0.5 + 0.5 * Math.sin((t - since) * Math.PI * 2 * 1.6);
      ctx.fillStyle = `rgb(${Math.round(90 + 110 * flash)}, 12, 18)`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#fff";
      ctx.font = `bold 84px ${FONTS.ui}`;
      ctx.textAlign = "center";
      ctx.fillText("⚠", w / 2, h * 0.3);
      ctx.font = `bold 64px ${FONTS.ui}`;
      ctx.fillText(str(p.title, "BUILD FAILED"), w / 2, h * 0.47);
      ctx.font = `30px ${FONTS.code}`;
      ctx.fillText(str(p.message, "TypeError: undefined is not a function"), w / 2, h * 0.58);
      ctx.textAlign = "left";
      const lines = Array.isArray(p.lines) ? (p.lines as string[]) : ["at deploy (deploy.ts:4:10)", "at main (index.ts:12:3)", "at process (node:internal)"];
      ctx.font = `24px ${FONTS.code}`;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      lines.forEach((l, i) => ctx.fillText(l, w * 0.18, h * 0.7 + i * 34));
    },
  },
  deploy: {
    ...SCREEN_META.deploy,
    draw: (d, p) => {
      const { ctx, w, h, t, since } = d;
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, w, h);
      chrome(d, "deploy — production");
      const failAt = typeof p.failAt === "number" ? p.failAt : null;
      let u = clamp01((t - since) / num(p.duration, 3));
      const failed = failAt !== null && u >= failAt;
      if (failed) u = failAt!;
      const color = failed ? "#ff4d4f" : u >= 1 ? "#3fb950" : "#58a6ff";
      ctx.fillStyle = "#c9d1d9";
      ctx.font = `bold 40px ${FONTS.ui}`;
      ctx.fillText(str(p.label, "Deploying to production"), 60, h * 0.38);
      ctx.fillStyle = "#21262d";
      ctx.fillRect(60, h * 0.48, w - 120, 46);
      ctx.fillStyle = color;
      ctx.fillRect(60, h * 0.48, (w - 120) * u, 46);
      ctx.font = `bold 34px ${FONTS.code}`;
      ctx.fillStyle = color;
      ctx.fillText(failed ? "✖ FAILED" : u >= 1 ? "✔ LIVE" : `${Math.floor(u * 100)}%`, 60, h * 0.7);
    },
  },
  window: {
    ...SCREEN_META.window,
    draw: (d, p) => {
      const { ctx, w, h, t, since } = d;
      ctx.fillStyle = "#0b0c10";
      ctx.fillRect(0, 0, w, h);
      const m = Math.round(w * 0.04);
      drawWindow(ctx, p as WindowParams, t - since + 0.25, m, m, w - 2 * m, h - 2 * m);
    },
  },
  off: {
    ...SCREEN_META.off,
    draw: ({ ctx, w, h }) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#15171c");
      g.addColorStop(1, "#050506");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
  },
};

export const ScreenSurface: React.FC<{
  width: number;
  height: number;
  content: ScreenContent;
  t: number;
  since?: number;
  brightness?: number;
  draw?: DrawFn;
  resolution?: number;
}> = ({ width, height, content, t, since = 0, brightness = 1, draw, resolution = 1024 }) => {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = resolution;
    c.height = Math.round((resolution * height) / width);
    return c;
  }, [resolution, width, height]);
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [canvas]);

  // Drawn in a layout effect: runs before ThreeCanvas's advance() for this frame.
  useLayoutEffect(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    const fn = draw ?? SCREEN_PRESETS[content.preset]?.draw ?? SCREEN_PRESETS.off.draw;
    // Above 1024 px the drawing is scaled, so presets keep their 1024-wide layout but render sharper
    // (giant screens). At 1024 and below nothing changes.
    const k = resolution > 1024 ? resolution / 1024 : 1;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    fn({ ctx, w: canvas.width / k, h: canvas.height / k, t, since }, content);
    // Any preset can show a popup (error dialog / notification) over its content.
    const popup = content.popup as (WindowParams & { kind?: "dialog" | "notification" }) | undefined;
    if (popup && typeof popup === "object") {
      const lw = canvas.width / k;
      const lh = canvas.height / k;
      const kind = popup.kind ?? "dialog";
      const pw = lw * (kind === "notification" ? 0.62 : 0.6);
      const ph = kind === "notification" ? lh * 0.17 : Math.min(lh * 0.62, pw * 0.62);
      drawWindow(ctx, { ...popup, kind }, t - since, (lw - pw) / 2, kind === "notification" ? lh * 0.06 : (lh - ph) / 2, pw, ph);
    }
    ctx.restore();
    texture.needsUpdate = true;
  });

  return (
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} color={[brightness, brightness, brightness]} />
    </mesh>
  );
};
