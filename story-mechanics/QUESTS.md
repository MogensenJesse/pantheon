# Quests (overview)

One page for every quest, built and proposed, so the story, the objectives and the gates read as one line. Status marks: **built** (in the game), **gate** (a rule that stops progress until something is done, shown as an objective), **proposed** (not built; for you to cut, change or approve). Texts quoted here are the placeholder ones in the code.

## How quests work in the game

- A quest is data: a list of steps (`src/quests/quest.ts`, pure). A step has an objective line, an optional counter, a reward (sparks, a story beat) and a rule for what advances it. It completes once, so nothing pays twice. Saved as the profile's `quest` slice.
- The player sees **one objective line** (top left, with an `n / goal` counter) and the **memory book** on `J` (the rune, the memory fragments found, the places woken and the milestones reached; no to-do list). `initGameplay` shows the conversion quest's line first, then the restoration line.
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
1. *"Gather 40 wood to restore X"* then *"Stand at X to restore it"* (the memory book notes each awake place's weight and, once restored, its gift).
2. *"The builders are restoring X  n%"* while a crew works.
3. Journal line *"Restored: X. (boon)"*, and the place's closing caption.
Five places, any order. Restoring all five is the end of Spirit (the Deity phase is not built).

### Gates and milestones (not quests, but they steer play)
Skill nodes gated by a milestone: *Great halls* (twenty villagers), *Vaults* (the first restored place). Verbs opened by one: plots (ten finished buildings), outposts (the first restored place), Hearten (five prayers answered). Milestones raise a toast when reached. List: `src/skills/milestones.ts`.

## Proposed

The new mechanics (upgrades, plots, prayers, Hearten, outposts) currently have no introduction: a player finds them by accident. These short quests teach each one and pay a spark or a beat. All are optional, start after the village converts, show no objective line (the elder asks), and each completes through an existing milestone or event.

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

Notes: they pay a spark or a short beat and never block. Text is yours to write.

### The longer village line (decided, see Decisions)
1. **Caros's five favours:** one small favour from each place's chapter, asked by the elder once that place is awake (data: `src/quests/favourQuests.ts`).
2. **The Name Returns:** when all five are restored, the final act (below).
3. **Verath's first incursion** (Deity, not built): a rival offers something more useful; the player defends belief, not buildings. Out of scope for now (`BACKLOG.md`).

## Who speaks

| Voice | Role | Appears as |
|---|---|---|
| **Caros**, the elder | The village's voice: asks the favours, introduces the teaching quests, calls the finale | A story-log card with his name |
| **Aera**, the shepherd girl | A fixed, protected villager (never a famine victim). Speaks rarely: a line when first heartened; silently traces the rune before the finale | Same card with her name; named in the overview |
| **The old god** (narrator) | Memories, chapters, captions | The existing unnamed, italic lines |
| **Merra, Verath** | Only in the memories. Verath is foreshadowed by one closing line (a trader seen on the road) | No living speaker |
| Other villagers | No speech. A prayer is a star over the villager and a toast | — |

## The final act: The Name Returns
No chanting, no choir, no spoken name. The name comes back as **your rune**: a sigil of five strokes, one per place of power.
1. **The call.** The fifth place is restored. Caros: tonight we gather at the temple. Aera is found tracing a shape in the dust there.
2. **The gathering.** At the next dusk every awake believer goes to the temple. It completes when the orb stands at the temple with enough energy while the offering flows and at least 60 % of the village believes and stands there. Lapsed or starved villagers do not count. If the player is away the village waits for the next dusk. No fail state.
3. **The cutscene** (skippable, about 25 s). The view glides place by place; at each a beam shoots into the sky (the look of the temple's crown beam and the guide lines) and one stroke of the rune lights above the temple. Then all five beams meet over the gathering.
4. **The reveal.** The rune holds, then settles as a faint permanent mark above the temple. Caros says one line. Rewards: the Deity gate opens (`phase` 3), 4 sparks, milestone `name_returned`, a last memory fragment. The rune is the cover of the memory book (outline from the start, a stroke filling per restored place).

The rune's shape and the cutscene's look are art decisions (placeholder: five plain strokes).

## Decisions
- **Phase 0 has no visible quest line.** The guide line, the beacons and the chapters carry it.
- **Teaching quests stay as proposed**, optional, rewarded (a spark or a beat each), and several can run at once.
- **The objective line stays** for the conversion quest and the restoration goals. Teaching quests, favours and the finale never show a line: the elder asks, the world answers.
- **The journal is a memory book** (fragments, places with their captions, milestones, the rune cover), with no to-do list, no one-time hints and no "what now?" button.
- **Caros's favours:** runestones: answer three prayers; tree: answer a prayer for rain through a dry spell; temple_ruin: raise a house to level 2; sunken_ruin: build a fishing hut; monolith: Hearten Aera. Each pays a spark and a memory fragment.
- **Aera is a protected villager.** **The end of Spirit** is all five restored plus the final act above.

## Open
- Where Merra's smooth stone and Verath's offer fit.
- The words (favour requests, Caros's and Aera's lines, the final fragment), the rune's design and the cutscene's look. Placeholders ship.

## Build notes
- Quests are data (`QuestDef`) with a `kind` (`main`, `teaching`, `favour`, `finale`) and a start condition. The runtime holds a list; the save slice `quests` is a list of `{ id, ...state }` (save version 17).
- Events fed to quests: `plotPlaced`, `prayer`, `heartened`, `outpostDone`, `upgraded`, `milestone`, `restored`, `awakened`, `hunger`, `dawn` (bus: `village:plotPlaced`, `village:prayer`, `village:heartened`, `village:outpost`, `village:upgraded`, `milestone:reached`, `village:hunger`, `landmark:awakened`, `landmark:restored`).
- The plan and its steps (Q0 to Q6) are in the session plan; each step is its own commit.
