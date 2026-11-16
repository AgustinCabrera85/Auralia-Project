import { MaterialPluginBase, Matrix, PBRMaterial, ShaderLanguage, Texture,
  type AbstractEngine, type BaseTexture, type MaterialDefines, type Scene,
  type SubMesh, type UniformBuffer } from '@babylonjs/core';
import { DAYS_PER_SEASON, SEASONS, type ClimateFrame, type Season } from '../climate/ClimateModel';
import { getAuraliaWind } from '../AuraliaWindSystem';

export const IVY_SEASONS = {
  winter:{leaves:0,flowers:0,autumn:0},spring:{leaves:.91,flowers:.8,autumn:0},
  summer:{leaves:1,flowers:.42,autumn:0},autumn:{leaves:.34,flowers:0,autumn:.75},
} as const;
type IvySeason={leaves:number;flowers:number;autumn:number};
const STATES=new WeakMap<Scene,IvySeason>();
export function getSeasonalIvyState(scene:Scene):IvySeason {
  let state=STATES.get(scene);
  if(!state){state={...IVY_SEASONS.spring};STATES.set(scene,state);}
  return state;
}
export function blendIvySeasons(from:Season,to:Season,t:number):IvySeason {
  const a=IVY_SEASONS[from],b=IVY_SEASONS[to],f=Math.max(0,Math.min(1,t));
  return {leaves:a.leaves+(b.leaves-a.leaves)*f,flowers:a.flowers+(b.flowers-a.flowers)*f,
    autumn:a.autumn+(b.autumn-a.autumn)*f};
}
export function updateSeasonalIvy(scene:Scene,frame:ClimateFrame):void {
  const progress=((frame.day%DAYS_PER_SEASON)+frame.hour/24)/DAYS_PER_SEASON;
  const t=Math.max(0,Math.min(1,(progress-.55)/.45));
  const next=SEASONS[(SEASONS.indexOf(frame.season)+1)%SEASONS.length];
  Object.assign(getSeasonalIvyState(scene),blendIvySeasons(frame.season,next,t*t*(3-2*t)));
}

export const IVY_ROOT_SPACING=.62;
export const IVY_BRANCH_STEP=.9;
/** Exact integer arithmetic also works in GLSL floats. */
export function ivyHash(x:number,y:number):number {
  const mod=(a:number)=>((a%1021)+1021)%1021;
  const h=mod(Math.floor(x+.5)*127+Math.floor(y*16+.5)*311);
  return mod(h*h*13+h*17)/1021;
}
export function ivyBend(y:number,phase:number):number {
  return Math.sin(y*(.55+.17*Math.sin(phase))+phase)*.23+Math.sin(y*.19+phase*1.9)*.16+
    Math.sin(y*(3.2+.4*Math.cos(phase))+phase*1.7)*.055+Math.sin(y*8.3+phase*2.3)*.018;
}
export function ivyShoot(t:number,reach:number,direction:number,phase:number):number {
  return direction*reach*Math.sin(t*1.45)+Math.sin(t*3.14159)*
    (.07*Math.sin(t*10+phase)+.026*Math.sin(t*27+phase*1.3));
}
export function createSeasonalIvyTextures(scene:Scene):Texture[] {
  // Byte-identical to the atlas embedded in Tree_01_Soft_Emerald.glb.
  const atlas=new Texture('/assets/ivy/Auralia_Leaf_green_mid_512.png',scene,false,false,Texture.TRILINEAR_SAMPLINGMODE);
  atlas.hasAlpha=true;atlas.gammaSpace=true;atlas.anisotropicFilteringLevel=8;
  atlas.wrapU=atlas.wrapV=Texture.CLAMP_ADDRESSMODE;
  return [atlas];
}

/** Fine bare stems on masonry remain as the distant fallback; leaves are geometry. */
export class SeasonalIvyPlugin extends MaterialPluginBase {
  constructor(material:PBRMaterial,private readonly worldToCastle:Matrix,readonly tower:boolean){
    super(material,'AuraliaSeasonalIvy',200,{AUR_IVY:true},true,false);
    this.registerForExtraEvents=true;this._enable(true);
  }
  override isCompatible(language:ShaderLanguage):boolean{return language===ShaderLanguage.GLSL;}
  override getClassName():string{return 'AuraliaSeasonalIvy';}
  override prepareDefines(defines:MaterialDefines):void{Object.assign(defines,{AUR_IVY:true});}
  override getUniforms(){return {externalUniforms:['aurIvyWorldToCastle','aurIvyTower']};}
  override getCustomCode(shaderType:string):Record<string,string>|null {
    if(shaderType!=='fragment')return null;
    return {CUSTOM_FRAGMENT_DEFINITIONS:`
      uniform mat4 aurIvyWorldToCastle;uniform float aurIvyTower;
      float aurIvyHash(vec2 p){vec2 g=floor(p*vec2(1.,16.)+.5);
        float h=mod(g.x*127.+g.y*311.,1021.);return mod(h*h*13.+h*17.,1021.)/1021.;}
      float aurIvyBend(float y,float p){return sin(y*(.55+.17*sin(p))+p)*.23+
        sin(y*.19+p*1.9)*.16+sin(y*(3.2+.4*cos(p))+p*1.7)*.055+sin(y*8.3+p*2.3)*.018;}
      float aurIvyShoot(float t,float reach,float direction,float phase){
        return direction*reach*sin(t*1.45)+sin(t*3.14159)*
          (.07*sin(t*10.+phase)+.026*sin(t*27.+phase*1.3));}
      void aurIvyWood(inout vec3 albedo,vec3 positionW,vec3 normalW){
        vec3 p=(aurIvyWorldToCastle*vec4(positionW,1.)).xyz;
        vec3 n=normalize(mat3(aurIvyWorldToCastle)*normalW);
        float x=p.z,y=p.y,period=8192.,seed=sign(p.x)*19.;
        if(abs(n.y)>.65)return;
        if(aurIvyTower>.5){
          bool gate=abs(p.x)<20.;vec2 center=gate?vec2(sign(p.x)*11.4,-27.):sign(p.xz)*vec2(30.,26.);
          vec2 radial=p.xz-center;float radius=gate?4.38:5.15;
          if(length(radial)<radius-.5||dot(normalize(radial),n.xz)<.6)return;
          period=2.*floor(3.14159265*radius/${IVY_ROOT_SPACING}+.5);
          x=atan(radial.y,radial.x)/6.2831853*period*${IVY_ROOT_SPACING};
          seed=dot(center,vec2(1.37,3.71));
        }else if(abs(p.x)<30.35||n.x*sign(p.x)<.65)return;
        float dx=dFdx(x),dy=dFdy(x),lengthX=period*${IVY_ROOT_SPACING};
        dx-=floor(dx/lengthX+.5)*lengthX;dy-=floor(dy/lengthX+.5)*lengthX;
        float pixel=max(abs(dx)+abs(dy),fwidth(y))*.55+.001,wood=0.;
        float cell=floor(x/${IVY_ROOT_SPACING});
        for(int i=-2;i<=2;i++){
          float id=cell+float(i),key=mod(id,period),r=aurIvyHash(vec2(key,seed)),phase=r*6.2831853;
          float rootX=(id+.08+r*.84)*${IVY_ROOT_SPACING};
          float width=(.0035+.009*exp(-max(y,0.)*.085))*(.75+.35*r);
          float d=abs(x-rootX-aurIvyBend(y,phase));
          wood=max(wood,1.-smoothstep(width-pixel,width+pixel,d));
          float node=floor((y+r*${IVY_BRANCH_STEP})/${IVY_BRANCH_STEP});
          for(int j=0;j<3;j++){
            float branch=node-float(j),a=branch*${IVY_BRANCH_STEP}-r*${IVY_BRANCH_STEP};
            float v=aurIvyHash(vec2(key+seed,branch)),height=1.1+.9*v,t=(y-a)/height;
            if(t>=0.&&t<=1.&&a>=.1){
              float direction=v>.5?1.:-1.,reach=.5+.7*fract(v*7.31);
              d=abs(x-rootX-aurIvyBend(a,phase)-aurIvyShoot(t,reach,direction,phase));
              float w=mix(.0045,.0008,t);wood=max(wood,1.-smoothstep(w-pixel,w+pixel,d));
            }
          }
        }
        albedo=mix(albedo,vec3(.075,.046,.026),wood*.78);
      }`,CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
        #ifdef NORMAL
          aurIvyWood(surfaceAlbedo,vPositionW,vNormalW);
        #endif`};
  }
  override hardBindForSubMesh(_ubo:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh):void {
    subMesh.effect?.setMatrix('aurIvyWorldToCastle',this.worldToCastle);
    subMesh.effect?.setFloat('aurIvyTower',this.tower?1:0);
  }
}

/** Tree atlas and PBR finish, with whole-card seasonal shedding and tiny flutter. */
export class SeasonalIvyLeafPlugin extends MaterialPluginBase {
  private readonly state:IvySeason;
  private readonly wind:ReturnType<typeof getAuraliaWind>;
  constructor(material:PBRMaterial,scene:Scene,readonly layer:number,private readonly atlas:Texture){
    super(material,'AuraliaIvyTreeLeaves',220,{AUR_IVY_LEAVES:true},true,false);
    this.state=getSeasonalIvyState(scene);this.wind=getAuraliaWind(scene);
    this.registerForExtraEvents=true;this._enable(true);
  }
  override isCompatible(language:ShaderLanguage):boolean{return language===ShaderLanguage.GLSL;}
  override getAttributes(attributes:string[]):void{attributes.push('aurIvyLeaf');}
  override getActiveTextures(active:BaseTexture[]):void{active.push(this.atlas);}
  override getUniforms(){return {externalUniforms:['aurIvySeason','aurIvyFlutter','aurIvyLayer']};}
  override getCustomCode(shaderType:string):Record<string,string>|null {
    if(shaderType==='vertex')return {
      CUSTOM_VERTEX_DEFINITIONS:`attribute float aurIvyLeaf;varying float vAurIvyLeaf;
        uniform vec2 aurIvyFlutter;`,
      CUSTOM_VERTEX_UPDATE_POSITION:`vAurIvyLeaf=aurIvyLeaf;
        positionUpdated+=normalUpdated*(.004*sin(aurIvyFlutter.x*3.65+aurIvyLeaf*39.)*aurIvyFlutter.y);`,
    };
    if(shaderType!=='fragment')return null;
    return {CUSTOM_FRAGMENT_DEFINITIONS:`varying float vAurIvyLeaf;
      uniform vec3 aurIvySeason;uniform float aurIvyLayer;`,
      CUSTOM_FRAGMENT_UPDATE_ALPHA:`if(aurIvySeason.x<vAurIvyLeaf)discard;`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
        // Richer living greens distinguish ivy from the grass and gray masonry.
        surfaceAlbedo*=mix(vec3(.68,1.02,.52),vec3(1.02,1.34,.72),fract(vAurIvyLeaf*17.3));
        surfaceAlbedo*=mix(.64,1.0,aurIvyLayer);
        float value=max(surfaceAlbedo.r,max(surfaceAlbedo.g,surfaceAlbedo.b));
        vec3 golden=vec3(1.,.88,.10)*mix(value,sqrt(max(value,0.)),.25);
        surfaceAlbedo=mix(surfaceAlbedo,golden,smoothstep(0.,.8,aurIvySeason.z));`,
    };
  }
  override hardBindForSubMesh(_ubo:UniformBuffer,_scene:Scene,_engine:AbstractEngine,subMesh:SubMesh):void {
    const effect=subMesh.effect;if(!effect)return;
    effect.setFloat3('aurIvySeason',this.state.leaves,this.state.flowers,this.state.autumn);
    effect.setFloat2('aurIvyFlutter',this.wind.time,this.wind.effectiveStrength);
    effect.setFloat('aurIvyLayer',this.layer);
  }
}
