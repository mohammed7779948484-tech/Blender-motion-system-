// Music bed: engine 1 keeps the original hard duck; engine 2 ramps it (attack/release) and fades the bed out.
import { describe, expect, it } from "vitest";
import { duckAmount, musicVolumeAt } from "../src/engine/audio/musicGain";
import { resolveEpisode } from "../src/engine/core/timeline";

const base = {
  id: "t",
  title: "t",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing" } },
  dialogue: [{ id: "l1", speaker: "rayan", text: "Okay. Final deploy.", at: 2 }],
  camera: [{ at: 0, shot: "establishing" }],
  music: { src: "videos/t/bed.mp3", volume: 0.4, duck: 0.25 },
  end: 10,
};
// Pretend the line is voiced from 2 s to 4 s.
const lines = [{ start: 2, end: 4, voiced: true }] as Parameters<typeof musicVolumeAt>[2];

describe("music bed", () => {
  it("engine 1 resolves to the original hard switch (no ramps, no fade)", () => {
    const m = resolveEpisode(base, null).music!;
    expect(m).toMatchObject({ volume: 0.4, duck: 0.25, attack: 0, release: 0, fadeOut: 0 });
    // Exactly the old rule: ducked within line ± 0.15 s, full level elsewhere, up to the last frame.
    expect(musicVolumeAt(1.84, m, lines, 10)).toBeCloseTo(0.4);
    expect(musicVolumeAt(1.86, m, lines, 10)).toBeCloseTo(0.1);
    expect(musicVolumeAt(4.14, m, lines, 10)).toBeCloseTo(0.1);
    expect(musicVolumeAt(4.16, m, lines, 10)).toBeCloseTo(0.4);
    expect(musicVolumeAt(9.99, m, lines, 10)).toBeCloseTo(0.4);
  });

  it("engine 2 ramps into and out of the duck and fades out at the end", () => {
    const m = resolveEpisode({ ...base, engine: 2 }, null).music!;
    expect(m).toMatchObject({ attack: 0.25, release: 0.6, fadeOut: 0.6 });
    const v = (t: number) => musicVolumeAt(t, m, lines, 10);
    expect(v(1.5)).toBeCloseTo(0.4); // before the attack
    expect(v(1.85)).toBeCloseTo(0.1); // speech window reached
    expect(v(1.725)).toBeGreaterThan(0.1); // mid attack: in between
    expect(v(1.725)).toBeLessThan(0.4);
    expect(v(4.45)).toBeGreaterThan(0.1); // mid release
    expect(v(4.45)).toBeLessThan(0.4);
    expect(v(4.8)).toBeCloseTo(0.4); // released
    expect(v(9.7)).toBeCloseTo(0.2); // halfway through the fade-out
    expect(v(10)).toBeCloseTo(0);
    // Monotonic attack: no step larger than a smooth ramp allows between frames.
    let prev = v(1.5);
    for (let t = 1.5; t <= 1.85; t += 1 / 30) {
      expect(Math.abs(v(t) - prev)).toBeLessThan(0.08);
      prev = v(t);
    }
  });

  it("authored ramps win; overlapping releases and attacks take the deeper duck", () => {
    const m = resolveEpisode({ ...base, engine: 2, music: { ...base.music, attack: 0, release: 0, fadeOut: 0 } }, null).music!;
    expect(m).toMatchObject({ attack: 0, release: 0, fadeOut: 0 });
    const two = [{ start: 2, end: 3, voiced: true }, { start: 3.6, end: 5, voiced: true }];
    // 0.3 s gap between padded windows, shorter than release + attack: never back to full level.
    for (let t = 3.15; t <= 3.45; t += 0.05) expect(duckAmount(t, two, 0.25, 0.6)).toBeGreaterThan(0.5);
    // Unvoiced lines don't duck.
    expect(duckAmount(2.5, [{ start: 2, end: 3, voiced: false }], 0.25, 0.6)).toBe(0);
  });
});
