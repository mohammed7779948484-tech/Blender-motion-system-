// Builds the agent-facing catalog (catalog/*.json) from the engine's code, so manifests always
// describe what actually exists. `npm run catalog` writes it; tests fail if it is stale.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ACTOR_DEFS } from "../src/engine/actors/defs";
import { restChannels, type ActorDefinition } from "../src/engine/actors/rig";
import { SFX_INFO } from "../src/engine/audio/sfx.data";
import { MOVES, SHOT_TYPES } from "../src/engine/camera/solve";
import { ENGINE_VERSIONS, INTENTS, PROFILES } from "../src/engine/core/behaviour";
import { FX_INFO, FxSchemas } from "../src/engine/core/fx";
import { EpisodeSchema } from "../src/engine/core/schema";
import { MOODS } from "../src/engine/lighting/moods";
import { ENVIRONMENTS } from "../src/engine/world/environments";
import { PROPS } from "../src/engine/world/props.data";
import { SCREEN_PRESETS } from "../src/engine/world/Screen";

const round = (v: number) => Math.round(v * 1000) / 1000;

export const actorManifest = (def: ActorDefinition) => {
  const anchors = def.anchors(restChannels(def));
  return {
    id: def.id,
    name: def.name,
    kind: def.kind,
    description: def.description,
    size: def.size,
    defaultPose: def.defaultPose,
    defaultEmotion: def.defaultEmotion,
    walk: def.walk,
    poses: Object.fromEntries(Object.entries(def.poses).map(([k, v]) => [k, v.description])),
    emotions: Object.fromEntries(Object.entries(def.emotions).map(([k, v]) => [k, v.description])),
    gestures: Object.fromEntries(Object.entries(def.gestures).map(([k, v]) => [k, { description: v.description, duration: v.duration }])),
    anchors: Object.fromEntries(Object.entries(anchors).map(([k, v]) => [k, v.map(round)])),
    sockets: def.sockets,
    appearance: def.appearance,
    channels: def.channels,
  };
};

export const buildCatalog = (): Record<string, unknown> => {
  const files: Record<string, unknown> = {};
  for (const def of Object.values(ACTOR_DEFS)) files[`actors/${def.id}.json`] = actorManifest(def);
  files["props.json"] = PROPS;
  for (const env of Object.values(ENVIRONMENTS)) {
    files[`environments/${env.id}.json`] = {
      id: env.id,
      description: env.description,
      defaultMood: env.defaultMood,
      shell: env.shell,
      items: env.items.map((i) => ({ id: i.id, kind: i.kind, position: i.position, rotation: i.rotation ?? 0, ...(i.scale !== undefined ? { scale: i.scale } : {}), ...(i.on ? { on: i.on } : {}), ...(i.params ? { params: i.params } : {}) })),
      marks: env.marks,
      cameras: env.cameras,
      bounds: env.bounds,
    };
  }
  files["camera.json"] = {
    shots: SHOT_TYPES,
    moves: MOVES,
    notes: {
      angle: "degrees around the subject from its facing (0 = frontal, + = toward its left). Authored angles are never auto-corrected.",
      height: "eye | low | high | metres relative to eye level",
      lens: "focal length in mm on the image's short side (default per shot); or `fov` (vertical degrees)",
      size: "framing multiplier (<1 tighter, >1 looser)",
      track: "aim follows the subject (camera body stays); { lag } seconds of smoothing",
      follow: "camera body follows the subject too; { lag }",
      focus: "auto | none | <actor>[.anchor] | <item>[.anchor] | [x,y,z]; rack: [{ at, to }]",
      dof: "auto | off | { bokeh, range }",
      lock: "true = no automatic corrections at all",
      allowOcclusion: "ids allowed to block the view (deliberate foreground)",
      blend: "seconds to blend from the previous shot instead of cutting",
      allow: "findings in this shot that are deliberate, e.g. [\"offscreen\"] (catalog/direction.json intents)",
    },
  };
  files["moods.json"] = MOODS;
  files["screens.json"] = Object.fromEntries(Object.entries(SCREEN_PRESETS).map(([k, v]) => [k, { description: v.description, params: v.params }]));
  files["sfx.json"] = SFX_INFO;
  files["fx.json"] = Object.fromEntries(
    Object.entries(FX_INFO).map(([type, info]) => [type, { ...info, params: Object.keys(FxSchemas[type as keyof typeof FxSchemas].shape).filter((k) => k !== "type" && k !== "at") }]),
  );
  files["direction.json"] = {
    engine: { versions: ENGINE_VERSIONS, note: "`engine: 2` = current behaviour (what `new` writes); omitted = 1, the original behaviour, kept exactly for older videos." },
    profiles: PROFILES,
    intents: INTENTS,
    notes: { allow: "`allow: [intent, ...]` on the episode or a shot marks a finding as deliberate: it is reported as accepted by intent, never hidden." },
  };
  files["episode.schema.json"] = z.toJSONSchema(EpisodeSchema, { io: "input", unrepresentable: "any" });
  return files;
};

export const CATALOG_DIR = path.join(process.cwd(), "catalog");

export const writeCatalog = (dir = CATALOG_DIR) => {
  const files = buildCatalog();
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(content, null, 2) + "\n");
  }
  return Object.keys(files);
};

if (process.argv[1] && /catalog\.ts$/.test(process.argv[1])) {
  const written = writeCatalog();
  console.log(`catalog/: wrote ${written.length} files`);
}
