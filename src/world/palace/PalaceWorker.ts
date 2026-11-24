import {buildPalaceModel,type Part} from './PalaceModel';
import {palaceFurnishing} from './PalaceFurnishing';
import {geometry,type Geometry} from './PalaceGeometry';
import {expandGeometry,expandX,expandZ} from './PalaceExpansion';
export function compilePalace(){
  const {parts,doors,anchors}=buildPalaceModel(),{lamps}=palaceFurnishing(parts,doors);
  const batches=new Map<string,Part>();
  for(const part of parts){const g=part.expanded?part.data:expandGeometry(part.data,part.rigid,part.material==='banner');
    for(let i=0;i<g.indices.length;i+=3){
      const ids=g.indices.slice(i,i+3),cx=ids.reduce((s,n)=>s+g.positions[n*3],0)/3,cy=ids.reduce((s,n)=>s+g.positions[n*3+1],0)/3,cz=ids.reduce((s,n)=>s+g.positions[n*3+2],0)/3;
      const material=['SL-PA','portico-balcony-slab'].includes(part.id)&&g.normals[ids[0]*3+1]<-.9?'plaster':part.material;
      const cell=part.detail?20:40,key=`${material}:${part.detail}:${part.solid}:${Math.floor(cx/cell)}:${Math.floor(cz/cell)}:${cy<4.5?0:1}`;
      let batch=batches.get(key);if(!batch){batch={id:key,material,solid:part.solid,detail:part.detail,data:geometry()};batches.set(key,batch);}
      const b=batch.data,base=b.positions.length/3;
      for(const n of ids){b.positions.push(...g.positions.slice(n*3,n*3+3));b.normals.push(...g.normals.slice(n*3,n*3+3));b.uvs.push(...g.uvs.slice(n*2,n*2+2));}
      b.indices.push(base,base+1,base+2);
    }
  }
  return {batches:[...batches.values()].map(p=>({...p,data:Object.fromEntries(Object.entries(p.data).map(([key,value])=>[key,key==='indices'?new Uint32Array(value):new Float32Array(value)])) as unknown as Geometry})),
    doors:doors.map(d=>{const o=d.opening,[x,y,z]=o.center_xyz,f=o.span_axis==='X'?expandX:expandZ,c=o.span_axis==='X'?x:z;return {...d,opening:{...o,center_xyz:[expandX(x),y,expandZ(z)],width:f(c+o.width/2)-f(c-o.width/2)}};}),
    anchors:anchors.map(a=>({...a,point:[expandX(a.point[0]),a.point[1],expandZ(a.point[2])]})),lamps:lamps.map(p=>[expandX(p[0]),p[1],expandZ(p[2])] as [number,number,number])};
}
// Runs only when the palace is requested; no scene work or document access here.
const scope=globalThis as unknown as {postMessage:(v:unknown,transfer:Transferable[])=>void;onmessage:()=>void};
scope.onmessage=()=>{try{const result=compilePalace();scope.postMessage({result},result.batches.flatMap(p=>Object.values(p.data).map(v=>(v as unknown as Float32Array).buffer)));}
  catch(error){scope.postMessage({error:String(error)},[]);}};
