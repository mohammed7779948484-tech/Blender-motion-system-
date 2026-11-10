// Screen-space accents (text, window, callout, flash, dip). Everything derives from the current
// time and the current (shaken) camera, so any frame renders on its own.
import { evolvePath } from "@remotion/paths";
import { AbsoluteFill, interpolate, spring, useVideoConfig } from "remotion";
import { fxEnvelope, type ResolvedFx } from "../core/fx";
import type { Vec3 } from "../core/time";
import { FONTS } from "../fonts";
import { useEpisode } from "../player/EpisodePlayer";
import { AppWindow } from "../ui/AppWindow";
import { KineticText } from "../ui/KineticText";
import type { WindowParams } from "../ui/window";
import { activeScreenFx, calloutGeometry, FX_PLACE, fxPoint } from "./state";

type Pos = "top" | "center" | "bottom" | [number, number];

/** Where a screen accent sits; vertical frames keep clear of the platform UI bands. */
const placeStyle = (pos: Pos, height: number, width: number): React.CSSProperties => {
  if (Array.isArray(pos)) return { position: "absolute", left: pos[0] * width, top: pos[1] * height, translate: "-50% -50%" };
  const orient = height > width ? "portrait" : "landscape";
  if (pos === "top") return { position: "absolute", left: "50%", top: height * FX_PLACE.top[orient], translate: "-50% 0" };
  if (pos === "bottom") return { position: "absolute", left: "50%", bottom: height * FX_PLACE.bottom[orient], translate: "-50% 0" };
  return { position: "absolute", left: "50%", top: "50%", translate: "-50% -50%" };
};

/** Live 3D point of an accent target (actor anchors move). */
export const useFxPoint = (fx: ResolvedFx): Vec3 | undefined => {
  const { query, t } = useEpisode();
  return fxPoint(fx, (actor, anchor) => query.anchor(actor, anchor, t));
};

const Callout: React.FC<{ fx: ResolvedFx }> = ({ fx }) => {
  const { t, camera } = useEpisode();
  const { width, height, fps } = useVideoConfig();
  const point = useFxPoint(fx);
  if (!point) return null;
  const g = calloutGeometry(fx, camera, point, width, height);
  if (!g) return null;
  const { x, y, lx, ly, dir, u } = g;
  const local = t - fx.at;
  const color = String(fx.data.color ?? "#ffd166");
  const path = `M ${lx} ${ly + 40 * u} Q ${(lx + x) / 2 + dir * -40 * u} ${ly + 40 * u} ${x} ${y - 18 * u}`;
  const draw = interpolate(local, [0.05, 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const { strokeDasharray, strokeDashoffset } = evolvePath(draw, path);
  const pop = spring({ frame: Math.max(0, local * fps), fps, config: { damping: 11, stiffness: 240, mass: 0.6 } });
  const fade = interpolate(t, [fx.end - 0.2, fx.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  // Arrow head along the curve's final direction (control point → end).
  const cx = (lx + x) / 2 + dir * -40 * u;
  const ang = Math.atan2(y - 18 * u - (ly + 40 * u), x - cx);
  const head = 26 * u;
  const hx = x;
  const hy = y - 18 * u;
  return (
    <AbsoluteFill style={{ opacity: fade, pointerEvents: "none" }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <path d={path} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={16 * u} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
        <path d={path} fill="none" stroke={color} strokeWidth={9 * u} strokeLinecap="round" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
        {draw > 0.95 ? <path d={`M ${hx - head * Math.cos(ang - 0.5)} ${hy - head * Math.sin(ang - 0.5)} L ${hx} ${hy} L ${hx - head * Math.cos(ang + 0.5)} ${hy - head * Math.sin(ang + 0.5)}`} fill="none" stroke={color} strokeWidth={9 * u} strokeLinecap="round" strokeLinejoin="round" /> : null}
      </svg>
      <div style={{ position: "absolute", left: lx, top: ly, translate: "-50% -50%", scale: String(pop), background: color, color: "#111", fontFamily: FONTS.display, fontWeight: 900, fontSize: 66 * u, padding: `${8 * u}px ${24 * u}px`, borderRadius: 18 * u, boxShadow: `0 ${8 * u}px 0 rgba(0,0,0,0.45)`, whiteSpace: "nowrap", textTransform: "uppercase" }}>
        {String(fx.data.text ?? "")}
      </div>
    </AbsoluteFill>
  );
};

const OneFx: React.FC<{ fx: ResolvedFx }> = ({ fx }) => {
  const { t } = useEpisode();
  const { width, height, fps } = useVideoConfig();
  const local = t - fx.at;
  const d = fx.data;
  switch (fx.type) {
    case "text":
      return (
        <div style={placeStyle((d.position as Pos) ?? "top", height, width)}>
          <KineticText text={String(d.text)} local={local} duration={fx.end - fx.at} style={(d.style as "pop") ?? "pop"} width={width * 0.86} maxFontSize={((d.size as number) ?? 150) * (Math.min(width, height) / 1080)} color={d.color as string} accent={d.accent as string} emphasis={d.emphasis as string[]} fps={fps} seed={fx.seed} />
        </div>
      );
    case "window": {
      const kind = d.kind as WindowParams["kind"];
      const w = width * ((d.width as number) ?? (height > width ? 0.86 : 0.5));
      const fade = interpolate(t, [fx.end - 0.2, fx.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return (
        <div style={{ ...placeStyle((d.position as Pos) ?? (kind === "notification" ? "top" : "center"), height, width), opacity: fade }}>
          <AppWindow {...(d as WindowParams)} local={local} width={w} />
        </div>
      );
    }
    case "callout":
      return <Callout fx={fx} />;
    case "flash":
      return <AbsoluteFill style={{ background: String(d.color ?? "#ffffff"), opacity: fxEnvelope(fx, t, 0.02) }} />;
    case "dip": {
      const mid = (fx.at + fx.end) / 2;
      const o = t <= mid ? interpolate(t, [fx.at, mid], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : interpolate(t, [mid, fx.end], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      return <AbsoluteFill style={{ background: String(d.color ?? "#000000"), opacity: o }} />;
    }
    default:
      return null;
  }
};

export const FxOverlay: React.FC = () => {
  const { resolved, t } = useEpisode();
  const active = activeScreenFx(resolved.fx, t);
  if (!active.length) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {active.map((f) => (
        <OneFx key={f.seed} fx={f} />
      ))}
    </AbsoluteFill>
  );
};
