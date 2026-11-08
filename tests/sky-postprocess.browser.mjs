// Run with the Vite dev server in a browser:
// import('/tests/sky-postprocess.browser.mjs').then(m => m.verifySkyPostprocess())
// The default painted-cloud renderer reproduces the framebuffer feedback bug.
import { ArcRotateCamera, Color4, Engine, Scene, Vector3 } from '@babylonjs/core';
import { SpeedMotionBlur } from '../src/game/SpeedMotionBlur.ts';
import { SkyDome } from '../src/world/climate/SkyDome.ts';
import { sampleClimate } from '../src/world/climate/ClimateModel.ts';

export async function verifySkyPostprocess(onCapture=()=>{}){
  const width=800,height=600;
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const engine=new Engine(canvas,true,{preserveDrawingBuffer:true,antialias:true});
  const scene=new Scene(engine);
  const camera=new ArcRotateCamera('sky-regression',-Math.PI/2,Math.PI/2,10,Vector3.Zero(),scene);
  camera.minZ=.15;camera.maxZ=1900;
  const sky=new SkyDome(scene,camera),blur=new SpeedMotionBlur(camera,engine);
  const direction=new Vector3(.35,.24,1).normalize();
  const samples=[];
  const require=(condition,message)=>{if(!condition)throw Error(message);};
  const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');
  const capture=async(name,frame)=>{
    scene.clearColor=new Color4(...frame.skyHorizon,1);
    const pixels=new Uint8Array(width*height*4);
    let minBright=Infinity,minPeak=Infinity;
    // The old failure appears on the second frame: the first postprocess draw
    // leaves its input on texture unit 0 for the following sky draw to inherit.
    for(let render=0;render<5;render++){
      sky.update(frame,0,0);scene.render();
      gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      require(gl.getError()===gl.NO_ERROR,`${name}: WebGL rejected a draw`);
      let bright=0,peak=0;
      for(let i=0;i<pixels.length;i+=4){
        const value=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
        peak=Math.max(peak,value);
        if(value>240)bright++;
      }
      minBright=Math.min(minBright,bright);minPeak=Math.min(minPeak,peak);
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    const sample={name,minBright,minPeak};samples.push(sample);
    onCapture(name,canvas.toDataURL());
    return sample;
  };
  try{
    await scene.whenReadyAsync();
    for(const night of [false,true]){
      const body=night?'moon':'sun';
      const frame=sampleClimate(night?0:12,'clear');
      frame.weatherMix.cloud=0; // No cloud may hide the reference disc.
      frame.sunDirection=direction.scale(night?-1:1).asArray();frame.night=night?1:0;
      const baseline=await capture(`${body}-baseline`,frame);
      require(baseline.minBright>100,`${body}: the reference disc must be visible`);
      for(const effect of ['double-jump','air-kick','sprint']){
        if(effect==='sprint'){
          for(let i=0;i<12;i++)blur.update(.1,true);
        }else{blur.triggerDoubleJump();blur.update(.016,false);}
        require(blur.active,`${effect}: the effect must actually be attached`);
        await scene.whenReadyAsync();
        const during=await capture(`${body}-${effect}`,frame);
        require(during.minBright>=baseline.minBright*.9&&during.minPeak>=250,
          `${body}: the luminous disc disappeared during ${effect}`);
        for(let i=0;i<20;i++)blur.update(.1,false);
        require(!blur.active,`${effect}: the effect must detach after fading`);
        const after=await capture(`${body}-after-${effect}`,frame);
        require(after.minBright>=baseline.minBright*.9,`${body}: the sky did not recover`);
      }
    }
    return {ok:true,renderer:engine.getGlInfo(),samples};
  }finally{
    blur.dispose();sky.dispose();scene.dispose();engine.dispose();
  }
}
