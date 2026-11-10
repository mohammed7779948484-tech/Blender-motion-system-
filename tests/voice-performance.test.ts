// Voice performance (M4): clip analysis, edge trims that never eat a sigh, levels, per-speaker speech motion,
// takes (generation, selection, cache compatibility, cost cap), caption overrides and take validation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeClip, autoTrim, integratedLoudness, lineGain, trimmedProtected, validateClip, wordErrorRate, type ClipAnalysis } from "../src/engine/audio/analysis";
import { captionPages } from "../src/engine/audio/captionLayout";
import { envelopeFromSamples, hashString, takeKey, takeSeed, voiceFingerprint, voiceRequest, type VoiceLine, type VoiceManifest, type Word } from "../src/engine/audio/speech";
import { lineTakes, measuredPick, voiceFindings } from "../src/engine/audio/voiceReport";
import { resolveEpisode } from "../src/engine/core/timeline";
import { buildTracks } from "../src/engine/player/scene";
import { fixtureClip, generateVoices, readManifest, readWav } from "../scripts/voice";

const SR = 16000;
const tone = (sec: number, amp: number, f = 220) => Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR) * Math.sin((Math.PI * i) / (sec * SR)) ** 0.3);
/** Deterministic breathy noise (a sigh). */
const breath = (sec: number, amp: number) => {
  let x = 12345;
  return Float32Array.from({ length: Math.round(sec * SR) }, (_, i) => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return ((x / 0x7fffffff) * 2 - 1) * amp * Math.sin((Math.PI * i) / (sec * SR));
  });
};
const silence = (sec: number) => new Float32Array(Math.round(sec * SR));
const concat = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** "I give up. [sighs]": two words, a pause, a soft sigh, trailing silence. */
const sighTail = () => {
  const samples = concat(silence(0.5), tone(0.3, 0.3), silence(0.06), tone(0.35, 0.3), silence(0.35), breath(0.5, 0.03), silence(0.6));
  const words: Word[] = [
    { text: "I", start: 0.5, end: 0.8 },
    { text: "give", start: 0.86, end: 1.0 },
    { text: "up.", start: 1.0, end: 1.21 },
  ];
  return { samples, words, text: "I give up. [sighs]", a: analyzeClip({ samples, sampleRate: SR, text: "I give up. [sighs]", words }) };
};

describe("clip analysis", () => {
  it("measures loudness like BS.1770 (a 0.1-amplitude 997 Hz sine ≈ -23 LUFS)", () => {
    const s = Float32Array.from({ length: SR * 3 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 997 * i) / SR));
    expect(integratedLoudness(s, SR)).toBeCloseTo(-23.01, 0);
  });

  it("finds the sound, the noise floor, the peak and a performed sigh", () => {
    const { a } = sighTail();
    expect(a.noiseFloor).toBeLessThan(-90);
    expect(a.peak).toBeCloseTo(20 * Math.log10(0.3), 0);
    expect(a.segments[0][0]).toBeCloseTo(0.5, 1);
    const sigh = a.tags[0];
    expect(sigh).toMatchObject({ tag: "[sighs]", nonverbal: true, source: "position" });
    expect(sigh.energy![0]).toBeGreaterThan(1.5);
    expect(sigh.energy![1]).toBeGreaterThan(1.9);
    expect(validateClip(a).problems).toEqual([]);
  });

  it("a sigh that isn't there, a clipped clip and a cut-off tail fail validation", () => {
    const samples = concat(silence(0.3), tone(0.4, 0.3), silence(0.6));
    const words = [{ text: "Fine.", start: 0.3, end: 0.7 }];
    expect(validateClip(analyzeClip({ samples, sampleRate: SR, text: "Fine. [sighs]", words })).problems.join()).toMatch(/\[sighs\] not performed/);
    const hot = concat(silence(0.2), Float32Array.from({ length: 4000 }, (_, i) => Math.max(-1, Math.min(1, 1.5 * Math.sin(i / 5)))), silence(0.2));
    expect(validateClip(analyzeClip({ samples: hot, sampleRate: SR, text: "x", words: [] })).problems.join()).toMatch(/clipping/);
    const cut = concat(silence(0.2), Float32Array.from({ length: 8000 }, (_, i) => 0.3 * Math.sin(i / 4)));
    expect(validateClip(analyzeClip({ samples: cut, sampleRate: SR, text: "x", words: [] })).problems.join()).toMatch(/cut off/);
  });
});

describe("edge trim", () => {
  it("keeps the [sighs] tail (the sigh-tail fault) and trims only quiet edges", () => {
    const { a, words } = sighTail();
    const t = autoTrim(a, words);
    expect(t.start).toBeCloseTo(0.44, 2); // 60 ms before the first word
    expect(t.end).toBeGreaterThan(a.tags[0].energy![1] + 0.19); // the whole sigh + padding
    expect(t.end).toBeLessThan(a.duration);
    expect(trimmedProtected(a, words, t)).toEqual([]);
  });

  it("never removes protected energy, across many generated clips", () => {
    const lines = ["Did you run the tests?", "Tests are for people who doubt themselves.", "Okay. Final deploy. What could possibly go wrong?", "No.", "I weigh nothing, I'm literally a cloud!"];
    for (const [i, text] of lines.entries()) {
      const clip = fixtureClip({ id: `l${i}`, text, voice: undefined, speakerIndex: i % 3 });
      const { samples, sampleRate } = readWav(clip.wav);
      const padded = concat(silence(0.1 * i), samples, silence(0.25 * i));
      const words = clip.words.map((w) => ({ ...w, start: w.start + 0.1 * i, end: w.end + 0.1 * i }));
      const a = analyzeClip({ samples: padded, sampleRate, text, words });
      const t = autoTrim(a, words);
      expect(trimmedProtected(a, words, t), text).toEqual([]);
      // Pauses inside the line stay: the window spans first to last word.
      expect(t.start).toBeLessThanOrEqual(words[0].start);
      expect(t.end).toBeGreaterThanOrEqual(words[words.length - 1].end);
    }
  });
});

describe("levels", () => {
  it("brings a line toward the speaker's level, adds deliberate gain, and keeps the peak under -1 dBFS", () => {
    const base = { loudness: -24, peak: -9 } as ClipAnalysis;
    expect(lineGain(base, -20)).toBeCloseTo(4);
    expect(lineGain(base, -20, -6)).toBeCloseTo(-2);
    expect(lineGain({ ...base, peak: -3 }, -20)).toBeCloseTo(2); // capped by the peak
    expect(lineGain(base, -40)).toBeCloseTo(-12); // never more than -12 dB
  });
});

describe("speech-to-text comparison", () => {
  it("measures word errors, ignoring case, punctuation and tags", () => {
    expect(wordErrorRate("[sighs] I weigh nothing. I'm literally a cloud.", "I weigh nothing, I'm literally a cloud")).toBe(0);
    expect(wordErrorRate("Duck. Now.", "Doug now")).toBe(0.5);
    expect(wordErrorRate("Relax! Just press Control Z.", "")).toBe(1);
  });
});

describe("takes", () => {
  it("take 0 keeps every existing cache key; other takes vary seed or rate", () => {
    const v = { elevenlabs: { voiceId: "abc" } };
    expect(voiceFingerprint(voiceRequest("elevenlabs", "Hi.", v, 0, 0))).toBe(voiceFingerprint(voiceRequest("elevenlabs", "Hi.", v, 0)));
    expect(voiceFingerprint(voiceRequest("elevenlabs", "Hi.", v, 0, 1))).not.toBe(voiceFingerprint(voiceRequest("elevenlabs", "Hi.", v, 0)));
    expect(takeSeed("Hi.", 0)).toBe(parseInt(hashString("Hi.").slice(0, 7), 16)); // the seed every cached clip used
    expect(takeSeed("Hi.", 1)).not.toBe(takeSeed("Hi."));
    const sys = voiceRequest("system", "Hi.", { system: "X", rate: 1 }, 0, 1);
    expect(sys).toMatchObject({ rate: 0, take: 1 });
    expect(takeKey("l3", 0)).toBe("l3");
    expect(takeKey("l3", 2)).toBe("l3#2");
  });
});

// ---------------------------------------------------------------- end to end on a temp repo (fixture voices)

const tmpRepo = (episode: object) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rs-m4-"));
  fs.mkdirSync(path.join(root, "videos", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "videos", "demo", "episode.json"), JSON.stringify(episode));
  return root;
};
const demo = (extra: object = {}, dialogue: object[] = [{ id: "l1", speaker: "rayan", text: "Did you run the tests?" }, { id: "l2", speaker: "claude", text: "Of course not." }]) => ({
  id: "demo",
  title: "demo",
  engine: 2,
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan" }, claude: { actor: "claude" } },
  dialogue,
  camera: [{ at: 0, shot: "establishing" }],
  ...extra,
});
const quiet = { log: () => {}, stt: false } as const;

describe("voice generation with takes and analysis", () => {
  it("generates takes as <id>#n with analysis, selects one, keeps them while the line lives", async () => {
    const root = tmpRepo(demo());
    const r1 = await generateVoices("demo", { ...quiet, provider: "fixture", root, takes: { l1: 3 } });
    expect(r1.generated).toBe(4);
    const m = readManifest(root, "demo")!;
    expect(Object.keys(m.lines).sort()).toEqual(["l1", "l1#1", "l1#2", "l2"]);
    for (const e of Object.values(m.lines)) expect(e.analysis?.v).toBe(1);
    expect(m.lines["l1#2"].take).toBe(2);
    expect(m.lines["l1#1"].file).not.toBe(m.lines.l1.file);
    // A later run without --takes keeps the takes (they may have been paid for) and generates nothing.
    const r2 = await generateVoices("demo", { ...quiet, provider: "fixture", root });
    expect(r2.generated).toBe(0);
    expect(Object.keys(readManifest(root, "demo")!.lines)).toContain("l1#2");
    // Selecting take 2 plays its file.
    const ep = demo({}, [{ id: "l1", speaker: "rayan", text: "Did you run the tests?", take: { n: 2, by: "director", why: "the dry one" } }, { id: "l2", speaker: "claude", text: "Of course not." }]);
    const r = resolveEpisode(ep, readManifest(root, "demo"));
    expect(r.lines[0]).toMatchObject({ take: 2, takeChoice: { by: "director" }, file: m.lines["l1#2"].file });
    // Removing the line removes its takes.
    fs.writeFileSync(path.join(root, "videos", "demo", "episode.json"), JSON.stringify(demo({}, [{ id: "l2", speaker: "claude", text: "Of course not." }])));
    await generateVoices("demo", { ...quiet, provider: "fixture", root });
    expect(Object.keys(readManifest(root, "demo")!.lines)).toEqual(["l2"]);
  });

  it("backfills analysis for cached clips without generating anything", async () => {
    const root = tmpRepo(demo());
    await generateVoices("demo", { ...quiet, provider: "fixture", root });
    const file = path.join(root, "public", "videos", "demo", "voice.json");
    const m = JSON.parse(fs.readFileSync(file, "utf8")) as VoiceManifest;
    for (const e of Object.values(m.lines)) delete e.analysis;
    fs.writeFileSync(file, JSON.stringify(m));
    const r = await generateVoices("demo", { ...quiet, provider: "fixture", root });
    expect(r).toMatchObject({ generated: 0, analysed: 2 });
  });

  it("refuses a paid run over --max-credits before any request", async () => {
    const root = tmpRepo(demo());
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("{}", { status: 500 });
    }) as typeof fetch;
    await expect(generateVoices("demo", { ...quiet, provider: "elevenlabs", root, apiKey: "test", fetchImpl, maxCredits: 10 })).rejects.toThrow(/over --max-credits 10/);
    expect(calls).toBe(0);
  });
});

// ---------------------------------------------------------------- the resolver: trim, levels, speech motion, captions

/** A manifest line around synthetic samples (analysis included). */
const entry = (text: string, samples: Float32Array, words: Word[], file: string): VoiceLine => ({
  file,
  hash: "x",
  provider: "fixture",
  text,
  duration: samples.length / SR,
  words,
  envelope: envelopeFromSamples(samples, SR, 60),
  analysis: analyzeClip({ samples, sampleRate: SR, text, words }),
});

const twoLines = () => {
  const loud = concat(silence(0.4), tone(0.5, 0.4), silence(0.5));
  const soft = concat(silence(0.4), tone(0.5, 0.1), silence(0.5));
  const w = [{ text: "Hey.", start: 0.4, end: 0.9 }];
  const manifest: VoiceManifest = { version: 1, lines: { l1: entry("Hey.", loud, w, "videos/demo/voice/l1.wav"), l2: entry("Hey.", soft, w, "videos/demo/voice/l2.wav") } };
  const dialogue = [
    { id: "l1", speaker: "rayan", text: "Hey.", at: 1 },
    { id: "l2", speaker: "rayan", text: "Hey.", at: 4 },
  ];
  return { manifest, dialogue };
};

describe("resolved voice (engine-2 corrections)", () => {
  it("trims, levels and scales speech on engine 2; engine 1 is untouched", () => {
    const { manifest, dialogue } = twoLines();
    const e2 = resolveEpisode(demo({}, dialogue), manifest);
    const [a, b] = e2.lines;
    expect(a.clip!.from).toBeCloseTo(Math.floor((0.4 - 0.06) * 30) / 30, 5);
    expect(a.clip!.to).toBeCloseTo(1.1, 2);
    expect(a.words[0].start).toBeCloseTo(0.4 - a.clip!.from, 5);
    expect(a.end - a.start).toBeCloseTo(a.clip!.to - a.clip!.from, 5);
    expect(a.envelope.values.length).toBeLessThan(manifest.lines.l1.envelope.values.length);
    // Levels: the two lines end within ±1.5 LU of each other.
    const after = [manifest.lines.l1.analysis!.loudness + (a.gain ?? 0), manifest.lines.l2.analysis!.loudness + (b.gain ?? 0)];
    expect(Math.abs(after[0] - after[1])).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after[0] - after[1])).toBeLessThan(Math.abs(manifest.lines.l1.analysis!.loudness - manifest.lines.l2.analysis!.loudness));
    // Speech motion: the quiet line moves the mouth less.
    expect(a.talkScale).toBe(1);
    expect(b.talkScale!).toBeLessThan(0.4);
    const rayan = buildTracks(e2).find((t) => t.id === "rayan")!;
    const peak = (from: number, to: number) => Math.max(...Array.from({ length: 60 }, (_, i) => rayan.talk!(from + ((to - from) * i) / 60)));
    expect(peak(b.start, b.end)).toBeLessThan(peak(a.start, a.end) * 0.5);
    // Engine 1 with the same manifest: no clip, gain or scale, and the mouths are as big as before.
    const e1 = resolveEpisode({ ...demo({}, dialogue), engine: 1 }, manifest);
    for (const l of e1.lines) expect([l.clip, l.gain, l.talkScale]).toEqual([undefined, undefined, undefined]);
    const r1 = buildTracks(e1).find((t) => t.id === "rayan")!;
    const peak1 = (l: (typeof e1.lines)[number]) => Math.max(...Array.from({ length: 60 }, (_, i) => r1.talk!(l.start + ((l.end - l.start) * i) / 60)));
    expect(peak1(e1.lines[1])).toBeCloseTo(peak1(e1.lines[0]), 1);
    expect(r1.talkBody).toBeUndefined();
  });

  it("the body follows a slower envelope than the mouth", () => {
    const syllables = concat(silence(0.4), tone(0.15, 0.3), silence(0.06), tone(0.15, 0.3), silence(0.06), tone(0.2, 0.3), silence(0.06), tone(0.15, 0.3), silence(0.5));
    const w = [{ text: "Abracadabra.", start: 0.4, end: 1.23 }];
    const manifest: VoiceManifest = { version: 1, lines: { l1: entry("Abracadabra.", syllables, w, "videos/demo/voice/l1.wav") } };
    const t = buildTracks(resolveEpisode(demo({}, [{ id: "l1", speaker: "rayan", text: "Abracadabra.", at: 1 }]), manifest)).find((x) => x.id === "rayan")!;
    const rough = (f: (x: number) => number) => {
      let s = 0;
      for (let x = 0.8; x < 2; x += 1 / 60) s += Math.abs(f(x + 1 / 60) - f(x));
      return s;
    };
    expect(rough(t.talkBody!)).toBeLessThan(rough(t.talk!));
  });

  it("`trim: false` and switching the correction off keep the whole file; a hand trim into a word warns", () => {
    const { manifest, dialogue } = twoLines();
    const off = resolveEpisode(demo({}, [{ ...dialogue[0], trim: false }, dialogue[1]]), manifest);
    expect(off.lines[0].clip).toBeUndefined();
    expect(resolveEpisode(demo({ defaults: { trim: false, level: false, speechMotion: false } }, dialogue), manifest).lines.every((l) => !l.clip && !l.gain && !l.talkScale)).toBe(true);
    const hand = resolveEpisode(demo({}, [{ ...dialogue[0], trim: { start: 0.6 } }, dialogue[1]]), manifest);
    expect(hand.lines[0].clip!.from).toBeCloseTo(0.6, 5);
    expect(hand.warnings.join("\n")).toMatch(/l1: trim 0\.60–.* cuts into/);
  });

  it("a caption override changes what's shown, not the words that time things", () => {
    const { manifest, dialogue } = twoLines();
    const r = resolveEpisode(demo({}, [{ ...dialogue[0], caption: "Hey!!" }, dialogue[1]]), manifest);
    expect(r.lines[0].words[0].text).toBe("Hey.");
    expect(r.lines[0].display![0].text).toBe("Hey!!");
    expect(captionPages(r)[0].tokens.map((t) => t.text.trim())).toEqual(["Hey!!"]);
  });
});

describe("take report and findings", () => {
  it("validates takes, picks by measurement with a stated reason, and asks for a recorded choice", () => {
    const good = sighTail();
    const bad = analyzeClip({ samples: concat(silence(0.5), tone(0.3, 0.3), silence(0.06), tone(0.35, 0.3), silence(0.9)), sampleRate: SR, text: good.text, words: good.words });
    const env = envelopeFromSamples(good.samples, SR, 60);
    const mk = (a: ClipAnalysis, take?: number): VoiceLine => ({ file: "x.wav", hash: "h", provider: "fixture", text: good.text, duration: a.duration, words: good.words, envelope: env, analysis: a, ...(take ? { take } : {}) });
    const manifest: VoiceManifest = { version: 1, lines: { l1: mk(bad), "l1#1": mk(good.a, 1) } };
    const r = resolveEpisode(demo({}, [{ id: "l1", speaker: "rayan", text: good.text }]), manifest);
    const lt = lineTakes(r, manifest)[0];
    expect(lt.takes.map((t) => t.validation.ok)).toEqual([false, true]);
    expect(measuredPick(lt)).toMatchObject({ take: 1, why: expect.stringMatching(/^measured, not heard/) });
    const f = voiceFindings(r, manifest);
    expect(f.warnings.join()).toMatch(/line l1: \[sighs\] not performed/);
    expect(f.notes.join()).toMatch(/l1 has 2 takes and no recorded choice/);
    expect(f.notes.join()).toMatch(/not checked by speech-to-text/);
  });
});
