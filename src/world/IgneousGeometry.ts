import { Mesh, Vector3, VertexBuffer } from '@babylonjs/core';

type Vertex={p:Vector3;weights:number[]};
type Triangle=[Vector3,Vector3,Vector3];
const EPS=1e-5;
const side=(p:Vector3,a:Vector3,b:Vector3)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const area=(p:Vertex[])=>Math.abs(p.reduce((sum,v,i)=>{
  const next=p[(i+1)%p.length].p;return sum+v.p.x*next.z-next.x*v.p.z;
},0))*.5;

function halfPlane(poly:Vertex[],a:Vector3,b:Vector3,sign:number,inside:boolean):Vertex[]{
  const result:Vertex[]=[];
  for(let i=0;i<poly.length;i++){
    const u=poly[i],v=poly[(i+1)%poly.length],du=side(u.p,a,b)*sign,dv=side(v.p,a,b)*sign;
    const keepU=inside?du>=-EPS:du<=EPS,keepV=inside?dv>=-EPS:dv<=EPS;
    if(keepU)result.push(u);
    if(keepU!==keepV){
      const t=du/(du-dv);
      result.push({p:Vector3.Lerp(u.p,v.p,t),weights:u.weights.map((w,j)=>w+(v.weights[j]-w)*t)});
    }
  }
  return result;
}

function subtract(poly:Vertex[],cut:Triangle):Vertex[][]{
  const sign=Math.sign(side(cut[2],cut[0],cut[1]));
  let remainder=poly;const outside:Vertex[][]=[];
  for(let i=0;i<3&&remainder.length>=3;i++){
    const a=cut[i],b=cut[(i+1)%3],piece=halfPlane(remainder,a,b,sign,false);
    if(piece.length>=3&&area(piece)>EPS)outside.push(piece);
    remainder=halfPlane(remainder,a,b,sign,true);
  }
  return outside;
}

/** Cut only the rock faces covered by the authored paving. This removes the
 * duplicate surface from both rendering and collision, while retaining exposed
 * rock outside the path. The source GLB stays untouched. Run before registration. */
export function repairIgneousFloors(meshes:readonly Mesh[]):number{
  const paving=new Map<number,Triangle[]>();
  const points=(mesh:Mesh)=>{
    const data=mesh.getVerticesData(VertexBuffer.PositionKind)??[],matrix=mesh.computeWorldMatrix(true),result:Vector3[]=[];
    for(let i=0;i<data.length;i+=3)result.push(Vector3.TransformCoordinates(Vector3.FromArray(data,i),matrix));
    return result;
  };
  for(const mesh of meshes.filter(m=>m.material?.name.includes('Losa de la procesión'))){
    const vertices=points(mesh),indices=mesh.getIndices()??[],normals=mesh.getVerticesData(VertexBuffer.NormalKind);
    for(let i=0;i<indices.length;i+=3){
      const t=Array.from(indices.slice(i,i+3)),triangle=t.map(k=>vertices[k]) as Triangle;
      if(!normals||t.some(k=>normals[k*3+1]<.99)||Math.max(...triangle.map(p=>p.y))-Math.min(...triangle.map(p=>p.y))>.0001)continue;
      const key=Math.round(triangle[0].y*1000),list=paving.get(key)??[];list.push(triangle);paving.set(key,list);
    }
  }
  let repaired=0;
  for(const mesh of meshes.filter(m=>m.material?.name.includes('Macizo continuo de basalto'))){
    const vertices=points(mesh),indices=mesh.getIndices()??[],next:number[]=[];
    const attributes=mesh.getVerticesDataKinds().map(kind=>({kind,size:mesh.getVertexBuffer(kind)!.getSize(),data:Array.from(mesh.getVerticesData(kind)!)}));
    let changed=0;
    for(let i=0;i<indices.length;i+=3){
      const ids=Array.from(indices.slice(i,i+3)),triangle=ids.map(k=>vertices[k]);
      const flat=Math.max(...triangle.map(p=>p.y))-Math.min(...triangle.map(p=>p.y))<.0001;
      const cuts=flat?paving.get(Math.round(triangle[0].y*1000)):undefined;
      const original=triangle.map((p,k)=>({p,weights:[0,1,2].map(j=>Number(j===k))}));
      let pieces=[original];
      if(cuts)for(const cut of cuts){
        if(triangle.every(p=>p.x<Math.min(...cut.map(v=>v.x))-EPS)||triangle.every(p=>p.x>Math.max(...cut.map(v=>v.x))+EPS)||
          triangle.every(p=>p.z<Math.min(...cut.map(v=>v.z))-EPS)||triangle.every(p=>p.z>Math.max(...cut.map(v=>v.z))+EPS))continue;
        pieces=pieces.flatMap(poly=>subtract(poly,cut));
      }
      if(!cuts||area(original)-pieces.reduce((sum,p)=>sum+area(p),0)<EPS){next.push(...ids);continue;}
      changed++;
      for(const poly of pieces){
        const polyIndices=poly.map(v=>{
          const index=attributes.find(a=>a.kind===VertexBuffer.PositionKind)!.data.length/3;
          for(const a of attributes)for(let component=0;component<a.size;component++)
            a.data.push(ids.reduce((sum,id,k)=>sum+a.data[id*a.size+component]*v.weights[k],0));
          return index;
        });
        for(let k=1;k<polyIndices.length-1;k++)next.push(polyIndices[0],polyIndices[k],polyIndices[k+1]);
      }
    }
    if(changed){
      mesh.makeGeometryUnique();
      for(const a of attributes)mesh.setVerticesData(a.kind,a.data,false,a.size);
      mesh.setIndices(next);mesh.refreshBoundingInfo();
      mesh.metadata={...mesh.metadata,igneousFloorRepair:changed};repaired+=changed;
    }
  }
  return repaired;
}
