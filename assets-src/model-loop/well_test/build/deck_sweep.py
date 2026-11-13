"""Seed sweep (no render): coverage and plank count per seed."""
import json
import sys
import time

import bpy

R = r"D:/pantheon/assets-src/model-loop/well_test"
sys.path.insert(0, R + "/build")
import deck  # noqa: E402

rows = []
t0 = time.time()
seeds = [int(s) for s in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else range(1, 13)
for seed in seeds:
    deck.P.update(seed=seed)
    info = deck.build()
    rows.append((seed, info["planks"], info["coverage"], info["after_passes"]))
print("@@RESULT@@" + json.dumps({"rows": rows, "sec": round(time.time() - t0, 1)}))
