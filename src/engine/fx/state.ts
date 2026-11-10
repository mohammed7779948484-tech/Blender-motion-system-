// Pure per-frame state of the accents (fx): which are on screen, how they move the camera and the
// post chain, and where screen accents sit. Shared by the renderers (player, FxOverlay) and by
// Node-side checks, so both always agree on what the frame shows.
import { project, type CameraFrame } from "../camera/solve";
import { fxEnvelope, type ResolvedFx } from "../core/fx";
import { noise, type Vec3 } from "../core/time";

/** Accents drawn over the image (the rest act on the 3D world, the camera or the post chain). */
export const SCREEN_FX: readonly string[] = ["text", "window", "callout", "flash", "dip"];

/** Screen accents visible at time t, in authoring order. */
export const activeScreenFx = (fx: ResolvedFx[], t: number) => fx.filter((f) => t >= f.at && t <= f.end && SCREEN_FX.includes(f.type));

/** The rendered camera: the shot's camera plus any camera-shake accents at time t. */
export const cameraWithFx = (fx: ResolvedFx[], camera: CameraFrame, t: number): CameraFrame => {
  let c = camera;
  for (const f of fx) {
    if (f.type !== "shake") continue;
    const w = fxEnvelope(f, t, 0.01);
    if (w <= 0) continue;
    const amt = Number(f.data.amount ?? 0.06) * w;
    const hz = Number(f.data.frequency ?? 18);
    const o = (k: string) => noise(`${f.seed}${k}`, t, hz) * amt;
    c = { ...c, position: [c.position[0] + o("px"), c.position[1] + o("py"), c.position[2] + o("pz")], target: [c.target[0] + o("tx") * 1.6, c.target[1] + o("ty") * 1.6, c.target[2] + o("tz") * 1.6] };
  }
  return c;
};

/** Chromatic-aberration amount from glitch accents; undefined when the episode has no glitch pass. */
export const chromaAt = (fx: ResolvedFx[], post: { chroma: boolean } | undefined, t: number): number | undefined =>
  post?.chroma ? fx.reduce((sum, f) => (f.type === "glitch" ? sum + Number(f.data.amount ?? 1) * fxEnvelope(f, t, 0.03) * (0.6 + 0.4 * noise(`${f.seed}g`, t, 30)) : sum), 0) : undefined;

/** Where "top" / "bottom" screen accents sit, as a fraction of the frame height (portrait keeps clear of platform UI). */
export const FX_PLACE = {
  top: { portrait: 0.12, landscape: 0.07 },
  bottom: { portrait: 0.3, landscape: 0.18 },
} as const;

/** Live 3D point of an accent target (actor anchors move). */
export const fxPoint = (fx: ResolvedFx, anchorOf: (actor: string, anchor: string) => Vec3 | undefined): Vec3 | undefined => {
  if (!fx.on) return undefined;
  return Array.isArray(fx.on) ? fx.on : anchorOf(fx.on.actor, fx.on.anchor);
};

/**
 * Callout layout in pixels: the target (x, y), the label centre (lx, ly), which way the label sits
 * (dir -1 = left of the target) and the size unit u. Null when the target is off screen.
 */
export const calloutGeometry = (fx: ResolvedFx, camera: CameraFrame, point: Vec3, width: number, height: number) => {
  const p = project(camera, point, width / height);
  if (p.depth <= 0 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) return null;
  const x = ((p.x + 1) / 2) * width;
  const y = ((1 - p.y) / 2) * height;
  const u = Math.min(width, height) / 1080;
  const side = (fx.data.side as string | undefined) ?? (x > width / 2 ? "left" : "right");
  const dir = side === "left" ? -1 : 1;
  const lx = Math.min(width - 160 * u, Math.max(160 * u, x + dir * 230 * u));
  const ly = Math.max(height * 0.14, y - 210 * u);
  return { x, y, lx, ly, dir, u };
};
