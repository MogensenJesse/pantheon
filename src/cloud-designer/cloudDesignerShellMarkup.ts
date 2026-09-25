// src/cloud-designer/cloudDesignerShellMarkup.ts — Cloud Designer chrome markup

import { CLOUD_GENUS_LIST, CLOUD_GENUS_PROFILES } from '../rendering/clouds/cloudGenusProfiles';
import type { DesignerPreviewLayout } from './buildDesignerPreviewBank';

export interface CloudDesignerSliderSpec {
  key:
    | 'deckPlaneYBiasM'
    | 'puffLayoutRadiusScale'
    | 'puffLayoutHeightScale'
    | 'particlesHint'
    | 'deckBaseFraction';
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  /** Hidden for cirrus. Condensation clip is off; wiring the control would change play. */
  requiresCondensationClip?: boolean;
  hint?: string;
}

export const CLOUD_DESIGNER_SLIDERS: readonly CloudDesignerSliderSpec[] = [
  {
    key: 'deckPlaneYBiasM',
    label: 'Deck Y bias (m)',
    min: -40,
    max: 80,
    step: 0.5,
    format: (v) => v.toFixed(1),
    requiresCondensationClip: true,
  },
  {
    key: 'puffLayoutRadiusScale',
    label: 'Radius scale',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'puffLayoutHeightScale',
    label: 'Height scale',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'particlesHint',
    label: 'Particles per cloud',
    min: 4,
    max: 48,
    step: 1,
    format: (v) => String(Math.round(v)),
    hint: 'Designer preview only. Play cloud counts do not use this hint.',
  },
  {
    key: 'deckBaseFraction',
    label: 'Deck base fraction',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
    requiresCondensationClip: true,
  },
];

export interface CloudDesignerShellMarkupInitial {
  layout: DesignerPreviewLayout;
  wispStrength: number;
  cornerRadius: number;
  turbulence: number;
}

export function renderCloudDesignerShellMarkup(initial: CloudDesignerShellMarkupInitial): string {
  const options = CLOUD_GENUS_LIST.map((g) => {
    const p = CLOUD_GENUS_PROFILES[g];
    return `<option value="${g}">${p.label}</option>`;
  }).join('');

  const sliderHtml = CLOUD_DESIGNER_SLIDERS.map((s) => {
    const hint = s.hint ? `<p class="cd-field-hint">${s.hint}</p>` : '';
    return `
      <div class="cd-field" data-field="${s.key}">
        <div class="cd-field-row">
          <label for="cd-${s.key}">${s.label}</label>
          <span class="cd-val" data-val="${s.key}">—</span>
        </div>
        <input type="range" id="cd-${s.key}" data-key="${s.key}"
          min="${s.min}" max="${s.max}" step="${s.step}" />
        ${hint}
      </div>`;
  }).join('');

  return `
    <header class="cloud-designer-header" data-slot="header">
      <h1>Cloud Designer</h1>
      <label>
        <span>Genus</span>
        <select id="cloud-designer-genus" aria-label="Cloud genus">
          ${options}
        </select>
      </label>
      <div class="cd-io" aria-label="Profile save and load">
        <button type="button" id="cd-save">Save</button>
        <button type="button" id="cd-load">Load</button>
        <input type="file" id="cd-load-file" accept="application/json,.json" hidden />
      </div>
    </header>
    <div class="cloud-designer-body">
      <div class="cloud-designer-scene-host" data-slot="scene-host" id="cloud-designer-scene-host">
        <div class="cloud-designer-scene-stub">Engine wires scene here</div>
      </div>
      <aside class="cloud-designer-profile" data-slot="profile-panel" aria-label="Genus profile">
        <h2>Genus profile</h2>
        ${sliderHtml}
        <p class="cd-field-hint" data-slot="clip-unused" hidden>
          Deck Y bias and deck base are hidden for cirrus. This genus has no condensation clip,
          so those sliders do not move the preview. Wiring them into the shared puff profile would change play.
        </p>
        <div class="cd-field cd-actions" aria-label="Profile resets">
          <button type="button" id="cd-reset-genus">Reset genus</button>
          <button type="button" id="cd-reset-all">Reset all</button>
          <button type="button" id="cd-reload-saved">Reload saved</button>
        </div>
        <div class="cd-field">
          <div class="cd-field-row"><label>Notes</label></div>
          <p class="cd-notes" data-slot="notes"></p>
        </div>
        <h3>Time of day</h3>
        <p class="cd-preview-note">Designer preview only — not written by Save / Load. Scrubs the play day arc, so elevation and azimuth move together.</p>
        <div class="cd-field" data-field="sunPhase">
          <div class="cd-field-row">
            <label for="cd-sun">Sun</label>
            <span class="cd-val" data-val="sunPhase"></span>
          </div>
          <input type="range" id="cd-sun" data-preview="sunPhase" min="0" max="1" step="0.001" value="${initial.layout.sunPhase}" />
        </div>
        <h3>Deck</h3>
        <p class="cd-preview-note">Preview altitude band, wrap box, edge fade, and coverage. Not saved. Play keeps its own deck.</p>
        <div class="cd-field" data-field="deckMinY">
          <div class="cd-field-row">
            <label for="cd-deck-min">Min height (m)</label>
            <span class="cd-val" data-val="deckMinY"></span>
          </div>
          <input type="range" id="cd-deck-min" data-preview="deckMinY" min="0" max="800" step="1" value="${initial.layout.deckMinY}" />
        </div>
        <div class="cd-field" data-field="deckMaxY">
          <div class="cd-field-row">
            <label for="cd-deck-max">Max height (m)</label>
            <span class="cd-val" data-val="deckMaxY"></span>
          </div>
          <input type="range" id="cd-deck-max" data-preview="deckMaxY" min="0" max="800" step="1" value="${initial.layout.deckMaxY}" />
        </div>
        <div class="cd-field" data-field="spread">
          <div class="cd-field-row">
            <label for="cd-spread">Spread (m)</label>
            <span class="cd-val" data-val="spread"></span>
          </div>
          <input type="range" id="cd-spread" data-preview="spread" min="160" max="1600" step="10" value="${initial.layout.spread}" />
        </div>
        <div class="cd-field" data-field="edgeFadeM">
          <div class="cd-field-row">
            <label for="cd-edge-fade">Edge fade (m)</label>
            <span class="cd-val" data-val="edgeFadeM"></span>
          </div>
          <input type="range" id="cd-edge-fade" data-preview="edgeFadeM" min="0" max="400" step="1" value="${initial.layout.edgeFadeM}" />
        </div>
        <div class="cd-field" data-field="coverage">
          <div class="cd-field-row">
            <label for="cd-coverage">Coverage</label>
            <span class="cd-val" data-val="coverage"></span>
          </div>
          <input type="range" id="cd-coverage" data-preview="coverage" min="0" max="1" step="0.01" value="${initial.layout.coverage}" />
          <p class="cd-field-hint">How much of the noise field places clouds. Density still sets the requested count.</p>
        </div>
        <div class="cd-field" data-field="density">
          <div class="cd-field-row">
            <label for="cd-density">Density</label>
            <span class="cd-val" data-val="density"></span>
          </div>
          <input type="range" id="cd-density" data-preview="density" min="0" max="1" step="0.001" value="${initial.layout.density}" />
        </div>
        <h3>Puff look</h3>
        <div class="cd-field" data-field="cotton">
          <div class="cd-field-row">
            <label for="cd-cotton">Cotton</label>
            <span class="cd-val" data-val="cotton">${initial.wispStrength.toFixed(2)}</span>
          </div>
          <input type="range" id="cd-cotton" min="0" max="1" step="0.01" value="${initial.wispStrength}" />
        </div>
        <div class="cd-field" data-field="cornerRadius">
          <div class="cd-field-row">
            <label for="cd-corner">Corner radius</label>
            <span class="cd-val" data-val="cornerRadius">${initial.cornerRadius.toFixed(2)}</span>
          </div>
          <input type="range" id="cd-corner" min="0" max="1" step="0.01" value="${initial.cornerRadius}" />
        </div>
        <div class="cd-field" data-field="turbulence">
          <div class="cd-field-row">
            <label for="cd-turbulence">Turbulence</label>
            <span class="cd-val" data-val="turbulence">${initial.turbulence.toFixed(2)}</span>
          </div>
          <input type="range" id="cd-turbulence" min="0" max="1" step="0.01" value="${initial.turbulence}" />
        </div>
        <h3>Wind</h3>
        <div class="cd-field" data-field="windSpeed">
          <div class="cd-field-row">
            <label for="cd-wind">Wind speed</label>
            <span class="cd-val" data-val="windSpeed"></span>
          </div>
          <input type="range" id="cd-wind" data-preview="windSpeed" min="0" max="100" step="0.1" value="${initial.layout.windSpeed}" />
          <p class="cd-field-hint">Preview drift only. Animate still gates the wind clock. Not saved.</p>
        </div>
        <label class="cd-field cd-check" for="cd-animate">
          <input type="checkbox" id="cd-animate" />
          Animate wind drift
        </label>
        <p class="cd-field-hint">Gates the wind clock only. Cotton and turbulence keep moving from the shader clock.</p>
      </aside>
    </div>
    <footer class="cloud-designer-status" data-slot="status"></footer>
  `;
}
