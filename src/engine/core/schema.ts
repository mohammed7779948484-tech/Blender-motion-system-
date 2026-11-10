// Episode direction schema (zod). Strict objects so typos fail validation instead of being
// silently ignored. `npm run catalog` exports this as catalog/episode.schema.json.
import { z } from "zod";
import { ENGINE_VERSIONS, INTENT_NAMES, PROFILE_NAMES } from "./behaviour";
import { FxEntry } from "./fx";
import { EASINGS, type EaseName } from "./time";

/** Seconds, or a reference: "l2.start", "l2.end+0.3", "l3.word:4" (4th word start), "l3.word:4.end-0.1". */
export const TIME_REF_RE = /^([A-Za-z][\w-]*)\.(start|end|word:(\d+)(?:\.(start|end))?)([+-]\d+(?:\.\d+)?)?$/;
export const TimeRef = z.union([z.number().min(0), z.string().regex(TIME_REF_RE, "time ref like l2.start, l2.end+0.3, l3.word:4")]);

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** A world point, a set mark name, or "<actor>[.<anchor>]" / "camera" for look targets. */
const Place = z.union([Vec3, z.string()]);
const Ease = z.enum(Object.keys(EASINGS) as [EaseName, ...EaseName[]]);
/** Findings accepted on purpose (see core/behaviour.ts INTENTS): reported as "accepted by intent". */
const Allow = z.array(z.enum(INTENT_NAMES));

const Voice = z.strictObject({
  elevenlabs: z
    .strictObject({
      voiceId: z.string(),
      model: z.string().optional(),
      settings: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** Offline Windows voice name, e.g. "Microsoft David Desktop". */
  system: z.string().optional(),
  /** Speaking rate for the system voice (-10..10). */
  rate: z.number().min(-10).max(10).optional(),
  /** Pitch shift for the system voice via SSML, e.g. "+15%". */
  pitch: z.string().optional(),
});

const CastMember = z.strictObject({
  actor: z.string(),
  at: Place.optional(),
  yaw: z.number().optional(),
  scale: z.number().positive().optional(),
  pose: z.string().optional(),
  emotion: z.string().optional(),
  appearance: z.record(z.string(), z.unknown()).optional(),
  voice: Voice.optional(),
  /** Caption name tag colour. */
  color: z.string().optional(),
  /** Display name for captions. */
  name: z.string().optional(),
  /** Findings about this character that are deliberate, e.g. ["floating"] for a hovering ghost. */
  allow: Allow.optional(),
  /** Listening for this character, 0 (restrained) … 1 (overrides `defaults.listen`). */
  listen: z.number().min(0).max(1).optional(),
});

const Line = z.strictObject({
  id: z.string().regex(/^[A-Za-z][\w-]*$/),
  speaker: z.string(),
  text: z.string().min(1),
  /** Start time. Omit to follow the previous line after `gap` seconds. */
  at: TimeRef.optional(),
  gap: z.number().optional(),
  /**
   * Which generated take plays (`voice <slug> --takes l3=3` makes them; 0 = the original). Record who chose it
   * and why: `{ "n": 2, "by": "director", "why": "the tired sigh" }` (`by: "agent"` = measured, not heard).
   */
  take: z.union([z.number().int().min(0), z.strictObject({ n: z.number().int().min(0), by: z.enum(["director", "agent"]), why: z.string().min(1) })]).optional(),
  /** Clip in/out points in seconds of the file (`false` = no automatic edge trim). Never edits the file. */
  trim: z.union([z.literal(false), z.strictObject({ start: z.number().min(0).optional(), end: z.number().positive().optional() })]).optional(),
  /** Deliberate level change in dB on top of the automatic levelling (e.g. -6 for a mutter). */
  gain: z.number().min(-24).max(12).optional(),
  /** Caption text to show instead of the spoken text (the voice and its cache are untouched). */
  caption: z.string().min(1).optional(),
});

const Action = z.strictObject({
  at: TimeRef,
  actor: z.string(),
  pose: z.string().optional(),
  emotion: z.string().optional(),
  gesture: z.string().optional(),
  look: z.union([Place, z.null()]).optional(),
  move: z
    .strictObject({
      to: Place,
      duration: z.number().positive().optional(),
      speed: z.number().positive().optional(),
      face: z.union([z.literal("path"), z.literal("keep"), z.number()]).optional(),
      /** Timing curve: smooth (default), in (accelerate — falls), out (decelerate — lands softly), linear, snap, backOut, inOut. */
      ease: Ease.optional(),
    })
    .optional(),
  /** Turn to a yaw (degrees) or toward a place/actor. */
  turn: z.union([z.number(), Place]).optional(),
  hold: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
  /** Precise channel overrides (see the actor manifest's channels). */
  joints: z.record(z.string(), z.number()).optional(),
  /**
   * Keyed joints: the override passes smoothly through every key (via points), e.g. the hand in front of the
   * chest before it reaches the face. `joints`, when given, are the values at the action's `at`.
   */
  keys: z.array(z.strictObject({ at: TimeRef, joints: z.record(z.string(), z.number()) })).min(1).optional(),
  mode: z.union([z.literal("absolute"), z.literal("add")]).optional(),
  /** Seconds a joints override lasts (omit = holds). */
  duration: z.number().positive().optional(),
  transition: z.number().min(0).optional(),
  /** The gesture's strength; on an action without a gesture, how far toward the `emotion` (0..1). */
  intensity: z.number().min(0).optional(),
  speed: z.number().positive().optional(),
  /**
   * Interaction recipe, expanded into ordinary cues: press | point | pick-up | place | react | sit-down |
   * stand-up | facepalm | sip. Only `emotion` is applied alongside it.
   */
  do: z.enum(["press", "point", "pick-up", "place", "react", "sit-down", "stand-up", "facepalm", "sip"]).optional(),
  /** Recipe target: "item.anchor" (e.g. "keyboard.key:ctrl"), an item, actor[.anchor], mark or [x,y,z]. */
  target: Place.optional(),
  /** Recipe item (pick-up / place). */
  item: z.string().optional(),
  /** Recipe hand/socket (default: the hand on the target's side). */
  hand: z.string().optional(),
  /** press/place: false = too light to push the target down (the gag). */
  weight: z.boolean().optional(),
  /** Sound played at the recipe's moment of contact (library name or file), and its volume. */
  sound: z.string().optional(),
  volume: z.number().min(0).optional(),
  /** place: yaw (degrees) of the put-down item. */
  rotation: z.number().optional(),
  /** Findings this action causes on purpose, e.g. ["abrupt"] for a snap move, ["clipping"]. */
  allow: Allow.optional(),
});

const MoveName = z.enum(["static", "push-in", "pull-out", "truck", "orbit", "crane", "handheld", "life"]);
const Move = z.union([
  MoveName,
  z.strictObject({
    type: MoveName,
    amount: z.number().optional(),
    ease: Ease.optional(),
    /** When the move starts (default: the shot's start). */
    at: TimeRef.optional(),
    /** How long it takes (default: until the shot ends). */
    duration: z.number().positive().optional(),
  }),
]);
const Height = z.union([z.enum(["eye", "low", "high"]), z.number()]);
/** Solver-space keyframe: values relative to the subject, so a moving subject carries the camera. */
const ShotKey = z.strictObject({
  at: TimeRef,
  /** Degrees around the subject from where it faces (like the shot's `angle`). */
  angle: z.number().optional(),
  distance: z.number().positive().optional(),
  /** Multiplier on the solved distance (<1 closer). */
  size: z.number().positive().optional(),
  height: Height.optional(),
  lens: z.number().positive().optional(),
  fov: z.number().positive().optional(),
  offset: z.tuple([z.number(), z.number()]).optional(),
  roll: z.number().optional(),
});
/** World-space keyframe for authored flights (crane, fly-through). */
const PathKey = z.strictObject({ at: TimeRef, position: Vec3, target: Vec3, lens: z.number().positive().optional(), fov: z.number().positive().optional(), roll: z.number().optional() });
const Tracking = z.union([z.boolean(), z.strictObject({ lag: z.number().min(0).optional(), lead: z.number().min(0).optional() })]);
const FocusRef = z.union([Vec3, z.string()]);

const Shot = z.strictObject({
  at: TimeRef,
  shot: z.enum(["establishing", "wide", "full", "medium", "close", "two-shot", "over-shoulder", "insert", "custom"]),
  subject: z.union([z.string(), z.array(z.string())]).optional(),
  over: z.string().optional(),
  spot: z.string().optional(),
  item: z.string().optional(),
  anchor: z.string().optional(),
  size: z.number().positive().optional(),
  angle: z.number().optional(),
  height: Height.optional(),
  distance: z.number().positive().optional(),
  lens: z.number().positive().optional(),
  fov: z.number().positive().optional(),
  position: Vec3.optional(),
  target: Vec3.optional(),
  offset: z.tuple([z.number(), z.number()]).optional(),
  roll: z.number().optional(),
  move: z.union([Move, z.array(Move)]).optional(),
  /** Keyframes in the solver's terms (angle, distance/size, height, lens/fov, offset, roll), smooth through every key. */
  keys: z.array(ShotKey).optional(),
  /** World-space position/target keyframes (custom shots): crane moves, fly-throughs. */
  path: z.array(PathKey).optional(),
  /** Aim follows the subject (camera body stays); `lag` smooths, `lead` looks ahead (seconds). */
  track: Tracking.optional(),
  /** Camera body follows the subject too; `lag`, `lead`. */
  follow: Tracking.optional(),
  focus: z.union([z.literal("auto"), z.literal("none"), FocusRef]).optional(),
  rack: z.array(z.strictObject({ at: TimeRef, to: FocusRef, duration: z.number().positive().optional() })).optional(),
  dof: z.union([z.literal("auto"), z.literal("off"), z.strictObject({ bokeh: z.number().min(0).optional(), range: z.number().positive().optional() })]).optional(),
  lock: z.boolean().optional(),
  allowOcclusion: z.array(z.string()).optional(),
  blend: z.number().min(0).optional(),
  /** Findings in this shot that are deliberate, e.g. ["offscreen"], ["back-of-head"]. */
  allow: Allow.optional(),
});

const MoodRef = z.union([z.string(), z.record(z.string(), z.unknown())]);

export const EpisodeSchema = z.strictObject({
  $schema: z.string().optional(),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case id"),
  title: z.string(),
  /** Engine behaviour version: 2 = current defaults (what `new` writes); omitted = 1, the original behaviour. */
  engine: z.literal(ENGINE_VERSIONS).optional(),
  /** Production profile: default behaviours and check thresholds (catalog/direction.json). */
  profile: z.enum(PROFILE_NAMES).optional(),
  /** Findings that are deliberate for the whole episode, e.g. ["silence"] for a film built on pauses. */
  allow: Allow.optional(),
  /**
   * Automatic behaviour switches. Corrections default on with `engine: 2` (focus pulls between speakers, blends
   * that arc around the subject, self-touch recipes through via points, dialogue edge trim, levels, speech
   * motion); styles are opt-in (cameraLife: subtle drift on shots without a move, 0..2; listen: characters look
   * at whoever speaks and nod, 0..1).
   */
  defaults: z
    .strictObject({
      cameraLife: z.number().min(0).max(2).optional(),
      focusPull: z.boolean().optional(),
      arcBlend: z.boolean().optional(),
      listen: z.number().min(0).max(1).optional(),
      viaPoints: z.boolean().optional(),
      trim: z.boolean().optional(),
      level: z.boolean().optional(),
      speechMotion: z.boolean().optional(),
    })
    .optional(),
  format: z
    .strictObject({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      fps: z.number().positive().optional(),
      preset: z.enum(["landscape", "portrait", "square"]).optional(),
    })
    .optional(),
  seed: z.string().optional(),
  set: z
    .strictObject({
      environment: z.string(),
      remove: z.array(z.string()).optional(),
      move: z.record(z.string(), z.strictObject({ position: Vec3.optional(), rotation: z.number().optional(), scale: z.number().optional() })).optional(),
      params: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      add: z
        .array(
          z.strictObject({
            id: z.string(),
            kind: z.string(),
            position: Vec3,
            rotation: z.number().optional(),
            scale: z.number().optional(),
            params: z.record(z.string(), z.unknown()).optional(),
            on: z.string().optional(),
            size: Vec3.optional(),
          }),
        )
        .optional(),
      shell: z.record(z.string(), z.unknown()).optional(),
      marks: z.record(z.string(), z.strictObject({ position: Vec3, yaw: z.number(), description: z.string().optional() })).optional(),
      cameras: z.record(z.string(), z.strictObject({ position: Vec3, target: Vec3, fov: z.number(), description: z.string().optional() })).optional(),
    }),
  mood: MoodRef.optional(),
  cast: z.record(z.string(), CastMember),
  dialogue: z.array(Line).default([]),
  actions: z.array(Action).default([]),
  camera: z.array(Shot).min(1),
  lighting: z.array(z.strictObject({ at: TimeRef, mood: MoodRef, transition: z.number().min(0).optional() })).default([]),
  props: z.array(z.strictObject({ at: TimeRef, item: z.string(), set: z.record(z.string(), z.unknown()) })).default([]),
  sfx: z.array(z.strictObject({ at: TimeRef, sound: z.string(), volume: z.number().min(0).optional(), prompt: z.string().optional() })).default([]),
  /** Music bed: looped, ducked to `duck` × volume under dialogue. attack/release (s) ramp the duck (engine 2: 0.25 / 0.6,
   *  engine 1: 0 = the original hard switch); fadeOut (s) fades the bed out before the end (engine 2: 0.6). */
  music: z
    .strictObject({
      src: z.string(),
      volume: z.number().min(0).optional(),
      duck: z.number().min(0).max(1).optional(),
      attack: z.number().min(0).optional(),
      release: z.number().min(0).optional(),
      fadeOut: z.number().min(0).optional(),
    })
    .optional(),
  events: z.array(z.strictObject({ at: TimeRef, name: z.string(), duration: z.number().min(0).optional(), data: z.record(z.string(), z.unknown()).optional() })).default([]),
  /** Accents: text | window | callout | impact | shake | glitch | flash | dip (catalog/fx.json). */
  fx: z.array(FxEntry).default([]),
  captions: z
    .strictObject({
      style: z.enum(["subtitle", "pop", "none"]).optional(),
      /** Max seconds of speech per caption page. */
      pageSeconds: z.number().positive().optional(),
    })
    .optional(),
  /** Total duration (seconds or time ref). Default: last dialogue/event end + 1.5 s. */
  end: TimeRef.optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;
export type EpisodeInput = z.input<typeof EpisodeSchema>;
export type EpisodeShot = z.infer<typeof Shot>;
export type EpisodeAction = z.infer<typeof Action>;
export type EpisodeVoice = z.infer<typeof Voice>;

export const parseEpisode = (input: unknown): Episode => {
  const r = EpisodeSchema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid episode:\n${issues}`);
  }
  return r.data;
};
