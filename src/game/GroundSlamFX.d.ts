import type { Scene, Mesh } from "@babylonjs/core";
export interface GroundSlamPoint {x:number;y:number;z:number;}
export interface GroundSlamImpactOptions {
  intensity?:number;
  radius?:number;
  /** Ambient visibility multiplier for the unlit dust/wave; debris uses scene lights. */
  brightness?:number;
  dustColor?:[number,number,number];
  earthColor?:[number,number,number];
  /** Captured support for this impact; avoids live collider queries per vertex. */
  sampleHeight?:(worldX:number,worldZ:number)=>number|null|undefined;
}
export interface GroundSlamFXOptions extends GroundSlamImpactOptions {
  poolSize?:number;
  dustCount?:number;
  debrisCount?:number;
  segments?:number;
}
export declare class GroundSlamFX {
  readonly meshes:readonly Mesh[];
  constructor(scene:Scene,options?:GroundSlamFXOptions);
  prepare():Promise<void>;
  trigger(worldPoint:GroundSlamPoint,normal?:GroundSlamPoint,options?:GroundSlamImpactOptions):boolean;
  update(dt:number):void;
  setIntensity(value:number):void;
  setTimeScale(value:number):void;
  reset():void;
  getStats():{activeBursts:number;dustPuffs:number;debris:number;maxDrawCalls:number;maxDustPuffs:number;maxDebris:number};
  exportMaskDataURL():string;
  dispose():void;
}
