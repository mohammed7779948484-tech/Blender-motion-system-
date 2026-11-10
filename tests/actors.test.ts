import { describe, expect, it } from "vitest";
import { actorBase, actorFinal, emptyTrack, evaluateActor, restChannels, type ActorDefinition, type ActorTrack } from "../src/engine/actors/rig";
import { rayanDef, rayanHand } from "../src/engine/actors/rayan/rayan.data";
import { claudeDef } from "../src/engine/actors/claude/claude.data";

const busyTrack = (def: ActorDefinition): ActorTrack => {
  const poses = Object.keys(def.poses);
  const emotions = Object.keys(def.emotions);
  const gestures = Object.keys(def.gestures);
  return emptyTrack(def.id, def, { position: [0, 0, 0], yaw: 20 }, {
    seed: `test-${def.id}`,
    scale: 1,
    // Cues deliberately interrupt each other mid-transition.
    poses: poses.map((pose, i) => ({ at: i * 0.9, pose, transition: 0.5 })),
    emotions: emotions.map((emotion, i) => ({ at: 0.3 + i * 0.7, emotion })),
    gestures: gestures.map((gesture, i) => ({ at: 0.5 + i * 1.1, gesture })),
    looks: [
      { at: 1, target: [1, 1.5, 2] },
      { at: 3, target: "camera" },
      { at: 5.2, target: null },
    ],
    moves: [{ at: 2, to: [1.5, 0, 0.5], duration: 3 }, { at: 6, to: [0, 0, 0], face: "keep" }],
    turns: [{ at: 8.5, yaw: -90 }],
    overrides: [{ at: 4, set: { [Object.keys(def.channels)[3]]: 0.2 }, duration: 1.2 }],
    talk: (t) => (t > 1 && t < 3 ? 0.5 + 0.5 * Math.sin(t * 9) : 0),
  });
};

const frames = Array.from({ length: 300 }, (_, i) => i / 30);

describe.each([rayanDef, claudeDef])("actor $id", (def) => {
  const track = busyTrack(def);

  it("is order-independent: shuffled evaluation equals sequential", () => {
    const sequential = frames.map((t) => evaluateActor(track, t, [0, 1.6, 4]));
    const order = [...frames.keys()].sort((a, b) => ((a * 7919) % 300) - ((b * 7919) % 300));
    const shuffled: unknown[] = [];
    for (const i of order) shuffled[i] = evaluateActor(track, frames[i], [0, 1.6, 4]);
    expect(shuffled).toEqual(sequential);
  });

  it("keeps every channel inside its declared range and finite", () => {
    for (const t of frames) {
      const { channels } = evaluateActor(track, t, [0, 1.6, 4]);
      for (const [k, v] of Object.entries(channels)) {
        expect(Number.isFinite(v), `${k}@${t}`).toBe(true);
        expect(v).toBeGreaterThanOrEqual(def.channels[k].min);
        expect(v).toBeLessThanOrEqual(def.channels[k].max);
      }
    }
  });

  it("poses, emotions and gestures only reference declared channels", () => {
    const known = new Set(Object.keys(def.channels));
    for (const p of Object.values(def.poses)) for (const k in p.set) expect(known.has(k), k).toBe(true);
    for (const e of Object.values(def.emotions)) for (const k in e.set) expect(known.has(k), k).toBe(true);
    for (const g of Object.values(def.gestures)) {
      for (const k in g.set ?? {}) expect(known.has(k), k).toBe(true);
      for (const u of [0, 0.25, 0.5, 0.75, 1]) for (const k in g.add?.(u) ?? {}) expect(known.has(k), k).toBe(true);
    }
    expect(def.poses[def.defaultPose]).toBeDefined();
    expect(def.emotions[def.defaultEmotion]).toBeDefined();
  });

  it("provides the standard framing anchors, ordered bottom to top", () => {
    const base = actorBase(emptyTrack("a", def, { position: [0, 0, 0], yaw: 0 }), 0);
    for (const name of ["feet", "waist", "chest", "head", "face", "top"]) expect(base.anchors[name]).toBeDefined();
    const y = (n: string) => base.anchors[n][1];
    expect(y("feet")).toBeLessThan(y("waist"));
    expect(y("waist")).toBeLessThan(y("head"));
    expect(y("head")).toBeLessThan(y("top"));
    expect(y("top")).toBeLessThanOrEqual(def.size.height * 1.05);
  });

  it("walks along a move path and arrives", () => {
    const end = evaluateActor(track, 5.9);
    expect(end.position[0]).toBeCloseTo(1.5, 3);
    expect(end.position[2]).toBeCloseTo(0.5, 3);
  });
});

describe("look-at", () => {
  it("turns Rayan's head toward a target on his left", () => {
    const track = emptyTrack("r", rayanDef, { position: [0, 0, 0], yaw: 0 }, {
      looks: [{ at: 0, target: [3, 1.5, 1], transition: 0 }],
    });
    const base = actorBase(track, 1);
    const frame = actorFinal(track, base, 1, { anchorOf: () => undefined });
    expect(frame.channels["head.y"]).toBeGreaterThan(0.3);
    expect(frame.channels["pupil.x"]).toBeGreaterThan(0);
  });

  it("looks at another actor's anchor through the context", () => {
    const track = emptyTrack("c", claudeDef, { position: [0, 0, 0], yaw: 0 }, {
      looks: [{ at: 0, target: { actor: "rayan", anchor: "head" }, transition: 0 }],
    });
    const base = actorBase(track, 1);
    const frame = actorFinal(track, base, 1, { anchorOf: (a) => (a === "rayan" ? [-2, 1.5, 1] : undefined) });
    expect(frame.channels["body.ry"]).toBeLessThan(-0.2);
  });
});

describe("reach (resolve-time arm solving)", () => {
  const base = (pose: string) => ({ ...restChannels(rayanDef), ...rayanDef.poses[pose].set });
  it("Rayan's hand lands within 1 cm of reachable targets, standing and crouched, both hands", () => {
    const cases: [string, "L" | "R", [number, number, number]][] = [
      ["stand_idle", "R", [-0.3, 1.2, 0.35]],
      ["stand_idle", "L", [0.35, 1.0, 0.3]],
      ["stand_idle", "R", [-0.15, 1.35, 0.35]],
      ["crouch", "R", [-0.15, 0.35, 0.45]],
      ["crouch", "L", [0.2, 0.35, 0.45]],
    ];
    for (const [pose, side, target] of cases) {
      const c = base(pose);
      const r = rayanDef.reach!(c, target, side);
      expect(r.reached, `${pose} ${side} ${target}`).toBe(true);
      const hand = rayanHand({ ...c, ...r.set }, side);
      expect(Math.hypot(hand[0] - target[0], hand[1] - target[1], hand[2] - target[2]), `${pose} ${side}`).toBeLessThan(0.01);
      for (const [k, v] of Object.entries(r.set)) expect(v, k).toBeGreaterThanOrEqual(rayanDef.channels[k].min);
    }
  });

  it("points a straight arm at targets out of reach", () => {
    const c = base("stand_idle");
    const r = rayanDef.reach!(c, [-3, 1.4, 4], "R");
    expect(r.reached).toBe(false);
    const hand = rayanHand({ ...c, ...r.set }, "R");
    const shoulder = rayanHand({ ...c, "shoulderR.x": 0, "shoulderR.y": 0, "shoulderR.z": 0, "elbowR.x": 0 }, "R");
    expect(hand[2]).toBeGreaterThan(shoulder[2] + 0.3); // arm swung forward toward the target
  });

  it("the mascot leans instead of reaching", () => {
    const r = claudeDef.reach!(restChannels(claudeDef), [0, 0.05, 0.3], "R");
    expect(r.set["body.rx"]).toBeGreaterThan(0.1);
  });
});
