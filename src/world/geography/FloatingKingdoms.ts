import { Mesh, Scene, SceneLoader, TransformNode, VertexBuffer, VertexData } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { RockColliderSystem } from '../RockColliderSystem';
/** One original kingdom GLB resident at a time. Collider proxies share its
 * geometry; the original files and source orientation remain untouched. */
export class FloatingKingdoms {
  readonly colliders=new RockColliderSystem(()=>undefined);
  private root:TransformNode|null=null;
  id:string|null=null;
  constructor(private readonly scene:Scene){}
  async load(id:string):Promise<{x:number;y:number;z:number}>{
    if(!['albor','umbrael'].includes(id))throw new Error('Unknown floating kingdom');
    this.clear();
    const spec=id==='albor'?{file:'Auralia_Albor_Islas_Flotantes_v6.glb',x:-4750,y:1350,z:-3500}:
      {file:'Auralia_Umbrael_Islas_Flotantes_v6.glb',x:5200,y:1200,z:-3700};
    const result=await SceneLoader.ImportMeshAsync('','/auralia-preview/models/',spec.file,this.scene);
    const root=new TransformNode('reino-'+id,this.scene);this.root=root;this.id=id;
    root.rotation.x=-Math.PI/2;root.position.set(spec.x,spec.y,spec.z);
    for(const mesh of result.meshes)if(!mesh.parent)mesh.parent=root;
    root.computeWorldMatrix(true);
    for(const node of root.getDescendants())node.computeWorldMatrix(true);
    for(const mesh of result.meshes)if(mesh instanceof Mesh&&mesh.getTotalVertices()){
      // These source GLBs omit NORMAL. Picking can hit them but the native
      // ground collider rejects a hit without a normal. Derive it in memory.
      if(!mesh.isVerticesDataPresent(VertexBuffer.NormalKind)){
        const normals:number[]=[];VertexData.ComputeNormals(mesh.getVerticesData(VertexBuffer.PositionKind)!,mesh.getIndices()!,normals);
        mesh.setVerticesData(VertexBuffer.NormalKind,normals);
      }
      mesh.computeWorldMatrix(true);mesh.isPickable=false;this.colliders.registerGeneratedMesh(mesh);
    }
    // Pick an actual walkable triangle, never an invented floating platform.
    for(let radius=0;radius<900;radius+=40)for(let i=0;i<(radius?16:1);i++){
      const x=spec.x+Math.cos(i*Math.PI/8)*radius,z=spec.z+Math.sin(i*Math.PI/8)*radius;
      const hit=this.colliders.queryGround(x,z,spec.y+2000,4000,.33);
      if(hit&&hit.normal.y>.8)return {x,y:hit.height,z};
    }
    this.clear();throw new Error(`No walkable arrival surface in ${id}`);
  }
  clear(){this.colliders.dispose();this.root?.dispose(false,true);this.root=null;this.id=null;}
  dispose(){this.clear();}
}
