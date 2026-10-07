// @ts-nocheck — TSL node typings incomplete in three r186
// src/world/village/render/villagerMaterial.ts — GPU-rigged villager: part-wise pose animation, prop-matched lighting
import { Color, type DirectionalLight, FrontSide } from 'three';
import {
  attribute,
  cameraFar,
  cameraNear,
  cos,
  float,
  mix,
  normalize,
  positionView,
  positionWorld,
  select,
  sin,
  varying,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { createReceiverSunShadowNode } from '../../../rendering/sunShadow';
import {
  classifyPropMaterial,
  propCategoryMulFromClass,
  propGroundContactMulFromClass,
} from '../../mapProps/config/mapPropShadowUniforms';
import { applyPropShading } from '../../mapProps/tsl/mapPropShadingTsl';
import { VILLAGER_RIG, VILLAGER_TUNICS, VillagerPart } from '../assets/placeholder/villagerFigure';
import { uVillageTime } from './villageUniforms';

const iPose = attribute('iPose', 'vec4'); // x, y, z, yaw
const iAnim = attribute('iAnim', 'vec4'); // current anim, previous anim, blend, stride phase
const iLook = attribute('iLook', 'vec4'); // tunic variant, scale, ground normal x, z
const aRig = attribute('aRig', 'vec4'); // joint pivot xyz, part id
const aColor = attribute('color', 'vec4'); // rgb, tunic tint flag
const aPart = aRig.w;
const aPivot = aRig.xyz;
const aTint = aColor.w;

const TWO_PI = Math.PI * 2;
const isId = (value, id) => value.sub(float(id)).abs().lessThan(0.5);
const isPart = (id) => isId(aPart, id);
const vec3Of = (v) => vec3(v[0], v[1], v[2]);

/** Rotate p about the X axis through `pivot`; negative angles swing the far end toward +Z. */
function rotateX(p, pivot, angle) {
  const c = cos(angle);
  const s = sin(angle);
  const d = p.sub(pivot);
  return vec3(d.x, d.y.mul(c).sub(d.z.mul(s)), d.y.mul(s).add(d.z.mul(c))).add(pivot);
}

function rotateXDir(v, angle) {
  const c = cos(angle);
  const s = sin(angle);
  return vec3(v.x, v.y.mul(c).sub(v.z.mul(s)), v.y.mul(s).add(v.z.mul(c)));
}

/** Joint angles per animation id (0 idle, 1 walk, 2 work, 3 pray, 4 carry): arm L, arm R, leg L, leg R. */
function armsPose(id, phase) {
  const swing = sin(phase.mul(TWO_PI));
  const t = uVillageTime.add(phase.mul(TWO_PI));
  const breathe = sin(t.mul(1.3)).mul(0.06);
  const hammer = sin(t.mul(5));
  const sway = sin(t.mul(1.5)).mul(0.05);
  const idle = vec4(breathe, breathe.negate(), 0, 0);
  const walk = vec4(swing.mul(0.45), swing.mul(-0.45), swing.mul(-0.55), swing.mul(0.55));
  const work = vec4(hammer.mul(0.1).sub(0.7), hammer.mul(0.7).sub(1.5), 0, 0);
  const pray = vec4(sway.sub(2.3), sway.sub(2.3), 0, 0);
  const carry = vec4(-1.1, -1.1, swing.mul(-0.4), swing.mul(0.4));
  return select(
    isId(id, 0),
    idle,
    select(isId(id, 1), walk, select(isId(id, 2), work, select(isId(id, 3), pray, carry))),
  );
}

/** Per animation: forward lean, head pitch, vertical bob. */
function bodyPose(id, phase) {
  const t = uVillageTime.add(phase.mul(TWO_PI));
  const bob = cos(phase.mul(TWO_PI)).abs();
  const idle = vec3(0, sin(t.mul(0.8)).mul(0.04), 0);
  const walk = vec3(0.06, 0, bob.mul(0.03));
  const work = vec3(sin(t.mul(5)).mul(0.08).add(0.28), 0.1, 0);
  const pray = vec3(0.08, 0.35, 0);
  const carry = vec3(-0.06, 0, bob.mul(0.024));
  return select(
    isId(id, 0),
    idle,
    select(isId(id, 1), walk, select(isId(id, 2), work, select(isId(id, 3), pray, carry))),
  );
}

const tunicColors = VILLAGER_TUNICS.map((hex) => {
  const c = new Color(hex);
  return vec3(c.r, c.g, c.b);
});

function pickTunic(index) {
  let node = tunicColors[tunicColors.length - 1];
  for (let k = tunicColors.length - 2; k >= 0; k--)
    node = select(isId(index, k), tunicColors[k], node);
  return node;
}

/** Animated world-space position and normal for the current vertex. */
function rig() {
  const curId = iAnim.x;
  const prevId = iAnim.y;
  const blend = iAnim.z;
  const phase = iAnim.w;
  const arms = mix(armsPose(prevId, phase), armsPose(curId, phase), blend);
  const body = mix(bodyPose(prevId, phase), bodyPose(curId, phase), blend);

  const jointAngle = select(
    isPart(VillagerPart.ArmL),
    arms.x,
    select(
      isPart(VillagerPart.ArmR),
      arms.y,
      select(
        isPart(VillagerPart.LegL),
        arms.z,
        select(
          isPart(VillagerPart.LegR),
          arms.w,
          select(
            isPart(VillagerPart.Head),
            body.y,
            select(isPart(VillagerPart.Tool), arms.y, float(0)),
          ),
        ),
      ),
    ),
  );
  const isLeg = isPart(VillagerPart.LegL).or(isPart(VillagerPart.LegR));
  const hip = vec3Of(VILLAGER_RIG.hip);
  const hand = vec3Of(VILLAGER_RIG.hand);

  // The tool only shows while working.
  const toolShown = mix(
    select(isId(prevId, 2), float(1), float(0)),
    select(isId(curId, 2), float(1), float(0)),
    blend,
  );
  const base = attribute('position', 'vec3');
  const p0 = select(isPart(VillagerPart.Tool), hand.add(base.sub(hand).mul(toolShown)), base);
  const p1 = rotateX(p0, aPivot, jointAngle);
  const p2 = select(isLeg, p1, rotateX(p1, hip, body.x));
  const scaled = p2.add(vec3(0, body.z, 0)).mul(iLook.y);

  const c = cos(iPose.w);
  const s = sin(iPose.w);
  const yaw = (v) => vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.x.mul(s).negate().add(v.z.mul(c)));
  const n0 = rotateXDir(attribute('normal', 'vec3'), jointAngle);
  const n1 = select(isLeg, n0, rotateXDir(n0, body.x));
  return { position: yaw(scaled).add(iPose.xyz), normal: normalize(yaw(n1)) };
}

export function createVillagerMaterial(sun: DirectionalLight): MeshBasicNodeMaterial {
  const { position, normal } = rig();
  const materialClass = classifyPropMaterial('village_villager');
  const tint = varying(mix(vec3(1), pickTunic(iLook.x), aTint));
  const albedo = aColor.xyz.mul(tint);

  const material = new MeshBasicNodeMaterial();
  material.name = 'village_villager';
  material.precision = 'mediump';
  material.lights = false;
  material.side = FrontSide;
  material.forceSinglePass = true;
  material.positionNode = position;
  material.receivedShadowPositionNode = positionWorld;
  material.colorNode = applyPropShading(
    albedo,
    createReceiverSunShadowNode(sun),
    positionWorld,
    propCategoryMulFromClass(materialClass),
    propGroundContactMulFromClass(materialClass),
    varying(normal),
  );
  // Same pull toward the camera as props, so figures draw over grass blades.
  material.depthNode = viewZToPerspectiveDepth(
    positionView.z.add(float(0.45)),
    cameraNear,
    cameraFar,
  );
  return material;
}
