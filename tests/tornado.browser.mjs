import {Engine,Scene,FreeCamera,Vector3,Color3,Color4,HemisphericLight,MeshBuilder,StandardMaterial} from '@babylonjs/core';
import {RareTornadoes} from '../src/world/climate/RareTornadoes.ts';
import {tornadoWindow} from '../src/world/climate/TornadoSchedule.ts';
import {sampleClimate} from '../src/world/climate/ClimateModel.ts';

const errors=[];window.addEventListener('error',e=>errors.push(e.message));
const oldError=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' '));oldError(...args);};
const assert=(value,message)=>{if(!value)throw Error(message);};
const nextFrame=()=>new Promise(r=>requestAnimationFrame(r));
try{
 const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true});
 engine.setSize(1280,800);const scene=new Scene(engine);scene.clearColor=new Color4(.45,.56,.64,1);
 const camera=new FreeCamera('review-camera',new Vector3(0,35,-150),scene);camera.minZ=.1;camera.maxZ=2000;
 new HemisphericLight('sky',Vector3.Up(),scene).intensity=.8;
 const ground=MeshBuilder.CreateGround('plain',{width:1200,height:1200},scene);
 const material=new StandardMaterial('earth',scene);material.diffuseColor=new Color3(.38,.39,.19);ground.material=material;
 let frame;for(let i=0;i<24000;i++){
  const f=sampleClimate(i/20),w=tornadoWindow(f);if(w?.remaining>50){frame=f;break;}
 }
 assert(frame,'a natural weather window exists');
 const system=new RareTornadoes(scene,()=>({height:0,slopeX:0,slopeZ:0,biome:'plains'}));
 const player={x:0,y:0,z:0};
 for(let i=0;i<600&&!system.status.active;i++){
  system.update(1/60,frame,player,camera,true,false);scene.render();await nextFrame();
 }
 assert(system.status.active,'production scheduler starts the loaded effect');
 const p=system.status.position,target=new Vector3(p.x,p.y+30,p.z);
 camera.position.set(p.x+110,p.y+48,p.z-155);camera.setTarget(target);
 for(let i=0;i<300;i++){
  system.update(1/60,frame,player,camera,true,false);scene.render();if(i%5===0)await nextFrame();
 }
 const pixels=async()=>new Uint8Array(await engine.readPixels(0,0,1280,800));
 const delta=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)count++;return count;};
 const meshes=scene.meshes.filter(m=>m.name.startsWith('auralia-tornado'));
 const enabled=meshes.map(m=>m.isEnabled());
 const visibility=show=>meshes.forEach((m,i)=>m.setEnabled(show&&enabled[i]));
 const near=system.status;assert(near.drawCalls===5,'near LOD uses five bounded draws');
 scene.render();const visible=await pixels();visibility(false);scene.render();const blank=await pixels();visibility(true);
 const changed=delta(visible,blank);assert(changed>10000,`visible continuous funnel and cloud: ${changed}`);
 const wall=MeshBuilder.CreatePlane('occlusion-wall',{size:260},scene);
 wall.position=Vector3.Lerp(camera.position,target,.5);wall.lookAt(camera.position);
 const wallMat=new StandardMaterial('occlusion-material',scene);wallMat.disableLighting=true;
 wallMat.emissiveColor=new Color3(.3,.22,.16);wallMat.backFaceCulling=false;wall.material=wallMat;
 await wallMat.forceCompilationAsync(wall);scene.render();
 scene.render();const occluded=await pixels();visibility(false);scene.render();const wallOnly=await pixels();visibility(true);
 const leakage=delta(occluded,wallOnly);assert(leakage<16,`opaque terrain blocks all tornado layers: ${leakage}`);
 wall.dispose();wallMat.dispose();
 camera.position.set(p.x+400,p.y+70,p.z-450);camera.setTarget(target);camera.getViewMatrix(true);
 system.update(0,frame,player,camera,true,true);scene.render();
 const far=system.status;assert(far.drawCalls===2&&far.lod==='far','far LOD drops ground/dust geometry');
 camera.position.set(p.x+110,p.y+48,p.z-155);camera.setTarget(target);camera.getViewMatrix(true);
 system.update(0,frame,player,camera,true,true);scene.render();
 // Exercise the production WorldView adapter against real resident height data.
 const [{PlayableWorld},{WorldStudioSource},{WorldView}]=await Promise.all([
  import('../src/world/geography/PlayableWorld.ts'),import('../src/world/geography/WorldStudioSource.ts'),
  import('../src/game/WorldView.ts')]);
 const [manifest,splines,hydrology]=await Promise.all(['manifest','splines','hidrologia_v3_6'].map(n=>fetch(`/auralia-preview/data/${n}.json`).then(r=>r.json())));
 const source=new WorldStudioSource(manifest,splines,hydrology,url=>fetch(url).then(r=>r.arrayBuffer()));
 const world=await PlayableWorld.create(source,splines,hydrology);
 const context={geographicWorld:world,geographyLoading:false,insideUnderground:false,floating:null,
  mainland:{coverageAt:()=>true},plot:{x:world.town.x-29,z:world.town.z+18},store:{state:{structures:[]}}};
 const sampler=(x,z)=>WorldView.prototype.tornadoSurfaceAt.call(context,x,z);
 const habitats={},probe=new RareTornadoes(scene,sampler);
 for(const [biome,x,z] of [['plains',-1370,3340],['desert',-4900,-4600]]){
  await world.prepareAround(x,z);let found=null,best=null;
  for(let dz=-1000;dz<=1000&&!found;dz+=35)for(let dx=-1000;dx<=1000&&!found;dx+=35){
   const px=x+dx,pz=z+dz,s=probe.footprint(px,pz);if(s?.biome===biome)found={x:px,z:pz,...s};
   if(!s){const c=sampler(px,pz);if(c){let slope=Math.hypot(c.slopeX,c.slopeZ),residual=0;
    for(let j=0;j<8;j++){const ax=Math.cos(j*Math.PI/4)*14,az=Math.sin(j*Math.PI/4)*14,e=sampler(px+ax,pz+az);if(!e){slope=Infinity;break;}slope=Math.max(slope,Math.hypot(e.slopeX,e.slopeZ));residual=Math.max(residual,Math.abs(e.height-c.height-c.slopeX*ax-c.slopeZ*az));}
    const score=Math.max(slope/.18,residual/.6);if(!best||score<best.score)best={x:px,z:pz,score,slope,residual};
   }}
  }
  assert(found,`real ${biome} contains eligible open terrain: ${JSON.stringify({best,ground:world.surface.surfaceAt(x,z),weights:world.biomeWeights(x,z)})}`);habitats[biome]=found;
 }
 await world.prepareAround(world.town.x,world.town.z);
 assert(!sampler(world.town.x,world.town.z),'Brisalia is protected');
 context.mainland.coverageAt=()=>false;assert(!sampler(world.town.x+700,world.town.z),'unloaded terrain is rejected before sampling');
 probe.dispose();world.dispose();
 const result={near,far,changedPixels:changed,occlusionLeakage:leakage,habitats,errors};
 assert(!errors.length,errors.join('\n'));
 window.tornadoReview={result,view(mode){
  camera.position.set(p.x+(mode==='far'?400:110),p.y+(mode==='far'?70:48),p.z-(mode==='far'?450:155));camera.setTarget(target);
  camera.getViewMatrix(true);
  const lighting=mode==='night'?{...frame,dayLight:0}:frame;
  system.update(0,lighting,player,camera,true,true);scene.render();
 }};
 document.body.dataset.ready='true';document.querySelector('#status').textContent='Tornado v7 · clima regional';
}catch(error){window.tornadoFailure=String(error.stack??error);document.body.dataset.ready='false';console.error(error);}
