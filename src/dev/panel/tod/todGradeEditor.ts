// src/dev/panel/tod/todGradeEditor.ts — Time-of-day stop editor: colour grade and LUT
import type { TodStopId } from '../../../config/visual/tod';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/settings';
import { applyGradeLutToPostFX } from '../../../rendering/postfx/applyGradeLut';
import {
  fetchGradeLutCatalog,
  findLutByPath,
  type GradeLutManifest,
  lutsForVendor,
} from '../../../rendering/postfx/gradeLutCatalog';
import { resetPostFxGradeDev } from '../../../rendering/postfx/postfxGrade';
import {
  bindCheckbox,
  bindColor,
  bindRange,
  injectRangeRows,
  type RangeSpec,
  rangeRowHtml,
  subsectionHtml,
  syncColor,
  syncSlider,
} from '../../bindRange';
import type { TodEditor, TodEditorEnv } from './todEditor';

const GRADE_REGIONS = ['shadows', 'midtones', 'highlights'] as const;
type GradeRegionId = (typeof GRADE_REGIONS)[number];
const GRADE_REGION_LABELS: Record<GradeRegionId, string> = {
  shadows: 'Shadows',
  midtones: 'Midtones',
  highlights: 'Highlights',
};
const GRADE_REGION_NUM_FIELDS = [
  { key: 'saturation' as const, label: 'Saturation', min: 0.5, max: 1.5, step: 0.01 },
  { key: 'contrast' as const, label: 'Contrast', min: 0.5, max: 1.5, step: 0.01 },
];

type GradeStop = (typeof devSettings.postfx.grade.stops)[TodStopId];
type GradeRegion = GradeStop[GradeRegionId];

const GRADE0 = VISUAL.postfx.grade.stops.goldenHour;

const gradeWarmthSpec: RangeSpec = {
  id: 'dev-tod-grade-warmth',
  label: 'Warmth',
  min: -0.2,
  max: 0.4,
  step: 0.01,
  defaultValue: GRADE0.warmth,
  format: (v) => v.toFixed(2),
};

const lutStrengthSpec: RangeSpec = {
  id: 'dev-tod-lut-strength',
  label: 'LUT strength',
  min: 0,
  max: 1,
  step: 0.01,
  defaultValue: GRADE0.lut.strength,
  format: (v) => v.toFixed(2),
};

/** One slider of a grade region (saturation, contrast, lift r/g/b) and where it lives in the stop. */
interface GradeRow {
  region: GradeRegionId;
  spec: RangeSpec;
  get: (r: GradeRegion) => number;
  set: (r: GradeRegion, v: number) => void;
}

const GRADE_ROWS: GradeRow[] = GRADE_REGIONS.flatMap((region) => [
  ...GRADE_REGION_NUM_FIELDS.map((f) => ({
    region,
    spec: {
      id: `dev-tod-grade-${region}-${f.key}`,
      label: f.label,
      min: f.min,
      max: f.max,
      step: f.step,
      defaultValue: GRADE0[region][f.key],
      format: (v: number) => v.toFixed(2),
    },
    get: (r: GradeRegion) => r[f.key],
    set: (r: GradeRegion, v: number) => {
      r[f.key] = v;
    },
  })),
  ...(['r', 'g', 'b'] as const).map((ch) => ({
    region,
    spec: {
      id: `dev-tod-grade-${region}-lift-${ch}`,
      label: `Lift ${ch.toUpperCase()}`,
      min: -0.2,
      max: 0.2,
      step: 0.005,
      defaultValue: GRADE0[region].lift[ch],
      format: (v: number) => v.toFixed(3),
    },
    get: (r: GradeRegion) => r.lift[ch],
    set: (r: GradeRegion, v: number) => {
      r.lift[ch] = v;
    },
  })),
]);

/** The markup of the Grade + LUT subsection. */
export function todGradeHtml(): string {
  return subsectionHtml(
    'Grade + LUT',
    `<p class="dev-hint">Master off bypasses procedural grade. Sat/contrast/lift are per shadows / midtones / highlights. Perf <strong>Disable grade</strong> kills both.</p>
        <label class="dev-row dev-row-check"><span>Grade enabled</span><input type="checkbox" id="dev-tod-grade-enabled" /></label>
        <label class="dev-row"><span>Warmth tint</span><input type="color" id="dev-tod-grade-warmth-tint" /></label>
        <div id="dev-tod-grade-warmth-row"></div>
        <div id="dev-tod-grade-regions"></div>
        <label class="dev-row dev-row-check"><span>LUT enabled</span><input type="checkbox" id="dev-tod-lut-enabled" /></label>
        ${rangeRowHtml(lutStrengthSpec)}
        <label class="dev-row"><span>LUT vendor</span><select id="dev-tod-lut-vendor" disabled><option value="">Loading…</option></select></label>
        <label class="dev-row"><span>LUT</span><select id="dev-tod-lut-pick" disabled><option value="">None</option></select></label>
        <p id="dev-tod-lut-status" class="dev-hint"></p>`,
  );
}

export function createTodGradeEditor(env: TodEditorEnv): TodEditor {
  const { panel, body, ctx, stop } = env;
  const grade = () => devSettings.postfx.grade.stops[stop()];

  injectRangeRows(body.querySelector('#dev-tod-grade-warmth-row')!, [gradeWarmthSpec]);
  const regionsHost = body.querySelector('#dev-tod-grade-regions')!;
  for (const region of GRADE_REGIONS) {
    regionsHost.insertAdjacentHTML(
      'beforeend',
      subsectionHtml(GRADE_REGION_LABELS[region], `<div id="dev-tod-grade-${region}-rows"></div>`),
    );
    injectRangeRows(
      regionsHost.querySelector(`#dev-tod-grade-${region}-rows`)!,
      GRADE_ROWS.filter((r) => r.region === region).map((r) => r.spec),
    );
  }

  // --- LUT catalog (selected stop) ---
  const lutVendorSelect = panel.querySelector('#dev-tod-lut-vendor') as HTMLSelectElement | null;
  const lutPickSelect = panel.querySelector('#dev-tod-lut-pick') as HTMLSelectElement | null;
  const lutStatus = panel.querySelector('#dev-tod-lut-status') as HTMLParagraphElement | null;
  let lutCatalog: GradeLutManifest | null = null;
  let lutLoadToken = 0;
  let applyingLut = false;

  const setLutStatus = (msg: string) => {
    if (lutStatus) lutStatus.textContent = msg;
  };

  const populateLutPick = (vendor: string, selectedPath: string | null) => {
    if (!lutPickSelect || !lutCatalog) return;
    const previous = selectedPath ?? lutPickSelect.value;
    lutPickSelect.innerHTML = '<option value="">None</option>';
    for (const entry of vendor ? lutsForVendor(lutCatalog, vendor) : []) {
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
    if (!ctx) return;
    const token = ++lutLoadToken;
    applyingLut = true;
    if (lutVendorSelect) lutVendorSelect.disabled = true;
    if (lutPickSelect) lutPickSelect.disabled = true;
    setLutStatus(path ? 'Loading LUT…' : '');
    try {
      await applyGradeLutToPostFX(ctx.postFX, path, grade().lut.size, stop());
      if (token !== lutLoadToken) return;
      if (path) {
        grade().lut.enabled = true;
        const el = panel.querySelector('#dev-tod-lut-enabled') as HTMLInputElement | null;
        if (el) el.checked = true;
        const entry = lutCatalog ? findLutByPath(lutCatalog, path) : undefined;
        setLutStatus(entry ? `Active: ${entry.id}` : 'LUT loaded');
      } else {
        setLutStatus('No LUT');
      }
    } catch (err) {
      if (token !== lutLoadToken) return;
      setLutStatus(err instanceof Error ? err.message : 'LUT load failed');
    } finally {
      if (token === lutLoadToken) {
        applyingLut = false;
        if (lutCatalog) populateVendors(grade().lut.path);
      }
    }
  };

  void fetchGradeLutCatalog()
    .then((manifest) => {
      lutCatalog = manifest;
      populateVendors(grade().lut.path);
    })
    .catch(() => setLutStatus('LUT catalog unavailable'));

  const disposers: Array<() => void> = [];

  disposers.push(
    bindCheckbox(
      panel,
      'dev-tod-grade-enabled',
      () => devSettings.postfx.grade.enabled,
      (v) => {
        devSettings.postfx.grade.enabled = v;
      },
    ),
    bindColor(panel, 'dev-tod-grade-warmth-tint', (hex) => {
      grade().warmthTint = hex;
    }),
    bindRange(
      panel,
      gradeWarmthSpec.id,
      `${gradeWarmthSpec.id}-out`,
      gradeWarmthSpec.format,
      (v) => {
        grade().warmth = v;
      },
    ),
  );
  for (const row of GRADE_ROWS) {
    disposers.push(
      bindRange(panel, row.spec.id, `${row.spec.id}-out`, row.spec.format, (v) => {
        row.set(grade()[row.region], v);
      }),
    );
  }
  disposers.push(
    bindCheckbox(
      panel,
      'dev-tod-lut-enabled',
      () => grade().lut.enabled,
      (v) => {
        grade().lut.enabled = v;
      },
    ),
    bindRange(
      panel,
      lutStrengthSpec.id,
      `${lutStrengthSpec.id}-out`,
      lutStrengthSpec.format,
      (v) => {
        grade().lut.strength = v;
      },
    ),
  );
  const onLutVendor = () => {
    populateLutPick(lutVendorSelect?.value ?? '', null);
  };
  const onLutPick = () => {
    void applyLutSelection(lutPickSelect?.value || null);
  };
  lutVendorSelect?.addEventListener('change', onLutVendor);
  lutPickSelect?.addEventListener('change', onLutPick);

  return {
    sync: () => {
      const g = grade();
      const gradeEnabled = panel.querySelector('#dev-tod-grade-enabled') as HTMLInputElement | null;
      if (gradeEnabled) gradeEnabled.checked = devSettings.postfx.grade.enabled;
      syncColor(panel, 'dev-tod-grade-warmth-tint', g.warmthTint);
      syncSlider(
        panel,
        gradeWarmthSpec.id,
        `${gradeWarmthSpec.id}-out`,
        g.warmth,
        gradeWarmthSpec.format,
      );
      for (const row of GRADE_ROWS) {
        syncSlider(
          panel,
          row.spec.id,
          `${row.spec.id}-out`,
          row.get(g[row.region]),
          row.spec.format,
        );
      }
      const lutEnabled = panel.querySelector('#dev-tod-lut-enabled') as HTMLInputElement | null;
      if (lutEnabled) lutEnabled.checked = g.lut.enabled;
      syncSlider(
        panel,
        lutStrengthSpec.id,
        `${lutStrengthSpec.id}-out`,
        g.lut.strength,
        lutStrengthSpec.format,
      );
      populateVendors(g.lut.path);
    },
    reset: () => {
      resetPostFxGradeDev(devSettings.postfx.grade);
    },
    dispose: () => {
      for (const fn of disposers) fn();
      lutVendorSelect?.removeEventListener('change', onLutVendor);
      lutPickSelect?.removeEventListener('change', onLutPick);
    },
  };
}
