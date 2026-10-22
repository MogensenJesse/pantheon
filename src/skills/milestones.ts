// src/skills/milestones.ts — milestones: things the village has achieved that open skills, upgrades and verbs
// (pure data and functions: no DOM, no game modules, node-runnable)
//
// A milestone is reached when one number of the village (`MilestoneSnapshot`) passes a threshold. Once reached
// it stays reached (the state keeps the ids), so a village that later shrinks loses nothing. The numbers are
// placeholders until a playtest (story-mechanics/VILLAGE_INTERACTION.md).

/** The numbers a milestone looks at; the game fills them in about once a second. */
export interface MilestoneSnapshot {
  /** Places of power the village has restored. */
  restoredPlaces: number;
  /** Villagers alive. */
  population: number;
  /** Buildings at their last stage. */
  finishedBuildings: number;
}

export interface Milestone {
  id: string;
  /** Shown in the journal, the skill tooltips and the "reached" notice. */
  label: string;
  stat: keyof MilestoneSnapshot;
  atLeast: number;
}

export const MILESTONES = [
  { id: 'first_place', label: 'Restore a place of power', stat: 'restoredPlaces', atLeast: 1 },
  {
    id: 'three_places',
    label: 'Restore three places of power',
    stat: 'restoredPlaces',
    atLeast: 3,
  },
  { id: 'all_places', label: 'Restore every place of power', stat: 'restoredPlaces', atLeast: 5 },
  { id: 'folk_20', label: 'Twenty villagers', stat: 'population', atLeast: 20 },
  { id: 'folk_40', label: 'Forty villagers', stat: 'population', atLeast: 40 },
  { id: 'homes_10', label: 'Ten finished buildings', stat: 'finishedBuildings', atLeast: 10 },
] as const satisfies readonly Milestone[];

export type MilestoneId = (typeof MILESTONES)[number]['id'];

const byId = new Map<string, Milestone>(MILESTONES.map((m) => [m.id, m]));

export const isMilestoneId = (value: unknown): value is MilestoneId =>
  typeof value === 'string' && byId.has(value);

export const milestoneLabel = (id: string): string => byId.get(id)?.label ?? id;

/** The milestones `snapshot` has reached that `reached` does not hold yet, in table order. */
export function newlyReached(
  snapshot: MilestoneSnapshot,
  reached: readonly string[],
): MilestoneId[] {
  return MILESTONES.filter((m) => !reached.includes(m.id) && snapshot[m.stat] >= m.atLeast).map(
    (m) => m.id,
  );
}
