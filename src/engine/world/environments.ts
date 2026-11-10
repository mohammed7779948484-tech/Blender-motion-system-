// Pure environment registry (Node-safe). Videos can bring their own via video.data.ts.
import type { EnvironmentDef } from "./layout";
import { devOffice } from "./dev-office/devOffice.data";
import { floatingSpace } from "./floating-space/floatingSpace.data";
import { microKeyboard } from "./micro-keyboard/microKeyboard.data";

export const ENVIRONMENTS: Record<string, EnvironmentDef> = {
  "dev-office": devOffice,
  "micro-keyboard": microKeyboard,
  "floating-space": floatingSpace,
};
