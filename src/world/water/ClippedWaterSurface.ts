import { Mesh, Scene, TransformNode, VertexData, type ShaderMaterial } from '@babylonjs/core';
import type { ActiveWorldGeography } from '../geography/ActiveGeography';
import { MAINLAND } from '../terrainData';
import { nearTerrainHeightAt } from '../terrainLod';
type Point={x:number;z:number;level:number;depth:number;wet:boolean;pool:boolean};

/** A planar partition of XZ: each triangle is emitted once, regardless of how
 * many river axes overlap. Dry vertices are clipped, never bent down/up banks. */
export function* clippedWaterSurface(scene:Scene,parent:TransformNode,g:ActiveWorldGeography,
    cx:number,cz:number,lod:'near'|'far',riverMaterial:ShaderMaterial,poolMaterial:ShaderMaterial):Generator<void,Mesh|null,void>{
  const size=MAINLAND.chunkSize,bounds=[cx*size,cz*size,(cx+1)*size,(cz+1)*size] as const;
  const hasRiver=g.source.preserveDetail?.(bounds)??false;
  const step=lod==='near'||hasRiver?3:12;
  const positions:number[]=[],normals:number[]=[],colors:number[]=[],uvs:number[]=[],uv2:number[]=[],indices:number[]=[];
  const cache=new Map<string,Point>(),heights=new Map<string,number>();
  let pool=0,river=0;
  const ground=(x:number,z:number)=>{const key=`${x}:${z}`;let h=heights.get(key);
    if(h===undefined){h=g.source.heightAt(x,z);heights.set(key,h);}return h;};
  const at=(x:number,z:number):Point=>{
    const key=`${x}:${z}`,known=cache.get(key);if(known)return known;
    const field=g.ownsLagoon(x,z)?null:g.waterFieldAt!(x,z),height=nearTerrainHeightAt(x,z,ground);
    const level=field?.level??0,depth=level-height;
    const point={x,z,level,depth,wet:!!field&&depth>0,pool:field?.kind==='lake'||field?.kind==='lagoon'};
    cache.set(key,point);return point;
  };
  const crossing=(a:Point,b:Point):Point=>{
    // A canonical ordering makes the same edge bit-identical in neighboring
    // triangles/chunks, including when their winding is reversed.
    if(a.x>b.x||a.x===b.x&&a.z>b.z)[a,b]=[b,a];
    let lo=0,hi=1;const inside=a.wet;
    for(let i=0;i<12;i++){const t=(lo+hi)/2,p=at(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
      if(p.wet===inside)lo=t;else hi=t;}
    // Stay on the wet side so the boundary always has a real water datum.
    const t=inside?lo:hi;return at(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
  };
  const emit=(corners:Point[])=>{
    const polygon:Point[]=[];
    for(let i=0;i<3;i++){const a=corners[i],b=corners[(i+1)%3];
      if(a.wet)polygon.push(a);if(a.wet!==b.wet)polygon.push(crossing(a,b));}
    if(polygon.length<3)return;
    const start=positions.length/3;
    for(const p of polygon){
      const flow=p.pool?{directionX:0,directionZ:0,velocity:0,turbulence:.02}:g.flowAt(p.x,p.z),depth=Math.max(0,p.depth);
      positions.push(p.x,p.level+.035,p.z);normals.push(0,1,0);uvs.push(p.x/16,p.z/16);uv2.push(flow.directionX,flow.directionZ);
      colors.push(1-Math.min(1,depth/.5),Math.min(1,flow.velocity/4),flow.turbulence,Math.min(1,depth/5));
      if(p.pool)pool++;else river++;
    }
    for(let i=1;i<polygon.length-1;i++)indices.push(start,start+i,start+i+1);
  };
  const cell=(x:number,z:number,s:number)=>{
    const a=at(x,z),b=at(x+s,z),c=at(x+s,z+s),d=at(x,z+s);
    emit([a,b,d]);emit([b,c,d]);
  };
  for(let iz=0;iz<size/step;iz++)for(let ix=0;ix<size/step;ix++){
    yield;
    const x=bounds[0]+ix*step,z=bounds[1]+iz*step;
    const points=[at(x,z),at(x+step,z),at(x+step,z+step),at(x,z+step),at(x+step/2,z+step/2)];
    if(!points.some(p=>p.wet))continue;
    // Lake interiors are planar; a T-junction on a straight coplanar edge
    // creates no gap. Only real banks need the common 3 m contour spacing.
    const parts=step>3&&points.some(p=>!p.wet||p.depth<1)?step/3:1;
    for(let j=0;j<parts;j++)for(let i=0;i<parts;i++)cell(x+i*step/parts,z+j*step/parts,step/parts);
  }
  if(!indices.length)return null;
  yield;
  const mesh=new Mesh(`agua-${lod}-unica-${cx}-${cz}`,scene),data=new VertexData();
  data.positions=positions;data.normals=normals;data.colors=colors;data.uvs=uvs;data.uvs2=uv2;data.indices=indices;data.applyToMesh(mesh);
  mesh.parent=parent;mesh.material=pool>river?poolMaterial:riverMaterial;mesh.useVertexColors=true;mesh.hasVertexAlpha=false;
  mesh.isPickable=false;mesh.checkCollisions=false;mesh.metadata={inlandWater:true,waterLod:lod,cx,cz,singleSurface:true};mesh.freezeWorldMatrix();return mesh;
}
