import {Engine,Scene,ArcRotateCamera,Vector3,Color3,Color4,HemisphericLight,DirectionalLight,MeshBuilder,StandardMaterial,TransformNode} from '@babylonjs/core';
import {BirdFlockSystem} from '/src/world/wildlife/BirdFlockSystem.ts';
import {BIRD_CLIPS} from '/src/world/wildlife/BirdCatalog.ts';
const canvas=document.querySelector('canvas'),engine=new Engine(canvas,true,{preserveDrawingBuffer:true});
const scene=new Scene(engine);scene.clearColor=new Color4(.24,.34,.43,1);
const camera=new ArcRotateCamera('qa',-Math.PI/3,1.15,1.25,new Vector3(0,.16,0),scene);
camera.minZ=.005;camera.wheelPrecision=120;camera.attachControl(canvas,true);
new HemisphericLight('sky',Vector3.Up(),scene).intensity=1.1;
new DirectionalLight('sun',new Vector3(-.6,-1,.4),scene).intensity=2;
const ground=MeshBuilder.CreateGround('ground',{width:160,height:160},scene),mat=new StandardMaterial('ground',scene);
mat.diffuseColor=new Color3(.24,.34,.23);ground.material=mat;
const water=MeshBuilder.CreateGround('water',{width:60,height:120},scene),wet=new StandardMaterial('water',scene);
water.position.set(46,.06,0);wet.diffuseColor=new Color3(.14,.43,.55);wet.specularColor.set(.5,.5,.5);water.material=wet;
const trees=[{id:'qa-tree',perches:Array.from({length:12},(_,i)=>({x:7+i*.8,y:4,z:12})),
  obstacle:{id:'qa-tree',minX:6,maxX:17,minZ:11,maxZ:13,top:4}}];
const branch=MeshBuilder.CreateBox('perch',{width:11,height:.2,depth:2},scene);branch.position.set(11.5,3.9,12);branch.material=mat;
const world={ground:x=>x>16?-.5:0,water:x=>x>16?.06:null,trees:()=>trees,foodAllowed:()=>true};
const birds=new BirdFlockSystem(scene,new TransformNode('world',scene),world,true);window.__birdQA={birds,scene,engine};
const select=document.querySelector('#clip');for(const name of BIRD_CLIPS)select.add(new Option(name,name));
let species='canary',mode='asset',night=0,frames=0;
const show=s=>{species=s;mode='asset';camera.setTarget(new Vector3(0,.16,0));camera.radius=1.25;camera.alpha=-Math.PI/3;camera.beta=1.15;};
document.querySelector('#canary').onclick=()=>show('canary');document.querySelector('#swallow').onclick=()=>show('swallow');
document.querySelector('#flock').onclick=()=>{mode='flock';birds.simulation.reset({x:0,y:0,z:0},birds.habitat,{canary:4,swallow:2});camera.setTarget(new Vector3(16,3,12));camera.radius=42;};
document.querySelector('#night').onclick=()=>{night=1-night;};
await birds.ready;
for(let i=0;i<60;i++)birds.update(1/60,{focus:{x:0,y:0,z:0},threats:[],night:0,rain:0,active:true,paused:false});
await scene.whenReadyAsync();
engine.runRenderLoop(()=>{
  const dt=Math.min(.05,engine.getDeltaTime()/1000);
  if(mode==='flock')birds.update(dt,{focus:{x:0,y:0,z:0},threats:[],night,rain:0,active:true,paused:false});
  else for(const b of birds.simulation.birds){
    const v=birds.visuals.get(b.id),selected=b.species===species&&b.id===(species==='canary'?0:4);
    v.root.setEnabled(selected);if(!selected)continue;
    v.root.position.set(0,0,0);v.root.rotation.set(0,0,0);for(const m of v.root.getChildMeshes())m.visibility=1;
    b.clip=select.value;birds.animate(v,b,dt);
  }
  scene.render();
  if(frames++%20===0){const s=birds.status;document.querySelector('#status').textContent=
    `${mode==='asset'?species+' · '+select.value:'Bandadas · '+(night?'noche':'día')} | ${engine.getFps().toFixed(0)} FPS\n`+
    `Assets: ${s.ready.join(', ')} · Fallos: ${s.failures.length}\n`+
    (mode==='flock'?s.birds.map(b=>`${b.species}: ${b.state} (${b.position.y.toFixed(1)} m)`).join('\n'):'10 clips por especie · alas y rig independientes');}
});
window.addEventListener('resize',()=>engine.resize());
