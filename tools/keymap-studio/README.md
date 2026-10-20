# Corne Keymap Studio

A local, zero-dependency client for editing this keyboard's keymap over USB while
it is plugged in. Changes take effect on the next keypress; nothing is written to
flash until you press **Save to flash**.

No `npm install`, no bundler, no `node_modules`, and nothing is fetched at runtime —
consistent with the vendoring policy in [VENDOR.md](../../VENDOR.md).

## Requirements

- Left half flashed with the **studio** firmware (`eyelash_corne_studio_left` in
  [`build.yaml`](../../build.yaml): `CONFIG_ZMK_STUDIO=y`, snippet `studio-rpc-usb-uart`).
- A Chromium-based browser (Chrome or Edge). WebSerial is not available in Firefox or Safari.
- Python 3, only to serve the directory over `http://localhost` — WebSerial requires a
  secure context, and `file://` does not qualify.

## Running it

From the repository root:

```bash
# start the app (serves http://localhost:8181/)
tools/keymap-studio/serve.sh

# or pick a different port
tools/keymap-studio/serve.sh 9000

# open it
open http://localhost:8181/            # macOS
xdg-open http://localhost:8181/        # Linux
```

Leave that terminal running — it is the server. `Ctrl-C` stops it.

Equivalent invocations, if you prefer:

```bash
python3 tools/keymap-studio/serve.py 8181     # same thing, no wrapper
cd tools/keymap-studio && ./serve.sh          # from inside the directory
```

Run the tests (no hardware or server needed):

```bash
node tools/keymap-studio/test.js
```

If the port is already taken, free it or use another:

```bash
lsof -ti tcp:8181 | xargs kill        # stop a server left running
```

### Linux

The keyboard shows up as `/dev/ttyACM0` (or `ttyACM1`), owned by the `uucp` group
on Arch-based distros (`dialout` on Debian/Ubuntu). The browser can't open it until
your user is in that group:

```bash
sudo usermod -aG uucp "$USER"      # Debian/Ubuntu: dialout instead of uucp
# then log out and back in (or reboot) so the new group applies
```

For the flash steps, the bootloader drive (`NICENANO`) has to be mounted. An
automounter such as udiskie or a desktop file manager mounts it under
`/run/media/$USER/` or `/media/$USER/`, which the server checks. Without one,
mount it yourself: `udisksctl mount -b /dev/sdX` (`lsblk` shows which device).

> `file:///…/index.html` will **not** work: WebSerial needs a secure context, and
> a `file://` page is not one. It has to be served over `http://localhost`.

## Use

Plug the **left** half in over USB, open the page, click **Connect**, and pick the
keyboard's serial port from the browser prompt (on macOS it appears as a
`usbmodem` device; there are usually two — the studio RPC port is the one that
answers, so if the first choice times out, try the other).

Then:

- Pick a layer in the left sidebar, click a key, choose a behavior and its parameters, **Apply to keyboard**.
- The header shows **unsaved changes** while the device holds edits in RAM.
- **Save to flash** persists them; **Discard** reverts to what is in flash.
- Layers can be added, renamed, reordered and removed from the sidebar.

## Combos

Combos are **not** part of the ZMK Studio protocol — the device cannot report or
accept them over RPC. They are devicetree, living in `config/eyelash_corne.keymap`,
so the Combos panel reads and writes that file through the server's `/api/keymap`
endpoint. **A combo change only takes effect after a rebuild and flash**, unlike
every other edit in this tool, which is live.

- Combos on the current layer mark their keys with a green dot; selecting one
  highlights its keys on the board.
- **Edit** or **New combo**, then click keys on the board to choose the positions
  (numbered in press order) and fill in the binding, e.g. `&kp ESCAPE`. You do
  **not** need USB for this: **New combo** shows a static Eyelash Corne layout from
  the repo, and you can type positions manually (e.g. `23 24`) if you prefer.
- **Binding reference** lists every standard ZMK binding with its parameters and
  an example, tags which ones the connected firmware reports and which your keymap
  already uses, and adds the custom behaviors your keymap declares (`&rsr_vol`,
  `&rsr_trans`). **Use** drops one into the binding field.
- Leaving every layer unticked means the combo is active on all layers, which is
  how ZMK reads a missing `layers` property.
- Properties the parser does not recognise are carried through untouched, and an
  unchanged round-trip rewrites the file byte-for-byte.

This build sets `CONFIG_ZMK_STUDIO_LOCKING=n`, so no unlock gesture is needed. If
you re-enable locking, the device answers with `UNLOCK_REQUIRED` until unlocked.

Edits made here live in the keyboard's settings partition and **override**
`config/eyelash_corne.keymap` until the settings are reset. Treat the `.keymap`
file as the source of truth: once you settle on a layout, mirror the change back
into it and rebuild, or a later `settings_reset` flash will silently undo your work.

## Typing test

**Start** in the Typing test strip listens to the browser's keyboard events —
which is exactly what the keyboard is sending as a HID device — and lights up the
matching keys on the board, with a readout of the last ten presses and the
positions they landed on. Keystrokes are swallowed while it runs, so nothing types
into the page.

A key shown as *not on this layer* means the HID usage that arrived is not bound
anywhere on the layer you are viewing: it came from another layer, a combo, or a
key whose binding differs from what the board shows. Layer keys (`&mo`) and other
behaviors that send no HID usage never appear — the browser only sees what the
keyboard actually types.

## Applying combos

Because combos are compiled in, the **Apply to keyboard** panel runs the whole
pipeline from the page:

1. **Commit & push** — stages *only* `config/eyelash_corne.keymap`, commits it with
   your message, and pushes the current branch. Other modified files are never
   swept in. Pushing `main` is blocked by a repository ruleset, so work on a branch.
2. **CI build** — polls GitHub Actions every 10s for the build of that exact commit
   and reports success, failure or a link to the run.
### Remove all combos but keep keybinds

Combos exist only in the compiled firmware (`combos { … }` in the keymap file), not
in the Studio settings partition. To wipe combos and leave layer bindings alone:

1. In the Combos panel, delete every combo (or remove the whole `combos` node in the
   file) and save.
2. **Commit & push**, wait for CI.
3. On the apply steps, click **Skip — keep saved keybinds** (do **not** flash
   `settings_reset`).
4. **Flash left** and **Flash right** from that build.

Your USB/Studio keybind overrides stay in flash; only combo behavior changes.

3. **Settings reset (both halves, optional)** — from the same CI zip, flash
   `settings_reset-nice_nano_v2-zmk.uf2` to the **left**, then the **right**
   (USB + double-tap reset each time). This erases Studio-saved layer bindings,
   RGB/backlight prefs, Bluetooth bonds, and other flash settings so the keyboard
   matches the compiled keymap and your new combos — not an older live edit.
   Bluetooth stays off until you flash normal firmware again; re-pair hosts afterward.
4. **Flash left** — double-tap reset on the **left** half; copies
   `eyelash_corne_studio_left.uf2` from the CI artifact.
5. **Flash right** — plug in the **right** half, double-tap reset, **Flash right**
   (`eyelash_corne_right … .uf2`). **Required for combo changes** on keys like N, M,
   ,, . — the old left-only flash left stale combos on the right half.

**Reset saved keymap (USB)** (optional, while connected) calls the Studio RPC that
drops only keymap overrides in flash. It is **not** a substitute for flashing
`settings_reset` on both halves when you want a clean slate.

Needs `git` and an authenticated `gh` CLI.

## Layout

| File | Role |
|------|------|
| `proto.js` | Minimal protobuf wire codec (varint, length-delimited, zigzag) |
| `framing.js` | SOF/ESC/EOF framing, mirroring `vendor/zmk/app/src/studio/msg_framing.c` |
| `messages.js` | Encoders and decoders for the `zmk.core` / `zmk.behaviors` / `zmk.keymap` subsystems |
| `client.js` | WebSerial transport, request queue, response correlation, notifications |
| `keycodes.js` | HID usage tables and the `(mods << 24) \| (page << 16) \| id` keycode packing |
| `app.js` | UI: layer list, physical-layout key grid, binding inspector |
| `combos.js` | Parses and rewrites the `combos` node of the .keymap devicetree |
| `bindings.js` | Binding reference data, plus scanners for behaviors the keymap defines and uses |
| `serve.py` | Local static server, no-store headers, the `/api/keymap` endpoint, and the commit/build/flash pipeline |
| `test.js` | Offline protocol and combo tests — no hardware required |

The message definitions this implements are vendored at
[`vendor/zmk-studio-messages/proto/zmk/`](../../vendor/zmk-studio-messages/proto/zmk).
If those protos change, update `messages.js` to match.

## Tests

`node tools/keymap-studio/test.js` builds device-shaped frames, runs them through
the real decoders, re-parses the tool's own requests the way the firmware would,
and round-trips the combo parser against the keymap.

## Not implemented

- The `zmk.custom` subsystem (field 100) used by the vendored `settings-rpc`,
  `ble-management` and `battery-history` modules. `client.js` surfaces those
  responses as raw bytes.
- BLE (GATT) transport — USB only.
- Live combo editing. The protocol has no combo messages, so the Combos panel
  edits the source file and needs a rebuild; it cannot push a combo to a running
  keyboard.
- `combos.js` handles the flat `name { prop = <…>; }` shape combos actually use,
  not devicetree in general — no macros, includes or nested nodes inside a combo.
