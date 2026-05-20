// src/core/InputManager.ts
import { Vector2 } from 'three';

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

const _dir = new Vector2();

export function getMovementDirection(): Vector2 {
  _dir.set(0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) _dir.y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) _dir.y += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) _dir.x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) _dir.x += 1;
  if (_dir.lengthSq() > 0) _dir.normalize();
  return _dir;
}

export function disposeInputManager(): void {
  if (!initialized) return;
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  keys.clear();
  initialized = false;
}
