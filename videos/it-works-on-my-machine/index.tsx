import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { defineVideo, FONTS, useEvent } from "../../src/engine";
import episode from "./episode.json";

// Video-specific 2D overlay: the end title, timed by the "title" event in episode.json.
const EndTitle: React.FC = () => {
  const { fps, width } = useVideoConfig();
  const title = useEvent("title");
  if (!title.started || !title.active) return null;
  const f = title.local * fps;
  const pop = spring({ frame: f, fps, config: { damping: 12, mass: 0.6 } });
  const out = interpolate(title.progress, [0.85, 1], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const unit = width / 1920;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: out }}>
      <div style={{ scale: String(0.6 + 0.4 * pop), textAlign: "center", fontFamily: FONTS.display, color: "#fff", textShadow: `0 ${8 * unit}px ${30 * unit}px rgba(0,0,0,0.6)` }}>
        <div style={{ fontSize: 120 * unit, fontWeight: 900, letterSpacing: -2 }}>
          Run your <span style={{ color: "#ff8a65" }}>tests.</span>
        </div>
        <div style={{ fontFamily: FONTS.code, fontSize: 34 * unit, opacity: interpolate(f, [12, 24], [0, 0.85], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          // it works on everyone's machine then
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default defineVideo({ episode, overlay: EndTitle });
