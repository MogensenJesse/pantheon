// src/world/water/sync/syncWaterWaveUniforms.ts — per-frame wave drive: the swell and the shore waves from the config and the wind
import { Color } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { windUniforms } from '../../../rendering/ambience/windUniforms';
import { waterWaveUniforms as U } from '../material/waterWaveUniforms';
import {
  effectiveShoalDepthM,
  shoreDerived,
  swellTable,
  swellTotalHeightM,
  waveEnergy,
  whitecapStrength,
} from '../waves/waveMath';

const _foamColor = new Color();
let lastFoamHex = '';
let energyNow = 0;
let swashPeakNow = 0;

/** Wave energy 0..1 (calm to storm) as of the last sync: the wind boost, read by the mirror plane's headroom. */
export function currentWaveEnergy(): number {
  return energyNow;
}

/** The highest the swash lifts the sea at the shore (m above the mean level) as of the last sync: read by the mirror plane's headroom. */
export function currentSwashPeakM(): number {
  return swashPeakNow;
}

/** Reads the (DEV-editable) wave config and the wind every frame, so edits and weather apply at once. */
export function syncWaterWaveUniforms(): void {
  const { swell, shore, lake } = VISUAL.water.waves;
  const energy = waveEnergy(windUniforms.uWindBoost.value, swell.fullEnergyBoost);
  energyNow = energy;
  const d = shoreDerived(shore, energy);
  swashPeakNow = shore.enabled ? d.swashH * (1 - shore.recedeShare) : 0;
  U.uShoreEnabled.value = shore.enabled ? 1 : 0;
  U.uShoreFoamAmount.value = d.foamAmount;
  U.uShorePeriodS.value = shore.periodS;
  U.uShoreBreakM.value = d.breakM;
  U.uShoreSwashH.value = d.swashH;
  U.uShoreRiseShare.value = shore.riseShare;
  U.uShoreBackwash.value = shore.backwashShare;
  U.uShoreRecede.value = shore.recedeShare;
  U.uShoreSeaW.value = d.seaW;
  U.uShoreGateH.value = d.gateH;
  U.uShoreLobeM.value = shore.lobeM;
  U.uShoreLobeShare.value = shore.lobeShare;
  U.uShoreTrailM.value = shore.trailM;
  U.uShoreFringeM.value = shore.fringeM;
  U.uShoreAlongM.value = shore.alongShoreM;
  U.uShoreWobble.value = shore.wobble;
  U.uShoreDampH.value = d.dampH;
  U.uShoreDryShare.value = shore.dryShare;
  U.uWetSandDarken.value = shore.wetSandDarken;
  U.uShoreEdgeLiftM.value = VISUAL.water.waves.mesh.edgeLiftM;
  U.uShoreMoistM.value = shore.moistWidthM;
  U.uShoreMoistH.value = shore.moistHeightM;
  U.uMoistDarken.value = shore.moistDarken;
  U.uLakeSwellShare.value = lake.swellShare;
  U.uLakeSwashShare.value = lake.swashShare;
  U.uLakeFoamShare.value = lake.foamShare;
  U.uLakeRippleShare.value = lake.rippleShare;
  U.uShoreSlopeStepM.value = shore.shoreSlopeStepM;
  U.uShoreMaxSlope.value = shore.shoreMaxSlope;
  U.uShoreFogBypass.value = VISUAL.water.shoreDepth.fogBypassStrength;
  syncSwell(swell, energy);
  if (shore.foamColor !== lastFoamHex) {
    _foamColor.set(shore.foamColor);
    (U.uFoamColor.value as Color).copy(_foamColor);
    lastFoamHex = shore.foamColor;
  }
}

function syncSwell(swell: typeof VISUAL.water.waves.swell, energy: number): void {
  const S = U.swell;
  const height = swellTotalHeightM(swell, energy);
  S.uHeightM.value = height;
  S.uShoalM.value = effectiveShoalDepthM(swell, height);
  S.uSteepness.value = swell.steepness;
  S.uOpenGain.value = swell.openSea.gain;
  S.uOpenFromM.value = swell.openSea.fromM;
  S.uOpenToM.value = Math.max(swell.openSea.toM, swell.openSea.fromM + 1e-3);
  S.uWhiteCrest.value.set(swell.whitecap.crestFrom, swell.whitecap.crestTo);
  S.uWhiteAmount.value = whitecapStrength(swell, energy);
  const table = swellTable(swell);
  S.components.forEach((c, i) => {
    const w = table[i];
    c.uK.value = w ? w.k : 0;
    c.uOmega.value = w ? w.omega : 0;
    c.uAmp.value = w ? w.amp : 0;
    c.uPhase.value = w ? w.phase : 0;
    const L = swell.components[i]?.wavelengthM ?? 1;
    c.uFade.value.set(swell.fadeFromWavelengths * L, swell.fadeToWavelengths * L);
  });
}
