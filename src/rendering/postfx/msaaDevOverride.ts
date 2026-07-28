// src/rendering/postfx/msaaDevOverride.ts — DEV scene-pass MSAA override across the required reload
import { type MsaaSamples, VISUAL } from '../../config/visualTuning';

const SESSION_KEY = 'pantheon.msaaSamples';

function parseSamples(raw: string | null): MsaaSamples | null {
  if (raw === '0') return 0;
  if (raw === '4') return 4;
  return null;
}

/** sessionStorage throws when storage is blocked; MSAA choice is never worth a hard failure. */
function readStoredSamples(): MsaaSamples | null {
  try {
    return parseSamples(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

/**
 * Scene-pass sample count for this session. The PassNode render target is allocated once and
 * WGSL codegen branches on sample count (multisampled depth reads compile to `textureLoad`),
 * so switching MSAA needs a fresh pipeline rather than a graph rebuild.
 */
export function getLiveMsaaSamples(): MsaaSamples {
  if (!import.meta.env.DEV) return VISUAL.render.msaaSamples;
  return readStoredSamples() ?? VISUAL.render.msaaSamples;
}

/** DEV only — persist the choice, then reload so the scene pass is rebuilt with it. */
export function setMsaaSamplesAndReload(samples: MsaaSamples): void {
  if (!import.meta.env.DEV) return;
  try {
    if (samples === VISUAL.render.msaaSamples) {
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, String(samples));
    }
  } catch {
    // Non-persistent storage — the reload below still applies the shipped default.
  }
  window.location.reload();
}
