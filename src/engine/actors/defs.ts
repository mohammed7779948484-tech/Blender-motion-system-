// Pure actor definitions (Node-safe). Views live in ./index.ts.
import type { ActorDefinition } from "./rig";
import { rayanDef } from "./rayan/rayan.data";
import { claudeDef } from "./claude/claude.data";

export const ACTOR_DEFS: Record<string, ActorDefinition> = {
  rayan: rayanDef,
  claude: claudeDef,
};
