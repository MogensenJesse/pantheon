# Hunger, death and graves (M5)

Pure sim in `src/world/village/sim/hunger.ts` and `graveyard.ts`. Numbers: `VILLAGE.HUNGER` (`src/config/village/economy.ts`) and `VILLAGE.GRAVEYARD` (`src/config/village/life.ts`).

## Rules
- One number `level` (seconds of hunger) grows 1 per second while the larder is empty (`economy.hungry`) and drains twice as fast once it is not. Everyone is weak from `STARVE_GRACE_DAYS`; deaths begin `DEATH_AFTER_DAYS` later (the first at once) and then come every `DEATH_INTERVAL_DAYS` while it stays empty. Functions: `stepHunger`, `stageOf` (`fed`, `empty`, `weak`, `dying`), `isWeak`, `pickVictim`, `hungerChange`. The grace is a parameter (`weakAtS(grace)`, `deathsAtS(grace)`) so the Lean winters node can stretch it.
- **A village that makes at least a third of what it eats never starves** (the build-up drains faster than it grows); it only falls when production nearly stops.
- **Weak villagers** (`AgentInputs.weak`) walk at `HUNGER.WEAK_MUL` speed; builders and woodcutters stand about without working; **farmers and fishermen keep working at full rate**, so a village can feed itself back to health (the first design had them stop, which made hunger a death sentence).
- **Who dies**: idlers, woodcutters, builders, fishermen, farmers, priests, in that order, the newest first; never someone already dying, never the elder before the conversion (he goes last of all after it), never the last villager. A death costs `DEATH_FAITH_COST` faith (floored at zero; halved by Gravekeeper) when it begins.
- **Presentation**: `Villagers.dying` (seconds since it began, saved with the pool) drives `Anim.Collapse` (the last pose; a vertex-shader pose in `villagerMaterial.ts`) for `COLLAPSE_S`, then the figure shrinks into the ground over `FADE_S` (`villagerRenderer`), then `villageSim.removeDead`: grave, `agents.remove`, `population.rebuildResidents`, elder re-keyed.
- **Pool removal** is a swap-remove (`villagerPool.removeVillager`: the last villager's every array, waypoints included, moves into the freed slot). `Agents.remove` then drops the removed villager's work claim, remaps the path queue and notice arrays and calls `rebuildClaims()`. The `villagerDied { villager, moved }` event tells everything else holding an index: Murmur (`Murmur.villagerRemoved`) and the overview's selection follow `moved` to the new slot. Dying villagers are skipped by `nearestVillager`, `witnessesWithin`, `sleepersOf`, `addBelief` and `notice`.

## Graveyard
`graveyard.ts`, `planner.planGraveyard`: a plot (`WIDTH_M` x `DEPTH_M`) picked at founding (after the first houses and fields), flat (`MAX_RELIEF_M`), beyond the outer ring, off the main road, at least `CLEAR_M` (relaxed in steps) from buildings and fields, preferring ground far from the radial lanes. It is reserved on the site grid (`OCCUPANT.GRAVEYARD`) with a margin so nothing is built on it. Graves go in rows of 2 m plots (`plotAt`), on beyond the plot (up to `EXTRA_ROWS`) only where the ground is free; none is laid when the terrain left no plot (the dead then simply fade). The grave is a mound and headstone (`GRAVE_KEY`, `dressingKit.buildGraveGeometry`, `LOOK.CAPACITY.GRAVE`) drawn by the dressing renderer. Graves block no paths.

## Events and save
- Sim events `hunger` (`empty`, `weak`, `recovered`), `villagerDying`, `villagerDied`, `graveAdded`. `VillageSystem.applyEvents` forwards the first three to the bus as `village:hunger`, `village:villagerDying`, `village:villagerDied` (`ui/village/villageAlerts.ts` turns them into toasts) and `graveAdded` to the view only.
- The village line, the overview chip and the temple panel (hunger and graves) show the state.
- Saved: `VillageSimState.hunger`, `graveyard` (plot and graves), `dying` in the pool.

## DEV
`__pantheonVillage.hunger()`, `graves()`, `starve()` (larder empty, everyone weak), `killOne()`, dev panel buttons.

## Check
`npm run check:village-hunger` (`scripts/checks/village/hunger-check.ts`: the pure rules, the pool, victim order, the plot, a famine's timeline, the elder, a village that holds at what its food supports, removals leaving no stale index, determinism); `check:save-village` also saves a famine mid-way.
