# The hand: uproot, lift, drop (design)

Status: built. The code, the numbers and the checks are in `docs/village/hand.md`; where this page disagrees with the code, the code wins. Every number is a placeholder, tuned after a playtest. The village, belief and the conversion quest it changes are in `docs/village/` and `QUESTS.md`.

## The idea

The orb used to win belief by whispering (Murmur, Dream, Sign) and to help the village with instant boosts (Blessing, Kindle, Provide). Both are replaced by one practical verb: the orb has a **hand**. It uproots a tree and drops it in the village as wood, lifts ripe wheat and a sheep and drops them as food, and hauls wood to a build site, an upgrade or a remote camp so the builders finish sooner. Villagers believe because they **see it done**, not because they are told. The whole village loop serves one goal: more faith, faster.

Kept from before: Hearten (a touch on one villager), prayers, Call rain and Clear skies. Standing rule: **villagers are never picked up or thrown**. The hand carries things, not people.

## The verbs

**Roam** (the orb flies, no mouse aiming):
1. Near a tree, a ripe wheat field or a sheep, the nearest one within reach gets a ring and a hint.
2. **F** lifts it. This costs energy (more for a tree than for a sheaf). A tree is shown small, tilted and trailing behind the orb, with a stump where it stood; a sheaf or a sheep is drawn at the orb.
3. Carry it to the village. **F** again drops it.

**Overview** (the orb is the cursor): the first slot of the powers bar (key 1). A click lifts what is under the cursor, a second click puts it down; it stays armed for the next one. Left-drag still pans, so there is no drag-to-grab. A click with a full hand outside every drop zone only says so and lets nothing go, so a mis-click costs nothing. Esc puts the item back (the effort is lost, as in roam), a second Esc puts the hand away. An item is kept across the overview toggle. **The hand wins clicks:** while it holds something, every click is its own whatever power is armed, and choosing another power says "put it down first" and arms nothing. The cost, reach and deeds are the roam ones: the same runtime is aimed at a point instead of at the orb.

The hand opens with the skill tree.

## Where it can be dropped

| Drop zone | What happens |
|---|---|
| Temple, granary, workshop, well, the stores | Wood or food joins the stock (clipped to the store caps) |
| An open build site or an upgrade | Wood counts as **work** on it, so hauling helps the builders |
| The camp or the place of an unfinished remote site (a place of power being restored, an outpost) | Wood counts as work for the crew there. Food, or a finished site, is not a zone |
| Anywhere else | The item goes back where it came from and the energy is lost |

A tree is worth about a minute of one builder's work next to the half hour a site takes, so hauling speeds the crew up and does not replace it.

## The rule that keeps it safe: the village changes only at delivery

Pickup is a hold in the view. The tree is still standing in the sim, the wheat is still on the field, the sheep is only out of its flock. The single drop call does the real work: it uproots the tree (straight to a stump, which regrows as usual), harvests the field, and credits the stores. So pausing, a cutscene, Esc, losing pointer lock or an overview toggle never corrupts anything: a **forced cancel** puts the item back and refunds the energy, and a save writes the energy of a hold back as unspent (nothing of the hold itself is saved). A voluntary release outside a zone puts it back but forfeits the energy, so grab-and-release cannot be farmed.

Sheep stay **cosmetic**: never saved, never read by the sim. A delivered sheep is consumed and respawns after a while, and the sim receives a capped food gift. Sheep first; hens later (they flee the orb from 5 m and run fast).

## Deeds and belief

A **deed** is a lift or a delivery. Awake, outdoor, living villagers within the witness radius gain belief: a small awe at the lift, more at the delivery, and more again when the deed meets an open need (wood for a site or a camp, a store running short of that good). Each villager has a short cooldown between payouts (in memory, not saved). Deeds count even when the stores are full: belief never depends on room, because a hamlet before its conversion has no sites, no workshop and no granary, only the temple, trees and wheat.

**Who can be reached** (a one-off look at the island hamlet, not asserted by a check): the idlers and the elder (a priest) stay near the temple all day, the woodcutters work some way out, and the farmers and the fisher are a hundred metres or more away. A delivery at the temple therefore impresses the idlers; the others are reached by **lifts** near where they work (a tree beside a woodcutter, or ripe wheat in a field beside the farmers). That is why a lift is worth something on its own and why the first five believers need both. Nobody is out at night, so deeds then impress no one. With the placeholder numbers a player who lifts the tree nearest a woodcutter and drops it at the temple converts five villagers in a few dozen trees, most of it waiting for dusk and for the elder (`hand-quest-check` plays the whole quest on deeds and prints the count).

**The elder gate** moves with the payout: nobody is impressed past the elder's quest step before his own step.

## The conversion quest on deeds

Step ids and order are those of the old quest: `meet`, `convert`, `fire`, `offering`, `believe`. The quest is finished by deeds alone.
- `convert` reads "Impress five villagers."
- `fire` reads "Bring wood to the temple at dusk."
- Target pacing: the conversion should take about 10 to 15 minutes of deeds.

## Builder powers

Call rain, Clear skies and Hearten stay. Helping is physical: the hand brings wood and food, and wood at a site is work.

## Building effects and the faith economy

Levels matter. Effects are **derived** from finished buildings and their levels each step, with no saved state, so a village without those buildings plays exactly as before. Numbers and code: [upgrades](../docs/village/upgrades.md#building-effects).
- **Farmstead** (plot-only): fields near it grow faster and give more food per harvest, more with each level; farmsteads stack to a cap.
- **Workshop**: each level above 1 speeds the woodcutters (and, accepted for now, sapling growth).
- **Shrine** (plot-only): a little faith a second per level, capped.
- **Fervour**, a skill node: all faith income is multiplied, in the hamlet and in the sandbox.
- **Plot types are opened by the skill tree** (Travian-style): one node for Farmsteads, one for Shrines (after answered prayers). Houses, workshops and granaries are open to everyone. A closed type is hidden in the "Mark a place" row. Fine works lets farmsteads and shrines rise past level 1.
- The name **Shrine** overlaps with the energy shrines on the map (`PHASE0.SHRINE`); the building is the village's own. Rename it in one string if that confuses.

New building types are placeholders (the house kit stands in) until the creator models them. The model list is in `PHASE_0_TODO.md` ("The hand"). Market (surplus into faith) and Beacon (wider orb presence) are named ideas, not in this scope.

## Open

- All numbers: reach, costs, belief per deed, witness radius, cooldown, wood to work, wheat and sheep food, respawn time, effects per level.
- Whether carrying should also slow the orb or drain energy (not now: energy is charged at pickup only).
- Hens: a calming rule while the hand is out, or left alone.
- Which building types come after Farmstead and Shrine (Market, Beacon).
- The look of the carried tree, the sheaf and the held sheep (all stand-ins, GPU checklist in `PHASE_0_TODO.md`).
