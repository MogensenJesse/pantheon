// src/optimizer/ui/OptimizerShell.ts — Needle-shaped chrome on editor tokens
export interface OptimizerShellSlots {
  root: HTMLElement;
  sidebar: HTMLElement;
  viewport: HTMLElement;
  canvas: HTMLCanvasElement;
  splitHandle: HTMLElement;
  labelLeft: HTMLElement;
  labelRight: HTMLElement;
}

export function createOptimizerShell(host: HTMLElement): OptimizerShellSlots {
  host.className = 'editor-app optimizer-app';
  host.hidden = false;
  host.innerHTML = `
    <div class="optimizer-body">
      <aside class="optimizer-sidebar editor-dock" data-slot="sidebar"></aside>
      <main class="optimizer-viewport" data-slot="viewport">
        <canvas id="optimizer-canvas" tabindex="0" role="img" aria-label="Asset optimizer viewport"></canvas>
        <div class="optimizer-split-handle" data-slot="split" role="separator" aria-orientation="vertical"></div>
        <div class="optimizer-label optimizer-label-left" data-slot="label-left">Original</div>
        <div class="optimizer-label optimizer-label-right" data-slot="label-right">Optimized</div>
      </main>
    </div>
  `;
  const canvas = host.querySelector<HTMLCanvasElement>('#optimizer-canvas');
  if (!canvas) throw new Error('Missing optimizer canvas');
  return {
    root: host,
    sidebar: host.querySelector('[data-slot="sidebar"]')!,
    viewport: host.querySelector('[data-slot="viewport"]')!,
    canvas,
    splitHandle: host.querySelector('[data-slot="split"]')!,
    labelLeft: host.querySelector('[data-slot="label-left"]')!,
    labelRight: host.querySelector('[data-slot="label-right"]')!,
  };
}
