import {Color3,Engine,FreeCamera,MeshBuilder,RawTexture,Scene,StandardMaterial,Vector2,Vector3,VertexBuffer} from '@babylonjs/core';
import {createWorldWaterMaterial,updateWorldWaterMaterial} from '../src/world/editor/LiveWaterProfiles.ts';
import {SpeedMotionBlur} from '../src/game/SpeedMotionBlur.ts';

export async function verifyDistantDryCoast(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const engine=new Engine(canvas,false,{preserveDrawingBuffer:true}),scene=new Scene(engine);
 const camera=new FreeCamera('dry-coast-probe',new Vector3(0,4,0),scene);camera.minZ=.15;camera.maxZ=6000;
 camera.setTarget(new Vector3(0,.8,260));
 const land=MeshBuilder.CreateGround('distant-dry-beach',{width:180,height:180},scene);land.position.set(0,.8,260);
 const material=new StandardMaterial('dry-sand',scene);material.disableLighting=true;material.emissiveColor=new Color3(.7,.4,.2);land.material=material;
 const optics=new SpeedMotionBlur(camera,engine);
 const sample=async level=>{
   for(let i=0;i<30;i++){
     optics.update(.05,false);optics.updateWaterSurface(.05,level);
     engine.beginFrame();scene.render();engine.endFrame();await new Promise(r=>requestAnimationFrame(r));
   }
   return Array.from(await engine.readPixels(128,127,1,1)).slice(0,3);
 };
 try{
   const dry=await sample(null),wading=await sample(0);
   const difference=dry.reduce((sum,v,i)=>sum+Math.abs(v-wading[i]),0);
   if(dry[0]<100||difference>3)throw Error(`blue band on dry coast: ${JSON.stringify({dry,wading,difference})}`);
   if(engine._gl.getError()!==0)throw Error('Coast optics WebGL error');
   return {dry,wading,difference};
 }finally{optics.dispose();scene.dispose();engine.dispose();}
}

/** Change the colour of the physical bed, then measure what reaches the view.
 * Nearby shallows must transmit; deep or distant water must hide that change. */
export async function verifyOceanTransmission(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const engine=new Engine(canvas,false,{preserveDrawingBuffer:true}),scene=new Scene(engine);
 const camera=new FreeCamera('ocean-probe',new Vector3(0,12,-12),scene);camera.minZ=.5;camera.maxZ=6000;
 const mask=RawTexture.CreateRGBATexture(new Uint8Array([127,127,127,255]),1,1,scene,false);
 const material=createWorldWaterMaterial(scene,'ocean',{caustics:mask,waterfall:mask},
   {uClearWater:1,uWaveAmp:0,uNormalStrength:0,uFoamIntensity:0,uCaustics:0,uSpecular:0,uFresnel:0,uDeepColor:'#073750',uShallowColor:'#48a6a2'});
 material.setVector2('uPatchCenter',Vector2.Zero());material.setFloat('uPatchRadius',240);material.setFloat('uNearPatch',1);
 const water=MeshBuilder.CreateGround('probe-water',{width:2000,height:2000},scene);water.material=material;
 const floor=MeshBuilder.CreateGround('probe-bed',{width:10000,height:10000},scene);
 const bed=new StandardMaterial('probe-bed-material',scene);bed.disableLighting=true;floor.material=bed;
 const render=()=>{updateWorldWaterMaterial(material,'ocean',scene,0);engine.beginFrame();scene.render();engine.endFrame();};
 const wait=()=>new Promise(r=>requestAnimationFrame(r));
 try{
   water.setVerticesData(VertexBuffer.ColorKind,Array(4).fill([0,0,2,1]).flat(),true);
   camera.setTarget(Vector3.Zero());render();await scene.whenReadyAsync();
   const probe=async(depth,distant)=>{
     floor.position.y=-depth;water.updateVerticesData(VertexBuffer.ColorKind,Array(4).fill([0,0,depth,1]).flat());
     camera.position.set(0,distant?5:12,distant?-260:-12);camera.setTarget(Vector3.Zero());
     const colors=[];
     for(const colour of [new Color3(.85,.12,.12),new Color3(.12,.12,.85)]){
       bed.emissiveColor=colour;for(let i=0;i<3;i++){render();await wait();}
       colors.push(Array.from(await engine.readPixels(128,128,1,1)).slice(0,3));
     }
     return {colors,difference:colors[0].reduce((sum,v,i)=>sum+Math.abs(v-colors[1][i]),0)};
   };
   const shallow=await probe(2,false),deep=await probe(50,false),distant=await probe(2,true);
   if(shallow.difference<40)throw Error(`shallow water hides nearby bed: ${JSON.stringify(shallow)}`);
   if(deep.difference>3||distant.difference>3)throw Error(`seabed leaks through ocean: ${JSON.stringify({deep,distant})}`);
   if(engine._gl.getError()!==0)throw Error('Ocean probe WebGL error');
   return {shallow,deep,distant};
 }finally{scene.dispose();engine.dispose();}
}
