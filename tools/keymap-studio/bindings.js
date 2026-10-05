// Reference for ZMK binding syntax.
//
// A binding in a .keymap file is an "&" reference to a behavior, followed by
// however many parameters that behavior takes:
//
//     &kp ESCAPE      the key-press behavior, parameter ESCAPE
//     &mo 1           momentary layer, parameter: layer 1
//     &soft_off       no parameters
//
// `studioName` links an entry to the display name the firmware reports over
// RPC, so the sheet can mark what this particular build actually has.

export const BINDING_GROUPS = [
  {
    group: "Keys",
    entries: [
      {
        code: "&kp", params: "<keycode>", example: "&kp ESCAPE",
        studioName: "Key Press",
        what: "Press and release a key while held. The everyday binding.",
      },
      {
        code: "&sk", params: "<modifier>", example: "&sk LSHFT",
        studioName: "Sticky Key",
        what: "Applies to the next key pressed, then releases. One-shot shift.",
      },
      {
        code: "&mt", params: "<held> <tapped>", example: "&mt LCTRL A",
        studioName: "Mod-Tap",
        what: "Hold for the modifier, tap for the key.",
      },
      {
        code: "&key_repeat", params: "", example: "&key_repeat",
        studioName: "Key Repeat",
        what: "Repeats whatever key was pressed last.",
      },
      {
        code: "&caps_word", params: "", example: "&caps_word",
        studioName: "Caps Word",
        what: "Shifts letters until a non-word character ends it.",
      },
      {
        code: "&none", params: "", example: "&none",
        studioName: "None",
        what: "Key does nothing, and does not fall through to a lower layer.",
      },
      {
        code: "&trans", params: "", example: "&trans",
        studioName: "Transparent",
        what: "Falls through to whatever the layer below has here.",
      },
    ],
  },
  {
    group: "Layers",
    entries: [
      {
        code: "&mo", params: "<layer>", example: "&mo 1",
        studioName: "Momentary Layer",
        what: "Layer is active only while the key is held.",
      },
      {
        code: "&lt", params: "<layer> <keycode>", example: "&lt 2 SPACE",
        studioName: "Layer Tap",
        what: "Hold for the layer, tap for the key.",
      },
      {
        code: "&tog", params: "<layer>", example: "&tog 3",
        studioName: "Toggle Layer",
        what: "Flips the layer on or off and leaves it there.",
      },
      {
        code: "&to", params: "<layer>", example: "&to 0",
        studioName: "To Layer",
        what: "Switches to this layer and turns off the others.",
      },
      {
        code: "&sl", params: "<layer>", example: "&sl 2",
        studioName: "Sticky Layer",
        what: "Layer stays on for exactly one key press.",
      },
    ],
  },
  {
    group: "Mouse",
    entries: [
      {
        code: "&mkp", params: "<button>", example: "&mkp LCLK",
        studioName: "Mouse Button Press",
        what: "Mouse click. LCLK, RCLK, MCLK.",
      },
      {
        code: "&mmv", params: "<direction>", example: "&mmv MOVE_UP",
        studioName: "Mouse Move",
        what: "Moves the pointer while held.",
      },
      {
        code: "&msc", params: "<direction>", example: "&msc SCRL_DOWN",
        studioName: "Mouse Scroll",
        what: "Scrolls while held.",
      },
    ],
  },
  {
    group: "Bluetooth and output",
    entries: [
      {
        code: "&bt", params: "<action> [profile]", example: "&bt BT_SEL 0",
        studioName: "Bluetooth",
        what: "BT_SEL n picks a profile, BT_CLR forgets the current one, BT_NXT/BT_PRV cycle.",
      },
      {
        code: "&out", params: "<target>", example: "&out OUT_USB",
        studioName: "Output Selection",
        what: "Forces output to USB or BLE. OUT_TOG swaps.",
      },
    ],
  },
  {
    group: "Lighting",
    entries: [
      {
        code: "&rgb_ug", params: "<action>", example: "&rgb_ug RGB_TOG",
        studioName: "RGB Underglow",
        what: "RGB_TOG on/off, RGB_HUI/HUD hue, RGB_BRI/BRD brightness, RGB_EFF effect.",
      },
      {
        code: "&bl", params: "<action>", example: "&bl BL_TOG",
        studioName: "Backlight",
        what: "BL_TOG on/off, BL_INC / BL_DEC brightness.",
      },
    ],
  },
  {
    group: "System",
    entries: [
      {
        code: "&sys_reset", params: "", example: "&sys_reset",
        studioName: "Reset",
        what: "Reboots the keyboard.",
      },
      {
        code: "&bootloader", params: "", example: "&bootloader",
        studioName: "Bootloader",
        what: "Reboots into the bootloader so you can drop new firmware on it.",
      },
      {
        code: "&soft_off", params: "", example: "&soft_off",
        studioName: "Soft Off",
        what: "Powers the keyboard down until the on-key or a reset wakes it.",
      },
      {
        code: "&studio_unlock", params: "", example: "&studio_unlock",
        studioName: "Studio Unlock",
        what: "Unlocks live editing when CONFIG_ZMK_STUDIO_LOCKING is on. This build has locking off, so it is not needed.",
      },
      {
        code: "&ext_power", params: "<action>", example: "&ext_power EP_TOG",
        studioName: "External Power",
        what: "Cuts or restores power to peripherals like the display and LEDs.",
      },
    ],
  },
];

// Behaviors and macros the keymap file defines itself, e.g.
//     rsr_vol: rsr_vol { compatible = "..."; };
// These only exist in this keymap, so they are listed separately.
export function scanLocalBehaviors(keymapText) {
  const found = new Map();
  for (const [, label] of keymapText.matchAll(/^\s*([a-z_][\w]*)\s*:\s*[\w-]+\s*\{/gm)) {
    found.set(`&${label}`, { code: `&${label}`, params: "", example: `&${label}`, local: true });
  }
  return [...found.values()];
}

// Every "&name" the keymap actually uses, so the sheet can say what is in play.
export function scanUsedBindings(keymapText) {
  return new Set([...keymapText.matchAll(/&([a-z_][\w]*)/g)].map((m) => `&${m[1]}`));
}
