---
name: verify
description: Verify the Pantheon repo after code changes by running Biome lint and the TypeScript + Vite build, then report results. Use after editing source files, before committing, or when the user asks to check, verify, or validate the build.
---

# Verify Pantheon

Run the repo's automated gates and report the outcome. Do not start the dev server (`npm run dev`); `AGENTS.md` says the user runs it manually.

## Steps

1. **Install if needed.** If `node_modules/` is missing, run `npm ci` from the repo root.
2. **Lint:** `npm run lint` (Biome `check .`).
3. **Build:** `npm run build` (`tsc` then `vite build`). Run it even if lint failed, so both results are reported.
4. **Report** in this format:
   - Lint: pass, or the failing files and rules (quote the diagnostic lines).
   - Build: pass, or the first `tsc` / Vite error with file and line.
   - Any warnings, such as chunk size, labelled as warnings and not failures.
5. **Do not auto-fix.** Only run `npm run lint:fix` if the user asks. If a failure is in a file you didn't change, say so and leave it alone.

## Notes

- A failing check is reported as failing, with the output. Don't describe a failure as passing.
- Visual changes (shaders, lighting, terrain, post-FX) are not covered by these gates. Say so and ask the user to check in the browser. Remind them of the full-reload rule when `src/config/phase0.ts`, `src/config/visualTuning.ts`, or map JSON changed.
- Before committing, also run `gitnexus_detect_changes()` if the GitNexus tools are available, as `CLAUDE.md` requires.
