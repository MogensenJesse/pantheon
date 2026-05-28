// src/ui/dev/devPanelMapEditor.ts — map editor link + play-mode terrain selector (DEV only)
import {
  fetchMapManifest,
  populateMapListSelect,
} from '../../map/MapIO';
import {
  getPlayMapId,
  PLAY_MAP_PROCEDURAL_VALUE,
  setPlayMapId,
} from '../../map/playMapSelection';
import { mountSection } from './bindRange';

const EDITOR_HREF = '/editor.html';

export function initDevPanelMapEditor(panel: HTMLDivElement): () => void {
  const body = mountSection(panel, {
    hostId: 'dev-section-map-editor',
    title: 'Maps',
    open: false,
    body: `
      <p class="dev-hint">Terrain-only maps: authored height/biomes, procedural landmarks/orbs/props off. Maps with <code>playerStart</code> or stone/landmark/orb markers use full authored gameplay — reload after save.</p>
      <label class="dev-row">
        <span>Play terrain</span>
        <select id="dev-play-map"></select>
      </label>
      <div class="dev-actions">
        <a class="dev-link" href="${EDITOR_HREF}" target="_blank" rel="noopener noreferrer">Open map editor</a>
      </div>
      <p class="dev-hint">Changing play terrain reloads the page. Save maps in the editor while <code>npm run dev</code> runs.</p>
    `,
  });
  if (!body) return () => {};

  const playMapSelect = panel.querySelector<HTMLSelectElement>('#dev-play-map');
  if (!playMapSelect) return () => {};

  const activeId = getPlayMapId();

  const fillOptions = (ids: string[]) => {
    const options = [PLAY_MAP_PROCEDURAL_VALUE, ...ids.filter((id) => id !== PLAY_MAP_PROCEDURAL_VALUE)];
    populateMapListSelect(playMapSelect, options, 'Procedural (default)');
    playMapSelect.value = activeId || PLAY_MAP_PROCEDURAL_VALUE;
  };

  void fetchMapManifest().then(fillOptions);

  const onPlayMapChange = () => {
    const next = playMapSelect.value;
    if (next === activeId || (next === PLAY_MAP_PROCEDURAL_VALUE && !activeId)) return;
    setPlayMapId(next);
    location.reload();
  };

  playMapSelect.addEventListener('change', onPlayMapChange);

  return () => {
    playMapSelect.removeEventListener('change', onPlayMapChange);
  };
}
