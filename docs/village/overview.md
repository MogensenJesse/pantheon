# Village overview

`src/overview/` (controller, maths, pick, describe) and `src/ui/overview/` (screens, powers bar). Numbers: `PHASE0.OVERVIEW` (`src/config/phase0.ts`).

Press `B` within `OVERVIEW.REACH_M` of the temple's footprint, once the village is converted: the camera lifts to a fixed view of the village, the mouse is freed, and the orb becomes the cursor. `B` again, or Esc (when no panel is open), goes back.

## Maths
`overviewMath.ts` (pure, node-runnable): `orbitPose` (camera for a focus, yaw, pitch, distance), `clampFocus` (village radius + margin), `clampDistance`, `panStep` (key pan, faster the further away), `rayGroundHit` (a ray against the heightfield: march and halve), `rayPlaneHit` and `grabShift` (the ground grab), `canEnterOverview` (converted and near the temple). Check: `npm run check:overview`.

## Controller
`overviewController.ts` `createOverview(deps)`: phases `roam → entering → overview → leaving`, one progress value eased with `smoothstep` over `TRANSITION_S`. `update(dt, anchor, roamYaw, roamPitch)` runs once per frame in `gameTick.render` **before the orb is placed** and returns true when it posed the camera (then `cameraRig.update` is skipped). The camera is a blend of the follow camera's pose and the overview pose; the follow camera's lag at the start is carried in and faded out so nothing jumps.

Controls: WASD or arrows pan, wheel zooms, right-drag turns, **left-drag grabs the terrain** (the point pressed stays under the mouse: the ray is cast onto the plane at its height each frame and the focus moves by the difference), no edge scrolling. Left presses under `CLICK_SLOP_PX` are clicks.

## Input ownership
Entering: `document.exitPointerLock()`, `cameraInput.setCaptureEnabled(false)` (a press on the canvas no longer takes the lock), `setLookBlocked(true)`, canvas cursor `none`. The player does not move: `player.update(dt, axes, inputEnabled)` gets false while `capturesMovement()`. Esc is taken in the capture phase (before the hotkey table) and only when no panel is open (`setEscapeGuard` lets the powers bar claim it first); losing the lock does not open the pause menu (`setupSaving`'s `canPause`). The overview is not saved: a load always starts in roam.

## Orb cursor
`player.setVisualOverride(position, scale)` draws the orb (mesh, light, sparkles) somewhere else without touching the logic position, so pickups, regeneration, quests and the sim still see the player where they left them. The cursor is the ground point under the mouse (`rayGroundHit`) plus a float and bob, smoothed (`CURSOR_SMOOTH`), and grows with the camera distance (`CURSOR_SCALE_PER_M`) so it stays visible. Leaving: the target becomes the player and the orb flies back; the override is cleared at the end.

## What follows the view
While the overview is on, `gameTick` centres grass, prop LOD, the sun's shadow cascades, the water reflection quality (pitch from `viewPitch`) and the depth-of-field focus on `overview.focusPoint` instead of the orb (the blur is faded out by `weight()`); the terrain's orb glow follows the drawn orb.

## Hints
A "Press B to survey the village" line near the temple (converted, no panel) and, while active, a controls line in the `hints` slot.

## Clicks and the info panel
- `overviewPick.ts` (pure): `pickTarget` finds what is under the mouse: a villager first (the nearest outdoors one within a few pixels of its projected middle), then a building by the mouse **ray against its box** (`rayBuildingHit`: the footprint turned by `rotY`, the building's height from `VillageAssetMeta`, a small margin, so a roof is hit before the ground behind it), then a field by the ground point. `Selection` is `{kind:'villager', index} | {kind:'building', id} | {kind:'field', id}`.
- `overviewDescribe.ts` (pure): `describe(selection, world)` gives the panel's text as plain data (`Description { title, subtitle, rows, bar, goTo }`: a house lists its residents and beds, a villager their doing, belief and home, a site its stage and progress, a field its growth, the temple the believers), `nameOf` for the tooltip, `bedSummary`, `residentsPerBuilding`; `bedsOf` (`world/village/model/buildings.ts`) is the one place that says how many beds a finished building has. The controller reports a click with `onClick` and the end of each frame with `onFrame`; `focusOn(x, z)` eases the view to a point.
- `ui/overview/overviewUi.ts` `createOverviewUi`: on each overview frame, a ring and a name on the hovered thing, a brighter ring on the selected one, a row of bed dots above each finished home when the camera is close (amber when the village has no free bed), and a chip at the top ("13 souls · 12 beds · no free beds"; the chip is a `role=status` line). All of it is DOM markers from `ui/overlay/worldMarkers.ts` (`createMarkerLayer`; `MarkerSpec.label` makes a text marker).
- A click opens the **non-modal** kit panel `overview-info` (docked right by the `.k-panel[aria-modal='false']` rule in `kit.css`; the world keeps running; `isModalPanelOpen()` is the "a modal owns the keys" test): resident rows are buttons that select that villager, "Go to" calls `focusOn`; the body is rebuilt only when its text changes. Esc closes the panel first and then leaves the overview; `B` still leaves with the panel open; a click on empty ground, or leaving, closes it. Selection is not saved.
- **Powers bar**: see [arch II](arch-ii.md); number keys 1 to 5 work while the info panel is open (only a modal panel blocks them).

## DEV
`window.__pantheonOverview`: `debug()` (phase, progress, yaw, distance, focus, cursor, hover), `setActive(on, force)` (true skips the temple rule), `toggle()`, `focusOn(x, z)`, `selection()`, `hovered()`, `select(kind | null, idOrIndex)`, `screenOf(kind, idOrIndex)` (client px).
