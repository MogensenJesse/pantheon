// src/cloud-designer/createCloudDesignerSession.ts — Engine session (sky + water + soft play-field preview; Phase 2/4 profile + Phase 5 layout rebuild)
import { MOUSE, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bindEditorViewport } from '../editor/core/EditorViewportFit';
import type { CloudGenus } from '../rendering/clouds/cloudConfig';
import {
  initMeshCloudSystem,
  type MeshCloudSystemContext,
} from '../rendering/clouds/MeshCloudSystem';
import { disposePostFX, initPostFX } from '../rendering/PostFX';
import { syncAtmosphere } from '../rendering/postfx/syncAtmosphere';
import { disposeSceneSetup, initSceneSetup } from '../rendering/SceneSetup';
import { applyWorldLightingFromElevation } from '../rendering/sky/lightingCurves';
import { initSkySystem, type SkySystemContext } from '../rendering/sky/SkySystem';
import { applySunPositionFromCyclePhase } from '../rendering/sky/sunCycle';
import { updateSunShadowTarget } from '../rendering/sunShadow/followTarget';
import { currentSunElevationDeg } from '../rendering/sunSpherical';
import { checkWebGPUSupport, getWebGPUErrorMessage } from '../rendering/webgpuCapability';
import { loadWaterNormals } from '../world/water/data/loadWaterNormals';
import { createPantheonWater } from '../world/water/mesh/createPantheonWater';
import { disposePantheonWater } from '../world/water/mesh/disposePantheonWater';
import type { PantheonWaterInstance } from '../world/water/mesh/pantheonWaterTypes';
import { syncPantheonWater } from '../world/water/sync/syncPantheonWater';
import { buildCumulusDeckField, readDesignerPreviewDebug } from './buildDesignerPreviewBank';
import type { CloudDesignerShellContext } from './CloudDesignerShell';
import { createCloudDesignerDebugOverlay } from './cloudDesignerDebugOverlay';

const WATER_RADIUS_M = 400;
const WATER_Y = 0;
const ORBIT_MIN_M = 20;
const ORBIT_MAX_M = 600;

export interface CloudDesignerSession {
  getGenus: () => CloudGenus;
  setGenus: (genus: CloudGenus) => void;
  /**
   * Rebuild the preview field from the shared cumulus deck.
   */
  rebuildPreviewBank: () => void;
  /** Scene / MeshCloud host Engine mounts into. */
  sceneHost: HTMLElement;
  dispose: () => void;
}

/**
 * Preetham SkyMesh + Pantheon water + soft MeshCloud play-field preview on the play
 * material/instance path. Placement is buildCumulusDeckField. Tone map / exposure /
 * grade: same PostFX path as play (AgX via syncAtmosphere).
 */
export async function createCloudDesignerSession(
  shell: CloudDesignerShellContext,
): Promise<CloudDesignerSession> {
  const sceneHost = shell.slots.sceneHost;
  sceneHost.replaceChildren();
  sceneHost.style.position = 'relative';
  sceneHost.style.overflow = 'hidden';

  if (!(await checkWebGPUSupport())) {
    sceneHost.appendChild(getWebGPUErrorMessage());
    return {
      getGenus: shell.getGenus,
      setGenus: shell.setGenus,
      rebuildPreviewBank: () => {},
      sceneHost,
      dispose: () => {
        sceneHost.replaceChildren();
      },
    };
  }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', 'Cloud designer viewport');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  sceneHost.appendChild(canvas);

  const setup = await initSceneSetup(canvas, { fitCanvas: true });
  const { renderer, scene, camera, ambientLight, sun } = setup;
  const unbindViewport = bindEditorViewport(canvas, renderer, camera);

  // Play grade path: renderer stays NoToneMapping; AgX + procedural grade live in PostFX.
  const postFX = initPostFX(renderer, scene, camera);
  // Designer is inspection daylight — match full-energy play (bokeh off), not reveal start.
  postFX.setDofBokehScale(0);

  applySunPositionFromCyclePhase(shell.getPreviewLayout().sunPhase);
  updateSunShadowTarget(0, WATER_Y, 0, sun, currentSunElevationDeg());

  const sky: SkySystemContext = initSkySystem(scene, null);
  sky.setNightHdriWeight(0);

  const waterNormals = await loadWaterNormals();
  const water: PantheonWaterInstance = createPantheonWater(
    waterNormals,
    { waterRadius: WATER_RADIUS_M, waterY: WATER_Y },
    sun,
  );
  scene.add(water);

  let windTime = 0;
  const clouds: MeshCloudSystemContext | null = initMeshCloudSystem(scene, sun, {
    buildField: () => buildCumulusDeckField(undefined, shell.getPreviewLayout()),
    windElapsed: () => (shell.getAnimateClouds() ? windTime : 0),
  });
  if (!clouds) {
    throw new Error('MeshCloud preview bank failed to initialize');
  }

  const publishPlacedCount = (): void => {
    shell.setPlacedClusterCount(clouds.getFieldStats().clusterCount);
  };
  publishPlacedCount();

  const debugOverlay = createCloudDesignerDebugOverlay(scene);
  const syncDebugOverlay = (): void => {
    debugOverlay.sync(shell.getDebugViews(), readDesignerPreviewDebug());
  };
  shell.onDebugViewChange = syncDebugOverlay;

  let orbitTargetY = readDesignerPreviewDebug()?.sites[0]?.y ?? 50;
  camera.position.set(140, orbitTargetY + 50, 180);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = ORBIT_MIN_M;
  controls.maxDistance = ORBIT_MAX_M;
  // 0 = overhead, π/2 = horizon. Stop short of π so the orbit does not flip underneath.
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.enablePan = false; // orbit bank only — no free-fly / pan-away
  controls.target.set(0, orbitTargetY, 0);
  controls.mouseButtons = {
    LEFT: MOUSE.ROTATE,
    MIDDLE: MOUSE.DOLLY,
    RIGHT: MOUSE.ROTATE,
  };
  controls.update();

  const dofFocus = new Vector3();
  let elapsed = 0;
  let lastMs = performance.now();
  let disposed = false;

  const refreshBank = (): void => {
    clouds.rebuild();
    publishPlacedCount();
    syncDebugOverlay();
    orbitTargetY = readDesignerPreviewDebug()?.sites[0]?.y ?? orbitTargetY;
    controls.target.set(0, orbitTargetY, 0);
  };

  const rebuildPreviewBank = (): void => {
    refreshBank();
  };

  shell.onPreviewLayoutChange = () => {
    refreshBank();
  };

  const frame = (): void => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastMs) / 1000);
    lastMs = now;
    elapsed += dt;
    if (shell.getAnimateClouds()) windTime += dt;
    else windTime = 0;

    const layout = shell.getPreviewLayout();
    applySunPositionFromCyclePhase(layout.sunPhase);
    clouds.setPreviewDeckMotion({
      windSpeed: layout.windSpeed,
      edgeFadeM: layout.edgeFadeM,
    });

    controls.target.set(0, orbitTargetY, 0);
    controls.update();
    const elevationDeg = currentSunElevationDeg();
    updateSunShadowTarget(0, WATER_Y, 0, sun, elevationDeg);
    const lighting = applyWorldLightingFromElevation(elevationDeg, sun, ambientLight, sky);
    syncAtmosphere(sky, postFX, {
      elevationDeg,
      sunIntensity: sun.intensity,
    });
    clouds.update({
      camera,
      sun,
      elapsed,
      elevationDeg,
      daylightFactor: lighting.daylightFactor,
      hdriWeight: 0,
      atmosphereBlendT: lighting.atmosphereBlendT,
    });
    sky.update(sun, camera, elapsed);
    syncPantheonWater(water, sun, lighting.daylightFactor);
    dofFocus.copy(controls.target);
    postFX.setDofFocus(camera, dofFocus, dt);
    postFX.render();
  };

  renderer.setAnimationLoop(frame);

  return {
    getGenus: shell.getGenus,
    setGenus: (genus) => {
      shell.setGenus(genus);
      refreshBank();
    },
    rebuildPreviewBank,
    sceneHost,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      shell.onPreviewLayoutChange = null;
      shell.onPreviewLayoutChange = null;
      shell.onDebugViewChange = null;
      debugOverlay.dispose();
      controls.dispose();
      clouds.dispose();
      sky.dispose();
      scene.remove(water);
      disposePantheonWater(water);
      waterNormals.dispose();
      unbindViewport();
      disposePostFX();
      disposeSceneSetup();
      sceneHost.replaceChildren();
    },
  };
}
