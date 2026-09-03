// src/dev/panel/devPanelPostFx.ts — DEV post-FX grade
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../../rendering/PostFX';
import { applyGradeLutToPostFX } from '../../rendering/postfx/applyGradeLut';
import {
  fetchGradeLutCatalog,
  findLutByPath,
  type GradeLutManifest,
  lutsForVendor,
} from '../../rendering/postfx/gradeLutCatalog';
import { resetPostFxGradeDev } from '../../rendering/postfx/postfxGrade';
import { bindCheckbox, bindRange, injectRangeRows, mountSection, syncSpecs } from '../bindRange';
import { GRADE_SPECS, type GradeSpec } from './devPanelPostFxSpecs';

export function initDevPanelPostFx(_panel: HTMLDivElement, postFX: PostFXContext): () => void {
  const body = mountSection(_panel, {
    hostId: 'dev-section-postfx',
    title: 'Post FX',
    open: false,
    body: `
      <p class="dev-hint"><strong>Color pipeline:</strong> exposure → Sky → Day cycle; glow → Bloom panel; grade/LUT → below. Toggle effects via the Perf panel.</p>
      <details class="dev-subsection">
        <summary>Grade</summary>
        <div class="dev-section-body">
          <p class="dev-hint">Procedural grade and LUT are independent — uncheck <strong>Grade enabled</strong> to keep the LUT. Use <strong>Other / Presetpro</strong> creative LUTs. Vendor log LUTs need a log shaper (not wired). Strength is LUT delta-blend intensity. Perf <strong>Disable grade</strong> bypasses both.</p>
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
    `,
  });
  if (!body) return () => {};

  const gradeHost = _panel.querySelector('#dev-grade-rows');
  if (gradeHost) injectRangeRows(gradeHost, GRADE_SPECS);

  const grade = devSettings.postfx.grade;

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
        const lutEnabledEl = _panel.querySelector(
          '#dev-grade-lut-enabled',
        ) as HTMLInputElement | null;
        if (lutEnabledEl) lutEnabledEl.checked = true;
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
  disposers.push(
    bindCheckbox(
      _panel,
      'dev-grade-enabled',
      () => grade.enabled,
      (v) => {
        grade.enabled = v;
      },
    ),
    bindCheckbox(
      _panel,
      'dev-grade-lut-enabled',
      () => grade.lut.enabled,
      (v) => {
        grade.lut.enabled = v;
      },
    ),
  );

  for (const s of GRADE_SPECS) {
    disposers.push(
      bindRange(_panel, s.id, `${s.id}-out`, s.format, (v) => {
        s.write(grade, v);
      }),
    );
  }
  syncSpecs(_panel, GRADE_SPECS, (s) => (s as GradeSpec).read(grade));

  const gradeResetBtn = _panel.querySelector('#dev-grade-reset') as HTMLButtonElement | null;
  let onGradeReset: (() => void) | null = null;
  if (gradeResetBtn) {
    onGradeReset = () => {
      resetPostFxGradeDev(grade);
      const gradeEnabledEl = _panel.querySelector('#dev-grade-enabled') as HTMLInputElement | null;
      const lutEnabledEl = _panel.querySelector(
        '#dev-grade-lut-enabled',
      ) as HTMLInputElement | null;
      if (gradeEnabledEl) gradeEnabledEl.checked = grade.enabled;
      if (lutEnabledEl) lutEnabledEl.checked = grade.lut.enabled;
      syncSpecs(_panel, GRADE_SPECS, (s) => (s as GradeSpec).read(grade));
      populateVendors(grade.lut.path);
      void applyLutSelection(grade.lut.path);
    };
    gradeResetBtn.addEventListener('click', onGradeReset);
  }

  return () => {
    for (const d of disposers) d();
    if (lutVendorSelect && onLutVendorChange) {
      lutVendorSelect.removeEventListener('change', onLutVendorChange);
    }
    if (lutPickSelect && onLutPickChange)
      lutPickSelect.removeEventListener('change', onLutPickChange);
    if (gradeResetBtn && onGradeReset) gradeResetBtn.removeEventListener('click', onGradeReset);
  };
}
