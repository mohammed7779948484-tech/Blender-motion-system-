// Guards against committing credentials: the example env file must only carry empty placeholders.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("secrets", () => {
  it(".env.example contains no real values", () => {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const [, value = ""] = line.split("=", 2);
      expect(value.trim(), `placeholder must be empty: ${line.split("=")[0]}`).toBe("");
    }
    expect(text).not.toMatch(/sk_[A-Za-z0-9]{8,}/);
  });

  it(".env is git-ignored", () => {
    const ignore = fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8").split(/\r?\n/).map((l) => l.trim());
    expect(ignore).toContain(".env");
  });
});
