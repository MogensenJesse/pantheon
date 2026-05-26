// src/ui/DevPanelLayout.ts
import './dev-panel.css';

const DEV_PANEL_HTML = `
  <div class="dev-title">Development</div>

  <details class="dev-section" open>
    <summary>Gameplay</summary>
    <div class="dev-section-body">
      <label class="dev-row">
        <span>Energy</span>
        <input type="range" id="dev-energy" min="0" max="100" step="1" value="0" />
        <output id="dev-energy-out">0</output>
      </label>
      <div class="dev-actions">
        <button type="button" data-energy="0">0%</button>
        <button type="button" data-energy="25">25%</button>
        <button type="button" data-energy="50">50%</button>
        <button type="button" data-energy="100">100%</button>
        <button type="button" id="dev-energy-plus">+25</button>
      </div>
      <label class="dev-row">
        <span>Move speed</span>
        <select id="dev-speed">
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
          <option value="8">8×</option>
        </select>
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-stones">All standing stones</button>
      </div>
    </div>
  </details>

  <details class="dev-section" open>
    <summary>Glow &amp; bloom</summary>
    <div class="dev-section-body">
      <label class="dev-row">
        <span>Strength</span>
        <input type="range" id="dev-bloom-strength" min="0" max="3" step="0.05" value="1.15" />
        <output id="dev-bloom-strength-out">1.15</output>
      </label>
      <label class="dev-row">
        <span>Radius</span>
        <input type="range" id="dev-bloom-radius" min="0" max="1" step="0.02" value="0.38" />
        <output id="dev-bloom-radius-out">0.38</output>
      </label>
      <label class="dev-row">
        <span>Scene mix</span>
        <input type="range" id="dev-bloom-scene-mul" min="0" max="1" step="0.05" value="0.45" />
        <output id="dev-bloom-scene-mul-out">0.45</output>
      </label>
      <label class="dev-row">
        <span>Exposure</span>
        <input type="range" id="dev-bloom-exposure" min="0.3" max="2" step="0.05" value="0.9" />
        <output id="dev-bloom-exposure-out">0.90</output>
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-bloom-reset">Reset glow</button>
      </div>
    </div>
  </details>

  <details class="dev-section" id="dev-section-grass">
    <summary>Grass</summary>
    <div class="dev-section-body">
      <p class="dev-hint">Wind — live</p>
      <label class="dev-row">
        <span>Wind strength</span>
        <input type="range" id="dev-grass-wind-strength" min="0" max="0.6" step="0.02" value="0.18" />
        <output id="dev-grass-wind-strength-out">0.18</output>
      </label>
      <label class="dev-row">
        <span>Wind speed</span>
        <input type="range" id="dev-grass-wind-speed" min="0" max="2" step="0.05" value="0.6" />
        <output id="dev-grass-wind-speed-out">0.60</output>
      </label>
      <p class="dev-hint">Scatter — release slider to rebuild</p>
      <label class="dev-row">
        <span>Density ×</span>
        <input type="range" id="dev-grass-density" min="0" max="2" step="0.05" value="1" />
        <output id="dev-grass-density-out">1.00</output>
      </label>
      <label class="dev-row">
        <span>Blade scale ×</span>
        <input type="range" id="dev-grass-scale" min="0.5" max="2" step="0.05" value="1" />
        <output id="dev-grass-scale-out">1.00</output>
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-grass-reset">Reset grass</button>
      </div>
    </div>
  </details>

  <details class="dev-section" id="dev-section-terrain">
    <summary>Terrain textures</summary>
    <div class="dev-section-body">
      <label class="dev-row">
        <span>Tile repeat</span>
        <input type="range" id="dev-tex-repeat" min="0.02" max="0.2" step="0.005" value="0.08" />
        <output id="dev-tex-repeat-out">0.08</output>
      </label>
      <label class="dev-row dev-row-check">
        <span>Displacement</span>
        <input type="checkbox" id="dev-tex-disp-on" checked />
      </label>
      <label class="dev-row">
        <span>Disp. scale</span>
        <input type="range" id="dev-tex-disp" min="0" max="2" step="0.05" value="0.45" />
        <output id="dev-tex-disp-out">0.45</output>
      </label>
      <label class="dev-row">
        <span>Normals</span>
        <input type="range" id="dev-tex-normal" min="0" max="2" step="0.05" value="1" />
        <output id="dev-tex-normal-out">1.00</output>
      </label>
      <label class="dev-row">
        <span>AO</span>
        <input type="range" id="dev-tex-ao" min="0" max="1" step="0.05" value="0.85" />
        <output id="dev-tex-ao-out">0.85</output>
      </label>
      <label class="dev-row">
        <span>Specular</span>
        <input type="range" id="dev-tex-spec" min="0" max="1" step="0.05" value="0.35" />
        <output id="dev-tex-spec-out">0.35</output>
      </label>
      <label class="dev-row">
        <span>Rock slope</span>
        <input type="range" id="dev-tex-slope" min="0.4" max="1" step="0.05" value="0.75" />
        <output id="dev-tex-slope-out">0.75</output>
      </label>
      <label class="dev-row">
        <span>Path blend</span>
        <input type="range" id="dev-tex-path-blend" min="0.3" max="4" step="0.1" value="1.6" />
        <output id="dev-tex-path-blend-out">1.6</output>
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-tex-reset">Reset terrain</button>
      </div>
    </div>
  </details>

  <details class="dev-section">
    <summary>Post FX</summary>
    <div class="dev-section-body">
      <label class="dev-row">
        <span>Pixel size</span>
        <input type="range" id="dev-pixel-size" min="1" max="16" step="1" value="1" />
        <output id="dev-pixel-size-out">1</output>
      </label>
      <label class="dev-row">
        <span>Color levels</span>
        <input type="range" id="dev-color-levels" min="1" max="48" step="1" value="1" />
        <output id="dev-color-levels-out">1</output>
      </label>
      <label class="dev-row">
        <span>Bloom</span>
        <select id="dev-fx-quality">
          <option value="low" selected>Soft (low)</option>
          <option value="high">Strong (high)</option>
        </select>
      </label>
      <label class="dev-row dev-row-check">
        <span>Show FPS</span>
        <input type="checkbox" id="dev-show-fps" />
      </label>
    </div>
  </details>

  <details class="dev-section" id="dev-section-sky">
    <summary>Sky &amp; atmosphere</summary>
    <div class="dev-section-body">
      <p class="dev-hint">Preetham sky — live, no rebuild needed.</p>
      <div id="dev-sky-globals"></div>
    </div>
  </details>

  <details class="dev-section" id="dev-section-clouds" open>
    <summary>Cloud rings</summary>
    <div class="dev-section-body">
      <p class="dev-hint">Three horizon tiers (like water rings). Layout sliders rebuild on release.</p>
      <p class="dev-hint">Atmosphere (live): night fade and sky tint match.</p>
      <div id="dev-cloud-globals"></div>

      <details class="dev-subsection" open>
        <summary>Near ring (shore)</summary>
        <div class="dev-section-body" data-cloud-ring="0"></div>
      </details>
      <details class="dev-subsection" open>
        <summary>Mid ring</summary>
        <div class="dev-section-body" data-cloud-ring="1"></div>
      </details>
      <details class="dev-subsection" open>
        <summary>Far ring (horizon)</summary>
        <div class="dev-section-body" data-cloud-ring="2"></div>
      </details>

      <div class="dev-actions">
        <button type="button" id="dev-cloud-reset">Reset clouds</button>
      </div>
    </div>
  </details>

  <details class="dev-section" open>
    <summary>Performance</summary>
    <div class="dev-section-body">
      <p class="dev-hint">Toggle subsystems to find GPU bottlenecks.</p>
      <label class="dev-row dev-row-check">
        <span>Hide terrain</span>
        <input type="checkbox" id="dev-hide-terrain" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Hide water</span>
        <input type="checkbox" id="dev-hide-water" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Hide scatter</span>
        <input type="checkbox" id="dev-hide-scatter" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Hide sky</span>
        <input type="checkbox" id="dev-hide-sky" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Hide clouds</span>
        <input type="checkbox" id="dev-hide-clouds" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Disable bloom</span>
        <input type="checkbox" id="dev-disable-bloom" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Disable shadows</span>
        <input type="checkbox" id="dev-disable-shadows" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Disable edge AA</span>
        <input type="checkbox" id="dev-disable-edge-aa" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Disable god rays</span>
        <input type="checkbox" id="dev-disable-god-rays" />
      </label>
      <label class="dev-row dev-row-check">
        <span>Log GPU / 3s</span>
        <input type="checkbox" id="dev-log-gpu-periodic" />
      </label>
      <div class="dev-actions">
        <button type="button" id="dev-gpu-info">Log GPU snapshot</button>
        <button type="button" id="dev-render-debug">Log render debug</button>
      </div>
    </div>
  </details>
`;

export function mountDevPanelShell(): { toggle: HTMLButtonElement; panel: HTMLDivElement } {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.id = 'dev-toggle';
  toggle.textContent = 'Dev';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'dev-panel');

  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.hidden = true;
  panel.innerHTML = DEV_PANEL_HTML;

  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  return { toggle, panel };
}
