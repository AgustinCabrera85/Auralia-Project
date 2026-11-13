import type { GeographicBounds } from '../geography/GeographicSource';
import type { RiverStation, RiverStrip } from '../geography/StudioRivers';
import { riverBankDistance } from './RiverProfile';

export type WaterMeshData={positions:number[];normals:number[];colors:number[];uvs:number[];uv2:number[];indices:number[]};
// Position, UV, flow, then shore/speed/turbulence/depth (the main water layout).
type Vertex=number[];
const acrossSegments=24;

/** Main's bank-following river rows, clipped to streamed cells. The same world
 * stations and banks are used by both water LODs, including their perimeter. */
export class RiverRibbonWriter {
  private readonly rows=new Map<string,Vertex[]>();
  private readonly vertices=new Map<string,number>();
  constructor(private readonly data:WaterMeshData,private readonly bounds:GeographicBounds,
    private readonly groundAt:(x:number,z:number)=>number,
    private readonly levelAt:(x:number,z:number)=>number|null,
    private readonly hiddenAt:(x:number,z:number)=>boolean){}
  private point(s:RiverStation,x:number,z:number,u:number):Vertex{
    const level=this.levelAt(x,z)??s.level,depth=Math.max(0,level-this.groundAt(x,z));
    const hidden=this.hiddenAt(x,z);
    return [x,level+.045,z,u/16,s.along/16,s.dx,s.dz,
      hidden?1:1-Math.min(1,depth/.45),.35,.08,Math.min(1,depth/6)];
  }
  private row(s:RiverStation):Vertex[]{
    const key=`${s.x}:${s.z}:${s.level}`;const found=this.rows.get(key);if(found)return found;
    const nx=s.dz,nz=-s.dx,level=(x:number,z:number)=>this.levelAt(x,z)??s.level;
    const left=riverBankDistance(s.x,s.z,-nx,-nz,s.width,this.groundAt,level);
    const right=riverBankDistance(s.x,s.z,nx,nz,s.width,this.groundAt,level);
    const row=Array.from({length:acrossSegments+1},(_,i)=>{
      const d=-left+(left+right)*i/acrossSegments;return this.point(s,s.x+nx*d,s.z+nz*d,d);});
    this.rows.set(key,row);return row;
  }
  private emit(a:Vertex,b:Vertex,c:Vertex){
    if(a[7]>=1&&b[7]>=1&&c[7]>=1)return;
    let poly=[a,b,c];
    for(const [axis,bound,sign] of [[0,this.bounds[0],1],[0,this.bounds[2],-1],
      [2,this.bounds[1],1],[2,this.bounds[3],-1]]){
      const result:Vertex[]=[];
      for(let i=0;i<poly.length;i++){
        const p=poly[i],q=poly[(i+1)%poly.length],dp=(p[axis]-bound)*sign,dq=(q[axis]-bound)*sign;
        if(dp>=-1e-8)result.push(p);
        if((dp>0&&dq<0)||(dp<0&&dq>0)){
          const t=dp/(dp-dq),v=p.map((n,k)=>n+(q[k]-n)*t);v[axis]=bound;result.push(v);
        }
      }poly=result;if(poly.length<3)return;
    }
    const index=(p:Vertex)=>{
      const key=p.slice(0,3).map(n=>Math.round(n*1e6)).join(':');const existing=this.vertices.get(key);
      if(existing!==undefined)return existing;
      const id=this.data.positions.length/3;this.vertices.set(key,id);
      this.data.positions.push(...p.slice(0,3));this.data.normals.push(0,1,0);
      this.data.uvs.push(p[3],p[4]);this.data.uv2.push(p[5],p[6]);this.data.colors.push(...p.slice(7));return id;
    };
    for(let i=1;i<poly.length-1;i++){
      const a=poly[0],b=poly[i],c=poly[i+1];
      if(Math.abs((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))<1e-9)continue;
      this.data.indices.push(index(a),index(b),index(c));
    }
  }
  private *cap(s:RiverStation,side:number):Generator<void>{
    const center=this.point(s,s.x,s.z,0),edges:{x:number;z:number;radius:number}[]=[];
    for(let i=0;i<=24;i++){
      const angle=i*Math.PI/24,x=s.dz*Math.cos(angle)+s.dx*Math.sin(angle)*side,
        z=-s.dx*Math.cos(angle)+s.dz*Math.sin(angle)*side;
      const radius=riverBankDistance(s.x,s.z,x,z,s.width,this.groundAt,(x,z)=>this.levelAt(x,z)??s.level);
      edges.push({x,z,radius});yield;
    }
    let previous:Vertex[]=[];
    for(let ring=1;ring<=6;ring++){
      const row=edges.map(e=>this.point(s,s.x+e.x*e.radius*ring/6,s.z+e.z*e.radius*ring/6,e.radius*ring/6));
      for(let i=1;i<row.length;i++){
        if(ring===1)this.emit(center,row[i-1],row[i]);
        else {this.emit(previous[i-1],row[i-1],previous[i]);this.emit(row[i-1],row[i],previous[i]);}
      }previous=row;yield;
    }
  }
  *append(strip:RiverStrip):Generator<void>{
    const a=this.row(strip.a);yield;const b=this.row(strip.b);yield;
    for(let i=1;i<a.length;i++){
      this.emit(a[i-1],a[i],b[i-1]);this.emit(a[i],b[i],b[i-1]);
    }yield;
    if(strip.capStart)yield* this.cap(strip.a,-1);
    if(strip.capEnd)yield* this.cap(strip.b,1);
  }
}
