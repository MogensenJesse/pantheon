// src/entities/sparkleField.ts — shared additive sparkle sprites (guide path + player orb)
import { AdditiveBlending, Color, InstancedMesh, type Object3D, PlaneGeometry } from 'three';
import {
  clamp,
  cos,
  Discard,
  Fn,
  float,
  fract,
  hash,
  If,
  instanceIndex,
  length,
  mix,
  sin,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { SpriteNodeMaterial } from 'three/webgpu';
import type { SparkleLookSettings } from '../config/visual/sparkleLook';
import { GLOW_MESH_RENDER_ORDER, uHdrBloomScale } from '../rendering/glowMaterial';
import { disableWaterReflectionLayer } from '../rendering/layers/waterReflectionLayers';
import {
  guideBreathFadeTsl,
  guideTravelColorTsl,
  guideTravelLinearMaskTsl,
} from './guideLine/guidePulseTsl';

type TslNode = any;

export interface SparklePlaceCtx {
  id: TslNode;
  alongFrac: TslNode;
  h1: TslNode;
  h2: TslNode;
  h3: TslNode;
  uSpread: TslNode;
  tubeOffset: (side: TslNode, up: TslNode) => TslNode;
}

export interface SparklePlaceResult {
  position: TslNode;
  along: TslNode;
  closestAlong?: TslNode;
  extraMul?: TslNode;
}

export interface SparkleField {
  mesh: InstancedMesh;
  applyLook: (look: SparkleLookSettings) => void;
  dispose: () => void;
}

export function createSparkleField(opts: {
  parent: Object3D;
  count: number;
  look: SparkleLookSettings;
  place: (ctx: SparklePlaceCtx) => SparklePlaceResult;
  name?: string;
  visible?: boolean;
}): SparkleField {
  const count = Math.max(8, opts.count);
  const uSpread = uniform(opts.look.spreadM);
  const uSize = uniform(opts.look.sizeM);
  const uIdleDensity = uniform(opts.look.idle);
  const uParticleHdr = uniform(opts.look.hdr);
  const uSpin = uniform(opts.look.spin);
  const uBreathSpeed = uniform(opts.look.breathSpeed);
  const uBreathAmount = uniform(opts.look.breathAmount);
  const uPulseSpeed = uniform(opts.look.pulseSpeed);
  const uPulseSpacing = uniform(opts.look.pulseSpacingM);
  const uPulseLength = uniform(opts.look.pulseLengthM);
  const uColorTravel = uniform(opts.look.colorTravelM);
  const uColorA = uniform(new Color(opts.look.colorAHex));
  const uColorB = uniform(new Color(opts.look.colorBHex));
  const uColorC = uniform(new Color(opts.look.colorCHex));

  const id = float(instanceIndex);
  const alongFrac = fract(id.mul(0.61803398875).add(0.11));
  const seed = id.add(19.17);
  const h1 = hash(seed);
  const h2 = hash(seed.add(17.3));
  const h3 = hash(seed.add(41.9));
  const tubeOffset = (side: TslNode, up: TslNode) => {
    const ang = time.mul(uSpin).add(h1.mul(6.283185));
    return side
      .mul(h1.sub(0.5))
      .add(up.mul(h2.sub(0.5).mul(0.85)))
      .add(
        side
          .mul(cos(ang))
          .add(up.mul(sin(ang)))
          .mul(0.4),
      );
  };

  const placed = opts.place({ id, alongFrac, h1, h2, h3, uSpread, tubeOffset });
  const closestAlong = placed.closestAlong ?? float(0);
  const extraMul = placed.extraMul ?? float(1);
  const packet = guideTravelLinearMaskTsl(
    placed.along,
    closestAlong,
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
  );
  const chance = mix(clamp(uIdleDensity, 0, 1), float(1), packet);
  const shown = smoothstep(h3, h3.add(0.16), chance);
  const breath = guideBreathFadeTsl(uBreathSpeed, uBreathAmount);
  const haloColor = guideTravelColorTsl(
    placed.along,
    uPulseSpeed,
    uColorTravel,
    uColorA as TslNode,
    uColorB as TslNode,
    uColorC as TslNode,
  );
  const rgb = mix(haloColor, vec3(1.2, 1.12, 0.98), packet);
  const r = length(uv().sub(0.5)).mul(2);
  const disc = float(1).sub(smoothstep(float(0.12), float(1), r));
  const size = mix(uSize.mul(0.45), uSize, packet).mul(h2.mul(0.55).add(0.7));

  const material = new SpriteNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = AdditiveBlending;
  material.fog = false;
  material.forceSinglePass = true;
  material.positionNode = placed.position;
  material.scaleNode = vec3(size, size, 1);
  material.colorNode = Fn(() => {
    const out = vec3(0).toVar();
    If(shown.greaterThan(float(0.02)), () => {
      out.assign(
        rgb
          .mul(uParticleHdr)
          .mul(uHdrBloomScale)
          .mul(mix(float(0.28), float(1), packet))
          .mul(extraMul)
          .mul(breath)
          .mul(shown)
          .mul(disc),
      );
    }).Else(() => {
      Discard();
    });
    return out;
  })();

  const geometry = new PlaneGeometry(1, 1);
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = opts.name ?? 'sparkles';
  mesh.frustumCulled = false;
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  mesh.visible = opts.visible ?? true;
  mesh.count = count;
  disableWaterReflectionLayer(mesh);
  opts.parent.add(mesh);

  const applyLook = (look: SparkleLookSettings) => {
    uSpread.value = look.spreadM;
    uSize.value = look.sizeM;
    uIdleDensity.value = look.idle;
    uParticleHdr.value = look.hdr;
    uSpin.value = look.spin;
    uBreathSpeed.value = look.breathSpeed;
    uBreathAmount.value = look.breathAmount;
    uPulseSpeed.value = look.pulseSpeed;
    uPulseSpacing.value = look.pulseSpacingM;
    uPulseLength.value = look.pulseLengthM;
    uColorTravel.value = look.colorTravelM;
    (uColorA.value as Color).setHex(look.colorAHex);
    (uColorB.value as Color).setHex(look.colorBHex);
    (uColorC.value as Color).setHex(look.colorCHex);
  };

  return {
    mesh,
    applyLook,
    dispose: () => {
      opts.parent.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
