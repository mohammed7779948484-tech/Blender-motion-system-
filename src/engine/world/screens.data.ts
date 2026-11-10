// Screen preset metadata (pure, Node-safe): what each preset shows and which params it reads.
// Drawing lives in Screen.tsx; the resolver uses this to warn about unknown presets/params.

export type ScreenMeta = { description: string; params: Record<string, string>; glow: string };

export const SCREEN_META: Record<string, ScreenMeta> = {
  code: {
    description: "Code editor that types itself out (syntax highlighted).",
    params: { code: "source text", lang: "typescript|python|bash|json|css|html", title: "tab title", speed: "chars per second (default 30; 0 = show all)", fontSize: "px at 1024-wide canvas (default 30)" },
    glow: "#6ea8ff",
  },
  terminal: {
    description: "Terminal printing lines one by one. Prefix a line with '!' for red, '+' for green.",
    params: { lines: "string[]", interval: "seconds between lines (default 0.5)", title: "window title" },
    glow: "#7ee787",
  },
  error: {
    description: "Flashing red failure screen.",
    params: { title: "headline (default BUILD FAILED)", message: "detail line", lines: "string[] of stack-trace lines" },
    glow: "#ff3b3b",
  },
  deploy: {
    description: "Deploy progress bar; optionally fails part way.",
    params: { label: "text above the bar", duration: "seconds to 100% (default 3)", failAt: "0..1 progress where it fails (omit = success)" },
    glow: "#58a6ff",
  },
  window: {
    description: "A technical UI window filling the screen: AI chat (typing dots, streaming replies), terminal, dialog or notification — same params as the `window` fx.",
    params: { kind: "chat|terminal|dialog|notification", title: "window title", messages: "chat: [{ from: user|ai, text }]", lines: "terminal: string[] ('!' red, '+' green, '$' typed)", message: "dialog/notification text", icon: "dialog/notification icon", buttons: "dialog buttons", theme: "dark|light", accent: "accent colour", cps: "typing speed", interval: "seconds between lines/messages" },
    glow: "#d97757",
  },
  off: {
    description: "Screen off (dark glass).",
    params: {},
    glow: "#000000",
  },
};

/** Params every preset accepts (drawn by ScreenSurface on top of any preset). */
/** Languages the `code` preset highlights (others render as plain text). */
export const CODE_LANGS = ["typescript", "python", "bash", "json", "css", "html"];

export const COMMON_SCREEN_PARAMS: Record<string, string> = {
  preset: "preset name",
  popup: "{ kind: dialog|notification, title, message, icon, buttons, theme, accent } drawn over the content when this screen value is set",
};
