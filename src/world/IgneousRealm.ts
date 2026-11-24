import * as B from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { TraversalWorld } from '../game/CharacterTraversalController';
import { TRAVERSAL } from '../game/traversalRules';
import { RockColliderSystem } from './RockColliderSystem';
import { repairIgneousFloors } from './IgneousGeometry';
import { IgneousCrystal } from './IgneousCrystal';
import { ASSET_CATALOG } from './assetCatalog';
import { setMaterialLightBudget } from './SceneLightBudget';

type Point=[number,number,number];
type Beam=[Point,Point,Point,number,number,number];
export type IgneousMetadata={
  player:{spawnFeet:Point};checkpoints:Record<string,Point>;recommendedCheckpoints:string[];
  gates:{node:string;closed:Point;open:Point;flag:string}[];
  discoveries:{lugar:string;pista:string;recompensa:string}[];
  hazards:{id:string;kind:string;height:number;polygon:Point[]}[];
  pool:{center:Point;nominalSizeMeters:[number,number]};
  faroles:[Point,Point,number,boolean][];apliques:Beam[][];
  caverna:{materiales:string[]};
  iluminacion:{ambiente:number;rasante:number;densidad:number;exposicion:number;
    tonoAmbiente:Point;tonoRasante:Point;reboteRoca:Point;focos:[Point,Point,number,number,Point?][];
    luzPasarela:[Point,Point,number][]};
};
type MaterialState={setActive(active:boolean):void;dispose():void};
export type IgneousAssets={container:B.AssetContainer;meta:IgneousMetadata;crystal?:B.AssetContainer;
  apply?:(point:(p:Point)=>B.Vector3,direction:(p:Point)=>B.Vector3)=>MaterialState};
export type IgneousLoader=(scene:B.Scene)=>Promise<IgneousAssets>;
// User-calibrated equivalence: Santi's 3.8 game units represent 1.4 authoring units.
export const IGNEOUS_SCALE=TRAVERSAL.playerHeight/1.4;
export const IGNEOUS_BASE_Y=-600;
export const igneousFlag=(flag:string)=>'reino-igneo-'+flag.replaceAll('_','-');

export const loadIgneousAssets:IgneousLoader=async scene=>{
  const [response,runtime]=await Promise.all([fetch('/assets/reino-igneo/nivel.json'),import('./reino-igneo/materiales.mjs')]);
  if(!response.ok)throw new Error(`Reino Ígneo: metadatos HTTP ${response.status}`);
  const meta=await response.json() as IgneousMetadata;
  const container=await B.SceneLoader.LoadAssetContainerAsync('/assets/reino-igneo/','Reino_Igneo.glb',scene);
  let crystal:B.AssetContainer;
  try{crystal=await B.SceneLoader.LoadAssetContainerAsync('',ASSET_CATALOG.cristalFuego.path,scene);}
  catch(error){container.dispose();throw error;}
  // Pass the actual engine classes without retaining every unrelated Babylon export in the bundle.
  const materialNamespace={Vector3:B.Vector3,PBRMaterial:B.PBRMaterial,MaterialPluginBase:B.MaterialPluginBase,
    ReflectionProbe:B.ReflectionProbe,RenderTargetTexture:B.RenderTargetTexture,Constants:B.Constants};
  return {container,meta,crystal,apply:(point,direction)=>runtime.aplicarMaterialesReino(materialNamespace,scene,container,meta,point,direction,IGNEOUS_SCALE)};
};

export function inHazardPolygon(x:number,z:number,polygon:readonly Point[]):boolean{
  let inside=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];
    if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;
  }
  return inside;
}

/** One imported container in the existing scene. All metadata passes through the glTF root. */
export class IgneousRealm {
  readonly root:B.TransformNode;
  readonly lights:B.Light[]=[];
  readonly meshes:B.AbstractMesh[]=[];
  meta!:IgneousMetadata;
  checkpointId='A0';
  checkpoint=B.Vector3.Zero();
  loadMilliseconds=0;
  private container:B.AssetContainer|null=null;
  private crystal:IgneousCrystal|null=null;
  private conversion=B.Matrix.Identity();
  private inverse=B.Matrix.Identity();
  private materialState:MaterialState|null=null;
  private pending:Promise<void>|null=null;
  private disposed=false;
  private actorLights:B.Light[]=[];
  private actorSources:B.PointLight[]=[];
  private actorMeshes:B.AbstractMesh[]=[];
  private actorsFill:B.HemisphericLight|null=null;
  private readonly sourceLamps:B.PointLight[]=[];
  private readonly dynamic=new RockColliderSystem(()=>undefined);
  private gates:{node:B.TransformNode;definition:IgneousMetadata['gates'][number];origin:B.Vector3}[]=[];
  private flags:ReadonlySet<string>=new Set();
  private enabled=false;
  private refresh=0;
  constructor(private readonly scene:B.Scene,readonly colliders:RockColliderSystem,
    private readonly loader:IgneousLoader=loadIgneousAssets){
    this.root=new B.TransformNode('reino-igneo',scene);this.root.position.y=IGNEOUS_BASE_Y;
    this.root.scaling.setAll(IGNEOUS_SCALE);this.root.setEnabled(false);
  }
  get loaded(){return this.container!==null;}
  point=(p:Point)=>B.Vector3.TransformCoordinates(B.Vector3.FromArray(p),this.conversion);
  direction=(p:Point)=>B.Vector3.TransformNormal(B.Vector3.FromArray(p),this.conversion).normalize();
  local(p:B.Vector3){return B.Vector3.TransformCoordinates(p,this.inverse);}
  load():Promise<void>{
    return this.pending??=this.loadOnce().catch(error=>{this.pending=null;throw error;});
  }
  private async loadOnce():Promise<void>{
    const started=performance.now();const assets=await this.loader(this.scene);
    if(this.disposed){assets.container.dispose();assets.crystal?.dispose();throw new Error('La carga del Reino Ígneo fue cancelada.');}
    try{
      this.meta=assets.meta;this.container=assets.container;
      const imported=assets.container.rootNodes[0] as B.TransformNode;
      if(!imported)throw new Error('Reino Ígneo sin raíz glTF');
      assets.container.addAllToScene();imported.parent=this.root;this.root.setEnabled(true);
      imported.computeWorldMatrix(true);
      this.conversion.copyFrom(imported.getWorldMatrix());this.conversion.invertToRef(this.inverse);
      repairIgneousFloors(assets.container.meshes.filter((mesh):mesh is B.Mesh=>mesh instanceof B.Mesh));
      for(const def of this.meta.gates){
        const node=[...assets.container.transformNodes,...assets.container.meshes].find(n=>n.name===def.node);
        if(node)this.gates.push({node,definition:def,origin:node.position.clone()});
      }
      for(const mesh of assets.container.meshes){
        if(!(mesh instanceof B.Mesh)||!mesh.getTotalVertices())continue;
        if(assets.crystal&&/^Lago web · cristal/.test(mesh.material?.name??'')){
          mesh.setEnabled(false);continue;
        }
        mesh.computeWorldMatrix(true);mesh.isPickable=false;this.meshes.push(mesh);
        const extras=mesh.metadata?.gltf?.extras??{};
        const moving=extras.auralia_dynamic||this.gates.some(g=>mesh===g.node||mesh.isDescendantOf(g.node));
        if(extras.auralia_collision===true&&extras.auralia_kind!=='lava')
          (moving?this.dynamic:this.colliders).registerGeneratedMesh(mesh,true,!!moving);
        if(!moving)mesh.freezeWorldMatrix();
      }
      if(assets.crystal){
        // Replace only the three old gem primitives; keep the authored pedestal.
        this.crystal=new IgneousCrystal(this.scene,assets.crystal,this.point([77.6362,14.791,-95.2466]),2.8*IGNEOUS_SCALE);
        this.meshes.push(...this.crystal.meshes);
      }
      this.buildLights();
      this.materialState=assets.apply?.(this.point,this.direction)??null;
      // One ambient + one key + two nearby bulbs + two pairs of wall spots.
      for(const material of new Set(this.meshes.map(m=>m.material)))
        if(material)setMaterialLightBudget(material,8);
      this.checkpoint=this.spawn('A0');
      this.setActive(false);this.loadMilliseconds=performance.now()-started;
    }catch(error){this.disposeResources();assets.crystal?.dispose();throw error;}
  }
  spawn(id:string):B.Vector3{
    const p=this.point(this.meta.checkpoints[id]??this.meta.player.spawnFeet);
    const hit=this.colliders.queryStepGround(p.x,p.z,p.y+IGNEOUS_SCALE*1.2,IGNEOUS_SCALE*3,.2);
    if(!hit)throw new Error(`No hay suelo del Reino Ígneo bajo el checkpoint ${id}`);
    p.y=hit.height+.06;return p;
  }
  setFlags(found:readonly string[]):void{
    this.flags=new Set(found);
    this.crystal?.setAwakened(this.flags.has(igneousFlag('cristal')));
    for(const g of this.gates){
      const offset=this.flags.has(igneousFlag(g.definition.flag))?g.definition.open:g.definition.closed;
      // Gate offsets are glTF-local, so their parent supplies the handedness and scale once.
      g.node.position.copyFrom(g.origin).addInPlace(B.Vector3.FromArray(offset));g.node.computeWorldMatrix(true);
    }
  }
  setActive(active:boolean):void{
    this.enabled=active;this.root.setEnabled(active);this.materialState?.setActive(active);
    this.crystal?.setActive(active);
    for(const light of this.lights)light.setEnabled(active&&(light.includedOnlyMeshes.length>0));
  }
  private buildLights():void{
    const look=this.meta.iluminacion,all=this.meshes;
    const add=<T extends B.Light>(light:T,receivers:B.AbstractMesh[]=all):T=>{
      light.includedOnlyMeshes=receivers;this.lights.push(light);return light;
    };
    const fill=add(new B.HemisphericLight('igneo-ambiente',this.direction([.05,.79,-.32]),this.scene));
    fill.diffuse=B.Color3.FromArray(look.tonoAmbiente);fill.groundColor.set(.065,.045,.038);fill.intensity=look.ambiente;
    const rock=all.filter(m=>m.material?.name==='Lago web · basalto'||
      this.meta.caverna.materiales.includes(m.material?.name??'')&&m.material!.name.includes('Macizo continuo'));
    fill.includedOnlyMeshes=all.filter(m=>!rock.includes(m));
    const bounce=add(new B.HemisphericLight('igneo-rebote-roca',fill.direction.clone(),this.scene),rock);
    bounce.diffuse.copyFrom(fill.diffuse);bounce.groundColor=B.Color3.FromArray(look.reboteRoca);bounce.intensity=fill.intensity;
    const key=add(new B.DirectionalLight('igneo-rasante',this.direction([-.65,-.64,.36]),this.scene));
    key.diffuse=B.Color3.FromArray(look.tonoRasante);key.intensity=look.rasante;
    const emitters=all.filter(m=>/brasas y faroles|cristal de la Caldera/.test(m.material?.name??''))
      .flatMap(mesh=>{
        const vertices=mesh.getVerticesData(B.VertexBuffer.PositionKind)??[],points:B.Vector3[]=[];
        for(let i=0;i<vertices.length;i+=3)points.push(B.Vector3.TransformCoordinates(B.Vector3.FromArray(vertices,i),mesh.getWorldMatrix()));
        return points;
      });
    // Metadata also contains invisible fill bulbs. Keep only authored lamps
    // with emissive geometry at the source, including the crystal chamber.
    const lamps=this.meta.faroles.filter(([p])=>{
      const position=this.point(p);return emitters.some(v=>B.Vector3.DistanceSquared(v,position)<(.8*IGNEOUS_SCALE)**2);
    }).map(([p,color,energy])=>{
      const light=new B.PointLight('igneo-farol',this.point(p),this.scene);
      light.diffuse=B.Color3.FromArray(color);light.intensity=energy*.08*IGNEOUS_SCALE**2;
      light.range=15*IGNEOUS_SCALE;light.falloffType=B.Light.FALLOFF_PHYSICAL;return add(light,[]);
    });
    const lavaLight=(p:B.Vector3,name:string,intensity:number,range:number,radius:number)=>{
      const light=add(new B.PointLight(name,p,this.scene),[]);
      light.diffuse.set(1,.23,.028);light.intensity=intensity;light.range=range*IGNEOUS_SCALE;
      // A bounded area approximation avoids point-source hot spots at the banks.
      light.falloffType=B.Light.FALLOFF_STANDARD;light.radius=radius*IGNEOUS_SCALE;
      lamps.push(light);
    };
    const [cx,cy,cz]=this.meta.pool.center;
    for(const dx of [-24,24])for(const dz of [-13,13]){
      if(this.meta.hazards.some(h=>inHazardPolygon(cx+dx,cz+dz,h.polygon)))
        lavaLight(this.point([cx+dx,cy+1.2,cz+dz]),'igneo-lago-emision',1.7,100,18);
    }
    for(const mesh of all.filter(m=>m.material?.name.includes('Lava rocosa')&&!m.material.name.includes('Pool'))){
      const box=mesh.getBoundingInfo().boundingBox;
      lavaLight(box.centerWorld.clone(),'igneo-cascada-emision',1.8,60,4);
    }
    if(this.crystal)lamps.push(add(this.crystal.light,[]));
    this.sourceLamps.push(...lamps);
    const fixtures=this.meta.apliques.map(pair=>pair.map(([p,d,color,energy,angle,range])=>{
      const light=new B.SpotLight('igneo-aplique',this.point(p),this.direction(d),angle,1,this.scene);
      light.diffuse=B.Color3.FromArray(color);light.intensity=energy*IGNEOUS_SCALE**2;
      light.range=range*IGNEOUS_SCALE;light.falloffType=B.Light.FALLOFF_PHYSICAL;return add(light,[]);
    }));
    // Lava replaces invisible fill bulbs within the same two-lamp budget per sector.
    const receivers=new Map<B.Light,B.AbstractMesh[]>();for(const l of [...lamps,...fixtures.flat()])receivers.set(l,[]);
    for(const mesh of all){
      const center=mesh.getBoundingInfo().boundingBox.centerWorld;
      // The luminous pane already emits light; lighting it with its own bulb
      // at a few centimetres produces a white, clipped surface.
      if(mesh.material?.name.includes('brasas y faroles'))continue;
      for(const light of this.nearbyLamps(center))receivers.get(light)!.push(mesh);
      for(const pair of [...fixtures].sort((a,b)=>B.Vector3.DistanceSquared(center,a[0].position)-B.Vector3.DistanceSquared(center,b[0].position)).slice(0,2))
        for(const light of pair)receivers.get(light)!.push(mesh);
    }
    for(const [light,list] of receivers)light.includedOnlyMeshes=list;
    this.actorsFill=add(new B.HemisphericLight('igneo-personajes',B.Vector3.Up(),this.scene),[]);
    this.actorsFill.diffuse.copyFrom(fill.diffuse);this.actorsFill.groundColor.set(.18,.15,.12);this.actorsFill.intensity=.85;
    for(let i=0;i<2;i++){
      const light=add(new B.PointLight('igneo-personajes-farol-'+i,B.Vector3.Zero(),this.scene),[]);
      light.falloffType=B.Light.FALLOFF_PHYSICAL;light.range=25*IGNEOUS_SCALE;this.actorLights.push(light);
    }
  }
  private nearbyLamps(p:B.Vector3):B.PointLight[]{
    const local=this.local(p),palace=local.x>33&&local.z< -40&&local.y>10;
    const contribution=(l:B.PointLight)=>{
      if(palace&&l.name.endsWith('-emision'))return 0;
      const distance=B.Vector3.Distance(p,l.position);
      if(distance>=l.range)return 0;
      return l.falloffType===B.Light.FALLOFF_STANDARD?l.intensity*(1-distance/l.range):
        l.intensity/Math.max(IGNEOUS_SCALE**2,distance**2);
    };
    return this.sourceLamps.filter(l=>contribution(l)>0).sort((a,b)=>contribution(b)-contribution(a)).slice(0,2);
  }
  private actorLampIntensity(lamp:B.PointLight):number{
    if(lamp.falloffType!==B.Light.FALLOFF_PHYSICAL)return lamp.intensity;
    let nearestSquared=Infinity;
    for(const mesh of this.actorMeshes){
      if(!mesh.isVisible||!mesh.isEnabled())continue;
      mesh.computeWorldMatrix();
      const box=mesh.getBoundingInfo().boundingBox,p=lamp.position;
      const dx=Math.max(box.minimumWorld.x-p.x,0,p.x-box.maximumWorld.x);
      const dy=Math.max(box.minimumWorld.y-p.y,0,p.y-box.maximumWorld.y);
      const dz=Math.max(box.minimumWorld.z-p.z,0,p.z-box.maximumWorld.z);
      nearestSquared=Math.min(nearestSquared,dx*dx+dy*dy+dz*dz);
    }
    // Cap near-field irradiance for both Santi and Dogo, whose lighter surfaces
    // clip long before the dark masonry. Area-like lava lights keep their curve.
    return Math.min(lamp.intensity,1.5*Math.max(.25,nearestSquared));
  }
  update(dt:number,p:B.Vector3,characters:readonly B.TransformNode[],grounded:boolean,effects:readonly B.AbstractMesh[]=[]):B.Vector3|null{
    if(!this.enabled)return null;
    this.crystal?.update(dt);
    this.refresh-=dt;
    if(this.refresh<=0){
      this.refresh=.4;const actors=[...characters.flatMap(c=>c.getChildMeshes(false)),...effects];
      if(actors.length!==this.actorMeshes.length||actors.some((m,i)=>m!==this.actorMeshes[i])){
        this.actorMeshes=actors;
        for(const light of [this.actorsFill!,...this.actorLights]){light.includedOnlyMeshes=actors;light.setEnabled(actors.length>0);}
      }
      const lamps=this.actorSources=this.nearbyLamps(p);
      this.actorLights.forEach((light,i)=>{const lamp=lamps[i];light.setEnabled(!!lamp&&this.actorMeshes.length>0);if(lamp){
        (light as B.PointLight).position.copyFrom(lamp.position);light.diffuse.copyFrom(lamp.diffuse);
        light.intensity=this.actorLampIntensity(lamp);light.range=lamp.range;light.radius=lamp.radius;light.falloffType=lamp.falloffType;
      }});
    }
    this.actorLights.forEach((light,i)=>{const source=this.actorSources[i];if(source)light.intensity=this.actorLampIntensity(source);});
    if(grounded)for(const id of this.meta.recommendedCheckpoints){
      const q=this.point(this.meta.checkpoints[id]);
      if(Math.hypot(p.x-q.x,p.z-q.z)<3*IGNEOUS_SCALE&&Math.abs(p.y-q.y)<IGNEOUS_SCALE){this.checkpointId=id;this.checkpoint.copyFrom(p);}
    }
    const local=this.local(p);
    const lava=this.meta.hazards.some(h=>local.y<h.height+.45&&inHazardPolygon(local.x,local.z,h.polygon));
    // Absolute authored abyss floor. A valid 108 m descent never trips a relative fall limit.
    return lava||local.y< -60?this.checkpoint.clone():null;
  }
  action(p:B.Vector3):string|null{
    const local=this.local(p),near=(id:string,r=3)=>{
      const q=this.meta.checkpoints[id];return q&&Math.hypot(local.x-q[0],local.z-q[2])<r&&Math.abs(local.y-q[1])<1.8;
    };
    if(near('entrada'))return 'exit';
    if(near('mando')&&!this.flags.has(igneousFlag('reja_abierta')))return 'reja_abierta';
    if(near('torno')&&!this.flags.has(igneousFlag('salida_abierta')))return 'salida_abierta';
    for(const d of this.meta.discoveries)if(near(d.lugar)&&!this.flags.has(igneousFlag(d.lugar)))return d.lugar;
    if(near('palacio_cristal')&&!this.flags.has(igneousFlag('cristal')))return 'cristal';
    return null;
  }
  traversalWorld():TraversalWorld{
    const c=this.colliders;
    const wall=(x:number,y:number,z:number,dx:number,dz:number,reach:number)=>{
      const a=c.queryWall(x,y,z,dx,dz,reach),b=this.dynamic.queryWall(x,y,z,dx,dz,reach);
      const h=!a?b:!b?a:a.distance<b.distance?a:b;
      return h?{pointX:h.point.x,pointY:h.point.y,pointZ:h.point.z,distance:h.distance,normalX:h.normal.x,normalY:h.normal.y,normalZ:h.normal.z,rockId:h.rockId,climbable:false}:null;
    };
    return {stepHeightAt:()=>.38*IGNEOUS_SCALE,ground:(x,z,y,max,radius)=>{const h=c.queryStepGround(x,z,y,max,radius,.38*IGNEOUS_SCALE);return h?{height:h.height,normalY:h.normal.y,rockId:h.rockId}:null;},
      wall,solidTop:(x,z,y,max,id)=>{const h=c.querySolidTop(x,z,y,max,id);return h&&h.normal.y>0?
        {height:h.height,normalX:h.normal.x,normalZ:h.normal.z,rockId:h.rockId,centerX:h.centerX,centerZ:h.centerZ}:null;},
      headroom:(x,y,z,h)=>c.queryCeiling(x,y+.05,z,h)===null&&this.dynamic.queryCeiling(x,y+.05,z,h)===null,
      canMove:(x,z,fx,fz,y)=>{const dx=x-fx,dz=z-fz,d=Math.hypot(dx,dz);return d<1e-6||![.38*IGNEOUS_SCALE+.05,1.9,3.5].some(h=>wall(fx,y+h,fz,dx,dz,d+TRAVERSAL.playerRadius*.7));},
      fallbackHeight:()=>IGNEOUS_BASE_Y-200*IGNEOUS_SCALE};
  }
  cameraObstruction(from:B.Vector3,to:B.Vector3):number|null{
    const a=this.colliders.queryCameraObstruction(from,to,.5),b=this.dynamic.queryCameraObstruction(from,to,.5);
    return a===null?b:b===null?a:Math.min(a,b);
  }
  private disposeResources():void{
    this.crystal?.dispose();this.crystal=null;
    this.sourceLamps.length=0;
    this.actorSources.length=0;
    this.materialState?.dispose();this.materialState=null;this.dynamic.dispose();this.colliders.dispose();
    for(const l of this.lights)l.dispose();this.lights.length=0;this.meshes.length=0;this.gates=[];
    this.container?.dispose();this.container=null;
  }
  dispose():void{this.disposed=true;this.disposeResources();this.root.dispose();}
}
