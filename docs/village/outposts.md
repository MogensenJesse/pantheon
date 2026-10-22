# Outposts

Design: `story-mechanics/VILLAGE_INTERACTION.md`. Numbers: `VILLAGE.OUTPOSTS` (`src/config/village/outposts.ts`, placeholders). Pure rules in `world/village/sim/outposts.ts`; the sim side in `villageSim.ts` (`startOutpost`, `outpostCheck`).

The passive half of "Mark a place": beyond the village a crew builds a camp that then keeps the village supplied. The player chooses where; the village does the labour and the camp needs no tending.

## It is a remote site
An outpost reuses the remote-site framework ([remote-sites](remote-sites.md)): a `RemoteSite` with kind `outpost:lumber` or `outpost:fishing`, a coarse route, a crew of builders that walks out, camps and works two stages (`OUTPOSTS.SITE_WORK_S`), then walks home. Unlike a place of power there can be several (`OUTPOSTS.MAX`), and nothing in the landmark state refers to them: the bus tells them apart (`village:outpost`, not `village:remoteStarted`/`remoteDone`).

## Where
`outpostPlaceProblem` (cheap, no route search; it is what the overview's ring shows): `inside` the village (`MIN_OUTSIDE_M` beyond the grid; use a plot instead), `near` another outpost (`MIN_APART_M`), and no `resource`: dry ground, and for a **lumber camp** at least `MIN_TREES` standing trees within `RESOURCE_RADIUS_M`; for a **fishing hut** water within that radius. `startOutpost` then needs the route (`no-route`), free builders (`no-crew`), the `limit`, `OUTPOSTS.WOOD` wood and `OUTPOSTS.FAITH` faith.

## What it gives
While a site's stage is 2, every update adds `WOOD_PER_SEC` wood (lumber) or `FOOD_PER_SEC` food (fishing, times the fishing modifier) to the stores; the stores' capacity is the cap. Nothing else is saved: the site list is the state (no save-version change).

## Tool and view
Overview: the "Mark a place" row (P) gains **Lumber camp** and **Fishing hut** once the first place of power is restored (`first_place`); plots open with `homes_10` ([plots](plots.md)). A green ring means the place is acceptable; the click checks the route and the crew and says why not. Props: the crew's camp while it is built, a hut and a ring of stones when done (`landmarks/outpostProps.ts`, placeholders from the existing set).

## Check
`npm run check:village-outposts`: the rules, asking changes nothing, payment and refusals, the limit, the two stages and the delivered rate, the food cap, a save mid-build.
