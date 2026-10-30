import { Mesh, Scene, VertexData } from '@babylonjs/core';
import type { GrassLod, GrassVariant } from './grassData';

export type GrassPrototype={mesh:Mesh;triangles:number};

/** Opaque, tapered and slightly curved leaves; no rectangular crossed cards. */
export function createGrassPrototype(scene:Scene,lod:GrassLod,variant:GrassVariant):GrassPrototype{
  const positions:number[]=[],indices:number[]=[],colors:number[]=[],bend:number[]=[];
  const variantHeight={short:.75,medium:1.06,tall:1.4}[variant];
  const blades=lod==='near'?6:3;
  const add=(x:number,y:number,z:number,color:readonly [number,number,number],flex:number,
    flower=false):number=>{
    const index=positions.length/3;
    positions.push(x,y,z);
    colors.push(...color,flower?1:0);
    bend.push(flex);
    return index;
  };
  for(let i=0;i<blades;i++){
    const angle=i*Math.PI*2/blades+.21*Math.sin(i*4.7+variantHeight*3);
    const dx=Math.cos(angle),dz=Math.sin(angle),px=-dz,pz=dx;
    const radial=.035+.1*((i*7)%5)/5;
    const height=variantHeight*(.76+.34*((i*3+2)%7)/7);
    const width=(lod==='near'?.17:.19)*(.78+.35*((i*5+1)%7)/7);
    const curve=.09+.09*((i*2+3)%5)/5;
    const bx=dx*radial,bz=dz*radial;
    const mx=bx+dx*curve*.42,mz=bz+dz*curve*.42;
    const tx=bx+dx*curve+px*.035,tz=bz+dz*curve+pz*.035;
    const base:[number,number,number]=[.25,.55,.13];
    const middle:[number,number,number]=[.43,.76,.19];
    const tip:[number,number,number]=[.64,.91,.31];
    const a=add(bx-px*width*.5,0,bz-pz*width*.5,base,0);
    const b=add(bx+px*width*.5,0,bz+pz*width*.5,base,0);
    const c=add(mx-px*width*.32,height*.57,mz-pz*width*.32,middle,.44);
    const d=add(mx+px*width*.32,height*.57,mz+pz*width*.32,middle,.44);
    const e=add(tx,height,tz,tip,1);
    indices.push(a,b,c,b,d,c,c,d,e);
  }
  if(lod==='near'&&variant==='tall'){
    const flowerHeight=1.46;
    const stem:[number,number,number]=[.34,.7,.18];
    const center:[number,number,number]=[.94,.76,.18];
    const petal:[number,number,number]=[.97,.97,.84];
    const s0=add(-.017,.05,0,stem,0,true);
    const s1=add(.017,.05,0,stem,0,true);
    const s2=add(-.01,flowerHeight,0,stem,.8,true);
    const s3=add(.01,flowerHeight,0,stem,.8,true);
    indices.push(s0,s1,s2,s1,s3,s2);
    const core=add(0,flowerHeight+.025,0,center,1,true);
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5,b=(i+1)*Math.PI*2/5;
      const left=add(Math.cos(a)*.036,flowerHeight+.025,
        Math.sin(a)*.036,petal,1,true);
      const right=add(Math.cos(b)*.036,flowerHeight+.025,
        Math.sin(b)*.036,petal,1,true);
      const outer=add(Math.cos((a+b)*.5)*.12,flowerHeight+.04,
        Math.sin((a+b)*.5)*.12,petal,1,true);
      indices.push(core,left,outer,core,outer,right);
    }
  }
  const normals:number[]=[];
  VertexData.ComputeNormals(positions,indices,normals);
  const data=new VertexData();
  data.positions=positions;data.indices=indices;data.normals=normals;data.colors=colors;
  const mesh=new Mesh(`grass-prototype-${lod}-${variant}`,scene);
  data.applyToMesh(mesh);
  mesh.setVerticesData('bendWeight',bend,false,1);
  mesh.isPickable=false;mesh.checkCollisions=false;mesh.isVisible=false;
  mesh.metadata={grassPrototype:true,lod,variant};
  return {mesh,triangles:indices.length/3};
}
