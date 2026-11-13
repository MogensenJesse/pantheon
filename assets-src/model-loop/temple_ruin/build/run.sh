#!/bin/bash
# usage: run.sh <part> <tag> [az,el,lens] -> builds, QA, renders the part's variants (see drive.py)
R=/d/pantheon/assets-src/model-loop/temple_ruin
cd $R
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b temple_work.blend --factory-startup --python-exit-code 1 --python build/drive.py -- "$@" 2>&1 | grep -E "@@RESULT@@|Error|Traceback|rror" | cut -c1-2500
