import {AnimationGroup,Matrix,Quaternion,Scene,TransformNode,Vector3,type Observer} from '@babylonjs/core';
import type {DogoTarget} from './DogoFollowController';
import type {TraversalWorld} from './CharacterTraversalController';
import type {DogoPlayController} from './DogoPlayController';

type Limb={upper:TransformNode;knee:TransformNode;paw:TransformNode;up:Vector3};
type Pose={node:TransformNode;rotation:Quaternion};

/** A short greeting pose with planted hind paws and forepaws on Santi's legs. */
export class DogoPlayMotion {
  private readonly pelvis:TransformNode;
  private readonly neck:TransformNode;
  private readonly front:Limb[];
  private readonly hind:Limb[];
  private readonly poses:Pose[]=[];
  private readonly before:Observer<Scene>;
  private readonly after:Observer<Scene>;
  private target:DogoTarget|null=null;
  private world:TraversalWorld|null=null;
  private offset={x:0,z:0};
  private weight=0;
  private wag=0;
  private chase=0;
  private time=0;
  private contacts:{name:string;error:number}[]=[];

  constructor(private scene:Scene,private anchor:TransformNode,nodes:readonly TransformNode[],private tail:AnimationGroup){
    const find=(name:string)=>{
      const node=nodes.find(n=>n.name===name);
      if(!node?.rotationQuaternion)throw new Error(`Dogo: falta articulación juguetona ${name}`);
      return node;
    };
    this.pelvis=find('spine.004');this.neck=find('spine.009');
    const limb=(a:string,b:string,c:string):Limb=>{
      const upper=find(a),knee=find(b),paw=find(c);
      return {upper,knee,paw,up:Vector3.TransformNormal(Vector3.Up(),Matrix.Invert(paw.computeWorldMatrix(true))).normalize()};
    };
    this.front=['L','R'].map(s=>limb(`front_thigh.${s}`,`front_shin.${s}`,`front_toe.${s}`));
    this.hind=['L','R'].map(s=>limb(`thigh.${s}`,`shin.${s}`,`toe.${s}`));
    this.before=scene.onBeforeAnimationsObservable.add(()=>this.restore(),-1,true);
    this.after=scene.onAfterAnimationsObservable.add(()=>this.apply());
  }

  update(dt:number,play:DogoPlayController,target:DogoTarget,world:TraversalWorld,offset:{x:number;z:number}):void{
    if(this.target&&this.target.context!==target.context)this.weight=this.wag=this.chase=0;
    const blend=1-Math.exp(-Math.max(0,Math.min(.1,dt))*14);
    this.weight+=(play.greeting-this.weight)*blend;
    this.wag+=((play.mode==='none'?0:1)-this.wag)*blend;
    this.chase+=((play.mode==='chaseTail'?1:0)-this.chase)*blend;
    this.time+=Math.max(0,dt);this.target=target;this.world=world;this.offset=offset;
  }

  private restore():void{
    for(const p of this.poses)p.node.rotationQuaternion!.copyFrom(p.rotation);
    this.poses.length=0;
  }
  private remember(node:TransformNode):void{
    if(!this.poses.some(p=>p.node===node))this.poses.push({node,rotation:node.rotationQuaternion!.clone()});
  }
  private point(node:TransformNode):Vector3{node.computeWorldMatrix(true);return node.absolutePosition.clone();}
  private rotate(node:TransformNode,axis:Vector3,angle:number):void{
    this.remember(node);node.rotationQuaternion!.multiplyInPlace(Quaternion.RotationAxis(axis,angle));node.computeWorldMatrix(true);
  }
  private aim(node:TransformNode,from:Vector3,to:Vector3):void{
    const inverse=Matrix.Invert(node.computeWorldMatrix(true));
    const a=Vector3.TransformNormal(from,inverse).normalize(),b=Vector3.TransformNormal(to,inverse).normalize();
    const axis=Vector3.Cross(a,b),dot=Math.max(-1,Math.min(1,Vector3.Dot(a,b)));
    if(axis.lengthSquared()>1e-9)this.rotate(node,axis.normalize(),Math.acos(dot));
  }
  private solve(leg:Limb,target:Vector3,orientation:Matrix):void{
    const hip=this.point(leg.upper),knee=this.point(leg.knee),paw=this.point(leg.paw);
    const a=Vector3.Distance(hip,knee),b=Vector3.Distance(knee,paw),direction=target.subtract(hip);
    const length=Math.max(.001,Math.min(a+b-.001,direction.length()));direction.normalize();
    let pole=knee.subtract(hip);pole.subtractInPlace(direction.scale(Vector3.Dot(pole,direction)));
    if(pole.lengthSquared()<1e-8)pole=Vector3.Cross(direction,new Vector3(1,0,0));
    pole.normalize();
    const along=(a*a+length*length-b*b)/(2*length),bend=Math.sqrt(Math.max(0,a*a-along*along));
    const wanted=hip.add(direction.scale(along)).addInPlace(pole.scale(bend));
    this.aim(leg.upper,knee.subtract(hip),wanted.subtract(hip));
    const current=this.point(leg.knee);
    this.aim(leg.knee,this.point(leg.paw).subtract(current),target.subtract(current));
    this.remember(leg.paw);
    orientation.multiply(Matrix.Invert(leg.paw.parent!.computeWorldMatrix(true))).decompose(undefined,leg.paw.rotationQuaternion!);
    leg.paw.computeWorldMatrix(true);
    this.contacts.push({name:leg.paw.name,error:Vector3.Distance(this.point(leg.paw),target)});
  }

  private apply():void{
    this.contacts=[];
    if(!this.anchor.isEnabled()||!this.target||!this.world)return;
    if(this.wag>.001){
      const phase=(this.time*1.5/this.tail.getLength())%1;
      for(const {target,animation} of this.tail.targetedAnimations){
        if(!/^spine(?:\.00[123])?$/.test(target.name)||animation.targetProperty!=='rotationQuaternion')continue;
        this.remember(target);
        Quaternion.SlerpToRef(target.rotationQuaternion,animation.evaluate(this.tail.from+(this.tail.to-this.tail.from)*phase),this.wag,target.rotationQuaternion);
      }
    }
    if(this.chase>.001){
      const inverse=Matrix.Invert(this.neck.computeWorldMatrix(true));
      // The circle advances with positive yaw: look inward, toward the tail.
      this.rotate(this.neck,Vector3.TransformNormal(Vector3.Up(),inverse).normalize(),.65*this.chase);
    }
    if(this.weight<.001)return;
    const front=this.front.map(leg=>({leg,point:this.point(leg.paw),orientation:leg.paw.getWorldMatrix().clone()}));
    const hind=this.hind.map(leg=>({leg,point:this.point(leg.paw),orientation:leg.paw.getWorldMatrix().clone()}));
    const forward=new Vector3(Math.sin(this.anchor.rotation.y),0,Math.cos(this.anchor.rotation.y));
    const inverse=Matrix.Invert(this.pelvis.computeWorldMatrix(true));
    const axis=Vector3.Cross(Vector3.TransformNormal(forward,inverse),Vector3.TransformNormal(Vector3.Up(),inverse)).normalize();
    this.rotate(this.pelvis,axis,1.05*this.weight);
    // Back paws stay where they were planted while the body rises.
    for(const {leg,point,orientation} of hind){
      const support=this.world.ground(point.x-this.offset.x,point.z-this.offset.z,this.anchor.position.y+1,2,.04);
      if(support)point.y=support.height+.045;
      this.solve(leg,point,orientation);
    }
    const player=new Vector3(this.target.x+this.offset.x,this.target.y,this.target.z+this.offset.z);
    const outward=this.anchor.position.subtract(player);outward.y=0;outward.normalize();
    const side=new Vector3(outward.z,0,-outward.x);
    for(let i=0;i<front.length;i++){
      const {leg,point,orientation}=front[i];
      const contact=player.add(outward.scale(.4)).addInPlace(side.scale(i===0?-.18:.18));contact.y=player.y+1.45;
      this.solve(leg,Vector3.Lerp(point,contact,this.weight),orientation);
      const up=Vector3.TransformNormal(leg.up,leg.paw.computeWorldMatrix(true)).normalize();
      this.aim(leg.paw,up,Vector3.Lerp(up,outward,this.weight).normalize());
    }
  }

  get rearing():boolean{return this.weight>.001;}
  get status(){return {weight:this.weight,wag:this.wag,contacts:this.contacts};}
  dispose():void{this.restore();this.scene.onBeforeAnimationsObservable.remove(this.before);this.scene.onAfterAnimationsObservable.remove(this.after);}
}
