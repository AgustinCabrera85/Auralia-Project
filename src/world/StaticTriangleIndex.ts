import { Mesh, PickingInfo, Ray, Vector3, VertexBuffer } from '@babylonjs/core';

type Surface={mesh:Mesh;points:Vector3[];indices:ArrayLike<number>};
type Triangle={surface:Surface;face:number;low:number;high:number;normalY:number};

/** Exact world-space triangles in X/Z cells. Static imported sectors may span the
 * whole cavern; their mesh bounds alone are too broad for repeated capsule rays. */
export class StaticTriangleIndex {
  private readonly cells=new Map<string,Triangle[]>();
  private readonly meshes=new Set<Mesh>();
  private readonly meshCells=new Map<Mesh,Set<string>>();
  private readonly cellSize=10;
  has(mesh:Mesh){return this.meshes.has(mesh);}
  add(mesh:Mesh):void{
    if(this.meshes.has(mesh))return;
    const vertices=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();
    if(!vertices||!indices)return;
    this.meshes.add(mesh);
    const occupied=new Set<string>();this.meshCells.set(mesh,occupied);
    const matrix=mesh.computeWorldMatrix(true),points:Vector3[]=[];
    for(let i=0;i<vertices.length;i+=3)points.push(Vector3.TransformCoordinates(Vector3.FromArray(vertices,i),matrix));
    const surface:Surface={mesh,points,indices},normals=mesh.getVerticesData(VertexBuffer.NormalKind);
    for(let face=0;face<indices.length/3;face++){
      const a=points[indices[face*3]],b=points[indices[face*3+1]],c=points[indices[face*3+2]];
      const normal=Vector3.Cross(b.subtract(a),c.subtract(a)).normalize();
      if(normals){
        const authored=Vector3.Zero();
        for(let k=0;k<3;k++)authored.addInPlace(Vector3.FromArray(normals,indices[face*3+k]*3));
        if(Vector3.Dot(normal,Vector3.TransformNormal(authored,matrix))<0)normal.negateInPlace();
      }
      const triangle:Triangle={surface,face,low:Math.min(a.y,b.y,c.y),high:Math.max(a.y,b.y,c.y),normalY:normal.y};
      const minX=Math.floor(Math.min(a.x,b.x,c.x)/this.cellSize),maxX=Math.floor(Math.max(a.x,b.x,c.x)/this.cellSize);
      const minZ=Math.floor(Math.min(a.z,b.z,c.z)/this.cellSize),maxZ=Math.floor(Math.max(a.z,b.z,c.z)/this.cellSize);
      for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
        const key=x+','+z;occupied.add(key);let cell=this.cells.get(key);if(!cell)this.cells.set(key,cell=[]);cell.push(triangle);
      }
    }
  }
  hits(ray:Ray,candidates:ReadonlySet<Mesh>,minNormalY=-Infinity):PickingInfo[]{
    if(!candidates.size)return [];
    const end=ray.origin.add(ray.direction.scale(ray.length));
    const minX=Math.floor(Math.min(ray.origin.x,end.x)/this.cellSize),maxX=Math.floor(Math.max(ray.origin.x,end.x)/this.cellSize);
    const minZ=Math.floor(Math.min(ray.origin.z,end.z)/this.cellSize),maxZ=Math.floor(Math.max(ray.origin.z,end.z)/this.cellSize);
    const low=Math.min(ray.origin.y,end.y)-.0001,high=Math.max(ray.origin.y,end.y)+.0001;
    const visited=new Set<Triangle>(),nearest=new Map<Mesh,PickingInfo>();
    for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(const t of this.cells.get(x+','+z)??[]){
      if(t.low>high||t.high<low||t.normalY<minNormalY||visited.has(t))continue;visited.add(t);
      const {mesh,points,indices}=t.surface;
      if(!candidates.has(mesh)||mesh.isDisposed()||!mesh.isEnabled())continue;
      const n=t.face*3,hit=ray.intersectsTriangle(points[indices[n]],points[indices[n+1]],points[indices[n+2]]);
      if(!hit||hit.distance<0||hit.distance>ray.length||hit.distance>=(nearest.get(mesh)?.distance??Infinity))continue;
      const pick=new PickingInfo();pick.hit=true;pick.distance=hit.distance;pick.bu=hit.bu??0;pick.bv=hit.bv??0;
      pick.faceId=t.face;pick.pickedMesh=mesh;pick.pickedPoint=ray.origin.add(ray.direction.scale(hit.distance));
      nearest.set(mesh,pick);
    }
    return [...nearest.values()];
  }
  remove(mesh:Mesh):void{
    for(const key of this.meshCells.get(mesh)??[]){
      const cell=this.cells.get(key)!.filter(t=>t.surface.mesh!==mesh);
      if(cell.length)this.cells.set(key,cell);else this.cells.delete(key);
    }
    this.meshCells.delete(mesh);this.meshes.delete(mesh);
  }
  clear():void{this.cells.clear();this.meshes.clear();this.meshCells.clear();}
}
