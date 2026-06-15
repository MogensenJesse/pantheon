// src/world/terrain/terrainLoadErrors.ts

export class TerrainPackLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TerrainPackLoadError';
  }
}
