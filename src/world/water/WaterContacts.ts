import { type AbstractMesh, VertexBuffer } from '@babylonjs/core';

export const MAX_WATER_CONTACTS=8;
export type WaterContact={x:number;z:number;radiusX:number;radiusZ:number;yaw:number;level:number;strength:number};

/** Fit the rock's section at the waterline, rather than its full bounding sphere.
 * Called only when a streamed collider/water level changes; no depth render pass. */
export function rockWaterContact(meshes:readonly AbstractMesh[],level:number,
  centerX:number,centerZ:number,yaw:number,slopeX=0,slopeZ=0):WaterContact|null{
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  const co=Math.cos(yaw),si=Math.sin(yaw);
  for(const mesh of meshes){
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();
    if(!positions||!indices)continue;
    const m=mesh.computeWorldMatrix(true).m;
    const points=new Float64Array(positions.length),distances=new Float64Array(positions.length/3);
    for(let i=0;i<positions.length;i+=3){
      const x=positions[i],y=positions[i+1],z=positions[i+2];
      const wx=x*m[0]+y*m[4]+z*m[8]+m[12],wy=x*m[1]+y*m[5]+z*m[9]+m[13];
      const wz=x*m[2]+y*m[6]+z*m[10]+m[14];
      points[i]=wx;points[i+2]=wz;
      distances[i/3]=wy-level-slopeX*(wx-centerX)-slopeZ*(wz-centerZ);
    }
    for(let i=0;i<indices.length;i+=3)for(let e=0;e<3;e++){
      const a=indices[i+e],b=indices[i+(e+1)%3],da=distances[a],db=distances[b];
      if((da<0&&db<0)||(da>0&&db>0)||Math.abs(da-db)<1e-9)continue;
      const t=da/(da-db),x=points[a*3]+(points[b*3]-points[a*3])*t-centerX;
      const z=points[a*3+2]+(points[b*3+2]-points[a*3+2])*t-centerZ;
      const lx=x*co-z*si,lz=x*si+z*co;
      minX=Math.min(minX,lx);maxX=Math.max(maxX,lx);
      minZ=Math.min(minZ,lz);maxZ=Math.max(maxZ,lz);
    }
  }
  if(!Number.isFinite(minX)||maxX-minX<.12||maxZ-minZ<.12)return null;
  const x=(minX+maxX)*.5,z=(minZ+maxZ)*.5;
  const wx=centerX+x*co+z*si,wz=centerZ-x*si+z*co;
  return {x:wx,z:wz,radiusX:(maxX-minX)*.5,radiusZ:(maxZ-minZ)*.5,yaw,
    level:level+slopeX*(wx-centerX)+slopeZ*(wz-centerZ),strength:1};
}

/** Fixed-size buffers shared by every water material in a scene. */
export class WaterContactUniforms {
  readonly shapes:number[]=Array(MAX_WATER_CONTACTS*4).fill(0);
  readonly info:number[]=Array(MAX_WATER_CONTACTS*4).fill(0);
  set(contacts:readonly WaterContact[]){
    this.shapes.fill(0);this.info.fill(0);
    for(let i=0;i<Math.min(MAX_WATER_CONTACTS,contacts.length);i++){
      const c=contacts[i],p=i*4;
      this.shapes[p]=c.x;this.shapes[p+1]=c.z;this.shapes[p+2]=c.radiusX;this.shapes[p+3]=c.radiusZ;
      this.info[p]=Math.cos(c.yaw);this.info[p+1]=Math.sin(c.yaw);this.info[p+2]=c.level;this.info[p+3]=c.strength;
    }
  }
}
