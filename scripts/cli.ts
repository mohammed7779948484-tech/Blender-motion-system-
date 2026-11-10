// Agent-facing CLI:  npm run cli -- <command> [...]
//   list [actors|props|environments|shots|moves|moods|screens|fx|sfx|videos|direction]
//   show <actor|prop|environment|mood|screen|fx|sfx> <id>
//   new <slug> [--preset portrait|landscape|square] [--env <environment>|custom] [--title "..."]  (writes BRIEF.md)
//   voice <slug> [--provider elevenlabs|system|fixture] [--force] [--takes l3=3] [--max-credits N] [--no-stt]
//   voice <slug> --show l3 | --audition l3 | --report   |   voice --check (free: plan, models, voices)
//   validate <slug>   (direction, audio readiness, beat sheet and every inspect finding)
//   inspect <slug> [--json]   (findings: time, object, source, intent; exits 1 on errors)
//   explain <slug> --t <s> [--actor <id> | --camera]   (every layer at that time and where it came from)
//   stills <slug> [--frames 0,90,180 | --edges | --at findings] [--verify] [--guides]   (labelled contact sheets)
//   preview <slug> --from <s> --to <s> [--scale 0.5] [--strip 8]   (short low-res MP4 + a frame strip to judge motion)
//   render <slug> [--out out/<slug>.mp4] [--draft] [--master (loudness -14 LUFS)] [--timeout ms]
//   review <slug>   (after render: frame sheet of every shot/accent + loudness and mix balance)
//   catalog
import fs from "node:fs";
import path from "node:path";
import { writeCatalog } from "./catalog";
import { explain, inspect, validate } from "./cli/check";
import { list, show } from "./cli/discover";
import { preview, render, review, stills } from "./cli/media";
import { newVideo } from "./cli/scaffold";
import { fail, positional, ROOT } from "./cli/shared";
import { voice } from "./cli/voices";

if (fs.existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));

const commands: Record<string, () => unknown> = {
  list,
  show,
  new: newVideo,
  voice,
  validate,
  inspect,
  explain,
  stills,
  preview,
  render,
  review,
  catalog: () => console.log(`✔ catalog/: ${writeCatalog().length} files`),
};

const cmd = positional[0];
if (!cmd || !commands[cmd]) {
  const header = fs.readFileSync(__filename, "utf8").split("\n");
  console.log(header.slice(0, header.findIndex((l) => !l.startsWith("//"))).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch((e) => fail((e as Error).stack ?? String(e)));
