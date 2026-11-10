// Set overrides and prop parenting: broken data must be reported, never crash or loop at render time.
import { describe, expect, it } from "vitest";
import { checkActorDef } from "../src/engine/actors/check";
import { claudeDef, rayanDef } from "../src/engine/actors";
import { resolveEpisode } from "../src/engine/core/timeline";
import { devOffice } from "../src/engine/world/dev-office/devOffice.data";
import { itemWorld, occluders, resolveLayout } from "../src/engine/world/layout";

const episode = (set: object) => ({
  id: "t",
  title: "t",
  set: { environment: "dev-office", ...set },
  cast: { rayan: { actor: "rayan" } },
  camera: [{ at: 0, shot: "establishing" }],
});

const problems = (set: object) => {
  try {
    resolveEpisode(episode(set), null);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("prop parenting", () => {
  it("reports an unknown parent instead of crashing later", () => {
    expect(problems({ add: [{ id: "cup", kind: "mug", on: "shelf-9", position: [0, 0, 0] }] })).toMatch(/cup.*parent "shelf-9" does not exist/);
  });

  it("reports a parent cycle instead of recursing forever", () => {
    const msg = problems({ add: [{ id: "a", kind: "mug", on: "b", position: [0, 0, 0] }, { id: "b", kind: "mug", on: "a", position: [0, 0, 0] }] });
    expect(msg).toMatch(/parent cycle a → b → a/);
    const layout = resolveLayout(devOffice, { add: [{ id: "a", kind: "mug", on: "b", position: [0, 0, 0] }, { id: "b", kind: "mug", on: "a", position: [0, 0, 0] }] }, []);
    expect(() => occluders(layout)).not.toThrow();
    expect(() => itemWorld(layout, "a")).not.toThrow();
  });

  it("removing an item removes everything on it, at any depth", () => {
    const layout = resolveLayout(devOffice, { remove: ["desk"], add: [] });
    expect(layout.items.find((i) => i.on === "desk")).toBeUndefined();
    // A grandchild (an item standing on a monitor that stands on the desk) goes too.
    const env = { ...devOffice, items: [...devOffice.items, { id: "sticker", kind: "mug", on: "monitor-main", position: [0, 0.5, 0] as [number, number, number] }] };
    const r = resolveLayout(env, { remove: ["desk"] });
    expect(r.items.find((i) => i.id === "sticker")).toBeUndefined();
  });

  it("reports an added item placed on a removed one", () => {
    expect(problems({ remove: ["desk"], add: [{ id: "cup", kind: "mug", on: "desk", position: [0, 0.76, 0] }] })).toMatch(/parent "desk" was removed/);
  });

  it("reports typos in remove / move / params ids", () => {
    const msg = problems({ remove: ["plnat"], move: { dsk: { position: [0, 0, 0] } }, params: { monitor: { screen: { preset: "off" } } } });
    expect(msg).toMatch(/set.remove: unknown item "plnat"/);
    expect(msg).toMatch(/set.move: unknown item "dsk"/);
    expect(msg).toMatch(/set.params: unknown item "monitor"/);
  });

  it("set.move applies to items from set.add too", () => {
    const layout = resolveLayout(devOffice, { add: [{ id: "mug-2", kind: "mug", on: "desk", position: [0, 0.76, 0] }], move: { "mug-2": { position: [0.3, 0.76, 0.1] } } });
    expect(layout.items.find((i) => i.id === "mug-2")!.position).toEqual([0.3, 0.76, 0.1]);
  });

  it("valid overrides still resolve", () => {
    expect(problems({ remove: ["plant"], params: { "mug-2": { color: "#fff" } }, add: [{ id: "mug-2", kind: "mug", on: "desk", position: [0, 0.76, 0] }] })).toBe("");
  });
});

describe("user-authored data", () => {
  const withSet = (set: object, extra: object = {}) => resolveEpisode({ ...episode(set), ...extra }, null);

  it("warns on unknown screen presets and params instead of silently rendering 'off'", () => {
    const r = withSet({ params: { "monitor-main": { screen: { preset: "dashbord", lines: [] } } } });
    expect(r.warnings.join("\n")).toMatch(/unknown screen preset "dashbord"/);
    const r2 = withSet({ params: { "monitor-main": { screen: { preset: "terminal", line: ["$ ls"] } } } });
    expect(r2.warnings.join("\n")).toMatch(/screen preset "terminal" has no param "line"/);
  });

  it("accepts a video's own screen presets", () => {
    const r = resolveEpisode(episode({ params: { "monitor-main": { screen: { preset: "dashboard", anything: 1 } } } }), null, { screens: ["dashboard"] });
    expect(r.warnings.join("\n")).not.toMatch(/dashboard/);
  });

  it("warns on params a catalog prop doesn't read, also in props cues", () => {
    const r = withSet({ params: { desk: { colour: "#fff" } } }, { props: [{ at: 1, item: "mug", set: { steem: true } }] });
    expect(r.warnings.join("\n")).toMatch(/"desk" has no param "colour"/);
    expect(r.warnings.join("\n")).toMatch(/props\[0\] \(mug\): "mug" has no param "steem"/);
  });

  it("warns on unknown appearance keys", () => {
    const r = resolveEpisode({ ...episode({}), cast: { rayan: { actor: "rayan", appearance: { jacketColour: "#000" } } } }, null);
    expect(r.warnings.join("\n")).toMatch(/unknown appearance "jacketColour"/);
  });

  it("checks actor definitions a video supplies", () => {
    const bad = { ...claudeDef, id: "robot", defaultPose: "nope", poses: { ...claudeDef.poses, wave: { description: "", set: { "armL.x": 1 } } } };
    expect(checkActorDef(claudeDef)).toEqual([]);
    expect(checkActorDef(rayanDef)).toEqual([]);
    const msgs = checkActorDef(bad);
    expect(msgs.join("\n")).toMatch(/pose "wave" uses undeclared channel "armL.x"/);
    expect(msgs.join("\n")).toMatch(/defaultPose "nope"/);
    expect(() => resolveEpisode({ ...episode({}), cast: { r: { actor: "robot" } } }, null, { actors: { robot: bad } })).toThrow(/undeclared channel "armL.x"/);
  });
});
