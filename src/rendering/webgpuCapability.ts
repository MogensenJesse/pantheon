// src/rendering/webgpuCapability.ts — WebGPU support check (avoids three.js addon top-level await breaking Vite)

/** Mirrors three/addons/capabilities/WebGPU.js without module-level await. */
export async function checkWebGPUSupport(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.gpu === undefined) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/** Formatted message element when WebGPU is unavailable. */
export function getWebGPUErrorMessage(): HTMLDivElement {
  const element = document.createElement('div');
  element.id = 'webgpumessage';
  element.style.fontFamily = 'monospace';
  element.style.fontSize = '13px';
  element.style.fontWeight = 'normal';
  element.style.textAlign = 'center';
  element.style.background = '#fff';
  element.style.color = '#000';
  element.style.padding = '1.5em';
  element.style.maxWidth = '400px';
  element.style.margin = '5em auto 0';
  element.innerHTML =
    'Your browser does not support <a href="https://gpuweb.github.io/gpuweb/" style="color:blue">WebGPU</a> yet';
  return element;
}
