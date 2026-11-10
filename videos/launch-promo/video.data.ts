// Pure data for this video only: a brand-new location built without touching the shared engine.
// (Spread into defineVideo in index.tsx; the CLI loads it for validate/stills.)
import type { EnvironmentDef, VideoData } from "../../src/engine";

const launchStage: EnvironmentDef = {
  id: "launch-stage",
  description: "Neon product-launch stage: reflective floor, cyclorama, podium, floating holo screens, light bars.",
  shell: { floor: "#07030f", wall: "#07030f", trim: "#07030f", back: -4, left: -8, height: 6, walls: { back: false, left: false } },
  items: [
    { id: "floor", kind: "stage_floor", position: [0, 0, 0] },
    { id: "cyclorama", kind: "cyclorama", position: [0, 0, -3.2] },
    { id: "podium", kind: "podium", position: [0.55, 0, -0.2], size: [1.5, 0.5, 1.5] },
    { id: "holo-left", kind: "holo_screen", position: [-1.55, 1.95, -1.1], rotation: 18, params: { preset: "checks", seed: "a" } },
    { id: "holo-right", kind: "holo_screen", position: [2.35, 2.15, -1.3], rotation: -20, params: { preset: "bugs", seed: "b" } },
    { id: "holo-top", kind: "holo_screen", position: [0.55, 3.2, -1.9], scale: 1.25, params: { preset: "logo", seed: "c" } },
    { id: "bar-1", kind: "neon_bar", position: [-2.6, 0, -2.4], params: { color: "#ff3ea5", order: 0 } },
    { id: "bar-2", kind: "neon_bar", position: [-1.3, 0, -2.8], params: { color: "#7c3aed", order: 1 } },
    { id: "bar-3", kind: "neon_bar", position: [2.4, 0, -2.8], params: { color: "#22d3ee", order: 2 } },
    { id: "bar-4", kind: "neon_bar", position: [3.7, 0, -2.4], params: { color: "#ff3ea5", order: 3 } },
  ],
  marks: {
    "podium-top": { position: [0.55, 0.5, -0.2], yaw: -8, description: "Presenter spot on the podium" },
    "stage-left": { position: [-3.6, 0, 1.0], yaw: 90, description: "Off-stage left entrance" },
    "center-left": { position: [-1.05, 0, 0.75], yaw: 25, description: "Standing spot beside the podium" },
  },
  cameras: {
    "hero-low": { position: [0.2, 0.35, 4.6], target: [0.5, 1.45, -0.3], fov: 42, description: "Low hero angle on the podium" },
    wide: { position: [0, 2.0, 8.2], target: [0.2, 1.3, -0.5], fov: 44, description: "Whole stage" },
  },
  bounds: { min: [-7, 0.12, -2.8], max: [7, 6, 12] },
  defaultMood: "soft-studio",
};

const data: VideoData = {
  environments: { "launch-stage": launchStage },
  componentKinds: ["stage_floor", "cyclorama", "podium", "holo_screen", "neon_bar"],
};

export default data;
