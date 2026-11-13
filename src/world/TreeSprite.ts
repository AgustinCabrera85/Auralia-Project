import {Color3,MaterialPluginBase,Mesh,MeshBuilder,PBRMaterial,Scene,ShaderLanguage,Texture,VertexBuffer} from '@babylonjs/core';
import {TREE_SPRITES} from './treeSpriteData';
import {getAuraliaTreeColors} from './AuraliaFoliageWind';

class TreeAtlasView extends MaterialPluginBase{
 constructor(material:PBRMaterial,private readonly row:number){super(material,'TreeAtlasView',230,undefined,true,false);this._enable(true);}
 override isCompatible(language:ShaderLanguage){return language===ShaderLanguage.GLSL;}
 override getAttributes(attributes:string[]){attributes.push('treeView');}
 override getCustomCode(type:string){return type==='vertex'?{
  CUSTOM_VERTEX_DEFINITIONS:'attribute float treeView;',
  CUSTOM_VERTEX_UPDATE_POSITION:`uvUpdated=vec2((uvUpdated.x+treeView)/8.0,(uvUpdated.y+${(3-this.row).toFixed(1)})/4.0);`
 }:null;}
}

/** One alpha-tested camera-facing quad per far tree, eight photographed angles.
 * Shared atlas: 2048x1024 RGBA (~10.67 MiB including mipmaps), four draw batches. */
export function createTreeSprite(kind:keyof typeof TREE_SPRITES,scene:Scene,texture:Texture):Mesh{
 const data=TREE_SPRITES[kind],mesh=MeshBuilder.CreatePlane('tree-sprite',{size:data.size},scene);
 mesh.position.y=data.centerY;mesh.bakeCurrentTransformIntoVertices();
 // A distant canopy receives hemispheric light consistently when the camera turns.
 mesh.setVerticesData(VertexBuffer.NormalKind,[0,1,0,0,1,0,0,1,0,0,1,0]);
 const material=new PBRMaterial('Auralia_V4_Leaves_sprite_'+kind,scene);
 material.albedoTexture=texture;material.albedoColor=Color3.White();material.useAlphaFromAlbedoTexture=true;
 material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;material.alphaCutOff=.35;
 material.metallic=0;material.roughness=1;material.directIntensity=.88;material.backFaceCulling=false;
 new TreeAtlasView(material,data.row);mesh.material=material;
 getAuraliaTreeColors(scene).register([mesh],'arbolito1');
 mesh.isVisible=false;mesh.isPickable=false;mesh.checkCollisions=false;
 mesh.refreshBoundingInfo(true);return mesh;
}

export function treeSpriteView(yaw:number,dx:number,dz:number):number{
 return ((Math.round((Math.atan2(dz,dx)+yaw)*4/Math.PI)%8)+8)%8;
}
