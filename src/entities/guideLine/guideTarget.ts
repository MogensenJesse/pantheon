// src/entities/guideLine/guideTarget.ts — where the guide line leads (pure and node-runnable)
//
// Orbs lead, landmarks pull: the line follows the orbs in the order the map lists them, and once none is
// left it leads to the landmark the fallback names (the nearest one still dormant). A map without
// landmarks ends the line with the last orb.

export type GuideTarget = {
  /** Changes when the target does; the route is rebuilt only then. */
  id: string;
  x: number;
  y: number;
  z: number;
};

/** The ground point a fallback target (a landmark) names; the guide line finds its height. */
export type GuideGroundTarget = { id: string; x: number; z: number };

type GuideOrb = { absorbed: boolean; worldPos: { x: number; y: number; z: number } };

export function pickGuideTarget(
  orbs: readonly GuideOrb[],
  fallback: (() => GuideGroundTarget | null) | null,
  groundY: (x: number, z: number) => number,
  heightM: number,
): GuideTarget | null {
  for (let i = 0; i < orbs.length; i++) {
    const orb = orbs[i]!;
    if (!orb.absorbed)
      return { id: `orb:${i}`, x: orb.worldPos.x, y: orb.worldPos.y, z: orb.worldPos.z };
  }
  const place = fallback?.() ?? null;
  if (!place) return null;
  return { id: place.id, x: place.x, y: groundY(place.x, place.z) + heightM, z: place.z };
}
