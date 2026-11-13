#!/bin/bash
# usage: run.sh <part> <tag> [az,el,lens] -> builds, QA, renders the part's variants (see drive.py)
R=/d/pantheon/assets-src/model-loop/great_tree
cd $R
BL=$(ls -d "/c/Program Files/Blender Foundation/Blender "*/ | tail -1)blender.exe  # newest installed (5.2 became 5.3 on 2026-11-12)
"$BL" -b great_tree_work.blend --factory-startup --python-exit-code 1 --python build/drive.py -- "$@" 2>&1 | grep -E "@@RESULT@@|Error|Traceback|rror" | cut -c1-2500
