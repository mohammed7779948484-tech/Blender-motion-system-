// inspect against the fault set: every fault is found with the right check, object, time and source;
// every intent control produces nothing but accepted findings (and notes).
import { describe, expect, it } from "vitest";
import { resolveEpisode } from "../src/engine/core/timeline";
import { createTrace } from "../src/engine/core/trace";
import { createContext } from "../src/engine/inspect/context";
import { explainActor, explainCamera } from "../src/engine/inspect/explain";
import { inspectEpisode } from "../src/engine/inspect/inspect";
import { FAULTS } from "./fault-set";

const run = (episode: unknown) => {
  const trace = createTrace();
  const r = resolveEpisode(episode, null, { trace });
  return { r, trace, findings: inspectEpisode(r, { trace }) };
};

describe("inspect finds every fault", () => {
  it.each(FAULTS.filter(([, f]) => f.expect))("%s", (_id, fault) => {
    const e = fault.expect!;
    const { findings } = run(fault.episode);
    const match = findings.find(
      (f) =>
        f.check === e.check &&
        f.kind === e.kind &&
        f.object === e.object &&
        (!e.with || f.with === e.with) &&
        f.from <= e.to + 0.2 &&
        f.to >= e.from - 0.2 &&
        !!f.source?.startsWith(e.source) &&
        !f.accepted,
    );
    expect(match, `expected ${JSON.stringify(e)}; got:\n${findings.map((f) => `${f.check}/${f.kind} ${f.object} ${f.with ?? ""} ${f.from.toFixed(2)}-${f.to.toFixed(2)} ← ${f.source}`).join("\n")}`).toBeDefined();
  });
});

describe("intent controls are accepted, not reported", () => {
  it.each(FAULTS.filter(([, f]) => !f.expect))("%s", (_id, fault) => {
    const { findings } = run(fault.episode);
    const open = findings.filter((f) => !f.accepted && f.level !== "note");
    expect(open.map((f) => `${f.check}/${f.kind} ${f.object}`)).toEqual([]);
    for (const intent of fault.accepted ?? []) expect(findings.some((f) => f.accepted && f.intent === intent), `accepted ${intent}`).toBe(true);
  });
});

describe("explain", () => {
  it("names every layer's source at a moment", () => {
    const fault = FAULTS.find(([id]) => id === "arm-through-face")![1];
    const { r, trace, findings } = run(fault.episode);
    const ctx = createContext(r, { trace });
    const lines = explainActor(ctx, "rayan", 1.5, findings).join("\n");
    expect(lines).toMatch(/joints\s+weight 1\.00 .*← actions\[0\]/);
    expect(lines).toMatch(/pose\s+stand_idle .*← cast\.rayan/);
    expect(lines).toMatch(/finding .*penetration rayan\.handR × rayan\.head/);
    expect(explainCamera(ctx, 1.5, findings).join("\n")).toMatch(/shot 0 medium on rayan .*← camera\[0\]/);
  });
});
