import {Color3,Engine,FreeCamera,MeshBuilder,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {SpeedMotionBlur} from '../src/game/SpeedMotionBlur.ts';

/** A submerged camera enters a new river sector this frame. Its interface
 * depth must use this frame's visible water, just like the opaque depth. */
export async function verifyMovingWaterFrame(){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
 const engine=new Engine(canvas,false,{preserveDrawingBuffer:true}),scene=new Scene(engine);
 const camera=new FreeCamera('river-motion',new Vector3(60,-2,0),scene);camera.minZ=.1;camera.maxZ=200;
 const land=MeshBuilder.CreatePlane('warm-bank',{width:200,height:100},scene);land.position.z=20;
 const material=new StandardMaterial('warm-reference',scene);material.disableLighting=true;material.emissiveColor=new Color3(.72,.5,.32);land.material=material;
 const water=MeshBuilder.CreateGround('new-river-sector',{width:24,height:40},scene);water.position.set(60,0,15);water.metadata={inlandWater:true};
 const transparent=new StandardMaterial('transparent-river',scene);transparent.alpha=0;transparent.backFaceCulling=false;water.material=transparent;
 const effect=new SpeedMotionBlur(camera,engine),gl=engine._gl;
 const frame=x=>{camera.position.x=x;camera.setTarget(new Vector3(x,-2,20));camera.getViewMatrix(true);effect.update(1/60,false);effect.updateWaterSurface(1/60,0,0,0,0,0,true);scene.render();};
 const pixel=()=>{const p=new Uint8Array(4);gl.readPixels(128,220,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p].slice(0,3);};
 try{
  for(let i=0;i<1000;i++){frame(60);await new Promise(r=>setTimeout(r,10));if(i>20&&effect.optics.ready&&effect.optics.surfaceReady&&effect.postProcess.isReady())break;}
  const results=[];
  for(let i=0;i<8;i++){
   frame(0);frame(0);frame(60);const first=pixel();frame(60);const next=pixel();
   results.push({first,next,delta:Math.max(...first.map((v,k)=>Math.abs(v-next[k])))});
  }
  const maxDelta=Math.max(...results.map(r=>r.delta));
  if(maxDelta>2)throw Error('Stale river interface flashes when entering view: '+JSON.stringify({maxDelta,results}));
  if(results.every(r=>r.next[0]<70))throw Error('Visible river interface was never sampled');
  if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL error during river motion');
  effect.updateWaterSurface(.1,null);scene.render();
  if(camera.customRenderTargets.length||scene.customRenderTargets.length)throw Error('River target stays active on dry land');
  return {maxDelta,results,framesSynchronized:true};
 }finally{effect.dispose();scene.dispose();engine.dispose();}
}
