// src/entities/landmark/landmarkLights.ts — the light on the Phase 0 landmarks (additive emissive meshes only)
//
// A dormant landmark shows a faint column of light that can be seen from afar (the pull), and a ring on the
// ground that fills while the orb stands in reach. Waking it sends a burst of sparkles and a pulse of light,
// which then settles into a short steady glow. The look values are in `config/visual/landmark.ts`.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Mesh,
  type Scene,
  Vector3,
} from 'three';
import {
  attribute,
  cameraPosition,
  dot,
  float,
  length,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  step,
  time,
  uniform,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { PHASE0 } from '../../config/phase0';
import { VISUAL } from '../../config/visualTuning';
import { bus } from '../../core/EventBus';
import type { LandmarkRuntime } from '../../landmarks/landmarkRuntime';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../../rendering/glowMaterial';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';

type TslNode = any;

const LOOK = VISUAL.landmark;
const RING_SEGMENTS = 96;
/** Share of the way to the target height and strength covered per second. */
const SETTLE_RATE = 1.6;

export interface LandmarkLightsDeps {
  scene: Scene;
  terrain: Pick<MapTerrainContext, 'getWorldY'>;
  landmarks: LandmarkRuntime;
  /** The orb (its position is where the ring fades in, and where the burst's sparkles are drawn to). */
  playerPosition: Vector3;
  /** A burst of sparkles at a point (the orb system's). */
  burstAt: (origin: Vector3, playerPos: Vector3) => void;
}

export interface LandmarkLights {
  /** Once per fixed step. */
  update: (dt: number) => void;
  dispose: () => void;
}

/** A terrain-draped ring ribbon whose `angle01` attribute lets the shader fill it like a clock. */
function ringGeometry(
  terrain: Pick<MapTerrainContext, 'getWorldY'>,
  x: number,
  z: number,
  radiusM: number,
): BufferGeometry {
  const positions = new Float32Array((RING_SEGMENTS + 1) * 2 * 3);
  const angles = new Float32Array((RING_SEGMENTS + 1) * 2);
  const indices: number[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    for (let side = 0; side < 2; side++) {
      const r = radiusM + (side === 0 ? -1 : 1) * (LOOK.ring.ribbonWidthM / 2);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const o = (i * 2 + side) * 3;
      positions[o] = px;
      positions[o + 1] = terrain.getWorldY(px, pz) + LOOK.ring.liftM;
      positions[o + 2] = pz;
      angles[i * 2 + side] = i / RING_SEGMENTS;
    }
    if (i < RING_SEGMENTS) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('angle01', new BufferAttribute(angles, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createLandmarkLights(deps: LandmarkLightsDeps): LandmarkLights {
  const { scene, terrain, landmarks, playerPosition } = deps;
  const { beacon, ring, awaken } = LOOK;

  // One column geometry for all landmarks: unit height, base at the origin, scaled per landmark.
  const columnGeometry = new CylinderGeometry(beacon.radiusM, beacon.radiusM, 1, 20, 1, true);
  columnGeometry.translate(0, 0.5, 0);

  const entries = landmarks.places.map((place) => {
    const color = new Color(...LOOK.colors[place.kind]);
    const uColor = uniform(color);
    const uStrength = uniform(0);
    const uRing = uniform(0);
    const uFill = uniform(0);

    // Column: bright at the foot, fading with height; soft at the silhouette edges; fading out with
    // distance, and close to the camera so it never blinds.
    const y = positionLocal.y as TslNode;
    const toCamera = cameraPosition.sub(positionWorld) as TslNode;
    const distance = length(toCamera) as TslNode;
    const facing = dot(normalize(normalWorld), normalize(toCamera)).abs() as TslNode;
    const farFade = float(1).sub(
      smoothstep(float(beacon.visibleM * 0.55), float(beacon.visibleM), distance),
    );
    const nearFade = smoothstep(float(beacon.nearFadeStartM), float(beacon.nearFadeEndM), distance);
    const heightFade = pow(float(1).sub(y), 1.6).mul(smoothstep(float(0), float(0.02), y));
    const pulse = sin(time.mul(beacon.pulseSpeed).add(y.mul(8)))
      .mul(beacon.pulseAmount)
      .add(1);
    const columnMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    columnMaterial.fog = false;
    columnMaterial.colorNode = (uColor as TslNode)
      .mul(uStrength)
      .mul(uHdrBloomScale)
      .mul(heightFade)
      .mul(pow(facing, float(1.5)))
      .mul(farFade)
      .mul(nearFade)
      .mul(pulse);
    const column = new Mesh(columnGeometry, columnMaterial);
    column.name = `landmark-beacon-${place.kind}`;
    column.frustumCulled = false;
    column.renderOrder = GLOW_MESH_RENDER_ORDER;
    const groundY = terrain.getWorldY(place.x, place.z);
    column.position.set(place.x, groundY, place.z);
    column.visible = false;
    scene.add(column);

    // Ring: the part up to `uFill` of the way round is bright (the dwell so far), the rest is faint.
    const angle = attribute('angle01', 'float') as TslNode;
    const ringMaterial = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    ringMaterial.fog = false;
    const filled = step(angle, uFill as TslNode);
    ringMaterial.colorNode = (uColor as TslNode)
      .mul(float(ring.baseHdr).add(filled.mul(ring.fillHdr - ring.baseHdr)))
      .mul(uRing)
      .mul(uHdrBloomScale);
    const ringMesh = new Mesh(
      ringGeometry(terrain, place.x, place.z, PHASE0.LANDMARK.RADIUS_M),
      ringMaterial,
    );
    ringMesh.name = `landmark-ring-${place.kind}`;
    ringMesh.renderOrder = GLOW_MESH_RENDER_ORDER;
    ringMesh.visible = false;
    scene.add(ringMesh);

    const awake = landmarks.isAwake(place.kind);
    return {
      place,
      groundY,
      column,
      columnMaterial,
      ringMesh,
      ringMaterial,
      uStrength,
      uRing,
      uFill,
      // A landmark that was awake when the game loaded starts in its steady glow.
      height: awake ? awaken.glowHeightM : beacon.heightM,
      strength: awake ? awaken.glowHdr : beacon.dormantHdr,
      pulseLeftS: 0,
    };
  });

  const burstOrigin = new Vector3();
  const offAwakened = bus.on('landmark:awakened', ({ kind }) => {
    const entry = entries.find((e) => e.place.kind === kind);
    if (!entry) return;
    entry.pulseLeftS = awaken.pulseS;
    burstOrigin.set(entry.place.x, entry.groundY + awaken.burstHeightM, entry.place.z);
    deps.burstAt(burstOrigin, playerPosition);
  });

  const update = (dt: number) => {
    const settle = Math.min(1, dt * SETTLE_RATE);
    for (const e of entries) {
      const awake = landmarks.isAwake(e.place.kind);
      const progress = landmarks.progress(e.place.kind);
      e.pulseLeftS = Math.max(0, e.pulseLeftS - dt);
      const pulse01 = e.pulseLeftS / awaken.pulseS;

      const targetHeight = awake ? awaken.glowHeightM : beacon.heightM;
      // The dwell brightens the beacon; the awakening pulse flares it, then it settles to the glow.
      const targetStrength = awake ? awaken.glowHdr : beacon.dormantHdr * (1 + progress * 2);
      e.height += (targetHeight - e.height) * settle;
      e.strength += (targetStrength - e.strength) * settle;
      e.column.scale.set(1, e.height, 1);
      e.uStrength.value = e.strength + pulse01 * awaken.pulseHdr;
      e.column.visible = e.uStrength.value > 0.01;

      // The ring shows when the orb is close to a dormant landmark, and flashes once at the awakening.
      const d = Math.hypot(playerPosition.x - e.place.x, playerPosition.z - e.place.z);
      const near = Math.min(
        1,
        Math.max(0, (ring.showStartM - d) / Math.max(1e-3, ring.showStartM - ring.showEndM)),
      );
      e.uRing.value = awake ? pulse01 : near;
      e.uFill.value = awake ? 1 : progress;
      e.ringMesh.visible = e.uRing.value > 0.01;
    }
  };

  return {
    update,
    dispose: () => {
      offAwakened();
      for (const e of entries) {
        scene.remove(e.column);
        scene.remove(e.ringMesh);
        e.columnMaterial.dispose();
        e.ringMesh.geometry.dispose();
        e.ringMaterial.dispose();
      }
      columnGeometry.dispose();
    },
  };
}
