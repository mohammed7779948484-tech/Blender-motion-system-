// Voice commands: generate/cache dialogue clips (+ takes, analysis, speech-to-text), check the ElevenLabs
// account (free calls), and look at / listen to clips: --show (waveform strip), --audition, --report.
import { elevenLabsAccount, generateVoices, parseProvider, readManifest } from "../voice";
import { auditionLine, reportTakes, showLine } from "../voiceTools";
import { fail, flag, has, positional, resolve, ROOT } from "./shared";

const voiceCheck = async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) fail("ELEVENLABS_API_KEY is not set (put it in .env)");
  const a = await elevenLabsAccount(key!);
  console.log(`ElevenLabs plan: ${a.tier}${a.limit !== null ? ` — ${a.used}/${a.limit} credits used this period (${a.limit - (a.used ?? 0)} left)` : ""}`);
  const v4 = a.models.filter((m) => m.id.startsWith("eleven_v4"));
  console.log(`models: ${a.models.length} (${v4.length ? v4.map((m) => `${m.id}${m.tts ? " tts" : ""}${m.maxChars ? ` ≤${m.maxChars} chars` : ""}`).join(", ") : "no eleven_v4 model visible"})`);
  console.log(`voices usable by this key: ${a.voices.length}`);
  for (const v of a.voices) console.log(`  ${v.id}  ${v.name.padEnd(28)} ${v.category.padEnd(10)} ${Object.values(v.labels).join(", ")}`);
  for (const n of a.notes) console.log(`⚠ ${n}`);
  if (a.tier === "free") console.log("⚠ free plan: audio is non-commercial (also after upgrading) and published titles must credit elevenlabs.io");
};

const USAGE = "usage: voice <slug> [--provider elevenlabs|system|fixture] [--force] [--takes l3=3,l5=2] [--max-credits N] [--no-stt] [--analyze]  |  voice <slug> --show l3[#1] | --audition l3 | --report  |  voice --check";

/** "l3=3,l5=2" → { l3: 3, l5: 2 } (total takes per line, take 0 included). */
const parseTakes = (v: string | undefined) => {
  if (v === undefined) return undefined;
  const out: Record<string, number> = {};
  for (const part of v.split(",")) {
    const m = /^([A-Za-z][\w-]*)=(\d+)$/.exec(part.trim());
    if (!m || Number(m[2]) < 1) fail(`--takes: "${part}" should look like l3=3`);
    out[m![1]] = Number(m![2]);
  }
  return out;
};

export const voice = async () => {
  if (has("check")) return voiceCheck();
  const slug = positional[1] ?? fail(USAGE);
  const manifest = () => readManifest(ROOT, slug) ?? fail(`no voice manifest for ${slug}: run \`npm run cli -- voice ${slug}\` first`);
  if (flag("show")) {
    const [id, take] = flag("show")!.split("#");
    console.log(`✔ waveform strip → ${showLine(ROOT, slug, manifest(), id, Number(take ?? 0))} (words blue, tags orange/purple with their energy, sound green, floor yellow, trim red)`);
    return;
  }
  if (flag("audition")) {
    const a = auditionLine(ROOT, slug, manifest(), flag("audition")!);
    console.log(`✔ audition → ${a.file}: takes ${a.takes.join(", ")}, each announced by (take + 1) beeps. Listen, then set "take": { "n": …, "by": "director", "why": "…" } on the line.`);
    return;
  }
  if (has("report")) {
    const { resolved } = await resolve(slug);
    const ep = (await import("../voice")).loadEpisodeFile(ROOT, slug);
    // A slot exists only when the next line's start doesn't follow from this line (absolute, or timed off another line).
    const pinned = (next: string, line: string) => {
      const at = ep.dialogue.find((d) => d.id === next)?.at;
      return typeof at === "number" || (typeof at === "string" && !at.startsWith(`${line}.`));
    };
    for (const line of reportTakes(resolved, manifest(), pinned)) console.log(line);
    return;
  }
  const maxCredits = flag("max-credits");
  const r = await generateVoices(slug, { provider: parseProvider(flag("provider")), force: has("force"), saveResponse: flag("save-response"), takes: parseTakes(flag("takes")), maxCredits: maxCredits === undefined ? undefined : Number(maxCredits), stt: !has("no-stt"), analyze: has("analyze") });
  console.log(`✔ voice (${r.provider}): ${r.generated} generated, ${r.skipped} cached, ${r.analysed} analysed, ${r.transcribed} checked by speech-to-text → public/videos/${slug}/voice.json`);
};
