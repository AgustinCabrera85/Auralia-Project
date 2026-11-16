import { Mesh, TransformNode, Vector3, VertexBuffer } from '@babylonjs/core';
import { wayfindingMeshPart } from './wayfindingGeometry';

/** The supplied GLBs join the post and suspended parts by material. Split only
 * their disconnected hanging geometry, preserving UVs and the source assets. */
export class WayfindingSway {
  readonly pivot:TransformNode;
  private readonly phase:number;
  constructor(readonly root:TransformNode,private readonly lamp:boolean){
    this.pivot=new TransformNode(`${root.name}:hanger`,root.getScene());
    this.pivot.parent=root;
    // The hinge runs through the chain attachments under the fixed crossbar.
    this.pivot.position.set(lamp?2.22817:1.69499,5.70106-.45505095,lamp?-.233115:-.232865);
    let seed=0;for(const char of root.name)seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0;
    this.phase=(seed%1000)/1000*Math.PI*2;
    for(const mesh of root.getChildMeshes())if(mesh instanceof Mesh&&mesh.getTotalVertices())this.split(mesh);
  }

  private split(mesh:Mesh):void{
    const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();
    if(!positions||!indices)return;
    const wood=mesh.material?.name==='Roble envejecido';
    const moving:number[]=[],fixed:number[]=[];
    // Native glTF coordinates: the fixed nail/post are around X=0. Wood
    // below Y=5.35 is the hanging plaque; the crossbar begins at Y=5.70.
    const hangs=(i:number)=>positions[i*3]>.8&&(!wood||positions[i*3+1]<5.35);
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i],b=indices[i+1],c=indices[i+2];
      (hangs(a)&&hangs(b)&&hangs(c)?moving:fixed).push(a,b,c);
    }
    if(!moving.length)return;
    const movingData=wayfindingMeshPart(mesh,moving),fixedData=fixed.length?wayfindingMeshPart(mesh,fixed):null;
    const relative=mesh.computeWorldMatrix(true).multiply(this.pivot.computeWorldMatrix(true).clone().invert());
    // Baking the handedness conversion also transforms normals/tangents and
    // winding, so the detached mesh stays identical at its resting position.
    movingData.transform(relative);
    const hanging=new Mesh(`${mesh.name}:suspended`,mesh.getScene());
    movingData.applyToMesh(hanging);hanging.material=mesh.material;hanging.parent=this.pivot;
    hanging.sideOrientation=mesh.sideOrientation;
    hanging.isPickable=false;hanging.receiveShadows=mesh.receiveShadows;
    if(fixedData){mesh.makeGeometryUnique();fixedData.applyToMesh(mesh);}
    else mesh.dispose(false,false);
  }

  /** The two-chain sign swings around one hinge; the single-chain lamp also
   * drifts sideways. Different phases keep the street from moving in unison. */
  update(seconds:number):void{
    if(!this.root.isEnabled())return;
    const t=seconds,p=this.phase;
    this.pivot.rotation.x=(this.lamp?.045:.03)*(.72*Math.sin(t*.87+p)+.28*Math.sin(t*1.43+p*1.7));
    this.pivot.rotation.z=this.lamp?.016*Math.sin(t*.69+p+1.1):0;
  }

  /** Attach text/light coordinates expressed in the original site frame. */
  localPoint(point:Vector3):Vector3{return point.subtract(this.pivot.position);}
}
