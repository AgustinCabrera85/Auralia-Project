import type { Camera, Scene } from '@babylonjs/core';
export type RainQuality='low'|'medium'|'high';
export interface RainSurface { height:number; kind?:'ground'|'water'|'none'; }
export interface RainOptions {
  quality?:RainQuality;
  intensity?:number;
  span?:number;
  columnHeight?:number;
  speed?:number;
  opacity?:number;
  brightness?:number;
  color?:string;
  wind?:{x:number;z:number};
  groundY?:number;
  /** Synchronous, topmost rain receiving surface in WORLD coordinates. null for unloaded tiles. */
  getSurfaceAt?:(x:number,z:number)=>RainSurface|number|null|undefined;
  surfaceBudget?:number;
  /** Soft CPU budget; one indivisible surface query can exceed it. */
  surfaceTimeBudgetMs?:number;
}
export const RAIN_QUALITY:Readonly<Record<RainQuality,Readonly<{drops:number;splashes:number;grid:number}>>>;
export class RainFX {
  constructor(scene:Scene,options?:RainOptions);
  readonly disposed:boolean;
  readonly quality:RainQuality;
  readonly intensity:number;
  readonly targetIntensity:number;
  setIntensity(value:number,seconds?:number):void;
  setWind(x:number,z:number):void;
  setBrightness(value:number):void;
  setPaused(value:boolean):void;
  invalidateSurfaces():void;
  reset():void;
  update(dt:number,camera?:Camera):void;
  getStats():{quality:RainQuality;drops:number;splashes:number;drawCalls:number;surfaceReady:boolean;surfaceProgress:number;surfaceBudget:number;surfaceTimeBudgetMs:number;surfaceQueries:number;surfaceLastQueries:number;surfaceMs:number;surfaceUploads:number;intensity:number;disposed:boolean};
  dispose():void;
}
