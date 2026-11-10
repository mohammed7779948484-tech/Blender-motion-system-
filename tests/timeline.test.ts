import { describe, expect, it } from "vitest";
import { lineHash, type VoiceManifest } from "../src/engine/audio/speech";
import { resolveEpisode } from "../src/engine/core/timeline";

const base = {
  id: "t",
  title: "t",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing" }, claude: { actor: "claude", at: "desk-mascot", scale: 1.5 } },
  dialogue: [
    { id: "l1", speaker: "rayan", text: "Okay. Final deploy." },
    { id: "l2", speaker: "claude", text: "Did you run the tests?" },
    { id: "l3", speaker: "rayan", text: "Tests are for people who doubt themselves.", at: "l2.end+0.5" },
  ],
  camera: [{ at: 0, shot: "establishing" }],
};

const voice: VoiceManifest = {
  version: 1,
  lines: {
    l1: { file: "videos/t/voice/l1.wav", hash: "x", provider: "fixture", text: "Okay. Final deploy.", duration: 2, words: [{ text: "Okay.", start: 0.1, end: 0.5 }, { text: "Final", start: 0.9, end: 1.2 }, { text: "deploy.", start: 1.25, end: 1.8 }], envelope: { rate: 60, values: [0, 1, 0] } },
    l2: { file: "videos/t/voice/l2.wav", hash: "y", provider: "fixture", text: "Did you run the tests?", duration: 1.5, words: [{ text: "Did", start: 0, end: 0.2 }, { text: "you", start: 0.25, end: 0.4 }, { text: "run", start: 0.45, end: 0.6 }, { text: "the", start: 0.65, end: 0.75 }, { text: "tests?", start: 0.8, end: 1.3 }], envelope: { rate: 60, values: [0, 1, 0] } },
  },
};

describe("resolveEpisode", () => {
  it("auto-times dialogue from voice durations and references", () => {
    const r = resolveEpisode(base, voice);
    const [l1, l2, l3] = r.lines;
    expect(l1.start).toBeCloseTo(0.6);
    expect(l1.end).toBeCloseTo(2.6);
    expect(l2.start).toBeCloseTo(2.95); // default 0.35 s gap
    expect(l3.start).toBeCloseTo(l2.end + 0.5);
    expect(l1.voiced && l2.voiced).toBe(true);
    expect(l3.voiced).toBe(false); // no clip yet → estimated
    expect(r.warnings.join()).toMatch(/no generated voice/);
  });

  it("resolves word references for actions and camera cuts", () => {
    const r = resolveEpisode(
      {
        ...base,
        actions: [{ at: "l2.word:5", actor: "rayan", emotion: "shocked" }],
        camera: [
          { at: 0, shot: "establishing" },
          { at: "l1.word:2-0.1", shot: "close", subject: "rayan" },
        ],
      },
      voice,
    );
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.emotions.at(-1)!.at).toBeCloseTo(2.95 + 0.8);
    expect(r.shots[1].at).toBeCloseTo(0.6 + 0.9 - 0.1);
    expect(r.shots[0].end).toBeCloseTo(r.shots[1].at);
  });

  it("places cast at marks and resolves look targets", () => {
    const r = resolveEpisode({ ...base, actions: [{ at: 1, actor: "rayan", look: "claude" }, { at: 2, actor: "claude", look: "monitor-main.screen" }] }, null);
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.start.position).toEqual([0, 0, -0.06]);
    expect(rayan.looks[0].target).toEqual({ actor: "claude", anchor: "face" });
    expect(Array.isArray(r.actors.find((a) => a.id === "claude")!.looks[0].target)).toBe(true);
  });

  it("reports every problem at once with helpful names", () => {
    const bad = {
      ...base,
      actions: [
        { at: 1, actor: "rayan", pose: "moonwalk" },
        { at: 1, actor: "nobody", emotion: "happy" },
        { at: "l9.start", actor: "claude", gesture: "spin" },
      ],
      camera: [{ at: 0, shot: "close", subject: "ghost" }],
    };
    let message = "";
    try {
      resolveEpisode(bad, null);
    } catch (e) {
      message = (e as Error).message;
    }
    for (const needle of ["4 problem", "moonwalk", "nobody", "l9", "ghost"]) expect(message).toContain(needle);
  });

  it("rejects unknown fields (typos) through the schema", () => {
    expect(() => resolveEpisode({ ...base, camera: [{ at: 0, shot: "close", subjct: "rayan" }] }, null)).toThrow(/subjct|Unrecognized/);
  });

  it("applies set overrides without touching the shared environment", () => {
    const r = resolveEpisode({ ...base, set: { environment: "dev-office", remove: ["plant"], move: { desk: { position: [1, 0, 1] } }, add: [{ id: "mug-2", kind: "mug", on: "desk", position: [0, 0.76, 0] }] } }, null);
    expect(r.layout.items.find((i) => i.id === "plant")).toBeUndefined();
    expect(r.layout.items.find((i) => i.id === "desk")!.position).toEqual([1, 0, 1]);
    expect(r.layout.items.find((i) => i.id === "mug-2")).toBeDefined();
    const again = resolveEpisode(base, null);
    expect(again.layout.items.find((i) => i.id === "plant")).toBeDefined();
    expect(again.layout.items.find((i) => i.id === "desk")!.position).toEqual([0, 0, 0.62]);
  });

  it("default duration covers every cue, not just the last array line", () => {
    // l3 is explicitly timed early, so the array's last line is NOT the latest; a late sfx + walk extend it further.
    const r = resolveEpisode(
      {
        ...base,
        dialogue: [base.dialogue[0], base.dialogue[1], { id: "l3", speaker: "rayan", text: "Hm.", at: 0.2 }],
        actions: [{ at: 4, actor: "rayan", pose: "stand_idle", move: { to: "door", duration: 5 } }],
        sfx: [{ at: 6, sound: "ding" }],
      },
      voice,
    );
    expect(r.duration).toBeCloseTo(9 + 1.5); // move ends at 4 + 5
    const r2 = resolveEpisode({ ...base, sfx: [{ at: 20, sound: "ding" }] }, voice);
    expect(r2.duration).toBeCloseTo(21.5);
  });

  it("warns about cues after an explicit end and rejects cuts after it", () => {
    const r = resolveEpisode({ ...base, end: 5, sfx: [{ at: 7, sound: "ding" }] }, voice);
    expect(r.warnings.join("\n")).toMatch(/sfx\[0\] \(ding\) at 7.00s is after the end/);
    expect(() => resolveEpisode({ ...base, end: 5, camera: [{ at: 0, shot: "establishing" }, { at: 6, shot: "close", subject: "rayan" }] }, voice)).toThrow(/camera\[1\]: cut at 6.00s is at\/after the end/);
  });

  it("queues overlapping moves like the rig and times the arrival turn from the queued start", () => {
    const r = resolveEpisode(
      {
        ...base,
        cast: { rayan: { actor: "rayan", at: [0, 0, 0] }, claude: base.cast.claude },
        actions: [
          { at: 1, actor: "rayan", move: { to: [2, 0, 0], duration: 2 } },
          { at: 2, actor: "rayan", move: { to: "door", duration: 1 } },
        ],
      },
      voice,
    );
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.turns.at(-1)!.at).toBeCloseTo(3 + 1 - 0.15); // queued start 3 s, not 2 s
    expect(r.warnings.join("\n")).toMatch(/waits until 3.00s/);
  });

  it("warns when one speaker's lines overlap", () => {
    const r = resolveEpisode({ ...base, dialogue: [base.dialogue[0], { id: "l2", speaker: "rayan", text: "Also this.", at: "l1.start+0.5" }] }, voice);
    expect(r.warnings.join("\n")).toMatch(/l2 overlaps l1 \(same speaker rayan\)/);
  });

  it("flags clips made with different voice settings as stale (not just text changes)", () => {
    const fresh = {
      version: 1 as const,
      lines: { l1: { ...voice.lines.l1, hash: "", provider: "system" as const } },
    };
    const castVoice = { system: "Microsoft David Desktop" };
    fresh.lines.l1.hash = lineHash("Okay. Final deploy.", castVoice, "system");
    const ep = { ...base, cast: { ...base.cast, rayan: { ...base.cast.rayan, voice: castVoice } } };
    const ok = resolveEpisode(ep, fresh);
    expect(ok.lines[0].stale).toBeUndefined();
    const changed = resolveEpisode({ ...ep, cast: { ...ep.cast, rayan: { ...ep.cast.rayan, voice: { system: "Microsoft Mark" } } } }, fresh);
    expect(changed.lines[0].voiced).toBe(true);
    expect(changed.lines[0].stale).toBe(true);
    expect(changed.warnings.join("\n")).toMatch(/l1: voice clip is stale \(system voice settings changed\)/);
  });

  it("sets duration from `end` or the last cue", () => {
    expect(resolveEpisode({ ...base, end: 12 }, voice).durationInFrames).toBe(360);
    const r = resolveEpisode(base, voice);
    expect(r.duration).toBeCloseTo(r.lines[2].end + 1.5);
  });
});

describe("same-speaker overlap", () => {
  it("starting a line in the previous clip's trailing silence is not an overlap", () => {
    const v: VoiceManifest = {
      version: 1,
      lines: {
        l1: { ...voice.lines.l1, words: [{ text: "Okay.", start: 0.1, end: 0.5 }, { text: "Final", start: 0.9, end: 1.2 }, { text: "deploy.", start: 1.25, end: 1.3 }] },
      },
    };
    // l1 lasts 2 s but its last word ends at 1.3 s; l2 (same speaker) starts at 1.5 s into it.
    const ep = { ...base, dialogue: [base.dialogue[0], { id: "l2", speaker: "rayan", text: "Also this.", at: "l1.word:3.end+0.2" }] };
    expect(resolveEpisode(ep, v).warnings.join("\n")).not.toMatch(/overlaps/);
  });
});
