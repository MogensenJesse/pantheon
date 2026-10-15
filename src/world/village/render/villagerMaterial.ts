// @ts-nocheck — TSL node typings incomplete in three r186
// src/world/village/render/villagerMaterial.ts — GPU-rigged villager: part-wise pose animation, prop-matched lighting
import { type DirectionalLight, FrontSide } from 'three';
import {
  attribute,
  cameraFar,
  cameraNear,
  cos,
  float,
  max,
  mix,
  normalize,
  positionView,
  positionWorld,
  pow,
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
import {
  VILLAGER_HAIR,
  VILLAGER_RIG,
  VILLAGER_SKIN,
  VILLAGER_TUNICS,
  VillagerPart,
  VillagerSlot,
} from '../assets/placeholder/villagerFigure';
import { PROP_DEPTH_PULL_M } from './depthPull';
import { uVillageTime } from './villageUniforms';

const iPose = attribute('iPose', 'vec4'); // x, y, z, yaw
const iAnim = attribute('iAnim', 'vec4'); // current anim, previous anim, blend, stride phase
const iLook = attribute('iLook', 'vec4'); // look variant 0..255, scale, ground normal x, z
const aRig = attribute('aRig', 'vec4'); // joint pivot xyz, part id
const aColor = attribute('color', 'vec4'); // rgb, colour slot / 3 (VillagerSlot)
const aPart = aRig.w;
const aPivot = aRig.xyz;
const aSlot = aColor.w.mul(3);

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

/** The node of animation `id` out of one node per animation (see `Anim`: idle, walk, work, pray, carry, chop, hoe, fish). */
function pick(id, poses) {
  let node = poses[poses.length - 1];
  for (let k = poses.length - 2; k >= 0; k--) node = select(isId(id, k), poses[k], node);
  return node;
}

/** 1 while the animation shows the tool (hammer, chop, hoe, fish), else 0. */
const showsTool = (id) =>
  select(isId(id, 2).or(isId(id, 5)).or(isId(id, 6)).or(isId(id, 7)), float(1), float(0));
/** The staff is put away (0) while praying. */
const showsStaff = (id) => select(isId(id, 3), float(0), float(1));

/** Joint angles per animation id: arm L, arm R, leg L, leg R (negative swings the arm forward and up). */
function armsPose(id, phase) {
  const swing = sin(phase.mul(TWO_PI));
  const t = uVillageTime.add(phase.mul(TWO_PI));
  const breathe = sin(t.mul(1.3)).mul(0.06);
  const hammer = sin(t.mul(5));
  const sway = sin(t.mul(1.5)).mul(0.05);
  const chop = sin(t.mul(4.4));
  const hoe = sin(t.mul(3));
  const reel = pow(max(sin(t.mul(0.8)), float(0)), float(10));
  return pick(id, [
    vec4(breathe, breathe.negate(), 0, 0),
    vec4(swing.mul(0.45), swing.mul(-0.45), swing.mul(-0.55), swing.mul(0.55)),
    vec4(hammer.mul(0.1).sub(0.7), hammer.mul(0.7).sub(1.5), 0, 0),
    vec4(sway.sub(2.3), sway.sub(2.3), 0, 0),
    vec4(-1.1, -1.1, swing.mul(-0.4), swing.mul(0.4)),
    vec4(chop.mul(0.9).sub(1.8), chop.mul(0.9).sub(1.7), 0.12, -0.2),
    vec4(hoe.mul(0.5).sub(1.0), hoe.mul(0.5).sub(1.0), 0.2, -0.25),
    vec4(reel.mul(-0.5).sub(1.05), reel.mul(-0.7).sub(1.25), 0, 0),
  ]);
}

/** Per animation: forward lean, head pitch, vertical bob. */
function bodyPose(id, phase) {
  const t = uVillageTime.add(phase.mul(TWO_PI));
  const bob = cos(phase.mul(TWO_PI)).abs();
  const chop = sin(t.mul(4.4));
  const hoe = sin(t.mul(3));
  const reel = pow(max(sin(t.mul(0.8)), float(0)), float(10));
  return pick(id, [
    vec3(0, sin(t.mul(0.8)).mul(0.04), 0),
    vec3(0.06, 0, bob.mul(0.03)),
    vec3(sin(t.mul(5)).mul(0.08).add(0.28), 0.1, 0),
    vec3(0.08, 0.35, 0),
    vec3(-0.06, 0, bob.mul(0.024)),
    vec3(chop.mul(0.2).add(0.22), 0.15, 0),
    vec3(hoe.mul(0.12).add(0.5), 0.35, 0),
    vec3(reel.mul(-0.12).add(0.04), 0.18, 0),
  ]);
}

function pickColor(colors, index) {
  const nodes = colors.map(([r, g, b]) => vec3(r, g, b));
  let node = nodes[nodes.length - 1];
  for (let k = nodes.length - 2; k >= 0; k--) node = select(isId(index, k), nodes[k], node);
  return node;
}

/** Tint of the vertex's colour slot for this villager: tunic, hair and skin come from separate digits of the variant. */
function slotTint() {
  const v = iLook.x;
  const tunics = VILLAGER_TUNICS.length;
  const hairs = VILLAGER_HAIR.length;
  const tunic = pickColor(VILLAGER_TUNICS, v.mod(tunics));
  const hair = pickColor(VILLAGER_HAIR, v.div(tunics).floor().mod(hairs));
  const skin = pickColor(
    VILLAGER_SKIN,
    v
      .div(tunics * hairs)
      .floor()
      .mod(VILLAGER_SKIN.length),
  );
  return select(
    isId(aSlot, VillagerSlot.Tunic),
    tunic,
    select(
      isId(aSlot, VillagerSlot.Hair),
      hair,
      select(isId(aSlot, VillagerSlot.Skin), skin, vec3(1)),
    ),
  );
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
            select(isPart(VillagerPart.Tool).or(isPart(VillagerPart.Staff)), arms.y, float(0)),
          ),
        ),
      ),
    ),
  );
  const isLeg = isPart(VillagerPart.LegL).or(isPart(VillagerPart.LegR));
  const hip = vec3Of(VILLAGER_RIG.hip);
  const hand = vec3Of(VILLAGER_RIG.hand);

  // The tool only shows while working, the staff except while praying: hidden ones shrink into the hand.
  const isTool = isPart(VillagerPart.Tool);
  const shown = select(
    isTool,
    mix(showsTool(prevId), showsTool(curId), blend),
    mix(showsStaff(prevId), showsStaff(curId), blend),
  );
  const base = attribute('position', 'vec3');
  const held = isTool.or(isPart(VillagerPart.Staff));
  const p0 = select(held, hand.add(base.sub(hand).mul(shown)), base);
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
  const tint = varying(slotTint());
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
    positionView.z.add(float(PROP_DEPTH_PULL_M)),
    cameraNear,
    cameraFar,
  );
  return material;
}
