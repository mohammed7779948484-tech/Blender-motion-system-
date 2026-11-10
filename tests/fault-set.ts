// Loads the fault set (tests/faults/*.json): tiny episodes with one known defect each, plus intent
// controls (the same kind of thing done on purpose, marked with `allow`).
import fs from "node:fs";
import path from "node:path";
import type { Intent } from "../src/engine/core/behaviour";

export type FaultExpectation = { check: string; kind: string; object: string; with?: string; from: number; to: number; source: string };
export type Fault = { description: string; expect: FaultExpectation | null; accepted?: Intent[]; episode: Record<string, unknown> };

const DIR = path.join(__dirname, "faults");

export const FAULTS: [string, Fault][] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => [f.replace(/\.json$/, ""), JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as Fault]);

/** Follows a source like "actions[0]", "cast.rayan" or "camera[1]" into the episode JSON. */
export const sourceAt = (episode: unknown, ref: string) => ref.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], episode);
