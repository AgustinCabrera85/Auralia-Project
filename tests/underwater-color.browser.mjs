// GPU regression: a warm model in the centre must receive the same water
// absorption as the periphery, with progressive depth and reversible exposure.
import {Color3,Engine,FreeCamera,MeshBuilder,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {SpeedMotionBlur} from '../src/game/SpeedMotionBlur.ts';

export async function verifyUnderwaterColor(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const engine=new Engine(canvas,false,{preserveDrawingBuffer:true});
  const scene=new Scene(engine),camera=new FreeCamera('colour-probe',new Vector3(0,0,-10),scene);
  camera.setTarget(Vector3.Zero());
  const surface=MeshBuilder.CreatePlane('warm-model',{size:20},scene);
  const material=new StandardMaterial('warm-skin-and-rock-reference',scene);
  material.disableLighting=true;material.emissiveColor=new Color3(.72,.50,.32);
  surface.material=material;
  const effect=new SpeedMotionBlur(camera,engine);
  const gl=engine._gl;
  const check=(value,message)=>{if(!value)throw Error(message);};
  const pixel=x=>{const p=new Uint8Array(4);gl.readPixels(x,128,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return Array.from(p).slice(0,3);};
  const sample=async depth=>{
    for(let i=0;i<18;i++)effect.update(.1,false,depth);
    scene.render();await scene.whenReadyAsync();scene.render();scene.render();
    check(gl.getError()===gl.NO_ERROR,'underwater shader draws without WebGL errors');
    return {centre:pixel(128),edge:pixel(32)};
  };
  const luminance=p=>p[0]*.2126+p[1]*.7152+p[2]*.0722;
  try{
    const air=await sample(0),shallow=await sample(1),deep=await sample(10),bottom=await sample(24);
    check(deep.centre[0]<air.centre[0]*.75,'warm model in screen centre loses red underwater');
    check(deep.centre[1]>air.centre[1]*.6&&deep.centre[2]>air.centre[2]*.7,'green/blue retain readable detail');
    check(deep.centre[0]/deep.centre[2]<shallow.centre[0]/shallow.centre[2]*.85,'absorption increases with depth');
    check(Math.abs(deep.centre[0]/deep.centre[2]-deep.edge[0]/deep.edge[2])<.04,'no dry colour hole around the central player');
    check(luminance(bottom.centre)>luminance(air.centre)*.45,'deep-water model remains visible');
    const recovered=await sample(0);
    check(!effect.active,'postprocess detaches on dry land');
    check(recovered.centre.every((v,i)=>Math.abs(v-air.centre[i])<=1),'original model colour returns on leaving water');
    const counts=()=>[scene.materials.length,scene.textures.length,scene.postProcesses.length];
    const before=counts();
    for(let i=0;i<10;i++){await sample(8);await sample(0);}
    check(JSON.stringify(before)===JSON.stringify(counts()),'repeated immersion does not accumulate rendering resources');
    return {air,shallow,deep,bottom,recovered,waterlineCycles:10,resourcesStable:true};
  }finally{effect.dispose();scene.dispose();engine.dispose();}
}
