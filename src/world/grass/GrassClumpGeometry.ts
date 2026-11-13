import {Mesh,VertexData} from '@babylonjs/core';

/** Shared by the offline sprite bake and runtime near LOD; original GLB stays unchanged. */
export function makeGrassClump(mesh:Mesh):void{
 const source=VertexData.ExtractFromMesh(mesh),data=new VertexData();
 const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
 const layout=[[0,0,0,1],[-.27,.17,.8,.78],[.26,.15,2.5,.85],[-.13,-.25,4.1,.88],[.26,-.22,5.2,.72]];
 for(const [dx,dz,angle,scale] of layout){
  const offset=positions.length/3,c=Math.cos(angle),s=Math.sin(angle);
  for(let i=0;i<source.positions!.length;i+=3){
   const x=source.positions![i]*.75*scale,z=source.positions![i+2]*.75*scale;
   positions.push(x*c-z*s+dx,source.positions![i+1]*.65*scale,x*s+z*c+dz);
   const nx=source.normals![i],ny=source.normals![i+1],nz=source.normals![i+2];
   normals.push(nx*c-nz*s,ny,nx*s+nz*c);
  }
  for(const index of source.indices!)indices.push(offset+index);
  if(source.colors)for(let i=0;i<source.colors.length;i+=4){
   // Bring bright cyan-green GLB leaves toward the shared meadow's muted olive palette.
   colors.push(source.colors[i]*.55,source.colors[i+1]*.38,source.colors[i+2]*.35,source.colors[i+3]);
  }
 }
 // Normalize every variant, including flowers, so instance Y scale is its actual height.
 let bottom=Infinity,top=-Infinity;
 for(let i=1;i<positions.length;i+=3){bottom=Math.min(bottom,positions[i]);top=Math.max(top,positions[i]);}
 const height=top-bottom;
 if(!(height>0))throw new Error('Grass clump has no vertical extent');
 for(let i=1;i<positions.length;i+=3)positions[i]=(positions[i]-bottom)/height;
 VertexData.ComputeNormals(positions,indices,normals);
 data.positions=positions;data.normals=normals;data.indices=indices;if(colors.length)data.colors=colors;
 data.applyToMesh(mesh);mesh.refreshBoundingInfo();
}
