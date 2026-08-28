# Eyelash Corne — Programmer Layout Reference

Quick reference for layers, combos, and thumb keys.  
Visual diagram: [`keymap-drawer/eyelash_corne.svg`](keymap-drawer/eyelash_corne.svg)

---

## Layer overview

| Layer | Name | How to activate | Purpose |
|-------|------|-----------------|---------|
| 0 | **BASE** | Default | QWERTY typing + combos |
| 1 | **NUMBER** | Hold left inner thumb (`mo 1`) | Numbers, arrows, Bluetooth, RGB |
| 2 | **SYMBOL** | Hold right inner thumb | Code symbols `[]{}()` etc. |
| 3 | **Fn** | Hold right outer thumb | F-keys, reset, Studio unlock |

---

## Layer 0 — BASE

```
LEFT HAND                              JOYSTICK                 RIGHT HAND
┌────┬────┬────┬────┬────┬────┐       ┌───┐       ┌────┬────┬────┬────┬────┬────┐
│Tab │ Q  │ W  │ E  │ R  │ T  │       │ ▲ │       │ Y  │ U  │ I  │ O  │ P  │Bsp │
├────┼────┼────┼────┼────┼────┤       │◄─┼─►│       ├────┼────┼────┼────┼────┼────┤
│Cmd │ A  │ S  │ D  │ F  │ G  │       │Spc│       │ H  │ J  │ K  │ L  │ ;  │ '  │
├────┼────┼────┼────┼────┼────┤       │ ▼ │       ├────┼────┼────┼────┼────┼────┤
│Shft│ Z  │ X  │ C  │ V  │ B  │       └───┘       │ N  │ M  │ ,  │ .  │ /  │ `  │
│    │    │    │    │    │Ret │                   │    │    │    │    │    │    │
└────┴────┴────┴────┴────┴────┘                   └────┴────┴────┴────┴────┴────┘
     ┌────┐ ┌────┐ ┌────┐              ┌──────────┬──────────┬──────────┐
     │Ctrl│ │Opt │ │Num │              │Enter / Fn│  Space   │Alt / Sym │
     └────┘ └────┘ └────┘              └──────────┴──────────┴──────────┘
```

### Joystick (BASE layer)

| Input | Action |
|-------|--------|
| ▲ | Up arrow |
| ▼ | Down arrow |
| ◄ | Left arrow |
| ► | Right arrow |
| Press | **Space** |

### Encoder (left half)

| Layer | Action |
|-------|--------|
| BASE / NUMBER / SYMBOL / Fn | Volume up / down |

---

## Layer 1 — NUMBER

Hold **left inner thumb** (between Gui and Space).

```
TOP:    1  2  3  4  5  |  6  7  8  9  0  Bsp
HOME:   BT BT BT BT BT  |  ←  ↓  ↑  →  Home PgUp
        clr 0  1  2  3
BOT:    RGB RGB ·  ·  RGB |  RGB RGB RGB RGB End PgDn
        off on     eff      efr spi bri brd
THUMBS: ·  ·  ·           |  Ins Del ·
```

Also: mouse movement via joystick directions on this layer.

---

## Layer 2 — SYMBOL

Hold **right inner thumb** (between Enter and Alt).

```
TOP:    !  @  #  $  %  |  ^  &  *  (  )  Bsp
HOME:   ·  -  =  [  ]  |  {  }  |  `  "
BOT:    ·  _  +  {  }  |  ~  /  ;  :  Del
THUMBS: ·  ·  ·           |  Ret ·  ·
```

Optimized for programming: brackets and operators on the home row.

---

## Layer 3 — Fn

Hold **Space** or **Enter** (layer-tap).

```
TOP:    Studio F1 F2 F3 F4 F5  |  F6  F7  F8  F9  F10 F11
HOME:   ·  ·  mouse buttons    |  bootloader, print screen, F12
BOT:    ·  reset ·  bootloader |  ·  ·  bootloader reset Scroll Pause
THUMBS: ·  ·  ·                |  ·  ·  ·
```

---

## Combos (press keys together)

Combos work on **BASE layer only** unless noted.  
`require-prior-idle-ms = 150` helps avoid false triggers while typing normally.

| Combo | Keys | Output | Notes |
|-------|------|--------|-------|
| **jk_esc** | `J` + `K` | Escape | Vim / IDE quit dialogs |
| **df_tab** | `D` + `F` | Tab | Indent, focus next field |
| **ui_bksp** | `U` + `I` | Backspace | Delete without reaching |
| **op_del** | `O` + `P` | Delete | Forward delete |
| **nm_ret** | `N` + `M` | Enter | Extra enter on bottom row |
| **scq_bksp** | `;` + `'` | Backspace | Alternate delete |
| **cd_grave** | `,` + `.` | `` ` `` | Backtick (shell, templates) |
| **softoff** | `Q` + `S` + `Z` (hold 2s) | Deep sleep | Wake via reset button |

### Combo key positions (for editing keymap)

| Key | Position |
|-----|----------|
| Q | 1 |
| U | 8 |
| I | 9 |
| O | 10 |
| P | 11 |
| S | 15 |
| D | 16 |
| F | 17 |
| J | 23 |
| K | 24 |
| ; | 26 |
| ' | 27 |
| Z | 29 |
| N | 36 |
| M | 37 |
| , | 38 |
| . | 39 |

---

## Tap-dances & holds

| Key | Tap | Hold |
|-----|-----|------|
| Left pinky (`A` row) | Command (⌘) | — |
| Bottom-left (`Z` row) | Shift | — |
| Left thumbs | Ctrl · Option · NUMBER layer | Hold for layer |
| Right inner thumb | Enter | Fn layer |
| Right middle thumb | **Space** | — |
| Right outer thumb | Alt | SYMBOL layer |

---

## Tips for programmers

1. **Escape** — use `J+K` combo; corner key is `` ` `` (backtick) instead.
2. **Brackets** — hold right thumb for SYMBOL, then `F`/`G` for `[` `]`, or `H`/`J` for `{` `}`.
3. **Arrows** — joystick on BASE; also available on NUMBER layer.
4. **Tab** — `D+F` combo without moving to thumb keys.
5. **Enter** — inner key below `B`, or `N+M` combo.
6. **Space** — joystick press (center), or `N+M` combo for enter alternative.

---

## Flashing updates

After editing `config/eyelash_corne.keymap`:

1. Push to GitHub
2. Download `.uf2` from Actions
3. Flash left and right halves via bootloader (double-tap reset)
