import { Mesh, Scene, ShaderMaterial, TransformNode } from '@babylonjs/core';
import { createWaterfallGeometry } from './WaterfallGeometry';
import { loadWaterMasks } from '../editor/AuraliaWaterProfiles';
import { createWorldWaterMaterial, updateWorldWaterMaterial } from '../editor/LiveWaterProfiles';

/** One streamed waterfall mesh, separate from both near and far river chunks. */
export class WaterfallSurface{
  readonly mesh:Mesh;
  readonly material:ShaderMaterial;

  constructor(private readonly scene:Scene,parent:TransformNode,masks:ReturnType<typeof loadWaterMasks>){
    this.material=createWorldWaterMaterial(scene,'fall',masks,{uRockEnabled:0});
    this.material.name='auralia-waterfall-material';
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
    updateWorldWaterMaterial(this.material,'fall',this.scene,time,{rockEnabled:false});
  }

  dispose():void{
    this.mesh.dispose(false,false);
    this.material.dispose(false,false);
  }
}
