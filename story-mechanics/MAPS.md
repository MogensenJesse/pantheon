# Maps (Phase 0)

## Today

- **Authoring:** Map editor (`editor.html`, DEV only) sculpts height/biomes and places entities; saves JSON to `public/maps/{id}.json`. New maps start flat (zero height, uniform Shore) until sculpted. Paint mode includes a **Path** biome (trail textures under `public/textures/terrain/path.*`); play mode and grass scatter respect painted path cells, not a fixed polyline.
- **Catalog:** `public/maps/manifest.json` lists playable map ids.
- **Play:** On first visit (no `?map=` or session selection), a startup chooser lists manifest maps. After selection, the id is stored in `sessionStorage` and the game loads that file only — no runtime procedural island.
- **Requirements:** Maps must include `playerStart` and at least one gameplay entity type (standing stone, landmark, or orb).

## Future (not implemented)

- **World scale:** Expand from discrete JSON maps to a **planet / region graph** — multiple authored regions, travel between them, and possibly streaming or handoff at borders. The manifest chooser is a stepping stone; region selection and in-world travel would replace or augment the simple list UI.
