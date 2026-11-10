// Factory layer: sidecar captions, the offline espeak voice request, and render profiles.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { voiceFingerprint, voiceRequest, VOICE_PROVIDERS } from "../src/engine/audio/speech";
import { writeSidecars } from "../scripts/cli/factory";
import { resolveVideo } from "../scripts/video";

describe("factory", () => {
  it("writes SRT and WebVTT sidecars from the resolved line timings", async () => {
    const { resolved } = await resolveVideo(process.cwd(), "it-works-on-my-machine");
    const base = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vf-")), "x");
    writeSidecars(resolved, base);
    const srt = fs.readFileSync(`${base}.srt`, "utf8");
    const vtt = fs.readFileSync(`${base}.vtt`, "utf8");
    expect(srt.split("\n\n").filter(Boolean)).toHaveLength(resolved.lines.length);
    expect(srt).toMatch(/^1\n00:00:02,400 --> 00:00:0\d,\d{3}\nRayan: Okay\. Final deploy\./);
    expect(vtt.startsWith("WEBVTT\n\n00:00:02.400 --> ")).toBe(true);
    expect(vtt).toContain("<v Claude>Did you run the tests?");
    // Cues are ordered and never overlap.
    const times = [...srt.matchAll(/(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})/g)].map((m) => [Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000, Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000]);
    times.forEach(([a, b], i) => {
      expect(b).toBeGreaterThan(a);
      if (i) expect(a).toBeGreaterThanOrEqual(times[i - 1][1]);
    });
  });

  it("offers espeak as an offline provider with distinct voices per speaker and a stable cache key", () => {
    expect(VOICE_PROVIDERS).toContain("espeak");
    const a = voiceRequest("espeak", "Hello [laughs] there", undefined, 0);
    const b = voiceRequest("espeak", "Hello [laughs] there", undefined, 1);
    expect(a.text).toBe("Hello there");
    expect(a).not.toEqual(b);
    expect(voiceFingerprint(a)).toBe(voiceFingerprint(voiceRequest("espeak", "Hello [laughs] there", undefined, 0)));
    expect(voiceFingerprint(a)).not.toBe(voiceFingerprint(b));
  });

  it("has the three render profiles the docs describe", () => {
    const profiles = JSON.parse(fs.readFileSync("factory/profiles.json", "utf8")) as Record<string, { engine: string; percent: number }>;
    expect(Object.keys(profiles)).toEqual(["final", "draft", "blocking"]);
    expect(profiles.final.percent).toBe(100);
  });
});
