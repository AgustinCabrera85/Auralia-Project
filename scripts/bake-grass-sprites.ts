import {ArcRotateCamera,Camera,Color4,Engine,ImportMeshAsync,Mesh,PBRMaterial,Scene,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {makeGrassClump} from '../src/world/grass/GrassClumpGeometry';
import {encodeSpritePNG} from './encode-sprite-png';

/** Offline orthographic silhouettes of the unchanged grass GLB, with no baked lighting. */
export async function bakeGrassSprites(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,premultipliedAlpha:false});
 const scene=new Scene(engine);scene.clearColor=new Color4(0,0,0,0);
 const camera=new ArcRotateCamera('grass-bake',Math.PI/2,Math.PI/2,5,new Vector3(0,.6,0),scene);
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.01;
 camera.orthoLeft=-.6;camera.orthoRight=.6;camera.orthoBottom=-.6;camera.orthoTop=.6;
 const imported=await ImportMeshAsync('/assets/grass/grass_tufts.glb',scene);
 const parts=imported.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
 for(const mesh of parts){mesh.computeWorldMatrix(true);mesh.bakeTransformIntoVertices(mesh.getWorldMatrix().clone());mesh.parent=null;mesh.position.setAll(0);mesh.rotation.setAll(0);mesh.rotationQuaternion=null;mesh.scaling.setAll(1);mesh.isVisible=false;if(mesh.material instanceof PBRMaterial)mesh.material.unlit=true;}
 for(const part of parts)makeGrassClump(part);
 const atlas=document.createElement('canvas');atlas.width=1024;atlas.height=256;const ctx=atlas.getContext('2d')!;
 for(const [i,variant] of ['short','medium','tall','flower'].entries()){
  const mesh=parts.find(m=>m.name.includes('grass_'+variant))!;mesh.isVisible=true;
  await scene.whenReadyAsync();scene.render();ctx.drawImage(canvas,i*256,0);mesh.isVisible=false;
 }
 // Preserve alpha coverage, but bleed leaf RGB into transparent texels before mipmapping.
 // Black RGB outside the silhouette otherwise becomes a dark contour under minification.
 const pixels=ctx.getImageData(0,0,atlas.width,atlas.height),rgba=pixels.data;
 for(let tile=0;tile<4;tile++){
  const known=new Uint8Array(256*256);let sumR=0,sumG=0,sumB=0,count=0;
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const i=(y*1024+tile*256+x)*4;if(rgba[i+3]<240)continue;
   known[y*256+x]=1;sumR+=rgba[i];sumG+=rgba[i+1];sumB+=rgba[i+2];count++;
  }
  for(let pass=0;pass<8;pass++){
   const previous=known.slice();
   for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(!previous[y*256+x]){
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){
     const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=256||ny>=256||!previous[ny*256+nx])continue;
     const i=(y*1024+tile*256+x)*4,j=(ny*1024+tile*256+nx)*4;
     rgba[i]=rgba[j];rgba[i+1]=rgba[j+1];rgba[i+2]=rgba[j+2];known[y*256+x]=1;break;
    }
   }
  }
  for(let y=0;y<256;y++)for(let x=0;x<256;x++)if(!known[y*256+x]){
   const i=(y*1024+tile*256+x)*4;rgba[i]=sumR/count;rgba[i+1]=sumG/count;rgba[i+2]=sumB/count;
  }
 }
 const png=await encodeSpritePNG(atlas.width,atlas.height,rgba);scene.dispose();engine.dispose();return {png};
}
