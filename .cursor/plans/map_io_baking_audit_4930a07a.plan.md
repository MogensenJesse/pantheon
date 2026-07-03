---
name: Map IO Baking Audit
overview: "Deep-dive audit of src/map/ (14 files, ~1653 lines): fix validation bugs, eliminate double validation, unify four duplicate blur pipelines in biomeWeightBake.ts (~620 lines), collapse duplicate texture factories, remove dead exports. Leaner + more correct — no new helper files unless dedup is real. User approved full blur unification + strict validation."
todos:
  - id: a1-pin-segments
    content: "A1: Pin world.segments to WORLD.SEGMENTS in validateMapPayload"
    status: completed
  - id: a2-integer-biomes
    content: "A2: Require integer biomes in validator"
    status: completed
  - id: a3-v1-entity-hole
    content: "A3: Validate entities for all versions when present"
    status: completed
  - id: a4-dead-block-id-normalize
    content: "A4: Remove dead assertValidMapFile block + normalize map.id on load"
    status: completed
  - id: a5-playmap-tension
    content: "A5: Simplify validatePlayMap to require playerStart + fix dev hint"
    status: completed
  - id: b1-double-validation
    content: "B1: Remove redundant validateMapFile from mapFileToGrids"
    status: completed
  - id: b2-mapid-regex-dedup
    content: "B2: Dedup MAP_ID_RE/MAP_ID_PATTERN to one export"
    status: completed
  - id: b3-url-mapid-guard
    content: "B3: Validate URL/session map id with isValidMapId"
    status: completed
  - id: c1-edge-clamp-bug
    content: "C1: Fix regional blur edge-clamp (folded into C2 unified core)"
    status: completed
  - id: c2-unify-blur-pipelines
    content: "C2: Unify four blur pipelines into one separable core"
    status: completed
  - id: c3-collapse-mask-bakes
    content: "C3: Collapse buildBlurredPathMask/MeadowMask into buildBlurredBiomeMask"
    status: completed
  - id: c4-collapse-fill-loops
    content: "C4: Collapse three texture-fill quantize loops"
    status: completed
  - id: c5-unexport-bake-internals
    content: "C5: Un-export internal biomeWeightBake helpers"
    status: completed
  - id: d1-texture-factory-dedup
    content: "D1: Collapse MapGrids texture factories"
    status: completed
  - id: d2-disc-bounds-dedup
    content: "D2: Dedup disc bounds math (gridDirtyRegion + gridBrush)"
    status: completed
  - id: e1-dead-exports
    content: "E1: Remove dead exports and aliases"
    status: completed
  - id: e2-strip-heightscale
    content: "E2: Remove dead heightScale from MapWorldMeta + shipped maps"
    status: completed
isProject: false
---

# Map I/O & Baking — Audit Implementation

Scope: [`src/map/`](src/map/) (14 files, ~1653 lines). Audited via 3 explore subagents + **GitNexus re-verification** (2026-07-03, post terrain audit).

**Cross-section note:** Terrain audit removed `@ts-nocheck` from [`mapUvTsl.ts`](src/map/mapUvTsl.ts) — no blockers for this plan. `mapUvTsl` is consumed by terrain TSL + grass compute; do not change UV math here.

**Confirmed runtime constants** ([`WorldConfig.ts`](src/world/WorldConfig.ts)): `WORLD.SIZE=800`, `WORLD.SEGMENTS=512`, `WORLD.HEIGHT_SCALE=128`. Shipped maps (`island.json`, `800-grid.json`, `newprops.json`) all have `segments:512` — pass strict A1. All have stale `heightScale` (16/64/128) — runtime ignores; E2 cleans metadata.

---

## GitNexus blast radius (re-verified)

| Symbol | Risk | Direct callers / flows |
|--------|------|------------------------|
| `validateMapPayload` | **HIGH** | `assertValidMapFile`, `mapDevApiPlugin` save API; flows: `loadPlayMapFile`, `loadMapById`, `createNewMap` |
| `mapFileToGrids` | **HIGH** | `WorldBuilder.buildWorld`, `EditorMapDocument` load/new |
| `bakeSmoothedBiomeWeightsInRegion` | **HIGH** | `fillBiomeWeightTextureDataRegion` → `uploadBiomeMap` (editor paint) |
| `createBiomeWeightTexture` | **CRITICAL** | `MapTerrainBuilder.buildMapTerrain` → play + editor bootstrap |

**Phase A** touches HIGH-risk validation — run `impact` before editing. **Phase C** touches CRITICAL terrain path — mandatory visual check at map borders + editor paint.

---

## Phase A — Validation correctness (bugs)

Fix real correctness holes before dedup/refactor. No structural changes.

### A1 — Pin `world.segments` to `WORLD.SEGMENTS`

**File:** [`validateMapPayload.ts`](src/map/validateMapPayload.ts) L74-75

Today `segments = map.world?.segments ?? WORLD.SEGMENTS` derives `expected` grid size but never rejects wrong `segments`. A map with `segments:256` + 257² grids passes while terrain UVs assume 513².

**Fix:** After deriving `segments`, reject when `map.world?.segments !== undefined && map.world.segments !== WORLD.SEGMENTS`. Omitting `segments` still defaults correctly.

### A2 — Require integer biomes

**File:** [`validateMapPayload.ts`](src/map/validateMapPayload.ts) L92-96, [`MapTypes.ts`](src/map/MapTypes.ts) L129-131

`isBiomeId` only range-checks; `2.7` passes then truncates in `Uint8Array` at load.

**Fix:** Add `Number.isInteger(v)` to biome loop (keep `isBiomeId` for range).

### A3 — Close v1 entity hole

**File:** [`validateMapPayload.ts`](src/map/validateMapPayload.ts) L104-107

Entities validated only when `version >= MAP_FILE_VERSION`. v1 maps with garbage `entities` load in editor unchecked.

**Fix:** Validate whenever `map.entities !== undefined`, any version.

### A4 — Dead block + normalize id on load

**Files:** [`validateMapPayload.ts`](src/map/validateMapPayload.ts) L130-132, [`MapIO.ts`](src/map/MapIO.ts) L80-87

- L130-132 in `assertValidMapFile` is unreachable (`validateMapPayload` already checks versions).
- `parseMapFile` returns `raw` with original id casing; validator lowercases a copy only.

**Fix:** Remove dead version block. In `parseMapFile`, assign `raw.id = normalizeMapId(raw.id)` before return (import from `MapTypes`).

### A5 — Simplify play validation + align dev hint

**Files:** [`validatePlayMap.ts`](src/map/validatePlayMap.ts) L11-22, [`devPanelMapEditor.ts`](src/ui/dev/devPanelMapEditor.ts) L14

`isAuthoredGameplayLayout` allows orb-only maps; second check always requires `playerStart` → misleading two-step errors. Dev hint says "playerStart **and/or** orbs" but play **requires** `playerStart`.

**Fix:** Collapse `validatePlayMapForPlay` to a single `playerStart` check (spawn point is mandatory). Update dev hint to "Maps need `playerStart` (and orbs for gameplay)."

**Shipped-map check:** All 3 manifest maps must have `playerStart` or play will fail — verify before merging A5.

---

## Phase B — Validation dedup & IO hygiene

Low-risk perf/consistency after Phase A.

### B1 — Eliminate double schema validation on load

**File:** [`MapIO.ts`](src/map/MapIO.ts) L47-48

`parseMapFile` validates (~1M cell checks on 513²), then `mapFileToGrids` validates again. All HTTP loads go through `parseMapFile` first.

**Fix:** Remove `validateMapFile(map)` from `mapFileToGrids`; keep cheap length-mismatch guard (L52-54).

**Safe for in-memory paths:** `createNewMapFile` → `mapFileToGrids` skips full schema validation — map is built from typed `MapGrids` via `gridsToMapFile`, always well-formed. Length guard still catches corruption.

### B2 — Dedup map-id regex

**Files:** [`validateMapPayload.ts`](src/map/validateMapPayload.ts) L8 (`MAP_ID_RE`), [`MapTypes.ts`](src/map/MapTypes.ts) L155 (`MAP_ID_PATTERN`)

Identical regex, two exports.

**Fix:** Keep `MAP_ID_PATTERN` in `MapTypes.ts`; validator imports it. Remove `MAP_ID_RE` export (or make it a re-export alias if vite plugin imports it — update [`mapDevApiPlugin.ts`](vite/mapDevApiPlugin.ts) if needed).

### B3 — Validate URL/session map id

**Files:** [`playMapSelection.ts`](src/map/playMapSelection.ts), [`MapIO.ts`](src/map/MapIO.ts) `fetchMapById`

`getPlayMapId` accepts any `?map=` string; `fetchMapById` interpolates into URL without `isValidMapId` guard.

**Fix:** In `getPlayMapId` / `setPlayMapId`, reject invalid ids (return empty / no-op). In `fetchMapById`, throw early if `!isValidMapId(id)`. Prevents path-style ids; server still 404s on missing files.

---

## Phase C — biomeWeightBake.ts unification (~200 lines saved)

**File:** [`biomeWeightBake.ts`](src/map/biomeWeightBake.ts) (~620 lines). Highest lean win; highest visual risk.

**GitNexus:** CRITICAL via `createBiomeWeightTexture` → `buildMapTerrain` → play + editor.

**Dependency:** Do C1+C2 together (edge clamp must be in unified core). C3-C4 before C5 (un-export after API settles).

### C1 — Regional blur edge-clamp bug (fold into C2)

**Confirmed bug** — full bake clamps vertical neighbors:

```334:336:src/map/biomeWeightBake.ts
      for (let k = -radius; k <= radius; k++) {
        const nj = Math.max(0, Math.min(size - 1, j + k));
```

Regional bake (`bakeSmoothedBiomeWeightsInRegion` L147-177, `bakeBlurredScalarInRegion` L261-268) skips out-of-grid rows leaving scratch zeros → editor paint near map borders averages zeros instead of edge-clamped values.

**Do not land C1 as a standalone patch if C2 follows immediately** — implement edge clamp in the unified separable core.

### C2 — Unify four blur pipelines

Today four near-duplicate box-blur implementations:
- `separableBlurChannel` (full, 4-ch, water mask) L294-344
- `separableBlurScalar` (full, 1-ch) L445-481
- `bakeSmoothedBiomeWeightsInRegion` (region, 4-ch) L111-191
- `bakeBlurredScalarInRegion` (region, 1-ch) L218-273

**Fix:** One internal separable box-blur core with options: `{ region?, channels, waterMask?, edgeClamp: true }` + thin full/region entry points. Must reproduce full-bake behavior including C1 fix.

**Out of scope here:** Grass triple full-grid bake in [`grassDataTexture.ts`](src/world/grass/data/grassDataTexture.ts) — separate grass audit.

### C3 — Collapse path/meadow mask bakes

`buildBlurredPathMask` L483-503 and `buildBlurredMeadowMask` L505-523 differ only by biome-id check.

**Fix:** `buildBlurredBiomeMask(grids, biomeId, options)`; thin wrappers or direct call sites.

### C4 — Collapse texture-fill loops

`fillBiomeWeightTextureData`, `fillMeadowMaskTextureData`, `fillPathMaskTextureData` (+ `*Region` variants) share quantize+copy loops.

**Fix:** One parameterized internal fill (channel count / stride); keep public fill function names stable for [`MapGrids.ts`](src/map/MapGrids.ts).

### C5 — Un-export internal bake helpers

Make file-private (no external importers per GitNexus/grep): `fillBiomeWeightTextureDataRegion`, `fillMeadowMaskTextureDataRegion`, `fillPathMaskTextureDataRegion`, `biomeIdToWeights`, `buildBlurredPathMask`.

**Keep public:** `fillBiomeWeightTextureData`, `fillMeadowMaskTextureData`, `fillPathMaskTextureData`, `buildSmoothedBiomeWeights`, `buildBlurredBiomeMask` (or meadow wrapper), `buildPathGrassMultiplier`, `defaultBiomeBlurRadiusCells`, `BiomeWeightBakeOptions` type.

---

## Phase D — MapGrids & brush dedup

After Phase C (fill API stable).

### D1 — Collapse texture factories

**File:** [`MapGrids.ts`](src/map/MapGrids.ts) L30-184

Four near-identical `create*Texture` / `update*Texture` pairs (path, meadow, biome weight, height) — differ only format, channels, fill fn.

**Fix:** One internal `createGridTexture` / `updateGridTexture` + thin named wrappers. Height keeps region API on `updateHeightTexture`. ~60 lines saved.

**Do not** add a new file — keep factory inside `MapGrids.ts`.

### D2 — Dedup disc bounds math

**Files:** [`gridDirtyRegion.ts`](src/map/gridDirtyRegion.ts) `discGridBounds` L12-29, [`gridBrush.ts`](src/map/gridBrush.ts) `forEachCellInDisc` L22-31

Duplicate disc→AABB math; drift breaks incremental editor sync (dirty region vs stamped cells).

**Fix:** Shared internal `discGridAABB(x, z, radius, worldSize, gridSize)` in `gridBrush.ts` (or `gridDirtyRegion.ts` — pick one, import the other). `forEachCellInDisc` calls it for bounds.

---

## Phase E — Dead code & metadata cleanup

Last — after refactors settle.

### E1 — Remove dead exports & aliases

| Item | Action | Importer update |
|------|--------|-----------------|
| `validateMapFile` wrapper | Inline `assertValidMapFile` at `parseMapFile` only | None external |
| `fetchMapSummaries` | Remove; use `fetchMapManifest` | [`MapSelectScreen.ts`](src/ui/MapSelectScreen.ts) L2 |
| `gridCellToWorldXZ` | Un-export | Internal only |
| `worldToGridFrac`, `fillHeightTextureData*` | Un-export | Internal to MapGrids |
| `PLAY_MAP_SESSION_KEY` | Un-export | Internal to playMapSelection |
| Grass dead exports | Un-export `clampGrassDensity`, `DEFAULT_MAP_GRASS_*` | Verify grep first |
| Catalog dead exports | Un-export `isValidPropKey`, unused palette types | Internal only |
| `GridsToMapFileOptions`, `SaveMapToProjectResult` | Un-export interfaces | Only used in MapIO.ts |
| `MAP_ID_RE` | Removed by B2 | Update vite plugin if imported |

**Not dead (keep exported):** `getMapEntities`, `populateMapListSelect`, `serializeMapFile`/`parseMapFile` (may be used by tests/tools), `validateMapEntitiesArray` (used by validator).

### E2 — Remove dead `heightScale` metadata

**Files:** [`MapTypes.ts`](src/map/MapTypes.ts) `MapWorldMeta`, `defaultMapWorldMeta()` L115-122, [`public/maps/*.json`](public/maps/)

`defaultMapWorldMeta()` **currently emits** `heightScale: WORLD.HEIGHT_SCALE` — runtime ignores it; terrain uses `WORLD.HEIGHT_SCALE` from config.

**Fix:** Remove `heightScale` from `MapWorldMeta` type + `defaultMapWorldMeta`. Strip field from `island.json`, `800-grid.json`, `newprops.json`. Editor re-save will emit clean metadata.

---

## Execution order

```mermaid
flowchart LR
  A[Phase A validation bugs] --> B[Phase B dedup IO]
  B --> C[Phase C bake unify]
  C --> D[Phase D grid dedup]
  D --> E[Phase E cleanup]
```

| Phase | Tasks | Risk | Verify |
|-------|-------|------|--------|
| A | A1-A5 | HIGH (`validateMapPayload`) | All 3 shipped maps still load in play + editor |
| B | B1-B3 | MEDIUM | Load map, switch map, `?map=` invalid id → chooser |
| C | C1-C5 | **CRITICAL** | Full reload: terrain splat, paint at map **edges**, path/meadow overlay, LOD handoff |
| D | D1-D2 | HIGH | Editor sculpt/paint dirty regions; mesh partial update |
| E | E1-E2 | LOW | `tsc`, grep for broken imports |

After **each** phase:
```bash
npx tsc --noEmit
npm run check
npm run build
```

---

## Out of scope (deferred)

- Editor save doesn't preserve `grass` / custom `world` beyond `defaultMapWorldMeta` — design decision.
- Triple full-grid grass bake — [`grassDataTexture.ts`](src/world/grass/data/grassDataTexture.ts), grass audit.
- `ridgeNoise.ts` — correctly encapsulated in `heightRidgeStamp.ts`; no external importers; leave.
- Height [0,1] range validation on load — optional hardening; GPU clamps at upload today.
- Entity world-bounds validation — editor concern; defer.

---

## Plan soundness checklist (re-verified)

| Finding | Status |
|---------|--------|
| Regional blur edge-clamp bug | **Confirmed** (full L335 vs regional L170-173) |
| Double validation on load | **Confirmed** (`parseMapFile` L85 + `mapFileToGrids` L48) |
| Duplicate MAP_ID regex | **Confirmed** |
| v1 entity hole | **Confirmed** (L104 version gate) |
| Dead assertValidMapFile block | **Confirmed** (L130-132 unreachable) |
| `defaultMapWorldMeta` emits heightScale | **Confirmed** — E2 removes, not just shipped JSON |
| Shipped maps pass A1/A2/A3 | **Expected yes** (segments 512, integer biomes, v2) |
| `fetchMapSummaries` has external importer | **Yes** — `MapSelectScreen.ts`; update in E1 |
| Terrain audit impact on map/ | **None blocking** (`mapUvTsl` typings only) |
