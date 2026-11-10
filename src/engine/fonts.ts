// Font stacks used by screens, captions and overlays. System fonts render immediately in
// Remotion's headless Chrome (no async loading). To pin an exact font, put a .woff2 in public/
// and load it with @remotion/fonts, then point these stacks at its family name.
export const FONTS = {
  ui: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  display: "'Segoe UI Black', 'Arial Black', 'Segoe UI', sans-serif",
  code: "Consolas, 'Cascadia Mono', 'DejaVu Sans Mono', 'Courier New', monospace",
};
