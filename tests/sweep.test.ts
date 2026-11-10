import { describe, expect, it } from "vitest";
import type { VoiceManifest } from "../src/engine/audio/speech";
import { resolveEpisode } from "../src/engine/core/timeline";
import { canonical, createSweep, digestSweep } from "../src/engine/inspect/sweep";

const episode = {
  id: "s",
  title: "s",
  format: { preset: "portrait" },
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing" }, claude: { actor: "claude", at: "desk-mascot", scale: 1.5 } },
  dialogue: [{ id: "l1", speaker: "rayan", text: "Ship it." }],
  actions: [{ at: "l1.end", actor: "rayan", gesture: "facepalm" }],
  camera: [{ at: 0, shot: "close", subject: "rayan", move: "handheld" }],
  fx: [
    { type: "shake", at: 0.8, duration: 0.4 },
    { type: "text", at: 1, text: "DEPLOYED." },
  ],
  end: 3,
};

const manifest = (values: number[]): VoiceManifest => ({
  version: 1,
  lines: { l1: { file: "videos/s/voice/l1.wav", hash: "x", provider: "fixture", text: "Ship it.", duration: 1, words: [{ text: "Ship", start: 0.1, end: 0.4 }, { text: "it.", start: 0.45, end: 0.8 }], envelope: { rate: 60, values } } },
});
const loud = Array.from({ length: 60 }, (_, i) => (i % 6 < 3 ? 1 : 0.2));

describe("visual state sweep", () => {
  it("is the same in any frame order", () => {
    const r = resolveEpisode(episode, manifest(loud));
    const a = createSweep(r);
    const sequential = Array.from({ length: a.frames }, (_, f) => canonical(a.at(f)));
    const b = createSweep(r); // fresh caches
    const order = [...sequential.keys()].sort((x, y) => ((x * 37) % a.frames) - ((y * 37) % a.frames));
    const shuffled: string[] = [];
    for (const f of order) shuffled[f] = canonical(b.at(f));
    expect(shuffled).toEqual(sequential);
    expect(digestSweep(createSweep(r))).toEqual(digestSweep(createSweep(r)));
  });

  it("includes the rendered camera, screen accents and the caption page", () => {
    const s = createSweep(resolveEpisode(episode, manifest(loud)));
    const shaking = s.at(Math.round(0.85 * 30));
    const raw = createSweep(resolveEpisode({ ...episode, fx: [] }, manifest(loud))).at(Math.round(0.85 * 30));
    expect(shaking.camera.position).not.toEqual(raw.camera.position);
    expect(s.at(31).fx).toEqual([1]);
    expect(s.at(25).caption).toBe(0); // first word at 0.6 + 0.1 s
    expect(s.at(85).caption).toBe(-1);
  });

  it("changes when audio changes what the picture shows (a same-length take with another envelope)", () => {
    const a = digestSweep(createSweep(resolveEpisode(episode, manifest(loud))));
    const quiet = digestSweep(createSweep(resolveEpisode(episode, manifest(loud.map((v) => v * 0.3)))));
    expect(quiet.frames).toBe(a.frames);
    expect(quiet.total).not.toBe(a.total);
    // Only the seconds where the line is spoken differ.
    expect(a.seconds.map((h, i) => h === quiet.seconds[i])).toEqual([false, false, true]);
  });

  it("ignores float noise below a micrometre but not real changes", () => {
    expect(canonical({ x: 0.1 + 0.2 })).toBe(canonical({ x: 0.3 }));
    expect(canonical({ x: -1e-9 })).toBe(canonical({ x: 0 }));
    expect(canonical({ x: 0.300002 })).not.toBe(canonical({ x: 0.3 }));
  });
});
