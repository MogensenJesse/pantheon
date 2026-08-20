// src/entities/organicOrb/organicOrbMaterial.ts — MeshBasicNodeMaterial factory + live uniforms
import { FrontSide, NormalBlending, Vector3 } from 'three';
import { uniform } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { OrganicOrbSettings } from '../../config/visual/organicOrb';
import { VISUAL } from '../../config/visualTuning';
import { buildOrganicOrbGraph } from './organicOrbTsl';

export interface OrganicOrbMaterial {
  material: MeshBasicNodeMaterial;
  sync: (settings: OrganicOrbSettings, rimHdr?: number) => void;
  setMotion: (dirX: number, dirZ: number, amount: number) => void;
  setMorphOriginMul: (value: number) => void;
  dispose: () => void;
}

export function createOrganicOrbMaterial(): OrganicOrbMaterial {
  const s = VISUAL.organicOrb as OrganicOrbSettings;
  const uFillOpacity = uniform(s.fillOpacity);
  const uFillWhite = uniform(s.fillWhite);
  const uRefractStrength = uniform(s.refractionStrength);
  const uRefractScale = uniform(s.refractionScale);
  const uNebula = uniform(s.nebula);
  const uCorePower = uniform(s.corePower);
  const uCoreAmount = uniform(s.coreAmount);
  const uRimPower = uniform(s.rimPower);
  const uRimHdr = uniform(s.rimHdr);
  const uMorphAmp = uniform(s.morphAmp);
  const uMorphSpeed = uniform(s.morphSpeed);
  const uMorphScale = uniform(s.morphScale);
  const uMorphOriginMul = uniform(0);
  const uStretchDir = uniform(new Vector3(1, 0, 0));
  const uStretch = uniform(0);
  const uStretchAmp = uniform(s.stretchAmt);
  const uStretchTrail = uniform(s.stretchTrail);
  const uPulseSpeed = uniform(s.pulseSpeed);
  const uPulseSpacing = uniform(s.pulseSpacingM);
  const uPulseLength = uniform(s.pulseLengthM);
  const uPulseIdle = uniform(s.pulseIdle);
  const uPulseAmplitude = uniform(s.pulseAmplitude);
  const uMeridianAmount = uniform(s.meridianAmount);
  const uMeridianCount = uniform(s.meridianCount);

  const { positionNode, colorNode, opacityNode } = buildOrganicOrbGraph({
    uFillOpacity,
    uFillWhite,
    uRefractStrength,
    uRefractScale,
    uNebula,
    uCorePower,
    uCoreAmount,
    uRimPower,
    uRimHdr,
    uMorphAmp,
    uMorphSpeed,
    uMorphScale,
    uMorphOriginMul,
    uStretchDir,
    uStretch,
    uStretchAmp,
    uStretchTrail,
    uPulseSpeed,
    uPulseSpacing,
    uPulseLength,
    uPulseIdle,
    uPulseAmplitude,
    uMeridianAmount,
    uMeridianCount,
  });

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
    side: FrontSide,
  });
  material.fog = false;
  material.forceSinglePass = true;
  material.positionNode = positionNode;
  material.colorNode = colorNode;
  material.opacityNode = opacityNode;

  const sync = (settings: OrganicOrbSettings, rimHdr?: number) => {
    uFillOpacity.value = settings.fillOpacity;
    uFillWhite.value = settings.fillWhite;
    uRefractStrength.value = settings.refractionStrength;
    uRefractScale.value = settings.refractionScale;
    uNebula.value = settings.nebula;
    uCorePower.value = settings.corePower;
    uCoreAmount.value = settings.coreAmount;
    uRimPower.value = settings.rimPower;
    uRimHdr.value = rimHdr ?? settings.rimHdr;
    uMorphAmp.value = settings.morphAmp;
    uMorphSpeed.value = settings.morphSpeed;
    uMorphScale.value = settings.morphScale;
    uStretchAmp.value = settings.stretchAmt;
    uStretchTrail.value = settings.stretchTrail;
    uPulseSpeed.value = settings.pulseSpeed;
    uPulseSpacing.value = settings.pulseSpacingM;
    uPulseLength.value = settings.pulseLengthM;
    uPulseIdle.value = settings.pulseIdle;
    uPulseAmplitude.value = settings.pulseAmplitude;
    uMeridianAmount.value = settings.meridianAmount;
    uMeridianCount.value = settings.meridianCount;
  };

  const setMotion = (dirX: number, dirZ: number, amount: number) => {
    const dir = uStretchDir.value as Vector3;
    dir.set(dirX, 0, dirZ);
    uStretch.value = amount;
  };

  return {
    material,
    sync,
    setMotion,
    setMorphOriginMul: (value: number) => {
      uMorphOriginMul.value = value;
    },
    dispose: () => {
      material.dispose();
    },
  };
}
