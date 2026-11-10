// Interaction recipes expand into ordinary cues, deterministically, for different anatomies.
import { describe, expect, it } from "vitest";
import { buildTracks, makeQuery, evaluateScene } from "../src/engine/player/scene";
import { rayanDef, rayanHand } from "../src/engine/actors/rayan/rayan.data";
import { restChannels } from "../src/engine/actors/rig";
import { resolveEpisode } from "../src/engine/core/timeline";
import { keyTop } from "../src/engine/world/micro-keyboard/keys";

const micro = (actions: object[], extra: object = {}) => ({
  id: "r",
  title: "r",
  format: { preset: "portrait" },
  set: { environment: "micro-keyboard" },
  cast: { rayan: { actor: "rayan", at: "on-z" }, claude: { actor: "claude", at: "on-ctrl", scale: 2 } },
  actions,
  camera: [{ at: 0, shot: "wide", subject: ["rayan", "claude"] }],
  end: 8,
  ...extra,
});

const keyCues = (r: ReturnType<typeof resolveEpisode>) => r.props.filter((p) => p.item === "keyboard").map((p) => ({ at: +p.at.toFixed(3), keys: p.set.keys }));

describe("recipes", () => {
  it("press while standing on a key: stomp, key goes down at landing, actor sinks with it", () => {
    const r = resolveEpisode(micro([{ at: 1, actor: "rayan", do: "press", target: "keyboard.key:z", sound: "ding" }]), null);
    const contact = 1 + 0.7 * 0.45;
    expect(keyCues(r)).toEqual([{ at: +contact.toFixed(3), keys: { z: true } }]);
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.gestures.map((g) => g.gesture)).toEqual(["stomp"]);
    expect(rayan.moves.at(-1)!.to[1]).toBeCloseTo(0.42 - 0.18);
    expect(r.sfx.some((s) => Math.abs(s.at - contact) < 1e-6)).toBe(true);
  });

  it("a typo in an item anchor is an error, not a silent press at the item centre", () => {
    const err = (ep: object) => {
      try {
        resolveEpisode(ep, null);
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    };
    expect(err(micro([{ at: 1, actor: "rayan", do: "press", target: "keyboard.key:entr" }]))).toMatch(/actions\[0\].*do:press: "keyboard" has no anchor "key:entr"/);
    expect(err(micro([], { fx: [{ type: "impact", at: 1, on: "keyboard.key:entr" }] }))).toMatch(/fx\[0\] \(impact\): "keyboard" has no anchor "key:entr"/);
    expect(err(micro([], { fx: [{ type: "impact", at: 1, on: "keyboard.center" }] }))).toBe("");
  });

  it("a bad generated sound names the action or fx it came from", () => {
    try {
      resolveEpisode(micro([{ at: 1, actor: "rayan", do: "press", target: "keyboard.key:z", sound: "nope" }], { fx: [{ type: "impact", at: 1, on: "keyboard.key:z", sound: "nada" }] }), null);
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/actions\[0\] \(rayan @ 1\.00s\) do:press: "nope" is not a library sound/);
      expect(msg).toMatch(/fx\[0\] \(impact\): "nada" is not a library sound/);
    }
  });

  it("a weightless press hops but presses nothing (the mascot is too light)", () => {
    const r = resolveEpisode(micro([{ at: 1, actor: "claude", do: "press", target: "keyboard.key:ctrl", weight: false }]), null);
    expect(keyCues(r)).toEqual([]);
    expect(r.actors.find((a) => a.id === "claude")!.gestures.map((g) => g.gesture)).toEqual(["hop"]);
  });

  it("pick-up walks over when out of reach, crouches, grabs; place leaves a copy that presses the key", () => {
    const r = resolveEpisode(
      micro([
        { at: 1, actor: "rayan", do: "pick-up", item: "duck" },
        { at: 4, actor: "rayan", do: "place", target: "keyboard.key:ctrl" },
      ]),
      null,
    );
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.moves.length).toBeGreaterThanOrEqual(1); // approach walk to the duck
    expect(rayan.poses.some((p) => p.pose === "crouch")).toBe(true);
    const grab = rayan.holds.find((h) => h.item === "duck")!;
    const drop = rayan.holds.find((h) => h.item === null)!;
    expect(grab.socket).toMatch(/hand[LR]/);
    expect(drop.at).toBeGreaterThan(grab.at);
    const copy = r.layout.items.find((i) => i.id.startsWith("duck@"))!;
    expect(copy.params?.visible).toBe(false);
    expect(copy.position[1]).toBeCloseTo(keyTop("ctrl")[1] - 0.18); // sits on the pressed key
    expect(r.props.find((p) => p.item === copy.id)!.set).toEqual({ visible: true });
    expect(r.props.find((p) => p.item === "duck")!.set).toEqual({ visible: false });
    expect(keyCues(r).at(-1)!.keys).toEqual({ ctrl: true });
    // The grabbing hand actually reaches the duck: the overrides hold shoulder/elbow values.
    expect(rayan.overrides.some((o) => Object.keys(o.set).some((k) => k.startsWith("shoulder")))).toBe(true);
  });

  it("point raises an arm toward the target; react flinches", () => {
    const r = resolveEpisode(micro([{ at: 1, actor: "rayan", do: "point", target: "keyboard.key:enter" }, { at: 3, actor: "claude", do: "react", target: "rayan" }]), null);
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(Object.keys(rayan.overrides[0].set).some((k) => k.startsWith("shoulder"))).toBe(true);
    const claude = r.actors.find((a) => a.id === "claude")!;
    expect(claude.gestures.map((g) => g.gesture)).toEqual(["flinch"]);
    expect(claude.emotions.at(-1)!.emotion).toBe("shocked");
  });

  it("sit-down walks to the seat and sits", () => {
    const r = resolveEpisode(
      {
        id: "s",
        title: "s",
        set: { environment: "dev-office" },
        cast: { rayan: { actor: "rayan", at: "beside-desk" } },
        actions: [{ at: 0.5, actor: "rayan", do: "sit-down", target: "chair-seat" }],
        camera: [{ at: 0, shot: "establishing" }],
      },
      null,
    );
    const rayan = r.actors[0];
    expect(rayan.moves[0].to).toEqual([0, 0, -0.06]);
    expect(rayan.poses.at(-1)!.pose).toBe("sit_idle");
    expect(rayan.poses.at(-1)!.at).toBeGreaterThan(0.9);
  });

  it("is deterministic and the scene evaluates in any frame order", () => {
    const ep = micro([
      { at: 1, actor: "rayan", do: "pick-up", item: "duck" },
      { at: 4, actor: "rayan", do: "place", target: "keyboard.key:ctrl" },
      { at: 6, actor: "rayan", do: "point", target: "claude" },
    ]);
    const a = resolveEpisode(ep, null);
    const b = resolveEpisode(ep, null);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const tracks = buildTracks(a);
    const q = makeQuery(a, tracks);
    const times = [0.5, 2.1, 3.3, 4.6, 6.4, 7.5];
    const seq = times.map((t) => JSON.stringify(evaluateScene(a, tracks, q, t).actors));
    const q2 = makeQuery(a, tracks);
    const shuffled = [...times].reverse().map((t) => JSON.stringify(evaluateScene(a, tracks, q2, t).actors)).reverse();
    expect(shuffled).toEqual(seq);
  });
});

describe("recipes in a seated scene", () => {
  it("a seated actor picks something off the desk without crouching", () => {
    const r = resolveEpisode(
      {
        id: "seat",
        title: "seat",
        set: { environment: "dev-office" },
        cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_idle" } },
        actions: [{ at: 1, actor: "rayan", do: "pick-up", item: "mug" }],
        camera: [{ at: 0, shot: "establishing" }],
      },
      null,
    );
    const rayan = r.actors[0];
    expect(rayan.poses.map((p) => p.pose)).toEqual(["sit_idle"]);
    expect(rayan.holds.find((h) => h.item === "mug")).toBeDefined();
  });

  it("unknown code languages warn instead of crashing", () => {
    const r = resolveEpisode({ id: "l", title: "l", set: { environment: "dev-office", params: { "monitor-main": { screen: { preset: "code", lang: "rust", code: "fn main() {}" } } } }, cast: { rayan: { actor: "rayan" } }, camera: [{ at: 0, shot: "establishing" }] }, null);
    expect(r.warnings.join("\n")).toMatch(/lang "rust" isn't highlighted/);
  });
});

describe("hand-to-self recipes", () => {
  const office = (actions: object[], pose = "sit_idle") => ({
    id: "fp",
    title: "fp",
    set: { environment: "dev-office" },
    cast: { rayan: { actor: "rayan", at: "chair-seat", pose }, claude: { actor: "claude", at: "desk-mascot", scale: 1.5 } },
    actions,
    camera: [{ at: 0, shot: "establishing" }],
    end: 8,
  });

  it("facepalm puts the palm on the face, seated and standing", () => {
    for (const pose of ["sit_idle", "stand_idle"]) {
      const r = resolveEpisode(office([{ at: 1, actor: "rayan", do: "facepalm" }], pose), null);
      const rayan = r.actors.find((a) => a.id === "rayan")!;
      const o = rayan.overrides.at(-1)!;
      expect(o.set["head.x"]).toBeGreaterThan(0.3);
      const c = { ...restChannels(rayanDef), ...rayanDef.poses[pose].set, ...o.set };
      const hand = rayanHand(c, "R");
      const face = rayanDef.anchors(c).face;
      expect(Math.hypot(hand[0] - face[0], hand[1] - face[1], hand[2] - face[2]), pose).toBeLessThan(0.2);
      expect(rayan.emotions.at(-1)!.emotion).toBe("tired");
    }
  });

  it("sip needs a held cup and brings it to the mouth", () => {
    expect(() => resolveEpisode(office([{ at: 1, actor: "rayan", do: "sip" }]), null)).toThrow(/sip needs something in a hand/);
    const r = resolveEpisode(office([{ at: 0.5, actor: "rayan", do: "pick-up", item: "mug" }, { at: 2.5, actor: "rayan", do: "sip" }]), null);
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    const sip = rayan.overrides.at(-1)!;
    const side = rayan.holds.find((h) => h.item === "mug")!.socket === "handL" ? "L" : "R";
    expect(Object.keys(sip.set)).toContain(`shoulder${side}.x`);
    expect(sip.set["head.x"]).toBeLessThan(0);
  });

  it("a seated pick-up turns back to its original facing", () => {
    const r = resolveEpisode(office([{ at: 0.5, actor: "rayan", do: "pick-up", item: "mug" }]), null);
    const turns = r.actors.find((a) => a.id === "rayan")!.turns;
    expect(turns).toHaveLength(2);
    expect(turns[1].yaw).toBeCloseTo(0);
  });

  it("the armless mascot gets a tired shake instead of a facepalm", () => {
    const r = resolveEpisode(office([{ at: 1, actor: "claude", do: "facepalm" }]), null);
    const claude = r.actors.find((a) => a.id === "claude")!;
    expect(claude.emotions.at(-1)!.emotion).toBe("tired");
    expect(claude.gestures.map((g) => g.gesture)).toEqual(["shake"]);
  });
});
