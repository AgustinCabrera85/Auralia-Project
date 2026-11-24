import type { Camera, Scene, Vector3 } from '@babylonjs/core';
export type WorldPoint={x:number;y:number;z:number};
export interface RainbowOptions { skyOpacity?:number;saturation?:number;skyDistance?:number;fadeSeconds?:number;secondary?:boolean;clipHorizon?:boolean;maxWaterfalls?:number;segments?:number;enabled?:boolean; }
export interface RainbowState { sunDirection?:WorldPoint;sunVisibility?:number;isDay?:boolean;rainAmount?:number; }
export interface WaterfallOptions {position:WorldPoint;width?:number;height?:number;intensity?:number;opacity?:number;maxDistance?:number;enabled?:boolean;}
export interface WaterfallRainbow {readonly position:Vector3;readonly disposed:boolean;setPosition(position:WorldPoint):void;setIntensity(value:number):void;setEnabled(enabled:boolean):void;dispose():void;}
export class RainbowFX {
  constructor(scene:Scene,options?:RainbowOptions);
  readonly disposed:boolean;
  skyOpacity:number;saturation:number;secondary:boolean;clipHorizon:boolean;
  addWaterfall(options:WaterfallOptions):WaterfallRainbow;
  update(dt:number,camera?:Camera,state?:RainbowState):void;
  setEnabled(enabled:boolean):void;setPaused(paused:boolean):void;reset():void;
  getStats():{drawCalls:number;waterfalls:number;visibleWaterfalls:number;skyAlpha:number;geometryBytes:number;textures:number;disposed:boolean};
  dispose():void;
}
// Entrega 00000012

