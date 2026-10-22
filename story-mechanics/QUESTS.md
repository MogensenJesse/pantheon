# Quests (overview)

One page for every quest, built and proposed, so the story, the objectives and the gates read as one line. Status marks: **built** (in the game), **gate** (a rule that stops progress until something is done, shown as an objective), **proposed** (not built; for you to cut, change or approve). Texts quoted here are the placeholder ones in the code.

## How quests work in the game

- A quest is data: a list of steps (`src/quests/quest.ts`, pure). A step has an objective line, an optional counter, a reward (sparks, a story beat) and a rule for what advances it. It completes once, so nothing pays twice. Saved as the profile's `quest` slice.
- The player sees **one objective line** (top left, with an `n / goal` counter) and the **journal** on `J` (steps done, the current one, the memory fragments found). `initGameplay` shows the conversion quest's line first, then the restoration line.
- Story beats are lines per beat id (`src/story/story.ts`); memory fragments and captions are in `src/story/fragments.ts`; `StoryLog` queues them.
- Besides quests there are two other kinds of goal: **gates** (rules that hold a door shut) and **milestones** (latched achievements that open skills and verbs: `src/skills/milestones.ts`). A proposed quest below usually *teaches* a mechanic and is *completed by* a milestone, so the two stay one system.
- New in this design: a quest can be checked against a milestone (it is done when the milestone is reached), which needs no new rule code.

## The arc

| Phase | Name | Goal | Built as |
|---|---|---|---|
| 0 | God Particle | Fill the energy bar and wake all five landmarks | gate + guide line |
| 1 | Whisper | Win five believers, the temple fire, the offering, the elder | **conversion quest** |
| 2 | Spirit | Grow the village, restore the five places | restoration objectives + milestones |
| 3 | Deity | Repel Verath's first incursion (50 followers) | not built |
| 4 | Regional God | Claim three settlements | not built |
| 5 | Ancient God | Final confrontation | not built |

Sparks (skill points) are paid by the quest steps and by converts; see `PHASE0.QUEST` in `src/config/phase0.ts`.

## Built

### Phase 0 — the awakening (gate, no quest definition)
- **Objective today:** none written; the guide line and the beacons lead the way. The sunrise needs the bar at the cap **and** every landmark awake (`isPhase0Complete`).
- Each landmark woken (stand within 8 m for 4 s, any order) pays 14 energy and tells the next of five chapters, then a caption. With the bar full and landmarks left, fragment 17 ("something is unfinished") shows once.
- **Decided:** it stays without an objective line or journal rows (see Decisions).

### Conversion quest (`CONVERSION_QUEST`, id `conversion`)
| # | Step id | Objective line | Done when | Reward |
|---|---|---|---|---|
| 1 | `meet` (hidden) | — | the orb comes within 6 m of the praying elder and he looks at it for 10 s | 1 spark, beat `elder-meets` |
| 2 | `convert` | Help the village believe. (n / 5) | five villagers believe (Murmur, Dream, Sign) | beat `convert-done` (plus a spark per convert past five) |
| 3 | `fire` | Light the temple fire at dusk with a Sign. | a Sign cast near the temple around sunset | 1 spark, beat `fire-lit` |
| 4 | `offering` | Make an offering at the temple. (n / 40) | stand at the temple with 50+ energy while it flows | 1 spark, beat `offering-made` |
| 5 | `believe` | Win the elder's heart. | the elder believes (only possible now) | beat `village-converted`, the village converts, 3 sparks |

Ends the phase: growth opens, faith flows, phase 2 starts.

### Restoration objectives (per place, `restorationGoals`)
Shown only after the village converts, for each **awake** place:
1. *"Gather 40 wood to restore X"* then *"Stand at X to restore it"* (journal: "X weighs on the village (hurdle); …").
2. *"The builders are restoring X  n%"* while a crew works.
3. Journal line *"Restored: X. (boon)"*, and the place's closing caption.
Five places, any order. Restoring all five is the end of Spirit (the Deity phase is not built).

### Gates and milestones (not quests, but they steer play)
Skill nodes gated by a milestone: *Great halls* (twenty villagers), *Vaults* (the first restored place). Verbs opened by one: plots (ten finished buildings), outposts (the first restored place), Hearten (five prayers answered). Milestones raise a toast when reached. List: `src/skills/milestones.ts`.

## Proposed

The new mechanics (upgrades, plots, prayers, Hearten, outposts) currently have no introduction: a player finds them by accident. These short quests teach each one and pay a spark or a beat. All are optional extras on the objective line, shown one at a time after the village converts, and each completes through an existing milestone or event.

| Quest | Teaches | Objective line | Done when |
|---|---|---|---|
| **First Roof** | plots | Mark a plot for a new house. | the player's first plot is placed (event) |
| **A Prayer Heard** | prayers | Answer a villager's prayer. | the first prayer is answered |
| **The Touch** | Hearten | Hearten a villager who has lost their way. | the first Hearten on a lapsed or praying villager |
| **Beyond the Fence** | outposts | Mark a lumber camp or fishing hut. | the first outpost is finished (`village:outpost` done) |
| **Raised** | upgrades | Raise a building to level 2. | milestone `level_2` |
| **Hard Winter** | food and hunger | Keep the village fed through a famine, or recover from one. | hunger stage returns to fed after "weak" |
| **The First Place** | restoration | Restore your first place of power. | milestone `first_place` |
| **Many Hands** | growth | Twenty souls dwell here. | milestone `folk_20` |

Notes: the mechanics-teaching ones pay a spark or a short beat and never block; the milestone ones double as the journal's "what next". Rewards and text are yours to write.

### A longer village line (story, not mechanics)
Ideas for what the elder and the five places could ask of you once the village stands, in the order the chapters suggest:
1. **Caros's request** (the elder): one small favour from each of the five places' chapters, e.g. the winter of thinning prayers (answer three prayers for food), the smooth stone of Merra (a Sign at dusk at the monolith), the shepherd girl saying the name nearly right (Hearten Aera). Each unlocks the place's caption or a memory fragment.
2. **The name returns:** when all five are restored, a closing quest ends Spirit: the elder asks the whole village to say the name; the player must have believers at the temple at dawn. Pays the Deity phase's first spark and leaves the door open to Verath.
3. **Verath's first incursion** (Deity, not built): a rival offers something more useful; the player must defend belief, not buildings (prayers answered as the weapon). Out of scope for now (`BACKLOG.md`).

## Decisions
- **Phase 0 has no visible quest line.** The guide line, the beacons and the chapters carry it. Phase 0 above is settled: no objective line, no journal rows for it.
- **Teaching quests stay as proposed.** They are fun and optional.
- **Several quests at once.** The runtime holds a list of quests, not one.
- **Teaching quests are rewarded** (sparks or a beat each).
- **The end of Spirit:** all five places restored, then a final act (the name returns, see above).

## Open
- **Journal or no journal.** Leaning towards the Black & White way (no objective line, no quest list), but the game now has many systems and may get too complicated without something to read. Middle paths to try, cheapest first:
  1. Keep the journal on `J` but make it a *memory book* (story fragments, places restored, milestones reached), with no "do this next" list in it.
  2. Guidance in the world instead of on screen: the elder and villagers speak, a praying villager is the call to action, markers over what needs you, milestone toasts. The teaching quests become things the elder *says*.
  3. Hints that appear once, only the first time a mechanic becomes possible (a milestone just opened it), then never again.
  4. A "what now?" button the player may press, never shown by default.
  Whichever is chosen decides how the teaching quests are shown (a line, a spoken request, or a one-time hint); their rules and rewards do not change.
- Caros's favours: which belong to which place; who else speaks (Merra, Aera). Not decided.
- The final act: what the player has to do (believers at the temple at dawn is a first idea), and whether Verath is foreshadowed there.

## Build notes (mine, once you decide)
- A teaching quest is a `QuestDef` like the conversion one: steps with `advance` rules and a reward. Events not yet fed to the quest runtime: plot placed, prayer answered, Hearten used, outpost done, level reached (all already on the bus: `village:prayer`, `village:heartened`, `village:outpost`, `village:upgraded`; plots need a `village:plotPlaced` event). Milestone-based ones read `skills.hasMilestone`.
- Several quests at once (decided) needs `questRuntime.ts` to hold a list of quest states (today: one); `parseQuest` and the save slice change with it (save version bump). How they are shown depends on the journal decision above; the sim side does not.
