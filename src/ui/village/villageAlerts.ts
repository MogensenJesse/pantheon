// src/ui/village/villageAlerts.ts — toasts for what hunger does to the village
//
//   the larder runs out, everyone grows weak, someone dies, food comes back. Each stage says so once;
//   deaths merge into a counter while several come close together.

import { bus } from '../../core/EventBus';
import { notify } from '../kit';

export function initVillageAlerts(): () => void {
  const offHunger = bus.on('village:hunger', ({ stage }) => {
    if (stage === 'empty') {
      notify({
        key: 'hunger',
        text: 'The village has run out of food.',
        kind: 'warning',
        priority: 5,
      });
    } else if (stage === 'weak') {
      notify({
        key: 'hunger',
        text: 'Hunger has made the villagers weak. Only those who gather food still work.',
        kind: 'danger',
        priority: 8,
      });
    } else {
      notify({ key: 'hunger-over', text: 'The village has food again.', kind: 'success' });
    }
  });
  const offDying = bus.on('village:villagerDying', () => {
    notify({
      key: 'death',
      text: 'A villager has died of hunger.',
      kind: 'danger',
      priority: 10,
      durationMs: 10000,
    });
  });
  return () => {
    offHunger();
    offDying();
  };
}
