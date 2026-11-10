import { describe, expect, it } from "vitest";
import { beatSheet, pacingNotes } from "../src/engine/core/pacing";
import { resolveEpisode } from "../src/engine/core/timeline";

const ep = (extra: object) => ({
  id: "p",
  title: "p",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing" } },
  camera: [{ at: 0, shot: "establishing" }],
  ...extra,
});

describe("pacing notes", () => {
  it("flags a slow open and dead air, and is quiet for a busy cut", () => {
    const slow = resolveEpisode(ep({ dialogue: [{ id: "l1", speaker: "rayan", text: "Hi.", at: 3 }], sfx: [{ at: 8, sound: "ding" }], end: 9 }), null);
    const notes = pacingNotes(slow).join("\n");
    expect(notes).toMatch(/nothing is said, heard or changes in the first 1.5s/);
    expect(notes).toMatch(/dead air/);
    const busy = resolveEpisode(ep({ dialogue: [{ id: "l1", speaker: "rayan", text: "Okay. Final deploy.", at: 0.3 }], sfx: [{ at: 0.2, sound: "ding" }], end: 3 }), null);
    expect(pacingNotes(busy)).toEqual([]);
  });

  it("lists beats in time order", () => {
    const r = resolveEpisode(ep({ dialogue: [{ id: "l1", speaker: "rayan", text: "Hi.", at: 1 }], sfx: [{ at: 0.5, sound: "ding" }], actions: [{ at: 2, actor: "rayan", gesture: "facepalm" }] }), null);
    expect(beatSheet(r).map((b) => b.kind)).toEqual(["cut", "sfx", "line", "action"]);
  });
});
