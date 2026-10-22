# Player plots

Design: `story-mechanics/VILLAGE_INTERACTION.md`. Rules in `world/village/sim/planner.ts` (`validatePlot`, `plotFacing`); the sim side in `villageSim.ts` (`plotCheck`, `placePlot`); the tool in `ui/overview/overviewPlots.ts`.

In the village overview the player marks a spot for a house, workshop or granary. The village does the rest: a site starts there and the builders come to it. The planner keeps choosing its own sites; a plot is one more open site.

## Rules
`validatePlot(ctx, type, x, z, rotY)` takes the planner's own checks and **draws no random number** (the plan RNG is shared, so asking must never move it): inside the village radius, clear of the main roads and the temple, a free footprint, reachable on the walk grid, relief within the relaxed limit, a walkable surface. Refusals: `outside`, `road`, `blocked`, `unreachable`, `steep`, `far`.

`sim.plotCheck(type, x, z, rotY)` adds the order: type (`PLOT_TYPES`: the houses, workshop, granary), village converted, building limit (`full`), open-site cap (`cap`, `PLAN.MAX_ACTIVE_SITES`, shared with the planner), the geometry, then wood and faith. `'ok'` or the first reason. Nothing is spent.

`sim.placePlot(...)` pays wood (`woodCostOf`) and faith (`siteCost`), calls the same `place(...)` seam as the planner (stage 0, level 1) and sends `siteStarted`. No saved shape changes, so no save bump: a plot is an ordinary building.

## The tool
Opens with the `homes_10` milestone (ten finished buildings). `P` arms it (House), the row at the lower left picks another type, `R` turns the door by a quarter, a click marks, Esc puts it away (it is an additive overview escape guard: `overview.addEscapeGuard`). A ring follows the orb, green where the builders would take the plot and red where not, with a small dot at the door. A refused click says why in a toast and stays armed. Leaving the overview puts the tool away.

## Check
`npm run check:village-plots` (`scripts/checks/village/plots-check.ts`): refusals, rules over a sweep, asking changes nothing, a plot starts where pointed and costs a site, wood and faith refusals and the cap, builders finish it, a save mid-plot.
