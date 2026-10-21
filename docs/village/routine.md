# Daily routine

Pure sim in `src/world/village/sim/routine.ts`; numbers in `VILLAGE.VILLAGERS` (`SCHEDULE`, `MEAL`, `MOURN_S`, `PLAZA_RADIUS_M`, `SHELTER`; `src/config/village/life.ts`).

## The timetable
`scheduledActivity(who, dayPhase, vigil, world)` is the whole timetable, on each villager's own clock (`ownPhase`: the day phase plus their `offset`). Activities (`Activity`): `Sleep`, `Pray`, `Work`, `Wander`, `Eat`, `Shelter` (at home and awake) and `Mourn` (a priest at the graves).

The day (`SCHEDULE`): wake at `WAKE`, dawn prayer for the pious (the rest wander) until `WORK_START`, work to `WORK_END`, the midday meal in `MIDDAY_MEAL`, dusk to `DUSK_END` with the evening meal in `EVENING_MEAL`, then bed. Vigil mode (Phase 0 night) is unchanged. Farmers and builders work from dawn to the work end with the midday break; fishermen fish all day.

## Meals
- A meal is due while the villager's clock is in its window and the matching `Done` bit (`Villagers.done`: `MiddayMeal`, `EveningMeal`, `Mourned`) is clear; the bit is set when they sit down and forgotten again once the window is over (`clearedDone`). A meal, once begun, is seen through (`think` does not interrupt `Eat` or `Mourn`).
- **Where a meal is eaten** (`agents.begin`/`arrive`/`finishPath`): at home (walk to the door, go indoors, `EAT_S`, come out, back to what the clock says). **A villager more than `MEAL.HOME_MAX_M` from their door eats a packed meal where they stand** (a trip from a far field would have halved the village's output; measured). A villager without a home building eats on the plaza (`strollSpot` around the temple: walkable ground within `PLAZA_RADIUS_M`).
- **The food leaves the larder at the table**: `agents` calls `onEat(villager, round)`, `villageSim` calls `economy.eat(round)` (round 1 midday, 2 evening, `mealRoundAt`); nothing is eaten continuously. A short meal marks its round hungry (`economy.hungry`, saved as `EconomyState.round`/`missed`); the first meal of the next round starts clean; `drainFood` (DEV `starve`) is hunger at once. `VillageStats.mealsServed`/`mealsMissed` count meals (not saved).

## Rain
`VillageSimInputs.rain01` (from the weather: see [weather](weather.md); DEV `__pantheonVillage.setRain(r)`): at `SHELTER.RAIN_ON` everyone but the priests goes home (`Shelter`) and stays until it drops below `RAIN_OFF`. The memory is the villager's own activity, so nothing extra is saved. `rain01` also feeds the forest's regrowth boost and the fields' growth.

## Mourning and idlers
- With at least one grave and a plot, priests at dusk walk to the graveyard plot (`mournSpot`), stand `MOURN_S` in the pray pose, then go home (`Shelter`); with no grave they pray as before.
- **Idlers** stroll only on the plaza by day (`startPlaza`) and are home at dusk unless pious enough to pray.
- `overview/overviewDescribe.activityText` says "Eating", "At home", "Mourning".

## Check
`npm run check:village-routine` (`scripts/checks/village/routine-check.ts`: the pure timetable, a day of two meals each with the food leaving at the table, an empty or short larder, a villager without a home, a packed meal, rain with its hysteresis, mourning, idlers on the plaza, determinism and a save mid-meal); `check:save-village` adds a scenario with rain, a burial and mourning across three save points; `check:village-smoke` prints the day by hour (share of people per activity) and fails when nobody goes to a meal, nobody works in the morning or the village is awake at night.
