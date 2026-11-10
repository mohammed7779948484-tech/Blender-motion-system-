// Engine version, production profile and declared intent: the one place that decides which
// automatic behaviours and check thresholds an episode gets. Engine-1 episodes (no `engine` field)
// keep the original behaviour exactly; new defaults read only from the resolved `Behaviour`. Pure.

/** 1 = original engine (frozen behaviour); 2 = current defaults. A missing `engine` means 1. */
export const ENGINE_VERSIONS = [1, 2] as const;
export type EngineVersion = (typeof ENGINE_VERSIONS)[number];

/**
 * Findings the director accepts on purpose (`allow` on the episode, a shot, an action, a cast member or an
 * accent). A check that would report one of these lists it as "accepted by intent" instead — still visible,
 * never hidden.
 */
export const INTENTS = {
  silence: "long pauses are deliberate (dead-air notes are accepted)",
  "slow-open": "the opening is deliberately slow (no-hook notes are accepted)",
  offscreen: "a subject's face leaves the frame on purpose",
  "back-of-head": "seeing the back of a subject is deliberate",
  abrupt: "a sudden jump or jitter in motion is deliberate (a snap, a glitchy character)",
  clipping: "a body part passing through something is deliberate",
  floating: "a character is off the ground on purpose (hovering, flying)",
  "text-over-face": "a caption or on-screen text covering a face is deliberate",
  "jump-cut": "cutting between near-identical framings is deliberate",
  "cross-line": "crossing the line of action between two characters is deliberate",
  "mid-word-cut": "cutting in the middle of a spoken word is deliberate",
  "soft-focus": "focus away from the subject (or on nothing visible) is deliberate",
  static: "a run of static shots is deliberate",
  "quick-cuts": "very short shots are deliberate (a rapid montage)",
} as const;
export type Intent = keyof typeof INTENTS;
export const INTENT_NAMES = Object.keys(INTENTS) as [Intent, ...Intent[]];

/** Defaults and check thresholds for a kind of production (explained in the make-episode skill). */
export type Profile = {
  description: string;
  /** Seconds within which something should happen (pacing note). */
  hook: number;
  /** Longest stretch with nothing happening before a pacing note. */
  deadAir: number;
  /** Consecutive static shots (no move, track or follow) before a shot-grammar note. */
  staticRun: number;
  /** Shots shorter than this (seconds, except the last) get a shot-grammar note. */
  minShot: number;
};

export const PROFILES = {
  standard: {
    description: "Short-form defaults: something happens within 1.5 s, no stretch of more than 1.5 s without a line, action, cut or sound; notes on 3+ static shots in a row and shots under 0.6 s.",
    hook: 1.5,
    deadAir: 1.5,
    staticRun: 3,
    minShot: 0.6,
  },
} as const satisfies Record<string, Profile>;
export type ProfileName = keyof typeof PROFILES;
export const PROFILE_NAMES = Object.keys(PROFILES) as [ProfileName, ...ProfileName[]];

/** Automatic behaviour, resolved: corrections default on with engine 2, styles are opt-in (0 / false = off). */
export type Defaults = {
  /** Subtle drift (`life` move) on shots that have no move, 0..2. */
  cameraLife: number;
  /** Auto focus holds the last speaker and pulls (≈0.45 s) instead of snapping. */
  focusPull: boolean;
  /** Blends between shots arc around the subject instead of moving in a straight line. */
  arcBlend: boolean;
  /** Listening: characters look at whoever speaks, nod at phrase ends, blink on cuts, 0 (off, restrained)..1. */
  listen: number;
  /** Self-touch recipes (facepalm, sip) aim at the bowed head and pass a point in front of the chest. */
  viaPoints: boolean;
  /** Dialogue clips lose silent heads and tails (never sound, words or performed tags; pauses inside stay). */
  trim: boolean;
  /** Each line is brought to its speaker's measured speech loudness (a line's `gain` adds on top). */
  level: boolean;
  /** Mouths follow loudness relative to the speaker's loudest line, with attack/release; bodies follow a slow envelope. */
  speechMotion: boolean;
};

export type Behaviour = { engine: EngineVersion; profile: ProfileName; allow: Intent[]; defaults: Defaults };

export const resolveBehaviour = (ep: { engine?: EngineVersion; profile?: ProfileName; allow?: Intent[]; defaults?: Partial<Defaults> }): Behaviour => {
  const engine = ep.engine ?? 1;
  const corrections = engine >= 2;
  return {
    engine,
    profile: ep.profile ?? "standard",
    allow: ep.allow ?? [],
    defaults: {
      cameraLife: ep.defaults?.cameraLife ?? 0,
      focusPull: ep.defaults?.focusPull ?? corrections,
      arcBlend: ep.defaults?.arcBlend ?? corrections,
      listen: ep.defaults?.listen ?? 0,
      viaPoints: ep.defaults?.viaPoints ?? corrections,
      trim: ep.defaults?.trim ?? corrections,
      level: ep.defaults?.level ?? corrections,
      speechMotion: ep.defaults?.speechMotion ?? corrections,
    },
  };
};

export const profileOf = (b: Pick<Behaviour, "profile">): Profile => PROFILES[b.profile];

/** Whether `intent` is accepted by the episode or any of the given scopes (e.g. the shot). */
export const accepts = (intent: Intent, ...scopes: ({ allow?: readonly Intent[] } | undefined)[]) => scopes.some((s) => s?.allow?.includes(intent));
