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

export const CLOUD_HORIZON_RING_DEFAULTS: [
  CloudHorizonRingSettings,
  CloudHorizonRingSettings,
  CloudHorizonRingSettings,
] = [
  {
    rCenter: 550,
    rSpread: 65,
    clusters: 80,
    staggeredClusters: 29,
    layersPerCluster: 3,
    puffOpacity: 0.88,
    puffAlphaMin: 0.38,
    puffAlphaMax: 1,
  },
  {
    rCenter: 360,
    rSpread: 95,
    clusters: 52,
    staggeredClusters: 15,
    layersPerCluster: 1,
    puffOpacity: 0.26,
    puffAlphaMin: 0.38,
    puffAlphaMax: 1,
  },
  {
    rCenter: 230,
    rSpread: 115,
    clusters: 32,
    staggeredClusters: 45,
    layersPerCluster: 1,
    puffOpacity: 0.78,
    puffAlphaMin: 0.38,
    puffAlphaMax: 0.82,
  },
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
