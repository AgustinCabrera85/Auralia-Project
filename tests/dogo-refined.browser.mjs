import {Color3,Color4,DirectionalLight,Engine,FreeCamera,HemisphericLight,MeshBuilder,Scene,StandardMaterial,Vector3} from '@babylonjs/core';
import {DogoCompanion} from '../src/game/DogoCompanion.ts';
import {DOGO} from '../src/game/DogoCatalog.ts';
const view=new URLSearchParams(location.search).get('view')??'idle';
const engine=new Engine(document.querySelector('canvas'),true,{preserveDrawingBuffer:true});
const scene=new Scene(engine),errors=[];scene.useConstantAnimationDeltaTime=true;scene.clearColor=new Color4(.64,.76,.84,1);
const camera=new FreeCamera('dogo-review',new Vector3(2.7,1.7,3.2),scene);camera.minZ=.05;camera.maxZ=100;
camera.setTarget(new Vector3(0,.65,0));camera.fov=.7;
const sun=new DirectionalLight('sun',new Vector3(-.6,-1,-.4),scene);sun.intensity=1.3;
const hemi=new HemisphericLight('ambient',Vector3.Up(),scene);hemi.intensity=.65;
const ground=MeshBuilder.CreateGround('support',{width:30,height:30,subdivisions:1,updatable:true},scene),mat=new StandardMaterial('ground',scene);
mat.diffuseColor=new Color3(.26,.35,.22);ground.material=mat;
const slope=view==='slope',wet=view.startsWith('swim');
const greeting=view==='greet',chasing=view==='chase-tail';
const height=(x,z)=>wet?-2:slope?.28*x+.18*z:0;
const positions=ground.getVerticesData('position');for(let i=0;i<positions.length;i+=3)positions[i+1]=height(positions[i],positions[i+2]);ground.updateVerticesData('position',positions);
if(wet){
 const water=MeshBuilder.CreateGround('waterline',{width:30,height:30},scene),material=new StandardMaterial('water',scene);
 material.diffuseColor=new Color3(.06,.42,.52);material.alpha=.48;water.material=material;
 camera.position.set(2.5,1.2,3);camera.setTarget(new Vector3(0,.2,0));
}
if(new URLSearchParams(location.search).has('side')){camera.position.set(3.7,wet?.4:1.5,.4);camera.setTarget(new Vector3(0,wet?-.1:.7,0));}
if(greeting){
 const player=MeshBuilder.CreateCapsule('player-contact-reference',{height:3.8,radius:.4},scene);
 const material=new StandardMaterial('player-reference',scene);material.diffuseColor=new Color3(.15,.4,.45);player.material=material;player.position.y=1.9;
 camera.position.set(3.5,2.5,4.2);camera.setTarget(new Vector3(0,1.5,.6));
}
const world={ground:(x,z,o,m)=>{const h=height(x,z);return h<=o&&h>=o-m?{height:h,normalY:slope?1/Math.hypot(1,.28,.18):1}:null;},wall:()=>null,solidTop:()=>null,headroom:()=>true,canMove:()=>true,fallbackHeight:height,waterLevel:()=>wet?0:null};
window.addEventListener('error',e=>errors.push(e.message));
try{
 const dogo=new DogoCompanion(scene);await dogo.load();dogo.follow.step=()=>{};
 const speed=view==='run'?15:view==='trot'?6:view==='walk'||slope?2.5:view==='swim'?10:0;
 Object.assign(dogo.follow,{visible:true,position:{x:0,y:wet?-DOGO.height*.56:0,z:0},
   heading:0,pitch:slope?-Math.atan(.18):0,roll:slope?Math.atan(.28):0,
   speed,gaitSpeed:speed,angularSpeed:0,sniffing:view==='sniff',locomotion:wet?(speed?'swim':'swimIdle'):speed?'walk':'idle'});
 if(greeting){Object.assign(dogo.follow,{position:{x:0,y:0,z:.95},heading:Math.PI});Object.assign(dogo.play,{mode:'greet',elapsed:2});dogo.play.update=()=>true;}
 if(chasing){Object.assign(dogo.follow,{position:{x:0,y:0,z:3.3},heading:Math.PI});Object.assign(dogo.play,{quiet:30,next:'chaseTail'});camera.position.set(4,3,6);camera.setTarget(new Vector3(0,.6,3.6));}
 const frame=()=>{dogo.update(1/60,{x:0,y:0,z:0,heading:0,supported:true,context:'review'},world,{x:0,z:0});engine.beginFrame();scene.render();engine.endFrame();};
 frame();await scene.whenReadyAsync();
 for(let i=0;i<90;i++){frame();await new Promise(r=>requestAnimationFrame(r));}
 let swimMotion;
 if(wet){
   const nose=scene.getTransformNodeByName('nose'),paw=scene.getTransformNodeByName('front_toe.L');
   const heights=[],reaches=[],pawRises=[],elbowY=[],elbowZ=[];
   for(let i=0;i<120;i++){
     frame();nose.computeWorldMatrix(true);paw.computeWorldMatrix(true);
     heights.push(nose.absolutePosition.y);reaches.push(paw.absolutePosition.z);
     const elbow=scene.getTransformNodeByName('front_shin.L');elbow.computeWorldMatrix(true);
     elbowY.push(elbow.absolutePosition.y);elbowZ.push(elbow.absolutePosition.z);
     for(const side of ['L','R']){
       const wrist=scene.getTransformNodeByName('front_foot.'+side),toe=scene.getTransformNodeByName('front_toe.'+side);
       wrist.computeWorldMatrix(true);toe.computeWorldMatrix(true);pawRises.push(toe.absolutePosition.y-wrist.absolutePosition.y);
     }
   }
   swimMotion={noseMin:Math.min(...heights),noseMax:Math.max(...heights),pawStroke:Math.max(...reaches)-Math.min(...reaches),maxPawRise:Math.max(...pawRises),
     elbowTravel:Math.max(...elbowZ)-Math.min(...elbowZ),elbowBob:Math.max(...elbowY)-Math.min(...elbowY)};
   if(swimMotion.noseMin<.3||swimMotion.noseMax-swimMotion.noseMin<.02)throw Error('Head must move while remaining above water: '+JSON.stringify(swimMotion));
   if(swimMotion.pawStroke<.08)throw Error('Swimming foreleg does not reach and recover: '+JSON.stringify(swimMotion));
   if(swimMotion.maxPawRise>.015)throw Error('Wrist bends upward instead of downward: '+JSON.stringify(swimMotion));
   if(swimMotion.elbowTravel<.04||swimMotion.elbowBob>swimMotion.elbowTravel)throw Error('Elbow must move mainly forward and back: '+JSON.stringify(swimMotion));
 }
 // Same authored phase across captures; inspect the actual skin deformation.
 for(const group of dogo.actions.values())if(group.isStarted)group.goToFrame(group.from+(group.to-group.from)*.48);
 frame();
 const body=scene.getMeshByName('Dogo_LP');const nose=scene.getTransformNodeByName('nose');nose.computeWorldMatrix(true);
 if(!body?.isReady(true)||body.getTotalVertices()!==3816)throw Error('Refined skinned mesh did not render');
 if(engine._gl.getError())throw Error('WebGL error');
 if(dogo.status.failure)throw Error(dogo.status.failure);
 const footError=Math.max(0,...dogo.status.footContact.feet.map(f=>Math.abs(f.error)));
 if(greeting&&dogo.status.playPose.contacts.some(c=>c.error>.12))throw Error('Greeting paw contact mismatch: '+JSON.stringify(dogo.status.playPose));
 if(chasing&&dogo.play.mode!=='chaseTail')throw Error('Tail chase did not start');
 if(!wet&&footError>.08)throw Error('Foot contact error '+footError);
 if(wet&&dogo.status.footContact.enabled)throw Error('Swimming still constrained by ground');
 const pixels=await engine.readPixels(0,0,engine.getRenderWidth(),engine.getRenderHeight());let dogPixels=0;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i]>160&&pixels[i+1]>140&&pixels[i+2]>120&&pixels[i]>pixels[i+2]*1.06)dogPixels++;
 if(dogPixels<500)throw Error('White dog not visible in completed frame');
 window.dogoReview={result:{view,action:dogo.status.action,clips:dogo.status.activeClips,footError,noseHeight:nose.absolutePosition.y,
   bones:body.skeleton.bones.length,boneTexture:body.skeleton.isUsingTextureForMatrices,dogPixels,swimMotion,play:dogo.status.play,playPose:dogo.status.playPose,errors},scene,dogo,
   pose:t=>{for(const group of dogo.actions.values())if(group.isStarted)group.goToFrame(group.from+(group.to-group.from)*t);frame();}};
 document.querySelector('#status').textContent=`Dogo refinado · ${view}`;document.body.dataset.ready='true';
}catch(e){document.body.dataset.ready='false';window.dogoFailure=String(e);throw e;}
