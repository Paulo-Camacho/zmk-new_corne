// Physical key labels for Eyelash Corne (48 positions), BASE layer — for combo UI.
// Order matches config/eyelash_corne.keymap default_layer bindings + thumbs.
export const EYELASH_BASE_KEY_LABELS = [
  "Tab", "Q", "W", "E", "R", "T", "·", "Y", "U", "I", "O", "P", "Bksp",
  "Cmd", "A", "S", "D", "F", "G", "·", "·", "·", "H", "J", "K", "L", ";", "'",
  "Sh", "Z", "X", "C", "V", "B", "Ret", "·", "N", "M", ",", ".", "/",
  "Sh", "Ctrl", "Opt", "Sym", "Num", "Space", "Fn",
];

export function positionLabel(position) {
  const label = EYELASH_BASE_KEY_LABELS[position];
  return label ?? `#${position}`;
}
