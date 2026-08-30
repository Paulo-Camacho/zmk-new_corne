# Vendor Autonomy

This branch vendors all third-party keyboard vendor dependencies inside the repository. Builds no longer download code from `cormoran/*` or `a741725193/*` on GitHub.

## What is vendored

| Directory | Original source |
|-----------|-----------------|
| `vendor/zmk` | `cormoran/zmk` @ `v0.3-branch+dya` |
| `vendor/zmk-studio-messages` | `cormoran/zmk-studio-messages` |
| `vendor/zmk-behavior-runtime-sensor-rotate` | `cormoran/zmk-behavior-runtime-sensor-rotate` |
| `vendor/zmk-module-ble-management` | `cormoran/zmk-module-ble-management` |
| `vendor/zmk-module-battery-history` | `cormoran/zmk-module-battery-history` |
| `vendor/zmk-module-settings-rpc` | `cormoran/zmk-module-settings-rpc` |
| `vendor/zmk-module-runtime-input-processor` | `cormoran/zmk-module-runtime-input-processor` |

Exact commit SHAs are recorded in [`vendor/VENDOR_LOCK.yml`](vendor/VENDOR_LOCK.yml).

Board shield definitions remain in this repo under `boards/shields/eyelash_corne/`. The old `eyelash_corne` west project is no longer fetched.

## What still downloads at build time

Only official ZMK/Zephyr upstream dependencies (for example Zephyr and nanopb from `zmkfirmware`) are still fetched on first build. These are not vendor-specific keyboard firmware forks.

## Local build

```bash
bash scripts/setup-vendor-workspace.sh
west init -l config
west update
west zephyr-export
west build -s zmk/app -b nice_nano_v2 -- -DSHIELD="eyelash_corne_left nice_view" -DZMK_CONFIG="$(pwd)/config" \
  -DZMK_EXTRA_MODULES="$(pwd);$(pwd)/vendor/zmk-behavior-runtime-sensor-rotate;$(pwd)/vendor/zmk-module-ble-management;$(pwd)/vendor/zmk-module-battery-history;$(pwd)/vendor/zmk-module-settings-rpc;$(pwd)/vendor/zmk-module-runtime-input-processor"
```

## Updating vendored code

1. Download new sources manually from the original repos (if you choose to trust an update).
2. Replace the matching directory under `vendor/`.
3. Update `vendor/VENDOR_LOCK.yml` with the new commit SHAs.
4. Rebuild and test firmware before flashing.

## CI

GitHub Actions runs `scripts/setup-vendor-workspace.sh` before `west init`, then builds using the vendored tree. No vendor GitHub URLs are contacted for ZMK or cormoran modules.
