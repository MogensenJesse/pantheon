---
name: Config Assets Dev Debug Audit
overview: "Deep-dive audit of sections 11 & 12 (src/config/, src/assets/, src/dev/). Re-verified 2026-07-03 after terrain/post-FX work: 10 actionable items (dead tunables, alias cleanup, PHASE0 re-exports, prod disableAa read). Lean removals only — no new helpers."
todos:
  - id: phase-a-dead-code
    content: "Phase A — Dead code removal (A1–A4): shadowFloor aliases, sky exposure fields, PHASE0 dead fields, ScatterAssetEntry"
    status: completed
  - id: a1-dead-shadowfloor-aliases
    content: "A1: Remove VISUAL.water/terrain/grass.shadowFloor duplicate aliases (keep shadows.receivers + props spread)"
    status: completed
  - id: a2-dead-sky-exposure
    content: "A2: Remove sky.night.exposure + sky.day.exposure; fix stale comment line 9"
    status: completed
  - id: a3-dead-phase0-fields
    content: "A3: Remove PHASE0.ORB_COUNT, SKY_LIGHTING block, ORB.ABSORB_RADIUS (keep ABSORB_RADIUS_SQ)"
    status: completed
  - id: a4-dead-scatterassetentry
    content: "A4: Remove dead ScatterAssetEntry type alias in assetManifest.ts"
    status: completed
  - id: phase-b-consistency
    content: "Phase B — Consistency / indirection (B1–B3): lighting alias, PHASE0 re-exports, disableAa prod read"
    status: completed
  - id: b1-visual-lighting-alias
    content: "B1: SceneSetup → VISUAL.shadows.lighting; remove VISUAL.lighting alias"
    status: completed
  - id: b2-phase0-reexports
    content: "B2: Drop PHASE0.BLOOM/GODRAYS/RENDER; point 5 consumers to VISUAL"
    status: completed
  - id: b3-disableaa-prod-read
    content: "B3: createPostFxPipeline init aaEnabled = true (remove prod devSettings read)"
    status: completed
  - id: phase-c-optional
    content: "Phase C — Optional (skip unless requested): editor disposeAssetRegistry, dev import bundling"
    status: completed
isProject: false
---

# Config & Assets & Dev-only Debug — Audit Plan

Scope: [`src/config/`](src/config/) (`visualTuning.ts` ~616 lines, `phase0.ts` ~100 lines), [`src/assets/`](src/assets/) (`assetManifest.ts`, `AssetLoader.ts`), [`src/dev/`](src/dev/) (3 files, ~105 lines). Cross-cutting: [`SceneSetup.ts`](src/rendering/SceneSetup.ts), post-FX pipeline, shadow profiles.

**Goal:** Leaner config surface — remove dead tunables and duplicate aliases, align consumers on `VISUAL` as canonical for visual/post-FX tunables. No performance work (static config, one-time asset load, DEV-gated debug).

---

## Re-verification (2026-07-03)

Post terrain audit + F3 TSL typing — **plan items still valid**. Methods below:

| Check | Result |
|-------|--------|
| **Grep** (primary) | All A1–A4 targets still zero consumer references outside definitions. B1–B3 call sites unchanged. |
| **`npm run dead-code:report`** | 305 exported symbols with zero CALLS edges; **0 candidates in `src/config/`, `src/assets/`, `src/dev/`**. Tier 3 actionable: **0**. Planned removals are **object fields / type aliases** — not in CALLS graph. |
| **GitNexus `impact` on `VISUAL` / `PHASE0`** | Returned 0 upstream (index stale for const re-exports / property access). Re-run `node .gitnexus/run.cjs analyze` before implementation if desired; grep is source of truth for field-level dead code. |
| **GitNexus `query`** | Config consumers flow through `lightingCurves`, dev panels, `applyDevFrameOverridesMid` — no new conflicting paths. |

### Confirmed still dead (grep)

| Target | Consumer refs outside config |
|--------|------------------------------|
| `VISUAL.water.shadowFloor` | 0 (canonical: `shadows.receivers.water` → `WATER_SHADOW_FLOOR_DEFAULT`) |
| `VISUAL.terrain.shadowFloor` | 0 |
| `VISUAL.grass.shadowFloor` | 0 |
| `VISUAL.sky.night.exposure` | 0 |
| `VISUAL.sky.day.exposure` | 0 (comment-only at line 9) |
| `PHASE0.ORB_COUNT` | 0 (`VISUAL.sky.worldLightness.maxOrbs: 26` is **live** in `lightingCurves.ts`) |
| `PHASE0.SKY_LIGHTING.*` | 0 (runtime uses `VISUAL.sky.lightingCurve.*`) |
| `PHASE0.ORB.ABSORB_RADIUS` | 0 (`ABSORB_RADIUS_SQ` live in `EnergyOrb.ts`) |
| `ScatterAssetEntry` | 0 (only definition in `assetManifest.ts`) |

### Confirmed still live (do not remove)

- `VISUAL.shadows.receivers.*` — `sunShadowProfiles.ts` → material defaults + dev panel specs
- `VISUAL.props` spread from `SHADOW_RECEIVERS.props` — `mapPropShadowUniforms.ts`, `mapPropMaterial.ts` (shadowFloor read via `receivers.props`, not `VISUAL.props.shadowFloor` dot path)
- `allPropAssetEntries()` — `mapEntityCatalog.ts` (`MAP_PROP_KEYS`)
- `collectAllAssetPaths()` — `AssetLoader.ts`
- `disposeAssetRegistry()` — `main.ts` `pagehide` teardown
- `applyRenderDebug` / `buildPostFxDebugTargets` — DEV-gated call sites; not dead

### Out of scope (healthy)

- No perf bottlenecks in config/assets/dev
- `src/dev/` correctly runtime-gated; static imports from `main.ts` / `postfxDevDebug.ts` are structural only (Vite tree-shakes in prod)
- `RenderDebugTargets` ≡ `GpuDebugTargets` type alias — trivial, not worth renaming

---

## Findings overview

| ID | Finding | Phase | Risk |
|----|---------|-------|------|
| A1 | 3 duplicate `shadowFloor` aliases on water/terrain/grass | A | None |
| A2 | 2 dead sky `exposure` fields + stale comment | A | None |
| A3 | 3 dead `PHASE0` fields | A | None |
| A4 | Dead `ScatterAssetEntry` type | A | None |
| B1 | `VISUAL.lighting` duplicates `VISUAL.shadows.lighting` | B | Low — shadow init |
| B2 | `PHASE0.BLOOM/GODRAYS/RENDER` duplicate `VISUAL` | B | Low — post-FX init |
| B3 | Ungated `disableAa` read at pipeline init | B | Low — prod hygiene |

**10 core tasks** (A1–A4, B1–B3). Phase C optional.

---

## Phase A — Dead code removal

**Batch 1** (single PR slice). Pure deletions — no behavior change.

### A1 — Remove 3 duplicate `shadowFloor` aliases

Canonical: `VISUAL.shadows.receivers.{water,terrain,grass}.shadowFloor` → `*_SHADOW_FLOOR_DEFAULT` in [`sunShadowProfiles.ts`](src/rendering/sunShadow/sunShadowProfiles.ts).

Remove from [`visualTuning.ts`](src/config/visualTuning.ts):

- `water.shadowFloor` (~line 368)
- `terrain.shadowFloor` (~line 488)
- `grass.shadowFloor` (~line 583)

**Keep:** `...SHADOW_RECEIVERS.props` spread on `VISUAL.props` (~line 509) — other spread fields are used.

### A2 — Remove dead sky exposure fields

Exposure runtime: `VISUAL.sky.exposureCurve` via [`lightingCurves.ts`](src/rendering/sky/lightingCurves.ts).

Remove:

- `sky.night.exposure` (~line 147)
- `sky.day.exposure` (~line 155)

Fix comment at line 9: `sky.day.exposure` → `exposureCurve.groundHigh`.

### A3 — Remove dead `PHASE0` fields

In [`phase0.ts`](src/config/phase0.ts):

- `ORB_COUNT: 26` — orb count from map placements; `worldLightness.maxOrbs` remains the live tunable
- `SKY_LIGHTING` block (lines 33–38) — dead re-export of `lightingCurve`
- `ORB.ABSORB_RADIUS` — keep `ABSORB_RADIUS_SQ: 1.5 * 1.5`

### A4 — Remove `ScatterAssetEntry` alias

[`assetManifest.ts`](src/assets/assetManifest.ts) lines 16–17 — zero references; `NaturePropAssetEntry` is canonical.

---

## Phase B — Consistency / indirection reduction

### B1 — Consolidate shadow lighting alias

[`SceneSetup.ts`](src/rendering/SceneSetup.ts) line 50: `const { lighting } = VISUAL` → `const { lighting } = VISUAL.shadows`.

Remove `lighting: SHADOW_LIGHTING` top-level alias (~line 139) in `visualTuning.ts`. Dev panels already use `VISUAL.shadows.lighting`.

**Batch 2:** A1 + A2 + A3 + A4 + **B1**

### B2 — Remove `PHASE0` visual re-exports

Point consumers to `VISUAL` (same object references, no value change):

| File | Change |
|------|--------|
| [`bloomParams.ts`](src/rendering/postfx/bloomParams.ts) | `const { bloom: BLOOM } = VISUAL` |
| [`bloomControls.ts`](src/rendering/postfx/controls/bloomControls.ts) | same |
| [`PlayerVisuals.ts`](src/entities/PlayerVisuals.ts) | `VISUAL.bloom.PLAYER_EMISSIVE` (keep `PHASE0` for `ORB` / `PLAYER`) |
| [`godraysControls.ts`](src/rendering/postfx/controls/godraysControls.ts) | `const { godrays: GODRAYS } = VISUAL` |
| [`createPostFxPipeline.ts`](src/rendering/postfx/createPostFxPipeline.ts) | `const { render: RENDER } = VISUAL` |

Remove from `phase0.ts`: `BLOOM`, `GODRAYS`, `RENDER` block. Drop unused `PHASE0` imports per file after edit.

**Batch 3:** **B2** + **B3**

### B3 — Fix ungated `disableAa` prod read

[`createPostFxPipeline.ts`](src/rendering/postfx/createPostFxPipeline.ts) line 89:

```ts
// Before
let aaEnabled = !devSettings.renderDebug.disableAa;
// After
let aaEnabled = true;
```

DEV toggle unchanged: `postfxDevDebug.ts` → `deps.setAa(!d.disableAa)` on `setDebugTargets` and per-frame in DEV `render()`.

---

## Phase C — Optional (not in core scope)

| ID | Item | Notes |
|----|------|-------|
| C1 | Editor `disposeAssetRegistry` on teardown | `main-editor.ts` loads registry but never disposes; DEV-only, reload clears GPU |
| C2 | Dynamic `import()` for `src/dev/` from `main.ts` | Structural bundling hygiene; runtime already gated |

Implement only if requested.

---

## Verification

After each batch:

```bash
npx tsc --noEmit
npm run check
```

After Phase B: full page reload — shadows (SceneSetup), bloom/god rays/exposure (post-FX), FXAA toggle (Render debug → Disable AA).

After Phase A complete, append removed symbols to `REMOVED_SYMBOLS` in [`scripts/gitnexus-dead-code-report.mjs`](scripts/gitnexus-dead-code-report.mjs) audit trail (optional hygiene).

---

## Execution batches

| Batch | Tasks | Files touched |
|-------|-------|---------------|
| **1** | A1, A2, A3, A4 | `visualTuning.ts`, `phase0.ts`, `assetManifest.ts` |
| **2** | B1, B3 | `visualTuning.ts`, `SceneSetup.ts`, `createPostFxPipeline.ts` |
| **3** | B2 | `phase0.ts` + 5 consumer files |

---

## What we are NOT doing

- Splitting `visualTuning.ts` (615 lines flat config — acceptable per prior audits)
- Merging `allPropAssetEntries` / `collectAllAssetPaths` (different roles: validation vs loader)
- Renaming `GpuDebugTargets` / `RenderDebugTargets`
- Dead-code report tier-2 items outside scope (`biomeWeightBake`, `waterDepthTsl`, etc.)
