// src/bootstrap/askForSave.ts — what this visit does with the saves: the address says, or the start screen asks

import { resolveLaunch, type SaveRequest } from '../save/saveRequest';
import type { SaveStore } from '../save/store';
import type { PlayLoadingScreen } from '../ui/PlayLoadingScreen';
import { showStartScreen } from '../ui/saves';

/** Before anything heavy loads: a new game, a continue or a load, unless the address already says (`saveRequest.ts`). */
export async function askForSave(
  loading: PlayLoadingScreen,
  store: SaveStore,
): Promise<SaveRequest> {
  const launch = resolveLaunch(window.location.search, import.meta.env.DEV);
  if (launch.kind === 'request') return launch.request;
  loading.hide();
  const request = await showStartScreen({
    listSlots: () => store.list(),
    deleteSlot: (id) => store.remove(id),
  });
  loading.show();
  return request;
}
