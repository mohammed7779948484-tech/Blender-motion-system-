import { describe, expect, it } from "vitest";
import { cameraAt, project, shotLayout, type CameraFrame, type ShotType } from "../src/engine/camera/solve";
import { resolveEpisode } from "../src/engine/core/timeline";
import { buildTracks, makeQuery } from "../src/engine/player/scene";

const FORMATS = { landscape: 16 / 9, portrait: 9 / 16, square: 1 } as const;

/** A small open-floor scene: two standing actors, walls/props removed except what a test adds. */
const scene = (preset: keyof typeof FORMATS, camera: unknown[], extra: Record<string, unknown> = {}) => {
  const ep = {
    id: "cam-test",
    title: "camera test",
    format: { preset },
    set: { environment: "dev-office", remove: ["desk", "chair", "rug", "bookshelf", "plant", "plant-2", "window"], ...(extra.set as object) },
    cast: {
      rayan: { actor: "rayan", at: [0, 0, 0], yaw: 0 },
      claude: { actor: "claude", at: [1.2, 0, 0.2], yaw: -60, scale: 4 },
    },
    actions: extra.actions ?? [],
    camera,
    end: 8,
  };
  const r = resolveEpisode(ep, null);
  const tracks = buildTracks(r);
  return { r, q: makeQuery(r, tracks) };
};

const inFrame = (frame: CameraFrame, p: [number, number, number], aspect: number, margin = 0.97) => {
  const n = project(frame, p, aspect);
  return n.depth > 0 && Math.abs(n.x) <= margin && Math.abs(n.y) <= margin;
};

describe("shot framing across aspect ratios", () => {
  const cases: [ShotType, string, string[]][] = [
    ["close", "rayan", ["top", "face"]],
    ["medium", "rayan", ["top", "face", "waist"]],
    ["full", "rayan", ["top", "face", "feet"]],
    ["wide", "rayan", ["top", "feet"]],
    ["close", "claude", ["top", "face"]],
  ];
  for (const preset of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
    for (const [type, subject, anchors] of cases) {
      it(`${type} on ${subject} keeps ${anchors.join("/")} in frame (${preset})`, () => {
        const { r, q } = scene(preset, [{ at: 0, shot: type, subject }]);
        for (const t of [0, 2, 4]) {
          const f = cameraAt(r.shots, q, t);
          for (const a of anchors) expect(inFrame(f, q.anchor(subject, a, t)!, FORMATS[preset]), `${a} @${t}`).toBe(true);
        }
      });
    }
    it(`two-shot keeps both heads in frame (${preset})`, () => {
      const { r, q } = scene(preset, [{ at: 0, shot: "two-shot", subject: ["rayan", "claude"] }]);
      const f = cameraAt(r.shots, q, 1);
      for (const id of ["rayan", "claude"]) for (const a of ["top", "face"]) expect(inFrame(f, q.anchor(id, a, 1)!, FORMATS[preset]), `${id}.${a}`).toBe(true);
    });
  }

  it("the focus distance matches the subject's face", () => {
    const { r, q } = scene("landscape", [{ at: 0, shot: "close", subject: "rayan" }]);
    const f = cameraAt(r.shots, q, 1);
    const face = q.anchor("rayan", "face", 1)!;
    expect(f.focus).not.toBeNull();
    expect(f.focus!.distance).toBeCloseTo(Math.hypot(face[0] - f.position[0], face[1] - f.position[1], face[2] - f.position[2]), 5);
  });

  it("over-shoulder frames the subject and keeps the foreground actor near the edge", () => {
    const { r, q } = scene("landscape", [{ at: 0, shot: "over-shoulder", subject: "claude", over: "rayan" }]);
    const f = cameraAt(r.shots, q, 1);
    expect(inFrame(f, q.anchor("claude", "face", 1)!, 16 / 9)).toBe(true);
    const fg = project(f, q.anchor("rayan", "head", 1)!, 16 / 9);
    expect(Math.abs(fg.x)).toBeGreaterThan(0.3);
  });
});

describe("tracking a moving subject", () => {
  // Walks across the open side of the set (toward +X), passing the mascot.
  const walk = { actions: [{ at: 0.5, actor: "rayan", move: { to: [3, 0, 1.6], duration: 4 } }] };
  for (const mode of ["track", "follow"] as const) {
    it(`${mode} keeps the walker in frame on every frame, smoothly`, () => {
      const { r, q } = scene("landscape", [{ at: 0, shot: "full", subject: "rayan", [mode]: true }], walk);
      const frames = Array.from({ length: 8 * 30 }, (_, i) => i / 30);
      const cams = frames.map((t) => cameraAt(r.shots, q, t));
      cams.forEach((f, i) => {
        expect(inFrame(f, q.anchor("rayan", "head", frames[i])!, 16 / 9, 0.99), `head @${frames[i]}`).toBe(true);
      });
      // No jumps: per-frame step and its change stay small.
      for (let i = 2; i < cams.length; i++) {
        for (const key of ["position", "target"] as const) {
          const a = cams[i - 2][key];
          const b = cams[i - 1][key];
          const c = cams[i][key];
          const step = Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]);
          const accel = Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1], c[2] - 2 * b[2] + a[2]);
          expect(step, `${key} step @${frames[i]}`).toBeLessThan(0.08);
          expect(accel, `${key} accel @${frames[i]}`).toBeLessThan(0.01);
        }
        if (cams[i].focus && cams[i - 1].focus) expect(Math.abs(cams[i].focus!.distance - cams[i - 1].focus!.distance)).toBeLessThan(0.08);
      }
    });
  }

  it("checks occlusion where a follow camera will travel, not just where it starts", () => {
    // A shelf near the end of the walk, between the walker and the default follow camera.
    const set = { set: { add: [{ id: "blocker", kind: "bookshelf", position: [4.5, 0, 1.9], rotation: 90 }] }, ...walk };
    const authored = scene("landscape", [{ at: 0, shot: "full", subject: "rayan", follow: true, angle: 20 }], set);
    expect(shotLayout(authored.r.shots[0], authored.q).warnings.join()).toMatch(/blocked by "blocker"/);
    const auto = scene("landscape", [{ at: 0, shot: "full", subject: "rayan", follow: true }], set);
    expect(shotLayout(auto.r.shots[0], auto.q).warnings.join()).not.toMatch(/blocked/);
  });

  it("is order-independent (shuffled frames equal sequential)", () => {
    const { r, q } = scene("portrait", [{ at: 0, shot: "medium", subject: "rayan", follow: { lag: 0.8 }, move: ["push-in", "handheld"] }], walk);
    const frames = Array.from({ length: 150 }, (_, i) => i / 30);
    const sequential = frames.map((t) => cameraAt(r.shots, q, t));
    // Fresh query so no cache is shared with the sequential pass.
    const fresh = scene("portrait", [{ at: 0, shot: "medium", subject: "rayan", follow: { lag: 0.8 }, move: ["push-in", "handheld"] }], walk);
    const order = [...frames.keys()].sort((a, b) => ((a * 97) % 150) - ((b * 97) % 150));
    const shuffled: CameraFrame[] = [];
    for (const i of order) shuffled[i] = cameraAt(fresh.r.shots, fresh.q, frames[i]);
    expect(shuffled).toEqual(sequential);
  });
});

describe("corrections help, but never override intent", () => {
  // A bookshelf placed right between Rayan and the default close-up camera.
  const blocker = { set: { add: [{ id: "blocker", kind: "bookshelf", position: [0.35, 0, 1.2], rotation: 0 }] } };

  it("finds a clear angle around an occluder", () => {
    const { r, q } = scene("landscape", [{ at: 0, shot: "medium", subject: "rayan" }], blocker);
    const layout = shotLayout(r.shots[0], q);
    expect(layout.warnings.join()).not.toMatch(/blocked/);
    const f = cameraAt(r.shots, q, 1);
    const box = q.occluders.find((b) => b.id === "blocker")!;
    expect(box).toBeDefined();
    // The chosen yaw differs from the default 15°.
    expect(Math.abs(layout.yaw - (15 * Math.PI) / 180)).toBeGreaterThan(0.1);
    expect(inFrame(f, q.anchor("rayan", "face", 1)!, 16 / 9)).toBe(true);
  });

  it("keeps an authored angle and warns instead", () => {
    const { r, q } = scene("landscape", [{ at: 0, shot: "medium", subject: "rayan", angle: 15 }], blocker);
    const layout = shotLayout(r.shots[0], q);
    expect(layout.yaw).toBeCloseTo((15 * Math.PI) / 180, 6);
    expect(layout.warnings.join()).toMatch(/blocked by "blocker"/);
  });

  it("uses custom position/target/fov exactly", () => {
    const { r, q } = scene("landscape", [{ at: 0, shot: "custom", position: [9, 9, 9], target: [0, 1, 0], fov: 33 }]);
    const f = cameraAt(r.shots, q, 2);
    expect(f.position).toEqual([9, 9, 9]);
    expect(f.target).toEqual([0, 1, 0]);
    expect(f.fov).toBe(33);
  });

  it("pulls derived cameras inside the set bounds", () => {
    const { r, q } = scene("portrait", [{ at: 0, shot: "wide", subject: ["rayan", "claude"] }]);
    const f = cameraAt(r.shots, q, 1);
    const b = r.layout.bounds;
    for (let i = 0; i < 3; i++) {
      expect(f.position[i]).toBeGreaterThanOrEqual(b.min[i] - 1e-6);
      expect(f.position[i]).toBeLessThanOrEqual(b.max[i] + 1e-6);
    }
  });

  it("blends between shots without a jump", () => {
    const { r, q } = scene("landscape", [
      { at: 0, shot: "close", subject: "rayan" },
      { at: 2, shot: "medium", subject: "claude", blend: 1 },
    ]);
    const a = cameraAt(r.shots, q, 2 - 1 / 30);
    const b = cameraAt(r.shots, q, 2);
    expect(Math.hypot(...(a.position.map((v, i) => v - b.position[i]) as [number, number, number]))).toBeLessThan(0.05);
  });
});
