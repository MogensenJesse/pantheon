// src/optimizer/main-optimizer.ts — DEV-only asset optimizer bootstrap
import '../editor/ui/editor.css';
import './optimizer.css';

import { checkWebGPUSupport, getWebGPUErrorMessage } from '../rendering/webgpuCapability';
import { createOptimizerSession } from './OptimizerSession';

if (!import.meta.env.DEV) {
  document.body.innerHTML =
    '<p style="color:#c8bfb0;font-family:Georgia,serif;padding:2em">Asset optimizer is only available in development builds.</p>';
  throw new Error('Optimizer requires DEV mode');
}

let session: Awaited<ReturnType<typeof createOptimizerSession>> | null = null;

window.addEventListener('pagehide', () => {
  session?.dispose();
  session = null;
});

async function main(): Promise<void> {
  if (!(await checkWebGPUSupport())) {
    document.body.appendChild(getWebGPUErrorMessage());
    throw new Error('WebGPU not supported');
  }
  const host = document.getElementById('optimizer-app');
  if (!host) throw new Error('Missing #optimizer-app');
  session = await createOptimizerSession(host);
  document.getElementById('loading')?.classList.add('hidden');
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = message;
  console.error(err);
});
