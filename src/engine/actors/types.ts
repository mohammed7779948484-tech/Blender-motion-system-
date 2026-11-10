import type { ReactNode } from "react";
import type { ActorDefinition, Channels } from "./rig";

/** Props every actor geometry component receives. */
export type ActorViewProps = {
  channels: Channels;
  appearance?: Record<string, unknown>;
  /** Content to mount in named sockets (props held in hands, hats...). */
  held?: Record<string, ReactNode>;
};

/** An actor = pure definition (data, poses, life) + the R3F component that draws it. */
export type Actor = {
  def: ActorDefinition;
  View: React.FC<ActorViewProps>;
};
