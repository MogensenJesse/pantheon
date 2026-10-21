# Maps

## Today

- **Authoring:** Map editor (`editor.html`, DEV only) sculpts height/biomes and places entities; saves JSON to `public/maps/{id}.json`. New maps start flat (zero height, uniform Shore) until sculpted. Paint mode includes **Path** and **Meadow** overlay biomes (textures under `public/textures/terrain/path/` and `meadow/`); play mode terrain splat respects painted cells. Trees, rocks, and plants are placed as map entities only (no procedural scatter).
- **Orbs:** Residue orbs in `entities` (type `orb`) are collected in **array order**. The play-mode guide ribbon follows painted **Path** cells to the next unabsorbed orb in that sequence.
- **Biomes:** Water (0), Shore (1), Forest (2), Hills (3), Mountain (4), Path (5), Meadow (6). Forest/Hills/Shore/Mountain use the four-channel splat; Path and Meadow use separate overlay masks.
- **Grass density:** Optional per-map overrides in JSON:

```json
"grass": {
  "enabled": true,
  "density": {
    "meadow": 1.0,
    "forest": 0.3,
    "hills": 0.5,
    "shore": 0.1,
    "mountain": 0.0,
    "path": 0.1
  }
}
```

Defaults match `src/config/visualTuning.ts` (`grass.biomeDensity`). Values are multipliers (0–2) baked into the grass mask texture.

- **Village seed:** an optional `villageSeed` entity (editor palette: Markers → Village seed; one per map) marks the temple site of the village: `{ "type": "villageSeed", "x", "z", "rotY"?, "seed"?, "radiusM"? }`. `rotY` turns the temple (its door faces local +Z); `seed` seeds the village RNG; `radiusM` (40–400, default 160) bounds growth. Pick fairly flat ground and rotate the temple so its long axis follows the contour lines. In the game the village is founded as a finished hamlet that grows only after the player converts it (a DEV `?sandbox` visit keeps the older village that grows by itself from founding). Buildings settle loosely on concentric rings around the temple (doors toward it) with paths laid between them, so choose a seed with a broad stretch of walkable, not-too-steep ground (about 100 m of it) around the temple; fields and the outer rings use whatever land is there. The temple's level pad is cut into the terrain, so the seed's ground does not need to be perfectly flat.
- **Shrine:** an optional `shrine` entity (editor palette: Markers → Shrine; several per map, move-only) marks a zone where energy regenerates once Attunement is taken: `{ "type": "shrine", "x", "z", "radiusM"?, "regenPerSec"? }`. `radiusM` (3–80 m, default `PHASE0.SHRINE.RADIUS_M` = 12) is the zone radius; `regenPerSec` (0–5, default `PHASE0.SHRINE.REGEN_PER_SEC` = 0.5) is the energy gained per second inside it. The editor draws the zone as a ring on the terrain around a small standing stone; radius and regen are edited in the JSON for now.
- **Catalog:** `public/maps/manifest.json` lists playable map ids.
- **Play:** A production build always loads `DEFAULT_PLAY_MAP_ID` (island-mountain) unless `?map=` or a session selection names another. Only a DEV build shows the startup chooser of manifest maps; the chosen id is stored in `sessionStorage`. The game loads that file only — no runtime procedural island.
- **Requirements:** Maps must include a `playerStart` entity (`validatePlayMapForPlay`). A village needs a `villageSeed` (or the DEV `?villageSeed=x,z[,rotY]` fallback); orbs, shrines and trees are optional entities.

## Future (not implemented)

- **World scale:** Expand from discrete JSON maps to a **planet / region graph** — multiple authored regions, travel between them, and possibly streaming or handoff at borders. The manifest chooser is a stepping stone; region selection and in-world travel would replace or augment the simple list UI.
