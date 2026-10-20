// Types for the parts of ktxEncoder.mjs the dev server uses.
export function detectKtxTools(): {
  ktx: string | null;
  toktx: string | null;
  encoder: 'toktx' | 'ktx' | null;
  canEncode: boolean;
  canValidateKtx: boolean;
  gltfTransform: boolean;
  validator: boolean;
};
