# Wood and food (M4)

Pure sim in `src/world/village/sim/economy.ts`. Numbers live in `VILLAGE.ECONOMY` (`src/config/village/economy.ts`); this page names the keys instead of copying values.

## Files
- `economy.ts`: `Stock { wood, food }`, `createEconomy` (add up to the cap, `spendWood`, `canFeed`, `update(buildings)` refreshes the caps, `eat(round)` takes one portion at a meal), `capsOf` (`ECONOMY.BASE_CAP` of each, plus `GRANARY_FOOD_CAP` per finished granary and `WORKSHOP_WOOD_CAP` per finished workshop), `woodCostOf`, `housingOf` / `freeBedShare` / `pressureAllowsSite` / `maxOpenSites`, `shortages`, `stockProblem`.
- Shown in the faint village line (`ui/village/VillageHud.ts`, amber when short), the overview chip and the temple, granary and workshop panels (`overview/overviewDescribe.ts`).

## Rules
- **Start stock and eating**: `ECONOMY.START`; each person eats `FOOD_PER_PERSON_DAY` a game day, as two meals (`VILLAGERS.MEAL.DAY_SHARE` each), at the table (see [routine](routine.md); nothing is eaten between meals). `DAY_S` comes from `config/clock.ts` (`GAME_DAY_S`), the same day length as the sky.
- **Income**: a harvested field gives `FIELD_YIELD` (`+ modifiers.fieldYieldAdd`), a fisherman at the shore `FISH_PER_SEC`, wood comes from felled trees only (see [forest](forest.md)), there is no flat rate. Wood costs per building type are `ECONOMY.WOOD_COST`.
- **Production is continuous**: `agents.act()` calls `onProduce(role, amount)` every step a fisherman stands at their spot (no per-villager accumulator, nothing extra to save); woodcutters chop through `onChop` instead; the field harvest in `villageSim.update` adds food.
- **Growth gates** (`villageSim.startSite`, not for DEV `startSiteNow`): faith, **and** enough wood for the building the planner picked, **and** housing pressure: free beds (counting beds in sites under construction) below `PRESSURE_SHARE` of all beds; at most `maxOpenSites` sites open at once (`PRESSED_MAX_SITES` when the free share is below `PRESSED_SHARE`).
- Newcomers need a day of food in store for everyone including themselves (`canFeed(pop + 1)`).
- With the larder empty hunger sets in (see [hunger](hunger.md)); `economy.hungry` means **somebody went hungry at the latest meal round**, or the larder was emptied, not "the stock is zero".

## Events and save
- `VillageStats` has `wood`, `food`, `woodCap`, `foodCap`, `foodPerDay`.
- The stock is `VillageSimState.economy` (`EconomyState`, with `round`/`missed` for the meal rounds), checked by `villageStateProblem`.

## DEV
`__pantheonVillage.economy()`, `addWood(n)`, `addFood(n)` and buttons in the dev panel.

## Check
`npm run check:village-economy` (`scripts/checks/village/economy-check.ts`, about 6 s). Headless layout runs (`check:village-smoke`) call `simulate` with `fed: true`, which keeps both stores full so a village grows to its full size on any terrain.
