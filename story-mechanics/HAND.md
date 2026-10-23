# The hand: uproot, lift, drop (design)

Status: designed, being built in milestones H0 to H7 (this page is H0). Built so far: the sim inputs (H1), the pure core in `src/hand/` with `check:hand` (H2a), and the roam hand with trees: the **F** key, the carried tree, deeds that win belief, and the DEV hook `window.__pantheonHand` (H2b; the old powers are still in the game until H3b), then ripe wheat (H2c: lift a field at 90% growth or more, a stand-in pile hangs from the orb, the field is reaped at the drop). Every number is a placeholder, tuned after a playtest. The village, belief and the conversion quest it changes are in `docs/village/` and `QUESTS.md`; where this page disagrees with the code, the code wins until the milestone that changes it has landed.

## The idea

The orb used to win belief by whispering (Murmur, Dream, Sign) and to help the village with instant boosts (Blessing, Kindle, Provide). Both are replaced by one practical verb: the orb has a **hand**. It uproots a tree and drops it in the village as wood, lifts ripe wheat and a sheep and drops them as food, and hauls wood to a build site so the builders finish sooner. Villagers believe because they **see it done**, not because they are told. The whole village loop serves one goal: more faith, faster.

Kept from before: Hearten (a touch on one villager), prayers, Call rain and Clear skies. Standing rule kept: **villagers are never picked up or thrown**. The hand carries things, not people.

## The verbs

**Roam** (the orb flies, no mouse aiming):
1. Near a tree, a ripe wheat field or a sheep, the nearest one within reach gets a ring and a hint.
2. **F** lifts it. This costs energy (more for a tree than for a sheaf). A tree is shown small, tilted and trailing behind the orb, with a stump where it stood; a sheaf or a sheep is drawn at the orb.
3. Carry it to the village. **F** again drops it.

**Overview** (the orb is the cursor): an armed tool in the powers bar. A click picks what is under the cursor, a second click drops it. Left-drag still pans, so there is no drag-to-grab. Esc puts the item back before it disarms. An item is kept across the overview toggle.

The hand opens with the skill tree, the moment Murmur used to.

## Where it can be dropped

| Drop zone | What happens |
|---|---|
| Temple, granary, workshop, well, the stores | Wood or food joins the stock (clipped to the store caps) |
| An open build site or an upgrade | Wood counts as **work** on it (`WORK_PER_WOOD_S`), so hauling helps the builders |
| Anywhere else | The item goes back where it came from and the energy is lost |

## The rule that keeps it safe: the village changes only at delivery

Pickup is a hold in the view. The tree is still standing in the sim, the wheat is still on the field, the sheep is only out of its flock. The single drop call does the real work: it uproots the tree (straight to a stump, which regrows as usual), harvests the field, and credits the stores. So saving, pausing, a cutscene, Esc, losing pointer lock or an overview toggle never corrupts anything: a **forced cancel** puts the item back and refunds the energy. A voluntary release outside a zone puts it back but forfeits the energy, so grab-and-release cannot be farmed.

Sheep stay **cosmetic**: never saved, never read by the sim. A delivered sheep is consumed and respawns after a while, and the sim receives a capped food gift (`economy.addFood`). Sheep first; hens later (they flee the orb from 5 m and run fast).

## Deeds and belief

A **deed** is a lift or a delivery. Awake, outdoor, living villagers within `WITNESS_M` of it gain belief: a small awe at the lift, more at the delivery, and more again when the deed meets an open need (a site waiting for wood, an empty larder, a food prayer). Each villager has a short cooldown between payouts (in memory, not saved). Deeds count even when the stores are full: belief never depends on room, because a hamlet before its conversion has no sites, no workshop and no granary, only the temple, trees and wheat.

**Who can be reached** (measured on the island hamlet by `check:hand`): the four idlers and the elder (a priest) stay within about 20 m of the temple all day, the woodcutters work 40 to 60 m out, and the farmers and the fisher are 105 to 160 m away. A delivery at the temple therefore impresses the idlers; the others are reached by **lifts** near where they work (a tree beside a woodcutter, or ripe wheat in a field beside the farmers; the two hamlet fields lie about 130 m from the temple). That is why a lift is worth something on its own and why the first five believers need both. Nobody is out at night, so deeds then impress no one. With the placeholder numbers a player who lifts the tree nearest a woodcutter and drops it at the temple converts five villagers in about 19 trees, roughly 13 minutes of deeds (plus the wait through a night).

**The elder gate** moves with the payout: nobody is impressed past the elder's quest step before his own step, exactly as the old powers behaved.

## The conversion quest on deeds

Step ids and order are unchanged: `meet`, `convert`, `fire`, `offering`, `believe`.
- `convert` reads "Impress five villagers."
- `fire` reads "Bring wood to the temple at dusk." (it used to be a Sign).
- Target pacing: the conversion should take about 10 to 15 minutes of deeds.

## Builder powers

Blessing, Kindle and Provide are removed. Call rain, Clear skies and Hearten stay. Helping is now physical: the hand brings wood and food, and wood at a site is work.

## Building effects and the faith economy

Levels start to matter. Effects are **derived** from finished buildings and their levels each step (a pure pass, no saved state), so they leave saves and goldens alone when absent.
- **Farmstead** (new plot-only building): fields within its radius grow faster and yield more, per level.
- **Workshop**: its level speeds the woodcutters.
- **Shrine** (new plot-only building): faith per second per level.
- A **faith multiplier** (`faithMul`) from the skill tree applies to the believer income, in the hamlet and in the sandbox.
- **Plot types are unlocked by the skill tree** (Travian-style): one arch II node per type, chained and gated by existing milestones. Today every plot type appears once ten buildings are finished; a locked type shows "locked" until its node is taken.

New building types are placeholders (the house kit stands in) until the creator models them. The model list is in `PHASE_0_TODO.md` ("The hand"). Market (surplus into faith) and Beacon (wider orb presence) are named ideas, not in this scope.

## Open

- All numbers: reach, costs, belief per deed, witness radius, cooldown, wood to work, wheat and sheep food, respawn time, effects per level.
- Whether carrying should also slow the orb or drain energy (not now: energy is charged at pickup only).
- Hens: a calming rule while the hand is out, or left alone.
- Which building types come after Farmstead and Shrine.
- The look of the carried tree, the sheaf and the held sheep (all stand-ins, GPU checklist in `PHASE_0_TODO.md`).
