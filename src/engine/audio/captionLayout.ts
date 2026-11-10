// Caption pages and layout constants — pure, shared by <Captions> and Node-side checks.
// Pages come from @remotion/captions over each line's word timings.
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import type { ResolvedEpisode } from "../core/timeline";
import { lineCaptions } from "./speech";

export type CaptionPage = TikTokPage & { speaker: string; endMs: number };

/**
 * Caption pages for all lines in time order. A line's last page lingers 0.2 s, but never past the
 * start of the next page, so a following line's first words are never hidden.
 */
export const captionPages = (resolved: Pick<ResolvedEpisode, "lines" | "captions">): CaptionPage[] => {
  const out: CaptionPage[] = [];
  for (const l of resolved.lines) {
    const { pages: ps } = createTikTokStyleCaptions({ captions: lineCaptions(l.display ?? l.words, l.start), combineTokensWithinMilliseconds: resolved.captions.pageSeconds * 1000 });
    ps.forEach((p, i) => out.push({ ...p, speaker: l.speaker, endMs: i < ps.length - 1 ? ps[i + 1].startMs : Math.round((l.end + 0.2) * 1000) }));
  }
  out.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < out.length - 1; i++) out[i].endMs = Math.min(out[i].endMs, out[i + 1].startMs);
  return out;
};

/** Index of the page on screen at `ms` milliseconds, or -1. */
export const captionIndexAt = (pages: CaptionPage[], ms: number) => pages.findIndex((p) => ms >= p.startMs && ms < p.endMs);

/**
 * Caption style geometry. `bottom` is the gap under the caption block as a fraction of the frame
 * height; sizes are in 1080-px units (scaled by the frame's short side); `maxWidth` is a fraction of the width.
 */
export const CAPTION_LAYOUT = {
  pop: { bottom: { portrait: 0.24, landscape: 0.12 }, fontSize: 78, lineHeight: 1.1, maxWidth: 0.86 },
  subtitle: { bottom: { portrait: 0.2, landscape: 0.07 }, fontSize: 46, lineHeight: 1.25, maxWidth: 0.8, nameSize: 26, gap: 10, padX: 24, padY: 10 },
} as const;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Approximate on-screen rectangle (pixels) of a caption page, from the layout constants and the text
 * length (glyph widths are estimated: there is no text measurement outside the browser). For checks.
 */
export const captionRect = (page: CaptionPage, style: "subtitle" | "pop", width: number, height: number, name = ""): Rect => {
  const orient = height > width ? "portrait" : "landscape";
  const u = Math.min(width, height) / 1080;
  const chars = page.tokens.map((t) => t.text).join("").trim().length;
  if (style === "pop") {
    const L = CAPTION_LAYOUT.pop;
    const font = L.fontSize * u;
    const maxW = width * L.maxWidth;
    const textW = chars * font * 0.68; // heavy uppercase display face
    const lines = Math.max(1, Math.ceil(textW / maxW));
    const w = Math.min(maxW, textW);
    const h = lines * font * L.lineHeight;
    const bottom = height * (1 - L.bottom[orient]);
    return { x: (width - w) / 2, y: bottom - h, w, h };
  }
  const L = CAPTION_LAYOUT.subtitle;
  const font = L.fontSize * u;
  const inner = width * L.maxWidth - 2 * L.padX * u;
  const textW = chars * font * 0.52;
  const lines = Math.max(1, Math.ceil(textW / inner));
  const boxW = Math.min(inner, textW) + 2 * L.padX * u;
  const boxH = lines * font * L.lineHeight + 2 * L.padY * u;
  const nameH = L.nameSize * u * 1.2 + 6 * u;
  const nameW = name.length * L.nameSize * u * 0.62 + 28 * u;
  const w = Math.max(boxW, nameW);
  const h = nameH + L.gap * u + boxH;
  const bottom = height * (1 - L.bottom[orient]);
  return { x: (width - w) / 2, y: bottom - h, w, h };
};
