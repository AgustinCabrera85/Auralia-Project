import {AnimationGroup,Matrix,Quaternion,Scene,TransformNode,Vector3,type Observer} from '@babylonjs/core';

type Joint={node:TransformNode;pose:Quaternion;axis:Vector3;amplitude:number;lag:number};

/** Small secondary motion on top of the authored run, before ground-foot IK.
 * Each mixer pass starts from the original pose, so the offsets never accumulate. */
export class DogoRunMotion {
  private readonly joints:Joint[]=[];
  private readonly pelvis:TransformNode;
  private readonly pelvisPose=new Vector3();
  private readonly up:Vector3;
  private readonly delta=new Quaternion();
  private readonly before:Observer<Scene>;
  private readonly after:Observer<Scene>;
  private influence=0;
  private applied=false;

  constructor(private readonly scene:Scene,nodes:readonly TransformNode[],private readonly run:AnimationGroup){
    const find=(name:string)=>{
      const node=nodes.find(n=>n.name===name);
      if(!node?.rotationQuaternion)throw new Error(`Dogo: falta articulación de rebote ${name}`);
      return node;
    };
    this.pelvis=find('spine.004');
    this.up=Vector3.TransformNormal(Vector3.Up(),Matrix.Invert(this.pelvis.parent!.computeWorldMatrix(true)));
    for(const [name,amplitude,lag] of [
      ['spine.006',.014,0],['spine.009',.016,.4],['spine.010',.024,.65]
    ] as const){
      const node=find(name),inverse=Matrix.Invert(node.computeWorldMatrix(true));
      this.joints.push({node,pose:new Quaternion(),axis:Vector3.TransformNormal(Vector3.Right(),inverse).normalize(),amplitude,lag});
    }
    for(const side of ['L','R'])for(const [suffix,amplitude,lag] of [
      ['',.035,.85],['.001',.065,1.1],['.002',.035,1.35]
    ] as const){
      const node=find(`ear.${side}${suffix}`),inverse=Matrix.Invert(node.computeWorldMatrix(true));
      // Aim the flap toward world-up in its own local frame. This respects the
      // mirrored GLB root and both ears' different joint orientations.
      const up=Vector3.TransformNormal(Vector3.Up(),inverse).normalize();
      const axis=Vector3.Cross(Vector3.Up(),up).normalize();
      this.joints.push({node,pose:new Quaternion(),axis,amplitude,lag:lag+(side==='R'?.13:0)});
    }
    this.before=scene.onBeforeAnimationsObservable.add(()=>this.restore());
    this.after=scene.onAfterAnimationsObservable.add(()=>this.apply());
  }

  update(dt:number,runWeight:number):void{
    const blend=1-Math.exp(-Math.max(0,Math.min(.1,dt))*10);
    this.influence+=(Math.max(0,Math.min(1,runWeight))-this.influence)*blend;
  }

  private restore():void{
    if(!this.applied)return;
    for(const joint of this.joints)joint.node.rotationQuaternion!.copyFrom(joint.pose);
    this.pelvis.position.copyFrom(this.pelvisPose);this.applied=false;
  }

  private apply():void{
    if(this.influence<.001||!this.run.isStarted)return;
    const phase=(this.run.getCurrentFrame()-this.run.from)/Math.max(1,this.run.to-this.run.from)*Math.PI*2;
    this.pelvisPose.copyFrom(this.pelvis.position);
    // Two centimetres of body travel; the existing IK keeps planted paws supported.
    this.pelvis.position.addInPlace(this.up.scale(.02*Math.sin(phase)*this.influence));
    for(const joint of this.joints){
      joint.pose.copyFrom(joint.node.rotationQuaternion!);
      const p=phase-joint.lag;
      const bounce=(Math.sin(p)+.15*Math.sin(2*p))/1.15;
      Quaternion.RotationAxisToRef(joint.axis,bounce*joint.amplitude*this.influence,this.delta);
      joint.pose.multiplyToRef(this.delta,joint.node.rotationQuaternion!);
    }
    this.applied=true;
  }

  dispose():void{
    this.restore();this.scene.onBeforeAnimationsObservable.remove(this.before);
    this.scene.onAfterAnimationsObservable.remove(this.after);
  }
}
