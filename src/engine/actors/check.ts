// Sanity checks for actor definitions supplied by a video (built-in actors are covered by tests).
import { restChannels, type ActorDefinition } from "./rig";

const REQUIRED_ANCHORS = ["feet", "waist", "chest", "head", "face", "top"];

export const checkActorDef = (def: ActorDefinition): string[] => {
  const out: string[] = [];
  const where = `actor "${def.id}"`;
  const channel = (k: string, what: string) => {
    if (!def.channels[k]) out.push(`${where}: ${what} uses undeclared channel "${k}"`);
  };
  for (const [name, p] of Object.entries(def.poses ?? {})) for (const k in p.set) channel(k, `pose "${name}"`);
  for (const [name, e] of Object.entries(def.emotions ?? {})) for (const k in e.set) channel(k, `emotion "${name}"`);
  for (const [name, g] of Object.entries(def.gestures ?? {})) {
    for (const k in g.set ?? {}) channel(k, `gesture "${name}"`);
    if (g.add) for (const k in g.add(0.5)) channel(k, `gesture "${name}"`);
  }
  if (!def.poses?.[def.defaultPose]) out.push(`${where}: defaultPose "${def.defaultPose}" is not one of its poses`);
  if (!def.emotions?.[def.defaultEmotion]) out.push(`${where}: defaultEmotion "${def.defaultEmotion}" is not one of its emotions`);
  try {
    const anchors = def.anchors(restChannels(def));
    for (const a of REQUIRED_ANCHORS) if (!anchors[a]) out.push(`${where}: anchors() must return "${a}"`);
  } catch (e) {
    out.push(`${where}: anchors() threw: ${(e as Error).message}`);
  }
  return out;
};
