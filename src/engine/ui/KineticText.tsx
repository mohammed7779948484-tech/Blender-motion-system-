// KineticText: readable, punchy on-screen typography for short-form video (titles, punchlines,
// end cards). Pure in `local` seconds. Styles:
//   pop      words spring in one by one        stagger  words fade + rise in sequence
//   slam     the whole line slams in + shakes   type     characters typed with a caret
// Auto-fits to the available width (@remotion/layout-utils fitText) so text never overflows on 9:16.
// Stagger/rise timing adapted from Onda's word-stagger primitive (MIT); see THIRD_PARTY_NOTICES.md.
import { fitText } from "@remotion/layout-utils";
import { interpolate, random, spring } from "remotion";
import { noise } from "../core/time";
import { FONTS } from "../fonts";

export type KineticStyle = "pop" | "stagger" | "slam" | "type";

export type KineticTextProps = {
  text: string;
  /** Seconds since the text started. */
  local: number;
  /** Total seconds on screen (exit animation in the last 0.25 s); omit to stay. */
  duration?: number;
  style?: KineticStyle;
  /** Max box width in px (font size auto-fits up to `maxFontSize`). */
  width: number;
  maxFontSize?: number;
  color?: string;
  /** Colour for emphasized words (and the caret). */
  accent?: string;
  /** Words (case-insensitive, punctuation ignored) drawn in the accent colour and slightly bigger. */
  emphasis?: string[];
  fps: number;
  fontFamily?: string;
  fontWeight?: number;
  /** Seed for the slam shake / per-word tilt. */
  seed?: string;
};

const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const KineticText: React.FC<KineticTextProps> = ({ text, local, duration, style = "pop", width, maxFontSize = 160, color = "#ffffff", accent = "#ffd166", emphasis = [], fps, fontFamily = FONTS.display, fontWeight = 900, seed = text }) => {
  const words = text.split(/\s+/).filter(Boolean);
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");
  // Size for the longest word on one line and the whole text on at most two lines.
  const byWord = fitText({ text: longest, withinWidth: width * 0.92, fontFamily, fontWeight }).fontSize;
  const byLine = fitText({ text, withinWidth: width * 1.8, fontFamily, fontWeight }).fontSize;
  const fontSize = Math.min(maxFontSize, byWord, Math.max(byLine, maxFontSize * 0.45));
  const emph = new Set(emphasis.map(clean));
  const exit = duration !== undefined ? interpolate(local, [duration - 0.25, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
  const f = (s: number) => Math.max(0, s * fps);

  const slamIn = style === "slam" ? spring({ frame: f(local), fps, config: { damping: 12, stiffness: 320, mass: 0.7 } }) : 1;
  const shakeAmt = style === "slam" ? Math.max(0, 1 - Math.max(0, local - 0.12) / 0.35) * fontSize * 0.06 : 0;
  const typed = style === "type" ? Math.floor(Math.max(0, local) * 24) : Infinity;

  let charCount = 0;
  return (
    <div
      style={{
        width,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        gap: `0 ${fontSize * 0.28}px`,
        fontFamily,
        fontWeight,
        fontSize,
        lineHeight: 1.02,
        color,
        textAlign: "center",
        opacity: exit,
        scale: String((style === "slam" ? interpolate(slamIn, [0, 1], [2.4, 1]) : 1) * (0.92 + 0.08 * exit)),
        translate: `${noise(`${seed}x`, local, 22) * shakeAmt}px ${noise(`${seed}y`, local, 22) * shakeAmt}px`,
        WebkitTextStroke: `${Math.max(2, fontSize * 0.035)}px rgba(0,0,0,0.85)`,
        paintOrder: "stroke fill",
        textShadow: `0 ${fontSize * 0.06}px 0 rgba(0,0,0,0.55)`,
        textTransform: "uppercase",
      }}
    >
      {words.map((w, i) => {
        const isEm = emph.has(clean(w));
        const start = style === "pop" ? i * 0.12 : style === "stagger" ? i * 0.08 : 0;
        const pop = style === "pop" ? spring({ frame: f(local - start), fps, config: { damping: 9, stiffness: 260, mass: 0.6 } }) : 1;
        const rise = style === "stagger" ? interpolate(local - start, [0, 0.28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;
        const tilt = style === "pop" ? (random(`${seed}-${i}`) - 0.5) * 8 * (1 - Math.min(1, pop)) : 0;
        let shown = w;
        if (style === "type") {
          shown = w.slice(0, Math.max(0, typed - charCount));
          charCount += w.length + 1;
          if (!shown) return null;
        }
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              color: isEm ? accent : color,
              fontSize: isEm ? "1.12em" : undefined,
              opacity: style === "pop" ? Math.min(1, pop * 3) : rise,
              scale: String(style === "pop" ? Math.max(0, pop) : 1),
              translate: `0 ${(1 - rise) * fontSize * 0.35}px`,
              rotate: `${tilt}deg`,
            }}
          >
            {shown}
          </span>
        );
      })}
      {style === "type" && typed < text.length ? <span style={{ display: "inline-block", width: fontSize * 0.08, height: fontSize * 0.8, background: accent }} /> : null}
    </div>
  );
};
