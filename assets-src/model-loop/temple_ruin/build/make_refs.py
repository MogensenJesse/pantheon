"""Make the AI close-up reference of every part in plan.json (skill step 3), a few at a time. Run from the project root:
python assets-src/model-loop/temple_ruin/build/make_refs.py [id ...]   (no ids = every part whose refs/<id>.png is missing)"""
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

R = Path("assets-src/model-loop/temple_ruin")
S = Path(".claude/skills/model-loop/scripts")
plan = json.loads((R / "plan.json").read_text(encoding="utf8"))
want = sys.argv[1:]
nodes = [n for n in plan["nodes"] if (n["id"] in want if want else not (R / n["ref"]).exists())]
TAIL = (" Isolated, centred, the whole object in frame, three-quarter view from slightly above, plain light-grey background, soft even light, no other objects, no ground tile, no water. "
        "Keep exactly the same style, colours, proportions and wear as in the image.")


def one(n):
    prompt = f"From this image, show only {n['desc']}." + TAIL
    r = subprocess.run(["node", str(S / "openai-image.mjs"), "--image", str(R / "input.png"), "--out", str(R / n["ref"]), "--prompt", prompt],
                       capture_output=True, text=True)
    return n["id"], r.returncode, (r.stdout + r.stderr).strip()[-200:]


with ThreadPoolExecutor(4) as ex:
    for res in ex.map(one, nodes):
        print(*res)
