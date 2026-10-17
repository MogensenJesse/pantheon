// src/ui/abilities/abilityUi.ts — the bar and the radial menu together, fed by one source of powers

import type { AbilityView } from '../../abilities/abilityView';
import { refusalText } from '../../abilities/abilityView';
import type { CastResult } from '../../abilities/caster';
import { notify } from '../kit';
import { createAbilityBar } from './abilityBar';
import { createRadialMenu } from './radialMenu';

export interface AbilityUiDeps {
  /** The powers the player has. */
  list: () => AbilityView[];
  /** Casts one at what the orb is aimed at. */
  cast: (id: string) => CastResult;
  setLookBlocked: (blocked: boolean) => void;
  /** Key held to open the radial menu. */
  code?: string;
}

export function initAbilityUi(deps: AbilityUiDeps): { dispose: () => void; isOpen: () => boolean } {
  const bar = createAbilityBar({ list: deps.list });
  const radial = createRadialMenu({
    list: deps.list,
    setLookBlocked: deps.setLookBlocked,
    code: deps.code ?? 'KeyQ',
    cast: (id) => {
      const result = deps.cast(id);
      if (!result.ok) {
        notify({ text: refusalText(result.reason), kind: 'warning', key: 'cast-refusal' });
      }
    },
  });
  return {
    isOpen: radial.isOpen,
    dispose: () => {
      radial.dispose();
      bar.dispose();
    },
  };
}
