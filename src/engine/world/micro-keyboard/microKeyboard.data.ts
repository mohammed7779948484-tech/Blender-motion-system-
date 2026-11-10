// "micro-keyboard": tiny characters on a giant laptop at night. The world is scaled up ~50× (keys
// 0.95 m wide, 0.42 m tall) while actors stay real size, so cameras, focus and walking keep their
// usual tuning. Pure data: move/remove/add items per episode via set overrides.
import type { Vec3 } from "../../core/time";
import type { EnvironmentDef, Mark } from "../layout";
import { keyTop } from "./keys";

const on = (key: string, description: string, yaw = 0): Mark => ({ position: keyTop(key), yaw, description });
const above = (key: string, height: number): Vec3 => {
  const [x, y, z] = keyTop(key);
  return [x, y + height, z];
};

export const microKeyboard: EnvironmentDef = {
  id: "micro-keyboard",
  description: "Giant laptop at night: 14.5×5 backlit keys (0.95 m each) with a 14 m screen behind; characters stand on key tops. Press keys with props cues or the `press` recipe.",
  shell: { floor: "#8d939c", wall: "#07080d", trim: "#07080d", back: -6, left: -20, height: 12, walls: { back: false, left: false } },
  items: [
    { id: "keyboard", kind: "giant_keyboard", position: [0, 0, 0] },
    { id: "screen", kind: "giant_screen", position: [0, 0.05, -2.75], params: { screen: { preset: "code" } } },
    { id: "duck", kind: "rubber_duck", on: "keyboard", position: keyTop("s"), rotation: 25 },
    { id: "dust", kind: "dust_motes", position: [0, 0, 1.2] },
  ],
  marks: {
    "on-g": on("g", "Key G, middle of the keyboard (standing spot)"),
    "on-h": on("h", "Key H, next to G"),
    "on-enter": on("enter", "Top of the ENTER key (right side)", -10),
    "on-ctrl": on("ctrl", "Top of CTRL (bottom-left)", 10),
    "on-z": on("z", "Top of Z (left, above CTRL)", 10),
    "on-x": on("x", "Top of X"),
    "on-a": on("a", "Top of A (left)"),
    "on-space": on("space", "Middle of the space bar (front, closest to the viewer)"),
    "drop-enter": { position: above("enter", 5), yaw: -10, description: "5 m above ENTER: start of a fall onto the key" },
  },
  cameras: {
    "macro-low": { position: [0.5, 0.75, 4.4], target: [0, 1.3, 0], fov: 34, description: "Low across the key tops, screen glowing behind" },
    overhead: { position: [0, 9.5, 7], target: [0, 0.4, 0.3], fov: 46, description: "High angle over the whole keyboard" },
    wide: { position: [0, 3.2, 13.5], target: [0, 2.4, -1], fov: 44, description: "Keyboard and the whole screen" },
  },
  bounds: { min: [-15, 0.2, -2.3], max: [15, 12, 20] },
  defaultMood: "macro-warm",
  shadowRadius: 9,
};
