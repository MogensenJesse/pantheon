# The hand: uproot, lift, drop (design)

Status: built in milestones H0 to H7 (code notes: `docs/village/hand.md`). Built: the sim inputs (H1), the pure core in `src/hand/` with `check:hand` (H2a), and the roam hand with trees: the **F** key, the carried tree, deeds that win belief, and the DEV hook `window.__pantheonHand` (H2b), then ripe wheat (H2c: lift a field at 90% growth or more, a stand-in pile hangs from the orb, the field is reaped at the drop), then sheep (H2d: a sheep hangs from the orb, is consumed at the drop for `ANIMAL_FOOD.sheep` food and comes back after 90 to 180 s; sheep exist once the village is converted), then the end of Murmur, Dream and Sign (H3b: the conversion quest is finished on deeds alone, the skill nodes `dream` and `sign` became `long_reach` and `deep_grip`, save version 18), then the same hand in the overview (H4: the first slot of the powers bar), then the end of Blessing, Kindle and Provide (H5: `blessings` left the saved village, save version 19, golden hashes re-pinned after proof), then building effects (H6: the Farmstead and the Shrine, the workshop's level, the faith multiplier, plot types opened by the skill tree; derived, nothing saved, save version still 19). Every number is a placeholder, tuned after a playtest. The village, belief and the conversion quest it changes are in `docs/village/` and `QUESTS.md`; where this page disagrees with the code, the code wins until the milestone that changes it has landed.

## The idea

The orb used to win belief by whispering (Murmur, Dream, Sign) and to help the village with instant boosts (Blessing, Kindle, Provide). Both are replaced by one practical verb: the orb has a **hand**. It uproots a tree and drops it in the village as wood, lifts ripe wheat and a sheep and drops them as food, and hauls wood to a build site so the builders finish sooner. Villagers believe because they **see it done**, not because they are told. The whole village loop serves one goal: more faith, faster.

Kept from before: Hearten (a touch on one villager), prayers, Call rain and Clear skies. Standing rule kept: **villagers are never picked up or thrown**. The hand carries things, not people.

## The verbs

**Roam** (the orb flies, no mouse aiming):
1. Near a tree, a ripe wheat field or a sheep, the nearest one within reach gets a ring and a hint.
2. **F** lifts it. This costs energy (more for a tree than for a sheaf). A tree is shown small, tilted and trailing behind the orb, with a stump where it stood; a sheaf or a sheep is drawn at the orb.
3. Carry it to the village. **F** again drops it.

**Overview** (the orb is the cursor): the first slot of the powers bar (key 1). A click lifts what is under the cursor, a second click puts it down; it stays armed for the next one. Left-drag still pans, so there is no drag-to-grab. A click with a full hand outside every drop zone only says so and lets nothing go, so a mis-click costs nothing. Esc puts the item back (the effort is lost, as in roam), a second Esc puts the hand away. An item is kept across the overview toggle and, while it is held, takes the clicks whatever is armed. The cost, reach and deeds are the roam ones: the same runtime is aimed at a point instead of at the orb.

The hand opens with the skill tree, the moment Murmur used to.

## Where it can be dropped

| Drop zone | What happens |
|---|---|
| Temple, granary, workshop, well, the stores | Wood or food joins the stock (clipped to the store caps) |
| An open build site or an upgrade | Wood counts as **work** on it (`WORK_PER_WOOD_S`), so hauling helps the builders |
| Anywhere else | The item goes back where it came from and the energy is lost |

## The rule that keeps it safe: the village changes only at delivery

Pickup is a hold in the view. The tree is still standing in the sim, the wheat is still on the field, the sheep is only out of its flock. The single drop call does the real work: it uproots the tree (straight to a stump, which regrows as usual), harvests the field, and credits the stores. So pausing, a cutscene, Esc, losing pointer lock or an overview toggle never corrupts anything: a **forced cancel** puts the item back and refunds the energy, and a save writes the energy of a hold back as unspent (nothing of the hold itself is saved). A voluntary release outside a zone puts it back but forfeits the energy, so grab-and-release cannot be farmed.

Sheep stay **cosmetic**: never saved, never read by the sim. A delivered sheep is consumed and respawns after a while, and the sim receives a capped food gift (`economy.addFood`). Sheep first; hens later (they flee the orb from 5 m and run fast).

## Deeds and belief

A **deed** is a lift or a delivery. Awake, outdoor, living villagers within `WITNESS_M` of it gain belief: a small awe at the lift, more at the delivery, and more again when the deed meets an open need (a site waiting for wood, an empty larder, a food prayer). Each villager has a short cooldown between payouts (in memory, not saved). Deeds count even when the stores are full: belief never depends on room, because a hamlet before its conversion has no sites, no workshop and no granary, only the temple, trees and wheat.

**Who can be reached** (measured on the island hamlet by `check:hand`): the four idlers and the elder (a priest) stay within about 20 m of the temple all day, the woodcutters work 40 to 60 m out, and the farmers and the fisher are 105 to 160 m away. A delivery at the temple therefore impresses the idlers; the others are reached by **lifts** near where they work (a tree beside a woodcutter, or ripe wheat in a field beside the farmers; the two hamlet fields lie about 130 m from the temple). That is why a lift is worth something on its own and why the first five believers need both. Nobody is out at night, so deeds then impress no one. With the placeholder numbers a player who lifts the tree nearest a woodcutter and drops it at the temple converts five villagers in about 19 trees, roughly 13 minutes of deeds (plus the wait through a night).

**The elder gate** moves with the payout: nobody is impressed past the elder's quest step before his own step, exactly as the old powers behaved.

## The conversion quest on deeds

Step ids and order are unchanged: `meet`, `convert`, `fire`, `offering`, `believe`. Built (H3a): the quest takes a `deed` event as well as the old `signCast`, so it can be finished by the hand now and the Sign can be removed later; `check:hand` plays the whole quest on deeds alone (30 trees over about two in-game days, most of it waiting for dusk and for the elder).
- `convert` reads "Impress five villagers."
- `fire` reads "Bring wood to the temple at dusk." (it used to be a Sign).
- Target pacing: the conversion should take about 10 to 15 minutes of deeds.

## Builder powers

Blessing, Kindle and Provide are removed (built, H5). Call rain, Clear skies and Hearten stay. Helping is now physical: the hand brings wood and food, and wood at a site is work.

## Building effects and the faith economy

Levels matter now (built, H6). Effects are **derived** from finished buildings and their levels each step (`sim/buildingEffects.ts`, a pure pass, no saved state), so they leave saves and goldens alone when absent.
- **Farmstead** (plot-only): fields within 70 m grow 25% faster and give one food more per harvest, per level (capped; farmsteads stack).
- **Workshop**: each level above 1 adds a quarter to the woodcutters' speed (it also speeds sapling growth, accepted for now).
- **Shrine** (plot-only): 0.03 faith per second per level, capped.
- **Fervour**, a skill node: all faith income x1.25, in the hamlet and in the sandbox.
- **Plot types are opened by the skill tree** (Travian-style): the node Farmsteads (after Good soil) and the node Shrines (after Seedkeeper, once five prayers are answered). Houses, workshops and granaries are open to everyone. A closed type is hidden in the "Mark a place" row. Fine works (two ranks, needs a building raised to level 2) lets farmsteads and shrines rise to levels 2 and 3.
- The name **Shrine** overlaps with the energy shrines on the map (`PHASE0.SHRINE`); the building is the village's own. Rename it in one string if that confuses.

New building types are placeholders (the house kit stands in) until the creator models them. The model list is in `PHASE_0_TODO.md` ("The hand"). Market (surplus into faith) and Beacon (wider orb presence) are named ideas, not in this scope.

## Open

- All numbers: reach, costs, belief per deed, witness radius, cooldown, wood to work, wheat and sheep food, respawn time, effects per level.
- Whether carrying should also slow the orb or drain energy (not now: energy is charged at pickup only).
- Hens: a calming rule while the hand is out, or left alone.
- Which building types come after Farmstead and Shrine (Market: surplus into faith; Beacon: a wider orb presence).
- The look of the carried tree, the sheaf and the held sheep (all stand-ins, GPU checklist in `PHASE_0_TODO.md`).
