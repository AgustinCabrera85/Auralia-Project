import { MaterialPluginBase, MultiMaterial, PBRMaterial, ShaderLanguage,
  type AbstractEngine, type AbstractMesh, type Scene, type SubMesh,
  type UniformBuffer } from '@babylonjs/core';
import { attachAuraliaFoliageWind, type AuraliaFoliageController } from
  './AuraliaFoliageWindV5.js';

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

/** Scene-level V5 controller plus the retained V4 grass/flower motion. */
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
    this.controller=attachAuraliaFoliageWind(this.scene,meshes,
      {strength:this.strength,direction:this.direction,barkStrength:.85});
    if(!/^v4(Grass|Meadow|Ground|Flower|IvyGround)/.test(assetId))return;
    for(const mesh of meshes){
      const material=mesh.material;
      const materials=material instanceof MultiMaterial?material.subMaterials:
        material?[material]:[];
      for(const candidate of materials){
        if(!(candidate instanceof PBRMaterial)||this.groundPlugins.has(candidate)||
          !candidate.name.startsWith('Auralia_V4_'))continue;
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
