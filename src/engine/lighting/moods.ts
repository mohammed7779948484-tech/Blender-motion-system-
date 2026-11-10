// Lighting moods: plain data, blended over time. Episodes may pass inline mood objects too
// (`{ "mood": { ...partial Mood, "base": "late-night" } }`), so new looks need no library edits.
import { Color } from "three";
import { clamp01, lerp, lerpVec3, progress, type EaseName, type Vec3 } from "../core/time";

export type Light = { color: string; intensity: number; position: Vec3 };

export type Mood = {
  description: string;
  background: string;
  fog: { color: string; near: number; far: number } | null;
  ambient: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  key: Light;
  fill: Light;
  rim: Light;
  /** Image-based light strength (neutral studio environment). */
  environment: number;
  exposure: number;
  bloom: number;
  /** Multipliers for lights that belong to the set (desk lamp, screens, window). */
  practicals: { lamp: number; screens: number; window: string; windowIntensity: number };
  /** Optional alarm-style colour pulse added to the key light. */
  pulse: { color: string; hz: number; amount: number } | null;
};

export const MOODS: Record<string, Mood> = {
  "day-office": {
    description: "Bright, neutral daylight office.",
    background: "#cfd9e6",
    fog: { color: "#cfd9e6", near: 9, far: 26 },
    ambient: { color: "#ffffff", intensity: 0.35 },
    hemisphere: { sky: "#dbe9ff", ground: "#8a7a66", intensity: 0.7 },
    key: { color: "#fff3e0", intensity: 2.6, position: [3, 5, 4] },
    fill: { color: "#cfe0ff", intensity: 0.7, position: [-4, 2.5, 3] },
    rim: { color: "#ffffff", intensity: 0.9, position: [-2, 3, -4] },
    environment: 0.6,
    exposure: 1.0,
    bloom: 0.25,
    practicals: { lamp: 0.3, screens: 0.8, window: "#bfe3ff", windowIntensity: 1.4 },
    pulse: null,
  },
  "late-night": {
    description: "Dark room, cool moonlight, warm desk lamp, glowing screens.",
    background: "#0b1020",
    fog: { color: "#0b1020", near: 6, far: 18 },
    ambient: { color: "#6b7cff", intensity: 0.12 },
    hemisphere: { sky: "#3348a8", ground: "#1a1210", intensity: 0.35 },
    key: { color: "#ffb36b", intensity: 1.15, position: [1.8, 2.6, 1.6] },
    fill: { color: "#5f7dff", intensity: 0.5, position: [-3, 2, 2.5] },
    rim: { color: "#7fb2ff", intensity: 1.5, position: [-1.5, 2.8, -3] },
    environment: 0.16,
    exposure: 0.92,
    bloom: 0.65,
    practicals: { lamp: 1.4, screens: 1.6, window: "#3c5bd6", windowIntensity: 0.9 },
    pulse: null,
  },
  "red-alert": {
    description: "Alarm: pulsing red light over a dark room.",
    background: "#1a0508",
    fog: { color: "#1a0508", near: 5, far: 15 },
    ambient: { color: "#ff3344", intensity: 0.12 },
    hemisphere: { sky: "#ff4455", ground: "#200406", intensity: 0.3 },
    key: { color: "#ff2b2b", intensity: 2.2, position: [2, 3, 2] },
    fill: { color: "#ff7a3d", intensity: 0.35, position: [-3, 2, 2.5] },
    rim: { color: "#ff3355", intensity: 1.8, position: [-1.5, 2.8, -3] },
    environment: 0.12,
    exposure: 1.05,
    bloom: 1.1,
    practicals: { lamp: 0.4, screens: 1.8, window: "#ff3344", windowIntensity: 0.6 },
    pulse: { color: "#ff0000", hz: 1.6, amount: 0.75 },
  },
  "macro-warm": {
    description: "Night macro: warm desk-lamp key from the side, cool screen glow behind, deep shadows (micro-keyboard).",
    background: "#06070c",
    fog: { color: "#06070c", near: 9, far: 34 },
    ambient: { color: "#7d8cff", intensity: 0.1 },
    hemisphere: { sky: "#3d4f99", ground: "#1c140e", intensity: 0.32 },
    key: { color: "#ffb36b", intensity: 2.3, position: [9, 11, 8] },
    fill: { color: "#6f8cff", intensity: 0.4, position: [-9, 5, 7] },
    rim: { color: "#86b8ff", intensity: 1.7, position: [0, 7, -7] },
    environment: 0.16,
    exposure: 0.95,
    bloom: 0.85,
    practicals: { lamp: 1, screens: 1.3, window: "#3c5bd6", windowIntensity: 0.6 },
    pulse: null,
  },
  "space-cool": {
    description: "Deep space: crisp cool starlight key from the front-right, violet nebula fill, teal rim, faint fog for depth (floating-space).",
    background: "#05060f",
    fog: { color: "#0d0f2b", near: 16, far: 70 },
    ambient: { color: "#8a96ff", intensity: 0.16 },
    hemisphere: { sky: "#8190ff", ground: "#3a1d5e", intensity: 0.5 },
    key: { color: "#eef2ff", intensity: 2.5, position: [5, 9, 7] },
    fill: { color: "#9a7bff", intensity: 0.6, position: [-7, 3, 6] },
    rim: { color: "#5ce1e6", intensity: 1.7, position: [-3, 5, -8] },
    environment: 0.22,
    exposure: 1.0,
    bloom: 0.8,
    practicals: { lamp: 0.6, screens: 1.3, window: "#5ce1e6", windowIntensity: 0.8 },
    pulse: null,
  },
  "soft-studio": {
    description: "Even, flattering three-point studio light.",
    background: "#1d2130",
    fog: null,
    ambient: { color: "#ffffff", intensity: 0.3 },
    hemisphere: { sky: "#ffffff", ground: "#404040", intensity: 0.5 },
    key: { color: "#fff6ea", intensity: 2.4, position: [2.5, 4, 3.5] },
    fill: { color: "#e6eeff", intensity: 1.0, position: [-3.5, 2.5, 3] },
    rim: { color: "#ffffff", intensity: 1.4, position: [0, 3.5, -4] },
    environment: 0.7,
    exposure: 1.0,
    bloom: 0.35,
    practicals: { lamp: 0.6, screens: 1.0, window: "#ffffff", windowIntensity: 1.0 },
    pulse: null,
  },
};

/** A mood reference in direction data: a library name, or a partial override of a base mood. */
export type MoodRef = string | (Partial<Mood> & { base?: string });
export type MoodCue = { at: number; mood: MoodRef; transition?: number; ease?: EaseName };

export const resolveMood = (ref: MoodRef): Mood => {
  if (typeof ref === "string") {
    const m = MOODS[ref];
    if (!m) throw new Error(`Unknown mood "${ref}". Known: ${Object.keys(MOODS).join(", ")}`);
    return m;
  }
  const base = resolveMood(ref.base ?? "soft-studio");
  return { ...base, ...ref, practicals: { ...base.practicals, ...ref.practicals } } as Mood;
};

const tmpA = new Color();
const tmpB = new Color();
const mixColor = (a: string, b: string, u: number) => `#${tmpA.set(a).lerp(tmpB.set(b), u).getHexString()}`;
const mixLight = (a: Light, b: Light, u: number): Light => ({
  color: mixColor(a.color, b.color, u),
  intensity: lerp(a.intensity, b.intensity, u),
  position: lerpVec3(a.position, b.position, u),
});

export const mixMoods = (a: Mood, b: Mood, u: number): Mood => {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const fogA = a.fog ?? { color: a.background, near: 50, far: 120 };
  const fogB = b.fog ?? { color: b.background, near: 50, far: 120 };
  return {
    description: b.description,
    background: mixColor(a.background, b.background, u),
    fog: { color: mixColor(fogA.color, fogB.color, u), near: lerp(fogA.near, fogB.near, u), far: lerp(fogA.far, fogB.far, u) },
    ambient: { color: mixColor(a.ambient.color, b.ambient.color, u), intensity: lerp(a.ambient.intensity, b.ambient.intensity, u) },
    hemisphere: {
      sky: mixColor(a.hemisphere.sky, b.hemisphere.sky, u),
      ground: mixColor(a.hemisphere.ground, b.hemisphere.ground, u),
      intensity: lerp(a.hemisphere.intensity, b.hemisphere.intensity, u),
    },
    key: mixLight(a.key, b.key, u),
    fill: mixLight(a.fill, b.fill, u),
    rim: mixLight(a.rim, b.rim, u),
    environment: lerp(a.environment, b.environment, u),
    exposure: lerp(a.exposure, b.exposure, u),
    bloom: lerp(a.bloom, b.bloom, u),
    practicals: {
      lamp: lerp(a.practicals.lamp, b.practicals.lamp, u),
      screens: lerp(a.practicals.screens, b.practicals.screens, u),
      window: mixColor(a.practicals.window, b.practicals.window, u),
      windowIntensity: lerp(a.practicals.windowIntensity, b.practicals.windowIntensity, u),
    },
    pulse: u < 0.5 ? a.pulse : b.pulse,
  };
};

/** Mood at time t from a cue list (sorted). Interrupted blends continue from where they were. */
export const moodAt = (cues: MoodCue[], t: number, initial: MoodRef = "soft-studio"): Mood => {
  let current = resolveMood(initial);
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.at > t) break;
    const next = cues[i + 1];
    const until = next && next.at <= t ? next.at : t;
    current = mixMoods(current, resolveMood(cue.mood), progress(until, cue.at, cue.transition ?? 0.6, cue.ease ?? "smooth"));
  }
  return current;
};

/** Key-light colour/intensity after the optional pulse (pure in t). */
export const pulsedKey = (mood: Mood, t: number): Light => {
  if (!mood.pulse) return mood.key;
  const wave = clamp01(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * mood.pulse.hz));
  return {
    ...mood.key,
    color: mixColor(mood.key.color, mood.pulse.color, wave * mood.pulse.amount),
    intensity: mood.key.intensity * (1 - mood.pulse.amount * 0.6 + wave * mood.pulse.amount * 0.9),
  };
};
