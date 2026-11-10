// inspect: every check over the frame-by-frame visual state, in Node, without rendering. Each finding
// says when, on what, how bad, which episode.json entry caused it and whether `allow` accepts it.
import type { ActorDefinition } from "../actors/rig";
import type { ResolvedEpisode } from "../core/timeline";
import type { Trace } from "../core/trace";
import { cameraChecks } from "./camera";
import { contactChecks } from "./contact";
import { createContext, type InspectContext } from "./context";
import { sortFindings, type Finding } from "./findings";
import { framingChecks } from "./framing";
import { grammarChecks } from "./grammar";
import { motionChecks } from "./motion";
import { overlayChecks } from "./overlay";

export const CHECKS: Record<string, (ctx: InspectContext) => Finding[]> = {
  framing: framingChecks,
  camera: cameraChecks,
  motion: motionChecks,
  contact: contactChecks,
  overlay: overlayChecks,
  grammar: grammarChecks,
};

/** Run every check. Pass the trace from resolveEpisode(…, { trace }) so findings name their source. */
export const inspectEpisode = (r: ResolvedEpisode, opts: { actorDefs?: Record<string, ActorDefinition>; trace?: Trace } = {}): Finding[] => {
  const ctx = createContext(r, opts);
  return sortFindings(Object.values(CHECKS).flatMap((check) => check(ctx)));
};
