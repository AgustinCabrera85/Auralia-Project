import { Matrix, Quaternion, Scene, TransformNode, Vector3, type Observer } from '@babylonjs/core';
import type { TraversalWorld } from './CharacterTraversalController';

type Leg={upper:TransformNode;knee:TransformNode;foot:TransformNode;clearance:number;up:Vector3;normal:Vector3};
type Pose={node:TransformNode;rotation:Quaternion};

/** Small, visual-only two-bone IK. Physics and every probe share TraversalWorld.
 * Restore the NLA pose before each mixer pass, then fit supporting feet after
 * movement. Raised swing feet retain their lift; jumps/swimming never use IK. */
export class GroundFootPlacement {
  private legs:Leg[]=[];
  private poses:Pose[]=[];
  private before:Observer<Scene>;
  private after:Observer<Scene>;
  private world:TraversalWorld|null=null;
  private offset={x:0,z:0};
  private enabled=false;
  private dt=0;
  private pelvis=0;
  private lastPosition:Vector3|null=null;
  private report:{name:string;lift:number;targetY:number;actualY:number;error:number}[]=[];

  constructor(private scene:Scene,private anchor:TransformNode,
    private visual:TransformNode,nodes:readonly TransformNode[],
    chains:readonly (readonly [string,string,string])[],private maxAdjust:number){
    anchor.computeWorldMatrix(true);
    for(const [a,b,c] of chains){
      const upper=nodes.find(n=>n.name===a),knee=nodes.find(n=>n.name===b),foot=nodes.find(n=>n.name===c);
      if(!upper||!knee||!foot)continue;
      foot.computeWorldMatrix(true);
      const clearance=foot.absolutePosition.y-anchor.absolutePosition.y;
      const up=Vector3.TransformNormal(Vector3.Up(),Matrix.Invert(foot.getWorldMatrix())).normalize();
      this.legs.push({upper,knee,foot,clearance,up,normal:Vector3.Up()});
    }
    this.before=scene.onBeforeAnimationsObservable.add(()=>this.restore());
    this.after=scene.onBeforeRenderObservable.add(()=>this.apply());
  }

  update(dt:number,enabled:boolean,world:TraversalWorld,offset:{x:number;z:number}):void{
    this.dt=Math.min(.1,Math.max(0,dt));this.enabled=enabled;this.world=world;this.offset=offset;
  }

  private restore():void{
    for(const p of this.poses)p.node.rotationQuaternion!.copyFrom(p.rotation);
    this.poses=[];this.visual.position.y=0;
  }

  private remember(node:TransformNode):void{
    if(!this.poses.some(p=>p.node===node))
      this.poses.push({node,rotation:node.rotationQuaternion!.clone()});
  }

  private point(node:TransformNode):Vector3{
    node.computeWorldMatrix(true);return node.absolutePosition.clone();
  }

  /** Rotate in joint-local space, also valid below the GLB's negative-Z scale. */
  private aim(node:TransformNode,from:Vector3,to:Vector3):void{
    const inverse=Matrix.Invert(node.computeWorldMatrix(true));
    const a=Vector3.TransformNormal(from,inverse).normalize();
    const b=Vector3.TransformNormal(to,inverse).normalize();
    const dot=Math.max(-1,Math.min(1,Vector3.Dot(a,b)));
    if(dot>.999999)return;
    const axis=Vector3.Cross(a,b);
    if(axis.lengthSquared()<1e-10)return;
    this.remember(node);
    node.rotationQuaternion!.multiplyInPlace(Quaternion.RotationAxis(axis.normalize(),Math.acos(dot)));
    node.computeWorldMatrix(true);
  }

  private solve(leg:Leg,target:Vector3):void{
    const hip=this.point(leg.upper),knee=this.point(leg.knee),foot=this.point(leg.foot);
    const a=Vector3.Distance(hip,knee),b=Vector3.Distance(knee,foot);
    const direction=target.subtract(hip),distance=Math.max(.001,Math.min(a+b-.001,direction.length()));
    direction.normalize();
    // Keep the authored knee bend plane, rather than selecting an arbitrary pole.
    let pole=knee.subtract(hip);pole.subtractInPlace(direction.scale(Vector3.Dot(pole,direction)));
    if(pole.lengthSquared()<1e-8){pole=Vector3.Cross(direction,new Vector3(1,0,0));}
    pole.normalize();
    const along=(a*a+distance*distance-b*b)/(2*distance);
    const bend=Math.sqrt(Math.max(0,a*a-along*along));
    const wantedKnee=hip.add(direction.scale(along)).addInPlace(pole.scale(bend));
    // Preserve the ankle's authored world orientation while changing the leg.
    const forward=Vector3.TransformNormal(new Vector3(0,0,1),leg.foot.getWorldMatrix());
    const up=Vector3.TransformNormal(new Vector3(0,1,0),leg.foot.getWorldMatrix());
    this.aim(leg.upper,knee.subtract(hip),wantedKnee.subtract(hip));
    const newKnee=this.point(leg.knee),newFoot=this.point(leg.foot);
    this.aim(leg.knee,newFoot.subtract(newKnee),target.subtract(newKnee));
    leg.foot.computeWorldMatrix(true);
    this.aim(leg.foot,Vector3.TransformNormal(new Vector3(0,0,1),leg.foot.getWorldMatrix()),forward);
    this.aim(leg.foot,Vector3.TransformNormal(new Vector3(0,1,0),leg.foot.getWorldMatrix()),up);
  }

  private apply():void{
    this.report=[];
    if(!this.enabled||!this.world||!this.anchor.isEnabled()){this.pelvis=0;return;}
    const origin=this.point(this.anchor);
    if(this.lastPosition&&Vector3.DistanceSquared(origin,this.lastPosition)>100)this.pelvis=0;
    this.lastPosition=origin.clone();
    const inverse=Matrix.Invert(this.anchor.getWorldMatrix());
    const samples=this.legs.map(leg=>{
      const p=this.point(leg.foot),local=Vector3.TransformCoordinates(p,inverse);
      return {leg,p,height:local.y-leg.clearance};
    });
    const base=Math.min(...samples.map(s=>s.height));
    const targets=samples.flatMap(s=>{
      const hit=this.world!.ground(s.p.x-this.offset.x,s.p.z-this.offset.z,
        origin.y+this.maxAdjust+1,2+this.maxAdjust*2,.045);
      if(!hit||hit.normalY<.45||Math.abs(hit.height-origin.y)>this.maxAdjust*2)return [];
      const radius=this.maxAdjust*.45;
      const hx=this.world!.ground(s.p.x-this.offset.x+radius,s.p.z-this.offset.z,origin.y+this.maxAdjust+1,2+this.maxAdjust*2,.02);
      const hz=this.world!.ground(s.p.x-this.offset.x,s.p.z-this.offset.z+radius,origin.y+this.maxAdjust+1,2+this.maxAdjust*2,.02);
      const normal=hx&&hz?new Vector3(-(hx.height-hit.height)/radius,1,-(hz.height-hit.height)/radius).normalize():Vector3.Up();
      // A step edge is not a surface normal: preserve the foot's last sane tilt.
      if(normal.y>.65)Vector3.LerpToRef(s.leg.normal,normal,1-Math.exp(-this.dt*15),s.leg.normal);
      const lift=Math.max(0,s.height-base);
      const y=hit.height+s.leg.clearance+.018+lift;
      return [{...s,lift,y,delta:y-s.p.y}];
    });
    if(!targets.length){this.pelvis=0;return;}
    // Lower the pelvis toward the lower support; IK bends the other leg(s).
    const desired=Math.max(-this.maxAdjust,Math.min(this.maxAdjust*.5,Math.min(...targets.map(t=>t.delta))));
    this.pelvis+=(desired-this.pelvis)*(1-Math.exp(-this.dt*18));
    this.visual.position.y=this.pelvis;this.visual.computeWorldMatrix(true);
    for(const t of targets){
      const p=this.point(t.leg.foot);
      const y=p.y+Math.max(-this.maxAdjust,Math.min(this.maxAdjust,t.y-p.y));
      this.solve(t.leg,new Vector3(p.x,y,p.z));
      const planted=Math.max(0,1-t.lift/(this.maxAdjust*.65));
      const up=Vector3.TransformNormal(t.leg.up,t.leg.foot.computeWorldMatrix(true)).normalize();
      this.aim(t.leg.foot,up,Vector3.Lerp(up,t.leg.normal,planted).normalize());
      const actual=this.point(t.leg.foot).y;
      this.report.push({name:t.leg.foot.name,lift:t.lift,targetY:t.y,actualY:actual,error:actual-t.y});
    }
  }

  get status(){return {enabled:this.enabled,pelvis:this.pelvis,feet:this.report};}
  dispose():void{
    this.restore();this.scene.onBeforeAnimationsObservable.remove(this.before);
    this.scene.onBeforeRenderObservable.remove(this.after);
  }
}
