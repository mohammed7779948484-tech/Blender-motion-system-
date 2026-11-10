// Actor registry: plain map from id to {def, View}. Adding an actor = one entry here.
import type { Actor } from "./types";
import { rayanDef } from "./rayan/rayan.data";
import { Rayan } from "./rayan/Rayan";
import { claudeDef } from "./claude/claude.data";
import { Claude } from "./claude/Claude";

export const ACTORS: Record<string, Actor> = {
  rayan: { def: rayanDef, View: Rayan },
  claude: { def: claudeDef, View: Claude },
};

export { rayanDef, claudeDef, Rayan, Claude };
export type { Actor, ActorViewProps } from "./types";
export * from "./rig";
