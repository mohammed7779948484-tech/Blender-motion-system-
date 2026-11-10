// Regression check: compares out/<slug>/stills against <baseline>/<slug>/stills (default out/baseline).
//   node scripts/compare-stills.mjs [--baseline out/baseline-v3] <slug> [...slugs]
// Prints byte-identical counts; for differing frames, PSNR and the differing-pixel count (ffmpeg).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const bi = args.indexOf("--baseline");
const baseline = bi >= 0 ? args.splice(bi, 2)[1] : path.join("out", "baseline");

for (const slug of args) {
  const a = path.join(baseline, slug, "stills");
  const b = path.join("out", slug, "stills");
  if (!fs.existsSync(a) || !fs.existsSync(b)) {
    console.log(`${slug}: missing ${!fs.existsSync(a) ? a : b}`);
    process.exitCode = 1;
    continue;
  }
  const files = fs.readdirSync(a).filter((f) => f.endsWith(".png")).sort();
  let same = 0;
  for (const f of files) {
    const fb = path.join(b, f);
    if (!fs.existsSync(fb)) {
      console.log(`  ${slug}/${f}: missing in new render`);
      process.exitCode = 1;
      continue;
    }
    if (fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(fb))) {
      same++;
      continue;
    }
    const psnr = spawnSync("ffmpeg", ["-hide_banner", "-i", path.join(a, f), "-i", fb, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/average:([\w.]+)/)?.[1];
    // Count pixels whose max channel difference exceeds 3/255 (perceptible) via a thresholded difference image.
    const diff = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(a, f), "-i", fb, "-lavfi", "blend=all_mode=difference,format=gray,geq=lum='gt(lum(X,Y),3)*255',signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=-", "-f", "null", "-"], { encoding: "utf8" }).stdout.match(/YAVG=([\d.]+)/)?.[1];
    console.log(`  ${slug}/${f}: differs — PSNR ${psnr} dB, ${diff ? ((Number(diff) / 255) * 100).toFixed(4) : "?"}% of pixels differ by >3/255`);
  }
  console.log(`${slug}: ${same}/${files.length} byte-identical`);
}
