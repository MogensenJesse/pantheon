# The Useful Thing: Verath's offer (design draft)

Status: draft, nothing built. The design owner likes the incursion. **Left out for now, by decision:** a climactic Fair night and Merra's smooth stone. Everything here is proposed unless it says it comes from the existing docs. Every number is a placeholder. It is the last act of the starting island and the story that completes it (`WORLD_MAP.md`). The quest engine and the systems it leans on are in `docs/village/quests.md`, `prayers.md` and `hearten.md`.

## Where it sits

The finale already ends on the arrival: the closing beat `finale-done` (`src/story/story.ts`) has Caros say "A trader passed on the road this morning, asking after the temple. He knew the name of every god but yours." The phase table names the next goal: **3 Deity: repel Verath's first incursion (50 followers)**. So the act comes **after** the finale. The name returns, the gate opens, and what walks through it is Verath's trader. When the act ends the island is complete and the world map opens.

I first suggested an act before the finale. This is better: the line is already written, the phase table already has the goal, and the finale keeps its one job (the name comes back) without a second plot on top.

The player already knows whose envoy this is. Fragment 7, told in phase 0, names Verath. The villagers do not. That gap does the work: they like the trader, and the player knows.

## The idea

A mirror of the old god's story. Fragment 5 is the winter of thinning prayers; fragment 7 is Verath, who "didn't destroy you. He simply offered something more useful, and the world is always grateful for the useful thing." The player now stands on the other side of it: the villagers' needs get answered, but by someone else.

The trader is not a villain and he never lies. What he gives is real. What he takes is the thing the player lives on: that a prayer goes to a name. The finale gave the village the name back; this act asks whether they keep it when someone brings them bread without asking for it. This follows the standing decision that the player **defends belief, not buildings**: no raids, no new building types, nothing picked up or thrown.

## Cast

- **The trader**, Verath's envoy. A new speaker (`SPEAKER_NAMES`). Polite, sparing with words, truthful. Verath himself does not appear on the island (open).
- **Caros**: wary but fair. "He has done nothing wrong. That is what troubles me."
- **Aera** (optional beat): the trader asks her which god the temple is for. She says the name, nearly right (fragment 14), and he writes it down.

## The mechanics (existing verbs only)

1. **The road.** The morning after the finale the trader sets up at the end of the road, outside the village grid, with a cart and a blanket as props. He is a visitor figure in the view, not a villager, and his position follows the act's state.
2. **The Offer.** While he is here, an open prayer that has gone half its patience (`PATIENCE_DAYS`) unanswered is answered by him. Same rule as prayers: lowest index first, no random draw.
   - *Food*: really answered, a sack reaches the larder.
   - *Rain*: closed with a charm. The sky does not change, so the fields still suffer.
   - *Shelter*: closed with a place at his camp. The villager still has no bed.

   Only food is truly solved. The other two close the prayer and leave the cause, so a village that lets him answer drifts into dry fields and no beds while looking content.
3. **Taken.** A villager whose prayer he answered is **taken**: belief below 1, like a lapsed one. They work normally and cheerfully, but pay no faith, do not pray, and do not count as a believer for the income, the 50 or the gathering. Unlike the lapsed they do not recover on their own while he is here.
4. **Winning back.** The player's tools are the ones that exist: answer prayers first (`prayers_5` is already a milestone), and **Hearten** a taken villager (it costs faith and has a cooldown, which limits how fast the village can be won back).
5. **The leaving.** When the village has held fifty believers for a full day (`HOLD_DAYS`, placeholder 1, so a brief spike does not count), the incursion is repelled. At the next dawn the trader packs and walks to the shore. A sail stands on the horizon. His last line: "My master will want to know your name." The island is complete. Until then he stays and keeps making the Offer. There is no fail state: a village that loses believers just takes longer.

## Quest

Working id `useful`, kind `main` (it shows an objective line, which the island's closing goal deserves; the counter is the 50).

| # | Step | Line shown | Done when | Reward |
|---|---|---|---|---|
| 1 | `road` (hidden) | none | the orb comes within 6 m of the trader and he looks at it for 10 s (like the elder's meeting) | beat `trader-arrives` |
| 2 | `believers` | Keep the village believing. (n / 50) | fifty believers held for `HOLD_DAYS`; the Offer is live from step 1 | beat `trader-gifts` at the first villager taken; a spark |
| 3 | `leaves` (hidden) | none | the trader walks off and the sail shows | sparks, beat `trader-leaves`, fragment 24, milestone `verath_repelled`, `quest:done` |

## Sample lines (placeholder)

- Trader: "I only carry what people need. If you are the one who is needed, say so."
- Caros, after the first villager is taken: "She is fed and she is smiling. Why does the temple feel colder?"
- Caros, when the trader has gone: "He ate at our fire before he left. I will not forget that he was kind, nor that kindness was not what he came for."
- Fragment 24 (told on leaving): "A name is kept where it is paid for. The paying was done in staying."

## What would be built

Checked against the engine docs; not started.

- **Quest**: `content/useful.ts` and a registry entry; `QuestContext` gets `believers` and the state of the Offer; a new `QuestEvent` for the trader's arrival. The runtime already looks at the world every `PHASE0.QUEST.TICK_S` and on the bus.
- **Sim**: a `rival` slice in `VillageSimState` (is he here, who is taken, how long fifty have held), pure rules in `world/village/sim/rival.ts` beside `prayers.ts` and stepped right after them; deterministic; saved (a `SAVE_VERSION` bump, no migration); a `check:village-rival`. The golden hashes stay unchanged because the slice is empty before the act.
- **View**: the trader figure and cart (stand-in models), a toast "Taken by the road", a "Follows the road" row in the villager panel.
- **Story**: the speaker `trader`, the beats above and fragment 24 in `story.ts` and `fragments.ts`.
- **Hand-off**: a completion event for the island, read by the world-map unlock.
- **DEV**: a probe that jumps to the act.

## Open

- **Tone**: a likeable-but-hollow rival, as above (it matches fragment 7, "he didn't destroy you"), or a plain threat. The draft is built so either works; the gifts are real in both.
- **Verath in person**: absent here. He could appear only later, on the world map, as the rival that conquers parts of it.
- **50 followers**: settled for now. The design owner says the map can hold many more villagers than that, so the number stays. (`folk_40` is the highest population milestone today; a higher one may be wanted.)
- **The places**: whether the trader's reach goes further than villagers (does he try to claim a restored place?).
- **Completion**: decided for now. The island is complete when the trader leaves. A measure of control on top of that (all places are already restored by then) can be added later.
- **Pressure**: without a climax the act is a steady push and pull between his Offer and the player's answers. If a playtest finds it flat, a single dramatic night (like the Fair that was cut) is the place to add one.
- **The words**: all placeholders, as everywhere else.
- **Seeds before the finale**: not needed (the player knows the name from phase 0). A hint or two could still be added if the arrival feels abrupt.
- **The morality axis** is not used here.
