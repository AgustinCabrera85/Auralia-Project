import type { Scene } from "@babylonjs/core";
export interface DoubleJumpPoint {x:number;y:number;z:number;}
export interface DoubleJumpDirection {x:number;z:number;}
export interface SantiDoubleJumpFXOptions {
  intensity?:number;
  scale?:number;
  duration?:number;
  poolSize?:number;
  segments?:number;
  particles?:number;
  color?:[number,number,number];
}
export declare class SantiDoubleJumpFX {
  constructor(scene:Scene,options?:SantiDoubleJumpFXOptions);
  prepare():Promise<void>;
  trigger(feetWorld:DoubleJumpPoint,direction?:DoubleJumpDirection):boolean;
  update(dt:number):void;
  setIntensity(value:number):void;
  setTimeScale(value:number):void;
  reset():void;
  getStats():{activeBursts:number;particles:number;maxParticles:number;maxDrawCalls:number};
  exportMaskDataURL():string;
  dispose():void;
}
