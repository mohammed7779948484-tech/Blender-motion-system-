// Accent cues ("fx"): one JSON vocabulary for the short-form beats that make a joke land — punch
// text, UI windows, callouts pinned to 3D things, impacts, shakes, glitches and cut covers.
// Pure data + zod schemas; renderers live in fx/FxOverlay.tsx (screen), fx/FxWorld.tsx (3D),
// camera/Camera.tsx (post) and the player (camera shake).
import { z } from "zod";
import { INTENT_NAMES } from "./behaviour";

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Place = z.union([Vec3, z.string()]);
const Position = z.union([z.enum(["top", "center", "bottom"]), z.tuple([z.number(), z.number()])]);

/** Shared by every accent; `at` is a number or time ref (validated with the rest of the episode). */
const base = {
  /** Seconds or a time ref ("l2.end+0.3"); checked by the resolver. */
  at: z.union([z.number().min(0), z.string()]),
  duration: z.number().positive().optional(),
  /** Sound played when the accent starts (library name or file). */
  sound: z.string().optional(),
  volume: z.number().min(0).optional(),
  /** Findings this accent causes on purpose, e.g. ["text-over-face"] (core/behaviour.ts INTENTS). */
  allow: z.array(z.enum(INTENT_NAMES)).optional(),
};

export const FxSchemas = {
  text: z.strictObject({ type: z.literal("text"), ...base, text: z.string().min(1), style: z.enum(["pop", "stagger", "slam", "type"]).optional(), position: Position.optional(), size: z.number().positive().optional(), color: z.string().optional(), accent: z.string().optional(), emphasis: z.array(z.string()).optional() }),
  window: z.strictObject({
    type: z.literal("window"),
    ...base,
    kind: z.enum(["chat", "terminal", "dialog", "notification"]),
    title: z.string().optional(),
    messages: z.array(z.strictObject({ from: z.enum(["user", "ai"]), text: z.string(), name: z.string().optional() })).optional(),
    lines: z.array(z.string()).optional(),
    message: z.string().optional(),
    icon: z.string().optional(),
    buttons: z.array(z.string()).optional(),
    theme: z.enum(["dark", "light"]).optional(),
    accent: z.string().optional(),
    cps: z.number().positive().optional(),
    interval: z.number().positive().optional(),
    position: Position.optional(),
    width: z.number().positive().max(1).optional(),
  }),
  callout: z.strictObject({ type: z.literal("callout"), ...base, on: Place, text: z.string(), color: z.string().optional(), side: z.enum(["left", "right"]).optional() }),
  impact: z.strictObject({ type: z.literal("impact"), ...base, on: Place, color: z.string().optional(), size: z.number().positive().optional(), count: z.number().int().positive().max(60).optional() }),
  shake: z.strictObject({ type: z.literal("shake"), ...base, amount: z.number().positive().optional(), frequency: z.number().positive().optional() }),
  glitch: z.strictObject({ type: z.literal("glitch"), ...base, amount: z.number().positive().optional() }),
  flash: z.strictObject({ type: z.literal("flash"), ...base, color: z.string().optional() }),
  dip: z.strictObject({ type: z.literal("dip"), ...base, color: z.string().optional() }),
};
export type FxType = keyof typeof FxSchemas;

/** Catalog entry per accent: what it is, when to pick it, default length. */
export const FX_INFO: Record<FxType, { layer: "screen" | "world" | "post" | "camera"; description: string; pickWhen: string; duration: number }> = {
  text: { layer: "screen", description: "Kinetic typography (pop | stagger | slam | type), auto-fit to the frame; emphasis words in the accent colour.", pickWhen: "punchlines, titles, end cards, one-word reactions (\"DEPLOYED.\")", duration: 1.4 },
  window: { layer: "screen", description: "Technical UI window: AI chat (typing dots, streaming), terminal, error dialog, or a notification toast.", pickWhen: "show what a character reads/types; notifications that escalate the plot; make screen text readable on phones", duration: 2.5 },
  callout: { layer: "screen", description: "Arrow + label pinned to a 3D target (item.anchor, actor[.anchor], mark or point); follows it through camera moves.", pickWhen: "point out a key, a prop or a character the viewer must notice", duration: 1.8 },
  impact: { layer: "world", description: "Seeded burst of shards, dust puff and a ground ring at a 3D point.", pickWhen: "landings, slams, something hitting something (pair with shake + a sound)", duration: 0.9 },
  shake: { layer: "camera", description: "Decaying camera shake (amount in metres).", pickWhen: "impacts, explosions, sudden panic", duration: 0.4 },
  glitch: { layer: "post", description: "Chromatic-aberration glitch burst on the 3D image.", pickWhen: "errors, AI weirdness, reality breaking", duration: 0.5 },
  flash: { layer: "screen", description: "Brief full-frame flash (default white) fading out.", pickWhen: "hard hits, camera-flash gags, covering a smash cut", duration: 0.25 },
  dip: { layer: "screen", description: "Dip to a colour and back (fully covered at the middle — put the cut there).", pickWhen: "time skips, endings, softening a big location change", duration: 0.6 },
};

export const FxEntry = z.discriminatedUnion("type", Object.values(FxSchemas) as unknown as [typeof FxSchemas.text, ...(typeof FxSchemas)[FxType][]]);

export type ResolvedFx = {
  type: FxType;
  at: number;
  end: number;
  /** Type-specific params (validated). */
  data: Record<string, unknown>;
  /** 3D target for callout/impact: a fixed point, or an actor anchor evaluated per frame. */
  on?: [number, number, number] | { actor: string; anchor: string };
  seed: string;
};

/** 0..1 attack/decay envelope used by the accents. */
export const fxEnvelope = (fx: ResolvedFx, t: number, attack = 0.05) => {
  if (t < fx.at || t > fx.end) return 0;
  const a = Math.min(1, (t - fx.at) / attack);
  const d = Math.max(0, 1 - (t - fx.at) / Math.max(1e-6, fx.end - fx.at));
  return a * d;
};
