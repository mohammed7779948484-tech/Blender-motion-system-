// The fault set (tests/faults/*.json, loaded by fault-set.ts). The checks must find every fault at
// the right time, object and source, and report every control as accepted — never as a warning.
// Detection itself is asserted by the tests of each check (inspect).
import { describe, expect, it } from "vitest";
import { accepts, profileOf } from "../src/engine/core/behaviour";
import { pacingFindings } from "../src/engine/core/pacing";
import { resolveEpisode } from "../src/engine/core/timeline";
import { FAULTS, sourceAt } from "./fault-set";

describe("fault set", () => {
  it("has faults and intent controls", () => {
    expect(FAULTS.filter(([, f]) => f.expect).length).toBeGreaterThanOrEqual(7);
    expect(FAULTS.filter(([, f]) => !f.expect).length).toBeGreaterThanOrEqual(2);
  });

  it.each(FAULTS)("%s resolves and names an existing source", (_id, f) => {
    const r = resolveEpisode(f.episode, null);
    expect(r.durationInFrames).toBeGreaterThan(0);
    if (f.expect) expect(sourceAt(f.episode, f.expect.source), `source ${f.expect.source}`).toBeDefined();
  });

  it("pacing controls are accepted by intent, not reported", () => {
    const r = resolveEpisode(FAULTS.find(([id]) => id === "control-silence")![1].episode, null);
    const found = pacingFindings(r, profileOf(r.behaviour));
    expect(found.some((p) => p.intent === "silence")).toBe(true);
    expect(found.every((p) => accepts(p.intent, r.behaviour))).toBe(true);
  });
});
