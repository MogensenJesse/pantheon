// src/dev/runtime/devHook.ts — puts an object on `window` for the console (DEV only)

/** Installs `window[name] = api` and returns the function that removes it again. */
export function installDevHook(name: string, api: unknown): () => void {
  const win = window as unknown as Record<string, unknown>;
  win[name] = api;
  return () => {
    delete win[name];
  };
}
