import { TERRAIN_LOD_CONFIG, type TerrainLod } from './terrainLod';

type TileTopology={size:number;offsets:ReadonlyArray<readonly [number,number]>;indices:number[]};
const topologies=new Map<string,TileTopology>();
/** The 3 m World Studio source keeps far and middle mountains on one 18 m grid. */
export function terrainInteriorSubdivisions(lod:TerrainLod,unit:number):number{
  if(lod==='near')return TERRAIN_LOD_CONFIG.nearSize/unit;
  if(lod==='far'&&unit<=3)return TERRAIN_LOD_CONFIG.detailedSourceFarSubdivisions;
  return TERRAIN_LOD_CONFIG[`${lod}Subdivisions`];
}

/** Coarse interiors meet on the same canonical perimeter at every LOD.
 * Refining only boundary cells avoids T-junctions without overlapping skirts
 * or rebuilding a tile when its neighbour finishes streaming.
 */
export function terrainTileTopology(lod:TerrainLod,unit=TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions):TileTopology{
  const key=`${lod}:${unit}`,cached=topologies.get(key);
  if(cached)return cached;
  const config=TERRAIN_LOD_CONFIG;
  const size=config[`${lod}Size`],subdiv=terrainInteriorSubdivisions(lod,unit);
  const ratio=size/subdiv/unit,stride=subdiv+1;
  const offsets:Array<readonly [number,number]>=[],indices:number[]=[];
  const vertices=new Map<string,number>();
  const vertex=(x:number,z:number):number=>{
    const key=`${x}:${z}`,found=vertices.get(key);
    if(found!==undefined)return found;
    const index=offsets.length;
    offsets.push([x*unit,z*unit]);vertices.set(key,index);
    return index;
  };
  // Preserve the playable grid and its collision triangulation exactly.
  for(let z=0;z<=subdiv;z++)for(let x=0;x<=subdiv;x++)vertex(x*ratio,z*ratio);
  for(let z=0;z<subdiv;z++)for(let x=0;x<subdiv;x++){
    const a=z*stride+x,b=a+1,c=a+stride,d=c+1;
    const top=z===0,right=x===subdiv-1,bottom=z===subdiv-1,left=x===0;
    if(ratio===1||!(top||right||bottom||left)){
      indices.push(a,b,c,b,d,c);
      continue;
    }
    const polygon=[a];
    if(top)for(let i=1;i<ratio;i++)polygon.push(vertex(x*ratio+i,z*ratio));
    polygon.push(b);
    if(right)for(let i=1;i<ratio;i++)polygon.push(vertex((x+1)*ratio,z*ratio+i));
    polygon.push(d);
    if(bottom)for(let i=ratio-1;i>0;i--)polygon.push(vertex(x*ratio+i,(z+1)*ratio));
    polygon.push(c);
    if(left)for(let i=ratio-1;i>0;i--)polygon.push(vertex(x*ratio,z*ratio+i));
    // Anchor opposite the refined edges so collinear perimeter vertices
    // produce real surface triangles, never degenerate or vertical faces.
    const anchor=!(top||left)?a:!(top||right)?b:!(bottom||right)?d:c;
    const start=polygon.indexOf(anchor),count=polygon.length;
    for(let i=1;i<count-1;i++)
      indices.push(anchor,polygon[(start+i)%count],polygon[(start+i+1)%count]);
  }
  const topology={size,offsets,indices};
  topologies.set(key,topology);
  return topology;
}

/** Keep only feature-crossed coarse cells at the playable resolution. Fine edge
 * vertices are shared with adjacent coarse cells and all tile perimeters. */
export function featureTerrainTopology(lod:TerrainLod,refine:(x:number,z:number,size:number)=>boolean,
  unit=TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions):TileTopology{
  if(lod==='near')return terrainTileTopology(lod,unit);
  const config=TERRAIN_LOD_CONFIG,size=config[`${lod}Size`],count=terrainInteriorSubdivisions(lod,unit);
  const step=size/count,ratio=step/unit;
  const fine=Array.from({length:count*count},(_,i)=>refine(i%count*step,Math.floor(i/count)*step,step));
  if(!fine.some(Boolean))return terrainTileTopology(lod,unit);
  const offsets:Array<readonly [number,number]>=[],indices:number[]=[],vertices=new Map<string,number>();
  const vertex=(x:number,z:number)=>{const key=`${x}:${z}`,found=vertices.get(key);if(found!==undefined)return found;
    const i=offsets.length;offsets.push([x,z]);vertices.set(key,i);return i;};
  const isFine=(x:number,z:number)=>x<0||z<0||x>=count||z>=count||fine[z*count+x];
  for(let z=0;z<count;z++)for(let x=0;x<count;x++){
    const x0=x*step,z0=z*step;
    if(fine[z*count+x]){
      for(let iz=0;iz<ratio;iz++)for(let ix=0;ix<ratio;ix++){
        const xx=x0+ix*unit,zz=z0+iz*unit;
        const a=vertex(xx,zz),b=vertex(xx+unit,zz),c=vertex(xx,zz+unit),d=vertex(xx+unit,zz+unit);
        indices.push(a,b,c,b,d,c);
      }continue;
    }
    const top=isFine(x,z-1),right=isFine(x+1,z),bottom=isFine(x,z+1),left=isFine(x-1,z);
    const a=vertex(x0,z0),b=vertex(x0+step,z0),c=vertex(x0,z0+step),d=vertex(x0+step,z0+step);
    if(!(top||right||bottom||left)){indices.push(a,b,c,b,d,c);continue;}
    const outline=[a];
    if(top)for(let i=1;i<ratio;i++)outline.push(vertex(x0+i*unit,z0));outline.push(b);
    if(right)for(let i=1;i<ratio;i++)outline.push(vertex(x0+step,z0+i*unit));outline.push(d);
    if(bottom)for(let i=ratio-1;i>0;i--)outline.push(vertex(x0+i*unit,z0+step));outline.push(c);
    if(left)for(let i=ratio-1;i>0;i--)outline.push(vertex(x0,z0+i*unit));
    const center=vertex(x0+step/2,z0+step/2);
    for(let i=0;i<outline.length;i++)indices.push(center,outline[i],outline[(i+1)%outline.length]);
  }
  return {size,offsets,indices};
}
