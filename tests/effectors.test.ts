import { describe, expect, it } from "vitest";
import { claudeDef } from "../src/engine/actors/claude/claude.data";
import { rayanDef, rayanHand } from "../src/engine/actors/rayan/rayan.data";
import { restChannels, worldEffectors, type ActorFrame, type Channels } from "../src/engine/actors/rig";
import type { Vec3 } from "../src/engine/core/time";

const near = (a: Vec3, b: Vec3, tol = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const pose = (name: string): Channels => ({ ...restChannels(rayanDef), ...rayanDef.poses[name].set });

describe("Rayan effectors", () => {
  it("agree with the arm IK's forward kinematics (no elbow twist, straight wrist)", () => {
    for (const name of ["stand_idle", "celebrate", "sit_typing", "crouch"]) {
      const c = pose(name);
      const e = rayanDef.effectors!(c);
      for (const side of ["L", "R"] as const) {
        if (c[`elbow${side}.y`] || c[`elbow${side}.z`]) continue;
        expect(near(e.points[`hand${side}`], rayanHand(c, side), 1e-9), `${name} hand${side}`).toBe(true);
      }
    }
  });

  it("put the head where the framing anchors say, also when leaning", () => {
    for (const lean of [0, 0.4]) {
      const c = { ...pose("stand_idle"), "torso.x": lean };
      const head = rayanDef.anchors(c).head;
      expect(near(rayanDef.effectors!(c).points.head, [head[0], head[1], head[2] - 0.04], 1e-9)).toBe(true);
    }
  });

  it("stand on the floor and turn the face with the head", () => {
    const c = pose("stand_idle");
    const e = rayanDef.effectors!(c);
    expect(Math.abs(e.points.footL[1])).toBeLessThan(0.03);
    expect(Math.abs(e.points.footR[1])).toBeLessThan(0.03);
    const turned = rayanDef.effectors!({ ...c, "head.y": Math.PI / 2 }).points;
    expect(turned.face[0] - turned.head[0]).toBeGreaterThan(0.2); // facing the actor's left (+X)
  });

  it("measure where the facepalm recipe puts the palm (in front of the head centre)", () => {
    const c = pose("stand_idle");
    const r = rayanDef.selfReach!(c, "facepalm", "R");
    const e = rayanDef.effectors!({ ...c, ...r.set });
    const d = dist(e.points.handR, e.points.head);
    // Known (engine 1): selfReach aims at the face *anchor*, which ignores the bowed head, so the palm sits
    // ~8 cm inside the head volume (0.153 m from its centre, radius 0.23). Engine 2 asks for `{ precise: true }`
    // targets on the bowed head instead (tests/performance.test.ts).
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(0.3);
    expect(e.points.handR[2]).toBeGreaterThan(e.points.head[2]);
  });

  it("are placed and scaled in the world", () => {
    const frame: ActorFrame = { id: "r", channels: pose("stand_idle"), position: [1, 0.5, 2], yaw: Math.PI / 2, scale: 2, anchors: {}, held: {}, pose: "stand_idle" };
    const w = worldEffectors(frame, rayanDef)!;
    const local = rayanDef.effectors!(frame.channels).points.head;
    expect(near(w.points.head, [1 + local[2] * 2, 0.5 + local[1] * 2, 2 - local[0] * 2], 1e-9)).toBe(true);
    expect(w.parts.find((p) => p.name === "head")!.r).toBeCloseTo(0.46);
  });
});

describe("mascot effectors", () => {
  it("face follows the body's turn", () => {
    const c = restChannels(claudeDef);
    const e = claudeDef.effectors!({ ...c, "body.ry": Math.PI / 2 }).points;
    expect(e.face[0] - e.head[0]).toBeCloseTo(0.09, 6);
  });
});
