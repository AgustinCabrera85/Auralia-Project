import {RawTexture,Scene,ShaderMaterial,Texture,Vector4} from '@babylonjs/core';
import {rasterizeRoads,type PaintedRoad} from '../TerrainRoadMask';
import {roadTintAt} from './RoadPalette';

export const ROAD_UNIFORMS=['roadBounds'];
export const ROAD_SAMPLERS=['roadMask','roadAlbedo','roadNormal'];
export const ROAD_GLSL=`
uniform sampler2D roadMask;
uniform sampler2D roadAlbedo;
uniform sampler2D roadNormal;
uniform vec4 roadBounds;
vec4 terrainRoad(vec2 p){
  vec2 uv=(p-roadBounds.xy)/roadBounds.zw;
  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0))))return vec4(0.0);
  vec4 road=texture2D(roadMask,uv);road.rgb*=1.25;return road;
}`;
const paints=new WeakMap<ShaderMaterial,TerrainRoadPaint>();
export function paintTerrainRoads(material:ShaderMaterial,roads:readonly PaintedRoad[]):void{paints.get(material)?.setRoads(roads);}
export class TerrainRoadPaint{
  private mask:RawTexture;
  private readonly albedo:Texture;
  private readonly normal:Texture;
  constructor(private readonly scene:Scene,private readonly material:ShaderMaterial){
    this.mask=RawTexture.CreateRGBATexture(new Uint8Array(4),1,1,scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
    const base='/assets/terrain/brisalia/Brisalia_Adoquines_';
    this.albedo=new Texture(base+'BaseColor_1K.jpg',scene);this.normal=new Texture(base+'NormalGL_1K.png',scene);
    for(const t of [this.albedo,this.normal]){t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;}
    material.setTexture('roadMask',this.mask);material.setTexture('roadAlbedo',this.albedo);material.setTexture('roadNormal',this.normal);
    material.setVector4('roadBounds',new Vector4(0,0,1,1));paints.set(material,this);
  }
  setRoads(roads:readonly PaintedRoad[]):void{
    const m=rasterizeRoads(roads,roadTintAt,Math.min(4096,this.scene.getEngine().getCaps().maxTextureSize));
    const next=RawTexture.CreateRGBATexture(m.data,m.width,m.height,this.scene,false,false,Texture.BILINEAR_SAMPLINGMODE);
    next.wrapU=next.wrapV=Texture.CLAMP_ADDRESSMODE;next.name='terrain-road-mask';
    this.material.setTexture('roadMask',next);this.material.setVector4('roadBounds',new Vector4(m.minX,m.minZ,m.spanX,m.spanZ));
    this.mask.dispose();this.mask=next;
    this.material.metadata={...this.material.metadata,paintedRoads:{count:roads.length,width:m.width,height:m.height,bytes:m.data.byteLength,extraMeshes:0}};
  }
  dispose():void{paints.delete(this.material);this.mask.dispose();this.albedo.dispose();this.normal.dispose();}
}
