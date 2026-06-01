// src/ui/MapSelectScreen.ts — startup map chooser from public/maps/manifest.json
import { fetchMapSummaries } from '../map/MapIO';
import { setPlayMapId } from '../map/playMapSelection';

export function ensurePlayMapSelected(): Promise<void> {
  const overlay = document.getElementById('map-select');
  if (!overlay) return Promise.resolve();

  return new Promise((resolve) => {
    const listEl = overlay.querySelector<HTMLElement>('#map-select-list');
    const statusEl = overlay.querySelector<HTMLElement>('#map-select-status');
    if (!listEl || !statusEl) {
      resolve();
      return;
    }

    overlay.classList.add('visible');
    statusEl.textContent = 'Loading maps…';
    listEl.replaceChildren();

    void fetchMapSummaries()
      .then((ids) => {
        if (ids.length === 0) {
          statusEl.textContent =
            'No maps found. Add map ids to public/maps/manifest.json and JSON files under public/maps/.';
          return;
        }

        statusEl.textContent = 'Choose a map to explore';
        for (const id of ids) {
          listEl.appendChild(
            createMapCard(id, () => {
              setPlayMapId(id);
              overlay.classList.remove('visible');
              resolve();
            }),
          );
        }
      })
      .catch((err) => {
        console.error('[maps] Manifest load failed:', err);
        statusEl.textContent = 'Failed to load map list. Check public/maps/manifest.json.';
      });
  });
}

function createMapCard(id: string, onSelect: () => void): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'map-select-card';
  card.textContent = id;
  card.addEventListener('click', onSelect);
  return card;
}
