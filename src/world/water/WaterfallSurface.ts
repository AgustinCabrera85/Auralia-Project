import { Mesh, Scene, ShaderMaterial, TransformNode } from '@babylonjs/core';
import { createWaterfallGeometry } from './WaterfallGeometry';
import { type WaterTextureBank, updateWaterUniforms } from './waterResources';
import { registerWaterfallShaders } from './waterfallShaders';

/** One streamed waterfall mesh, separate from both near and far river chunks. */
export class WaterfallSurface{
  readonly mesh:Mesh;
  readonly material:ShaderMaterial;

  constructor(private readonly scene:Scene,parent:TransformNode,textures:WaterTextureBank){
    registerWaterfallShaders();
    this.material=new ShaderMaterial('auralia-waterfall-material',scene,'auraliaWaterfall',{
      attributes:['position','normal','uv','color'],
      uniforms:['world','worldViewProjection','uCameraPosition','uSunDirection',
        'uFogColor','uFogDensity','uTime'],
      samplers:['uNormals','uFoamNoise'],
      needAlphaBlending:false,
    });
    this.material.setTexture('uNormals',textures.riverNormals);
    this.material.setTexture('uFoamNoise',textures.foamNoise);
    this.material.backFaceCulling=false;
    this.mesh=new Mesh('auralia-waterfall',scene);
    createWaterfallGeometry().applyToMesh(this.mesh);
    this.mesh.parent=parent;
    this.mesh.material=this.material;
    this.mesh.useVertexColors=true;
    this.mesh.hasVertexAlpha=false;
    this.mesh.isPickable=false;
    this.mesh.checkCollisions=false;
    this.mesh.metadata={inlandWater:true,waterfall:true};
    this.mesh.freezeWorldMatrix();
  }

  update(time:number):void{
    updateWaterUniforms(this.material,this.scene,time);
  }

  dispose():void{
    this.mesh.dispose(false,false);
    this.material.dispose(false,false);
  }
}
