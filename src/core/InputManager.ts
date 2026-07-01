// src/core/InputManager.ts
export interface MovementDirection {
  x: number;
  y: number;
}

const keys = new Set<string>();
let initialized = false;

function onKeyDown(e: KeyboardEvent): void {
  keys.add(e.code);
}

function onKeyUp(e: KeyboardEvent): void {
  keys.delete(e.code);
}

function onBlur(): void {
  keys.clear();
}

export function initInputManager(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
}

export function getMovementDirection(out: MovementDirection = { x: 0, y: 0 }): MovementDirection {
  out.x = 0;
  out.y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) out.y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) out.y += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) out.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) out.x += 1;
  const lenSq = out.x * out.x + out.y * out.y;
  if (lenSq > 0) {
    const invLen = 1 / Math.sqrt(lenSq);
    out.x *= invLen;
    out.y *= invLen;
  }
  return out;
}

export function disposeInputManager(): void {
  if (!initialized) return;
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  keys.clear();
  initialized = false;
}
