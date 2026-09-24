// src/cloud-designer/main-clouds.ts — DEV cloud designer bootstrap (World lane shell)

import { createCloudDesignerShell } from './CloudDesignerShell';
import { createCloudDesignerSession } from './createCloudDesignerSession';

if (!import.meta.env.DEV) {
  document.body.innerHTML =
    '<p style="color:#c8bfb0;font-family:Georgia,serif;padding:2em">Cloud designer is only available in development builds.</p>';
  throw new Error('Cloud designer requires DEV mode');
}

let session: Awaited<ReturnType<typeof createCloudDesignerSession>> | null = null;
let shell: ReturnType<typeof createCloudDesignerShell> | null = null;

function disposeBootstrap(): void {
  session?.dispose();
  session = null;
  shell?.dispose();
  shell = null;
}

window.addEventListener('pagehide', () => {
  disposeBootstrap();
});

async function main(): Promise<void> {
  const host = document.getElementById('clouds-app');
  if (!host) {
    throw new Error('Missing #clouds-app');
  }

  shell = createCloudDesignerShell(host);
  session = await createCloudDesignerSession(shell);
  document.getElementById('loading')?.classList.add('hidden');
}

void main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = message;
  console.error(err);
});
