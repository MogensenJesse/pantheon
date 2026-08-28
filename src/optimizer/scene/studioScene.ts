// src/optimizer/scene/studioScene.ts — dedicated optimizer studio (not SceneSetup)
import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  NoToneMapping,
  type Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WebGPURenderer } from 'three/webgpu';
import { fitOrbitToObject } from './orbitFit';

export interface StudioContext {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  originalRoot: Group;
  optimizedRoot: Group;
  setOriginal: (obj: Object3D | null) => void;
  setOptimized: (obj: Object3D | null) => void;
  setLit: (lit: boolean) => void;
  setWireframe: (wire: boolean) => void;
  fit: () => void;
  dispose: () => void;
}

function clearGroup(group: Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
  }
}

function setTreeWireframe(root: Object3D, wire: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      isMesh?: boolean;
      material?:
        | { wireframe?: boolean; needsUpdate?: boolean }
        | Array<{ wireframe?: boolean; needsUpdate?: boolean }>;
    };
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.wireframe = wire;
      mat.needsUpdate = true;
    }
  });
}

export async function createStudioScene(canvas: HTMLCanvasElement): Promise<StudioContext> {
  const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 600, false);
  renderer.setClearColor(new Color(0x1a2228), 1);
  await renderer.init();
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.background = new Color(0x1a2228);
  const camera = new PerspectiveCamera(40, 1, 0.05, 500);
  camera.position.set(3, 2, 4);

  const hemi = new HemisphereLight(0xdde8ff, 0x3a3028, 0.55);
  const ambient = new AmbientLight(0xffffff, 0.25);
  const key = new DirectionalLight(0xfff4e8, 1.35);
  key.position.set(4, 8, 6);
  scene.add(hemi, ambient, key);

  const grid = new GridHelper(8, 16, 0x3a4650, 0x2a343c);
  grid.position.y = -0.001;
  scene.add(grid);

  const originalRoot = new Group();
  originalRoot.name = 'original';
  const optimizedRoot = new Group();
  optimizedRoot.name = 'optimized';
  scene.add(originalRoot, optimizedRoot);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  let lit = true;
  const applyLit = () => {
    hemi.visible = lit;
    ambient.visible = lit;
    key.visible = lit;
  };

  return {
    renderer,
    scene,
    camera,
    controls,
    originalRoot,
    optimizedRoot,
    setOriginal(obj) {
      clearGroup(originalRoot);
      if (obj) originalRoot.add(obj);
    },
    setOptimized(obj) {
      clearGroup(optimizedRoot);
      if (obj) optimizedRoot.add(obj);
    },
    setLit(next) {
      lit = next;
      applyLit();
    },
    setWireframe(wire) {
      setTreeWireframe(originalRoot, wire);
      setTreeWireframe(optimizedRoot, wire);
    },
    fit() {
      const probe = originalRoot.children[0] ?? optimizedRoot.children[0];
      if (probe) fitOrbitToObject(camera, controls, probe);
    },
    dispose() {
      controls.dispose();
      renderer.dispose();
    },
  };
}
