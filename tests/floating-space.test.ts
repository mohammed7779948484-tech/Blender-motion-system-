// The floating-space preset: it loads, its marks resolve onto solid ground, the bridge walk stays on
// the bridge, the solver frames faces there (islands hang below their tops, so they only block
// cameras under the surface), and the backdrop stays inside the camera's far plane.
import { describe, expect, it } from "vitest";
import { cameraAt, project, shotLayout, type CameraFrame } from "../src/engine/camera/solve";
import { resolveEpisode } from "../src/engine/core/timeline";
import type { Vec3 } from "../src/engine/core/time";
import { MOODS } from "../src/engine/lighting/moods";
import { buildTracks, makeQuery } from "../src/engine/player/scene";
import { ENVIRONMENTS } from "../src/engine/world/environments";
import { ISLAND_DEPTH, ISLAND_INNER, SKY_RADIUS } from "../src/engine/world/floating-space/space";
import { itemWorld, occluders, resolveLayout } from "../src/engine/world/layout";
import { PROPS } from "../src/engine/world/props.data";

const env = ENVIRONMENTS["floating-space"];
const FAR_PLANE = 80;
const ASPECT = { portrait: 9 / 16, landscape: 16 / 9 } as const;

const scene = (camera: unknown[], actions: unknown[] = [], preset: keyof typeof ASPECT = "portrait") => {
  const r = resolveEpisode(
    {
      id: "space",
      title: "space",
      format: { preset },
      set: { environment: "floating-space" },
      cast: { rayan: { actor: "rayan", at: "stand-left" }, claude: { actor: "claude", at: "stand-right", scale: 4 } },
      actions,
      camera,
      end: 12,
    },
    null,
  );
  return { r, q: makeQuery(r, buildTracks(r)) };
};

const layout = resolveLayout(env);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Is this ground point on a walkable surface (an island's inner disc or the bridge deck), with a margin? */
const onGround = ([x, y, z]: Vec3, margin = 0.2) => {
  if (Math.abs(y) > 0.05) return false;
  for (const it of layout.items) {
    const w = itemWorld(layout, it.id);
    if (it.kind === "floating_island" && Math.hypot(x - w.position[0], z - w.position[2]) <= ISLAND_INNER * w.scale - margin) return true;
    if (it.kind === "light_bridge") {
      // Into the bridge's frame (local +X along the span).
      const dx = x - w.position[0];
      const dz = z - w.position[2];
      const along = dx * Math.cos(w.yaw) - dz * Math.sin(w.yaw);
      const across = dx * Math.sin(w.yaw) + dz * Math.cos(w.yaw);
      const width = Number(it.params?.width ?? PROPS.light_bridge.params.width.default);
      if (Math.abs(along) <= Number(it.params?.length) / 2 && Math.abs(across) <= width / 2 - margin) return true;
    }
  }
  return false;
};

const inFrame = (frame: CameraFrame, p: Vec3, aspect: number) => {
  const n = project(frame, p, aspect);
  return n.depth > 0 && Math.abs(n.x) <= 0.97 && Math.abs(n.y) <= 0.97;
};

describe("floating-space environment", () => {
  it("is registered: no floor, its own mood, catalog item kinds", () => {
    expect(env).toBeDefined();
    expect(env.shell.floor).toBe("none");
    expect(MOODS[env.defaultMood]).toBeDefined();
    expect(env.defaultMood).toBe("space-cool");
    for (const it of env.items) expect(PROPS[it.kind], it.kind).toBeDefined();
    expect(env.shadowRadius).toBeGreaterThanOrEqual(Math.hypot(5.4, 2) + 1.7);
  });

  it("actors start on their marks", () => {
    const { q } = scene([{ at: 0, shot: "establishing" }]);
    expect(dist(q.anchor("rayan", "feet", 0)!, env.marks["stand-left"].position)).toBeLessThan(0.05);
    expect(dist(q.anchor("claude", "feet", 0)!, env.marks["stand-right"].position)).toBeLessThan(0.05);
  });

  it("every standing mark is on solid ground; drop-in is above the main island", () => {
    for (const [name, m] of Object.entries(env.marks)) {
      if (name === "drop-in") {
        expect(onGround([m.position[0], 0, m.position[2]])).toBe(true);
        expect(m.position[1]).toBeGreaterThan(3);
      } else expect(onGround(m.position), name).toBe(true);
    }
  });

  it("the walk from stand-right to far-spot stays on the islands and the bridge", () => {
    const { q } = scene([{ at: 0, shot: "establishing" }], [{ at: 0.5, actor: "claude", move: { to: "far-spot" } }]);
    let crossed = false;
    for (let t = 0.5; t <= 8; t += 0.1) {
      const feet = q.anchor("claude", "feet", t)!;
      expect(onGround(feet, 0.15), `t=${t.toFixed(1)} at ${feet.map((v) => v.toFixed(2))}`).toBe(true);
      if (dist(feet, env.marks["on-bridge"].position) < 0.3) crossed = true;
    }
    expect(crossed).toBe(true);
    expect(dist(q.anchor("claude", "feet", 8)!, env.marks["far-spot"].position)).toBeLessThan(0.05);
  });

  it("islands hang below their top: the occluder box sits under y = 0", () => {
    const box = occluders(layout).find((b) => b.id === "island")!;
    expect(box.center[1] + box.half[1]).toBeCloseTo(0, 6);
    expect(box.center[1] - box.half[1]).toBeCloseTo(-ISLAND_DEPTH * 2.7, 6);
    // The bridge is a walkway, not an occluder.
    expect(occluders(layout).some((b) => b.id === "bridge")).toBe(false);
  });

  for (const preset of ["portrait", "landscape"] as const) {
    it(`semantic shots frame faces without solver warnings (${preset})`, () => {
      const shots: [string, object, string[]][] = [
        ["close rayan", { shot: "close", subject: "rayan" }, ["rayan"]],
        ["close claude", { shot: "close", subject: "claude" }, ["claude"]],
        ["medium rayan", { shot: "medium", subject: "rayan" }, ["rayan"]],
        ["two-shot", { shot: "two-shot", subject: ["rayan", "claude"] }, ["rayan", "claude"]],
        ["over-shoulder", { shot: "over-shoulder", subject: "claude", over: "rayan" }, ["claude"]],
        ["full low", { shot: "full", subject: "rayan", height: "low" }, ["rayan"]],
      ];
      for (const [label, s, faces] of shots) {
        const { r, q } = scene([{ at: 0, ...s }], [], preset);
        expect(shotLayout(r.shots[0], q).warnings, label).toEqual([]);
        const f = cameraAt(r.shots, q, 1);
        for (const id of faces) expect(inFrame(f, q.anchor(id, "face", 1)!, ASPECT[preset]), `${label}: ${id} face`).toBe(true);
      }
    });
  }

  it("a camera under the island surface is reported as blocked by the rock", () => {
    const { r, q } = scene([{ at: 0, shot: "close", subject: "rayan", angle: 0, height: -2.4 }]);
    expect(shotLayout(r.shots[0], q).warnings.join("\n")).toMatch(/blocked by "island"/);
  });

  it("the sky dome and planet stay inside the camera's far plane from every spot and bounds corner", () => {
    const sky = itemWorld(layout, "sky").position;
    const planet = itemWorld(layout, "planet");
    const ring = Number(PROPS.planet.params.radius.default) * 1.95;
    const { min, max } = env.bounds;
    const corners: Vec3[] = [];
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
    for (const p of [...Object.values(env.cameras).map((c) => c.position), ...corners]) {
      expect(dist(p, sky) + SKY_RADIUS, `sky from ${p}`).toBeLessThan(FAR_PLANE);
      expect(dist(p, planet.position) + ring, `planet from ${p}`).toBeLessThan(FAR_PLANE);
    }
  });

  it("islands people stand on stay still; only decorative ones bob or spin", () => {
    const standing = new Set<string>();
    for (const m of Object.values(env.marks)) {
      for (const it of env.items) {
        if (it.kind !== "floating_island") continue;
        const w = itemWorld(layout, it.id);
        if (Math.hypot(m.position[0] - w.position[0], m.position[2] - w.position[2]) <= w.scale) standing.add(it.id);
      }
    }
    expect([...standing].sort()).toEqual(["far-island", "island"]);
    for (const id of standing) {
      const p = env.items.find((i) => i.id === id)!.params ?? {};
      expect(p.bob ?? 0).toBe(0);
      expect(p.spin ?? 0).toBe(0);
    }
  });
});
