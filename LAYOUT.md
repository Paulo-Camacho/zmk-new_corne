# Eyelash Corne — Programmer Layout Reference

Quick reference for layers, combos, and thumb keys.  
Visual diagram: [`keymap-drawer/eyelash_corne.svg`](keymap-drawer/eyelash_corne.svg)

---

## Layer overview

| Layer | Name | How to activate | Purpose |
|-------|------|-----------------|---------|
| 0 | **BASE** | Default | QWERTY typing + combos |
| 1 | **NUMBER** | Hold right inner thumb (`mo 1`) | Numbers, arrows |
| 2 | **SYMBOL** | Hold left inner thumb (`mo 2`) | Code symbols `[]{}()` etc. |
| 3 | **Fn** | Hold right outer thumb (`mo 3`) | F-keys, BT, RGB, reset |

---

## Layer 0 — BASE

```
LEFT HAND                              (joystick unbound)       RIGHT HAND
┌────┬────┬────┬────┬────┬────┐                            ┌────┬────┬────┬────┬────┬────┐
│Tab │ Q  │ W  │ E  │ R  │ T  │                            │ Y  │ U  │ I  │ O  │ P  │Bsp │
├────┼────┼────┼────┼────┼────┤                            ├────┼────┼────┼────┼────┼────┤
│Cmd │ A  │ S  │ D  │ F  │ G  │                            │ H  │ J  │ K  │ L  │ ;  │ '  │
├────┼────┼────┼────┼────┼────┤                            ├────┼────┼────┼────┼────┼────┤
│Shft│ Z  │ X  │ C  │ V  │ B  │                            │ N  │ M  │ ,  │ .  │ /  │Shft│
│    │    │    │    │    │Ret │                            │    │    │    │    │    │    │
└────┴────┴────┴────┴────┴────┘                            └────┴────┴────┴────┴────┴────┘
     ┌────┐ ┌────┐ ┌────┐              ┌──────────┬──────────┬──────────┐
     │Ctrl│ │Opt │ │Sym │              │   Num    │  Space   │   Fn   │
     └────┘ └────┘ └────┘              └──────────┴──────────┴──────────┘
```

### Joystick (all layers)

All 5-way joystick keys are unbound (`&none`). Use thumb **Space**, **Enter** (below `B`), or **NUMBER layer** arrows instead.

### Encoder (left half)

| Layer | Action |
|-------|--------|
| BASE / NUMBER / SYMBOL / Fn | Volume up / down |

---

## Layer 1 — NUMBER

Hold **right inner thumb**.

```
TOP:    `  1  2  3  4  5  |  6  7  8  9  0  Bsp
HOME:   (  )  {  }  ·  |  ←  ↓  ↑  →  Home PgUp
        A  S  D  F        H  J  K  L  ;  '
BOT:    ·  ·  [  ]  ·  Mute |  ·  ·  ·  ·  End PgDn
THUMBS: ·  ·  ·           |  Ins Del ·
```

Also: mouse movement via joystick directions on this layer.

---

## Layer 2 — SYMBOL

Hold **left inner thumb**.

```
TOP:    ~  !  @  #  $  %  |  ^  &  *  (  )  Bsp
HOME:   ·  -  =  [  ]  |  _  +  {  }  |  `
BOT:    ·  ·  ·  ·  ·  |  ~  /  ;  :  Del
THUMBS: ·  ·  ·           |  Ret ·  ·
```

Optimized for programming: brackets and operators on the home row.

---

## Layer 3 — Fn

Hold **right outer thumb** (Fn only — no Alt tap).

```
TOP:    Studio F1 F2 F3 F4 F5  |  F6  F7  F8  F9  F10 F11
HOME:   ·  BT BT BT BT BT |  RGBon RGBeff RGBefr RGBspi RGBbri RGBbrd
           clr 0  1  2  3   (S D F G)
BOT:    RGBoff reset mouse ·  ·  Mute |  ·  ·  boot reset Scroll Pause
THUMBS: ·  ·  ·                |  ·  ·  ·
```

---

## Combos (press keys together)

Combos work on **BASE layer only** unless noted.  
`require-prior-idle-ms = 150` helps avoid false triggers while typing normally.

| Combo | Keys | Output | Notes |
|-------|------|--------|-------|
| **jk_esc** | `J` + `K` | Escape | Vim / IDE quit dialogs |
| **df_ret** | `D` + `F` | Enter | Extra enter on home row |
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
| Bottom-right (`/` row) | Shift | — |
| Left thumbs | Ctrl · Option · **SYMBOL** layer | Hold for layer |
| Right inner thumb | — | **NUMBER** layer |
| Right middle thumb | **Space** | — |
| Right outer thumb | — | **Fn** layer (hold only) |

---

## Tips for programmers

1. **Escape** — use `J+K` combo.
2. **Backtick / tilde** — hold **NUMBER** layer (right inner thumb), key left of `1`: `` ` `` (Shift → `~`). **SYMBOL** (left inner thumb) same spot: `~`. Or `,+.` combo on BASE.
3. **Brackets** — hold **left** thumb for SYMBOL, then `F`/`G` for `[` `]`, or `K`/`L` for `{` `}` (`H`/`J` for `_`/`+`).
4. **Arrows** — hold **right** inner thumb for NUMBER layer home row.
5. **Enter** — `D+F` combo on the left home row, or thumb Enter below `B`.
6. **Space** — right middle thumb.

---

## Flashing updates

After editing `config/eyelash_corne.keymap`:

1. Push to GitHub
2. Download `.uf2` from Actions
3. Flash left and right halves via bootloader (double-tap reset)
