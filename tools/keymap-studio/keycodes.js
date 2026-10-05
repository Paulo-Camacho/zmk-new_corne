// ZMK keycode helpers. A ZMK keycode packs explicit modifiers, a HID usage
// page and a usage ID into one 32-bit parameter:
//   (mods << 24) | (page << 16) | usage_id

export const PAGE_KEYBOARD = 0x07;
export const PAGE_CONSUMER = 0x0c;

export const MODIFIERS = [
  ["LCTL", 0x01], ["LSFT", 0x02], ["LALT", 0x04], ["LGUI", 0x08],
  ["RCTL", 0x10], ["RSFT", 0x20], ["RALT", 0x40], ["RGUI", 0x80],
];

export function encodeKeycode(page, id, mods = 0) {
  return (((mods & 0xff) << 24) | ((page & 0xff) << 16) | (id & 0xffff)) >>> 0;
}

export function decodeKeycode(value) {
  const v = value >>> 0;
  return { mods: (v >>> 24) & 0xff, page: (v >>> 16) & 0xff, id: v & 0xffff };
}

// Usage ID -> ZMK name, keyboard page (0x07).
export const KEYBOARD_USAGES = new Map([
  [0x00, "NONE"],
  ...Array.from({ length: 26 }, (_, i) => [0x04 + i, String.fromCharCode(65 + i)]),
  [0x1e, "N1"], [0x1f, "N2"], [0x20, "N3"], [0x21, "N4"], [0x22, "N5"],
  [0x23, "N6"], [0x24, "N7"], [0x25, "N8"], [0x26, "N9"], [0x27, "N0"],
  [0x28, "RET"], [0x29, "ESC"], [0x2a, "BSPC"], [0x2b, "TAB"], [0x2c, "SPACE"],
  [0x2d, "MINUS"], [0x2e, "EQUAL"], [0x2f, "LBKT"], [0x30, "RBKT"], [0x31, "BSLH"],
  [0x32, "NUHS"], [0x33, "SEMI"], [0x34, "SQT"], [0x35, "GRAVE"], [0x36, "COMMA"],
  [0x37, "DOT"], [0x38, "FSLH"], [0x39, "CAPS"],
  ...Array.from({ length: 12 }, (_, i) => [0x3a + i, `F${i + 1}`]),
  [0x46, "PSCRN"], [0x47, "SLCK"], [0x48, "PAUSE_BREAK"], [0x49, "INS"], [0x4a, "HOME"],
  [0x4b, "PG_UP"], [0x4c, "DEL"], [0x4d, "END"], [0x4e, "PG_DN"],
  [0x4f, "RIGHT"], [0x50, "LEFT"], [0x51, "DOWN"], [0x52, "UP"],
  [0x53, "KP_NUM"], [0x54, "KP_DIVIDE"], [0x55, "KP_MULTIPLY"], [0x56, "KP_MINUS"],
  [0x57, "KP_PLUS"], [0x58, "KP_ENTER"],
  ...Array.from({ length: 9 }, (_, i) => [0x59 + i, `KP_N${i + 1}`]),
  [0x62, "KP_N0"], [0x63, "KP_DOT"], [0x64, "NUBS"], [0x65, "K_APP"],
  [0x66, "K_POWER"], [0x67, "KP_EQUAL"],
  ...Array.from({ length: 12 }, (_, i) => [0x68 + i, `F${i + 13}`]),
  [0x75, "K_HELP"], [0x77, "K_SELECT"], [0x78, "K_STOP"], [0x79, "K_AGAIN"],
  [0x7a, "K_UNDO"], [0x7b, "K_CUT"], [0x7c, "K_COPY"], [0x7d, "K_PASTE"],
  [0x7e, "K_FIND"], [0x7f, "K_MUTE"], [0x80, "K_VOL_UP"], [0x81, "K_VOL_DN"],
  [0x85, "KP_COMMA"],
  [0xe0, "LCTRL"], [0xe1, "LSHFT"], [0xe2, "LALT"], [0xe3, "LGUI"],
  [0xe4, "RCTRL"], [0xe5, "RSHFT"], [0xe6, "RALT"], [0xe7, "RGUI"],
]);

// Usage ID -> ZMK name, consumer page (0x0c). Common media keys only.
export const CONSUMER_USAGES = new Map([
  [0x030, "C_POWER"], [0x031, "C_RESET"], [0x032, "C_SLEEP"],
  [0x0b0, "C_PLAY"], [0x0b1, "C_PAUSE"], [0x0b2, "C_RECORD"],
  [0x0b3, "C_FF"], [0x0b4, "C_RW"], [0x0b5, "C_NEXT"], [0x0b6, "C_PREV"],
  [0x0b7, "C_STOP"], [0x0b8, "C_EJECT"], [0x0cd, "C_PP"],
  [0x0e2, "C_MUTE"], [0x0e9, "C_VOL_UP"], [0x0ea, "C_VOL_DN"],
  [0x06f, "C_BRI_UP"], [0x070, "C_BRI_DN"],
  [0x183, "C_AL_CCC"], [0x18a, "C_AL_MAIL"], [0x192, "C_AL_CALC"],
  [0x194, "C_AL_MY_COMPUTER"], [0x221, "C_AC_SEARCH"], [0x223, "C_AC_HOME"],
  [0x224, "C_AC_BACK"], [0x225, "C_AC_FORWARD"], [0x226, "C_AC_STOP"],
  [0x227, "C_AC_REFRESH"], [0x22a, "C_AC_BOOKMARKS"],
]);

function pageTable(page) {
  if (page === PAGE_KEYBOARD) return KEYBOARD_USAGES;
  if (page === PAGE_CONSUMER) return CONSUMER_USAGES;
  return null;
}

export function keycodeName(value) {
  if ((value >>> 0) === 0) return "NONE";
  const { mods, page, id } = decodeKeycode(value);
  const table = pageTable(page);
  let base = table?.get(id);
  if (base === undefined) base = `0x${page.toString(16).padStart(2, "0")}_${id.toString(16).toUpperCase()}`;
  if (!mods) return base;
  if (mods === LSFT_BIT && page === PAGE_KEYBOARD && SHIFTED_NAMES.has(id)) return SHIFTED_NAMES.get(id);
  const wrappers = MODIFIERS.filter(([, bit]) => mods & bit).map(([name]) => name);
  return wrappers.reduce((inner, mod) => `${mod}(${inner})`, base);
}

export const MODIFIER_KEYS = [
  ["LCTRL", 0xe0], ["LSHFT", 0xe1], ["LALT", 0xe2], ["LGUI", 0xe3],
  ["RCTRL", 0xe4], ["RSHFT", 0xe5], ["RALT", 0xe6], ["RGUI", 0xe7],
];

const MODIFIER_FIRST = 0xe0;
const MODIFIER_LAST = 0xe7;

// Modifier usages are always sendable: they travel in the HID report's modifier
// byte rather than the key array, so the firmware's keyboard_max (which bounds
// the key array) does not apply to them. See validate_hid_usage() in
// vendor/zmk/app/src/behavior.c.
export function isModifierUsage(id) {
  return id >= MODIFIER_FIRST && id <= MODIFIER_LAST;
}

function inRanges(id, ranges) {
  return ranges.some(([lo, hi]) => id >= lo && id <= hi);
}

// Ordered groups for the key picker. First match wins; anything unmatched
// falls into "Other".
const KEYBOARD_GROUPS = [
  ["Modifiers", [[0xe0, 0xe7]]],
  ["Letters", [[0x04, 0x1d]]],
  ["Numbers", [[0x1e, 0x27]]],
  ["Editing", [[0x28, 0x2c], [0x39, 0x39], [0x49, 0x49], [0x4c, 0x4c]]],
  ["Punctuation", [[0x2d, 0x38], [0x64, 0x64]]],
  ["Navigation", [[0x4a, 0x4b], [0x4d, 0x4f], [0x50, 0x52]]],
  ["Function", [[0x3a, 0x45], [0x68, 0x73]]],
  ["Keypad", [[0x53, 0x63], [0x67, 0x67], [0x85, 0x85]]],
  ["System", [[0x46, 0x48], [0x65, 0x66], [0x75, 0x81]]],
];

// --- search ---------------------------------------------------------------

// Words the picker's filter matches besides the ZMK name and the group, so
// people can search by what a key does ("volume", "screenshot", "arrow")
// rather than by how ZMK happens to spell it.
const SEARCH_ALIASES = new Map([
  ["RET", "return enter newline"],
  ["ESC", "escape"],
  ["BSPC", "backspace erase rubout"],
  ["TAB", "tab indent"],
  ["SPACE", "spacebar"],
  ["CAPS", "capslock caps lock"],
  ["DEL", "delete forward"],
  ["INS", "insert"],
  ["PG_UP", "page up"],
  ["PG_DN", "page down"],
  ["UP", "arrow cursor"],
  ["DOWN", "arrow cursor"],
  ["LEFT", "arrow cursor"],
  ["RIGHT", "arrow cursor"],
  ["PSCRN", "print screen screenshot sysrq"],
  ["SLCK", "scroll lock"],
  ["PAUSE_BREAK", "pause break"],
  ["K_APP", "menu context application"],
  ["K_POWER", "power shutdown"],
  ["K_MUTE", "mute audio sound volume"],
  ["K_VOL_UP", "volume up louder audio sound"],
  ["K_VOL_DN", "volume down quieter audio sound"],
  ["K_CUT", "cut clipboard"],
  ["K_COPY", "copy clipboard"],
  ["K_PASTE", "paste clipboard"],
  ["K_UNDO", "undo"],
  ["K_FIND", "find search"],
  ["C_PLAY", "media music playback"],
  ["C_PAUSE", "media music playback"],
  ["C_PP", "play pause toggle media music playback"],
  ["C_STOP", "media music playback"],
  ["C_NEXT", "next track skip forward media music"],
  ["C_PREV", "previous track back media music"],
  ["C_FF", "fast forward media music"],
  ["C_RW", "rewind media music"],
  ["C_RECORD", "record media"],
  ["C_EJECT", "eject disc media"],
  ["C_MUTE", "mute silence audio sound volume media"],
  ["C_VOL_UP", "volume up louder audio sound media"],
  ["C_VOL_DN", "volume down quieter audio sound media"],
  ["C_BRI_UP", "brightness up screen display backlight"],
  ["C_BRI_DN", "brightness down screen display dim backlight"],
  ["C_POWER", "power shutdown"],
  ["C_SLEEP", "sleep suspend"],
  ["C_RESET", "reset restart reboot"],
  ["C_AL_CCC", "lock screen control panel"],
  ["C_AL_MAIL", "email mail launch"],
  ["C_AL_CALC", "calculator launch"],
  ["C_AL_MY_COMPUTER", "files explorer finder launch"],
  ["C_AC_SEARCH", "search browser find"],
  ["C_AC_HOME", "home browser"],
  ["C_AC_BACK", "back browser"],
  ["C_AC_FORWARD", "forward browser"],
  ["C_AC_STOP", "stop browser"],
  ["C_AC_REFRESH", "refresh reload browser"],
  ["C_AC_BOOKMARKS", "bookmarks favorites browser"],
]);

// Aliases for whole families, keyed by name prefix.
const SEARCH_PREFIXES = [
  ["KP_", "keypad numpad"],
  ["C_", "media consumer"],
  ["F", "function fkey"],
];

// Everything the filter may match for one option, lower-cased and pre-joined.
export function searchText(name, groupName = "", id = null) {
  const parts = [name, groupName];
  const alias = SEARCH_ALIASES.get(name);
  if (alias) parts.push(alias);
  for (const [prefix, words] of SEARCH_PREFIXES) {
    // "F" must not pull in every name that merely starts with the letter.
    const matches = prefix === "F" ? /^F\d+$/.test(name) : name.startsWith(prefix);
    if (matches) parts.push(words);
  }
  if (name.includes("_")) parts.push(name.replace(/_/g, " "));
  if (id !== null) {
    // Let people type the character a key produces: "?" finds FSLH.
    if (PLAIN_GLYPHS.has(id)) parts.push(PLAIN_GLYPHS.get(id));
    if (SHIFTED_GLYPHS.has(id)) parts.push(SHIFTED_GLYPHS.get(id));
  }
  return parts.join(" ").toLowerCase();
}

// One picker entry per shifted symbol, so "~" can be bound on its own instead
// of picking GRAVE and remembering to tick LSFT. Encodes as LSFT(<base>),
// which is exactly what ZMK's TILDE, EXCL, ... macros expand to.
function shiftedOptions(keyboardMax) {
  const options = [];
  for (const [id, name] of SHIFTED_NAMES) {
    if (id > keyboardMax) continue;
    const glyph = SHIFTED_GLYPHS.get(id);
    options.push({
      value: encodeKeycode(PAGE_KEYBOARD, id, LSFT_BIT),
      name,
      label: `${name}  ${glyph}`,
      search: `${searchText(name, "Shifted symbols")} ${glyph} shift`.toLowerCase(),
    });
  }
  return options;
}

// Groups of selectable usages for the key picker.
// `keyboardMax` / `consumerMax` come from the device's own behavior metadata.
export function usageGroups(keyboardMax = 0xffff, consumerMax = 0xffff) {
  const buckets = new Map(KEYBOARD_GROUPS.map(([name]) => [name, []]));
  buckets.set("Other", []);

  for (const [id, name] of KEYBOARD_USAGES) {
    if (id === 0) continue; // NONE is offered separately
    if (id > keyboardMax && !isModifierUsage(id)) continue;
    const group = KEYBOARD_GROUPS.find(([, ranges]) => inRanges(id, ranges))?.[0] ?? "Other";
    const glyphs = [PLAIN_GLYPHS.get(id), SHIFTED_GLYPHS.get(id)].filter(Boolean).join(" ");
    buckets.get(group).push({
      value: encodeKeycode(PAGE_KEYBOARD, id),
      name,
      label: glyphs ? `${name}  ${glyphs}` : name,
      search: searchText(name, group, id),
    });
  }

  const media = [];
  for (const [id, name] of CONSUMER_USAGES) {
    if (id > consumerMax) continue;
    media.push({ value: encodeKeycode(PAGE_CONSUMER, id), name, search: searchText(name, "Media") });
  }

  const groups = [{
    name: "None",
    options: [{ value: 0, name: "NONE", search: searchText("NONE", "None") }],
  }];
  for (const [name] of KEYBOARD_GROUPS) {
    const options = buckets.get(name);
    if (options.length) groups.push({ name, options });
    if (name === "Punctuation") groups.push({ name: "Shifted symbols", options: shiftedOptions(keyboardMax) });
  }
  if (buckets.get("Other").length) groups.push({ name: "Other", options: buckets.get("Other") });
  if (media.length) groups.push({ name: "Media", options: media });
  return groups;
}

// --- compact display ------------------------------------------------------

// What the key actually types, unshifted and shifted.
const PLAIN_GLYPHS = new Map([
  [0x2d, "-"], [0x2e, "="], [0x2f, "["], [0x30, "]"], [0x31, "\\"],
  [0x33, ";"], [0x34, "'"], [0x35, "`"], [0x36, ","], [0x37, "."], [0x38, "/"],
]);

const SHIFTED_GLYPHS = new Map([
  [0x1e, "!"], [0x1f, "@"], [0x20, "#"], [0x21, "$"], [0x22, "%"],
  [0x23, "^"], [0x24, "&"], [0x25, "*"], [0x26, "("], [0x27, ")"],
  [0x2d, "_"], [0x2e, "+"], [0x2f, "{"], [0x30, "}"], [0x31, "|"],
  [0x33, ":"], [0x34, '"'], [0x35, "~"], [0x36, "<"], [0x37, ">"], [0x38, "?"],
]);

// ZMK's names for LSFT(<key>), from dt-bindings/zmk/keys.h.
const SHIFTED_NAMES = new Map([
  [0x1e, "EXCL"], [0x1f, "AT"], [0x20, "HASH"], [0x21, "DLLR"], [0x22, "PRCNT"],
  [0x23, "CARET"], [0x24, "AMPS"], [0x25, "STAR"], [0x26, "LPAR"], [0x27, "RPAR"],
  [0x2d, "UNDER"], [0x2e, "PLUS"], [0x2f, "LBRC"], [0x30, "RBRC"], [0x31, "PIPE"],
  [0x33, "COLON"], [0x34, "DQT"], [0x35, "TILDE"], [0x36, "LT"], [0x37, "GT"], [0x38, "QMARK"],
]);

const LSFT_BIT = 0x02;

// Short labels for keys whose ZMK name is too long to read on a keycap.
const SHORT_LABELS = new Map([
  [0x28, "⏎"], [0x29, "ESC"], [0x2a, "⌫"], [0x2b, "⇥"], [0x2c, "SPC"],
  [0x39, "CAPS"], [0x49, "INS"], [0x4a, "HOME"], [0x4b, "PGUP"], [0x4c, "DEL"],
  [0x4d, "END"], [0x4e, "PGDN"],
  [0x4f, "→"], [0x50, "←"], [0x51, "↓"], [0x52, "↑"],
  // Left/right modifiers are spelled out: a superscript marker is too easy to miss.
  [0xe0, "LCTL"], [0xe1, "LSFT"], [0xe2, "LALT"], [0xe3, "LGUI"],
  [0xe4, "RCTL"], [0xe5, "RSFT"], [0xe6, "RALT"], [0xe7, "RGUI"],
]);

const MOD_GLYPHS = [
  [0x01, "⌃"], [0x02, "⇧"], [0x04, "⌥"], [0x08, "⌘"],
  [0x10, "⌃"], [0x20, "⇧"], [0x40, "⌥"], [0x80, "⌘"],
];

const SHIFT_BITS = 0x02 | 0x20;

// A short, keycap-sized label. Falls back to the ZMK name when nothing better
// exists; use keycodeName() when the exact binding matters.
export function keyGlyph(value) {
  if ((value >>> 0) === 0) return "—";
  const { mods, page, id } = decodeKeycode(value);

  if (page === PAGE_CONSUMER) {
    return (CONSUMER_USAGES.get(id) ?? keycodeName(value)).replace(/^C_(AC_|AL_)?/, "");
  }
  if (page !== PAGE_KEYBOARD) return keycodeName(value);

  // A lone shift over a shiftable key is what that key actually types.
  if (mods === (mods & SHIFT_BITS) && mods !== 0 && SHIFTED_GLYPHS.has(id)) {
    return SHIFTED_GLYPHS.get(id);
  }

  let base;
  if (id >= 0x04 && id <= 0x1d) base = String.fromCharCode(65 + (id - 0x04));
  else if (id >= 0x1e && id <= 0x26) base = String(id - 0x1d);
  else if (id === 0x27) base = "0";
  else base = PLAIN_GLYPHS.get(id) ?? SHORT_LABELS.get(id) ?? KEYBOARD_USAGES.get(id) ?? keycodeName(value);

  if (!mods) return base;
  const prefix = MOD_GLYPHS.filter(([bit]) => mods & bit).map(([, glyph]) => glyph).join("");
  return `${prefix}${base}`;
}

// "Momentary Layer" -> "MO". Keeps the behavior readable in a sub-label.
const BEHAVIOR_ABBREVIATIONS = new Map([
  ["momentary layer", "MO"], ["layer tap", "LT"], ["toggle layer", "TOG"],
  ["to layer", "TO"], ["sticky key", "SK"], ["sticky layer", "SL"],
  ["mod-tap", "MT"], ["mod tap", "MT"], ["hold-tap", "HT"], ["hold tap", "HT"],
  ["key repeat", "REP"], ["caps word", "CAPSW"], ["key toggle", "KT"],
  ["bluetooth", "BT"], ["reset", "RESET"], ["bootloader", "BOOT"],
  ["mouse button press", "MB"], ["mouse move", "MMV"], ["mouse scroll", "MSC"],
]);

// Named constants a behavior takes as its first parameter: BT_CLR_ALL reaches
// us as "Clear All Profiles", which has to fit on a keycap.
const CONSTANT_ABBREVIATIONS = new Map([
  ["clear all profiles", "CLR ALL"],
  ["clear profile", "CLR"],
  ["select profile", "SEL"],
  ["next profile", "NEXT"],
  ["previous profile", "PREV"],
  ["disconnect profile", "DISC"],
  ["toggle usb/ble", "USB/BT"],
  ["toggle", "TOGGLE"],
  ["usb", "USB"],
  ["ble", "BLE"],
]);

export function constantAbbreviation(name) {
  const key = name.trim().toLowerCase();
  const known = CONSTANT_ABBREVIATIONS.get(key);
  if (known) return known;
  const words = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length > 1 && name.length > 7) return words.map((w) => w[0].toUpperCase()).join("");
  return name.toUpperCase().slice(0, 8);
}

export function behaviorAbbreviation(displayName) {
  const key = displayName.trim().toLowerCase();
  const known = BEHAVIOR_ABBREVIATIONS.get(key);
  if (known) return known;
  const words = displayName.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0].toUpperCase()).join("");
  return displayName.length > 6 ? displayName.slice(0, 6) : displayName;
}

// The symbol this key produces when shifted, for the stacked keycap legend.
// Only meaningful for an unshifted binding: a key already bound to LSFT(1)
// types "!" outright and has no second legend.
export function shiftedTwin(value) {
  const { mods, page, id } = decodeKeycode(value);
  if (mods !== 0 || page !== PAGE_KEYBOARD) return null;
  return SHIFTED_GLYPHS.get(id) ?? null;
}

// --- browser keyboard events ----------------------------------------------

// KeyboardEvent.code -> HID keyboard usage id, so a real keypress can be
// matched against what the keymap says should be at that position.
const CODE_TO_USAGE = new Map([
  ...Array.from({ length: 26 }, (_, i) => [`Key${String.fromCharCode(65 + i)}`, 0x04 + i]),
  ["Digit1", 0x1e], ["Digit2", 0x1f], ["Digit3", 0x20], ["Digit4", 0x21], ["Digit5", 0x22],
  ["Digit6", 0x23], ["Digit7", 0x24], ["Digit8", 0x25], ["Digit9", 0x26], ["Digit0", 0x27],
  ["Enter", 0x28], ["Escape", 0x29], ["Backspace", 0x2a], ["Tab", 0x2b], ["Space", 0x2c],
  ["Minus", 0x2d], ["Equal", 0x2e], ["BracketLeft", 0x2f], ["BracketRight", 0x30],
  ["Backslash", 0x31], ["Semicolon", 0x33], ["Quote", 0x34], ["Backquote", 0x35],
  ["Comma", 0x36], ["Period", 0x37], ["Slash", 0x38], ["CapsLock", 0x39],
  ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 0x3a + i]),
  ["PrintScreen", 0x46], ["ScrollLock", 0x47], ["Pause", 0x48],
  ["Insert", 0x49], ["Home", 0x4a], ["PageUp", 0x4b], ["Delete", 0x4c],
  ["End", 0x4d], ["PageDown", 0x4e],
  ["ArrowRight", 0x4f], ["ArrowLeft", 0x50], ["ArrowDown", 0x51], ["ArrowUp", 0x52],
  ["NumLock", 0x53], ["NumpadDivide", 0x54], ["NumpadMultiply", 0x55], ["NumpadSubtract", 0x56],
  ["NumpadAdd", 0x57], ["NumpadEnter", 0x58],
  ...Array.from({ length: 9 }, (_, i) => [`Numpad${i + 1}`, 0x59 + i]),
  ["Numpad0", 0x62], ["NumpadDecimal", 0x63], ["ContextMenu", 0x65],
  ["ControlLeft", 0xe0], ["ShiftLeft", 0xe1], ["AltLeft", 0xe2], ["MetaLeft", 0xe3],
  ["ControlRight", 0xe4], ["ShiftRight", 0xe5], ["AltRight", 0xe6], ["MetaRight", 0xe7],
]);

export function usageForEventCode(code) {
  return CODE_TO_USAGE.get(code) ?? null;
}
