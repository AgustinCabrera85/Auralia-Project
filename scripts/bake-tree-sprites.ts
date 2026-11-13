import {ArcRotateCamera,Camera,Color3,Color4,Engine,HemisphericLight,ImportMeshAsync,Mesh,MultiMaterial,Scene,Vector3} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import {ASSET_CATALOG,DECORATIVE_TREE_ASSETS} from '../src/world/assetCatalog';
import {configureFoliageV4Material} from '../src/world/LandscapeAtmosphere';

/** Offline atlas from the actual V4 meshes/materials. No runtime render targets. */
export async function bakeTreeSprites(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,premultipliedAlpha:false});
 const scene=new Scene(engine);scene.clearColor=new Color4(0,0,0,0);
 const camera=new ArcRotateCamera('bake',0,Math.PI/2,50,Vector3.Zero(),scene);
 camera.mode=Camera.ORTHOGRAPHIC_CAMERA;camera.minZ=.01;
 const light=new HemisphericLight('neutral',Vector3.Up(),scene);light.intensity=1;light.groundColor=new Color3(.65,.65,.65);
 const atlas=document.createElement('canvas');atlas.width=2048;atlas.height=1024;const ctx=atlas.getContext('2d')!;
 const metadata:Record<string,{row:number;size:number;centerY:number}>={};
 let row=0;
 for(const [kind,asset] of Object.entries(DECORATIVE_TREE_ASSETS)){
  const imported=await ImportMeshAsync(ASSET_CATALOG[asset].path,scene);
  const parts=imported.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
  for(const part of parts){part.computeWorldMatrix(true);part.bakeTransformIntoVertices(part.getWorldMatrix().clone());part.parent=null;part.position.setAll(0);part.scaling.setAll(1);part.rotation.setAll(0);part.rotationQuaternion=null;}
  const mesh=Mesh.MergeMeshes(parts,true,true,undefined,false,true)!;
  for(const m of mesh.material instanceof MultiMaterial?mesh.material.subMaterials:[mesh.material])configureFoliageV4Material(m);
  const box=mesh.getBoundingInfo().boundingBox;
  const radius=Math.hypot(Math.max(Math.abs(box.minimum.x),Math.abs(box.maximum.x)),Math.max(Math.abs(box.minimum.z),Math.abs(box.maximum.z)));
  const size=Math.max(radius*2,box.maximum.y-box.minimum.y)*1.08,centerY=(box.minimum.y+box.maximum.y)/2;
  metadata[kind]={row,size,centerY};camera.setTarget(new Vector3(0,centerY,0));
  camera.orthoLeft=camera.orthoBottom=-size/2;camera.orthoRight=camera.orthoTop=size/2;
  await scene.whenReadyAsync();
  for(let view=0;view<8;view++){
   camera.alpha=view*Math.PI/4;scene.render();ctx.drawImage(canvas,view*256,row*256);
  }
  mesh.isVisible=false;row++;
 }
 const png=atlas.toDataURL('image/png').split(',')[1];scene.dispose();engine.dispose();
 return {png,metadata};
}
