// Camera choreography: move windows, solver-space keyframes, world paths, follow lead, the `life`
// drift, focus that pulls between speakers and blends that arc around the subject.
import { describe, expect, it } from "vitest";
import { splineAt } from "../src/engine/core/spline";
import { cameraAt, project, shotFrame, type CameraFrame } from "../src/engine/camera/solve";
import type { Vec3 } from "../src/engine/core/time";
import { resolveEpisode } from "../src/engine/core/timeline";
import { buildTracks, makeQuery } from "../src/engine/player/scene";

const scene = (camera: unknown[], extra: Record<string, unknown> = {}) => {
  const ep = {
    id: "choreo",
    title: "choreo",
    format: { preset: "portrait" },
    set: { environment: "dev-office", remove: ["desk", "chair", "rug", "bookshelf", "plant", "plant-2", "window"] },
    cast: { rayan: { actor: "rayan", at: [0, 0, 0], yaw: 0 }, claude: { actor: "claude", at: [1.4, 0, -0.4], yaw: -60, scale: 4 } },
    actions: [],
    camera,
    end: 8,
    ...extra,
  };
  const r = resolveEpisode(ep, null);
  return { r, q: makeQuery(r, buildTracks(r)) };
};
const d3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const frames = (r: ReturnType<typeof scene>, from: number, to: number) => Array.from({ length: Math.round((to - from) * 30) + 1 }, (_, i) => cameraAt(r.r.shots, r.q, from + i / 30));
/** Largest change of per-frame velocity (a jump in speed shows up here). */
const maxAccel = (cams: CameraFrame[]) => {
  let worst = 0;
  for (let i = 2; i < cams.length; i++) worst = Math.max(worst, Math.hypot(...([0, 1, 2].map((k) => cams[i].position[k] - 2 * cams[i - 1].position[k] + cams[i - 2].position[k]) as Vec3)));
  return worst;
};
/** Angle (degrees) of the camera around a point, measured like the shot `angle` from the actor's facing (+Z, yaw 0). */
const angleAround = (cam: CameraFrame, p: Vec3) => (Math.atan2(cam.position[0] - p[0], cam.position[2] - p[2]) * 180) / Math.PI;

describe("spline", () => {
  it("passes through every key with continuous speed and eases at the ends", () => {
    const times = [0, 1, 3];
    const values = [0, 10, 0];
    expect(splineAt(times, values, 0)).toBe(0);
    expect(splineAt(times, values, 1)).toBeCloseTo(10);
    expect(splineAt(times, values, 3)).toBe(0);
    const v = (t: number) => (splineAt(times, values, t + 1e-4) - splineAt(times, values, t - 1e-4)) / 2e-4;
    expect(Math.abs(v(1 - 1e-3) - v(1 + 1e-3))).toBeLessThan(0.1); // no speed jump at the inner key
    expect(Math.abs(v(1e-3))).toBeLessThan(0.2); // eases in
  });
});

describe("move windows", () => {
  it("without at/duration a move spans the shot exactly as before", () => {
    const a = scene([{ at: 0, shot: "medium", subject: "rayan", move: "push-in" }]);
    const b = scene([{ at: 0, shot: "medium", subject: "rayan", move: { type: "push-in", at: 0, duration: 8 } }]);
    for (const t of [0, 2.5, 7.9]) expect(cameraAt(b.r.shots, b.q, t)).toEqual(cameraAt(a.r.shots, a.q, t));
  });

  it("holds before the window and stays at the end after it", () => {
    const s = scene([{ at: 0, shot: "medium", subject: "rayan", move: { type: "orbit", amount: 60, at: 2, duration: 2 } }]);
    const at = (t: number) => cameraAt(s.r.shots, s.q, t).position;
    expect(d3(at(0.5), at(1.9))).toBeLessThan(0.01);
    expect(d3(at(4.2), at(7.5))).toBeLessThan(0.01);
    expect(d3(at(1.9), at(4.2))).toBeGreaterThan(0.5);
  });
});

describe("solver-space keyframes", () => {
  it("orbit by angle keys around a walking subject, smoothly", () => {
    const s = scene([{ at: 0, shot: "full", subject: "rayan", follow: true, keys: [{ at: 0, angle: 0 }, { at: 6, angle: 90 }] }], {
      actions: [{ at: 0.5, actor: "rayan", move: { to: [2.5, 0, 1.2], duration: 6, face: "keep" } }],
    });
    // The follow camera lags its subject a little; measure around the aim.
    const cam0 = cameraAt(s.r.shots, s.q, 0);
    const cam6 = cameraAt(s.r.shots, s.q, 6.8);
    expect(Math.abs(angleAround(cam0, cam0.target))).toBeLessThan(6);
    expect(Math.abs(angleAround(cam6, cam6.target) - 90)).toBeLessThan(6);
    const cams = frames(s, 0, 8);
    expect(maxAccel(cams)).toBeLessThan(0.01);
    // The walker stays in frame the whole time.
    cams.forEach((c, i) => {
      const n = project(c, s.q.anchor("rayan", "head", i / 30)!, 9 / 16);
      expect(n.depth > 0 && Math.abs(n.x) < 1 && Math.abs(n.y) < 1, `head @${i}`).toBe(true);
    });
  });

  it("dolly-zoom: distance and lens keyed together", () => {
    const s = scene([{ at: 0, shot: "medium", subject: "rayan", keys: [{ at: 0.5, distance: 2, lens: 35 }, { at: 3, distance: 4, lens: 70 }] }]);
    const a = cameraAt(s.r.shots, s.q, 0.5);
    const b = cameraAt(s.r.shots, s.q, 3.5);
    expect(d3(a.position, a.target)).toBeCloseTo(2, 1);
    expect(d3(b.position, b.target)).toBeCloseTo(4, 1);
    expect(b.fov).toBeLessThan(a.fov);
  });

  it("are order-independent", () => {
    const shots = [{ at: 0, shot: "medium", subject: "rayan", keys: [{ at: 1, angle: -40, size: 0.8 }, { at: 4, angle: 40, height: "low" }], move: ["handheld", "life"] }];
    const a = scene(shots);
    const seq = frames(a, 0, 6);
    const b = scene(shots);
    const order = [...seq.keys()].sort((x, y) => ((x * 53) % seq.length) - ((y * 53) % seq.length));
    const shuffled: CameraFrame[] = [];
    for (const i of order) shuffled[i] = cameraAt(b.r.shots, b.q, i / 30);
    expect(shuffled).toEqual(seq);
  });
});

describe("world paths", () => {
  it("pass through their keys (a crane rise over the set)", () => {
    const s = scene([{ at: 0, shot: "custom", position: [0, 1, 4], target: [0, 1, 0], path: [{ at: 0, position: [0, 1, 4], target: [0, 1, 0] }, { at: 4, position: [1, 3, 3], target: [0, 0.8, 0], lens: 28 }] }]);
    expect(d3(cameraAt(s.r.shots, s.q, 0).position, [0, 1, 4])).toBeLessThan(1e-6);
    expect(d3(cameraAt(s.r.shots, s.q, 4).position, [1, 3, 3])).toBeLessThan(1e-6);
    expect(maxAccel(frames(s, 0, 4))).toBeLessThan(0.01);
  });
});

describe("follow lead and life", () => {
  it("lead aims ahead of a walker", () => {
    const walk = { actions: [{ at: 0.5, actor: "rayan", move: { to: [3, 0, 0], duration: 4, face: "keep" } }] };
    const plain = scene([{ at: 0, shot: "full", subject: "rayan", track: true }], walk);
    const ahead = scene([{ at: 0, shot: "full", subject: "rayan", track: { lead: 0.5 } }], walk);
    expect(cameraAt(ahead.r.shots, ahead.q, 2.5).target[0]).toBeGreaterThan(cameraAt(plain.r.shots, plain.q, 2.5).target[0] + 0.2);
  });

  it("life is barely visible, and only where asked", () => {
    const still = scene([{ at: 0, shot: "medium", subject: "rayan" }]);
    const alive = scene([{ at: 0, shot: "medium", subject: "rayan" }], { defaults: { cameraLife: 1 } });
    const locked = scene([{ at: 0, shot: "medium", subject: "rayan", move: "static" }], { defaults: { cameraLife: 1 } });
    const drift = Math.max(...[1, 3, 5, 7].map((t) => d3(cameraAt(alive.r.shots, alive.q, t).position, cameraAt(still.r.shots, still.q, t).position)));
    expect(drift).toBeGreaterThan(0.005);
    expect(drift).toBeLessThan(0.15);
    expect(cameraAt(locked.r.shots, locked.q, 5)).toEqual(cameraAt(still.r.shots, still.q, 5));
  });
});

describe("engine 2 corrections", () => {
  const talk = {
    dialogue: [
      { id: "l1", speaker: "rayan", text: "One two three four.", at: 0.5 },
      { id: "l2", speaker: "claude", text: "Five six seven eight.", at: 3 },
    ],
  };
  // Angled so the two subjects sit at different depths (a frontal two-shot has them equidistant).
  const twoShot = [{ at: 0, shot: "two-shot", subject: ["rayan", "claude"], angle: 70 }];

  it("focus pulls between speakers instead of snapping (engine 1 snaps)", () => {
    const jump = (s: ReturnType<typeof scene>) => {
      let worst = 0;
      const cams = frames(s, 0.3, 6);
      for (let i = 1; i < cams.length; i++) worst = Math.max(worst, Math.abs(cams[i].focus!.distance - cams[i - 1].focus!.distance));
      return worst;
    };
    const v1 = scene(twoShot, talk);
    const v2 = scene(twoShot, { ...talk, engine: 2 });
    expect(jump(v1)).toBeGreaterThan(0.3);
    // A 0.45 s pull spreads the change: the worst single-frame step is a small fraction of the snap.
    expect(jump(v2)).toBeLessThan(jump(v1) * 0.2);
    // And it holds the last speaker in the pause after a line.
    const l1End = v2.r.lines[0].end;
    const inPause = cameraAt(v2.r.shots, v2.q, l1End + 0.3).focus!.point;
    expect(d3(inPause, v2.q.anchor("rayan", "face", l1End + 0.3)!)).toBeLessThan(0.05);
  });

  it("blends arc around the subject instead of cutting through it", () => {
    const shots = [
      { at: 0, shot: "close", subject: "rayan", angle: -80 },
      { at: 2, shot: "close", subject: "rayan", angle: 80, blend: 1.5 },
    ];
    const nearest = (s: ReturnType<typeof scene>) => Math.min(...frames(s, 2, 3.5).map((c) => d3(c.position, s.q.anchor("rayan", "head", 2.5)!)));
    const v1 = scene(shots);
    const v2 = scene(shots, { engine: 2 });
    expect(nearest(v2)).toBeGreaterThan(nearest(v1) + 0.3);
    expect(nearest(v2)).toBeGreaterThan(0.8);
  });

  it("can be switched off", () => {
    const off = scene(twoShot, { ...talk, engine: 2, defaults: { focusPull: false } });
    const v1 = scene(twoShot, talk);
    expect(shotFrame(off.r.shots[0], off.q, 3.05)).toEqual(shotFrame(v1.r.shots[0], v1.q, 3.05));
  });
});
