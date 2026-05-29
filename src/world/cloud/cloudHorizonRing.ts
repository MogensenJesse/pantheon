import { VISUAL } from '../../config/visualTuning';

/** One concentric horizon fog ring (near / mid / far). */
export interface CloudHorizonRingSettings {
  rCenter: number;
  rSpread: number;
  clusters: number;
  staggeredClusters: number;
  layersPerCluster: number;
  puffOpacity: number;
  puffAlphaMin: number;
  puffAlphaMax: number;
}

export const CLOUD_HORIZON_RING_DEFAULTS = VISUAL.clouds.rings as [
  CloudHorizonRingSettings,
  CloudHorizonRingSettings,
  CloudHorizonRingSettings,
];

export function cloneHorizonRingDefaults(): [
  CloudHorizonRingSettings,
  CloudHorizonRingSettings,
  CloudHorizonRingSettings,
] {
  return CLOUD_HORIZON_RING_DEFAULTS.map((r) => ({ ...r })) as [
    CloudHorizonRingSettings,
    CloudHorizonRingSettings,
    CloudHorizonRingSettings,
  ];
}
