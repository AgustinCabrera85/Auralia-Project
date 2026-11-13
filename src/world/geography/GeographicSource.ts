import { MAINLAND, sampleMainlandHeight } from '../terrainData';
import { nearTerrainSurfaceAt, terrainFootprintAt } from '../terrainLod';

export type GeographicBounds=readonly [number,number,number,number];
export type GeographicWeights=readonly [number,number,number,number,number,number];
/** One grid-height authority, independent of rendering and persistence. */
export interface GeographicSource {
  readonly id:string;
  readonly seaLevel:number;
  readonly streamed:boolean;
  readonly bounds:GeographicBounds;
  heightAt(x:number,z:number):number;
  weightsAt?(x:number,z:number,height:number,slope:number):GeographicWeights;
  /** Preserve the canonical six-metre surface in geographic corridors at every LOD. */
  preserveDetail?(bounds:GeographicBounds):boolean;
  isReady(bounds:GeographicBounds):boolean;
  prepare(bounds:GeographicBounds):Promise<void>;
}
export const legacyGeography:GeographicSource={
  id:'legacy',seaLevel:MAINLAND.waterLevel,streamed:false,
  bounds:[-Infinity,-Infinity,Infinity,Infinity],heightAt:sampleMainlandHeight,
  isReady:()=>true,prepare:async()=>{}
};

/** Gameplay samples the canonical near triangles, not a separate smooth collider.
 * Object placement and future construction receive this same surface instance.
 */
export class GeographicSurface {
  constructor(readonly source:GeographicSource){}
  surfaceAt(x:number,z:number){return nearTerrainSurfaceAt(x,z,(gx,gz)=>this.source.heightAt(gx,gz));}
  heightAt(x:number,z:number):number{return this.surfaceAt(x,z).height;}
  footprintAt(x:number,z:number,radius:number){
    return terrainFootprintAt(x,z,radius,(gx,gz)=>this.source.heightAt(gx,gz));
  }
}
