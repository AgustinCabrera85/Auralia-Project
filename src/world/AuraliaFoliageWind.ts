import { MaterialPluginBase, MultiMaterial, PBRMaterial, ShaderLanguage,
  type AbstractEngine, type AbstractMesh, type Scene, type SubMesh,
  type UniformBuffer } from '@babylonjs/core';
import { attachAuraliaFoliageWind, type AuraliaFoliageController } from
  './AuraliaFoliageWindV5.js';
import type { Season } from './climate/ClimateModel';

/** The supplied V5 handles wood and leaves. This separate plugin retains ground-cover wind. */
class AuraliaGroundWindPlugin extends MaterialPluginBase {
  constructor(material:PBRMaterial,
    private readonly state:AuraliaFoliageController['state']){
    super(material,'AuraliaGroundWind',210,undefined,true,false);
    this.registerForExtraEvents=true;
    this._enable(true);
  }

  override isCompatible(language:ShaderLanguage):boolean{
    return language===ShaderLanguage.GLSL;
  }

  override getUniforms(){
    return {externalUniforms:['aurGroundTime','aurGroundStrength','aurGroundDir']};
  }

  override getCustomCode(shaderType:string):Record<string,string>|null{
    if(shaderType!=='vertex')return null;
    return {
      CUSTOM_VERTEX_DEFINITIONS:`
        uniform float aurGroundTime;
        uniform float aurGroundStrength;
        uniform vec2 aurGroundDir;
      `,
      CUSTOM_VERTEX_UPDATE_POSITION:`
        #ifdef UV1
          float aurGroundUvPhase=dot(positionUpdated.xz,vec2(2.72,3.13));
          uvUpdated.x+=sin(aurGroundTime*3.2+aurGroundUvPhase)*0.002*aurGroundStrength;
        #endif
      `,
      CUSTOM_VERTEX_UPDATE_WORLDPOS:`
        vec2 aurGroundDirection=normalize(aurGroundDir+vec2(0.0001,0.0001));
        float aurGroundHeight=smoothstep(0.0,1.1,max(0.0,positionUpdated.y));
        float aurGroundPhase=worldPos.x*0.31+worldPos.z*0.46;
        float aurGroundGust=sin(aurGroundTime*1.35+aurGroundPhase)*0.64+
                            sin(aurGroundTime*2.16+aurGroundPhase*0.47)*0.36;
        worldPos.xz+=aurGroundDirection*(0.16*aurGroundHeight*
                      aurGroundStrength*aurGroundGust);
        vPositionW=vec3(worldPos);
      `
    };
  }

  override hardBindForSubMesh(_ubo:UniformBuffer,_scene:Scene,
    _engine:AbstractEngine,subMesh:SubMesh):void{
    const effect=subMesh.effect;
    effect?.setFloat('aurGroundTime',this.state.time);
    effect?.setFloat('aurGroundStrength',this.state.effectiveStrength);
    effect?.setFloat2('aurGroundDir',...this.state.direction);
  }
}

type TreeColorState={autumn:number};

/** Recolour the combined texture/vertex albedo before ordinary PBR lighting. */
class AutumnCanopyPlugin extends MaterialPluginBase {
  constructor(material:PBRMaterial,private readonly state:TreeColorState,
    private readonly greenOnly:boolean){
    super(material,'AuraliaAutumnCanopy',220,{AURALIA_TREE_AUTUMN:true},true,false);
    this.registerForExtraEvents=true;
    this._enable(true);
  }
  override isCompatible(language:ShaderLanguage):boolean{return language===ShaderLanguage.GLSL;}
  override getClassName():string{return 'AuraliaAutumnCanopyPlugin';}
  override getUniforms(){return {externalUniforms:['aurTreeAutumn','aurTreeGreenOnly']};}
  override getCustomCode(shaderType:string):Record<string,string>|null{
    if(shaderType!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        uniform float aurTreeAutumn;
        uniform float aurTreeGreenOnly;
      `,
      CUSTOM_FRAGMENT_UPDATE_ALBEDO:`
        if(aurTreeAutumn>0.0001){
          // Old GLBs share a bark/leaf atlas. Their green pixels alone change colour.
          float aurGreenMask=smoothstep(0.025,0.12,surfaceAlbedo.g-surfaceAlbedo.b)*
            smoothstep(0.80,1.05,surfaceAlbedo.g/max(0.001,surfaceAlbedo.r));
          float aurCanopyMask=mix(1.0,aurGreenMask,aurTreeGreenOnly);
          // Keep the painted shading while replacing its hue with a golden yellow.
          float aurLeafValue=max(surfaceAlbedo.r,max(surfaceAlbedo.g,surfaceAlbedo.b));
          aurLeafValue=mix(aurLeafValue,sqrt(max(0.0,aurLeafValue)),0.25);
          vec3 aurGoldenLeaf=vec3(1.0,0.88,0.10)*aurLeafValue;
          surfaceAlbedo=mix(surfaceAlbedo,aurGoldenLeaf,aurTreeAutumn*aurCanopyMask);
        }
      `
    };
  }
  override hardBindForSubMesh(_ubo:UniformBuffer,_scene:Scene,
    _engine:AbstractEngine,subMesh:SubMesh):void{
    subMesh.effect?.setFloat('aurTreeAutumn',this.state.autumn);
    subMesh.effect?.setFloat('aurTreeGreenOnly',this.greenOnly?1:0);
  }
}

const TREE_COLORS=new WeakMap<Scene,AuraliaTreeColors>();

/** One colour state per scene, including assets imported later and all their LODs. */
export class AuraliaTreeColors {
  private readonly state:TreeColorState={autumn:0};
  private readonly plugins=new Map<PBRMaterial,AutumnCanopyPlugin>();
  private initialized=false;
  constructor(scene:Scene){
    scene.onDisposeObservable.addOnce(()=>{this.plugins.clear();TREE_COLORS.delete(scene);});
  }
  get autumnAmount():number{return this.state.autumn;}
  get materialCount():number{return this.plugins.size;}

  update(season:Season,dt:number):void{
    const target=season==='autumn'?1:0;
    if(!this.initialized){this.state.autumn=target;this.initialized=true;return;}
    // Real animation time also makes debug changes smooth when the calendar is paused.
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    this.state.autumn+=(target-this.state.autumn)*(1-Math.exp(-step*2.5));
    if(Math.abs(target-this.state.autumn)<.001)this.state.autumn=target;
  }
  register(meshes:readonly AbstractMesh[],assetId:string):void{
    const legacy=/^arbolito[123]$/.test(assetId);
    if(!legacy&&!/^v[34]Tree/.test(assetId)&&assetId!=='v4NatureIslandTree')return;
    for(const mesh of meshes){
      const materials=mesh.material instanceof MultiMaterial?mesh.material.subMaterials:[mesh.material];
      for(const material of materials){
        if(!(material instanceof PBRMaterial)||this.plugins.has(material))continue;
        if(!legacy&&!material.name.toLowerCase().includes('auralia_v4_leaves_'))continue;
        this.plugins.set(material,new AutumnCanopyPlugin(material,this.state,legacy));
      }
    }
  }
}
export function getAuraliaTreeColors(scene:Scene):AuraliaTreeColors{
  let colors=TREE_COLORS.get(scene);
  if(!colors){colors=new AuraliaTreeColors(scene);TREE_COLORS.set(scene,colors);}
  return colors;
}

/** Scene-level V5 controller plus ground-cover wind and tree-only seasonal colours. */
export class AuraliaFoliageWind {
  private controller:AuraliaFoliageController|null=null;
  private readonly groundPlugins=new Map<PBRMaterial,AuraliaGroundWindPlugin>();
  private strength=.65;
  private direction:[number,number]=[1,.2];

  constructor(private readonly scene:Scene){}

  get materialCount():number{
    return (this.controller?.materialCount??0)+this.groundPlugins.size;
  }
  get woodMaterialCount():number{return this.controller?.barkMaterialCount??0;}
  get leafMaterialCount():number{return this.controller?.leafMaterialCount??0;}
  get groundMaterialCount():number{return this.groundPlugins.size;}

  register(meshes:readonly AbstractMesh[],assetId=''):void{
    getAuraliaTreeColors(this.scene).register(meshes,assetId);
    this.controller=attachAuraliaFoliageWind(this.scene,meshes,
      {strength:this.strength,direction:this.direction,barkStrength:.85});
    if(!/^v4(Grass|Meadow|Ground|Flower|IvyGround)|^v3Wetland/.test(assetId))return;
    for(const mesh of meshes){
      const material=mesh.material;
      const materials=material instanceof MultiMaterial?material.subMaterials:
        material?[material]:[];
      for(const candidate of materials){
        if(!(candidate instanceof PBRMaterial)||this.groundPlugins.has(candidate)||
          !/^Auralia_(V4_|Expansion_|WetlandsV3_)/.test(candidate.name))continue;
        this.groundPlugins.set(candidate,
          new AuraliaGroundWindPlugin(candidate,this.controller.state));
      }
    }
  }

  setStrength(value:number):void{
    if(!Number.isFinite(value))return;
    this.strength=Math.max(0,Math.min(2,value));
    this.controller?.setStrength(this.strength);
  }
  setDirection(x:number,z:number):void{
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    this.direction=[x,z];
    this.controller?.setDirection(x,z);
  }
  dispose():void{
    for(const plugin of this.groundPlugins.values())plugin.dispose();
    this.groundPlugins.clear();
    this.controller?.dispose();
    this.controller=null;
  }
}
