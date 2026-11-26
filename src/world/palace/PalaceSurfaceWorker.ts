import {palaceSurfaceMaps,type PalaceSurface} from './PalaceSurfaceMaps';

export type PreparedSurface=Pick<ReturnType<typeof palaceSurfaceMaps>,'size'|'albedo'|'normalHeight'|'orm'>;
const scope=globalThis as unknown as {onmessage:(e:MessageEvent<{stone:Uint8ClampedArray;clay:Uint8ClampedArray}>)=>void;postMessage:(message:unknown,transfer?:Transferable[])=>void};
// Bake only when this distant building is requested. The high resolution
// relief/roughness work must not freeze the game's main render thread.
scope.onmessage=({data})=>{
  try{
    const surfaces:Partial<Record<PalaceSurface,PreparedSurface>>={};
    for(const kind of ['limestone','cutstone','flagstone','masonry','whiteMarble','clay','earth','cloth','stucco','floorboards'] as const){
      const detail=kind==='clay'?data.clay:['limestone','cutstone','flagstone','masonry','whiteMarble'].includes(kind)?data.stone:undefined;
      const {size,albedo,normalHeight,orm}=palaceSurfaceMaps(kind,detail?1024:512,detail);
      surfaces[kind]={size,albedo,normalHeight,orm};
    }
    scope.postMessage({surfaces},Object.values(surfaces).flatMap(s=>[s.albedo.buffer,s.normalHeight.buffer,s.orm.buffer]));
  }catch(error){scope.postMessage({error:String(error)});}
};
