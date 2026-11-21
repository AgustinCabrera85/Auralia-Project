import type { Scene } from "@babylonjs/core";
export type DustSurface = "dirt"|"soil"|"grass"|"sand"|"stone"|"rock"|"water"|"wood"|"paved"|"snow"|"metal"|"lava";
export interface DustPoint { x:number;y:number;z:number; }
export interface DustGround {
  height:number;
  surface?:DustSurface;
  wetness?:number;
  normalY?:number;
}
export interface SantiSprintDustOptions {
  minSpeed?:number;
  stopSpeed?:number;
  stride?:number;
  maxBurstsPerSecond?:number;
  intensity?:number;
  scale?:number;
  footHalfWidth?:number;
  groundOffset?:number;
  maxGroundGap?:number;
  capacity?:number;
  sampleGround?:((worldX:number,worldZ:number,feetY:number)=>DustGround|null)|null;
}
export interface SantiSprintDustFrame {
  dt:number;
  position:DustPoint;
  grounded:boolean;
  sprinting?:boolean;
  enabled?:boolean;
  surface?:DustSurface;
  wetness?:number;
}
export declare class SantiSprintDust {
  constructor(scene:Scene,options?:SantiSprintDustOptions);
  update(frame:SantiSprintDustFrame):number;
  reset(forgetPosition?:boolean):void;
  setIntensity(value:number):void;
  getActiveCount():number;
  exportMaskDataURL():string;
  dispose():void;
}
