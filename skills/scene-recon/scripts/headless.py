"""Run model-loop's render helpers on a machine with the `bpy` wheel and no GPU (e.g. a cloud container).

model-loop's loop_render renders with EEVEE, which needs libEGL / a GPU. This shim leaves model-loop
untouched and, in the running process only, makes loop_render render with Cycles on the CPU.

    import headless
    loop_render = headless.setup()        # model-loop/scripts on sys.path, Cycles CPU instead of EEVEE

Needs the blender-agent-skills plugin installed (loop_render imports turntable / render_batch from it).
Env: LOOP_CYCLES_SAMPLES (default 24) trades render time for noise.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_LOOP_SCRIPTS = os.path.abspath(os.path.join(HERE, "..", "..", "model-loop", "scripts"))
SAMPLES = int(os.environ.get("LOOP_CYCLES_SAMPLES", "24"))


def setup():
    if MODEL_LOOP_SCRIPTS not in sys.path:
        sys.path.insert(0, MODEL_LOOP_SCRIPTS)
    import loop_render  # raises ImportError with a clear message if the plugin is missing

    rb = loop_render.render_batch
    if getattr(rb, "_cycles_shim", False):
        return loop_render
    real_run = rb.run

    def run_cycles(*a, **k):
        if k.get("engine") == "BLENDER_EEVEE":
            k["engine"] = "CYCLES"
            k.setdefault("samples", SAMPLES)
        return real_run(*a, **k)

    rb.run = run_cycles
    rb._cycles_shim = True
    return loop_render
