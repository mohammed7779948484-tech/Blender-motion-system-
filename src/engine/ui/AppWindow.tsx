// AppWindow, DOM renderer: crisp screen-space technical UI (AI chat, terminal, dialog, notification).
// Pure in `local` (seconds since it appeared). Same params as the "window" screen preset / popups.
import { FONTS } from "../fonts";
import { windowState, windowTheme, type WindowParams } from "./window";

export type AppWindowProps = WindowParams & {
  /** Seconds since the window appeared. */
  local: number;
  /** Rendered width in px (height follows content). */
  width: number;
};

const Dots: React.FC<{ local: number; color: string; size: number }> = ({ local, color, size }) => (
  <span style={{ display: "inline-flex", gap: size * 0.5 }}>
    {[0, 1, 2].map((i) => (
      <span key={i} style={{ width: size, height: size, borderRadius: size, background: color, opacity: 0.35 + 0.65 * Math.max(0, Math.sin(local * 9 - i * 0.9)) }} />
    ))}
  </span>
);

export const AppWindow: React.FC<AppWindowProps> = ({ local, width, ...params }) => {
  const s = windowState(params, local);
  const th = windowTheme(params);
  // Designed at 600 px wide: at the default 86% of a 1080 frame, body text is ~60 px — readable on a phone.
  const u = width / 600;
  const caret = <span style={{ display: "inline-block", width: 10 * u, height: 30 * u, background: th.accent, marginLeft: 3 * u, translate: `0 ${5 * u}px` }} />;
  const frame: React.CSSProperties = {
    width,
    background: th.panel,
    color: th.text,
    borderRadius: 28 * u,
    border: `${2 * u}px solid ${th.border}`,
    boxShadow: `0 ${24 * u}px ${60 * u}px rgba(0,0,0,0.45)`,
    overflow: "hidden",
    opacity: s.enter,
    scale: String(0.9 + 0.1 * s.enter),
    fontFamily: FONTS.ui,
  };

  if (s.kind === "notification") {
    return (
      <div style={{ ...frame, borderRadius: 34 * u, display: "flex", alignItems: "center", gap: 22 * u, padding: `${24 * u}px ${30 * u}px`, translate: `0 ${(1 - s.enter) * -60 * u}px` }}>
        <div style={{ width: 76 * u, height: 76 * u, borderRadius: 20 * u, background: th.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42 * u, flexShrink: 0 }}>{s.icon}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 * u, minWidth: 0 }}>
          <div style={{ fontSize: 34 * u, fontWeight: 800 }}>{s.title}</div>
          <div style={{ fontSize: 32 * u, color: th.muted, lineHeight: 1.25 }}>{s.message}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={frame}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 * u, padding: `${18 * u}px ${24 * u}px`, background: th.bg, borderBottom: `${2 * u}px solid ${th.border}` }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: 18 * u, height: 18 * u, borderRadius: 18 * u, background: c }} />
        ))}
        <span style={{ marginLeft: 14 * u, fontSize: 28 * u, fontWeight: 700, color: th.muted }}>{s.title}</span>
      </div>
      <div style={{ padding: `${26 * u}px ${28 * u}px`, display: "flex", flexDirection: "column", gap: 18 * u }}>
        {s.kind === "chat"
          ? s.items.map((it, i) =>
              it.type === "bubble" ? (
                <div key={i} style={{ display: "flex", justifyContent: it.from === "user" ? "flex-end" : "flex-start", gap: 14 * u, opacity: it.appear, translate: `0 ${(1 - it.appear) * 20 * u}px` }}>
                  {it.from === "ai" ? <div style={{ width: 54 * u, height: 54 * u, borderRadius: 54 * u, background: th.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34 * u, flexShrink: 0 }}>✳</div> : null}
                  <div style={{ maxWidth: "78%", background: it.from === "user" ? th.user : th.ai, border: `${2 * u}px solid ${th.border}`, borderRadius: 24 * u, padding: `${16 * u}px ${22 * u}px`, fontSize: 36 * u, lineHeight: 1.3, fontWeight: 500 }}>
                    {it.typing ? <Dots local={it.appear + i} color={th.muted} size={12 * u} /> : it.text}
                    {it.caret ? caret : null}
                  </div>
                </div>
              ) : null,
            )
          : null}
        {s.kind === "terminal" ? (
          <div style={{ fontFamily: FONTS.code, fontSize: 32 * u, lineHeight: 1.45, display: "flex", flexDirection: "column" }}>
            {s.items.map((it, i) =>
              it.type === "line" ? (
                <div key={i} style={{ color: it.color === "red" ? "#ff7b72" : it.color === "green" ? "#7ee787" : it.color === "command" ? th.text : th.muted, whiteSpace: "pre" }}>
                  {it.text}
                  {it.caret ? caret : null}
                </div>
              ) : null,
            )}
          </div>
        ) : null}
        {s.kind === "dialog" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 * u, textAlign: "center", padding: `${8 * u}px 0` }}>
            <div style={{ fontSize: 84 * u, color: th.accent, lineHeight: 1 }}>{s.icon}</div>
            <div style={{ fontSize: 42 * u, fontWeight: 800 }}>{s.title}</div>
            <div style={{ fontSize: 33 * u, color: th.muted, lineHeight: 1.3 }}>{s.message}</div>
            <div style={{ display: "flex", gap: 14 * u, marginTop: 10 * u }}>
              {s.buttons.map((b, i) => (
                <div key={b} style={{ padding: `${12 * u}px ${36 * u}px`, borderRadius: 14 * u, fontSize: 30 * u, fontWeight: 700, background: i === 0 ? th.accent : th.user, color: i === 0 ? "#fff" : th.text }}>
                  {b}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
