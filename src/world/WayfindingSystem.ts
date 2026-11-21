import { loadGpuAssetContainerAsync as LoadAssetContainerAsync } from './GpuAssets';
import { AssetContainer, Color3, DynamicTexture, Light, Material, Mesh,
  MeshBuilder, MultiMaterial, PBRMaterial, PointLight, Scene, StandardMaterial,
  Texture, TransformNode, Vector3, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { WAYFINDING_ASSETS, type WayfindingAsset } from './wayfindingAssets';
import type { GuideRoute, WayfindingSite } from './wayfindingData';
import { WayfindingSway } from './WayfindingSway';
import { addWayfindingEndGrain } from './wayfindingGeometry';
import { setMaterialLightBudget } from './SceneLightBudget';
import { gpuAssetUrl } from './GpuAssets';

/** Region-independent road furniture, with inscriptions painted on both faces.
 * New road layouts supply sites/routes; meshes, textures and lamps are reused. */
export class WayfindingSystem {
  readonly ready:Promise<void>;
  readonly errors:string[]=[];
  readonly placed=new Map<string,{root:TransformNode;meshes:Mesh[];site:WayfindingSite}>();
  private assets=new Map<WayfindingAsset,AssetContainer>();
  private labels:StandardMaterial[]=[];
  private lamps:{light:PointLight;characterLight:PointLight;root:TransformNode;furniture:AbstractMesh[]}[]=[];
  private characters=new Set<TransformNode>();
  private standardCharacters:AbstractMesh[]=[];
  private characterRefresh=0;
  private sways:WayfindingSway[]=[];
  private swaySeconds=0;
  private woodTextures:Texture[]=[];
  private endGrain:PBRMaterial|null=null;
  private disposed=false;
  private readonly siteHeights=new Map<string,number>();
  constructor(private scene:Scene,private parent:TransformNode,readonly sites:readonly WayfindingSite[],
    private heightAt:(x:number,z:number)=>number){
    // Capture elevations before travel can evict the site's terrain tiles.
    for(const site of sites)this.siteHeights.set(site.id,heightAt(...site.at));
    this.ready=this.load();
  }

  private async load():Promise<void>{
    await Promise.all([...new Set(this.sites.map(s=>s.asset))].map(async id=>{
      try{const asset=await LoadAssetContainerAsync(WAYFINDING_ASSETS[id].path,this.scene);
        if(this.disposed){asset.dispose();return;}this.improveWood(asset);this.assets.set(id,asset);
      }catch(e){this.errors.push(`${id}: ${String(e)}`);console.error('[Wayfinding]',id,e);}
    }));
    if(this.disposed)return;
    for(const site of this.sites){const asset=this.assets.get(site.asset);if(asset)this.place(site,asset);}
    // Keep the terrain/buildings out of these local lights; characters are
    // registered separately and can finish loading after the furniture.
    for(const lamp of this.lamps)lamp.furniture=[...this.placed.values()]
      .filter(p=>Vector3.Distance(p.root.position,lamp.root.position)<34).flatMap(p=>p.meshes);
    this.refreshCharacterLighting();
  }

  private improveWood(asset:AssetContainer):void{
    if(!this.woodTextures.length){
      const color=new Texture(gpuAssetUrl('/assets/wayfinding/wood-v2-color.png',this.scene),this.scene,false,false);
      const normal=new Texture(gpuAssetUrl('/assets/wayfinding/wood-v2-normal.png',this.scene),this.scene,false,false);
      const end=new Texture(gpuAssetUrl('/assets/wayfinding/wood-v2-endgrain.png',this.scene),this.scene,false,false);
      normal.gammaSpace=false;normal.level=.28;
      for(const texture of [color,normal,end]){texture.wrapU=Texture.WRAP_ADDRESSMODE;texture.wrapV=Texture.WRAP_ADDRESSMODE;texture.anisotropicFilteringLevel=8;}
      this.woodTextures=[color,normal,end];
      this.endGrain=new PBRMaterial('Roble · corte transversal',this.scene);
      this.endGrain.albedoTexture=end;this.endGrain.albedoColor.set(.88,.92,.96);
      this.endGrain.metallic=0;this.endGrain.roughness=.94;
    }
    for(const material of asset.materials)if(material instanceof PBRMaterial&&material.name==='Roble envejecido'){
      material.albedoTexture=this.woodTextures[0];material.bumpTexture=this.woodTextures[1];
      material.albedoColor.set(.88,.92,.96);
      // Old packed maps describe the previous grain; use a restrained matte
      // finish with the matching new normal map instead of mismatched grooves.
      material.metallicTexture=null;material.ambientTexture=null;material.metallic=0;material.roughness=.88;
    }
    // Replaced wood maps used to stay alive in the container for the whole
    // session. Keep maps referenced by any material (including shared iron).
    const used=new Set(asset.materials.flatMap(m=>m.getActiveTextures()));
    for(let i=asset.textures.length-1;i>=0;i--){
      const texture=asset.textures[i];
      if(!used.has(texture)){asset.textures.splice(i,1);texture.dispose();}
    }
  }

  private place(site:WayfindingSite,asset:AssetContainer):void{
    const root=new TransformNode(`wayfinding:${site.id}`,this.scene);root.parent=this.parent;
    root.position.set(site.at[0],this.siteHeights.get(site.id)??this.heightAt(...site.at),site.at[1]);root.rotation.y=site.yaw;
    root.metadata={wayfinding:true,location:site.location,region:site.region,routes:site.routes};
    const axes=new TransformNode(`${root.name}:axes`,this.scene);axes.parent=root;axes.rotation.y=Math.PI;
    const pointer=site.asset.includes('Pointer');axes.position.y=pointer?-.2287568:-.45505095;
    if(pointer)axes.position.z=3.55;
    const instance=asset.instantiateModelsToScene(n=>`${site.id}:${n}`,false,{doNotInstantiate:true});
    for(const node of instance.rootNodes)node.parent=axes;
    if(this.endGrain)for(const mesh of root.getChildMeshes())
      if(mesh instanceof Mesh)addWayfindingEndGrain(mesh,this.endGrain);
    const sway=site.asset==='wayfindingBoard'||site.asset==='wayfindingLamp'
      ?new WayfindingSway(root,site.asset==='wayfindingLamp'):null;
    if(sway)this.sways.push(sway);
    const wood=asset.materials.find(m=>m.name==='Roble envejecido')??asset.materials[0];
    if(site.asset==='wayfindingBoard'){
      for(const back of [false,true]){
        const yaw=back?Math.PI:0;
        this.paint(root,[1.62,5.94-.45505,back?-.052:-.394],2.4,.29,yaw,[site.region.toUpperCase()]);
        this.paint(root,[1.68,4.76-.45505,back?-.117:-.345],1.34,.9,yaw,
          [site.location,...site.routes.slice(0,3).map(r=>`${this.arrow(r,site.yaw+yaw)} ${r.label}`)],sway);
      }
    }else if(pointer){
      const two=site.asset==='wayfindingPointer2';
      if(two){
        this.paint(root,[.225,5.773-.22876,.25],1.65,.40,-Math.PI/2,[site.routes[0]?.label??site.location]);
        // The back of each arrow has the post in front of it: keep its lettering
        // on the exposed part of the board instead of hiding words behind wood.
        this.paint(root,[.081,5.773-.22876,.93],1.05,.40,Math.PI/2,[site.routes[0]?.label??site.location]);
        const yaw=-Math.atan2(.715,.699);
        this.paint(root,[-.170,4.694-.22876,-.446],1.55,.38,yaw,[site.routes[1]?.label??'']);
        this.paint(root,[-.520,4.694-.22876,-.594],1.10,.38,yaw+Math.PI,[site.routes[1]?.label??'']);
      }else{
        const name=site.routes[0]?.label??site.location;
        this.paint(root,[.300,5.67-.22876,0],1.65,.70,-Math.PI/2,[name,'→']);
        this.paint(root,[.072,5.67-.22876,.58],.70,.70,Math.PI/2,[name,'←']);
      }
      const y=two?3.67:4.28;
      const plaque=MeshBuilder.CreateBox(`${root.name}:location`,{width:1.7,height:.52,depth:.36},this.scene);
      plaque.parent=root;plaque.position.set(0,y,0);plaque.rotation.y=-Math.PI/2;plaque.material=wood;
      this.paint(root,[.188,y,0],1.53,.43,-Math.PI/2,[site.region.toUpperCase(),site.location]);
      this.paint(root,[-.188,y,0],1.53,.43,Math.PI/2,[site.region.toUpperCase(),site.location]);
    }else{
      const light=new PointLight(`${root.name}:amber`,new Vector3(2.234,4.44-.45505,-.23),this.scene);
      light.parent=root;light.diffuse=new Color3(1,.65,.28);light.specular=new Color3(.6,.32,.12);
      light.range=32;light.intensity=0;light.renderPriority=1;light.falloffType=Light.FALLOFF_GLTF;
      light.setEnabled(false);
      // StandardMaterial uses linear attenuation, unlike Santi's PBR materials.
      // A separate receiver list avoids applying PBR intensity to simple NPCs.
      const characterLight=new PointLight(`${root.name}:characters-standard`,light.position.clone(),this.scene);
      characterLight.parent=root;characterLight.diffuse=light.diffuse.clone();characterLight.specular=light.specular.clone();
      characterLight.range=light.range;characterLight.intensity=0;characterLight.renderPriority=1;
      characterLight.setEnabled(false);
      if(sway)for(const source of [light,characterLight]){
        source.position.copyFrom(sway.localPoint(source.position));source.parent=sway.pivot;
      }
      this.lamps.push({light,characterLight,root,furniture:[]});
    }
    const meshes=root.getChildMeshes().filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
    for(const mesh of meshes){mesh.isPickable=false;mesh.checkCollisions=false;mesh.metadata={...mesh.metadata,wayfinding:true,site:site.id};}
    this.placed.set(site.id,{root,meshes,site});
  }

  private arrow(route:GuideRoute,yaw:number):string{
    const a=route.points[0],b=route.points.find(p=>Math.hypot(p[0]-a[0],p[1]-a[1])>.05);
    if(!b)return '•';const dx=b[0]-a[0],dz=b[1]-a[1],x=Math.cos(yaw)*dx-Math.sin(yaw)*dz,z=Math.sin(yaw)*dx+Math.cos(yaw)*dz;
    return Math.abs(x)>Math.abs(z)?x>0?'→':'←':z>0?'↑':'↓';
  }

  private paint(root:TransformNode,at:readonly [number,number,number],width:number,height:number,yaw:number,lines:string[],sway:WayfindingSway|null=null):void{
    const name=`${root.name}:ink:${this.labels.length}`,h=256,w=Math.min(1536,Math.round(h*width/height));
    const texture=new DynamicTexture(name,{width:w,height:h},this.scene,true);texture.hasAlpha=true;
    const ctx=texture.getContext() as CanvasRenderingContext2D;ctx.clearRect(0,0,w,h);ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#fff0c7';ctx.strokeStyle='#392214';ctx.lineJoin='round';
    const row=h/(lines.length+.25);
    lines.forEach((line,i)=>{let size=Math.floor(row*.72);ctx.font=`bold ${size}px Georgia`;
      const measured=ctx.measureText(line).width;if(measured>w*.91){size=Math.floor(size*w*.91/measured);ctx.font=`bold ${size}px Georgia`;}
      const y=(i+.62)*row;ctx.lineWidth=Math.max(1,size*.035);ctx.strokeText(line,w/2,y);ctx.fillText(line,w/2,y);
    });
    texture.update();texture.anisotropicFilteringLevel=8;
    const material=new StandardMaterial(name,this.scene);material.diffuseTexture=texture;
    material.useAlphaFromDiffuseTexture=true;material.specularColor=Color3.Black();material.emissiveColor=new Color3(.22,.20,.15);
    material.transparencyMode=Material.MATERIAL_ALPHABLEND;material.backFaceCulling=true;
    const mesh=MeshBuilder.CreatePlane(name,{width,height},this.scene);mesh.parent=root;mesh.position.set(...at);mesh.rotation.y=yaw;mesh.material=material;
    if(sway){mesh.position.copyFrom(sway.localPoint(mesh.position));mesh.parent=sway.pivot;}
    mesh.metadata={inscription:lines.join(' | ')};this.labels.push(material);
  }

  /** Register the hierarchy, including meshes/equipment that load later. */
  addCharacter(root:TransformNode):void{
    if(this.disposed)return;
    this.characters.add(root);this.refreshCharacterLighting();
  }

  private refreshCharacterLighting():void{
    const pbr:AbstractMesh[]=[],standard:AbstractMesh[]=[];
    const prepare=(material:Material|null):void=>{
      if(material instanceof MultiMaterial){for(const sub of material.subMaterials)prepare(sub);}
      else if((material instanceof StandardMaterial||material instanceof PBRMaterial)&&material.maxSimultaneousLights<5)
        // Sun, sky and moon plus at most two nearby lamps per character.
        setMaterialLightBudget(material,5);
    };
    for(const root of this.characters){
      if(root.isDisposed()){this.characters.delete(root);continue;}
      for(const mesh of root.getChildMeshes()){
        if(mesh.isDisposed()||!mesh.getTotalVertices())continue;
        prepare(mesh.material);
        (mesh.material instanceof StandardMaterial?standard:pbr).push(mesh);
      }
    }
    this.standardCharacters=standard;
    const setReceivers=(light:PointLight,meshes:AbstractMesh[])=>{
      if(light.includedOnlyMeshes.length!==meshes.length||meshes.some((m,i)=>light.includedOnlyMeshes[i]!==m))
        light.includedOnlyMeshes=meshes;
    };
    for(const lamp of this.lamps){
      setReceivers(lamp.light,[...lamp.furniture,...pbr]);
      setReceivers(lamp.characterLight,standard);
      // An empty Babylon inclusion list means every mesh, not no meshes.
      if(!standard.length)lamp.characterLight.setEnabled(false);
    }
    this.characterRefresh=0;
  }

  update(night:number,observer:{x:number;z:number},dt=.5):void{
    this.swaySeconds+=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    this.characterRefresh+=dt;
    if(this.characterRefresh>=.5)this.refreshCharacterLighting();
    for(const {root} of this.placed.values()){
      const position=root.getAbsolutePosition();
      root.setEnabled(Math.hypot(position.x-observer.x,position.z-observer.z)<220);
    }
    for(const sway of this.sways)sway.update(this.swaySeconds);
    const nearby=this.lamps.map(l=>{const p=l.root.getAbsolutePosition();
      return {l,d:Math.hypot(p.x-observer.x,p.z-observer.z)};}).sort((a,b)=>a.d-b.d);
    for(let i=0;i<nearby.length;i++){
      const {l,d}=nearby[i],strength=i<2&&d<90&&l.root.isEnabled()?Math.max(0,Math.min(1,night)):0;
      l.light.intensity=60*strength;l.light.setEnabled(strength>0);
      l.characterLight.intensity=1.5*strength;l.characterLight.setEnabled(strength>0&&this.standardCharacters.length>0);
    }
    for(const asset of this.assets.values())for(const material of asset.materials)if(material instanceof PBRMaterial&&material.name==='Vidrio ámbar')
      material.emissiveColor.set(.82*(.3+.7*night),.69*(.3+.7*night),.52*(.3+.7*night));
  }

  canMove(x:number,z:number,fromX:number,fromZ:number,feetY:number):boolean{
    for(const {root,site} of this.placed.values()){
      if(feetY>root.position.y+6.2)continue;
      const radius=WAYFINDING_ASSETS[site.asset].collisionRadius+.6,d=Math.hypot(x-site.at[0],z-site.at[1]);
      if(d<radius&&d<Math.hypot(fromX-site.at[0],fromZ-site.at[1])-.0001)return false;
    }return true;
  }

  dispose():void{
    this.disposed=true;for(const {light,characterLight} of this.lamps){light.dispose();characterLight.dispose();}this.lamps=[];
    this.characters.clear();this.standardCharacters=[];
    this.sways=[];
    for(const {root} of this.placed.values())root.dispose(false,false);this.placed.clear();
    for(const m of this.labels)m.dispose(false,true);this.labels=[];
    for(const a of this.assets.values())a.dispose();this.assets.clear();
    this.endGrain?.dispose();this.endGrain=null;
    for(const texture of this.woodTextures)texture.dispose();this.woodTextures=[];
  }
}
