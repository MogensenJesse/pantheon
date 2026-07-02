// src/world/water/PantheonWaterNodeMaterial.ts — valley fog with shore/refraction bypass
import { float, output, vec4 } from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import { getValleyFogAreaNode, getValleyFogUniforms } from '../../rendering/atmosphere/valleyFog';

type TslNode = any;

/**
 * Water uses masked scene fog so night haze does not fully wash out shallow
 * refraction/translucency at the coast.
 */
export class PantheonWaterNodeMaterial extends NodeMaterial {
  /** TSL [0,1] — fraction of valley fog to remove (shore / refraction zones). */
  fogBypassNode: TslNode | null = null;

  setupFog(builder: any, outputNode: TslNode) {
    const fogArea = getValleyFogAreaNode();
    const fogU = getValleyFogUniforms();

    if (!fogArea || !fogU || !this.fogBypassNode) {
      return super.setupFog(builder, outputNode);
    }

    output.assign(outputNode);
    const maskedFactor = fogArea.mul(float(1).sub(this.fogBypassNode)).clamp(0, 1);
    const foggedRgb = maskedFactor.mix(output.rgb, (fogU as TslNode).uFogColor);
    return vec4(foggedRgb, output.a);
  }
}
