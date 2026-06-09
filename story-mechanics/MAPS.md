# Maps (Phase 0)

## Today

- **Authoring:** Map editor (`editor.html`, DEV only) sculpts height/biomes and places entities; saves JSON to `public/maps/{id}.json`. New maps start flat (zero height, uniform Shore) until sculpted. Paint mode includes **Path** and **Meadow** overlay biomes (textures under `public/textures/terrain/path/` and `meadow/`); play mode terrain splat respects painted cells. Trees, rocks, and plants are placed as map entities only (no procedural scatter).
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

- **Catalog:** `public/maps/manifest.json` lists playable map ids.
- **Play:** On first visit (no `?map=` or session selection), a startup chooser lists manifest maps. After selection, the id is stored in `sessionStorage` and the game loads that file only — no runtime procedural island.
- **Requirements:** Maps must include `playerStart` and at least one gameplay entity type (standing stone, landmark, or orb).

## Future (not implemented)

- **World scale:** Expand from discrete JSON maps to a **planet / region graph** — multiple authored regions, travel between them, and possibly streaming or handoff at borders. The manifest chooser is a stepping stone; region selection and in-world travel would replace or augment the simple list UI.
