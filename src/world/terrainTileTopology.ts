import { TERRAIN_LOD_CONFIG, type TerrainLod } from './terrainLod';

type TileTopology={size:number;offsets:ReadonlyArray<readonly [number,number]>;indices:number[]};
const topologies=new Map<TerrainLod,TileTopology>();

/** Coarse interiors meet on the same six-metre perimeter at every LOD.
 * Refining only boundary cells avoids T-junctions without overlapping skirts
 * or rebuilding a tile when its neighbour finishes streaming.
 */
export function terrainTileTopology(lod:TerrainLod):TileTopology{
  const cached=topologies.get(lod);
  if(cached)return cached;
  const config=TERRAIN_LOD_CONFIG;
  const size=config[`${lod}Size`],subdiv=config[`${lod}Subdivisions`];
  const unit=config.nearSize/config.nearSubdivisions;
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
  topologies.set(lod,topology);
  return topology;
}
