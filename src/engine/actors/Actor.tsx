// Places an actor's view at its evaluated root transform. Usable directly from scene code:
//   const frame = evaluateActor(track, t);  <ActorView actor={ACTORS.rayan} frame={frame} />
import type { ReactNode } from "react";
import type { Actor } from "./types";
import type { ActorFrame } from "./rig";

export const ActorView: React.FC<{
  actor: Actor;
  frame: ActorFrame;
  appearance?: Record<string, unknown>;
  held?: Record<string, ReactNode>;
  visible?: boolean;
}> = ({ actor, frame, appearance, held, visible = true }) => (
  <group
    name={`actor:${frame.id}`}
    position={frame.position}
    rotation={[0, frame.yaw, 0]}
    scale={frame.scale}
    visible={visible}
  >
    <actor.View channels={frame.channels} appearance={appearance} held={held} />
  </group>
);
