import type { Camera, PointLight, Scene, Vector3 } from '@babylonjs/core';
export type FlameQuality='low'|'medium'|'high';
export interface FlameHit {distance:number;normal?:{x:number;y:number;z:number};}
export interface FlameParameters {length?:number;width?:number;intensity?:number;}
export interface FlameOptions extends FlameParameters {
  quality?:FlameQuality;
  createLights?:boolean;
  hitHz?:number;
  /** World-space, synchronous, read-only inputs. Return nearest blocking hit or null. */
  resolveHit?:(origin:Vector3,direction:Vector3,maxDistance:number)=>FlameHit|null|undefined;
}
export interface FlameState {
  phase:'off'|'ignition'|'flow'|'cooling'|'disposed';active:boolean;energy:number;clock:number;
  quality:FlameQuality;length:number;visibleLength:number;width:number;intensity:number;
  hit:boolean;hitDistance:number|null;queries:number;error:string|null;enabledMeshes:number;disposed:boolean;
}
export declare const FLAME_QUALITY:Readonly<Record<FlameQuality,Readonly<{steps:number;sparks:number;impactSparks:number}>>>;
export declare class FlameJetFX {
  constructor(scene:Scene,options?:FlameOptions);
  readonly scene:Scene;readonly quality:FlameQuality;readonly disposed:boolean;
  readonly origin:Vector3;readonly direction:Vector3;readonly clock:number;
  readonly energy:number;readonly active:boolean;readonly paused:boolean;
  readonly muzzleLight:PointLight|null;readonly impactLight:PointLight|null;
  resolveHit:FlameOptions['resolveHit'];
  setEmitter(position:{x:number;y:number;z:number},direction:{x:number;y:number;z:number}):void;
  setActive(value:boolean):void;
  prepare():Promise<void>;
  setParameters(options:FlameParameters):void;
  setPaused(value:boolean):void;
  update(deltaSeconds:number,camera?:Camera):void;
  reset():void;
  getState():FlameState;
  dispose():void;
}
