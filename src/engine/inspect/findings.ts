// What a check observed: when, on what, how bad, the episode.json entry most likely responsible, and
// whether the director accepted it on purpose (`allow`). Per-frame hits are merged into time ranges.
import type { Intent } from "../core/behaviour";

/** error = objectively broken (blocks a final render); warning = probably unintended; note = a question. */
export type Level = "error" | "warning" | "note";
export type Check = "framing" | "camera" | "motion" | "contact" | "overlay" | "grammar" | "pacing";

export type Finding = {
  check: Check;
  kind: string;
  level: Level;
  /** What is affected: "rayan", "rayan.handR", "camera". */
  object: string;
  /** What it conflicts with, when there is something: "rayan.head", "desk", "caption". */
  with?: string;
  from: number;
  to: number;
  /** The episode.json entry most likely responsible, e.g. "actions[3] (rayan @ 1.00s)". */
  source?: string;
  /** Other entries active at that moment (they may share the blame). */
  related?: string[];
  /** The `allow` entry that marks this finding as deliberate. */
  intent?: Intent;
  /** True when that intent is set (on the episode, the shot, the action, the cast member or the accent). */
  accepted?: boolean;
  /** What happened and how to fix it (times are in from/to). */
  message: string;
  /** Worst measured value over the range (metres, ratio…), for ranking. */
  measure?: number;
};

export type Hit = Omit<Finding, "from" | "to"> & { key: string };

/**
 * Collects per-frame hits; hits with the same key on consecutive frames (gaps of up to `bridge` frames)
 * become one finding spanning their times, keeping the worst `measure`.
 */
export const hitCollector = (fps: number, bridge = 2) => {
  const open = new Map<string, { f: Finding; last: number }>();
  const done: Finding[] = [];
  return {
    add(frame: number, hit: Hit) {
      const { key, ...rest } = hit;
      const t = frame / fps;
      const cur = open.get(key);
      if (cur && frame - cur.last <= bridge) {
        cur.f.to = t;
        cur.last = frame;
        if (rest.measure !== undefined) cur.f.measure = Math.max(cur.f.measure ?? -Infinity, rest.measure);
        return;
      }
      if (cur) done.push(cur.f);
      open.set(key, { f: { ...rest, from: t, to: t }, last: frame });
    },
    findings(): Finding[] {
      for (const { f } of open.values()) done.push(f);
      open.clear();
      return done;
    },
  };
};

const LEVEL_ORDER: Record<Level, number> = { error: 0, warning: 1, note: 2 };

/** Unaccepted first by level, then accepted; each group in time order. */
export const sortFindings = (fs: Finding[]) => [...fs].sort((a, b) => Number(!!a.accepted) - Number(!!b.accepted) || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.from - b.from);

export const formatFinding = (f: Finding) => {
  const when = f.from === f.to ? `${f.from.toFixed(2)}s` : `${f.from.toFixed(2)}–${f.to.toFixed(2)}s`;
  const what = f.with ? `${f.object} × ${f.with}` : f.object;
  return `${when} ${f.check}/${f.kind} ${what}: ${f.message}${f.source ? ` ← ${f.source}` : ""}${f.related?.length ? ` (also active: ${f.related.join("; ")})` : ""}${f.accepted ? ` (allow: ${f.intent})` : f.intent ? `  [deliberate? allow: "${f.intent}"]` : ""}`;
};
