#!/usr/bin/env bash
# Prepare a west workspace using vendored sources instead of vendor GitHub repos.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

init_vendor_git_repo() {
  local dir="$1"
  local branch="${2:-vendor}"

  rm -rf "${dir}/.git"
  git -C "$dir" init -q
  git -C "$dir" add -A
  git -C "$dir" -c user.email="build@localhost" -c user.name="ZMK Build" commit -qm "vendored snapshot"
  git -C "$dir" branch -M "$branch"
}

echo "Setting up vendored ZMK workspace at ${ROOT}"

rm -rf "$ROOT/zmk"
cp -a "$ROOT/vendor/zmk" "$ROOT/zmk"
init_vendor_git_repo "$ROOT/zmk" vendor

mkdir -p "$ROOT/modules/msgs"
rm -rf "$ROOT/modules/msgs/zmk-studio-messages"
cp -a "$ROOT/vendor/zmk-studio-messages" "$ROOT/modules/msgs/zmk-studio-messages"
init_vendor_git_repo "$ROOT/modules/msgs/zmk-studio-messages" vendor

ZMK_FILE_URL="file://${ROOT}/zmk"
STUDIO_MSGS_URL="file://${ROOT}/modules/msgs/zmk-studio-messages"
sed -e "s|__VENDOR_ZMK_URL__|${ZMK_FILE_URL}|g" \
    -e "s|__VENDOR_STUDIO_MSGS_URL__|${STUDIO_MSGS_URL}|g" \
    "$ROOT/config/west.yml" > "$ROOT/config/west.resolved.yml"
mv "$ROOT/config/west.resolved.yml" "$ROOT/config/west.yml"

echo "Vendor workspace ready."
