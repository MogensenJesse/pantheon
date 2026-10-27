# The orb's hand

Design and the reasons: `story-mechanics/HAND.md`. Numbers: `VILLAGE.HAND` (`src/config/village/hand.ts`, all placeholders) and `VILLAGE.EFFECTS` (`config/village/effects.ts`). The conversion quest that is won by deeds is in [hamlet-quest.md](hamlet-quest.md).

The orb uproots a tree, lifts a ripe field's wheat or a sheep, carries it and puts it down in the village. Wood and food join the stores; wood at an open site or an upgrade is work. Villagers who see it done gain belief. It works in the roam view (key `F`) and in the overview (the first slot of the powers bar).

## The rule: the village changes only at the drop
A lift is a hold in the view. The tree is still standing in the sim, the wheat is still on the field, the sheep is only out of its flock. `drop` does the real work (`VillageSim.uprootTree`, `takeHarvest`, `economy.addWood/addFood`, `haul`). So everything that is not a drop (`cancel`, `putBack`, a woodcutter felling the held tree first) leaves the world as it was. A **forced** `cancel` (a cutscene, the finale, the hand being blocked) refunds the energy; a save needs none, because nothing of the hold is saved and the energy it has paid is written back as unspent (`energyOnHold`, below); a **voluntary** release outside every zone (`putBack`, or `drop` outside a zone) forfeits it, so grab-and-release cannot be farmed.

## Layers
| Layer | Where | What |
|---|---|---|
| Pure core | `src/hand/` (no DOM, no three, node-runnable) | `handTypes` (`Held`, `Place`, `HandEnergy`, `HandCandidate`), `handRules` (reach and cost, `pickTarget`, `classifyDrop`, `meetsNeed`, the `createHand` state machine and energy charge/refund), `deeds` (`createDeedLedger`: witnesses, belief, per-villager cooldowns, the elder gate), `carryPose` (the pose of the carried thing and its heading), `handText` (every line the hand says), `overviewAim` (where a click acts in the overview), `handRuntime` (`createHandRuntime(ports)`) |
| Roam UI | `src/ui/hand/handUi.ts` | the `F` key, a ring on what would be lifted and on where it would go, a hint line, toasts, the burst at a drop; shows only while the skill tree is open and nothing else owns the orb |
| Overview UI | `src/ui/overview/overviewHand.ts` | the hand as a tool on the powers bar: click lifts, click drops, a click outside every zone lets nothing go, Esc puts the item back; it takes the clicks while it holds something, armed or not |
| View | `world/village/render/forestView.ts` (`lift/pose/release`: the carried tree is small, tilted and trailing, a stump shows where it stood), `dressingRenderer.ts` (`holdStockpile`: the sheaf stand-in), `life/animals/animals.ts` (the held sheep) | stand-ins; looks are on the GPU checklist in `story-mechanics/PHASE_0_TODO.md` |
| Wiring | `gameplay/initGameplay.ts` builds the runtime once the tree has opened, `cancel()`s before the finale, emits `hand:delivered`; `core/gameTick.ts` has the per-frame hook; `main.ts` wires the overview slot and gives the save `energyOnHold` | |

`createHandRuntime(ports)` takes `energy`, `orb`, `village` (a `VillageSystemContext` fits), `animals`, `deeds` (`DeedWorld`: pool, `addBelief`, `notice`, `canBelieve`), `reachMul`, `costMul` and `blocked`. `pick(at?)` and `drop(at?)` default to the orb's place; the overview passes the point under the cursor. `target()` is looked up a few times a second, `targetAt(at)` now. `update(dt)` runs once per fixed step and says why a hold ended by itself (`'gone'`: the tree was felled; `'blocked'`).

## What it lifts
| Thing | Reach | Cost (energy) | Becomes |
|---|---|---|---|
| Tree | 6 m from the trunk | 10 | its yield in wood (`forest.uproot`: straight to a stump, which regrows as usual) |
| Ripe wheat | 2 m from the field's edge, growth at least 0.9 | 4 | food, the yield times the growth (`takeHarvest`, which also counts the farmstead's bonus) |
| Sheep | 3 m | 6 | `ANIMAL_FOOD.sheep` food; the animal is cosmetic, comes back after `ANIMALS.RESPAWN_S`, and is never saved |

The skill nodes Long reach (`handReachMul`) and Deep grip (`handCostMul`) scale reach and cost. Energy is charged on the lift only.

## Where it can be put down
`classifyDrop` (`handRules.ts`): the temple, the stores (granary, workshop) and the well take wood or food into the stock, clipped to the caps; an open build site or an upgrade takes wood as work (`WORK_PER_WOOD_S` per wood, `VillageSim.haul`); anywhere else the item goes back and the effort is lost. `ZONE_MARGIN_M` widens every footprint.

## Deeds and belief
`deeds.ts`: a lift and a delivery are deeds. Villagers outdoors, awake and alive within `DEED.WITNESS_M` stop and look (`sim.notice`) and gain belief (`LIFT_BELIEF`, `DELIVER_BELIEF`, times the worth of what was moved, times `NEED_MUL` when it met an open need). Each villager has a cooldown per kind of deed, in memory only. Deeds count even when the stores are full. The elder is gated in the payout (`canBelieve`). `bus` event `hand:delivered { what, amount, zone, x, z }` feeds the conversion quest.

## Building effects (H6)
Derived each step from the finished buildings, nothing saved (`sim/buildingEffects.ts`): with no such building every factor is exactly 1 and every bonus exactly 0, so a village without them plays, hashes and saves exactly as before.
- **Farmstead** (plot only): the fields within `FARMSTEAD.RADIUS_M` of a finished farmstead grow `GROWTH_PER_LEVEL` faster and give `YIELD_PER_LEVEL` more food per level; farmsteads stack up to `MAX_GROWTH_ADD` and `MAX_YIELD_ADD`. Used in the field loop, the tended harvest and `takeHarvest` (`fieldBonus`).
- **Workshop**: each level above 1 adds `WORKSHOP.CHOP_PER_LEVEL` to the woodcutters' speed (`chopMul`, fed to `ForestRules.treeBoost`, which also speeds sapling growth).
- **Shrine** (plot only): `SHRINE.FAITH_PER_LEVEL` faith per second per level, capped (`shrineFaith`), added to the base before the presence and the multiplier.
- **Fervour** (skill node): `Modifiers.faithMul` multiplies all faith income. `stepFaith` takes `bonusRate` and `mul`: `rate = (base + bonus) × mul × presence`, on the hamlet and sandbox paths alike.
- Farmstead and shrine belong to the upgrade group `works` (ceiling `workTier`, raised by Fine works); see [upgrades](upgrades.md).
- Plot types are opened by the tree: Farmsteads and Shrines switch on `plotFarmstead` and `plotShrine` (`PLOT_UNLOCKS`, `plotTypeOpen` in `model/buildings.ts`); a closed type answers `'locked'` from `plotCheck`; see [plots](plots.md).

## Save
Nothing about the hand is saved. The held thing is a view-only hold: a save writes the energy it has paid back as unspent (`setupSaving` `energyOnHold`), so a reload finds the tree standing and the energy whole; sheep are never saved, the deed cooldowns live in memory. The village's own changes at a drop are ordinary sim changes (a stump, a reset field, stock, work). Save version 19; see [save](save.md).

## DEV
`window.__pantheonHand` (`dev/runtime/handProbe.ts`): `state()`, `nearby()`, `fields()`, `sheep()`, `grab()`, `drop()`, `dropAt(x, z)`, `goTo*`, `cancel()`, `deeds()`, `setEnergy(n)`.

## Checks
`npm run check:hand` (`scripts/checks/hand/hand-check.ts`): target scoring, drop zones, charge/refund/forfeit, cancel idempotence, the elder gate, witness filters and cooldowns, the runtime on fakes, sheep, the overview parity (lifting and putting down at points leaves the village as flying there does), determinism, and the whole conversion quest played on deeds alone. `check:village-effects` (the farmstead's reach and levels, the workshop, the shrine, the faith multiplier in the hamlet and the sandbox), `check:village-forest` (uproot), `check:village-economy` (haul), `check:animal`, `check:skills` (the hand and plot nodes), `check:village-plots` (the lock), `check:village-levels`, and the hand scenario in `check:save-village`.
