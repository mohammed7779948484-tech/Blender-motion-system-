// AppWindow model: a technical UI window (AI chat, terminal, dialog, notification) as pure data +
// timing. Two renderers share it — DOM (AppWindow.tsx, crisp overlays) and Canvas2D (drawWindow.ts,
// 3D screens) — so the same params work in screen space and on any in-world screen.
// Timing patterns (typewriter rate + blinking caret, staggered entries) adapted from the MIT-licensed
// Remocn chat components and Onda motion primitives; see THIRD_PARTY_NOTICES.md.

export type WindowKind = "chat" | "terminal" | "dialog" | "notification";

export type WindowParams = {
  kind?: WindowKind;
  title?: string;
  /** chat: messages in order; "user" types, "ai" streams after a short typing indicator. */
  messages?: { from: "user" | "ai"; text: string; name?: string }[];
  /** terminal: lines printed one by one ("!" prefix = red, "+" = green, "$" = typed command). */
  lines?: string[];
  /** dialog / notification. */
  message?: string;
  icon?: string;
  buttons?: string[];
  /** Visual theme and accent colour. */
  theme?: "dark" | "light";
  accent?: string;
  /** Characters per second for typed/streamed text (default 28). */
  cps?: number;
  /** Seconds between terminal lines / chat messages (default 0.45). */
  interval?: number;
};

export type WindowTheme = { bg: string; panel: string; text: string; muted: string; border: string; user: string; ai: string; accent: string };

export const windowTheme = (p: WindowParams): WindowTheme => {
  const accent = p.accent ?? (p.kind === "dialog" ? "#ff5d5d" : "#d97757");
  return p.theme === "light"
    ? { bg: "#f6f5f0", panel: "#ffffff", text: "#1f1e1d", muted: "#8b877f", border: "#e3e0d8", user: "#ebe8df", ai: "#ffffff", accent }
    : { bg: "#15161b", panel: "#1e2027", text: "#eceef3", muted: "#8c93a3", border: "#2c2f39", user: "#2f3442", ai: "#22252e", accent };
};

export type WindowItem =
  | { type: "bubble"; from: "user" | "ai"; name?: string; text: string; typing: boolean; caret: boolean; appear: number }
  | { type: "line"; text: string; color: "default" | "red" | "green" | "command"; caret: boolean; appear: number };

export type WindowState = {
  kind: WindowKind;
  title: string;
  items: WindowItem[];
  /** dialog/notification body. */
  message: string;
  icon: string;
  buttons: string[];
  /** 0..1 window entrance (scale/slide). */
  enter: number;
};

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** What the window shows `local` seconds after it appeared. Pure. */
export const windowState = (p: WindowParams, local: number): WindowState => {
  const kind = p.kind ?? "chat";
  const cps = p.cps ?? 28;
  const interval = p.interval ?? 0.45;
  const caretOn = Math.floor(local * 2.2) % 2 === 0;
  const items: WindowItem[] = [];
  const t0 = 0.25; // after the window pops in

  if (kind === "chat") {
    let cursor = t0;
    for (const m of p.messages ?? []) {
      // An AI reply shows a typing indicator first, then streams faster than a human types.
      const typingFor = m.from === "ai" ? 0.55 : 0;
      const rate = m.from === "ai" ? cps * 1.6 : cps;
      const start = cursor + typingFor;
      const shown = Math.floor(Math.max(0, local - start) * rate);
      if (local < cursor) break;
      const done = shown >= m.text.length;
      items.push({ type: "bubble", from: m.from, name: m.name, text: m.text.slice(0, shown), typing: m.from === "ai" && local < start, caret: !done && caretOn, appear: ease((local - cursor) / 0.2) });
      cursor = start + m.text.length / rate + interval;
    }
  } else if (kind === "terminal") {
    let cursor = t0;
    for (const raw of p.lines ?? []) {
      if (local < cursor) break;
      const color = raw.startsWith("!") ? "red" : raw.startsWith("+") ? "green" : raw.startsWith("$") ? "command" : "default";
      const text = color === "red" || color === "green" ? raw.replace(/^[!+]\s?/, "") : raw;
      // Commands are typed, output appears at once.
      const shown = color === "command" ? Math.floor((local - cursor) * cps) : text.length;
      items.push({ type: "line", text: text.slice(0, shown), color, caret: false, appear: 1 });
      cursor += color === "command" ? text.length / cps + interval : interval;
    }
    if (items.length) (items[items.length - 1] as { caret: boolean }).caret = caretOn;
  }

  return {
    kind,
    title: p.title ?? (kind === "chat" ? "Claude" : kind === "terminal" ? "zsh — ~/app" : kind === "dialog" ? "Error" : "Notification"),
    items,
    message: p.message ?? "",
    icon: p.icon ?? (kind === "dialog" ? "⚠" : kind === "notification" ? "🔔" : ""),
    buttons: p.buttons ?? (kind === "dialog" ? ["OK"] : []),
    enter: ease(local / 0.25),
  };
};
