#!/usr/bin/env bash
# Builds and installs pySUBJ from the pinned SUBJ submodule with the patches
# in patches/subj applied. The submodule itself is left untouched.
#
# Requirements: a C++11 compiler, CMake, Eigen >= 3.3 (e.g. libeigen3-dev)
# and git. The Python build dependencies (scikit-build-core, pybind11) are
# installed by pip.
#
# Environment variables:
#   PYTHON  Python interpreter whose environment receives pysubj (default: python3)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUBJ_DIR="$ROOT/third_party/SUBJ"
PATCH_DIR="$ROOT/patches/subj"
PYTHON="${PYTHON:-python3}"

if [ ! -f "$SUBJ_DIR/CMakeLists.txt" ]; then
  echo "Fetching the SUBJ submodule ..."
  git -C "$ROOT" submodule update --init third_party/SUBJ
fi

BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

cp -a "$SUBJ_DIR/." "$BUILD_DIR/"
rm -rf "$BUILD_DIR/.git"

# A throwaway repository makes git apply resolve paths relative to the SUBJ sources
git -C "$BUILD_DIR" init -q
for patch in "$PATCH_DIR"/*.patch; do
  echo "Applying $(basename "$patch")"
  git -C "$BUILD_DIR" apply --whitespace=nowarn "$patch"
done

"$PYTHON" -m pip install --upgrade "$BUILD_DIR"
"$PYTHON" -c "import pysubj; print('Installed pysubj', pysubj.__version__)"
