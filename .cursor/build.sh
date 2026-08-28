#!/usr/bin/env bash
# Build the Eyelash Corne ZMK firmware for every target in build.yaml and
# collect the resulting .uf2 files under build/artifacts/.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ZMK_VENV_DIR:-$HOME/zmk-venv}"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
cd "$REPO_DIR"

ARTIFACTS="$REPO_DIR/build/artifacts"
mkdir -p "$ARTIFACTS"

build_one() {
  local name="$1"; shift
  local dir="$REPO_DIR/build/$name"
  echo "==> Building $name"
  west build -p -s zmk/app -b nice_nano_v2 -d "$dir" "$@"
  cp "$dir/zephyr/zmk.uf2" "$ARTIFACTS/${name}.uf2"
}

# Targets mirror build.yaml.
build_one "eyelash_corne_right" \
  -- -DSHIELD="eyelash_corne_right nice_view" -DZMK_CONFIG="$REPO_DIR/config"

build_one "eyelash_corne_studio_left" \
  -S studio-rpc-usb-uart \
  -- -DSHIELD="eyelash_corne_left nice_view" -DZMK_CONFIG="$REPO_DIR/config" \
     -DCONFIG_ZMK_STUDIO=y -DCONFIG_ZMK_STUDIO_LOCKING=n

build_one "settings_reset" \
  -- -DSHIELD="settings_reset" -DZMK_CONFIG="$REPO_DIR/config"

echo "==> Firmware artifacts:"
ls -lh "$ARTIFACTS"
