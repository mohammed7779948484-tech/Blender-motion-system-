// "floating-space": two small rock islands joined by a hard-light bridge, adrift in a starfield with
// a nebula band and a ringed planet. No ground plane (shell.floor "none"): island tops are at y = 0,
// so actors stand at y = 0 on them and the void opens below. Pure data: move/remove/add items per
// episode via set overrides.
import type { EnvironmentDef, Mark } from "../layout";
import { along, bridgeBetween } from "./space";

type Pt = [number, number];
const mark = ([x, z]: Pt, yaw: number, description: string, y = 0): Mark => ({ position: [x, y, z], yaw, description });

const RIGHT: Pt = [0.8, 0.5];
const FAR: Pt = [5.4, -2];
// The bridge runs straight from the right spot to the far spot, so that walk stays on it. Its deck sits
// 12 mm above the island tops so the overlapping ends don't z-fight.
const bridge = bridgeBetween(along(RIGHT, FAR, 1.6), along(RIGHT, FAR, 3.9), 0.012);

export const floatingSpace: EnvironmentDef = {
  id: "floating-space",
  description:
    "Two floating rock islands in deep space (main Ø ≈ 5 m, far one Ø ≈ 3 m), joined by a glowing hard-light bridge; nebula sky, twinkling stars, a ringed planet, drifting rocks. No ground: island tops are at y = 0 and the void opens below.",
  shell: { floor: "none", wall: "#05060f", trim: "#05060f", back: -30, left: -30, height: 20, walls: { back: false, left: false } },
  items: [
    { id: "sky", kind: "starfield", position: [0, 0, 0] },
    { id: "planet", kind: "planet", position: [-10, 18, -38] },
    { id: "island", kind: "floating_island", position: [0, 0, 0], rotation: 15, scale: 2.7, params: { seed: "main", crystals: 4 } },
    { id: "far-island", kind: "floating_island", position: [FAR[0], 0, FAR[1]], rotation: -15, scale: 1.7, params: { seed: "far", crystals: 3 } },
    { id: "bridge", kind: "light_bridge", position: bridge.position, rotation: bridge.rotation, params: { length: bridge.length } },
    { id: "isle-a", kind: "floating_island", position: [-9.5, -1.6, -9], scale: 2, params: { seed: "isle-a", crystals: 2, bob: 0.18, spin: 1.5 } },
    { id: "isle-b", kind: "floating_island", position: [8.5, 3.6, -13], scale: 1.5, params: { seed: "isle-b", crystals: 2, bob: 0.22, spin: -2 } },
    { id: "isle-c", kind: "floating_island", position: [-3.5, 4.8, -17], scale: 1.1, params: { seed: "isle-c", crystals: 1, bob: 0.25, spin: 3 } },
    { id: "isle-d", kind: "floating_island", position: [3.5, -5.5, -6], scale: 1.3, params: { seed: "isle-d", crystals: 2, bob: 0.2, spin: -1.2 } },
    { id: "rocks", kind: "space_rocks", position: [2, 0, -1] },
  ],
  marks: {
    "stand-left": mark([-0.8, 0.5], 20, "Main island, left standing spot (angled toward stand-right)"),
    "stand-right": mark(RIGHT, -20, "Main island, right standing spot; the bridge to the far island starts behind it"),
    "stand-center": mark([0, 0.3], 0, "Main island centre, facing the camera side (+Z)"),
    "on-bridge": mark(along(RIGHT, FAR, 2.75), 0, "Middle of the light bridge, over the void"),
    "far-spot": mark(FAR, -35, "Centre of the far island (walk here from stand-right: the straight path follows the bridge)"),
    "far-spot-2": mark([5.95, -1.22], -45, "Second spot on the far island, front-right of far-spot"),
    "drop-in": mark([0, 0.3], 0, "6 m above the main island centre: start of a fall onto it", 6),
  },
  // Spots are framed for 9:16 first (every standing spot in frame); 16:9 shows more sky around them.
  cameras: {
    establishing: { position: [-4.8, 5.2, 12.5], target: [2, 0.4, -0.9], fov: 44, description: "3/4 high from the front-left: both islands, the bridge and every standing spot" },
    wide: { position: [2.1, 2.4, 18.5], target: [2.15, 0.6, -0.8], fov: 40, description: "Straight-on wide of both islands (actors are small in 9:16)" },
    "hero-low": { position: [0.4, 0.4, 6.4], target: [0, 1.4, 0.4], fov: 44, description: "Low angle on the main island's standing spots against the stars, planet above" },
    high: { position: [1.6, 13, 11.5], target: [2.2, -0.6, -0.8], fov: 46, description: "High angle down onto both islands and into the void" },
    "along-bridge": { position: [-7.2, 2.8, 6], target: [3, 0.6, -1.2], fov: 40, description: "From the main island's front-left down the bridge axis: a walk from stand-right to far-spot recedes along it" },
  },
  // Sky dome (54 m) + the farthest bounds corner (~23 m) stays inside the camera's 80 m far plane.
  bounds: { min: [-10, 0.25, -9], max: [13, 10, 16] },
  defaultMood: "space-cool",
  shadowRadius: 8,
};
