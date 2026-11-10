// Accent cues resolve to absolute, serializable data; the window model is a pure function of time.
import { describe, expect, it } from "vitest";
import { fxEnvelope } from "../src/engine/core/fx";
import { resolveEpisode } from "../src/engine/core/timeline";
import { windowState } from "../src/engine/ui/window";
import { keyTop } from "../src/engine/world/micro-keyboard/keys";

const ep = (fx: object[], extra: object = {}) => ({
  id: "f",
  title: "f",
  format: { preset: "portrait" },
  set: { environment: "micro-keyboard" },
  cast: { rayan: { actor: "rayan", at: "on-z" } },
  dialogue: [{ id: "l1", speaker: "rayan", text: "Undo it." }],
  camera: [{ at: 0, shot: "medium", subject: "rayan" }],
  fx,
  ...extra,
});

describe("fx", () => {
  it("resolves times, defaults, targets and sounds", () => {
    const r = resolveEpisode(
      ep([
        { type: "impact", at: "l1.start", on: "keyboard.key:enter", sound: "impact-heavy", volume: 0.7 },
        { type: "callout", at: 1, on: "rayan.head", text: "HIM" },
        { type: "text", at: 2, text: "DEPLOYED.", style: "slam", duration: 1 },
      ]),
      null,
    );
    const [impact, callout, text] = r.fx;
    expect(impact.at).toBeCloseTo(r.lines[0].start);
    expect(impact.end - impact.at).toBeCloseTo(0.9); // catalog default
    expect(impact.on).toEqual(keyTop("enter"));
    expect(callout.on).toEqual({ actor: "rayan", anchor: "head" });
    expect(text.end).toBeCloseTo(3);
    expect(text.data).toMatchObject({ text: "DEPLOYED.", style: "slam" });
    const s = r.sfx.find((x) => x.name === "impact-heavy")!;
    expect(s).toMatchObject({ volume: 0.7, src: "sfx/impact-heavy.wav", license: "CC0-1.0" });
    expect(s.at).toBeCloseTo(impact.at);
    expect(r.post.chroma).toBe(false);
  });

  it("only episodes that glitch get the extra post effect (passes never change mid-render)", () => {
    expect(resolveEpisode(ep([{ type: "glitch", at: 1 }]), null).post.chroma).toBe(true);
  });

  it("default duration covers accents; unknown targets and bad params are errors", () => {
    expect(resolveEpisode(ep([{ type: "text", at: 9, text: "END", duration: 2 }]), null).duration).toBeCloseTo(11 + 1.5);
    expect(() => resolveEpisode(ep([{ type: "callout", at: 1, on: "nowhere", text: "?" }]), null)).toThrow(/unknown target "nowhere"/);
    expect(() => resolveEpisode(ep([{ type: "text", at: 1, txt: "typo" }]), null)).toThrow();
  });

  it("envelopes rise fast and decay to zero at the end", () => {
    const f = { type: "shake" as const, at: 1, end: 1.5, data: {}, seed: "s" };
    expect(fxEnvelope(f, 0.99)).toBe(0);
    expect(fxEnvelope(f, 1.05)).toBeGreaterThan(0.8);
    expect(fxEnvelope(f, 1.5)).toBe(0);
  });
});

describe("AppWindow model", () => {
  it("chat: user types, the AI shows typing dots then streams its reply", () => {
    const p = { kind: "chat" as const, messages: [{ from: "user" as const, text: "fix the css" }, { from: "ai" as const, text: "No." }] };
    const early = windowState(p, 0.4);
    expect(early.items).toHaveLength(1);
    expect((early.items[0] as { text: string }).text.length).toBeLessThan("fix the css".length);
    const userDone = 0.25 + "fix the css".length / 28 + 0.45;
    const thinking = windowState(p, userDone + 0.2);
    expect(thinking.items[1]).toMatchObject({ type: "bubble", from: "ai", typing: true, text: "" });
    expect((windowState(p, userDone + 2).items[1] as { text: string }).text).toBe("No.");
  });

  it("terminal: commands type out, output appears line by line with colours", () => {
    const p = { kind: "terminal" as const, lines: ["$ npm test", "! 3 failing", "+ 12 passing"], interval: 0.3 };
    const s = windowState(p, 5);
    expect(s.items.map((i) => (i as { text: string; color: string }).color)).toEqual(["command", "red", "green"]);
    expect((s.items[1] as { text: string }).text).toBe("3 failing");
    expect(windowState(p, 0.3).items).toHaveLength(1);
  });

  it("is a pure function of time", () => {
    const p = { kind: "chat" as const, messages: [{ from: "ai" as const, text: "Also… I redeployed it." }] };
    expect(JSON.stringify(windowState(p, 1.234))).toBe(JSON.stringify(windowState(p, 1.234)));
  });
});
