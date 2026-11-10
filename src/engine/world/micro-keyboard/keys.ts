// Giant laptop keyboard layout (pure data). One key unit = KEY_PITCH metres: the world is a real
// laptop scaled ~50×, so normal-size actors stand on keys like tiny figures on a real keyboard.
// Prop-local frame: origin = keyboard centre on the deck, +X = right, +Z = toward the viewer (bottom row).
import type { Vec3 } from "../../core/time";

export const KEY_PITCH = 0.95;
export const KEY_GAP = 0.09;
/** Keycap top above the deck when up; how far a press travels. */
export const KEY_TOP = 0.42;
export const KEY_BASE = 0.12;
export const KEY_TRAVEL = 0.18;

export type KeyDef = { id: string; label: string; w: number; x: number; z: number; row: number };

// [id, label, width in units]
const ROWS: [string, string, number][][] = [
  [["backtick", "`", 1], ["1", "1", 1], ["2", "2", 1], ["3", "3", 1], ["4", "4", 1], ["5", "5", 1], ["6", "6", 1], ["7", "7", 1], ["8", "8", 1], ["9", "9", 1], ["0", "0", 1], ["minus", "-", 1], ["equals", "=", 1], ["delete", "delete", 1.5]],
  [["tab", "tab", 1.5], ["q", "Q", 1], ["w", "W", 1], ["e", "E", 1], ["r", "R", 1], ["t", "T", 1], ["y", "Y", 1], ["u", "U", 1], ["i", "I", 1], ["o", "O", 1], ["p", "P", 1], ["lbracket", "[", 1], ["rbracket", "]", 1], ["backslash", "\\", 1]],
  [["caps", "caps", 1.75], ["a", "A", 1], ["s", "S", 1], ["d", "D", 1], ["f", "F", 1], ["g", "G", 1], ["h", "H", 1], ["j", "J", 1], ["k", "K", 1], ["l", "L", 1], ["semicolon", ";", 1], ["quote", "'", 1], ["enter", "enter ⏎", 1.75]],
  [["shift-l", "⇧ shift", 2.25], ["z", "Z", 1], ["x", "X", 1], ["c", "C", 1], ["v", "V", 1], ["b", "B", 1], ["n", "N", 1], ["m", "M", 1], ["comma", ",", 1], ["period", ".", 1], ["slash", "/", 1], ["shift-r", "⇧ shift", 2.25]],
  [["fn", "fn", 1], ["ctrl", "ctrl", 1], ["opt-l", "opt", 1], ["cmd-l", "⌘ cmd", 1.25], ["space", "", 5], ["cmd-r", "⌘ cmd", 1.25], ["opt-r", "opt", 1], ["left", "◀", 1], ["updown", "▲▼", 1], ["right", "▶", 1]],
];

const ROW_UNITS = 14.5;

export const KEYS: KeyDef[] = ROWS.flatMap((row, r) => {
  let cursor = -ROW_UNITS / 2;
  return row.map(([id, label, w]) => {
    const x = (cursor + w / 2) * KEY_PITCH;
    cursor += w;
    return { id, label, w, x, z: (r - 2) * KEY_PITCH, row: r };
  });
});

export const KEY_BY_ID = new Map(KEYS.map((k) => [k.id, k]));

/** Footprint of the whole key field (metres). */
export const KEYBOARD_SIZE: Vec3 = [ROW_UNITS * KEY_PITCH, KEY_TOP, ROWS.length * KEY_PITCH];

/** Top centre of a key (up position), prop-local. */
export const keyTop = (id: string): Vec3 => {
  const k = KEY_BY_ID.get(id);
  if (!k) throw new Error(`no key "${id}"`);
  return [k.x, KEY_TOP, k.z];
};
