// `new`: scaffold a video folder (BRIEF.md, episode.json, index.tsx, optional video.data.ts) and register it.
import fs from "node:fs";
import path from "node:path";
import { ENVIRONMENTS } from "../../src/engine/world/environments";
import { fail, flag, positional, ROOT, videoDir } from "./shared";

const BRIEF = (title: string, preset: string, env: string) => `# ${title} — brief

> Write this before episode.json, keep it short, and update it as the idea changes. It is the intent;
> episode.json and custom code are the executable direction.

**Concept (one line):**
**Platform / format:** ${preset === "portrait" ? "9:16 Shorts / Reels / TikTok" : preset === "square" ? "1:1 feed" : "16:9 YouTube"} · target ~15–35 s
**Audience:** developers and AI-curious viewers

## Hook (0–2 s)
What stops the scroll in the first second? (visual surprise, a sound hit, a line that raises a question)

## Beats
1. Setup —
2. Escalation —
3. Twist / payoff —

## Characters & performance
- Rayan:
- Claude:

## Setting & look
Environment: \`${env}\`. Mood, key props, screens, camera style (cuts, inserts, moves), on-screen graphics.

## Sound
Voices (provider, tags like [laughs]), SFX hits on the jokes, music (or none), silence used on purpose.

## Reuse vs custom
Reused: environments / props / recipes / fx / sfx from the engine. Custom: anything new in this folder.

## Payoff check
Why would someone rewatch or share it? What is the last image?
`;

const CUSTOM_DATA = (slug: string) => `// Pure data for this video's own location (the CLI loads it for validate/stills). Edit freely:
// shell, items (catalog props or the custom kinds below), marks for the cast, camera spots, bounds.
import type { EnvironmentDef, VideoData } from "../../src/engine";

const stage: EnvironmentDef = {
  id: "${slug}-stage",
  description: "TODO: describe this place.",
  shell: { floor: "#1f2433", wall: "#151a26", trim: "#10141d", back: -3, left: -7, height: 5, walls: { back: false, left: false } },
  items: [{ id: "backdrop", kind: "backdrop", position: [0, 0, -2.6], size: [12, 5, 0.2] }],
  marks: {
    hero: { position: [-0.6, 0, 0], yaw: 15, description: "Main character spot" },
    sidekick: { position: [0.7, 0, 0.2], yaw: -20, description: "Second character spot" },
  },
  cameras: { wide: { position: [0, 1.6, 6.5], target: [0, 1.0, 0], fov: 40, description: "Whole stage" } },
  bounds: { min: [-6, 0.1, -2.4], max: [6, 5, 12] },
  defaultMood: "soft-studio",
};

const data: VideoData = { environments: { [stage.id]: stage }, componentKinds: ["backdrop"] };
export default data;
`;

const CUSTOM_INDEX = `import { defineVideo, type PropViewProps } from "../../src/engine";
import episode from "./episode.json";
import data from "./video.data";

// Custom set item kinds for this location (placed in video.data.ts). Animate only from props.t.
const Backdrop: React.FC<PropViewProps> = () => (
  <mesh position={[0, 2.5, 0]} receiveShadow>
    <boxGeometry args={[12, 5, 0.2]} />
    <meshStandardMaterial color="#232a3d" roughness={0.9} />
  </mesh>
);

// More escape hatches: screens (custom screen presets), actors, scene (extra 3D), overlay (extra 2D).
export default defineVideo({ episode, ...data, components: { backdrop: Backdrop } });
`;

export const newVideo = () => {
  const slug = positional[1];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail("usage: new <kebab-case-slug> [--preset portrait|landscape|square] [--env <environment>|custom] [--title ...]");
  const dir = videoDir(slug);
  if (fs.existsSync(dir)) fail(`videos/${slug} already exists`);
  const preset = flag("preset") ?? "portrait";
  if (!["portrait", "landscape", "square"].includes(preset)) fail(`unknown preset "${preset}"`);
  const envFlag = flag("env") ?? "dev-office";
  const custom = envFlag === "custom";
  const envId = custom ? `${slug}-stage` : envFlag;
  const env = custom ? null : ENVIRONMENTS[envId];
  if (!custom && !env) fail(`unknown environment "${envId}" (${Object.keys(ENVIRONMENTS).join(", ")}, or "custom" for a new location in the video folder)`);
  // Cast on the environment's first two marks: "seat"/"chair" marks get a seated pose; a mascot on a
  // raised mark (a desk, a key) stays small, on the floor it is scaled up to stand next to Rayan.
  const marks = custom ? [["hero", { position: [-0.6, 0, 0] }], ["sidekick", { position: [0.7, 0, 0.2] }]] : Object.entries(env!.marks);
  const [hero, partner] = [marks[0], marks[1]] as [string, { position: number[] }][];
  const seated = !!hero && /seat|chair/.test(hero[0]);
  const raised = !!partner && partner[1].position[1] > 0.3;
  fs.mkdirSync(dir, { recursive: true });
  const episode = {
    $schema: "../../catalog/episode.schema.json",
    id: slug,
    title: flag("title") ?? slug,
    // Current engine behaviour and the profile's checks, written out so they are visible and editable.
    engine: 2,
    profile: "standard",
    format: { preset },
    set: { environment: envId },
    cast: {
      rayan: { actor: "rayan", at: hero?.[0] ?? [-0.6, 0, 0], pose: seated ? "sit_typing" : "stand_idle", voice: { system: "Microsoft David Desktop" } },
      claude: { actor: "claude", at: partner?.[0] ?? [0.7, 0, 0.2], scale: raised ? 1.5 : 4, voice: { system: "Microsoft Zira Desktop", pitch: "+30%" } },
    },
    dialogue: [
      { id: "l1", speaker: "rayan", text: "Hello world." },
      { id: "l2", speaker: "claude", text: "Hello, Rayan." },
    ],
    actions: [
      { at: "l1.start", actor: "claude", look: "rayan" },
      { at: "l2.start", actor: "rayan", look: "claude", emotion: "happy", ...(seated ? { pose: "sit_idle" } : {}) },
    ],
    camera: [
      { at: 0, shot: "close", subject: "rayan" },
      { at: "l1.end", shot: "medium", subject: "claude" },
      { at: "l2.start", shot: "over-shoulder", subject: "claude", over: "rayan" },
    ],
  };
  fs.writeFileSync(path.join(dir, "episode.json"), JSON.stringify(episode, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "BRIEF.md"), BRIEF(flag("title") ?? slug, preset, envId));
  if (custom) {
    fs.writeFileSync(path.join(dir, "video.data.ts"), CUSTOM_DATA(slug));
    fs.writeFileSync(path.join(dir, "index.tsx"), CUSTOM_INDEX);
  } else {
    fs.writeFileSync(
      path.join(dir, "index.tsx"),
      `import { defineVideo } from "../../src/engine";\nimport episode from "./episode.json";\n\n// Add custom code here: components (custom set items), screens, actors, scene, overlay.\nexport default defineVideo({ episode });\n`,
    );
  }
  const reg = path.join(ROOT, "videos", "registry.ts");
  const ident = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/^[0-9]/, (c) => `v${c}`);
  let src = fs.readFileSync(reg, "utf8");
  src = src.replace(/(\nexport const VIDEOS)/, `import ${ident} from "./${slug}";\n$1`).replace(/(VIDEOS: VideoModule\[\] = \[)([^\]]*)\]/, (_, a: string, b: string) => `${a}${b.trim() ? `${b.trim()}, ` : ""}${ident}]`);
  fs.writeFileSync(reg, src);
  console.log(`✔ created videos/${slug}/ (BRIEF.md, episode.json, index.tsx${custom ? ", video.data.ts" : ""}) and registered it.`);
  console.log(`Next: fill BRIEF.md (hook, beats, payoff) → direct episode.json → npm run cli -- voice ${slug} → validate → stills → render`);
};
