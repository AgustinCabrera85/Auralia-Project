import {Matrix,Quaternion,Vector3,type Observer,type Scene,type TransformNode} from '@babylonjs/core';
import type {AbilityAnimation} from '../domain/abilities/types';

type Joint={node:TransformNode;base:Quaternion;applied:Quaternion;open:Quaternion;changed:boolean};
const PALM_FORWARD=new Vector3(0,0,1);
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

/** Temporary two-bone reach over Santi's standing animation. Work is limited to
 * the left arm/fingers during this cast; the authored pose is restored afterwards. */
export class SantiFlamePose {
  private readonly upper:Joint|undefined;
  private readonly lower:Joint|undefined;
  private readonly hand:Joint|undefined;
  private readonly middle:TransformNode|undefined;
  private readonly fingers:Joint[]=[];
  private readonly joints:Joint[]=[];
  private readonly before:Observer<Scene>;
  private weight=0;
  private applied=false;
  private readonly forward=new Vector3();
  private readonly right=new Vector3();
  private readonly shoulder=new Vector3();
  private readonly elbow=new Vector3();
  private readonly wrist=new Vector3();
  private readonly target=new Vector3();
  private readonly bendTarget=new Vector3();
  private readonly axis=new Vector3();
  private readonly pole=new Vector3();
  private readonly from=new Vector3();
  private readonly to=new Vector3();
  private readonly localA=new Vector3();
  private readonly localB=new Vector3();
  private readonly cross=new Vector3();
  private readonly inverse=Matrix.Identity();
  private readonly turn=Quaternion.Identity();
  private readonly handBase=Quaternion.Identity();

  constructor(private readonly scene:Scene,private readonly actor:TransformNode,nodes:readonly TransformNode[]){
    const joint=(name:string)=>{
      const node=nodes.find(n=>n.name===name);if(!node?.rotationQuaternion)return undefined;
      const entry={node,base:node.rotationQuaternion.clone(),applied:node.rotationQuaternion.clone(),
        open:node.rotationQuaternion.clone(),changed:false};this.joints.push(entry);return entry;
    };
    this.upper=joint('mixamorig:LeftArm');this.lower=joint('mixamorig:LeftForeArm');this.hand=joint('mixamorig:LeftHand');
    this.middle=nodes.find(n=>n.name==='mixamorig:LeftHandMiddle1');
    for(const finger of ['Thumb','Index','Middle','Ring','Pinky'])for(let i=1;i<=3;i++){
      const entry=joint(`mixamorig:LeftHand${finger}${i}`);if(entry)this.fingers.push(entry);
    }
    this.before=scene.onBeforeAnimationsObservable.add(()=>this.restore());
  }
  get ready():boolean{return !!(this.upper&&this.lower&&this.hand&&this.middle);}
  setTime(timing:AbilityAnimation['handCast'],elapsed:number):void{
    this.weight=timing?smooth(0,timing.extendBy,elapsed)*(1-smooth(timing.retractFrom,timing.end,elapsed)):0;
  }
  restore():void{
    if(!this.applied)return;
    for(const entry of this.joints){
      if(!entry.changed)continue;
      // goToFrame can already have supplied a fresh authored sample. Never
      // overwrite it with last frame's saved rotation.
      if(entry.node.rotationQuaternion!.equalsWithEpsilon(entry.applied,1e-6)){
        entry.node.rotationQuaternion!.copyFrom(entry.base);entry.node.markAsDirty('rotationQuaternion');
      }
      entry.changed=false;
    }
    this.applied=false;
  }
  private remember(entry:Joint):void{
    if(entry.changed)return;entry.base.copyFrom(entry.node.rotationQuaternion!);entry.changed=true;
  }
  private position(node:TransformNode,out:Vector3):void{node.computeWorldMatrix(true);out.copyFrom(node.absolutePosition);}
  /** Joint-local rotation handles the imported rig's negative handedness scale. */
  private aim(entry:Joint,from:Vector3,to:Vector3):void{
    entry.node.computeWorldMatrix(true).invertToRef(this.inverse);
    Vector3.TransformNormalToRef(from,this.inverse,this.localA);this.localA.normalize();
    Vector3.TransformNormalToRef(to,this.inverse,this.localB);this.localB.normalize();
    const dot=Math.max(-1,Math.min(1,Vector3.Dot(this.localA,this.localB)));
    if(dot>.999999)return;
    Vector3.CrossToRef(this.localA,this.localB,this.cross);
    if(this.cross.lengthSquared()<1e-10){
      Vector3.CrossToRef(this.localA,Math.abs(this.localA.y)<.9?Vector3.UpReadOnly:Vector3.RightReadOnly,this.cross);
    }
    this.remember(entry);Quaternion.RotationAxisToRef(this.cross.normalize(),Math.acos(dot),this.turn);
    entry.node.rotationQuaternion!.multiplyInPlace(this.turn);entry.node.computeWorldMatrix(true);
  }
  apply():void{
    this.restore();if(this.weight<=.0001||!this.ready)return;
    const upper=this.upper!,lower=this.lower!,hand=this.hand!;
    Vector3.TransformNormalToRef(PALM_FORWARD,this.actor.computeWorldMatrix(true),this.forward);this.forward.normalize();
    Vector3.CrossToRef(Vector3.UpReadOnly,this.forward,this.right);this.right.normalize();
    this.position(upper.node,this.shoulder);this.position(lower.node,this.elbow);this.position(hand.node,this.wrist);
    const a=Vector3.Distance(this.shoulder,this.elbow),b=Vector3.Distance(this.elbow,this.wrist);
    if(a<.001||b<.001)return;
    this.target.copyFrom(this.shoulder).addInPlaceFromFloats(this.forward.x*(a+b)*.97,
      this.forward.y*(a+b)*.97+.015,this.forward.z*(a+b)*.97);
    Vector3.LerpToRef(this.wrist,this.target,this.weight,this.target);
    this.target.subtractToRef(this.shoulder,this.axis);
    const distance=Math.max(.001,Math.min(a+b-.001,this.axis.length()));this.axis.normalize();
    this.pole.copyFromFloats(-this.right.x*.25,-1,-this.right.z*.25);
    const projection=Vector3.Dot(this.pole,this.axis);
    this.pole.addInPlaceFromFloats(-this.axis.x*projection,-this.axis.y*projection,-this.axis.z*projection);
    if(this.pole.lengthSquared()<1e-6)this.pole.copyFrom(this.right).negateInPlace();
    this.pole.normalize();
    const along=(a*a+distance*distance-b*b)/(2*distance),bend=Math.sqrt(Math.max(0,a*a-along*along));
    this.bendTarget.copyFrom(this.shoulder).addInPlaceFromFloats(this.axis.x*along+this.pole.x*bend,
      this.axis.y*along+this.pole.y*bend,this.axis.z*along+this.pole.z*bend);
    this.elbow.subtractToRef(this.shoulder,this.from);this.bendTarget.subtractToRef(this.shoulder,this.to);this.aim(upper,this.from,this.to);
    this.position(lower.node,this.elbow);this.position(hand.node,this.wrist);
    this.wrist.subtractToRef(this.elbow,this.from);this.target.subtractToRef(this.elbow,this.to);this.aim(lower,this.from,this.to);
    // Open palm faces forward, fingers upward, rather than emitting sideways
    // from the Power Up clip's lowered wrist.
    this.handBase.copyFrom(hand.node.rotationQuaternion!);
    Vector3.TransformNormalToRef(PALM_FORWARD,hand.node.computeWorldMatrix(true),this.from);
    this.aim(hand,this.from,this.forward);
    this.position(this.middle!,this.to);this.position(hand.node,this.wrist);this.to.subtractInPlace(this.wrist);
    const normal=Vector3.Dot(this.to,this.forward);
    this.to.addInPlaceFromFloats(-this.forward.x*normal,-this.forward.y*normal,-this.forward.z*normal);
    this.aim(hand,this.to,Vector3.UpReadOnly);
    Quaternion.SlerpToRef(this.handBase,hand.node.rotationQuaternion!,this.weight,hand.node.rotationQuaternion!);
    for(const finger of this.fingers){this.remember(finger);Quaternion.SlerpToRef(finger.base,finger.open,this.weight,finger.node.rotationQuaternion!);}
    for(const entry of this.joints)if(entry.changed){entry.applied.copyFrom(entry.node.rotationQuaternion!);entry.node.markAsDirty('rotationQuaternion');}
    this.applied=true;
  }
  sampleEmitter(origin:Vector3,direction:Vector3):boolean{
    if(!this.ready)return false;
    this.position(this.hand!.node,this.wrist);this.position(this.middle!,origin);
    Vector3.LerpToRef(this.wrist,origin,.7,origin);
    Vector3.TransformNormalToRef(PALM_FORWARD,this.hand!.node.getWorldMatrix(),direction);direction.normalize();
    origin.addInPlaceFromFloats(direction.x*.08,direction.y*.08,direction.z*.08);return true;
  }
  reset():void{this.restore();this.weight=0;}
  dispose():void{this.reset();this.scene.onBeforeAnimationsObservable.remove(this.before);}
}
