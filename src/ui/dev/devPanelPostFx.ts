// src/ui/dev/devPanelPostFx.ts — DEV post-FX cohesion, grade, FPS counter
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyGradeLutToPostFX } from '../../rendering/postfx/applyGradeLut';
import {
  fetchGradeLutCatalog,
  findLutByPath,
  type GradeLutManifest,
  lutsForVendor,
} from '../../rendering/postfx/gradeLutCatalog';
import { resetPostFxCohesionDev } from '../../rendering/postfx/postfxCohesionDevDefaults';
import { resetPostFxGradeDev } from '../../rendering/postfx/postfxGradeDevDefaults';
import { setFpsCounterEnabled } from '../FpsCounter';
import { bindRange, injectRangeRows, mountSection, syncSpecs } from './bindRange';
import {
  COHESION_SPECS,
  type CohesionSpec,
  GRADE_SPECS,
  type GradeSpec,
} from './devPanelPostFxSpecs';

export function initDevPanelPostFx(_panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(_panel, {
    hostId: 'dev-section-postfx',
    title: 'Post FX',
    open: false,
    body: `
      <p class="dev-hint"><strong>Color pipeline:</strong> exposure → Sky → Day cycle; glow → Bloom panel; golden-hour weights → Cohesion; grade/LUT → below. Toggle effects via Render debug.</p>
      <details class="dev-subsection" open>
        <summary>Cohesion</summary>
        <div class="dev-section-body">
          <label class="dev-row dev-row-check">
            <span>Cohesion enabled</span>
            <input type="checkbox" id="dev-cohesion-enabled" />
          </label>
          <div id="dev-cohesion-rows"></div>
          <div class="dev-actions">
            <button type="button" id="dev-cohesion-reset">Reset cohesion</button>
          </div>
        </div>
      </details>
      <details class="dev-subsection">
        <summary>Grade</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Vignette runs before renderOutput. Procedural grade + LUT run on display-referred color after renderOutput — use <strong>Other / Presetpro</strong> creative LUTs. Vendor log LUTs need a log shaper (not wired). Strength is LUT delta-blend intensity.</p>
          <label class="dev-row dev-row-check">
            <span>Grade enabled</span>
            <input type="checkbox" id="dev-grade-enabled" />
          </label>
          <label class="dev-row dev-row-check">
            <span>LUT enabled</span>
            <input type="checkbox" id="dev-grade-lut-enabled" />
          </label>
          <label class="dev-row">
            <span>LUT vendor</span>
            <select id="dev-grade-lut-vendor" disabled>
              <option value="">Loading…</option>
            </select>
          </label>
          <label class="dev-row">
            <span>LUT</span>
            <select id="dev-grade-lut-pick" disabled>
              <option value="">None</option>
            </select>
          </label>
          <p id="dev-grade-lut-status" class="dev-hint"></p>
          <div id="dev-grade-rows"></div>
          <div class="dev-actions">
            <button type="button" id="dev-grade-reset">Reset grade</button>
          </div>
        </div>
      </details>
      <label class="dev-row dev-row-check">
        <span>Show FPS</span>
        <input type="checkbox" id="dev-show-fps" />
      </label>
    `,
  });
  if (!body) return () => {};

  const cohesionHost = _panel.querySelector('#dev-cohesion-rows');
  if (cohesionHost) injectRangeRows(cohesionHost, COHESION_SPECS);

  const gradeHost = _panel.querySelector('#dev-grade-rows');
  if (gradeHost) injectRangeRows(gradeHost, GRADE_SPECS);

  const cohesion = devSettings.postfx.cohesion;
  const grade = devSettings.postfx.grade;
  const enabled = _panel.querySelector('#dev-cohesion-enabled') as HTMLInputElement | null;
  if (enabled) enabled.checked = cohesion.enabled;

  const gradeEnabled = _panel.querySelector('#dev-grade-enabled') as HTMLInputElement | null;
  if (gradeEnabled) gradeEnabled.checked = grade.enabled;

  const lutEnabled = _panel.querySelector('#dev-grade-lut-enabled') as HTMLInputElement | null;
  if (lutEnabled) lutEnabled.checked = grade.lut.enabled;

  const lutVendorSelect = _panel.querySelector('#dev-grade-lut-vendor') as HTMLSelectElement | null;
  const lutPickSelect = _panel.querySelector('#dev-grade-lut-pick') as HTMLSelectElement | null;
  const lutStatus = _panel.querySelector('#dev-grade-lut-status') as HTMLParagraphElement | null;

  let lutCatalog: GradeLutManifest | null = null;
  let lutLoadToken = 0;
  let applyingLut = false;

  const setLutStatus = (message: string) => {
    if (lutStatus) lutStatus.textContent = message;
  };

  const populateLutPick = (vendor: string, selectedPath: string | null) => {
    if (!lutPickSelect || !lutCatalog) return;
    const previous = selectedPath ?? lutPickSelect.value;
    lutPickSelect.innerHTML = '<option value="">None</option>';
    const entries = vendor ? lutsForVendor(lutCatalog, vendor) : [];
    for (const entry of entries) {
      const opt = document.createElement('option');
      opt.value = entry.path;
      opt.textContent = entry.name;
      lutPickSelect.appendChild(opt);
    }
    lutPickSelect.disabled = !vendor || applyingLut;
    if (previous && [...lutPickSelect.options].some((o) => o.value === previous)) {
      lutPickSelect.value = previous;
    } else {
      lutPickSelect.value = '';
    }
  };

  const populateVendors = (selectedPath: string | null) => {
    if (!lutVendorSelect || !lutCatalog) return;
    const current = findLutByPath(lutCatalog, selectedPath);
    lutVendorSelect.innerHTML = '<option value="">—</option>';
    for (const vendor of lutCatalog.vendors) {
      const opt = document.createElement('option');
      opt.value = vendor;
      opt.textContent = vendor;
      lutVendorSelect.appendChild(opt);
    }
    lutVendorSelect.disabled = applyingLut;
    lutVendorSelect.value = current?.vendor ?? '';
    populateLutPick(lutVendorSelect.value, selectedPath);
  };

  const applyLutSelection = async (path: string | null) => {
    const token = ++lutLoadToken;
    applyingLut = true;
    if (lutVendorSelect) lutVendorSelect.disabled = true;
    if (lutPickSelect) lutPickSelect.disabled = true;
    setLutStatus(path ? 'Loading LUT…' : '');

    try {
      await applyGradeLutToPostFX(postFX, path, grade.lut.size);
      if (token !== lutLoadToken) return;
      if (path) {
        grade.lut.enabled = true;
        if (lutEnabled) lutEnabled.checked = true;
        const entry = lutCatalog ? findLutByPath(lutCatalog, path) : undefined;
        setLutStatus(entry ? `Active: ${entry.id}` : 'LUT loaded');
      } else {
        setLutStatus('No LUT');
      }
    } catch (err) {
      if (token !== lutLoadToken) return;
      const message = err instanceof Error ? err.message : 'LUT load failed';
      setLutStatus(message);
      console.warn('[grade] Dev LUT load failed:', err);
    } finally {
      if (token === lutLoadToken) {
        applyingLut = false;
        if (lutCatalog) populateVendors(grade.lut.path);
      }
    }
  };

  void fetchGradeLutCatalog()
    .then((manifest) => {
      lutCatalog = manifest;
      populateVendors(grade.lut.path);
      setLutStatus(
        manifest.luts.length > 0
          ? `${manifest.luts.length} LUTs in ${manifest.vendors.length} vendors`
          : 'No .cube files found under public/textures/grade/',
      );
    })
    .catch((err) => {
      console.warn('[grade] LUT catalog unavailable:', err);
      if (lutVendorSelect) {
        lutVendorSelect.innerHTML = '<option value="">Unavailable</option>';
        lutVendorSelect.disabled = true;
      }
      if (lutPickSelect) lutPickSelect.disabled = true;
      setLutStatus('Could not load grade LUT catalog (dev server running?)');
    });

  let onLutVendorChange: (() => void) | null = null;
  if (lutVendorSelect) {
    onLutVendorChange = () => {
      populateLutPick(lutVendorSelect.value, null);
      setLutStatus(lutVendorSelect.value ? 'Pick a LUT' : 'No LUT');
    };
    lutVendorSelect.addEventListener('change', onLutVendorChange);
  }

  let onLutPickChange: (() => void) | null = null;
  if (lutPickSelect) {
    onLutPickChange = () => {
      const path = lutPickSelect.value || null;
      void applyLutSelection(path);
    };
    lutPickSelect.addEventListener('change', onLutPickChange);
  }

  const disposers: (() => void)[] = [];
  for (const s of COHESION_SPECS) {
    disposers.push(
      bindRange(_panel, s.id, `${s.id}-out`, s.format, (v) => {
        s.write(cohesion, v);
      }),
    );
  }
  syncSpecs(_panel, COHESION_SPECS, (s) => (s as CohesionSpec).read(cohesion));

  for (const s of GRADE_SPECS) {
    disposers.push(
      bindRange(_panel, s.id, `${s.id}-out`, s.format, (v) => {
        s.write(grade, v);
      }),
    );
  }
  syncSpecs(_panel, GRADE_SPECS, (s) => (s as GradeSpec).read(grade));

  let onEnabledChange: (() => void) | null = null;
  if (enabled) {
    onEnabledChange = () => {
      cohesion.enabled = enabled.checked;
    };
    enabled.addEventListener('change', onEnabledChange);
  }

  let onGradeEnabledChange: (() => void) | null = null;
  if (gradeEnabled) {
    onGradeEnabledChange = () => {
      grade.enabled = gradeEnabled.checked;
    };
    gradeEnabled.addEventListener('change', onGradeEnabledChange);
  }

  let onLutEnabledChange: (() => void) | null = null;
  if (lutEnabled) {
    onLutEnabledChange = () => {
      grade.lut.enabled = lutEnabled.checked;
    };
    lutEnabled.addEventListener('change', onLutEnabledChange);
  }

  const resetBtn = _panel.querySelector('#dev-cohesion-reset') as HTMLButtonElement | null;
  let onReset: (() => void) | null = null;
  if (resetBtn) {
    onReset = () => {
      resetPostFxCohesionDev(cohesion);
      if (enabled) enabled.checked = cohesion.enabled;
      syncSpecs(_panel, COHESION_SPECS, (s) => (s as CohesionSpec).read(cohesion));
    };
    resetBtn.addEventListener('click', onReset);
  }

  const gradeResetBtn = _panel.querySelector('#dev-grade-reset') as HTMLButtonElement | null;
  let onGradeReset: (() => void) | null = null;
  if (gradeResetBtn) {
    onGradeReset = () => {
      resetPostFxGradeDev(grade);
      if (gradeEnabled) gradeEnabled.checked = grade.enabled;
      if (lutEnabled) lutEnabled.checked = grade.lut.enabled;
      syncSpecs(_panel, GRADE_SPECS, (s) => (s as GradeSpec).read(grade));
      populateVendors(grade.lut.path);
      void applyLutSelection(grade.lut.path);
    };
    gradeResetBtn.addEventListener('click', onGradeReset);
  }

  const showFps = _panel.querySelector('#dev-show-fps') as HTMLInputElement | null;
  let onFpsChange: (() => void) | null = null;
  if (showFps) {
    showFps.checked = devSettings.showFpsCounter;
    onFpsChange = () => setFpsCounterEnabled(showFps.checked);
    showFps.addEventListener('change', onFpsChange);
  }

  return () => {
    for (const d of disposers) d();
    if (enabled && onEnabledChange) enabled.removeEventListener('change', onEnabledChange);
    if (gradeEnabled && onGradeEnabledChange) {
      gradeEnabled.removeEventListener('change', onGradeEnabledChange);
    }
    if (lutEnabled && onLutEnabledChange)
      lutEnabled.removeEventListener('change', onLutEnabledChange);
    if (lutVendorSelect && onLutVendorChange) {
      lutVendorSelect.removeEventListener('change', onLutVendorChange);
    }
    if (lutPickSelect && onLutPickChange)
      lutPickSelect.removeEventListener('change', onLutPickChange);
    if (resetBtn && onReset) resetBtn.removeEventListener('click', onReset);
    if (gradeResetBtn && onGradeReset) gradeResetBtn.removeEventListener('click', onGradeReset);
    if (showFps && onFpsChange) showFps.removeEventListener('change', onFpsChange);
  };
}
