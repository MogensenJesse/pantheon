#!/bin/bash
# usage: run_root.sh <round> [extra args]  -> builds, renders, silhouettes, then crops
R=/d/pantheon/assets-src/model-loop/well_test
cd $R
"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b root_work.blend --factory-startup --python-exit-code 1 --python build/root_drive.py -- "$@" 2>&1 | grep -E "@@RESULT@@|Error|Traceback|rror" | cut -c1-2500
