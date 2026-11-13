import { DirectionalLight, ShadowGenerator, TransformNode, Vector3 } from '@babylonjs/core';

/** A single small sunlight map for the two companions, never the whole forest. */
export class CharacterShadows {
  readonly generator:ShadowGenerator;
  constructor(private readonly sun:DirectionalLight){
    sun.shadowFrustumSize=40;
    sun.shadowMinZ=1;sun.shadowMaxZ=160;
    this.generator=new ShadowGenerator(1024,sun);
    // Color depth map is shared by the custom terrain shader and PBR meshes.
    this.generator.usePoissonSampling=true;
    this.generator.bias=.0004;this.generator.normalBias=.025;
    this.generator.darkness=.18;
  }
  add(root:TransformNode):void{
    for(const mesh of root.getChildMeshes())if(mesh.getTotalVertices()>0){
      this.generator.addShadowCaster(mesh,false);
      mesh.receiveShadows=true;
    }
  }
  update(player:Vector3,dog:Vector3|undefined,sunlit=true):void{
    this.sun.shadowEnabled=sunlit&&this.sun.direction.y<-.08&&this.sun.intensity>.08;
    const center=dog&&Vector3.DistanceSquared(player,dog)<400?Vector3.Center(player,dog):player;
    const direction=this.sun.direction.normalizeToNew();
    this.sun.position.copyFrom(center).subtractInPlace(direction.scale(60));
    this.sun.position.y+=1.5;
  }
  dispose():void{this.generator.dispose();}
}
