// src/editor/ui/TerrainPackImportDialog.ts — multi-PNG terrain pack import
import {
  classifyTerrainPackFile,
  isExrTerrainFile,
  isPngTerrainFile,
  type TerrainPackRole,
} from '../../map/authoring/classifyTerrainPackFile';
import { type DecodedPngTerrain, decodePngTerrain } from '../../map/authoring/decodePngTerrain';
import {
  PACK_HEIGHT_MAX_M_DEFAULT,
  PACK_HEIGHT_MIN_M_DEFAULT,
  PACK_WATER_LEVEL_M_DEFAULT,
} from '../../map/authoring/importTerrainPack';

export interface TerrainPackDialogAssignment {
  height?: File;
  slope?: File;
  convex?: File;
  normal?: File;
  diffuse?: File;
}

export interface TerrainPackDialogResult {
  files: TerrainPackDialogAssignment;
  decoded: {
    height?: DecodedPngTerrain;
    convex?: DecodedPngTerrain;
  };
  minM: number;
  maxM: number;
  waterLevelM: number;
  flipY: boolean;
}

function classifyFile(file: File): TerrainPackRole {
  return classifyTerrainPackFile(file.name);
}

function assignFiles(files: File[]): TerrainPackDialogAssignment {
  const assigned: TerrainPackDialogAssignment = {};
  for (const file of files) {
    const role = classifyFile(file);
    if (role === 'unknown' || role === 'diffuse') continue;
    if (!assigned[role]) assigned[role] = file;
  }
  return assigned;
}

function formatMeta(decoded: DecodedPngTerrain | undefined): string {
  if (!decoded) return '—';
  return `${decoded.width}×${decoded.height}, ${decoded.channels} ch, ${decoded.depth}-bit`;
}

export function openTerrainPackImportDialog(
  parent: HTMLElement = document.body,
): Promise<TerrainPackDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'editor-modal-overlay';
    overlay.innerHTML = `
      <form class="editor-modal" role="dialog" aria-labelledby="terrain-pack-title">
        <h2 id="terrain-pack-title">Import terrain pack</h2>
        <p class="editor-hint-copy">
          Select the pack PNGs together. Height is reconstructed from Min/Max metres
          (not min–max normalized). Slope and normal maps are ignored — sculpting uses
          height-derived slope and normals. Convex is optional ridge shading. EXR height
          is still accepted as a height-only import.
        </p>
        <label class="editor-file-pick">
          <span>Source files</span>
          <input type="file" id="terrain-pack-files" accept=".png,.PNG,.exr" multiple />
        </label>
        <table class="editor-pack-assign">
          <thead><tr><th>Role</th><th>File</th><th>Metadata</th></tr></thead>
          <tbody>
            <tr data-role="height"><td>Height</td><td data-file>—</td><td data-meta>—</td></tr>
            <tr data-role="slope"><td>Slope (unused)</td><td data-file>—</td><td data-meta>—</td></tr>
            <tr data-role="convex"><td>Convex</td><td data-file>—</td><td data-meta>—</td></tr>
            <tr data-role="normal"><td>Normal (unused)</td><td data-file>—</td><td data-meta>—</td></tr>
          </tbody>
        </table>
        <p class="editor-pack-status" id="terrain-pack-status"></p>
        <label class="editor-range">Min elevation (m)
          <input type="number" id="terrain-pack-min" step="0.01" value="${PACK_HEIGHT_MIN_M_DEFAULT}" required />
        </label>
        <label class="editor-range">Max elevation (m)
          <input type="number" id="terrain-pack-max" step="0.01" value="${PACK_HEIGHT_MAX_M_DEFAULT}" required />
        </label>
        <label class="editor-range">Total height (m)
          <input type="number" id="terrain-pack-total" step="0.01"
            value="${PACK_HEIGHT_MAX_M_DEFAULT - PACK_HEIGHT_MIN_M_DEFAULT}" />
        </label>
        <label class="editor-range">Water level (m)
          <input type="number" id="terrain-pack-water" step="0.01" value="${PACK_WATER_LEVEL_M_DEFAULT}" />
        </label>
        <label class="editor-check">
          <input type="checkbox" id="terrain-pack-flip-y" />
          <span>Flip source Y</span>
        </label>
        <div class="editor-modal-actions">
          <button type="button" id="terrain-pack-cancel" class="editor-secondary-btn">Cancel</button>
          <button type="submit" id="terrain-pack-ok" class="editor-primary-btn" disabled>Import</button>
        </div>
      </form>
    `;
    parent.appendChild(overlay);

    const form = overlay.querySelector('form')!;
    const fileInput = overlay.querySelector<HTMLInputElement>('#terrain-pack-files')!;
    const minInput = overlay.querySelector<HTMLInputElement>('#terrain-pack-min')!;
    const maxInput = overlay.querySelector<HTMLInputElement>('#terrain-pack-max')!;
    const totalInput = overlay.querySelector<HTMLInputElement>('#terrain-pack-total')!;
    const waterInput = overlay.querySelector<HTMLInputElement>('#terrain-pack-water')!;
    const flipY = overlay.querySelector<HTMLInputElement>('#terrain-pack-flip-y')!;
    const status = overlay.querySelector<HTMLElement>('#terrain-pack-status')!;
    const okBtn = overlay.querySelector<HTMLButtonElement>('#terrain-pack-ok')!;

    let assigned: TerrainPackDialogAssignment = {};
    let decoded: TerrainPackDialogResult['decoded'] = {};
    let closed = false;

    const close = (result: TerrainPackDialogResult | null) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      resolve(result);
    };

    const row = (role: string) => overlay.querySelector<HTMLElement>(`tr[data-role="${role}"]`)!;

    const syncTotalFromMinMax = () => {
      const minM = Number(minInput.value);
      const maxM = Number(maxInput.value);
      if (Number.isFinite(minM) && Number.isFinite(maxM)) {
        totalInput.value = String(maxM - minM);
      }
    };

    const refreshRows = () => {
      for (const role of ['height', 'slope', 'convex', 'normal'] as const) {
        const file = assigned[role];
        const meta = role === 'height' || role === 'convex' ? decoded[role] : undefined;
        row(role).querySelector('[data-file]')!.textContent = file?.name ?? '—';
        row(role).querySelector('[data-meta]')!.textContent = file
          ? isExrTerrainFile(file.name)
            ? 'EXR'
            : role === 'slope' || role === 'normal'
              ? 'ignored'
              : formatMeta(meta)
          : '—';
      }
      const height = assigned.height;
      const ready = Boolean(height);
      okBtn.disabled = !ready;
      const notes: string[] = [];
      if (!height) notes.push('Height map is required.');
      if (height && isPngTerrainFile(height.name) && decoded.height?.depth === 8) {
        notes.push('Height PNG is 8-bit — prefer 16-bit to avoid terracing.');
      }
      if (assigned.slope || assigned.normal) {
        notes.push('Slope and normal maps are ignored (derived from height after sculpt).');
      }
      if (decoded.height && decoded.convex) {
        if (
          decoded.height.width !== decoded.convex.width ||
          decoded.height.height !== decoded.convex.height
        ) {
          notes.push('Convex map size must match height.');
          okBtn.disabled = true;
        }
      }
      if (height && isExrTerrainFile(height.name)) {
        notes.push('EXR height uses the existing stretch/remap importer (aux PNGs ignored).');
        minInput.disabled = true;
        maxInput.disabled = true;
        totalInput.disabled = true;
      } else {
        minInput.disabled = false;
        maxInput.disabled = false;
        totalInput.disabled = false;
      }
      status.textContent = notes.join(' ');
    };

    fileInput.addEventListener('change', async () => {
      const files = [...(fileInput.files ?? [])];
      assigned = assignFiles(files);
      decoded = {};
      for (const role of ['height', 'convex'] as const) {
        const file = assigned[role];
        if (!file || !isPngTerrainFile(file.name)) continue;
        try {
          decoded[role] = decodePngTerrain(await file.arrayBuffer());
        } catch (err) {
          status.textContent = err instanceof Error ? err.message : `Failed to decode ${file.name}`;
          okBtn.disabled = true;
          return;
        }
      }
      refreshRows();
    });

    minInput.addEventListener('input', syncTotalFromMinMax);
    maxInput.addEventListener('input', syncTotalFromMinMax);
    totalInput.addEventListener('input', () => {
      const minM = Number(minInput.value);
      const total = Number(totalInput.value);
      if (Number.isFinite(minM) && Number.isFinite(total)) {
        maxInput.value = String(minM + total);
      }
    });

    overlay.querySelector('#terrain-pack-cancel')!.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!assigned.height) return;
      const minM = Number(minInput.value);
      const maxM = Number(maxInput.value);
      const waterLevelM = Number(waterInput.value);
      if (!Number.isFinite(minM) || !Number.isFinite(maxM) || maxM <= minM) {
        status.textContent = 'Min elevation must be less than Max elevation.';
        return;
      }
      if (!Number.isFinite(waterLevelM)) {
        status.textContent = 'Water level must be a finite number.';
        return;
      }
      close({
        files: assigned,
        decoded,
        minM,
        maxM,
        waterLevelM,
        flipY: flipY.checked,
      });
    });

    refreshRows();
  });
}
