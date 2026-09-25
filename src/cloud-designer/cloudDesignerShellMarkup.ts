// src/cloud-designer/cloudDesignerShellMarkup.ts — Cloud Designer chrome markup

import { CUMULUS_DECK_SLIDERS } from '../rendering/clouds/cumulusDeckSliders';
import type { DesignerPreviewLayout } from './buildDesignerPreviewBank';

export interface CloudDesignerShellMarkupInitial {
  layout: DesignerPreviewLayout;
}

function sliderFields(group: 'time' | 'deck' | 'wind', layout: DesignerPreviewLayout): string {
  return CUMULUS_DECK_SLIDERS.filter((spec) => spec.group === group)
    .map((spec) => {
      const hint = spec.hint ? `<p class="cd-field-hint">${spec.hint}</p>` : '';
      const value = layout[spec.key];
      return `
        <div class="cd-field" data-field="${spec.key}">
          <div class="cd-field-row">
            <label for="cd-${spec.key}">${spec.label}</label>
            <span class="cd-val" data-val="${spec.key}"></span>
          </div>
          <input type="range" id="cd-${spec.key}" data-preview="${spec.key}" min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${value}" />
          ${hint}
        </div>`;
    })
    .join('');
}

export function renderCloudDesignerShellMarkup(initial: CloudDesignerShellMarkupInitial): string {
  return `
    <header class="cloud-designer-header" data-slot="header">
      <h1>Cloud Designer</h1>
      <span>Cumulus</span>
    </header>
    <div class="cloud-designer-body">
      <div class="cloud-designer-scene-host" data-slot="scene-host" id="cloud-designer-scene-host">
        <div class="cloud-designer-scene-stub">Engine wires scene here</div>
      </div>
      <aside class="cloud-designer-profile" data-slot="profile-panel" aria-label="Cumulus deck">
        <h2>Deck</h2>
        <h3>Time of day</h3>
        <p class="cd-preview-note">Designer preview only. Scrubs the play day arc, so elevation and azimuth move together.</p>
        ${sliderFields('time', initial.layout)}
        <h3>Field</h3>
        <p class="cd-preview-note">Shared cumulus deck. Play reads these when the map loads.</p>
        ${sliderFields('deck', initial.layout)}
        <h3>Wind</h3>
        ${sliderFields('wind', initial.layout)}
        <label class="cd-field cd-check" for="cd-animate">
          <input type="checkbox" id="cd-animate" />
          Animate wind drift
        </label>
        <p class="cd-field-hint">Gates the wind clock only. Cotton keeps moving from the shader clock.</p>
        <h3>Debug</h3>
        <p class="cd-preview-note">Drawn on the preview deck. Off leaves the cloud preview unchanged.</p>
        <label class="cd-field cd-check" for="cd-debug-coverage">
          <input type="checkbox" id="cd-debug-coverage" data-debug="coverage" />
          Coverage
        </label>
        <label class="cd-field cd-check" for="cd-debug-clusters">
          <input type="checkbox" id="cd-debug-clusters" data-debug="clusters" />
          Clusters
        </label>
      </aside>
    </div>
    <footer class="cloud-designer-status" data-slot="status"></footer>
  `;
}
