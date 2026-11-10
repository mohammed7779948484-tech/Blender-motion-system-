// Golden visual state: a frozen video's resolved episode and frame-by-frame visual state
// (src/engine/inspect/sweep.ts) must not change unless the change is intended. Videos without a
// file in tests/goldens/ are work in progress and are skipped.
//   Freeze or accept an intended change:  UPDATE_GOLDENS=1 npx vitest run tests/golden.test.ts
// (say why in the commit message).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonical, createSweep, digest, digestSweep, type SweepDigest } from "../src/engine/inspect/sweep";
import { resolveVideo, videoSlugs } from "../scripts/video";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "tests", "goldens");
const update = !!process.env.UPDATE_GOLDENS;
const goldenFile = (slug: string) => path.join(DIR, `${slug}.json`);
const slugs = videoSlugs(ROOT).filter((s) => update || fs.existsSync(goldenFile(s)));

describe("golden visual state", () => {
  it("covers the finished videos", () => {
    expect(slugs).toEqual(expect.arrayContaining(["ctrl-z", "it-works-on-my-machine", "launch-promo"]));
  });

  it.each(slugs)(
    "%s is unchanged",
    async (slug) => {
      const { resolved, actorDefs } = await resolveVideo(ROOT, slug);
      const now = { resolved: digest(canonical(resolved)), sweep: digestSweep(createSweep(resolved, actorDefs)) };
      if (update) {
        fs.mkdirSync(DIR, { recursive: true });
        fs.writeFileSync(goldenFile(slug), JSON.stringify(now, null, 1) + "\n");
        return;
      }
      const golden = JSON.parse(fs.readFileSync(goldenFile(slug), "utf8")) as { resolved: string; sweep: SweepDigest };
      expect(now.resolved, "the resolved episode changed").toBe(golden.resolved);
      expect(now.sweep.frames, "the frame count changed").toBe(golden.sweep.frames);
      const first = golden.sweep.seconds.findIndex((h, i) => h !== now.sweep.seconds[i]);
      expect(first, `the visual state differs from ${first} s on`).toBe(-1);
    },
    60_000,
  );
});
