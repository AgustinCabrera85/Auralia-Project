import { Material, Mesh, VertexBuffer, VertexData } from '@babylonjs/core';

/** Compact a triangle subset without losing imported UVs, normals or tangents. */
export function wayfindingMeshPart(mesh:Mesh,selected:number[]):VertexData{
  const vertices=[...new Set(selected)],remap=new Map(vertices.map((index,i)=>[index,i]));
  const data=new VertexData();data.indices=selected.map(i=>remap.get(i)!);
  for(const kind of mesh.getVerticesDataKinds()){
    const source=mesh.getVerticesData(kind),size=mesh.getVertexBuffer(kind)!.getSize();
    if(!source)continue;
    const values=new Float32Array(vertices.length*size);
    vertices.forEach((v,i)=>{for(let k=0;k<size;k++)values[i*size+k]=source[v*size+k];});
    data.set(values,kind);
  }
  return data;
}

/** Give only the horizontal cut at the top of the post a planar end-grain UV. */
export function addWayfindingEndGrain(mesh:Mesh,material:Material):Mesh|null{
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();
  if(!positions||!indices||mesh.material?.name!=='Roble envejecido')return null;
  let top=-Infinity;for(let i=1;i<positions.length;i+=3)top=Math.max(top,positions[i]);
  const cap:number[]=[],sides:number[]=[];
  for(let i=0;i<indices.length;i+=3){
    const triangle=[indices[i],indices[i+1],indices[i+2]];
    (triangle.every(v=>Math.abs(positions[v*3+1]-top)<.0001)?cap:sides).push(...triangle);
  }
  if(!cap.length||!sides.length)return null;
  const data=wayfindingMeshPart(mesh,cap),rest=wayfindingMeshPart(mesh,sides),p=data.positions!;
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let i=0;i<p.length;i+=3){minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);minZ=Math.min(minZ,p[i+2]);maxZ=Math.max(maxZ,p[i+2]);}
  data.uvs=new Float32Array(p.length/3*2);
  for(let i=0;i<p.length/3;i++){
    data.uvs[i*2]=(p[i*3]-minX)/Math.max(.001,maxX-minX);
    data.uvs[i*2+1]=(p[i*3+2]-minZ)/Math.max(.001,maxZ-minZ);
  }
  const end=new Mesh(`${mesh.name}:end-grain`,mesh.getScene());
  data.applyToMesh(end);end.parent=mesh;end.material=material;end.isPickable=false;
  end.sideOrientation=mesh.sideOrientation;
  mesh.makeGeometryUnique();rest.applyToMesh(mesh);
  return end;
}
