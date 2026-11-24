import { Vector3, type Mesh } from '@babylonjs/core';

export type VerticalHit={height:number;normalY:number;distance:number};
/** Exact vertical queries for immutable building geometry. Packed world vertices
 * and face buckets avoid Babylon expanding all vertices into Vector3 objects on
 * the first rain ray, then scanning a merged building for every single drop. */
export class StaticVerticalIndex {
  private readonly points:Float32Array;
  private readonly indices:ArrayLike<number>;
  private readonly cells=new Map<string,Uint32Array>();
  private readonly cellSize=4;
  constructor(mesh:Mesh){
    const vertices=mesh.getVerticesData('position')??[];
    this.indices=mesh.getIndices()??[];
    this.points=new Float32Array(vertices.length);
    const matrix=mesh.computeWorldMatrix(true),point=new Vector3(),world=new Vector3();
    for(let i=0;i<vertices.length;i+=3){
      point.set(vertices[i],vertices[i+1],vertices[i+2]);Vector3.TransformCoordinatesToRef(point,matrix,world);
      this.points[i]=world.x;this.points[i+1]=world.y;this.points[i+2]=world.z;
    }
    const buckets=new Map<string,number[]>(),p=this.points;
    for(let face=0;face<this.indices.length;face+=3){
      const a=this.indices[face]*3,b=this.indices[face+1]*3,c=this.indices[face+2]*3;
      const area=(p[b]-p[a])*(p[c+2]-p[a+2])-(p[c]-p[a])*(p[b+2]-p[a+2]);
      if(Math.abs(area)<1e-8)continue;
      const x0=Math.floor(Math.min(p[a],p[b],p[c])/this.cellSize),x1=Math.floor(Math.max(p[a],p[b],p[c])/this.cellSize);
      const z0=Math.floor(Math.min(p[a+2],p[b+2],p[c+2])/this.cellSize),z1=Math.floor(Math.max(p[a+2],p[b+2],p[c+2])/this.cellSize);
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
        const key=`${x}:${z}`,bucket=buckets.get(key);
        if(bucket)bucket.push(face);else buckets.set(key,[face]);
      }
    }
    for(const [key,faces] of buckets)this.cells.set(key,Uint32Array.from(faces));
  }
  hit(x:number,z:number,origin:number,reach:number,up=false):VerticalHit|null{
    const faces=this.cells.get(`${Math.floor(x/this.cellSize)}:${Math.floor(z/this.cellSize)}`);
    if(!faces)return null;
    const p=this.points;let best:VerticalHit|null=null;
    for(const face of faces){
      const a=this.indices[face]*3,b=this.indices[face+1]*3,c=this.indices[face+2]*3;
      const ux=p[b]-p[a],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vz=p[c+2]-p[a+2];
      const dx=x-p[a],dz=z-p[a+2],det=ux*vz-uz*vx;
      const v=(dx*vz-dz*vx)/det,w=(ux*dz-uz*dx)/det;
      if(v<-.000001||w<-.000001||v+w>1.000001)continue;
      const uy=p[b+1]-p[a+1],vy=p[c+1]-p[a+1],height=p[a+1]+v*uy+w*vy;
      const distance=(height-origin)*(up?1:-1);
      if(distance<0||distance>reach||best&&distance>=best.distance)continue;
      const nx=uy*vz-uz*vy,nz=ux*vy-uy*vx;
      best={height,distance,normalY:Math.abs(det)/Math.hypot(nx,det,nz)};
    }
    return best;
  }
}
