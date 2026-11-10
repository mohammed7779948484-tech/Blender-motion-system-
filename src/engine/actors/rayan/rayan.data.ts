// Rayan, a low-poly humanoid programmer. Pure data + pure functions (no React) so the catalog,
// CLI and tests can import it in Node. Geometry lives in Rayan.tsx.
// Conventions: metres, +Y up, actor faces +Z; joint angles in radians (XYZ order).
// head.x / torso.x positive = tilt forward/down; hip.x negative = leg forward; knee.x positive = bend.
import type { ActorDefinition, Channels, ChannelSpec, Effectors } from "../rig";
import { clamp, lerp, type Vec3 } from "../../core/time";
import { armFK, armIK, childFrame, inFrame, outOfFrame, type ArmRig, type Frame } from "../ik";

// Arm geometry, mirrored from Rayan.tsx (pelvis → torso (+0.06) → shoulder (±0.25, 0.38) → elbow
// (±0.02, -0.23) → wrist (0, -0.22) → palm socket (0, -0.04, 0.04)). Keep in sync with the view.
const armRig = (side: 1 | -1): ArmRig => ({
  shoulder: [side * 0.25, 0.38, 0],
  elbow: [side * 0.02, -0.23, 0],
  hand: [0, -0.26, 0.04],
  pole: [side * 0.6, -1, -0.25],
});
/** Torso frame in root space: pelvis group (y, tilt x) → torso group (+0.06, XYZ). */
const torsoFrame = (c: Channels): Frame => {
  const pelvis: Frame = { position: [0, c["pelvis.y"], 0], rotations: [[c["pelvis.x"], 0, 0]] };
  return { position: outOfFrame(pelvis, [0, 0.06, 0]), rotations: [[c["pelvis.x"], 0, 0], [c["torso.x"], c["torso.y"], c["torso.z"]]] };
};
/** Palm position (root-local, unscaled) for the current channels: forward kinematics of the arm. */
export const rayanHand = (c: Channels, side: "L" | "R"): Vec3 => {
  const local = armFK(armRig(side === "L" ? 1 : -1), [c[`shoulder${side}.x`], c[`shoulder${side}.y`], c[`shoulder${side}.z`]], c[`elbow${side}.x`]);
  return outOfFrame(torsoFrame(c), local);
};

/**
 * Body points and volumes for contact checks, following Rayan.tsx group by group (pelvis → torso → neck →
 * head; shoulder → elbow → wrist → palm; hip → knee → ankle → sole). Keep in sync with the view.
 */
const rayanEffectors = (c: Channels): Effectors => {
  const rot = (name: string): Vec3 => [c[`${name}.x`] ?? 0, c[`${name}.y`] ?? 0, c[`${name}.z`] ?? 0];
  const pelvis: Frame = { position: [0, c["pelvis.y"], 0], rotations: [[c["pelvis.x"], 0, 0]] };
  const torso = childFrame(pelvis, [0, 0.06, 0], rot("torso"));
  const neck = childFrame(torso, [0, 0.46, 0], [0, 0, 0]);
  const head = childFrame(neck, [0, 0.07, 0], rot("head"));
  const headCentre = outOfFrame(head, [0, 0.19, 0]);
  const arm = (side: 1 | -1) => {
    const s = side === 1 ? "L" : "R";
    const shoulder = childFrame(torso, [side * 0.25, 0.38, 0], rot(`shoulder${s}`));
    const elbow = childFrame(shoulder, [side * 0.02, -0.23, 0], rot(`elbow${s}`));
    const wrist = childFrame(elbow, [0, -0.22, 0], rot(`wrist${s}`));
    return { shoulder: shoulder.position, elbow: elbow.position, wrist: wrist.position, hand: outOfFrame(wrist, [0, -0.04, 0.04]) };
  };
  const leg = (side: 1 | -1) => {
    const s = side === 1 ? "L" : "R";
    const hip = childFrame(pelvis, [side * 0.1, -0.05, 0], rot(`hip${s}`));
    const knee = childFrame(hip, [0, -0.34, 0], [c[`knee${s}.x`], 0, 0]);
    const ankle = childFrame(knee, [0, -0.31, 0.035], [0, 0, 0]);
    return { hip: hip.position, knee: knee.position, ankle: ankle.position, sole: outOfFrame(ankle, [0, -0.0375, 0]) };
  };
  const [aL, aR, lL, lR] = [arm(1), arm(-1), leg(1), leg(-1)];
  const limb = (name: string, a: Vec3, b: Vec3, r: number) => ({ name, a, b, r });
  return {
    points: { head: headCentre, face: outOfFrame(head, [0, 0.19, 0.23]), handL: aL.hand, handR: aR.hand, elbowL: aL.elbow, elbowR: aR.elbow, footL: lL.sole, footR: lR.sole, pelvis: pelvis.position },
    parts: [
      limb("head", headCentre, headCentre, 0.23),
      limb("torso", torso.position, neck.position, 0.2),
      limb("upperArmL", aL.shoulder, aL.elbow, 0.07),
      limb("forearmL", aL.elbow, aL.wrist, 0.06),
      limb("handL", aL.hand, aL.hand, 0.05),
      limb("upperArmR", aR.shoulder, aR.elbow, 0.07),
      limb("forearmR", aR.elbow, aR.wrist, 0.06),
      limb("handR", aR.hand, aR.hand, 0.05),
      limb("thighL", lL.hip, lL.knee, 0.075),
      limb("shinL", lL.knee, lL.ankle, 0.06),
      limb("thighR", lR.hip, lR.knee, 0.075),
      limb("shinR", lR.knee, lR.ankle, 0.06),
    ],
  };
};

/** A point in the head's own frame (centre at [0, 0.19, 0], face front at +z 0.23), in root-local space. */
const headPoint = (c: Channels, local: Vec3): Vec3 => {
  const rot = (name: string): Vec3 => [c[`${name}.x`] ?? 0, c[`${name}.y`] ?? 0, c[`${name}.z`] ?? 0];
  const pelvis: Frame = { position: [0, c["pelvis.y"], 0], rotations: [[c["pelvis.x"], 0, 0]] };
  const head = childFrame(childFrame(childFrame(pelvis, [0, 0.06, 0], rot("torso")), [0, 0.46, 0], [0, 0, 0]), [0, 0.07, 0], rot("head"));
  return outOfFrame(head, local);
};

const HALF_PI = Math.PI / 2;
const ch = (rest: number, min: number, max: number, description?: string): ChannelSpec => ({ rest, min, max, description });
const rot3 = (name: string, rest: [number, number, number], range: [number, number]) => ({
  [`${name}.x`]: ch(rest[0], range[0], range[1]),
  [`${name}.y`]: ch(rest[1], range[0], range[1]),
  [`${name}.z`]: ch(rest[2], range[0], range[1]),
});
const arm = (side: "L" | "R", s: { x: number; y: number; z: number }, e: { x: number; y: number; z: number }): Channels => ({
  [`shoulder${side}.x`]: s.x,
  [`shoulder${side}.y`]: s.y,
  [`shoulder${side}.z`]: s.z,
  [`elbow${side}.x`]: e.x,
  [`elbow${side}.y`]: e.y,
  [`elbow${side}.z`]: e.z,
});
const seated = (spread: number): Channels => ({
  "pelvis.y": 0.44,
  "hipL.x": -HALF_PI,
  "hipL.y": spread,
  "kneeL.x": HALF_PI,
  "hipR.x": -HALF_PI,
  "hipR.y": -spread,
  "kneeR.x": HALF_PI,
});

const channels: Record<string, ChannelSpec> = {
  "pelvis.y": ch(0.72, 0.2, 1.0, "pelvis height above ground (sitting ≈ 0.44)"),
  "pelvis.x": ch(0, -0.6, 0.6, "hip tilt"),
  ...rot3("torso", [0, 0, 0], [-0.9, 0.9]),
  ...rot3("head", [0, 0, 0], [-1.2, 1.2]),
  ...rot3("shoulderL", [0.05, 0, 0.14], [-3.2, 2.8]),
  ...rot3("elbowL", [-0.28, 0, 0], [-2.7, 1.6]),
  ...rot3("wristL", [0, 0, 0], [-1.4, 1.4]),
  ...rot3("shoulderR", [0.05, 0, -0.14], [-3.2, 2.8]),
  ...rot3("elbowR", [-0.28, 0, 0], [-2.7, 1.6]),
  ...rot3("wristR", [0, 0, 0], [-1.4, 1.4]),
  ...rot3("hipL", [0, 0, 0], [-2.0, 1.2]),
  "kneeL.x": ch(0, -0.1, 2.5),
  ...rot3("hipR", [0, 0, 0], [-2.0, 1.2]),
  "kneeR.x": ch(0, -0.1, 2.5),
  "browL.y": ch(0.085, 0.06, 0.135, "brow height"),
  "browL.rz": ch(0, -0.5, 0.5, "brow tilt (+ = angry V)"),
  "browR.y": ch(0.085, 0.06, 0.135),
  "browR.rz": ch(0, -0.5, 0.5, "brow tilt (- = angry V)"),
  "lidL": ch(0.01, 0.01, 1, "upper eyelid closure"),
  "lidR": ch(0.01, 0.01, 1),
  "pupil.x": ch(0, -0.014, 0.014),
  "pupil.y": ch(0, -0.012, 0.012),
  "mouth.open": ch(0.22, 0.1, 1.6),
  "mouth.wide": ch(1, 0.6, 1.6),
  "mouth.smile": ch(0, -1, 1, "corner curve: + smile, - frown"),
  "blush": ch(0.3, 0, 1),
};

const STAND_ARMS = { ...arm("L", { x: 0.05, y: 0, z: 0.14 }, { x: -0.28, y: 0, z: 0 }), ...arm("R", { x: 0.05, y: 0, z: -0.14 }, { x: -0.28, y: 0, z: 0 }) };

export const rayanDef: ActorDefinition = {
  id: "rayan",
  name: "Rayan",
  kind: "humanoid",
  description: "Low-poly programmer: puffy orange jacket, round glasses, neck headphones, glowing chest badge.",
  size: { height: 1.78, width: 0.75, depth: 0.54 },
  channels,
  defaultPose: "stand_idle",
  defaultEmotion: "neutral",
  walk: { stride: 1.3, speed: 1.1 },
  poses: {
    stand_idle: { description: "Relaxed standing.", set: STAND_ARMS },
    explaining: {
      description: "Both forearms forward, palms open; hands animate while talking.",
      set: { "torso.x": 0.06, ...arm("L", { x: -0.65, y: 0.25, z: 0.25 }, { x: -1.1, y: 0.3, z: 0 }), ...arm("R", { x: -0.65, y: -0.25, z: -0.25 }, { x: -1.1, y: -0.3, z: 0 }) },
    },
    arms_crossed: {
      description: "Arms folded across the chest, leaning back slightly.",
      set: { "torso.x": -0.04, ...arm("L", { x: -0.75, y: -0.55, z: 0.15 }, { x: -1.65, y: 0, z: -0.4 }), ...arm("R", { x: -0.78, y: 0.55, z: -0.15 }, { x: -1.65, y: 0, z: 0.4 }) },
    },
    thinking: {
      description: "Hand on chin, other arm supporting the elbow, head tilted.",
      set: { "head.x": 0.08, "head.z": 0.08, ...arm("L", { x: -0.55, y: -0.45, z: 0.1 }, { x: -1.45, y: 0, z: -0.3 }), ...arm("R", { x: -0.95, y: 0.35, z: -0.1 }, { x: -1.95, y: 0, z: 0.25 }) },
    },
    shrug: {
      description: "Shoulders up, palms out, head tilted.",
      set: { "head.z": 0.12, ...arm("L", { x: -0.25, y: 0, z: 0.65 }, { x: -1.35, y: 0.4, z: 0.3 }), ...arm("R", { x: -0.25, y: 0, z: -0.65 }, { x: -1.35, y: -0.4, z: -0.3 }) },
    },
    celebrate: {
      description: "Both arms raised overhead.",
      set: { "torso.x": -0.08, ...arm("L", { x: -2.4, y: 0, z: 0.35 }, { x: -0.4, y: 0, z: 0 }), ...arm("R", { x: -2.4, y: 0, z: -0.35 }, { x: -0.4, y: 0, z: 0 }) },
    },
    sit_idle: {
      description: "Seated (place root at a chair-seat mark), hands resting on thighs.",
      set: { ...seated(0.08), ...arm("L", { x: -0.35, y: -0.15, z: 0.12 }, { x: -0.85, y: 0, z: 0 }), ...arm("R", { x: -0.35, y: 0.15, z: -0.12 }, { x: -0.85, y: 0, z: 0 }) },
    },
    sit_typing: {
      description: "Seated, leaning in, hands on a keyboard; fingers type automatically.",
      set: { ...seated(0.06), "torso.x": 0.12, "head.x": 0.14, ...arm("L", { x: -0.7, y: -0.22, z: 0.15 }, { x: -1.05, y: 0, z: 0 }), ...arm("R", { x: -0.7, y: 0.22, z: -0.15 }, { x: -1.05, y: 0, z: 0 }) },
    },
    sit_explaining: {
      description: "Seated, turned-in torso, both forearms up explaining; hands animate while talking.",
      set: { ...seated(0.08), "torso.x": 0.04, ...arm("L", { x: -0.75, y: 0.25, z: 0.22 }, { x: -1.15, y: 0.3, z: 0 }), ...arm("R", { x: -0.75, y: -0.25, z: -0.22 }, { x: -1.15, y: -0.3, z: 0 }) },
    },
    sit_arms_crossed: {
      description: "Seated, leaning back with arms folded.",
      set: { ...seated(0.1), "torso.x": -0.08, ...arm("L", { x: -0.75, y: -0.55, z: 0.15 }, { x: -1.65, y: 0, z: -0.4 }), ...arm("R", { x: -0.78, y: 0.55, z: -0.15 }, { x: -1.65, y: 0, z: 0.4 }) },
    },
    walk: { description: "Walk cycle in place (a `move` cue walks automatically from any standing pose).", set: STAND_ARMS },
    crouch: {
      description: "Squat low with a forward lean (picking something up, putting it down). Feet stay planted.",
      set: { ...STAND_ARMS, "pelvis.y": 0.37, "hipL.x": -1.4, "hipR.x": -1.4, "kneeL.x": 2.2, "kneeR.x": 2.2, "torso.x": 0.7, "head.x": -0.05 },
    },
  },
  emotions: {
    neutral: { description: "Calm.", set: { "browL.y": 0.085, "browL.rz": 0, "browR.y": 0.085, "browR.rz": 0, lidL: 0.01, lidR: 0.01, "mouth.open": 0.22, "mouth.wide": 1, "mouth.smile": 0, blush: 0.3 } },
    happy: { description: "Raised brows, wide smile.", set: { "browL.y": 0.1, "browL.rz": -0.12, "browR.y": 0.1, "browR.rz": 0.12, "mouth.open": 0.35, "mouth.wide": 1.45, "mouth.smile": 0.85, blush: 0.6 } },
    skeptical: { description: "One brow up, one eye narrowed, smirk.", set: { "browL.y": 0.112, "browL.rz": -0.18, "browR.y": 0.072, "browR.rz": -0.15, lidL: 0.12, lidR: 0.38, "mouth.open": 0.18, "mouth.wide": 0.85, "mouth.smile": -0.25 } },
    shocked: { description: "Brows high, mouth open.", set: { "browL.y": 0.124, "browL.rz": -0.08, "browR.y": 0.124, "browR.rz": 0.08, "mouth.open": 1.15, "mouth.wide": 0.85 } },
    angry: { description: "V brows, narrowed eyes, frown.", set: { "browL.y": 0.072, "browL.rz": 0.32, "browR.y": 0.072, "browR.rz": -0.32, lidL: 0.3, lidR: 0.3, "mouth.open": 0.2, "mouth.wide": 1.1, "mouth.smile": -0.6, blush: 0.55 } },
    tired: { description: "Droopy lids, sad brows.", set: { "browL.y": 0.078, "browL.rz": -0.2, "browR.y": 0.078, "browR.rz": 0.2, lidL: 0.55, lidR: 0.55, "mouth.open": 0.2, "mouth.wide": 0.9, "mouth.smile": -0.3, blush: 0.15 } },
  },
  gestures: {
    flinch: {
      description: "Recoils from an impact: jolts back, arms up, brows high.",
      duration: 0.8,
      attack: 0.06,
      release: 0.4,
      set: { "torso.x": -0.18, "head.x": -0.15, "shoulderL.x": -1.1, "shoulderL.z": 0.55, "elbowL.x": -1.7, "shoulderR.x": -1.1, "shoulderR.z": -0.55, "elbowR.x": -1.7, "browL.y": 0.13, "browR.y": 0.13 },
    },
    stomp: {
      description: "Small hop and a heavy landing on whatever is underfoot (lands at 45% of the gesture).",
      duration: 0.7,
      add: (u) => {
        const air = u < 0.45 ? Math.sin((u / 0.45) * Math.PI) : 0;
        const dip = u >= 0.45 ? Math.sin(((u - 0.45) / 0.55) * Math.PI) : 0;
        return { "pelvis.y": air * 0.2 - dip * 0.12, "kneeL.x": dip * 0.65 + air * 0.5, "kneeR.x": dip * 0.65 + air * 0.5, "hipL.x": -dip * 0.35 - air * 0.3, "hipR.x": -dip * 0.35 - air * 0.3, "torso.x": dip * 0.15, "shoulderL.z": air * 0.5, "shoulderR.z": -air * 0.5 };
      },
    },
    wave: {
      description: "Right hand raised, waving.",
      duration: 1.6,
      set: { "shoulderR.x": -2.6, "shoulderR.z": -0.5, "elbowR.x": -0.7, "elbowR.y": 0 },
      add: (u) => ({ "elbowR.z": Math.sin(u * Math.PI * 8) * 0.45 * Math.sin(u * Math.PI), "wristR.z": Math.sin(u * Math.PI * 8 - 0.6) * 0.25 }),
    },
    nod: { description: "Two quick nods.", duration: 0.9, add: (u) => ({ "head.x": Math.sin(u * Math.PI * 4) * 0.2 * Math.sin(u * Math.PI) }) },
    head_shake: { description: "Shakes head no.", duration: 1.0, add: (u) => ({ "head.y": Math.sin(u * Math.PI * 6) * 0.35 * Math.sin(u * Math.PI) }) },
    facepalm: {
      description: "Right palm to face, head drops.",
      duration: 2.0,
      attack: 0.3,
      release: 0.45,
      set: { "shoulderR.x": -1.45, "shoulderR.y": 0.6, "shoulderR.z": 0.1, "elbowR.x": -2.45, "elbowR.y": 0, "elbowR.z": 0.35, "wristR.x": 0.3, "head.x": 0.32, "torso.x": 0.14 },
    },
    double_take: {
      description: "Glances away, snaps back with raised brows and a recoil.",
      duration: 1.1,
      attack: 0.15,
      release: 0.3,
      set: { "browL.y": 0.128, "browR.y": 0.128, "torso.x": -0.12 },
      add: (u) => ({ "head.y": u < 0.35 ? Math.sin((u / 0.35) * Math.PI) * 0.55 : 0, "head.x": u > 0.35 ? -Math.sin(((u - 0.35) / 0.65) * Math.PI) * 0.12 : 0 }),
    },
    beat: {
      description: "A small emphasis accent on a word: a quick head dip and brow lift (put it on `lN.word:K`).",
      duration: 0.45,
      add: (u) => {
        const b = Math.sin(u * Math.PI);
        return { "head.x": b * 0.11, "torso.x": b * 0.03, "browL.y": b * 0.012, "browR.y": b * 0.012 };
      },
    },
    type_burst: {
      description: "Frantic typing (use while seated at a keyboard).",
      duration: 1.5,
      add: (u) => ({ "elbowL.x": Math.sin(u * Math.PI * 30) * 0.12, "elbowR.x": Math.cos(u * Math.PI * 34) * 0.12, "head.x": 0.06 * Math.sin(u * Math.PI) }),
    },
  },
  sockets: {
    handL: "Left palm (props held in the left hand)",
    handR: "Right palm",
    head: "Top of the head (hats, effects)",
  },
  appearance: {
    jacketColor: { type: "color", default: "#f59e0b", description: "Puffy jacket" },
    shirtColor: { type: "color", default: "#151722", description: "Inner shirt" },
    pantsColor: { type: "color", default: "#262936", description: "Pants" },
    skinColor: { type: "color", default: "#f1c29d", description: "Skin" },
    hairColor: { type: "color", default: "#1e1b24", description: "Hair and brows" },
    badgeColor: { type: "color", default: "#38bdf8", description: "Glowing chest badge" },
    glasses: { type: "boolean", default: true, description: "Round glasses" },
    headphones: { type: "boolean", default: true, description: "Headphones around the neck" },
  },
  recipeGestures: { flinch: "flinch", stomp: "stomp", crouchPose: "crouch", stompContact: 0.45 },
  selfReach: (c0, what, side, opts) => {
    // Bow into the palm / tilt back to drink, then reach the hand there (works seated and standing).
    const bow = what === "facepalm" ? { head: 0.45, torso: 0.2 } : { head: -0.12, torso: 0.05 };
    const c = { ...c0, "head.x": c0["head.x"] + bow.head, "torso.x": c0["torso.x"] + bow.torso };
    const s = side === "L" ? 1 : -1;
    // Precise (engine 2): targets on the bowed head itself — the palm over the eye on that side, the cup just in
    // front of the mouth — with the head's turn held so a look can't swing the face away from the hand. Legacy:
    // relative to the face anchor, which ignores the bow (the palm ends ~8 cm inside the head).
    const face = rayanDef.anchors(c).face;
    const target: Vec3 = opts?.precise
      ? headPoint(c, what === "facepalm" ? [s * 0.06, 0.25, 0.25] : [s * 0.03, 0.0, 0.3])
      : what === "facepalm" ? [face[0] + s * 0.11, face[1] - 0.07, face[2] - 0.06] : [face[0] + s * 0.03, face[1] - 0.2, face[2] + 0.05];
    const r = rayanDef.reach!(c, target, side);
    const held: Channels = opts?.precise ? { "head.y": c0["head.y"] } : {};
    return { set: { ...r.set, "head.x": c["head.x"], "torso.x": c["torso.x"], ...held, ...(what === "facepalm" ? { lidL: 0.85, lidR: 0.85 } : {}) }, reached: r.reached, ...(opts?.precise ? { target } : {}) };
  },
  reach: (c, target, side) => {
    const r = armIK(armRig(side === "L" ? 1 : -1), inFrame(torsoFrame(c), target));
    return {
      set: { [`shoulder${side}.x`]: r.shoulder[0], [`shoulder${side}.y`]: r.shoulder[1], [`shoulder${side}.z`]: r.shoulder[2], [`elbow${side}.x`]: r.elbowX, [`elbow${side}.y`]: 0, [`elbow${side}.z`]: 0, [`wrist${side}.x`]: 0, [`wrist${side}.y`]: 0, [`wrist${side}.z`]: 0 },
      reached: r.reached,
    };
  },
  effectors: rayanEffectors,
  persona: { description: "Expressive developer: reacts quickly, nods along, talks with his hands.", listen: { delay: 0.2, nod: 1 } },
  anchors: (c) => {
    const pelvis = c["pelvis.y"];
    const lean = c["torso.x"];
    const up = 0.78; // pelvis → head centre along the spine
    const headY = pelvis + 0.06 + Math.cos(lean) * (up - 0.06);
    const headZ = Math.sin(lean) * (up - 0.06);
    return {
      feet: [0, 0, 0.03],
      waist: [0, pelvis, 0],
      chest: [0, pelvis + 0.34, 0.06 + Math.sin(lean) * 0.3],
      head: [0, headY, headZ + 0.04],
      face: [0, headY + 0.01, headZ + 0.24],
      top: [0, headY + 0.27, headZ],
    };
  },
  life: (c, s) => {
    const w = s.lookWeight;
    // Breathing + idle drift.
    c["torso.x"] += s.breath * 0.012;
    c["shoulderL.x"] += s.breath * 0.012;
    c["shoulderR.x"] += s.breath * 0.012;
    c["torso.z"] += s.noise("sway", 0.35) * 0.018;
    c["head.z"] += s.noise("tilt", 0.25) * 0.03;
    c["head.y"] += s.noise("drift", 0.2) * 0.05 * (1 - w);

    // Gaze: body, head and eyes share the turn.
    c["torso.y"] += clamp(s.lookYaw * 0.22, -0.35, 0.35) * w;
    c["head.y"] += clamp(s.lookYaw * 0.6, -0.85, 0.85) * w;
    c["head.x"] -= clamp(s.lookPitch * 0.5, -0.45, 0.45) * w;
    c["pupil.x"] = clamp(s.lookYaw * 0.025, -0.012, 0.012) * w + s.noise("saccadeX", 1.3) * 0.002;
    c["pupil.y"] = clamp(s.lookPitch * 0.025, -0.01, 0.01) * w + s.noise("saccadeY", 1.1) * 0.0015;

    // Listening nod (opt-in listening only).
    if (s.beat > 0) c["head.x"] += s.beat * 0.09;

    // Blinks never open a lid further than the emotion has it.
    c.lidL = Math.max(c.lidL, s.blink);
    c.lidR = Math.max(c.lidR, s.blink);

    // Stylized amplitude mouthing; head/torso beats and hands follow the (slow, with speech motion) body energy.
    if (s.talk > 0.01) {
      c["mouth.open"] = Math.max(c["mouth.open"] * 0.6, 0.18 + s.talk * 1.25);
      c["mouth.wide"] = lerp(c["mouth.wide"], 0.92 + s.noise("mouthW", 6) * 0.15, s.talk);
    }
    if (s.talkBody > 0.01) {
      c["head.x"] += s.noise("talkNod", 3) * 0.035 * s.talkBody;
      c["torso.x"] += s.noise("talkBounce", 4) * 0.015 * s.talkBody;
      if (s.pose === "explaining" || s.pose === "sit_explaining") {
        c["elbowL.x"] += s.noise("gestL", 2.2) * 0.16 * s.talkBody;
        c["elbowR.x"] += s.noise("gestR", 2.4) * 0.16 * s.talkBody;
      }
    }
    if (s.pose === "sit_typing") {
      c["elbowL.x"] += Math.sin(s.t * 18) * 0.05 + s.noise("typeL", 7) * 0.04;
      c["elbowR.x"] += Math.cos(s.t * 20) * 0.05 + s.noise("typeR", 7) * 0.04;
    }

    // Gait.
    if (s.walk > 0) {
      const sw = Math.sin(s.walkPhase);
      const k = s.walk;
      c["hipL.x"] = lerp(c["hipL.x"], -sw * 0.5, k);
      c["hipR.x"] = lerp(c["hipR.x"], sw * 0.5, k);
      // A knee bends while its leg swings forward (hip angle decreasing).
      const cw = Math.cos(s.walkPhase);
      c["kneeL.x"] = lerp(c["kneeL.x"], 0.08 + Math.max(0, cw) * 0.8, k);
      c["kneeR.x"] = lerp(c["kneeR.x"], 0.08 + Math.max(0, -cw) * 0.8, k);
      c["shoulderL.x"] = lerp(c["shoulderL.x"], sw * 0.42, k);
      c["shoulderR.x"] = lerp(c["shoulderR.x"], -sw * 0.42, k);
      c["elbowL.x"] = lerp(c["elbowL.x"], -0.35 - Math.max(0, sw) * 0.3, k);
      c["elbowR.x"] = lerp(c["elbowR.x"], -0.35 - Math.max(0, -sw) * 0.3, k);
      c["pelvis.y"] += Math.abs(Math.cos(s.walkPhase)) * 0.03 * k;
      c["torso.y"] += sw * 0.07 * k;
    }
  },
};
