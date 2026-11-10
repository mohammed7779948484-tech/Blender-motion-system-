// Claude-style starburst mascot. A non-humanoid: one squash-and-stretch body, block eyes and
// stubby feet. No arms or skeleton, so its channels and acting vocabulary are its own.
// Conventions: actor faces +Z; actor's left = +X; small by default (≈0.29 m at scale 1).
import type { ActorDefinition, Channels, ChannelSpec } from "../rig";
import { EASINGS, clamp, lerp, type Vec3 } from "../../core/time";
import { outOfFrame, type Frame } from "../ik";

const ch = (rest: number, min: number, max: number, description?: string): ChannelSpec => ({ rest, min, max, description });
const eyes = (l: Partial<Record<"x" | "y" | "sx" | "sy" | "rz", number>>, r: Partial<Record<"x" | "y" | "sx" | "sy" | "rz", number>>): Channels => {
  const out: Channels = {};
  for (const [k, v] of Object.entries(l)) out[`eyeL.${k}`] = v;
  for (const [k, v] of Object.entries(r)) out[`eyeR.${k}`] = v;
  return out;
};

const EYE_NEUTRAL = eyes({ x: 0.032, y: 0, sx: 1, sy: 1, rz: 0 }, { x: -0.032, y: 0, sx: 1, sy: 1, rz: 0 });

export const claudeDef: ActorDefinition = {
  id: "claude",
  name: "Claude",
  kind: "creature",
  description: "Five-lobed orange starburst with vertical block eyes and stubby feet. Expressive through squash, tilt and eye shapes. Scale it up for standing scenes (scale 4 ≈ 1.1 m).",
  size: { height: 0.27, width: 0.34, depth: 0.17 },
  defaultPose: "stand_idle",
  defaultEmotion: "neutral",
  walk: { stride: 0.12, speed: 0.22 },
  channels: {
    "body.y": ch(0.118, 0.05, 0.32, "body centre height"),
    "body.z": ch(0, -0.1, 0.1),
    "body.rx": ch(0, -1.2, 1.2, "+ = lean forward"),
    "body.ry": ch(0, -7, 7, "turn (spins can exceed 2π)"),
    "body.rz": ch(0, -1.2, 1.2, "+ = tilt to its right"),
    squash: ch(1, 0.7, 1.4, "vertical stretch (volume-preserving)"),
    "squash.emotion": ch(0, -0.2, 0.2, "emotion squash offset"),
    "footL.y": ch(0.022, 0, 0.12),
    "footL.z": ch(0.012, -0.08, 0.08),
    "footR.y": ch(0.022, 0, 0.12),
    "footR.z": ch(0.012, -0.08, 0.08),
    "eyeL.x": ch(0.032, -0.07, 0.07),
    "eyeL.y": ch(0, -0.025, 0.025),
    "eyeL.sx": ch(1, 0.4, 1.8),
    "eyeL.sy": ch(1, 0.04, 1.8),
    "eyeL.rz": ch(0, -0.7, 0.7),
    "eyeR.x": ch(-0.032, -0.07, 0.07),
    "eyeR.y": ch(0, -0.025, 0.025),
    "eyeR.sx": ch(1, 0.4, 1.8),
    "eyeR.sy": ch(1, 0.04, 1.8),
    "eyeR.rz": ch(0, -0.7, 0.7),
  },
  poses: {
    stand_idle: { description: "Neutral upright.", set: {} },
    asking_question: { description: "Leans in with a curious tilt.", set: { "body.rx": 0.08, "body.rz": -0.14, "body.z": 0.012, squash: 1.04 } },
    explaining: { description: "Slightly forward and tall.", set: { "body.rx": 0.04, squash: 1.03 } },
    side_glance: { description: "Body turned a little away, side-eye.", set: { "body.ry": -0.28, "body.rz": 0.08 } },
    caring_lean: { description: "Soft sideways lean, slightly squashed.", set: { "body.rx": 0.06, "body.rz": 0.12, squash: 0.96 } },
    proud_puff: { description: "Chest out, stretched tall.", set: { "body.rx": -0.1, "body.y": 0.124, squash: 1.07 } },
    startled_back: { description: "Recoils backwards, stretched.", set: { "body.rx": -0.14, "body.z": -0.018, squash: 1.09 } },
    celebrate: { description: "Continuous happy jumping.", set: { "body.y": 0.131, squash: 1.06 } },
    walk: { description: "Waddle in place (a `move` cue walks automatically).", set: {} },
  },
  emotions: {
    neutral: { description: "Calm.", set: { ...EYE_NEUTRAL, "squash.emotion": 0 } },
    curious: { description: "One eye bigger.", set: eyes({ sy: 1.16, y: 0.003 }, { sy: 0.92 }) },
    skeptical: { description: "One eye squinted.", set: eyes({ sy: 0.52 }, { sy: 1.08, y: 0.003 }) },
    happy: { description: "Squinty wide eyes, slight squash.", set: { ...eyes({ sy: 0.78, sx: 1.12, y: 0.004 }, { sy: 0.78, sx: 1.12, y: 0.004 }), "squash.emotion": -0.04 } },
    shocked: { description: "Huge eyes, stretched.", set: { ...eyes({ sy: 1.32, sx: 1.1 }, { sy: 1.32, sx: 1.1 }), "squash.emotion": 0.07 } },
    annoyed: { description: "Flat angled eyes.", set: { ...eyes({ sy: 0.45, rz: 0.15 }, { sy: 0.45, rz: -0.15 }), "squash.emotion": -0.05 } },
    pleading: { description: "Big sad tilted eyes.", set: eyes({ sy: 1.12, rz: -0.14, y: -0.003 }, { sy: 1.12, rz: 0.14, y: -0.003 }) },
    tired: { description: "Half-closed low eyes, deflated.", set: { ...eyes({ sy: 0.32, y: -0.005 }, { sy: 0.32, y: -0.005 }), "squash.emotion": -0.06 } },
  },
  gestures: {
    flinch: {
      description: "Startled squash backwards with huge eyes.",
      duration: 0.6,
      attack: 0.05,
      release: 0.35,
      set: { "body.z": -0.03, "body.rx": -0.2, squash: 0.86, "eyeL.sy": 1.45, "eyeR.sy": 1.45 },
    },
    hop: {
      description: "A single bouncy hop with anticipation squash.",
      duration: 0.7,
      add: (u) => {
        const air = Math.sin(clamp((u - 0.15) / 0.7, 0, 1) * Math.PI);
        const crouch = u < 0.15 ? -Math.sin((u / 0.15) * Math.PI) * 0.12 : u > 0.85 ? -Math.sin(((u - 0.85) / 0.15) * Math.PI) * 0.1 : air * 0.06;
        return { "body.y": air * 0.07, squash: crouch, "footL.y": air * 0.05, "footR.y": air * 0.05 };
      },
    },
    nod: { description: "Two nods.", duration: 0.8, add: (u) => ({ "body.rx": Math.sin(u * Math.PI * 4) * 0.15 * Math.sin(u * Math.PI) }) },
    shake: { description: "Shakes no.", duration: 0.9, add: (u) => ({ "body.ry": Math.sin(u * Math.PI * 6) * 0.3 * Math.sin(u * Math.PI) }) },
    spin: { description: "Full 360° spin.", duration: 0.9, add: (u) => ({ "body.ry": EASINGS.inOut(u) * Math.PI * 2, squash: Math.sin(u * Math.PI) * 0.05 }) },
    wiggle: { description: "Happy side-to-side wiggle.", duration: 1.0, add: (u) => ({ "body.rz": Math.sin(u * Math.PI * 8) * 0.2 * Math.sin(u * Math.PI), squash: Math.sin(u * Math.PI * 8) * 0.04 }) },
    beat: { description: "A small emphasis accent on a word: a quick forward dip and squash pulse (put it on `lN.word:K`).", duration: 0.4, add: (u) => ({ "body.rx": Math.sin(u * Math.PI) * 0.1, squash: -Math.sin(u * Math.PI) * 0.035 }) },
  },
  sockets: {
    top: "Above the top lobe (hats, icons, thought bubbles)",
    left: "Its left side lobe (+X)",
    right: "Its right side lobe (-X)",
  },
  appearance: {
    bodyColor: { type: "color", default: "#e56b3e", description: "Body" },
    eyeColor: { type: "color", default: "#141418", description: "Eyes and feet shading" },
  },
  recipeGestures: { flinch: "flinch", stomp: "hop", stompContact: 0.85 },
  persona: { description: "Calm, literal, deadpan AI: small, late reactions; most of the comedy is in its stillness.", listen: { delay: 0.35, nod: 0.5 } },
  // No arms: "reaching" is leaning the whole body toward the target (and pressing is a hop onto it).
  reach: (c, target) => {
    const up = target[1] - c["body.y"];
    const forward = Math.max(0, target[2]);
    return {
      set: { "body.rx": clamp(Math.atan2(forward, Math.max(0.05, 0.12 - up)) * 0.6, -0.4, 0.75), "body.rz": clamp(-target[0] * 2.5, -0.45, 0.45), "body.z": clamp(target[2] * 0.25, -0.04, 0.06), squash: 1.06 },
      reached: Math.hypot(target[0], target[2]) < 0.25,
    };
  },
  // Contact-check volumes (mirrors Claude.tsx): the body group turns with body.rx/ry/rz, so `face` follows it.
  effectors: (c) => {
    const body: Frame = { position: [0, c["body.y"], c["body.z"]], rotations: [[c["body.rx"], c["body.ry"], c["body.rz"]]] };
    const centre = body.position;
    const foot = (s: "L" | "R"): Vec3 => [(s === "L" ? 1 : -1) * 0.052, c[`foot${s}.y`] - 0.02, c[`foot${s}.z`]];
    return {
      points: { head: centre, face: outOfFrame(body, [0, 0, 0.09]), footL: foot("L"), footR: foot("R") },
      parts: [{ name: "body", a: centre, b: centre, r: 0.13 }],
    };
  },
  anchors: (c) => {
    const y = c["body.y"];
    const stretch = c.squash + c["squash.emotion"];
    return {
      feet: [0, 0, 0.01],
      waist: [0, y * 0.5, 0],
      chest: [0, y, 0.03],
      head: [0, y, 0.04],
      face: [0, y, 0.09],
      top: [0, y + 0.152 * stretch, 0],
    };
  },
  life: (c, s) => {
    const w = s.lookWeight;
    c.squash += s.breath * 0.018;
    c["body.y"] += s.breath * 0.0036;
    c["body.rz"] += s.noise("rock", 0.85) * 0.035;
    c["body.ry"] += s.noise("turn", 0.65) * 0.045;

    c["body.ry"] += clamp(s.lookYaw * 0.35, -0.45, 0.45) * w;
    c["body.rx"] -= clamp(s.lookPitch * 0.25, -0.28, 0.28) * w;
    const ex = clamp(s.lookYaw * 0.024, -0.018, 0.018) * w + s.noise("eyeX", 1.1) * 0.0025;
    const ey = clamp(s.lookPitch * 0.016, -0.011, 0.011) * w + s.noise("eyeY", 0.9) * 0.0018;
    c["eyeL.x"] += ex;
    c["eyeR.x"] += ex;
    c["eyeL.y"] += ey;
    c["eyeR.y"] += ey;

    // Talking: the whole body follows the (slow, with speech motion) speech energy; the eyes pulse with syllables.
    if (s.talkBody > 0.01) {
      c["body.y"] += s.talkBody * 0.012;
      c.squash += s.talkBody * 0.065 * s.noise("talkSquash", 5);
      c["body.rz"] += s.talkBody * 0.06 * s.noise("talkTilt", 3);
      c["body.rx"] += s.talkBody * 0.04 * s.noise("talkPitch", 4);
    }
    if (s.talk > 0.01) {
      const pulse = 1 + s.talk * 0.12 * s.noise("eyePulse", 6);
      c["eyeL.sy"] *= pulse;
      c["eyeR.sy"] *= pulse;
    }

    if (s.pose === "celebrate") {
      const jump = Math.abs(Math.sin(s.t * 8.5));
      c["body.y"] += jump * 0.045;
      c["footL.y"] += jump * 0.032;
      c["footR.y"] += jump * 0.032;
    }

    if (s.walk > 0) {
      const step = s.walkPhase;
      c["body.y"] += Math.abs(Math.sin(step)) * 0.014 * s.walk;
      c["body.rz"] += Math.cos(step) * 0.09 * s.walk;
      c["footL.y"] = lerp(c["footL.y"], 0.022 + Math.max(0, Math.sin(step)) * 0.018, s.walk);
      c["footR.y"] = lerp(c["footR.y"], 0.022 + Math.max(0, -Math.sin(step)) * 0.018, s.walk);
      c["footL.z"] = lerp(c["footL.z"], 0.012 + Math.cos(step) * 0.022, s.walk);
      c["footR.z"] = lerp(c["footR.z"], 0.012 - Math.cos(step) * 0.022, s.walk);
    }

    // Listening nod (opt-in listening only): a small forward dip.
    if (s.beat > 0) {
      c["body.rx"] += s.beat * 0.08;
      c.squash -= s.beat * 0.02;
    }

    const lid = lerp(1, 0.08, s.blink);
    c["eyeL.sy"] *= lid;
    c["eyeR.sy"] *= lid;
  },
};
