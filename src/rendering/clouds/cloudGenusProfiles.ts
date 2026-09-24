// src/rendering/clouds/cloudGenusProfiles.ts — shared genus shape/sit stubs
// Designer Save downloads cloudGenusProfileSaved.json; Jesse drops it into this folder.
// Play + designer both read live CLOUD_GENUS_PROFILES (DEFAULTS + saved overlay on module init).
// Soft MeshCloud particle profiles in cloudProfiles.ts stay frozen — do NOT fork or retune
// play VISUAL from this module.
import type { CloudGenus } from './cloudConfig';
import savedOverlayJson from './cloudGenusProfileSaved.json';

/**
 * Authoring-facing genus profile (designer + play contract).
 * deckPlaneYBiasM + deckBaseFraction are live on the soft MeshCloud sit/clip path
 * (bankDeckY / profileCloudParticle). Soft shading uniforms stay frozen.
 */
export interface CloudGenusProfile {
  genus: CloudGenus;
  /** Label for designer UI. */
  label: string;
  /**
   * Deck-plane Y bias (m) added to bank-shared condensation Y (P25 local + clusterY).
   * Consumed by applyWindToCloudInstances aDeckClip; ignored when clip is off (cirrus).
   */
  deckPlaneYBiasM: number;
  /**
   * Horizontal puff layout radius scale (unitless). Engine maps onto cluster spread.
   */
  puffLayoutRadiusScale: number;
  /**
   * Vertical heap height scale (unitless). Engine maps onto mass bias / particle Y.
   */
  puffLayoutHeightScale: number;
  /**
   * Fraction of particles reserved as deck-base sitters (0-1). Consumed by
   * profileCloudParticle (designer + play). Condensation-clip underside continuity.
   */
  deckBaseFraction: number;
  /**
   * Preferred particle count hint for designer preview banks (not play VISUAL).
   */
  particlesHint: number;
  /** Free-form notes for Engine / designer; not consumed at runtime. */
  notes: string;
}

/** Partial update keys (identity fields genus/label/notes stay on the live entry). */
export type CloudGenusProfilePatch = Partial<
  Pick<
    CloudGenusProfile,
    | 'deckPlaneYBiasM'
    | 'puffLayoutRadiusScale'
    | 'puffLayoutHeightScale'
    | 'deckBaseFraction'
    | 'particlesHint'
    | 'notes'
    | 'label'
  >
>;

/** On-disk / download payload for Phase 4 Save (profiles only — not preview layout). */
export interface CloudGenusProfileSavedFile {
  version: 1;
  profiles: Record<CloudGenus, CloudGenusProfile>;
}

function cloneProfile(src: CloudGenusProfile): CloudGenusProfile {
  return { ...src };
}

function cloneAll(
  src: Record<CloudGenus, CloudGenusProfile>,
): Record<CloudGenus, CloudGenusProfile> {
  return {
    cumulus: cloneProfile(src.cumulus),
    stratus: cloneProfile(src.stratus),
    cirrus: cloneProfile(src.cirrus),
  };
}

/** Shipped code defaults — frozen; restore target for reset helpers (not last Save). */
export const CLOUD_GENUS_PROFILE_DEFAULTS: Readonly<Record<CloudGenus, CloudGenusProfile>> =
  Object.freeze({
    cumulus: Object.freeze({
      genus: 'cumulus' as const,
      label: 'Cumulus',
      deckPlaneYBiasM: 0,
      puffLayoutRadiusScale: 1,
      puffLayoutHeightScale: 1.15,
      deckBaseFraction: 0.3,
      particlesHint: 24,
      notes: 'Flat clip underside, cauliflower lobes overlapping the body.',
    }),
    stratus: Object.freeze({
      genus: 'stratus' as const,
      label: 'Stratus',
      deckPlaneYBiasM: 0,
      puffLayoutRadiusScale: 1.4,
      puffLayoutHeightScale: 0.45,
      deckBaseFraction: 0.45,
      particlesHint: 18,
      notes: 'Wide shallow sheet; more deck sitters. Soft particle path unchanged.',
    }),
    cirrus: Object.freeze({
      genus: 'cirrus' as const,
      label: 'Cirrus',
      deckPlaneYBiasM: 40,
      puffLayoutRadiusScale: 1.8,
      puffLayoutHeightScale: 0.25,
      deckBaseFraction: 0,
      particlesHint: 12,
      notes: 'High wispy streaks; unclipped. Soft particle path unchanged.',
    }),
  });

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isCloudGenus(v: unknown): v is CloudGenus {
  return v === 'cumulus' || v === 'stratus' || v === 'cirrus';
}

/**
 * Overlay authorable fields from a saved payload onto live profiles.
 * Unknown genera / non-finite numbers are skipped. Returns list of genera touched.
 */
export function applyCloudGenusProfileSavedOverlay(
  saved: unknown,
  target: Record<CloudGenus, CloudGenusProfile>,
): CloudGenus[] {
  if (!saved || typeof saved !== 'object') return [];
  const root = saved as { profiles?: unknown };
  const profiles = root.profiles;
  if (!profiles || typeof profiles !== 'object') return [];
  const touched: CloudGenus[] = [];
  for (const genus of CLOUD_GENUS_LIST) {
    const entry = (profiles as Record<string, unknown>)[genus];
    if (!entry || typeof entry !== 'object') continue;
    const src = entry as Record<string, unknown>;
    // Prefer explicit genus when present; ignore mismatches.
    if (src.genus !== undefined && isCloudGenus(src.genus) && src.genus !== genus) {
      continue;
    }
    const live = target[genus];
    let changed = false;
    if (typeof src.label === 'string') {
      live.label = src.label;
      changed = true;
    }
    if (isFiniteNumber(src.deckPlaneYBiasM)) {
      live.deckPlaneYBiasM = src.deckPlaneYBiasM;
      changed = true;
    }
    if (isFiniteNumber(src.puffLayoutRadiusScale)) {
      live.puffLayoutRadiusScale = src.puffLayoutRadiusScale;
      changed = true;
    }
    if (isFiniteNumber(src.puffLayoutHeightScale)) {
      live.puffLayoutHeightScale = src.puffLayoutHeightScale;
      changed = true;
    }
    if (isFiniteNumber(src.deckBaseFraction)) {
      live.deckBaseFraction = src.deckBaseFraction;
      changed = true;
    }
    if (isFiniteNumber(src.particlesHint)) {
      live.particlesHint = Math.round(src.particlesHint);
      changed = true;
    }
    if (typeof src.notes === 'string') {
      live.notes = src.notes;
      changed = true;
    }
    if (changed) touched.push(genus);
  }
  return touched;
}

/**
 * Live mutable profiles for designer + play. Mutate via updateCloudGenusProfile /
 * reset / apply overlay helpers — do not replace this object.
 * Init = DEFAULTS clone, then shipped cloudGenusProfileSaved.json overlay.
 * Reset restores DEFAULTS (not last Save). Use reloadSavedCloudGenusProfiles to
 * re-apply the committed overlay.
 */
export const CLOUD_GENUS_PROFILES: Record<CloudGenus, CloudGenusProfile> = cloneAll(
  CLOUD_GENUS_PROFILE_DEFAULTS,
);

export const CLOUD_GENUS_LIST: readonly CloudGenus[] = ['cumulus', 'stratus', 'cirrus'];

// Module init: overlay committed Save so play and designer share authored sit.
applyCloudGenusProfileSavedOverlay(savedOverlayJson, CLOUD_GENUS_PROFILES);

/** Shipped Save payload (import-time snapshot). Used by Reload saved. */
export const CLOUD_GENUS_PROFILE_SAVED_SHIPPED: CloudGenusProfileSavedFile =
  savedOverlayJson as CloudGenusProfileSavedFile;

export function getCloudGenusProfile(genus: CloudGenus): CloudGenusProfile {
  return CLOUD_GENUS_PROFILES[genus];
}

export function updateCloudGenusProfile(
  genus: CloudGenus,
  partial: CloudGenusProfilePatch,
): CloudGenusProfile {
  const live = CLOUD_GENUS_PROFILES[genus];
  if (partial.label !== undefined) live.label = partial.label;
  if (partial.deckPlaneYBiasM !== undefined) live.deckPlaneYBiasM = partial.deckPlaneYBiasM;
  if (partial.puffLayoutRadiusScale !== undefined) {
    live.puffLayoutRadiusScale = partial.puffLayoutRadiusScale;
  }
  if (partial.puffLayoutHeightScale !== undefined) {
    live.puffLayoutHeightScale = partial.puffLayoutHeightScale;
  }
  if (partial.deckBaseFraction !== undefined) live.deckBaseFraction = partial.deckBaseFraction;
  if (partial.particlesHint !== undefined) live.particlesHint = partial.particlesHint;
  if (partial.notes !== undefined) live.notes = partial.notes;
  return live;
}

/** Restore one genus to code DEFAULTS (not last Save / shipped overlay). */
export function resetCloudGenusProfile(genus: CloudGenus): CloudGenusProfile {
  const defaults = CLOUD_GENUS_PROFILE_DEFAULTS[genus];
  const live = CLOUD_GENUS_PROFILES[genus];
  live.label = defaults.label;
  live.deckPlaneYBiasM = defaults.deckPlaneYBiasM;
  live.puffLayoutRadiusScale = defaults.puffLayoutRadiusScale;
  live.puffLayoutHeightScale = defaults.puffLayoutHeightScale;
  live.deckBaseFraction = defaults.deckBaseFraction;
  live.particlesHint = defaults.particlesHint;
  live.notes = defaults.notes;
  return live;
}

/** Restore all genera to code DEFAULTS (not last Save / shipped overlay). */
export function resetAllCloudGenusProfiles(): void {
  resetCloudGenusProfile('cumulus');
  resetCloudGenusProfile('stratus');
  resetCloudGenusProfile('cirrus');
}

/**
 * Re-apply the committed cloudGenusProfileSaved.json overlay onto live profiles
 * (after resetting to DEFAULTS so missing keys fall back cleanly).
 */
export function reloadSavedCloudGenusProfiles(): CloudGenus[] {
  for (const genus of CLOUD_GENUS_LIST) {
    resetCloudGenusProfile(genus);
  }
  return applyCloudGenusProfileSavedOverlay(
    CLOUD_GENUS_PROFILE_SAVED_SHIPPED,
    CLOUD_GENUS_PROFILES,
  );
}

/** Serialize live profiles for download / Load round-trip (profiles only). */
export function serializeCloudGenusProfilesSaved(): CloudGenusProfileSavedFile {
  return {
    version: 1,
    profiles: cloneAll(CLOUD_GENUS_PROFILES),
  };
}

/** Repo-relative path Jesse should replace after Save download. */
export const CLOUD_GENUS_PROFILE_SAVED_REPO_PATH =
  'src/rendering/clouds/cloudGenusProfileSaved.json';

export const CLOUD_GENUS_PROFILE_SAVED_FILENAME = 'cloudGenusProfileSaved.json';

/** Browser download of live profiles as the committed JSON module payload. */
export function downloadCloudGenusProfilesSaved(): void {
  const payload = serializeCloudGenusProfilesSaved();
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = CLOUD_GENUS_PROFILE_SAVED_FILENAME;
  a.click();
  URL.revokeObjectURL(url);
}
