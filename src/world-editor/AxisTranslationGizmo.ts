/**
 * Auralia World Editor: translation gizmo constrained to one WORLD axis at a time.
 * The handles are ordinary Babylon meshes so they work with the editor's existing
 * pointer events (no utility-layer/camera/input-manager interference).
 *
 * This component never edits WorldEditState. It returns a delta from the START
 * of the drag; the host applies it to an immutable snapshot for each pointer move.
 */
import { ArcRotateCamera, Color3, Matrix, Mesh, MeshBuilder, Scene,
  StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

export type EditorAxis='x'|'y'|'z';
export type AxisDelta={axis:EditorAxis;delta:number};

const UNIT:Record<EditorAxis,Vector3>={
  x:new Vector3(1,0,0), y:new Vector3(0,1,0), z:new Vector3(0,0,1)
};
const COLORS:Record<EditorAxis,string>={
  x:'#f3736b', y:'#a4ea78', z:'#62b9f6'
};

type AxisDrag={axis:EditorAxis;startX:number;startY:number;
  pixelX:number;pixelY:number;denom:number};

export class AxisTranslationGizmo {
  private readonly root:TransformNode;
  private readonly materials:StandardMaterial[]=[];
  private readonly arrows:Mesh[]=[];
  private active=false;
  private drag:AxisDrag|null=null;

  constructor(private readonly scene:Scene,private readonly canvas:HTMLCanvasElement,
    private readonly camera:ArcRotateCamera){
    this.root=new TransformNode('auralia-axis-gizmo-root',scene);
    for(const axis of ['x','y','z'] as EditorAxis[]){
      const pivot=new TransformNode(`auralia-axis-${axis}`,scene);
      pivot.parent=this.root;
      // All geometry is built pointing along local +Y, then rotated into axis.
      if(axis==='x')pivot.rotation.z=-Math.PI/2;
      else if(axis==='z')pivot.rotation.x=Math.PI/2;
      const material=new StandardMaterial(`auralia-axis-${axis}-material`,scene);
      material.diffuseColor=Color3.FromHexString(COLORS[axis]);
      material.emissiveColor=Color3.FromHexString(COLORS[axis]);
      material.disableLighting=true;
      material.disableDepthWrite=true;
      this.materials.push(material);
      const create=(part:'stem'|'head')=>{
        const mesh=part==='stem'
          ?MeshBuilder.CreateCylinder(`axis-${axis}-stem`,{height:3.2,diameter:.26,tessellation:12},scene)
          :MeshBuilder.CreateCylinder(`axis-${axis}-head`,{height:1.2,diameterBottom:.94,
            diameterTop:0,tessellation:16},scene);
        mesh.parent=pivot;
        mesh.position.y=part==='stem'?1.9:4.07;
        mesh.material=material;
        mesh.renderingGroupId=3;
        mesh.isPickable=true;
        mesh.metadata={auraliaAxisGizmo:axis};
        mesh.checkCollisions=false;
        this.arrows.push(mesh);
      };
      create('stem');create('head');
    }
    this.root.setEnabled(false);
  }

  get isDragging():boolean{return this.drag!==null;}

  setAnchor(point:Vector3|null):void{
    this.active=point!==null;
    if(point)this.root.position.copyFrom(point);
    this.root.setEnabled(this.active);
    if(this.active)this.updateScale();
    else this.drag=null;
  }

  /** Keep roughly constant on-screen size while the user zooms. */
  updateScale():void{
    if(!this.active)return;
    const d=Vector3.Distance(this.camera.globalPosition,this.root.position);
    this.root.scaling.setAll(Math.max(.32,Math.min(16,d*.019)));
  }

  begin(e:PointerEvent):EditorAxis|null{
    if(!this.active||e.button!==0)return null;
    const hit=this.scene.pick(this.scene.pointerX,this.scene.pointerY,
      mesh=>typeof mesh.metadata?.auraliaAxisGizmo==='string');
    const axis=hit?.hit?hit.pickedMesh?.metadata?.auraliaAxisGizmo as EditorAxis|undefined:undefined;
    if(!axis||!UNIT[axis])return null;
    // Project the axis to CSS pixels (not device pixels). This makes the drag
    // work at arbitrary camera angles without a plane/height ambiguity.
    const viewport=this.camera.viewport.toGlobal(this.canvas.clientWidth,this.canvas.clientHeight);
    const transform=this.scene.getTransformMatrix();
    const p0=Vector3.Project(this.root.position,Matrix.Identity(),transform,viewport);
    const p1=Vector3.Project(this.root.position.add(UNIT[axis]),Matrix.Identity(),transform,viewport);
    const pixelX=p1.x-p0.x,pixelY=p1.y-p0.y;
    const denom=pixelX*pixelX+pixelY*pixelY;
    // An axis pointed exactly at the camera has no meaningful screen-space drag.
    if(denom<.015)return null;
    this.drag={axis,startX:e.clientX,startY:e.clientY,pixelX,pixelY,denom};
    return axis;
  }

  move(e:PointerEvent,snap=0):AxisDelta|null{
    if(!this.drag)return null;
    const d=this.drag;
    const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
    let delta=(dx*d.pixelX+dy*d.pixelY)/d.denom;
    if(!Number.isFinite(delta))return null;
    // Shift provides precision movement on the CURRENT drag, not a new axis.
    if(e.shiftKey)delta*=.1;
    if(snap>0)delta=Math.round(delta/snap)*snap;
    delta=Math.max(-1000,Math.min(1000,delta));
    return {axis:d.axis,delta};
  }

  end():void{this.drag=null;}

  dispose():void{
    this.drag=null;
    for(const mesh of this.arrows)mesh.dispose(false,false);
    for(const material of this.materials)material.dispose();
    this.root.dispose(false,false);
  }
}
