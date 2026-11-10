import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captionPages } from "../src/engine/audio/captionLayout";
import { envelopeFromSamples, lineCaptions, lineHash, splitWords, voiceFingerprint, voiceRequest, voiceStaleReason, wordsFromAlignment } from "../src/engine/audio/speech";
import { elevenLabsClip, elevenLabsRequest, fixtureClip, generateVoices, parseProvider, readWav, writeWav } from "../scripts/voice";

const tmpRepo = (episode: object) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rs-voice-"));
  fs.mkdirSync(path.join(root, "videos", "demo"), { recursive: true });
  fs.writeFileSync(path.join(root, "videos", "demo", "episode.json"), JSON.stringify(episode));
  return root;
};

const episode = (lines: { id: string; speaker: string; text: string }[]) => ({
  id: "demo",
  title: "demo",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan" }, claude: { actor: "claude" } },
  dialogue: lines,
  camera: [{ at: 0, shot: "establishing" }],
});

describe("audio helpers", () => {
  it("round-trips WAV and finds speech in the envelope", () => {
    const sr = 16000;
    const s = new Float32Array(sr); // 1 s: silence, 0.4 s tone, silence
    for (let i = Math.round(0.3 * sr); i < Math.round(0.7 * sr); i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / sr);
    const back = readWav(writeWav(s, sr));
    expect(back.sampleRate).toBe(sr);
    expect(back.samples.length).toBe(sr);
    const env = envelopeFromSamples(back.samples, sr, 60);
    expect(env.values[Math.round(0.5 * 60)]).toBeGreaterThan(0.8);
    expect(env.values[Math.round(0.1 * 60)]).toBe(0);
    expect(env.values[Math.round(0.9 * 60)]).toBe(0);
  });

  it("turns character alignment into words and captions", () => {
    const text = "Hi there, Rayan";
    const chars = [...text];
    const starts = chars.map((_, i) => i * 0.05);
    const words = wordsFromAlignment({ characters: chars, character_start_times_seconds: starts, character_end_times_seconds: starts.map((s) => s + 0.05) });
    expect(words.map((w) => w.text)).toEqual(["Hi", "there,", "Rayan"]);
    expect(words[1].start).toBeCloseTo(0.15);
    const caps = lineCaptions(words, 10);
    expect(caps[0]).toMatchObject({ text: "Hi", startMs: 10000 });
    expect(caps[1].text).toBe(" there,");
  });

  it("fixture voices are deterministic and word-timed", () => {
    const job = { id: "l1", text: "Did you run the tests?", voice: undefined, speakerIndex: 1 };
    const a = fixtureClip(job);
    const b = fixtureClip(job);
    expect(a.wav.equals(b.wav)).toBe(true);
    expect(a.words.map((w) => w.text)).toEqual(["Did", "you", "run", "the", "tests?"]);
    for (let i = 1; i < a.words.length; i++) expect(a.words[i].start).toBeGreaterThanOrEqual(a.words[i - 1].end);
  });
});

describe("ElevenLabs (mocked HTTP, documented response shape)", () => {
  it("builds the with-timestamps request and parses audio + alignment", async () => {
    const job = { id: "l1", text: "Ship it", voice: { elevenlabs: { voiceId: "VOICE123", model: "eleven_v3" } }, speakerIndex: 0 };
    const req = elevenLabsRequest(job, "KEY");
    expect(req.url).toBe("https://api.elevenlabs.io/v1/text-to-speech/VOICE123/with-timestamps?output_format=wav_24000");
    expect((req.init.headers as Record<string, string>)["xi-api-key"]).toBe("KEY");
    expect(JSON.parse(req.init.body as string)).toMatchObject({ text: "Ship it", model_id: "eleven_v3" });

    const wav = writeWav(new Float32Array(24000), 24000);
    const chars = [..."Ship it"];
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          audio_base64: wav.toString("base64"),
          alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;
    const clip = await elevenLabsClip(job, "KEY", fakeFetch);
    expect(readWav(clip.wav).sampleRate).toBe(24000);
    expect(clip.words.map((w) => w.text)).toEqual(["Ship", "it"]);
  });

  it("surfaces API errors", async () => {
    const fakeFetch = (async () => new Response("quota exceeded", { status: 401 })) as unknown as typeof fetch;
    await expect(elevenLabsClip({ id: "x", text: "a", voice: undefined, speakerIndex: 0 }, "KEY", fakeFetch)).rejects.toThrow(/401/);
  });
});

describe("cost safety", () => {
  const lines = [{ id: "l1", speaker: "rayan", text: "Hello there." }];
  const neverFetch = (async () => {
    throw new Error("network must not be used");
  }) as unknown as typeof fetch;

  it("a key alone never switches to paid voices", async () => {
    const root = tmpRepo(episode(lines));
    const r = await generateVoices("demo", { root, apiKey: "KEY", fetchImpl: neverFetch, log: () => {} });
    expect(r.provider).not.toBe("elevenlabs");
  });

  it("rejects an unknown provider instead of falling back to fixture", () => {
    expect(() => parseProvider("elevenlab")).toThrow(/unknown provider/);
    expect(() => parseProvider("")).toThrow(/unknown provider/);
    expect(parseProvider(undefined)).toBeUndefined();
  });

  it("an ElevenLabs-voiced episode needs the explicit flag before buying changed lines", async () => {
    const root = tmpRepo(episode(lines));
    const fake = (async () => {
      const chars = [..."Hello there."];
      return new Response(JSON.stringify({ audio_base64: writeWav(new Float32Array(2400), 24000).toString("base64"), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.01), character_end_times_seconds: chars.map((_, i) => i * 0.01 + 0.01) } }), { status: 200 });
    }) as unknown as typeof fetch;
    await generateVoices("demo", { root, provider: "elevenlabs", apiKey: "KEY", fetchImpl: fake, log: () => {} });
    // Unchanged: no flag needed, nothing bought.
    expect(await generateVoices("demo", { root, apiKey: "KEY", fetchImpl: neverFetch, log: () => {} })).toMatchObject({ provider: "elevenlabs", generated: 0 });
    fs.writeFileSync(path.join(root, "videos", "demo", "episode.json"), JSON.stringify(episode([{ ...lines[0], text: "Hello again." }])));
    await expect(generateVoices("demo", { root, apiKey: "KEY", fetchImpl: neverFetch, log: () => {} })).rejects.toThrow(/explicit flag/);
  });

  it("prompted sound effects also need the explicit flag (unchanged dialogue doesn't open the paid path)", async () => {
    const root = tmpRepo(episode(lines));
    const fake = (async () => {
      const chars = [..."Hello there."];
      return new Response(JSON.stringify({ audio_base64: writeWav(new Float32Array(2400), 24000).toString("base64"), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.01), character_end_times_seconds: chars.map((_, i) => i * 0.01 + 0.01) } }), { status: 200 });
    }) as unknown as typeof fetch;
    await generateVoices("demo", { root, provider: "elevenlabs", apiKey: "KEY", fetchImpl: fake, log: () => {} });
    fs.writeFileSync(path.join(root, "videos", "demo", "episode.json"), JSON.stringify({ ...episode(lines), sfx: [{ at: 0, sound: "sfx/boom.mp3", prompt: "a boom" }] }));
    await expect(generateVoices("demo", { root, apiKey: "KEY", fetchImpl: neverFetch, log: () => {} })).rejects.toThrow(/sfx "sfx\/boom.mp3" needs paid ElevenLabs generation/);
    await expect(generateVoices("demo", { root, provider: "elevenlabs", apiKey: "", fetchImpl: neverFetch, log: () => {} })).rejects.toThrow(/ELEVENLABS_API_KEY is not set/);
  });

  it("keeps already-generated clips in the manifest when a later line fails", async () => {
    const two = [lines[0], { id: "l2", speaker: "claude", text: "Second line." }];
    const root = tmpRepo(episode(two));
    let calls = 0;
    const flaky = (async (url: string) => {
      if (url.includes("/user/subscription")) return new Response(JSON.stringify({ tier: "free", character_count: 0, character_limit: 10000 }), { status: 200 });
      if (calls++ > 0) return new Response(JSON.stringify({ detail: { status: "quota_exceeded", message: "out of credits" } }), { status: 401 });
      return new Response(JSON.stringify({ audio_base64: writeWav(new Float32Array(2400), 24000).toString("base64") }), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(generateVoices("demo", { root, provider: "elevenlabs", apiKey: "KEY", fetchImpl: flaky, log: () => {} })).rejects.toThrow(/401 quota_exceeded/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public", "videos", "demo", "voice.json"), "utf8"));
    expect(Object.keys(manifest.lines)).toEqual(["l1"]);
    expect(manifest.lines.l1).toMatchObject({ provider: "elevenlabs", model: "eleven_v4", tier: "free", scheme: 2 });
    expect(fs.existsSync(path.join(root, "public", manifest.lines.l1.file))).toBe(true);
  });
});

describe("voice fingerprint", () => {
  it("changes with effective defaults, not with other providers' fields", () => {
    const base = voiceRequest("elevenlabs", "Hi", { elevenlabs: { voiceId: "A" } }, 0);
    const otherModel = voiceRequest("elevenlabs", "Hi", { elevenlabs: { voiceId: "A", model: "eleven_multilingual_v2" } }, 0);
    const systemEdit = voiceRequest("elevenlabs", "Hi", { elevenlabs: { voiceId: "A" }, system: "Microsoft Zira Desktop", pitch: "+30%" }, 0);
    expect(voiceFingerprint(base)).not.toBe(voiceFingerprint(otherModel));
    expect(voiceFingerprint(base)).toBe(voiceFingerprint(systemEdit));
    // Default voice follows cast order: reordering the cast changes the audio, so the key changes.
    expect(voiceFingerprint(voiceRequest("elevenlabs", "Hi", undefined, 0))).not.toBe(voiceFingerprint(voiceRequest("elevenlabs", "Hi", undefined, 1)));
  });

  it("names why a cached clip is stale and accepts legacy clips that still match", () => {
    const req = voiceRequest("elevenlabs", "Hi", { elevenlabs: { voiceId: "A" } }, 0);
    const entry = { file: "x.wav", hash: voiceFingerprint(req), scheme: 2 as const, provider: "elevenlabs" as const, text: "Hi", duration: 1, words: [], envelope: { rate: 60, values: [] }, model: req.provider === "elevenlabs" ? req.model : "" };
    expect(voiceStaleReason(entry, "Hi", { elevenlabs: { voiceId: "A" } }, 0)).toBeNull();
    expect(voiceStaleReason(entry, "Hi", { elevenlabs: { voiceId: "A", model: "eleven_multilingual_v2" } }, 0)).toMatch(/model changed \(eleven_v4 → eleven_multilingual_v2\)/);
    expect(voiceStaleReason(entry, "Hello", { elevenlabs: { voiceId: "A" } }, 0)).toBe("text changed");
    const legacy = { file: "y.wav", hash: lineHash("Hi", { system: "David" }, "system"), provider: "system" as const, text: "Hi", duration: 1, words: [], envelope: { rate: 60, values: [] } };
    expect(voiceStaleReason(legacy, "Hi", { system: "David" }, 0)).toBeNull();
    expect(voiceStaleReason(legacy, "Hi", { system: "Zira" }, 0)).toMatch(/settings changed/);
  });
});

describe("voice cache", () => {
  it("generates once, skips unchanged lines, regenerates edited ones", async () => {
    const lines = [
      { id: "l1", speaker: "rayan", text: "Okay. Final deploy." },
      { id: "l2", speaker: "claude", text: "Did you run the tests?" },
    ];
    const root = tmpRepo(episode(lines));
    const log = () => {};
    const first = await generateVoices("demo", { root, provider: "fixture", log });
    expect(first).toMatchObject({ generated: 2, skipped: 0 });
    const second = await generateVoices("demo", { root, provider: "fixture", log });
    expect(second).toMatchObject({ generated: 0, skipped: 2 });

    fs.writeFileSync(path.join(root, "videos", "demo", "episode.json"), JSON.stringify(episode([lines[0], { ...lines[1], text: "Did you test it?" }])));
    const third = await generateVoices("demo", { root, provider: "fixture", log });
    expect(third).toMatchObject({ generated: 1, skipped: 1 });
    const files = fs.readdirSync(path.join(root, "public", "videos", "demo", "voice"));
    expect(files).toHaveLength(2); // the stale l2 clip was removed
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public", "videos", "demo", "voice.json"), "utf8"));
    expect(manifest.lines.l2.text).toBe("Did you test it?");
    expect(manifest.lines.l2.envelope.values.length).toBeGreaterThan(10);
  });
});

describe("captions", () => {
  it("a line's lingering last page never hides the next line's first words", () => {
    const w = (text: string, start: number, end: number) => ({ text, start, end });
    const lines = [
      { id: "l1", speaker: "a", text: "Hi there.", start: 0, end: 1, words: [w("Hi", 0.1, 0.4), w("there.", 0.45, 0.9)], envelope: { rate: 60, values: [] }, voiced: true },
      { id: "l2", speaker: "b", text: "Nope.", start: 1.05, end: 1.6, words: [w("Nope.", 0, 0.4)], envelope: { rate: 60, values: [] }, voiced: true },
    ];
    const pages = captionPages({ lines, captions: { style: "subtitle", pageSeconds: 1.6 } });
    const at = (ms: number) => pages.find((p) => ms >= p.startMs && ms < p.endMs);
    expect(at(1060)?.speaker).toBe("b"); // used to still show l1's page until 1.2 s
    expect(at(500)?.speaker).toBe("a");
    for (let i = 1; i < pages.length; i++) expect(pages[i].startMs).toBeGreaterThanOrEqual(pages[i - 1].endMs);
  });
});

describe("audio tags (v3/v4 performance cues)", () => {
  it("expressive models get the tags; offline voices, captions and word refs don't", () => {
    const text = "Ship it. [laughs] Okay! [clears throat]";
    const v4 = voiceRequest("elevenlabs", text, undefined, 0);
    expect(v4.text).toBe(text);
    expect(v4.provider === "elevenlabs" && v4.settings).toEqual({ stability: 0.5, similarity_boost: 0.75 });
    expect(voiceRequest("elevenlabs", text, { elevenlabs: { voiceId: "A", model: "eleven_multilingual_v2" } }, 0).text).toBe("Ship it. Okay!");
    expect(voiceRequest("system", text, undefined, 0).text).toBe("Ship it. Okay!");
    expect(splitWords(text)).toEqual(["Ship", "it.", "Okay!"]);
    const chars = [...text];
    const words = wordsFromAlignment({ characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.05) });
    expect(words.map((w) => w.text)).toEqual(["Ship", "it.", "Okay!"]);
  });

  it("v4 only receives the settings it accepts and no stitching", () => {
    const job = { id: "l1", text: "Hi", voice: { elevenlabs: { voiceId: "A", settings: { stability: 1, style: 0.9, speed: 1.2 } } }, speakerIndex: 0, previous: "Before.", next: "After." };
    const body = JSON.parse(elevenLabsRequest(job, "KEY").init.body as string);
    expect(body).toMatchObject({ model_id: "eleven_v4", voice_settings: { stability: 1, similarity_boost: 0.75 } });
    expect(body.voice_settings.style).toBeUndefined();
    expect(body.previous_text).toBeUndefined();
    const v2 = JSON.parse(elevenLabsRequest({ ...job, voice: { elevenlabs: { voiceId: "A", model: "eleven_multilingual_v2" } } }, "KEY").init.body as string);
    expect(v2.previous_text).toBe("Before.");
  });
});

describe("ElevenLabs v4 (real response captured 2026-10-18, audio reduced to its header)", () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "elevenlabs-v4.json"), "utf8"));

  it("is a 24 kHz mono 16-bit WAV, as the pipeline expects", () => {
    const h = Buffer.from(fixture.audio.header_base64, "base64");
    expect(h.toString("ascii", 0, 4) + h.toString("ascii", 8, 12)).toBe("RIFFWAVE");
    expect({ channels: h.readUInt16LE(22), rate: h.readUInt32LE(24), bits: h.readUInt16LE(34) }).toEqual({ channels: 1, rate: 24000, bits: 16 });
    expect(fixture.request).toMatchObject({ model: "eleven_v4", format: "wav_24000" });
  });

  it("alignment includes the [laughs] tag; parsed words skip it and stay monotonic", () => {
    expect(fixture.alignment.characters.join("")).toBe("Ship it. [laughs] Okay!");
    const words = wordsFromAlignment(fixture.alignment);
    expect(words.map((w) => w.text)).toEqual(splitWords(fixture.request.text));
    for (let i = 1; i < words.length; i++) expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].end);
    // The performed laugh sits between "it." and "Okay!".
    expect(words[2].start - words[1].end).toBeGreaterThan(0.5);
  });
});

