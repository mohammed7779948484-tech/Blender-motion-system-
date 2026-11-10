// Provenance: which episode.json entry (and which recipe step) produced each resolved cue, shot, accent
// and sound, the intents (`allow`) attached to it, and the moments recipes expect a hand to touch
// something. Filled only when a caller passes a Trace to resolveEpisode (inspect, explain); never part
// of the resolved, serialized episode.
import type { Intent } from "./behaviour";
import type { Vec3 } from "./time";

export type TraceEntry = { source: string; allow?: Intent[] };

/** A moment a recipe expects a hand to be on a point (pick-up grip, place spot, a key tap). */
export type Contact = { actor: string; at: number; point: Vec3; side?: "L" | "R"; reached?: boolean; what: string; source: string };

export type Trace = {
  /** Resolved object (cue, shot, fx, sfx, an actor's start) → where it came from, e.g. "actions[12] (...) do:facepalm step 'palm to face'". */
  entries: Map<object, TraceEntry>;
  contacts: Contact[];
};

export const createTrace = (): Trace => ({ entries: new Map(), contacts: [] });
export const sourceOf = (trace: Trace | undefined, obj: object | undefined) => (obj ? trace?.entries.get(obj)?.source : undefined);
export const allowOf = (trace: Trace | undefined, obj: object | undefined): Intent[] => (obj ? trace?.entries.get(obj)?.allow ?? [] : []);
