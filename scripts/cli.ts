// Agent-facing CLI:  npm run cli -- <command> [...]
//   list [actors|props|environments|shots|moves|moods|screens|fx|sfx|videos|direction]
//   show <actor|prop|environment|mood|screen|fx|sfx> <id>
//   new <slug> [--preset portrait|landscape|square] [--env <environment>|custom] [--title "..."]  (writes BRIEF.md)
//   voice <slug> [--provider elevenlabs|system|espeak|fixture] [--force] [--takes l3=3] [--max-credits N] [--no-stt]
//   voice <slug> --show l3 | --audition l3 | --report   |   voice --check (free: plan, models, voices)
//   validate <slug>   (direction, audio readiness, beat sheet and every inspect finding)
//   inspect <slug> [--json]   (findings: time, object, source, intent; exits 1 on errors)
//   explain <slug> --t <s> [--actor <id> | --camera]   (every layer at that time and where it came from)
//   stills <slug> [--frames 0,90,180 | --edges | --at findings] [--verify] [--guides]   (labelled contact sheets)
//   preview <slug> --from <s> --to <s> [--scale 0.5] [--strip 8]   (short low-res MP4 + a frame strip to judge motion)
//   render <slug> [--out out/<slug>.mp4] [--draft] [--master (loudness -14 LUFS)] [--timeout ms]
//   review <slug>   (after render: frame sheet of every shot/accent + loudness and mix balance)
//   catalog
// Factory (Blender scenes; see README):
//   build <slug> [--profile final|draft|blocking] [--force]   recipe → plan → scenes → shots → out/<slug>.mp4 (+ .srt/.vtt)
//   plan | scenes | shots | compose <slug>                     the individual stages (each reuses what did not change)
//   status <slug>                                              per shot: scene state (current/stale/edited) and render cache
//   open <slug> <shot>  |  scene-edit <slug> <shot> --py "..." | --script f.py     edit a shot scene (GUI / headless)
//   edit <slug> camera --at l2.word:3 --shot close --subject rayan [--move push-in --amount 0.2]
//   edit <slug> action --at l2.word:3 --actor rayan --gesture wave   |  edit <slug> line l2 --text "..."  |  edit <slug> set <path> --value <json>
//   library                                                    shared asset .blend files and the videos that link them
import fs from "node:fs";
import path from "node:path";
import { writeCatalog } from "./catalog";
import { explain, inspect, validate } from "./cli/check";
import { list, show } from "./cli/discover";
import { preview, render, review, stills } from "./cli/media";
import { newVideo } from "./cli/scaffold";
import { fail, positional, ROOT } from "./cli/shared";
import { voice } from "./cli/voices";
import { factoryCommands } from "./cli/factory";

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
  ...factoryCommands,
  catalog: () => console.log(`✔ catalog/: ${writeCatalog().length} files`),
};

const cmd = positional[0];
if (!cmd || !commands[cmd]) {
  const header = fs.readFileSync(__filename, "utf8").split("\n");
  console.log(header.slice(0, header.findIndex((l) => !l.startsWith("//"))).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch((e) => fail((e as Error).stack ?? String(e)));
