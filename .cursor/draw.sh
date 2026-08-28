#!/usr/bin/env bash
# Regenerate the keymap YAML + SVG with keymap-drawer, mirroring the
# draw.yml GitHub Actions workflow.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ZMK_VENV_DIR:-$HOME/zmk-venv}"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
cd "$REPO_DIR"

echo "==> Parsing keymap"
keymap -c keymap_drawer.config.yaml parse -z config/eyelash_corne.keymap \
  > keymap-drawer/eyelash_corne.yaml

echo "==> Drawing keymap"
keymap -c keymap_drawer.config.yaml draw keymap-drawer/eyelash_corne.yaml \
  > keymap-drawer/eyelash_corne.svg

echo "==> Wrote keymap-drawer/eyelash_corne.yaml and keymap-drawer/eyelash_corne.svg"
