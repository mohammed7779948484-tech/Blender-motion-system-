// Dialogue captions from word timings. Pages and layout constants live in captionLayout.ts (pure); the
// current page and word are computed from the frame, so captions are exact on any frame.
import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ResolvedEpisode } from "../core/timeline";
import { FONTS } from "../fonts";
import { CAPTION_LAYOUT, captionIndexAt, captionPages } from "./captionLayout";

export const Captions: React.FC<{ resolved: ResolvedEpisode }> = ({ resolved }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pages = useMemo(() => captionPages(resolved), [resolved]);

  const style = resolved.captions.style;
  if (style === "none") return null;
  const ms = (frame / fps) * 1000;
  const page = pages[captionIndexAt(pages, ms)];
  if (!page) return null;
  const actor = resolved.actors.find((a) => a.id === page.speaker);
  const orient = height > width ? "portrait" : "landscape";
  const unit = Math.min(width, height) / 1080;
  const appear = interpolate(ms - page.startMs, [0, 120], [0, 1], { extrapolateRight: "clamp" });

  if (style === "pop") {
    const L = CAPTION_LAYOUT.pop;
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * L.bottom[orient] }}>
        <div style={{ fontFamily: FONTS.display, fontSize: L.fontSize * unit, fontWeight: 900, textAlign: "center", whiteSpace: "pre-wrap", maxWidth: width * L.maxWidth, lineHeight: L.lineHeight, scale: String(0.9 + 0.1 * appear), textShadow: `0 ${6 * unit}px 0 rgba(0,0,0,0.65)`, WebkitTextStroke: `${3 * unit}px rgba(0,0,0,0.85)` }}>
          {page.tokens.map((tok, i) => {
            const active = ms >= tok.fromMs && ms < tok.toMs;
            return (
              <span key={i} style={{ color: active ? actor?.color ?? "#ffd166" : "#ffffff" }}>
                {tok.text.toUpperCase()}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  const L = CAPTION_LAYOUT.subtitle;
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * L.bottom[orient] }}>
      <div style={{ opacity: appear, display: "flex", flexDirection: "column", alignItems: "center", gap: L.gap * unit, maxWidth: width * L.maxWidth }}>
        <div style={{ fontFamily: FONTS.ui, fontSize: L.nameSize * unit, fontWeight: 700, letterSpacing: 1, color: "#111", background: actor?.color ?? "#fff", padding: `${3 * unit}px ${14 * unit}px`, borderRadius: 999 }}>
          {(actor?.name ?? page.speaker).toUpperCase()}
        </div>
        <div style={{ fontFamily: FONTS.ui, fontSize: L.fontSize * unit, fontWeight: 600, color: "#fff", background: "rgba(8,10,18,0.72)", padding: `${L.padY * unit}px ${L.padX * unit}px`, borderRadius: 14 * unit, textAlign: "center", whiteSpace: "pre-wrap", lineHeight: L.lineHeight }}>
          {page.tokens.map((tok, i) => (
            <span key={i} style={{ color: ms >= tok.fromMs ? "#ffffff" : "rgba(255,255,255,0.55)" }}>
              {tok.text}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
