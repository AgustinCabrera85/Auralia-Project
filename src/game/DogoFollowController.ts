import { DOGO, type DogoLocomotion } from './DogoCatalog';
import type { TraversalWorld, TraversalPosition } from './CharacterTraversalController';

export type DogoTarget = TraversalPosition & { heading:number; supported:boolean; context:string };
type Support={y:number;swimming:boolean};
const distance=(a:TraversalPosition,b:TraversalPosition)=>Math.hypot(a.x-b.x,a.z-b.z);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

/** Bounded trail following and local avoidance; shares Santi's world queries. */
export class DogoFollowController {
  readonly position:TraversalPosition={x:0,y:0,z:0};
  heading=0;
  locomotion:DogoLocomotion='idle';
  speed=0;
  gaitSpeed=0;
  angularSpeed=0;
  pitch=0;
  roll=0;
  sniffing=false;
  visible=false;
  recoveries=0;
  private context='';
  private trail:TraversalPosition[]=[];
  private lastTarget:TraversalPosition|null=null;
  private following=false;
  private stalled=0;
  private idleTime=0;
  private curious:TraversalPosition|null=null;
  private observed:TraversalPosition|null=null;
  private seed=1731;
  private playerSpeed=0;
  private travelSpeed=0;
  private guideHeading=0;
  private sniffRemaining=0;
  private nextInterest:'sniff'|'explore'='sniff';
  private grade=0;

  /** Four support probes fit the body to the same surface used by its feet. */
  private fitSlope(dt:number,world:TraversalWorld,swimming:boolean):void {
    let pitch=0,roll=0;
    if(!swimming){
      const forwardX=Math.sin(this.heading),forwardZ=Math.cos(this.heading);
      const probe=(along:number,side:number)=>world.ground(
        this.position.x+forwardX*along+forwardZ*side,
        this.position.z+forwardZ*along-forwardX*side,this.position.y+1.1,2.5,.06);
      const front=probe(.55,0),back=probe(-.55,0),left=probe(0,-.28),right=probe(0,.28);
      if(front&&back)pitch=-Math.atan2(front.height-back.height,1.1);
      if(left&&right)roll=Math.atan2(right.height-left.height,.56);
    }
    this.grade=-Math.tan(pitch);
    const blend=1-Math.exp(-dt*8);
    this.pitch+=clamp((clamp(pitch,-.79,.79)-this.pitch)*blend,-1.8*dt,1.8*dt);
    this.roll+=clamp((clamp(roll,-.44,.44)-this.roll)*blend,-1.4*dt,1.4*dt);
  }

  private random():number{
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    return this.seed/4294967296;
  }

  private explore(target:DogoTarget,world:TraversalWorld):TraversalPosition|null{
    for(let i=0;i<8;i++){
      const angle=this.random()*Math.PI*2,radius=3+this.random()*3;
      const x=target.x+Math.sin(angle)*radius,z=target.z+Math.cos(angle)*radius;
      const support=this.support(x,z,this.position.y,world);
      if(!support||support.swimming||Math.hypot(x-this.position.x,z-this.position.z)<2)continue;
      if(world.canMove(x,z,this.position.x,this.position.z,this.position.y)&&
        world.headroom(x,support.y,z,DOGO.height))return {x,y:support.y,z};
    }
    return null;
  }

  private support(x:number,z:number,y:number,world:TraversalWorld,relocate=false):Support|null {
    const water=world.waterLevel?.(x,z);
    const origin=relocate?y+3:y+DOGO.stepHeight;
    const ground=world.ground(x,z,origin,relocate?12:DOGO.stepHeight+DOGO.maxDrop,DOGO.radius);
    if(water!=null&&(!ground||water-ground.height>DOGO.height*.56)&&water<=origin+2)
      return {y:water-DOGO.height*.56,swimming:true};
    if(!ground||ground.normalY<Math.cos(DOGO.maxSlope*Math.PI/180))return null;
    return {y:ground.height,swimming:false};
  }

  private reset(target:DogoTarget,world:TraversalWorld):boolean {
    if(!target.supported)return false;
    // Prefer the front flank, then search Santi's immediate reachable area.
    for(const radius of [4,2])for(const offset of [-.55,.55,-1.2,1.2,Math.PI,0]){
      const angle=target.heading+Math.PI/3+offset;
      const x=target.x+Math.sin(angle)*radius,z=target.z+Math.cos(angle)*radius;
      const support=this.support(x,z,target.y,world,true);
      if(!support||!world.canMove(x,z,target.x,target.z,target.y)||
        !world.headroom(x,support.y,z,DOGO.height))continue;
      const wall=world.wall(target.x,target.y+.7,target.z,(x-target.x)/radius,(z-target.z)/radius,radius);
      if(wall&&wall.distance<radius+DOGO.radius)continue;
      this.position.x=x;this.position.y=support.y;this.position.z=z;
      this.heading=target.heading;this.visible=true;this.context=target.context;
      this.trail=[];this.lastTarget={...target};this.following=false;this.stalled=0;
      this.speed=0;this.locomotion=support.swimming?'swimIdle':'idle';
      this.curious=null;this.idleTime=0;this.observed={...target};
      this.travelSpeed=0;this.playerSpeed=0;this.guideHeading=target.heading;
      this.pitch=this.roll=this.grade=this.angularSpeed=this.gaitSpeed=0;
      this.sniffRemaining=0;this.sniffing=false;this.nextInterest='sniff';
      return true;
    }
    return false;
  }

  step(dt:number,target:DogoTarget,world:TraversalWorld):void {
    dt=Math.max(0,Math.min(dt,.1));
    if(dt===0)return;
    const previousHeading=this.heading;
    const gap=distance(this.position,target);
    const travelled=this.observed&&distance(this.observed,target)>DOGO.recoverDistance;
    if(!this.visible||this.context!==target.context||travelled){
      this.visible=false;
      if(this.reset(target,world))this.recoveries++;
      return;
    }
    const displacement=this.observed?distance(this.observed,target):0;
    const playerMoved=displacement/dt>.15;
    this.playerSpeed+=(Math.min(32,dt>0?displacement/dt:0)-this.playerSpeed)*Math.min(1,dt*8);
    this.guideHeading+=clamp(angleDelta(target.heading,this.guideHeading),-1.8*dt,1.8*dt);
    this.observed={...target};
    if(playerMoved||!target.supported||gap>8){
      this.curious=null;this.idleTime=0;this.sniffRemaining=0;
    }
    if(target.supported&&(!this.lastTarget||distance(this.lastTarget,target)>=DOGO.trailSpacing)){
      this.trail.push({x:target.x,y:target.y,z:target.z});
      if(this.trail.length>DOGO.maxTrail)this.trail.shift();
      this.lastTarget={...target};
    }
    while(this.trail.length&&distance(this.position,this.trail[0])<.8)this.trail.shift();
    if(playerMoved){this.following=true;}
    else if(gap<8){this.following=false;this.trail=[];}
    else if(gap>DOGO.resumeDistance&&!this.curious)this.following=true;
    const current=this.support(this.position.x,this.position.z,this.position.y,world);
    const swimming=current?.swimming??false;
    if(current)this.position.y=current.y;
    this.fitSlope(dt,world,swimming);
    if(swimming)this.sniffRemaining=0;
    this.sniffRemaining=Math.max(0,this.sniffRemaining-dt);
    if(!this.following&&!swimming&&target.supported&&!playerMoved&&this.travelSpeed<.1&&!this.curious){
      this.idleTime+=dt;
      if(this.sniffRemaining===0&&this.idleTime>3.5){
        if(this.nextInterest==='sniff'){
          this.sniffRemaining=2.2+this.random()*1.5;this.nextInterest='explore';
        }else{
          this.curious=this.explore(target,world);this.nextInterest='sniff';
        }
        this.idleTime=0;
      }
    }
    if(this.curious&&distance(this.position,this.curious)<.65){
      this.curious=null;this.idleTime=0;
    }
    this.speed=0;this.gaitSpeed=0;
    const coasting=!this.following&&!this.curious&&this.travelSpeed>.02;
    if(this.following||this.curious||coasting){
      const guide={x:target.x+Math.sin(this.guideHeading)*3.8+Math.cos(this.guideHeading)*2.8,
        y:target.y,z:target.z+Math.cos(this.guideHeading)*3.8-Math.sin(this.guideHeading)*2.8};
      const leading=playerMoved&&gap<16&&!!this.support(guide.x,guide.z,target.y,world,true)&&
        world.canMove(guide.x,guide.z,target.x,target.z,target.y);
      if(leading)this.trail=[];
      const goal=this.curious??(leading?guide:this.trail[0]??target);
      const dx=goal.x-this.position.x,dz=goal.z-this.position.z,d=Math.hypot(dx,dz);
      const desired=coasting?this.heading:Math.atan2(dx,dz);
      const wanted=coasting?0:this.curious?3.6:swimming?DOGO.swimSpeed:leading?
        Math.min(DOGO.catchupSpeed,Math.max(0,this.playerSpeed+(d-1)*2)):
        gap>18?DOGO.catchupSpeed:gap>7?DOGO.runSpeed:DOGO.walkSpeed;
      const turn=angleDelta(desired,this.heading);
      this.heading+=clamp(turn,-DOGO.turnRate*dt,DOGO.turnRate*dt);
      // Brake into sharp turns and accelerate out of them; rotating Santi never
      // changes Dogo's position directly or restarts a spawn/recovery.
      const slopePace=swimming?1:1/(Math.hypot(1,this.grade)*(1+Math.max(0,this.grade)*1.15));
      const arrival=this.curious?Math.sqrt(2*DOGO.braking*Math.max(0,d-.3)):Infinity;
      const cornerSpeed=Math.min(arrival,wanted*Math.max(.18,Math.cos(turn))*slopePace);
      this.travelSpeed+=clamp(cornerSpeed-this.travelSpeed,-DOGO.braking*dt,DOGO.acceleration*dt);
      const travel=coasting?this.travelSpeed*dt:Math.min(this.travelSpeed*dt,
        Math.max(0,d-(this.curious||leading||this.trail.length?0:DOGO.stopDistance)));
      let moved=0,surfaceMoved=0;
      // Short substeps cannot tunnel through a trunk when catching up at low FPS.
      for(let remaining=travel;remaining>.0001;){
        const step=Math.min(.3,remaining);let accepted=false;
        for(const turn of [0,.45,-.45,.9,-.9,1.3,-1.3]){
          const yaw=this.heading+turn,ux=Math.sin(yaw),uz=Math.cos(yaw);
          const x=this.position.x+ux*step,z=this.position.z+uz*step;
          if(Math.hypot(x-target.x,z-target.z)<2.2||
            this.curious&&Math.hypot(x-target.x,z-target.z)>7)continue;
          const support=this.support(x,z,this.position.y,world);
          if(!support||this.curious&&support.swimming||!world.canMove(x,z,this.position.x,this.position.z,this.position.y))continue;
          const wall=world.wall(this.position.x,this.position.y+.65,this.position.z,ux,uz,step+DOGO.radius);
          if(wall&&wall.distance<step+DOGO.radius)continue;
          // Sweep both sides of the body, including authored/building obstacles.
          if(![-1,1].every(side=>world.canMove(x+uz*DOGO.radius*side,z-ux*DOGO.radius*side,
            this.position.x,this.position.z,this.position.y)))continue;
          if(!world.headroom(x,support.y,z,DOGO.height))continue;
          surfaceMoved+=Math.hypot(step,support.y-this.position.y);
          this.position.x=x;this.position.y=support.y;this.position.z=z;
          moved+=step;accepted=true;break;
        }
        if(!accepted)break;
        remaining-=step;
      }
      this.speed=dt>0?moved/dt:0;
      this.gaitSpeed=surfaceMoved/dt;
      this.stalled=this.speed<.1?this.stalled+dt:0;
      if(this.curious&&this.stalled>1.5){this.curious=null;this.idleTime=-3;this.stalled=0;}
      // If a route is no longer reachable, retry locally or wait. Repositioning
      // is reserved for an actual player teleport or a change of world context.
      if(this.stalled>3)this.trail=[];
      if(this.speed<.1)this.travelSpeed=0;
    }else {this.stalled=0;this.travelSpeed=0;}
    this.angularSpeed=Math.abs(angleDelta(this.heading,previousHeading))/dt;
    this.sniffing=this.sniffRemaining>0&&this.speed<.1&&!this.following&&!swimming;
    const wet=this.support(this.position.x,this.position.z,this.position.y,world)?.swimming??swimming;
    this.locomotion=wet?(this.speed>.1?'swim':'swimIdle'):
      this.speed<.1?'idle':this.speed>7?'run':'walk';
  }

  get status(){return {position:{...this.position},heading:this.heading,locomotion:this.locomotion,
    speed:this.speed,gaitSpeed:this.gaitSpeed,angularSpeed:this.angularSpeed,pitch:this.pitch,roll:this.roll,
    visible:this.visible,trailPoints:this.trail.length,recoveries:this.recoveries,
    behavior:this.sniffing?'sniffing':this.curious?'curious':this.following?'following':this.speed>.1?'slowing':'waiting'};}
}
