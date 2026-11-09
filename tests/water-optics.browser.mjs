import {Color3,Color4,Engine,FreeCamera,Mesh,MeshBuilder,RawTexture,Scene,StandardMaterial,Vector3,VertexData} from '@babylonjs/core';
import {SpeedMotionBlur} from '../src/game/SpeedMotionBlur.ts';
import {createCascadeGeometry,createCascadeBedGeometry} from '../src/world/water/CascadeGeometry.ts';
import {createWorldWaterMaterial,updateWorldWaterMaterial} from '../src/world/editor/LiveWaterProfiles.ts';

/** A descending river crosses the camera's height while its whole visible face
 * remains the underside. This used to switch shaders halfway across the view. */
export async function verifySlopingWater(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const engine=new Engine(canvas,false,{preserveDrawingBuffer:true}),scene=new Scene(engine);
  scene.clearColor=new Color4(.6,.5,.4,1);
  const camera=new FreeCamera('sloping-water-probe',new Vector3(0,1,0),scene);
  camera.setTarget(new Vector3(0,1,20));camera.minZ=.1;camera.maxZ=100;
  const mask=RawTexture.CreateRGBATexture(new Uint8Array([0,0,0,255]),1,1,scene,false);
  const mat=createWorldWaterMaterial(scene,'river',{caustics:mask,waterfall:mask},
    {uClearWater:1,uWaveAmp:0,uFoamIntensity:0,uCaustics:0,uSpecular:0,uRockEnabled:0});
  const mesh=new Mesh('descending-surface',scene),data=new VertexData();
  data.positions=[-50,1.875,.5,50,1.875,.5,-50,-8,40,50,-8,40];
  data.indices=[0,2,1,1,2,3];data.uvs=[0,0,1,0,0,1,1,1];
  data.uvs2=[0,1,0,1,0,1,0,1];data.colors=Array(4).fill([0,0,0,1]).flat();
  data.applyToMesh(mesh);mesh.material=mat;
  try{
    for(let i=0;i<30;i++){
      updateWorldWaterMaterial(mat,'river',scene,0);scene.render();
      await new Promise(r=>setTimeout(r,10));
    }
    if(!mat.isReady(mesh,false,mesh.subMeshes[0]))throw Error('sloping water shader did not compile');
    const gl=engine._gl,pixel=y=>{
      const p=new Uint8Array(4);gl.readPixels(128,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p].slice(0,3);
    };
    const upper=pixel(134),lower=pixel(122);
    if(upper.some((v,i)=>Math.abs(v-lower[i])>6))throw Error(`false horizontal waterline: ${upper} / ${lower}`);
    if(upper[0]<130||lower[0]<130)throw Error('underside became an opaque ceiling');
    return {upper,lower};
  }finally{scene.dispose();engine.dispose();}
}

export async function verifyWaterBoundary(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const engine=new Engine(canvas,false,{preserveDrawingBuffer:true});
  const scene=new Scene(engine),camera=new FreeCamera('split-water-probe',new Vector3(0,0,-10),scene);
  camera.minZ=.1;camera.maxZ=200;camera.setTarget(Vector3.Zero());
  const plane=MeshBuilder.CreatePlane('partly-submerged-model',{width:30,height:30},scene);
  const mat=new StandardMaterial('warm-reference',scene);
  mat.disableLighting=true;mat.emissiveColor=new Color3(.72,.5,.32);plane.material=mat;
  const effect=new SpeedMotionBlur(camera,engine),gl=engine._gl;
  const check=(v,m)=>{if(!v)throw Error(m);};
  const pixel=y=>{const p=new Uint8Array(4);gl.readPixels(128,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(p).slice(0,3);};
  const sample=async (level,eyeY=0)=>{
    camera.position.y=eyeY;camera.setTarget(new Vector3(0,eyeY,0));camera.getViewMatrix(true);
    for(let i=0;i<20;i++){
      effect.update(.1,false);effect.updateWaterSurface(.1,level);
      scene.render();await new Promise(r=>setTimeout(r,10));
    }
    scene.render();scene.render();
    check(gl.getError()===gl.NO_ERROR,'water optics renders without WebGL errors');
    const colours={above:pixel(212),below:pixel(44)};
    if(level!==null){
      const map=effect.optics.depth.getDepthMap(),data=await map.readPixels();
      colours.depthProbe=data[(44*256+128)*4];
      check(colours.depthProbe>.98&&colours.depthProbe<.995,'depth pass contains the nearby model');
    }
    return colours;
  };
  try{
    const air=await sample(null),split=await sample(0),submerged=await sample(0,-2);
    check(split.above.every((v,i)=>Math.abs(v-air.above[i])<2),'dry pixels retain their colour at the waterline');
    check(split.below[0]<split.above[0]*.65,'underwater pixels receive absorption in the same frame');
    check(split.below[0]>55,'nearby models retain contrast and their actual depth');
    check(split.below[2]>air.below[2]*.7,'nearby swimmer remains readable');
    check(submerged.above[0]<air.above[0]&&submerged.above[0]>submerged.below[0],
      'looking out from underwater filters only the shorter submerged path');
    const counts=()=>[scene.textures.length,scene.postProcesses.length];
    const before=counts();
    for(let i=0;i<4;i++){await sample(null);await sample(0);}
    check(JSON.stringify(counts())===JSON.stringify(before),'crossings reuse the depth target');
    const recovered=await sample(null);
    check(!effect.active&&scene.customRenderTargets.length===0,'no water rendering pass on dry land');
    check(recovered.above.every((v,i)=>Math.abs(v-air.above[i])<=1),'colours recover after leaving water');
    return {air,split,submerged,recovered,resourcesStable:true};
  }finally{effect.dispose();scene.dispose();engine.dispose();}
}

export function verifyGenericCascades(){
  const results=[];
  for(const heading of [0,.7,Math.PI/2,Math.PI])for(const height of [3,10,45]){
    const f={x:310,z:-77,top:height+6,bottom:6,width:14,run:12,heading};
    const g=createCascadeGeometry(f),p=g.positions;
    for(let i=0;i<25;i++){
      const x=(i/24-.5)*f.width;
      if(Math.hypot(p[i*3]-f.x-x*Math.cos(heading),p[i*3+2]-f.z+x*Math.sin(heading))>1e-5)
        throw Error('inlet seam shifted when rotating/reusing a cascade');
      if(Math.abs(p[i*3+1]-f.top-.045)>1e-5)throw Error('inlet water datum mismatch');
    }
    for(let k=(g.curtainVertices-25)*3+1;k<g.curtainVertices*3;k+=3)
      if(p[k]>=f.bottom)throw Error('curtain must enter the receiving pool');
    if(!p.every(Number.isFinite)||g.indices.some(i=>i<0||i>=p.length/3))throw Error('invalid geometry');
    const bed=createCascadeBedGeometry(f),edges=new Map();
    for(let k=0;k<bed.indices.length;k+=3)for(let e=0;e<3;e++){
      const a=bed.indices[k+e],b=bed.indices[k+(e+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
      edges.set(key,(edges.get(key)??0)+1);
    }
    if([...edges.values()].some(n=>n!==2))throw Error('open spillway exposes sky below the inlet');
    if(!bed.positions.every(Number.isFinite))throw Error('invalid spillway geometry');
    results.push({height,heading,vertices:p.length/3});
  }
  return results;
}
