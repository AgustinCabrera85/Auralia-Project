import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { BRIDGE, WATERFALL } from './geographicFeatures';
import type { PointOfInterest } from './pointsOfInterest';

/** Reusable low-poly placeholders; place definitions live in pointsOfInterest.ts. */
export function createPointOfInterestView(
  scene:Scene,parent:TransformNode,place:PointOfInterest,heightAt:(x:number,z:number)=>number
):TransformNode{
  const root=new TransformNode(`lugar-${place.id}`,scene);
  root.parent=parent;
  root.position.set(place.x,place.kind==='bridge'?BRIDGE.level:heightAt(place.x,place.z),place.z);
  const material=(name:string,color:string,alpha=1):StandardMaterial=>{
    const mat=new StandardMaterial(`lugar-${place.id}-${name}`,scene);
    mat.diffuseColor=Color3.FromHexString(color);
    mat.specularColor=new Color3(.12,.15,.16);
    mat.alpha=alpha;
    return mat;
  };
  const stone=material('piedra','#899497');
  const dark=material('sombra','#3a4449');
  const wood=material('madera','#986f4e');
  const water=material('agua','#c1e9e5',.2);
  water.emissiveColor=new Color3(.018,.04,.045);
  water.backFaceCulling=false;
  const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,mat:StandardMaterial):Mesh=>{
    const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
    mesh.parent=root;mesh.position.set(x,y,z);mesh.material=mat;mesh.isPickable=false;
    return mesh;
  };
  const rock=(name:string,diameter:number,x:number,y:number,z:number,sx=1,sy=.65,sz=1):Mesh=>{
    const mesh=MeshBuilder.CreateSphere(name,{diameter,segments:6},scene);
    mesh.parent=root;mesh.position.set(x,y,z);mesh.scaling.set(sx,sy,sz);mesh.material=stone;mesh.isPickable=false;
    return mesh;
  };
  if(place.kind==='waterfall'){
    rock('roca-mirador',6,0,.9,0,1,.35,1);
    for(const dx of [-3,3])rock('roca-cascada',4,dx,1,-4);
    // Narrow streaks follow the actual falling river profile; no floating wall.
    for(const offset of [-6,0,6]){
      const stripe=new Mesh('veta-cascada',scene);
      const data=new VertexData();
      data.positions=[
        WATERFALL.x+offset-.45,WATERFALL.top+.08,WATERFALL.topZ,
        WATERFALL.x+offset+.45,WATERFALL.top+.08,WATERFALL.topZ,
        WATERFALL.x+offset+1.45,WATERFALL.bottom+.08,WATERFALL.bottomZ,
        WATERFALL.x+offset+.55,WATERFALL.bottom+.08,WATERFALL.bottomZ
      ];
      data.indices=[0,1,2,0,2,3];
      data.normals=[0,1,0,0,1,0,0,1,0,0,1,0];
      data.applyToMesh(stripe);
      stripe.parent=parent;stripe.material=water;stripe.isPickable=false;
    }
    const foam=MeshBuilder.CreateDisc('espuma-cascada',{radius:WATERFALL.width*.52,tessellation:24},scene);
    foam.parent=parent;foam.rotation.x=Math.PI/2;
    foam.position.set(WATERFALL.x,WATERFALL.bottom+.1,WATERFALL.z+4);
    foam.scaling.y=.18;foam.material=water;foam.isPickable=false;
  } else if(place.kind==='ruins'){
    for(const [x,z,h] of [[-4,-2,5],[3,-3,3.5],[0,4,4]] as const){
      box('columna-ruina',1.5,h,1.5,x,h/2,z,stone);
      rock('base-ruina',2.6,x,.3,z,1,.25,1);
    }
    box('dintel-caido',5,.8,1.4,-1,.45,5,stone).rotation.y=.25;
  } else if(place.kind==='lookout'){
    rock('terraza-natural',12,0,.5,0,1,.16,1);
    for(const [x,z] of [[-5,0],[5,0],[0,-5]] as const)box('hito-mirador',1.3,2,1.3,x,1,z,stone);
  } else if(place.kind==='cave'){
    box('interior-cueva',7,6,.35,0,3,-2,dark);
    for(const x of [-4,4])rock('pared-cueva',6,x,2,-1,.8,1.2,1);
    rock('arco-cueva',10,0,6,-1,1,.32,.8);
  } else if(place.kind==='bridge'){
    root.rotation.y=Math.atan2(.8,-.6);
    box('tablero-puente',9,.65,BRIDGE.halfLength*2,0,0,0,wood);
    box('rampa-puente',9,.65,BRIDGE.approachLength,0,-.4,-BRIDGE.halfLength-BRIDGE.approachLength/2,wood)
      .rotation.x=-Math.atan2(.8,BRIDGE.approachLength);
    for(const x of [-4.1,4.1]){
      box('baranda-puente',.3,.35,BRIDGE.halfLength*2,x,1.35,0,wood);
      for(const z of [-18,-9,0,9,18])box('poste-puente',.4,2.3,.4,x,.9,z,wood);
    }
  }
  return root;
}
