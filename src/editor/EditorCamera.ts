// src/editor/EditorCamera.ts — orbit camera for map editor
import { MOUSE, PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const DEG = Math.PI / 180;
const MOUSE_NONE = -1 as unknown as MOUSE.ROTATE;

export interface EditorCameraContext {
  camera: PerspectiveCamera;
  controls: OrbitControls;
  /** True while Space is held (LMB orbits; tools disabled). */
  isSpaceHeld: () => boolean;
  update: () => void;
  dispose: () => void;
}

export function initEditorCamera(domElement: HTMLElement): EditorCameraContext {
  const camera = new PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 3500);
  camera.position.set(320, 360, 320);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 8, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 80;
  controls.maxDistance = 1120;
  controls.minPolarAngle = 25 * DEG;
  controls.maxPolarAngle = 75 * DEG;
  // RMB pan · Space+LMB orbit · wheel zoom · MMB unused.
  let spaceHeld = false;

  const syncMouseButtons = () => {
    controls.mouseButtons = {
      LEFT: spaceHeld ? MOUSE.PAN : MOUSE_NONE,
      MIDDLE: MOUSE_NONE,
      RIGHT: MOUSE.ROTATE,
    };
  };
  syncMouseButtons();
  controls.update();

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.repeat) return;
    e.preventDefault();
    spaceHeld = true;
    syncMouseButtons();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    spaceHeld = false;
    syncMouseButtons();
  };

  const onBlur = () => {
    if (!spaceHeld) return;
    spaceHeld = false;
    syncMouseButtons();
  };

  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  domElement.addEventListener('contextmenu', onContextMenu);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    camera,
    controls,
    isSpaceHeld: () => spaceHeld,
    update: () => controls.update(),
    dispose: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      domElement.removeEventListener('contextmenu', onContextMenu);
      controls.dispose();
    },
  };
}
