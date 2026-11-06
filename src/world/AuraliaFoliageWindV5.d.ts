import type { AbstractMesh, Scene } from '@babylonjs/core';

export type AuraliaFoliageController = {
  state: {
    time: number;
    strength: number;
    effectiveStrength: number;
    gust: number;
    direction: [number, number];
    barkStrength: number;
    branchMotion: number;
  };
  readonly materialCount: number;
  readonly barkMaterialCount: number;
  readonly leafMaterialCount: number;
  setStrength(value: number): void;
  setDirection(x: number, z: number): void;
  setBarkStrength(value: number): void;
  setBranchMotion(value: number): void;
  addMeshes(meshes: readonly AbstractMesh[]): number;
  dispose(): void;
};

export function attachAuraliaFoliageWind(
  scene: Scene,
  meshes: readonly AbstractMesh[],
  options?: { strength?: number; direction?: [number, number];
    barkStrength?: number; branchMotion?: number }
): AuraliaFoliageController;

export const attachAuraliaStylizedFoliage: typeof attachAuraliaFoliageWind;
