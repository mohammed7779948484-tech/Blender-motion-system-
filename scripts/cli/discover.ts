// Discovery commands: list and show what the engine has (from the generated catalog).
import fs from "node:fs";
import path from "node:path";
import { buildCatalog } from "../catalog";
import { fail, positional, ROOT } from "./shared";

export const list = async () => {
  const kind = positional[1];
  const cat = buildCatalog() as Record<string, Record<string, unknown>>;
  const actors = Object.entries(cat).filter(([k]) => k.startsWith("actors/")).map(([, v]) => v as Record<string, Record<string, unknown> | string>);
  const sections: Record<string, () => void> = {
    actors: () => {
      for (const a of actors) {
        console.log(`\n${a.id} — ${a.description}`);
        console.log(`  poses:    ${Object.keys(a.poses).join(", ")}`);
        console.log(`  emotions: ${Object.keys(a.emotions).join(", ")}`);
        console.log(`  gestures: ${Object.keys(a.gestures).join(", ")}`);
        console.log(`  sockets:  ${Object.keys(a.sockets).join(", ")}   anchors: ${Object.keys(a.anchors).join(", ")}`);
      }
    },
    props: () => {
      for (const [id, p] of Object.entries(cat["props.json"] as Record<string, { description: string; params: Record<string, unknown> }>)) console.log(`  ${id.padEnd(14)} ${p.description}  [params: ${Object.keys(p.params).join(", ")}]`);
    },
    environments: () => {
      for (const [k, e] of Object.entries(cat).filter(([k]) => k.startsWith("environments/"))) {
        const env = e as { id: string; description: string; items: { id: string; kind: string }[]; marks: object; cameras: object };
        console.log(`\n${env.id} — ${env.description}  (${k})`);
        console.log(`  items:   ${env.items.map((i) => `${i.id}(${i.kind})`).join(", ")}`);
        console.log(`  marks:   ${Object.keys(env.marks).join(", ")}`);
        console.log(`  cameras: ${Object.keys(env.cameras).join(", ")}`);
      }
    },
    shots: () => Object.entries((cat["camera.json"] as { shots: Record<string, string> }).shots).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`)),
    moves: () => Object.entries((cat["camera.json"] as { moves: Record<string, string> }).moves).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`)),
    moods: () => Object.entries(cat["moods.json"] as Record<string, { description: string }>).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v.description}`)),
    screens: () => Object.entries(cat["screens.json"] as Record<string, { description: string; params: object }>).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v.description}  [${Object.keys(v.params).join(", ")}]`)),
    sfx: () => {
      const all = Object.entries(cat["sfx.json"] as Record<string, { license: string; tags: string[]; description: string; meanDb?: number }>);
      for (const [k, v] of all.filter(([, v]) => v.license !== "unknown")) console.log(`  ${k.padEnd(14)} ${v.description}  [${v.tags.join(", ")}]${v.meanDb !== undefined ? ` ${v.meanDb} dB` : ""}  ${v.license}`);
      console.log(`  remote, unknown rights (avoid in monetized work): ${all.filter(([, v]) => v.license === "unknown").map(([k]) => k).join(", ")}`);
    },
    fx: () => Object.entries(cat["fx.json"] as Record<string, { layer: string; description: string; pickWhen: string; params: string[] }>).forEach(([k, v]) => console.log(`  ${k.padEnd(9)} [${v.layer}] ${v.description}
            use for: ${v.pickWhen}
            params: ${v.params.join(", ")}`)),
    videos: () => fs.readdirSync(path.join(ROOT, "videos"), { withFileTypes: true }).filter((d) => d.isDirectory()).forEach((d) => console.log(`  ${d.name}`)),
    direction: () => {
      const d = cat["direction.json"] as { profiles: Record<string, { description: string }>; intents: Record<string, string> };
      console.log("  profiles (episode `profile`):");
      for (const [k, v] of Object.entries(d.profiles)) console.log(`    ${k.padEnd(14)} ${v.description}`);
      console.log("  intents (`allow` on the episode or a shot — reported as accepted, never hidden):");
      for (const [k, v] of Object.entries(d.intents)) console.log(`    ${k.padEnd(14)} ${v}`);
    },
  };
  if (kind && !sections[kind]) fail(`unknown list kind "${kind}" (${Object.keys(sections).join(", ")})`);
  for (const [name, fn] of Object.entries(sections)) {
    if (kind && kind !== name) continue;
    if (!kind) console.log(`\n== ${name} ==`);
    fn();
  }
  if (!kind) console.log(`\nDetails: npm run cli -- show actor rayan  |  catalog/*.json  |  docs/ENGINE.md`);
};

export const show = () => {
  const [, kind, id] = positional;
  const cat = buildCatalog() as Record<string, Record<string, unknown>>;
  const key = kind === "actor" ? `actors/${id}.json` : kind === "environment" ? `environments/${id}.json` : null;
  const value = key ? cat[key] : kind === "prop" ? cat["props.json"][id] : kind === "mood" ? cat["moods.json"][id] : kind === "screen" ? cat["screens.json"][id] : kind === "fx" ? cat["fx.json"][id] : kind === "sfx" ? cat["sfx.json"][id] : undefined;
  if (!value) fail(`nothing for "${kind} ${id}" (kinds: actor, prop, environment, mood, screen, fx, sfx)`);
  console.log(JSON.stringify(value, null, 2));
};
