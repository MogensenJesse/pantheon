# Forest

Pure sim in `src/world/village/sim/forest.ts`; numbers in `VILLAGE.FOREST` (`src/config/village/economy.ts`). The view is `render/forestView.ts` with the pose maths in `render/treeFall.ts`.

## Rules
- Per-tree states `Standing`, `Falling`, `Stump`, `Sapling` in typed arrays over the map's tree list (`TreeInfo { x, z, key, scale }`, in map-entity order; `main.ts` passes the trees).
- **Yield**: `FOREST.YIELD` (the exact prop key, else the family before the number, else `DEFAULT_YIELD`) times the tree's scale, rounded and at least 1 (`yieldOf`, plus `modifiers.woodPerTreeAdd`). Chopping takes `CHOP_S_PER_WOOD` seconds per wood (`chopSecondsOf`, cached per tree), the wood is paid out when the last hit lands.
- **Life cycle**: chopped → `Falling` for `FALL_S` → `Stump` → after `REGROW_DAYS` a `Sapling` (only where the site grid is FREE, at most `MAX_SAPLINGS` at once) → full tree after `GROW_DAYS` game days. Rain speeds growth by `RAIN_BOOST` times `rain01`.
- **All trees can be felled**, near or far from the temple (the player is nudged to regrow the forest). Only the non-standing trees are stored (`changed`, updated in id order so a restored forest continues exactly); partial chopping is kept (`chopIds`/`chopSeconds`).
- `workSpots` tree spots carry `tree`; `agentTargets.claimSpot` skips trees that are down or already claimed (one woodcutter per tree); `agents.act()` calls `onChop(tree, dt, dirX, dirZ)`; `villageSim.onChop` adds the wood to the store and **chops nothing while the wood store is full**.
- Reach: the village's woodcutters and the DEV fell fell trees; the hand (`story-mechanics/HAND.md`) uproots one with `forest.uproot` (below). Blessing on a tree only speeds the chopping.
- **Uproot** (`forest.uproot(id, events)`, `VillageSim.uprootTree`): a `Standing` tree goes straight to `Stump` (no `Falling`), partial chopping is dropped, `treeUprooted` is pushed and the tree's yield (`yieldOf` plus `woodAdd`) is returned; anything else returns 0. It regrows like a felled tree. The sim does not credit the stock: the caller (the hand, at delivery) does. `forest.fell` and `chop` do nothing to a stump, and a woodcutter whose tree was uprooted is released like one whose tree was felled by someone else.

## Events
`treeFelled { tree, dirX, dirZ }`, `treeUprooted { tree }`, `treeStump`, `treeSapling`, `treeGrown`. `VillageSystem.applyEvents` hands them to `VillageView` (no bus events).

## View
- A felled tree is hidden in its static prop group by `placement.scale = 0` and a recomputed matrix (survives `resnapMapProps`; tree id → group slot by per-key entity order).
- An uprooted tree leaves its group the same way (`forestView.uprooted`) and a stump appears at once; there is no fall.
- It falls as a temporary `DynamicPropBatch` instance of its prop key about its root (`fallAngle` in `treeFall.ts`: 80% fall, small bounce), leaves a stump (`STUMP_KEY`, `dressingKit.buildStumpGeometry`, `LOOK.CAPACITY.STUMP`, drawn by the dressing renderer) which is replaced by a growing sapling instance (updated at 4 Hz) and finally the static tree again.
- The per-key batches are created up front in `showFounded` from the shared material pool; every change marks the shadows dirty.

## Save
`VillageSimState.forest` (a tree that was mid-fall saves as `Falling` and its stump appears when the fall ends).

## DEV
`__pantheonVillage.forest()` (counts) and `fell(n, x?, z?)` (fells the n nearest trees to x, z, default the village centre), a dev panel button and trees readout.

## Check
`npm run check:village-forest` (`scripts/checks/village/forest-check.ts`: yield and chop rules, the life cycle, uproot (yield, no fall, once, regrowth, saved as a stump), rain and occupied-ground and sapling-cap rules, save and restore, `nearest`, real woodcutters felling real trees while the village spends the wood, no stale claims after a DEV fell, a full store stopping the felling, regrowth over 3.2 days, determinism); `check:save-village` adds forest scenarios (trees falling, stumped, regrowing and half chopped across three save points).
