// src/config/visual/bloom.ts — scene bloom

export const bloom = {
    SMOOTH_WIDTH: 0.045,
    STRENGTH: 0.4,
    RADIUS: 0.1,
    SCENE_THRESHOLD: 0.35,
    SCENE_STRENGTH_MUL: 0.2,
    SKY_DEPTH_START: 0.935,
    SKY_DEPTH_END: 1,
    SKY_SUN_LUMA_START: 0.4,
    SKY_SUN_LUMA_END: 1.6,
    /** Low sun: less sky bloom attenuation (more bloom). High sun: stronger cut (less sky bloom). */
    SKY_REDUCE_LOW: 0.2,
    SKY_REDUCE_HIGH: 0.75,
    HDR_SCALE: 12,
    PLAYER_EMISSIVE: 1.25,
  } as const;
