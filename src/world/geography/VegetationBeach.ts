import type {GeographicSource} from './GeographicSource';
import {nearTerrainSurfaceAt} from '../terrainLod';

/** Use the same sand blend as the rendered coast, including repaired beaches.
 * Check the crown too so trees on the grass edge cannot overhang the beach. */
export function vegetationTouchesBeach(source:GeographicSource,x:number,z:number,radius:number,
  heightAt=(x:number,z:number)=>source.heightAt(x,z)):boolean{
  if(!source.weightsAt)return false;
  for(let i=-1;i<8;i++){
    const px=x+(i<0?0:Math.cos(i*Math.PI/4)*radius);
    const pz=z+(i<0?0:Math.sin(i*Math.PI/4)*radius);
    const s=nearTerrainSurfaceAt(px,pz,heightAt,source.meshSpacing);
    // High sandy plateaus retain their separate arid vegetation rules.
    if(s.height>source.seaLevel+35)continue;
    if(source.weightsAt(px,pz,s.height,Math.hypot(s.slopeX,s.slopeZ))[3]>=.35)return true;
  }
  return false;
}
