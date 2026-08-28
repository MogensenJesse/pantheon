# Vendored meshoptimizer remesher snapshot

Published `meshoptimizer@1.2.0` does not expose `MeshoptSimplifier.remesh`. Rebuild mode vendors an exact upstream snapshot that does.

| Field | Value |
| --- | --- |
| Upstream | https://github.com/zeux/meshoptimizer |
| Commit | `ed895f0f58ee828598be46a026c24eff4d4b76c4` (2026-08-27) |
| Files | `js/meshopt_simplifier.js`, `js/meshopt_simplifier.d.ts`, `LICENSE.md` |
| License | MIT (Arseny Kapoulkine) |

`Thicken` is listed in the TypeScript flags but is **not implemented** in this WASM build. The optimizer UI only exposes **Shell** and **Solve**.

Do not edit these files to “upgrade” the remesher. Re-vendor a new reviewed commit instead.
