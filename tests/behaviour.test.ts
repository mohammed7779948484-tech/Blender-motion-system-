import { describe, expect, it } from "vitest";
import { accepts, profileOf, resolveBehaviour } from "../src/engine/core/behaviour";
import { pacingFindings } from "../src/engine/core/pacing";
import { resolveEpisode } from "../src/engine/core/timeline";

const ep = (extra: object) => ({
  id: "b",
  title: "b",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing" } },
  camera: [{ at: 0, shot: "establishing" }],
  ...extra,
});

describe("engine version, profile and intent", () => {
  it("defaults to the original engine and the standard profile", () => {
    const r = resolveEpisode(ep({}), null);
    expect(r.behaviour).toEqual({ engine: 1, profile: "standard", allow: [], defaults: { cameraLife: 0, focusPull: false, arcBlend: false, listen: 0, viaPoints: false, trim: false, level: false, speechMotion: false } });
    expect(profileOf(r.behaviour)).toMatchObject({ hook: 1.5, deadAir: 1.5 });
  });

  it("reads engine 2, a profile and episode/shot intents", () => {
    const r = resolveEpisode(ep({ engine: 2, profile: "standard", allow: ["silence"], camera: [{ at: 0, shot: "medium", subject: "rayan", allow: ["offscreen"] }] }), null);
    expect(r.behaviour).toEqual({ engine: 2, profile: "standard", allow: ["silence"], defaults: { cameraLife: 0, focusPull: true, arcBlend: true, listen: 0, viaPoints: true, trim: true, level: true, speechMotion: true } });
    expect(accepts("silence", r.behaviour)).toBe(true);
    expect(accepts("offscreen", r.behaviour)).toBe(false);
    expect(accepts("offscreen", r.behaviour, r.shots[0])).toBe(true);
    expect(resolveBehaviour({})).toEqual({ engine: 1, profile: "standard", allow: [], defaults: { cameraLife: 0, focusPull: false, arcBlend: false, listen: 0, viaPoints: false, trim: false, level: false, speechMotion: false } });
    // Corrections can be switched off on engine 2 and on for engine 1; styles stay opt-in.
    expect(resolveBehaviour({ engine: 2, defaults: { focusPull: false, cameraLife: 0.5, listen: 0.6 } }).defaults).toEqual({ cameraLife: 0.5, focusPull: false, arcBlend: true, listen: 0.6, viaPoints: true, trim: true, level: true, speechMotion: true });
  });

  it("rejects unknown engines, profiles, intents and eases instead of ignoring them", () => {
    expect(() => resolveEpisode(ep({ engine: 3 }), null)).toThrow(/engine/);
    expect(() => resolveEpisode(ep({ profile: "cinematik" }), null)).toThrow(/profile/);
    expect(() => resolveEpisode(ep({ allow: ["silense"] }), null)).toThrow(/allow/);
    expect(() => resolveEpisode(ep({ camera: [{ at: 0, shot: "medium", subject: "rayan", move: { type: "push-in", ease: "bounce" } }] }), null)).toThrow(/camera.0.move/);
  });

  it("names the intent that accepts each pacing finding", () => {
    const slow = resolveEpisode(ep({ dialogue: [{ id: "l1", speaker: "rayan", text: "Hi.", at: 3 }], sfx: [{ at: 8, sound: "ding" }], end: 9 }), null);
    const found = pacingFindings(slow);
    expect(found.map((f) => [f.kind, f.intent])).toEqual([
      ["hook", "slow-open"],
      ["dead-air", "silence"], // 0–3 s, before the line
      ["dead-air", "silence"], // after the line, until the sound at 8 s
    ]);
    expect(pacingFindings(slow, { hook: 4, deadAir: 10 })).toEqual([]);
  });
});
