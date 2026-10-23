# Quests (design)

One page for every quest, so the story, the objectives and the gates read as one line. This is the design: what each quest is for and what the player sees. How it is built (the engine, events, files, checks) is in [docs/village/quests.md](../docs/village/quests.md). Texts quoted here are the placeholder ones in the code.

## How quests feel

- A quest is a short list of steps. A step is done once, and nothing pays twice.
- The player sees **one objective line** (top left, with an `n / goal` counter) for the conversion quest and then for the restoration of the places, and the **memory book** on `J` (the rune, the memory fragments found, the places woken and the milestones reached; no to-do list, no one-time hints, no "what now?" button).
- Every other quest is asked by Caros, the elder, in a story-log card, and answered by the world: **no objective line**. They never block anything.
- Besides quests there are two other kinds of goal: **gates** (rules that hold a door shut) and **milestones** (latched achievements that open skills and verbs: `src/skills/milestones.ts`). A teaching quest *teaches* a mechanic and is usually *completed by* a milestone or an event, so the two stay one system.

## The arc

| Phase | Name | Goal | Built as |
|---|---|---|---|
| 0 | God Particle | Fill the energy bar and wake all five landmarks | gate + guide line |
| 1 | Whisper | Win five believers, the temple fire, the offering, the elder | the conversion quest |
| 2 | Spirit | Grow the village, restore the five places | restoration objectives, teaching quests, favours, milestones, then the final act |
| 3 | Deity | Repel Verath's first incursion (50 followers) | not built; drafted in [VERATH_ACT.md](VERATH_ACT.md) |
| 4 | Regional God | Claim three settlements | not built |
| 5 | Ancient God | Final confrontation | not built |

Sparks (skill points) are paid by the quest steps and by converts; the numbers are `PHASE0.QUEST` in `src/config/phase0.ts`.

## Phase 0 — the awakening (a gate, no quest)
- **Objective today:** none written; the guide line and the beacons lead the way. The sunrise needs the bar at the cap **and** every landmark awake.
- Each landmark woken (stand within 8 m for 4 s, any order) pays 14 energy and tells the next of five chapters, then a caption. With the bar full and landmarks left, fragment 17 ("something is unfinished") shows once.
- **Decided:** it stays without an objective line or memory-book rows.

## The conversion quest (id `conversion`)
| # | Step id | Objective line | Done when | Reward |
|---|---|---|---|---|
| 1 | `meet` (hidden) | — | the orb comes within 6 m of the praying elder and he looks at it for 10 s | 1 spark, beat `elder-meets` |
| 2 | `convert` | Impress five villagers. (n / 5) | five villagers believe, won by the hand's deeds (`HAND.md`; Murmur, Dream and Sign still count until they are removed) | beat `convert-done` (plus a spark per convert past five) |
| 3 | `fire` | Bring wood to the temple at dusk. | wood from the hand put down at the temple around sunset (a Sign cast there still counts until Sign is removed) | 1 spark, beat `fire-lit` |
| 4 | `offering` | Make an offering at the temple. (n / 40) | stand at the temple with 50+ energy while it flows | 1 spark, beat `offering-made` |
| 5 | `believe` | Win the elder's heart. | the elder believes (only possible now) | beat `village-converted`, the village converts, 3 sparks |

Ends the phase: growth opens, faith flows, phase 2 starts.

## Restoration objectives (per place)
Shown only after the village converts, for each **awake** place:
1. *"Gather 40 wood to restore X"*, then *"Stand at X to restore it"*.
2. *"The builders are restoring X  n%"* while a crew works.
3. The memory book notes each awake place's weight and, once restored, its gift, and the place tells its closing caption.
Five places, any order. Restoring all five calls the final act.

## Gates and milestones (not quests, but they steer play)
Skill nodes gated by a milestone: *Great halls* (twenty villagers), *Vaults* (the first restored place). Verbs opened by one: plots (ten finished buildings), outposts (the first restored place), Hearten (five prayers answered). Milestones raise a toast when reached. List: `src/skills/milestones.ts`.

## Teaching quests
The mechanics of the village (upgrades, plots, prayers, Hearten, outposts) would otherwise be found by accident. These short quests teach each one and pay a spark and a closing line. All are optional, begin after the village converts, show no objective line (the elder asks) and complete through an existing event or milestone. Several can be open, never more than three at once; they are offered one at a time.

| Quest | Teaches | The elder asks | Done when |
|---|---|---|---|
| **First Roof** | plots | Mark a plot for a new house. | the player's first plot is placed |
| **A Prayer Heard** | prayers | Answer a villager's prayer. | the first prayer is answered |
| **The Touch** | Hearten | Hearten a villager who has lost their way. | Hearten brings back a lapsed believer or answers a prayer |
| **Raised** | upgrades | Raise a building to level 2. | milestone `level_2` |
| **The First Place** | restoration | Restore your first place of power. | milestone `first_place` |
| **Beyond the Fence** | outposts | Mark a lumber camp or a fishing hut. | the first outpost is finished |
| **A Hard Winter** | food and hunger | Feed the village again. | hunger recovers after a famine |
| **Many Hands** | growth | Twenty souls dwell here. | milestone `folk_20` |

## Caros's favours
One small favour for each place, asked by the elder once that place is awake (and the village converted). Each pays a spark and tells a memory fragment (18 to 22). No objective line.

| Place | Favour |
|---|---|
| runestones | Answer three prayers. |
| tree | Answer a prayer for rain. |
| temple_ruin | Raise a house to level 2. |
| sunken_ruin | Build a fishing hut. |
| monolith | Hearten Aera. |

## Who speaks

| Voice | Role | Appears as |
|---|---|---|
| **Caros**, the elder | The village's voice: asks the favours, introduces the teaching quests, calls the finale | A story-log card with his name |
| **Aera**, the shepherd girl | A fixed, protected villager (never a famine victim), who keeps to the plaza as an idler. Speaks rarely: she answers when first heartened (the monolith favour); silently traces the rune before the finale (not built) | The same card with her name; named in the overview |
| **The old god** (narrator) | Memories, chapters, captions | The existing unnamed, italic lines |
| **Merra, Verath** | Only in the memories. Verath is foreshadowed by one closing line (a trader seen on the road) | No living speaker |
| Other villagers | No speech. A prayer is a star over the villager and a toast | — |

## The final act: The Name Returns
No chanting, no choir, no spoken name. The name comes back as **your rune**: a sigil of five strokes, one per place of power.
1. **The call.** The fifth place is restored. Caros: tonight we gather at the temple. Aera is found tracing a shape in the dust there (not built).
2. **The gathering.** At the next dusk every believer goes to the temple. It completes when the orb stands at the temple with enough energy and at least 60 % of the village believes and stands there. Lapsed or starved villagers do not count. If the player is away the village waits for the next dusk. No fail state. The village stays at the temple through the cutscene.
3. **The cutscene** (skippable with Space or Enter, about 33 s). The view glides place by place; at each a beam shoots into the sky (the look of the temple's crown beam and the guide lines). Then the view returns to the temple and looks up, and the strokes of the rune light in the sky one after another, one for each place.
4. **The reveal.** The rune glows whole and holds, then settles as a faint permanent mark above the temple (with the beams, fainter). Rewards: the Deity gate opens (`phase` 3), 4 sparks, milestone `name_returned`, a last memory fragment. The rune is the cover of the memory book (outline from the start, a stroke filling per restored place).

The rune's shape and the cutscene's look are art decisions (placeholder: five plain strokes).

## Decisions
- **Phase 0 has no visible quest line.** The guide line, the beacons and the chapters carry it.
- **Teaching quests** are optional and rewarded, and several can run at once.
- **The objective line stays** for the conversion quest and the restoration goals. Teaching quests, favours and the finale never show a line: the elder asks, the world answers.
- **The journal is a memory book.**
- **Aera is a protected villager** and stays an idler. **The end of Spirit** is all five restored plus the final act above.
- **Verath's first incursion** (Deity, not built): a rival offers something more useful; the player defends belief, not buildings. Drafted as the island's last act in [VERATH_ACT.md](VERATH_ACT.md); not built.

## Open
- Where Merra's smooth stone and Verath's offer fit (the offer is drafted in `VERATH_ACT.md`; the stone is left out for now).
- The words (favour requests, Caros's and Aera's lines, the final fragment), the rune's design and the cutscene's look. Placeholders ship.
