// Performance layer: opt-in listening (looks at whoever speaks after a reaction delay, nods at phrase ends,
// stays out of the way of authored looks, and does nothing at all when restrained), emotion intensity, keyed
// joints through via points, and the engine-2 self-touch recipes that no longer pass through the head.
import { describe, expect, it } from "vitest";
import { rayanDef } from "../src/engine/actors/rayan/rayan.data";
import { listenBeat, listenLook, worldEffectors, type ActorTrack } from "../src/engine/actors/rig";
import { resolveEpisode } from "../src/engine/core/timeline";
import { createTrace } from "../src/engine/core/trace";
import type { Vec3 } from "../src/engine/core/time";
import { inspectEpisode } from "../src/engine/inspect/inspect";
import { buildTracks, evaluateScene, makeQuery } from "../src/engine/player/scene";

const office = (extra: object = {}) => ({
  id: "perf",
  title: "perf",
  engine: 2,
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_idle" }, claude: { actor: "claude", at: "desk-mascot", scale: 1.6 } },
  dialogue: [{ id: "l1", speaker: "claude", text: "Did you run the tests before you pushed to main?", at: 1 }],
  camera: [{ at: 0, shot: "establishing" }],
  end: 7,
  ...extra,
});

const scene = (ep: object) => {
  const r = resolveEpisode(ep, null);
  const tracks = buildTracks(r);
  const q = makeQuery(r, tracks);
  return { r, tracks, at: (t: number) => evaluateScene(r, tracks, q, t) };
};
const rayanAt = (s: ReturnType<typeof scene>, t: number) => s.at(t).actors.find((a) => a.id === "rayan")!;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)));

/** Angle between where Rayan's face points and the direction to the mascot's face. */
const gazeError = (s: ReturnType<typeof scene>, t: number) => {
  const f = s.at(t);
  const rayan = f.actors.find((a) => a.id === "rayan")!;
  const fx = worldEffectors(rayan, rayanDef)!.points;
  const target = f.actors.find((a) => a.id === "claude")!.anchors.face;
  return angle(sub(fx.face, fx.head), sub(target, fx.head));
};

describe("listening (opt-in)", () => {
  it("is off unless asked for, even on engine 2", () => {
    expect(scene(office()).tracks.every((t) => t.listen === undefined)).toBe(true);
    const on = scene(office({ defaults: { listen: 1 } }));
    const rayan = on.tracks.find((t) => t.id === "rayan")!;
    expect(rayan.listen).toMatchObject({ intensity: 1, delay: 0.2, nod: 1 });
    expect(rayan.listen!.lines.map((l) => l.speaker)).toEqual(["claude"]);
    // The mascot doesn't listen to its own line.
    expect(on.tracks.find((t) => t.id === "claude")!.listen!.lines).toEqual([]);
  });

  it("looks at whoever speaks after the persona's reaction delay, then lets go", () => {
    const off = scene(office());
    const on = scene(office({ defaults: { listen: 1 } }));
    const line = on.r.lines[0];
    // Before the reaction delay (0.2 s for Rayan) nothing has changed.
    expect(rayanAt(on, line.start + 0.1).channels).toEqual(rayanAt(off, line.start + 0.1).channels);
    // Mid-line the face turns toward the speaker.
    const mid = line.start + 1;
    expect(gazeError(on, mid)).toBeLessThan(gazeError(off, mid) - 0.3);
    // Well after the line it lets go again.
    const after = line.end + 1.5;
    expect(rayanAt(on, after).channels["head.y"]).toBeCloseTo(rayanAt(off, after).channels["head.y"], 6);
    const track = on.tracks.find((t) => t.id === "rayan")!;
    expect(listenLook(track, line.start + 0.15)).toBeNull();
    expect(listenLook(track, mid)).toMatchObject({ speaker: "claude" });
  });

  it("restrained (intensity 0) stays at exactly zero, for the episode or one character", () => {
    const off = scene(office());
    for (const ep of [office({ defaults: { listen: 0 } }), office({ defaults: { listen: 1 }, cast: { ...office().cast, rayan: { ...office().cast.rayan, listen: 0 } } })]) {
      const s = scene(ep);
      expect(s.tracks.find((t) => t.id === "rayan")!.listen).toBeUndefined();
      for (const t of [1.5, 2.5, 3.5, 4.5]) expect(rayanAt(s, t).channels).toEqual(rayanAt(off, t).channels);
    }
  });

  it("authored looks win: listening only fills the weight they leave", () => {
    const look = { actions: [{ at: 0.2, actor: "rayan", look: "camera" }] };
    const authored = scene(office(look));
    const both = scene(office({ ...look, defaults: { listen: 1 } }));
    for (const t of [1.6, 2.4, 3.2]) expect(rayanAt(both, t).channels["head.y"]).toBeCloseTo(rayanAt(authored, t).channels["head.y"], 9);
  });

  it("nods only shortly after the speaker's phrase ends", () => {
    const track = {
      seed: "nod-test",
      listen: { intensity: 1, delay: 0.2, nod: 1, cuts: [], lines: Array.from({ length: 8 }, (_, i) => ({ speaker: "x", start: i * 3, end: i * 3 + 2, pauses: [i * 3 + 1, i * 3 + 2] })) },
    } as unknown as ActorTrack;
    const pauses = track.listen!.lines.flatMap((l) => l.pauses);
    let nods = 0;
    for (let t = 0; t < 24; t += 1 / 60) {
      const b = listenBeat(track, t);
      const nearPause = pauses.some((p) => t > p + 0.12 && t < p + 0.62);
      if (!nearPause) expect(b, `t=${t.toFixed(2)}`).toBe(0);
      if (b > 0.5) nods++;
    }
    expect(nods).toBeGreaterThan(0);
    expect(listenBeat({ ...track, listen: { ...track.listen!, intensity: 0 } }, pauses[0] + 0.37)).toBe(0);
  });

  it("listens to the other speaker's word gaps as phrase ends", () => {
    const voice = {
      version: 1,
      lines: {
        l1: { text: "Did you run the tests?", file: "x.wav", duration: 2.4, provider: "test", envelope: { rate: 60, values: [0] }, words: [{ text: "Did", start: 0.05, end: 0.3 }, { text: "you", start: 0.32, end: 0.5 }, { text: "run", start: 1.0, end: 1.3 }, { text: "the", start: 1.32, end: 1.5 }, { text: "tests?", start: 1.52, end: 2.1 }] },
      },
    };
    const r = resolveEpisode(office({ dialogue: [{ id: "l1", speaker: "claude", text: "Did you run the tests?", at: 1 }], defaults: { listen: 1 } }), voice as never);
    const rayan = buildTracks(r).find((t) => t.id === "rayan")!;
    expect(rayan.listen!.lines[0].pauses.map((p) => +p.toFixed(2))).toEqual([1.5, 3.1]);
  });
});

describe("emotion intensity", () => {
  it("goes part of the way toward the emotion (and stays the gesture's strength on a gesture action)", () => {
    const at = (actions: object[]) => scene(office({ dialogue: [], actions })).tracks.find((t) => t.id === "rayan")!;
    const base = (actions: object[]) => {
      const s = scene(office({ dialogue: [], actions }));
      return s.at(2).actors.find((a) => a.id === "rayan")!.channels;
    };
    const neutral = base([]);
    const full = base([{ at: 0.5, actor: "rayan", emotion: "happy" }]);
    const half = base([{ at: 0.5, actor: "rayan", emotion: "happy", intensity: 0.5 }]);
    let checked = 0;
    for (const k of ["browL.y", "browR.y", "lidL", "lidR", "mouth.smile"]) {
      if (!(k in full) || Math.abs(full[k] - neutral[k]) < 1e-3) continue;
      expect(half[k], k).toBeCloseTo((neutral[k] + full[k]) / 2, 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    expect(at([{ at: 0.5, actor: "rayan", emotion: "happy", gesture: "nod", intensity: 0.5 }]).emotions.at(-1)!.intensity).toBeUndefined();
  });
});

describe("keyed joints", () => {
  const keyed = (keys: object[], extra: object = {}) => office({ dialogue: [], actions: [{ at: 1, actor: "rayan", joints: { "shoulderR.x": 0 }, keys, transition: 0.2, ...extra }] });

  it("pass through every via point (a straight blend never would)", () => {
    const s = scene(keyed([{ at: 1.6, joints: { "shoulderR.x": -1.5 } }, { at: 2.2, joints: { "shoulderR.x": -0.5 } }]));
    const ch = (t: number) => rayanAt(s, t).channels["shoulderR.x"];
    expect(ch(1.6)).toBeCloseTo(-1.5, 6);
    expect(ch(2.2)).toBeCloseTo(-0.5, 6);
    expect(ch(3)).toBeCloseTo(-0.5, 6); // holds the last key
    // Smooth: no step between frames larger than the overall travel allows.
    let worst = 0;
    for (let t = 1.2; t < 2.4; t += 1 / 30) worst = Math.max(worst, Math.abs(ch(t + 1 / 30) - ch(t)));
    expect(worst).toBeLessThan(0.2);
  });

  it("a channel first keyed later holds its first value; keys must be inside the action", () => {
    const r = resolveEpisode(keyed([{ at: 1.5, joints: { "elbowR.x": -1 } }]), null);
    const o = r.actors.find((a) => a.id === "rayan")!.overrides[0];
    expect(Object.keys(o.set).sort()).toEqual(["elbowR.x", "shoulderR.x"]);
    expect(o.keys!.map((k) => k.at)).toEqual([1, 1.5]);
    expect(() => resolveEpisode(keyed([{ at: 0.5, joints: { "shoulderR.x": -1 } }]), null)).toThrow(/before the action/);
    expect(() => resolveEpisode(keyed([{ at: 1.5, joints: { "shoulderR.q": -1 } }]), null)).toThrow(/no channel "shoulderR.q"/);
    expect(resolveEpisode(keyed([{ at: 3, joints: { "shoulderR.x": -1 } }], { duration: 1 }), null).warnings.join("\n")).toMatch(/after the override ends/);
  });
});

describe("self-touch recipes through via points (engine-2 correction)", () => {
  const penetrations = (ep: object) => {
    const trace = createTrace();
    const r = resolveEpisode(ep, null, { trace });
    return inspectEpisode(r, { trace }).filter((f) => f.check === "contact" && f.object.startsWith("rayan.") && (f.with === "rayan.head" || f.kind !== "penetration"));
  };
  const fp = (engine: 1 | 2, pose = "sit_idle", action: object = { do: "facepalm" }) =>
    office({ engine, dialogue: [], cast: { rayan: { actor: "rayan", at: "chair-seat", pose } }, actions: [{ at: 1, actor: "rayan", ...action }] });

  it("engine 1 keeps the old facepalm (palm inside the head); engine 2 puts it on the face", () => {
    expect(penetrations(fp(1)).map((f) => `${f.kind} ${f.object}`)).toContain("penetration rayan.handR");
    for (const pose of ["sit_idle", "stand_idle"]) expect(penetrations(fp(2, pose)).map((f) => `${f.kind} ${f.object} ${f.from.toFixed(2)} ${f.message}`), pose).toEqual([]);
  });

  it("the engine-2 facepalm rises through a key in front of the chest and lands on its contact", () => {
    const trace = createTrace();
    const r = resolveEpisode(fp(2), null, { trace });
    const o = r.actors.find((a) => a.id === "rayan")!.overrides[0];
    expect(o.keys!.map((k) => +(k.at - 1).toFixed(2))).toEqual([0, 0.3, 0.6]);
    expect(trace.contacts.filter((c) => c.what === "facepalm")).toHaveLength(1);
    // The switch: viaPoints off on engine 2 is the old recipe.
    const legacy = resolveEpisode(office({ ...fp(2), defaults: { viaPoints: false } }), null).actors.find((a) => a.id === "rayan")!.overrides[0];
    expect(legacy.keys).toBeUndefined();
  });

  it("sip brings the cup up without passing through the face", () => {
    const ep = office({ engine: 2, dialogue: [], cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_idle" } }, actions: [{ at: 0.5, actor: "rayan", do: "pick-up", item: "mug" }, { at: 2.5, actor: "rayan", do: "sip" }] });
    expect(penetrations(ep).filter((f) => f.kind === "penetration")).toEqual([]);
  });
});
