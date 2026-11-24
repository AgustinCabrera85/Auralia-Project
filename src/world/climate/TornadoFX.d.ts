import type { Camera, Scene } from '@babylonjs/core';
export type TornadoPoint={x:number;y:number;z:number};
export type TornadoType='rope'|'cone'|'wedge';
export const TORNADO_TYPES:Readonly<Record<TornadoType,Readonly<{name:string;base:number;neck:number;shoulder:number;power:number;bend:number;cloud:number;ground:number}>>>;
export interface TornadoOptions {atlasUrl?:string;type?:TornadoType;height?:number;cloudRadius?:number;groundRadius?:number;speed?:number;rotationSpeed?:number;twist?:number;dustAmount?:number;particleAmount?:number;intensity?:number;brightness?:number;cloudOpacity?:number;funnelOpacity?:number;groundOpacity?:number;seed?:number;duration?:number;fadeIn?:number;fadeOut?:number;nearDistance?:number;farDistance?:number;maxDistance?:number;}
export class TornadoFX {
 constructor(scene:Scene,options?:TornadoOptions);
 readonly disposed:boolean;readonly position:TornadoPoint;type:TornadoType;height:number;cloudRadius:number;groundRadius:number;speed:number;rotationSpeed:number;twist:number;dustAmount:number;particleAmount:number;groundOpacity:number;cloudOpacity:number;funnelOpacity:number;brightness:number;
 prepare():Promise<this>;play(options?:{position?:TornadoPoint;normal?:TornadoPoint;type?:TornadoType;height?:number;intensity?:number;duration?:number}):boolean;
 setType(type:TornadoType):this;setSize(size:{height?:number;cloudRadius?:number;groundRadius?:number}):this;setPosition(p:TornadoPoint):this;setGroundNormal(n:TornadoPoint):this;setLighting(brightness:number,direction?:TornadoPoint):this;setIntensity(v:number):this;
 setSwirl(options:{rotationSpeed?:number;twist?:number}):this;setDust(options:{dustAmount?:number;particleAmount?:number}):this;setLOD(mode:'auto'|'near'|'far'):this;setPaused(paused:boolean):this;stop(immediate?:boolean):this;reset():void;update(dtSeconds:number,camera?:Camera):void;getStats():{active:boolean;ready:boolean;type:TornadoType;lod:string;drawCalls:number;triangles:number;dustSprites:number;debrisParticles:number;particles3D:number;textures:number;textureResolution:number;funnelRepresentation:string;continuousCloud:boolean};dispose():void;
}
