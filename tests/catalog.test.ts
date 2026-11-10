import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveEpisode } from "../src/engine/core/timeline";
import { buildCatalog } from "../scripts/catalog";
import { readManifest } from "../scripts/voice";

describe("catalog", () => {
  it("is up to date with the code (run `npm run catalog`)", () => {
    for (const [rel, content] of Object.entries(buildCatalog())) {
      const file = path.join("catalog", rel);
      expect(fs.existsSync(file), `${file} missing`).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, "utf8")), `${file} is stale`).toEqual(JSON.parse(JSON.stringify(content)));
    }
  });
});

describe("every video", () => {
  const slugs = fs.readdirSync("videos", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  it.each(slugs)("%s resolves without errors", async (slug) => {
    const episode = JSON.parse(fs.readFileSync(path.join("videos", slug, "episode.json"), "utf8"));
    const dataFile = path.join("videos", slug, "video.data.ts");
    const data = fs.existsSync(dataFile) ? ((await import(pathToFileURL(path.resolve(dataFile)).href)).default ?? {}) : {};
    const r = resolveEpisode(episode, readManifest(process.cwd(), slug), { environments: data.environments, actors: data.actorDefs, components: data.componentKinds });
    expect(r.durationInFrames).toBeGreaterThan(0);
    expect(fs.readFileSync("videos/registry.ts", "utf8")).toContain(`"./${slug}"`);
  });
});
