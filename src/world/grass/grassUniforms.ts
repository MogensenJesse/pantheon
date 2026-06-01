// src/world/grass/grassUniforms.ts — shared CPU/GPU grass uniforms
import { Color, Matrix4, Vector2, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { GRASS_CONFIG } from './grassConfig';

const g = VISUAL.grass;

export const grassUniforms = {
  uCameraMatrix: uniform(new Matrix4()),
  uFx: uniform(1),
  uFy: uniform(1),
  uCullPadNdcX: uniform(g.cullPadNdcX),
  uCullPadNdcYNear: uniform(g.cullPadNdcYNear),
  uCullPadNdcYFar: uniform(g.cullPadNdcYFar),
  uPlayerPosition: uniform(new Vector3()),
  uPlayerDeltaXZ: uniform(new Vector2()),
  uPlayerRadius: uniform(0.5),
  uCameraForward: uniform(new Vector3(0, 0, -1)),
  uWindDirection: uniform(new Vector2(0.85, 0.35).normalize()),
  uWindStrength: uniform(g.windStrength),
  uWindSpeed: uniform(g.windSpeed),
  uBladeMinScale: uniform(g.bladeMinScale),
  uBladeMaxScale: uniform(g.bladeMaxScale),
  uR0: uniform(g.thinningR0),
  uR1: uniform(g.thinningR1),
  uPMin: uniform(g.thinningPMin),
  uBaseColor: uniform(new Color(g.baseColor)),
  uTipColor: uniform(new Color(g.tipColor)),
  uColorMixFactor: uniform(g.colorMixFactor),
  uColorVariationStrength: uniform(g.colorVariationStrength),
  uAoScale: uniform(g.aoScale),
  uAoRimSmoothness: uniform(g.aoRimSmoothness),
  uAoRadiusSquared: uniform(g.aoRadius * g.aoRadius),
  uBaseWindShade: uniform(g.baseWindShade),
  uBaseShadeHeight: uniform(g.baseShadeHeight),
  uBaseBending: uniform(g.baseBending),
  uWorldSize: uniform(0),
  uHeightScale: uniform(0),
  uBiomeGrassThreshold: uniform(g.biomeGrassThreshold),
  uTime: uniform(0),
  uTileSize: uniform(GRASS_CONFIG.TILE_SIZE),
  uTrailGrowthRate: uniform(g.trailGrowthRate),
  uTrailMinScale: uniform(g.trailMinScale),
  uTrailRadiusSquared: uniform(g.trailRadius * g.trailRadius),
  uKDown: uniform(g.trailKDown),
  uPlayerGlowMul: uniform(g.playerGlowMul),
  uSunIntensity: uniform(0),
};
