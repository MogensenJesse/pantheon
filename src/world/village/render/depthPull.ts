// src/world/village/render/depthPull.ts — how far village meshes are pulled toward the camera in the depth test (m)

/** Same pull as map props (their grass-overlay depth bias), so figures and glass draw over grass blades. */
export const PROP_DEPTH_PULL_M = 0.45;
/** Window glow sits a little closer still, so the quads win against their own walls. */
export const GLOW_DEPTH_PULL_M = PROP_DEPTH_PULL_M + 0.08;
/** Villager blob shadows only need to win against the terrain they lie on. */
export const BLOB_DEPTH_PULL_M = 0.3;
