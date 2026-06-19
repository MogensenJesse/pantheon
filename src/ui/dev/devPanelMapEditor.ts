// src/ui/dev/devPanelMapEditor.ts — map editor link + play-mode map switcher (DEV only)
import { fetchMapManifest, populateMapListSelect } from '../../map/MapIO';
import { getPlayMapId, setPlayMapId } from '../../map/playMapSelection';
import { mountSection } from './bindRange';

const EDITOR_HREF = '/editor.html';

export function initDevPanelMapEditor(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-map-editor',
    title: 'Maps',
    open: false,
    body: `
      <p class="dev-hint">Play mode loads authored maps from <code>public/maps/</code>. Maps need <code>playerStart</code> and/or orbs. Reload after save or switch.</p>
      <label class="dev-row">
        <span>Play map</span>
        <select id="dev-play-map"></select>
      </label>
      <div class="dev-actions">
        <a class="dev-link" href="${EDITOR_HREF}" target="_blank" rel="noopener noreferrer">Open map editor</a>
      </div>
      <p class="dev-hint">Changing play map reloads the page. Add ids to <code>manifest.json</code> for the startup chooser.</p>
    `,
  });
  if (!body) return () => {};

  const playMapSelect = panel.querySelector<HTMLSelectElement>('#dev-play-map');
  if (!playMapSelect) return () => {};

  const activeId = getPlayMapId();

  const fillOptions = (ids: string[]) => {
    populateMapListSelect(playMapSelect, ids, '— select map —');
    if (activeId && ids.includes(activeId)) {
      playMapSelect.value = activeId;
    }
  };

  void fetchMapManifest().then(fillOptions);

  const onPlayMapChange = () => {
    const next = playMapSelect.value;
    if (!next || next === activeId) return;
    setPlayMapId(next);
    location.reload();
  };

  playMapSelect.addEventListener('change', onPlayMapChange);

  return () => {
    playMapSelect.removeEventListener('change', onPlayMapChange);
  };
}
