// src/dev/panel/devPanelPostFx.ts — DEV post-FX pointer (grade look → Time of day)
import type { PostFXContext } from '../../rendering/PostFX';
import { mountSection } from '../bindRange';

export function initDevPanelPostFx(_panel: HTMLDivElement, _postFX: PostFXContext): () => void {
  mountSection(_panel, {
    hostId: 'dev-section-postfx',
    title: 'Post FX',
    open: false,
    body: `
      <p class="dev-hint"><strong>Color pipeline:</strong> exposure / grade / LUT stop look → <strong>Time of day</strong> (includes master Grade enabled). Glow → Bloom panel. Toggle effects via the Perf panel.</p>
    `,
  });
  return () => {};
}
