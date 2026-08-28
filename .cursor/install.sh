#!/usr/bin/env bash
# Idempotent setup for the Eyelash Corne ZMK development environment.
# Prepares the Zephyr/ZMK build toolchain (west, Zephyr SDK, modules) and the
# keymap-drawer tooling. Safe to run repeatedly and from a clean base image or a
# pre-populated snapshot.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${ZMK_VENV_DIR:-$HOME/zmk-venv}"
SDK_VERSION="${ZEPHYR_SDK_VERSION:-0.16.3}"
SDK_DIR="$HOME/zephyr-sdk-${SDK_VERSION}"

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  git cmake ninja-build gperf ccache dfu-util device-tree-compiler wget \
  python3-dev python3-pip python3-venv python3-setuptools python3-wheel python3-tk \
  xz-utils file make gcc gcc-multilib g++-multilib libsdl2-dev libmagic1 curl \
  protobuf-compiler

echo "==> Creating Python virtual environment ($VENV_DIR)"
if [ ! -d "$VENV_DIR" ]; then
  python3 -m venv "$VENV_DIR"
fi
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"
pip install --upgrade pip wheel

echo "==> Installing west and keymap-drawer"
pip install west protobuf grpcio-tools keymap-drawer

echo "==> Installing Zephyr SDK ($SDK_VERSION, arm-zephyr-eabi)"
if [ ! -d "$SDK_DIR/arm-zephyr-eabi" ]; then
  tmp_sdk="$(mktemp -d)"
  wget -q "https://github.com/zephyrproject-rtos/sdk-ng/releases/download/v${SDK_VERSION}/zephyr-sdk-${SDK_VERSION}_linux-x86_64_minimal.tar.xz" \
    -O "$tmp_sdk/sdk.tar.xz"
  tar xf "$tmp_sdk/sdk.tar.xz" -C "$HOME"
  rm -rf "$tmp_sdk"
  # Installs the arm toolchain + host tools and registers the SDK CMake package.
  "$SDK_DIR/setup.sh" -t arm-zephyr-eabi -h -c
fi

echo "==> Initializing/updating west workspace"
cd "$REPO_DIR"
if [ ! -d "$REPO_DIR/.west" ]; then
  west init -l config
fi
west update
west zephyr-export

echo "==> Installing Zephyr Python requirements"
pip install -r zephyr/scripts/requirements-base.txt
# ZMK code generation (studio protobuf) imports pkg_resources, dropped in
# setuptools >= 81. Pin to a version that still ships it.
pip install "setuptools<81"

echo "==> Done. Use .cursor/build.sh to build firmware and .cursor/draw.sh to draw the keymap."
