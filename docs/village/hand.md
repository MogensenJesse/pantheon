# The orb's hand

Design and the reasons: `story-mechanics/HAND.md`. Numbers: `VILLAGE.HAND` (`src/config/village/hand.ts`, all placeholders); the rings' sizes and the carried thing's pose are look values in `VISUAL.hand` (`src/config/visual/hand.ts`). The conversion quest that is won by deeds is in [hamlet-quest.md](hamlet-quest.md); what finished buildings and their levels do is in [upgrades](upgrades.md#building-effects).

The orb uproots a tree, lifts a ripe field's wheat or a sheep, carries it and puts it down in the village. Wood and food join the stores; wood at an open site, an upgrade or a remote site is work. Villagers who see it done gain belief. It works in the roam view (key `F`) and in the overview (the first slot of the powers bar).

## The rule: the village changes only at the drop
A lift is a hold in the view. The tree is still standing in the sim, the wheat is still on the field, the sheep is only out of its flock. `drop` does the real work (`VillageSim.uprootTree`, `takeHarvest`, `economy.addWood/addFood`, `haul`, `haulRemote`). So everything that is not a drop (`cancel`, `putBack`, a woodcutter felling the held tree first) leaves the world as it was. A **forced** `cancel` (a cutscene, the finale, the hand being blocked) refunds the energy; a **voluntary** release outside every zone (`putBack`, or `drop` outside a zone) forfeits it, so grab-and-release cannot be farmed. A save needs neither: nothing of the hold is saved and the energy it has paid is written back as unspent (`withHeldEnergy` in `handRules.ts`, fed by `energyOnHold`; see Save).

## Layers
| Layer | Where | What |
|---|---|---|
| Pure core | `src/hand/` (no DOM, no three, node-runnable) | `handTypes` (`Held`, `Place`, `HandEnergy`, `HandCandidate`, `HAND_KINDS`), `handRules` (reach and cost, `pickTarget`, `classifyDrop`, `meetsNeed`, the `createHand` state machine and energy charge/refund, `withHeldEnergy`), `handPorts` (types only: `HandPorts`, `HandVillage`, `HandAnimals`, `Delivery`, the pick and drop outcomes), `deeds` (`createDeedLedger`: witnesses, belief, per-villager cooldowns, the elder gate), `carryPose` (the pose of the carried thing and its heading), `handText` (every line the hand says), `overviewAim` (where a click acts in the overview, and who owns a click: `clickOwner`, `canArm`), `handRuntime` (`createHandRuntime(ports)`) |
| Roam UI | `src/ui/hand/handUi.ts`, `handRings.ts` | the `F` key, a ring on what would be lifted and on where it would go, a hint line, toasts, the burst at a drop; shows only while the skill tree is open and nothing else owns the orb. `handRings` holds the ring sizes and shapes both UIs share |
| Overview UI | `src/ui/overview/overviewHand.ts` | the hand as a tool on the powers bar: click lifts, click drops, a click outside every zone lets nothing go, Esc puts the item back; it takes the clicks while it holds something, armed or not |
| View | `world/village/render/forestView.ts` (`lift/pose/release`: the carried tree is small, tilted and trailing, a stump shows where it stood), `dressingRenderer.ts` (`holdSheaf`, `poseSheaf`, `releaseSheaf`: the sheaf stand-in), `life/animals/animals.ts` (the held sheep) | stand-ins; looks are on the GPU checklist in `story-mechanics/PHASE_0_TODO.md` |
| Wiring | `gameplay/initGameplay.ts` builds the runtime whenever a village exists and the UI on top of it (`enabled` and `active` are both "the skill tree is open and nothing else owns the orb"), `cancel()`s before the finale and emits `hand:delivered`; `core/gameTick.ts` runs the per-frame render hook; `main.ts` gives the save `energyOnHold`; the overview hosts the hand slot (`overviewPowers.ts`) | |

`createHandRuntime(ports)` takes `energy`, `orb`, `village` (the sim plus the view's `carry` hooks), `animals`, `deeds` (`DeedWorld`: pool, `addBelief`, `notice`, `canBelieve`), `reachMul`, `costMul`, `blocked` and `active`. `pick(at?)` and `drop(at?)` default to the orb's place; the overview passes the point under the cursor. `target()` is looked up a few times a second (not at all while `active` says no), `targetAt(at)` now. `update(dt)` runs once per fixed step and says why a hold ended by itself (`'gone'`: the tree was felled; `'blocked'`). The look at what is in reach reuses its candidate objects, so it allocates nothing per call.

## What it lifts
| Thing | Reach (`HAND.REACH_M`) | Cost (`HAND.COST`) | Becomes |
|---|---|---|---|
| Tree | from the trunk | energy | its yield in wood (`forest.uproot`: straight to a stump, which regrows as usual) |
| Ripe wheat | from the field's edge, growth at least `WHEAT.MIN_RIPE` | energy | food, the yield times the growth (`takeHarvest`, which also counts the farmstead's bonus) |
| Sheep | from the animal | energy | `ANIMAL_FOOD.sheep` food; the animal is cosmetic, comes back after `ANIMALS.RESPAWN_S`, and is never saved |

The skill nodes Long reach (`handReachMul`) and Deep grip (`handCostMul`) scale reach and cost. Energy is charged on the lift only.

## Where it can be put down
`classifyDrop` (`handRules.ts`):
- the temple, the stores (granary, workshop) and the well take wood or food into the stock, clipped to the caps;
- an open build site or an upgrade takes wood as work (`WORK_PER_WOOD_S` per wood, `VillageSim.haul`);
- a **remote site** that is not finished (a restoration, an outpost) takes wood as work too, when the drop lands within `REMOTE_DROP_M` of its camp or its place (`VillageSim.haulRemote`, the same work as the crew's, so the stage rolls over and the place completes through the usual `remoteStageCompleted` event). Food is not taken there, nor is a finished site;
- anywhere else the item goes back and the effort is lost.

`ZONE_MARGIN_M` widens every building's footprint on each side.

## Deeds and belief
`deeds.ts`: a lift and a delivery are deeds. Villagers outdoors, awake and alive within `DEED.WITNESS_M` stop and look (`sim.notice`) and gain belief (`LIFT_BELIEF`, `DELIVER_BELIEF`, times the worth of what was moved, times `NEED_MUL` when it met an open need: wood to a site or a camp, or a store short of that good). Each villager has a cooldown per kind of deed, in memory only. A run of small payouts is rounded to exactly 1 at `NEARLY_BELIEVING` (`deeds.ts`), so the last one converts. Deeds count even when the stores are full. The elder is gated in the payout (`canBelieve`). The bus event `hand:delivered` carries the `Delivery` (`what`, `amount`, `kept`, `zone`, `x`, `z`, `impressed`, `converted`) and feeds the conversion quest.

## In the overview
`overviewAim.ts` is pure: `overviewPlace` says where a click acts (a lift at the ground point or a picked field's middle, a put-down at a picked building's middle), `clickOwner` and `canArm` say who owns a click. **The hand wins:** while it holds something every click is its own whatever power is armed, and choosing another power is refused with a line from `handText` (`putDownFirstText`) and arms nothing.

## Save
Nothing about the hand is saved. The held thing is a view-only hold: a save writes the energy it has paid back as unspent (`setupSaving`, `withHeldEnergy(state, energyOnHold())`), so a reload finds the tree standing and the energy whole; sheep are never saved, the deed cooldowns live in memory. The village's own changes at a drop are ordinary sim changes (a stump, a reset field, stock, work). Save version 19; see [save](save.md).

## DEV
`window.__pantheonHand` (`dev/runtime/handProbe.ts`): `state()`, `nearby()`, `fields()`, `sheep()`, `grab()`, `drop()`, `dropAt(x, z)`, `liftAt(x, z)`, `putDownAt(x, z)`, `targetAt(x, z)`, `putBack()`, `goTo(x, z)`, `goToTree(id)`, `goToField(id)`, `goToSheep(id)`, `cancel()`, `deeds()`, `setEnergy(n)`.

## Checks
`npm run check:hand` runs three files in `scripts/checks/hand/` (each also has its own `check:hand-rules`, `check:hand-runtime`, `check:hand-quest`):
- `hand-rules-check`: target scoring, drop zones (including the remote one), charge, refund and forfeit, cancel idempotence, who owns a click, `withHeldEnergy` and the words of `handText`. Pure, no village.
- `hand-runtime-check`: the runtime on a real hamlet with fake ports: lifting is only a hold, a drop at the temple, at a site and at a remote camp (stages roll over), a thing taken first, wheat and sheep, the aim, the carried pose, the cancel, let-go-outside and full-store contracts run from one table for tree, wheat and sheep, and the overview parity (lifting and putting down at points leaves the village as flying there does).
- `hand-quest-check`: the elder gate, witness filters and cooldowns, deeds on a real hamlet, determinism, and the whole conversion quest played on deeds alone.

The shared fixtures (a hamlet, a hand on it, an energy meter, the farm's sheep) are `scripts/checks/lib/handFixtures.ts`. Related: `check:village-effects`, `check:village-forest` (uproot), `check:village-economy` (haul), `check:village-remote` (the camp), `check:animal`, `check:skills` (the hand and plot nodes), `check:village-plots` (the lock), `check:village-levels`, `check:overview` (the building panels), and the hand scenario in `check:save-village`.
