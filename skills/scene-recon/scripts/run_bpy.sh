#!/bin/bash
# usage: run_bpy.sh <script.py> [args...]
# Runs a script with the `bpy` Python wheel (headless Blender) with this folder on PYTHONPATH, so the
# script can `import headless, camera_fit, recon_import`. Prints only result / error lines.
#   BPY_PY  python that has bpy installed (python -m venv v && v/bin/pip install bpy)
set -e
export PYTHONDONTWRITEBYTECODE=1   # model-loop/scripts/__pycache__ is tracked: never rewrite it
: "${BPY_PY:?set BPY_PY to a python that has bpy installed}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PYTHONPATH="$HERE" "$BPY_PY" -X utf8 "$@" 2>&1 | grep -E "@@RESULT@@|Error|Traceback|rror|Saved|File \"" | cut -c1-2500
exit "${PIPESTATUS[0]}"
