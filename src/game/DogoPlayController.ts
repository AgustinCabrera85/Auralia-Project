import type {DogoFollowController,DogoTarget} from './DogoFollowController';
import type {TraversalPosition,TraversalWorld} from './CharacterTraversalController';

export type DogoPlayMode='none'|'approach'|'greet'|'retreat'|'chaseTail';
const distance=(a:TraversalPosition,b:TraversalPosition)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));

/** Occasional, interruptible play on clear ground while Santi is stationary. */
export class DogoPlayController {
  mode:DogoPlayMode='none';
  progress=0;
  private elapsed=0;
  private quiet=0;
  private cooldown=18;
  private next:'greet'|'chaseTail'='greet';
  private target:DogoTarget|null=null;
  private goal:TraversalPosition|null=null;
  private center:TraversalPosition|null=null;
  private circleAngle=0;

  private ground(x:number,z:number,y:number,world:TraversalWorld):number|null{
    const hit=world.ground(x,z,y+1,2,.35),water=world.waterLevel?.(x,z);
    return hit&&hit.normalY>.94&&Math.abs(hit.height-y)<.35&&
      (water==null||water<hit.height+.08)&&world.headroom(x,hit.height,z,2.5)?hit.height:null;
  }

  private clear(from:TraversalPosition,to:TraversalPosition,world:TraversalWorld):boolean{
    const length=distance(from,to),steps=Math.max(1,Math.ceil(length/.2));
    let previous=from;
    for(let i=1;i<=steps;i++){
      const t=i/steps,x=from.x+(to.x-from.x)*t,z=from.z+(to.z-from.z)*t;
      const y=this.ground(x,z,previous.y,world);
      if(y===null||!world.canMove(x,z,previous.x,previous.z,previous.y))return false;
      const dx=x-previous.x,dz=z-previous.z,d=Math.hypot(dx,dz);
      if(d>0){
        const wall=world.wall(previous.x,previous.y+.65,previous.z,dx/d,dz/d,d+.35);
        if(wall&&wall.distance<d+.35)return false;
        if(![-.34,.34].every(side=>world.canMove(x+dz/d*side,z-dx/d*side,previous.x,previous.z,previous.y)))return false;
      }
      previous={x,y,z};
    }
    return true;
  }

  private finish():void{
    this.mode='none';this.elapsed=this.progress=this.quiet=0;this.cooldown=22;
    this.goal=this.center=null;
  }

  private begin(dog:DogoFollowController,target:DogoTarget,world:TraversalWorld):boolean{
    if(this.next==='greet'){
      const d=distance(dog.position,target);
      if(d<2||d>6)return false;
      const goal={x:target.x+(dog.position.x-target.x)*.95/d,y:target.y,z:target.z+(dog.position.z-target.z)*.95/d};
      if(!this.clear(dog.position,goal,world))return false;
      this.goal=goal;this.mode='approach';this.next='chaseTail';
    }else{
      this.center={x:dog.position.x-Math.sin(dog.heading)*.8,y:dog.position.y,z:dog.position.z-Math.cos(dog.heading)*.8};
      let previous={...dog.position};
      for(let i=1;i<=24;i++){
        const a=dog.heading+i/24*Math.PI*2;
        const p={x:this.center.x+Math.sin(a)*.8,y:dog.position.y,z:this.center.z+Math.cos(a)*.8};
        if(distance(p,target)<2.3||distance(p,target)>7||!this.clear(previous,p,world)){this.center=null;return false;}
        previous=p;
      }
      this.circleAngle=dog.heading;this.mode='chaseTail';this.next='greet';
    }
    this.elapsed=this.progress=0;dog.sniffing=false;return true;
  }

  /** Returns true while play owns movement; otherwise the usual follower runs. */
  update(dt:number,dog:DogoFollowController,target:DogoTarget,world:TraversalWorld):boolean{
    dt=clamp(dt,0,.1);
    const changed=!!this.target&&(this.target.context!==target.context||distance(this.target,target)>.12);
    const moving=!!this.target&&distance(this.target,target)/Math.max(.001,dt)>.15;
    this.target={...target};
    if(!dog.visible||!target.supported||changed||moving||dog.locomotion==='swim'||dog.locomotion==='swimIdle'){
      if(this.mode!=='none')this.finish();
      this.quiet=0;return false;
    }
    if(this.mode==='none'){
      this.quiet+=dt;
      if(this.quiet<this.cooldown||dog.speed>.15||dog.sniffing||Math.abs(dog.pitch)>.15||Math.abs(dog.roll)>.15)return false;
      if(!this.begin(dog,target,world)){this.quiet=0;this.cooldown=8;return false;}
    }
    this.elapsed+=dt;
    const previousHeading=dog.heading,old={...dog.position};
    dog.sniffing=false;dog.speed=dog.gaitSpeed=0;
    if(this.mode==='greet'){
      this.progress=Math.min(1,this.elapsed/4.2);
      dog.heading+=clamp(angle(Math.atan2(target.x-dog.position.x,target.z-dog.position.z),dog.heading),-3*dt,3*dt);
      if(this.elapsed>=4.2){
        const d=distance(dog.position,target);
        this.goal={x:target.x+(dog.position.x-target.x)*2.7/d,y:dog.position.y,z:target.z+(dog.position.z-target.z)*2.7/d};
        this.mode='retreat';this.elapsed=0;this.progress=0;
      }
    }else{
      let point:TraversalPosition;
      if(this.mode==='chaseTail'){
        const ramp=Math.min(1,this.elapsed/.55,Math.max(0,(4.6-this.elapsed)/.55));
        this.circleAngle+=dt*3.6*ramp;
        point={x:this.center!.x+Math.sin(this.circleAngle)*.8,y:dog.position.y,z:this.center!.z+Math.cos(this.circleAngle)*.8};
        dog.heading+=clamp(angle(this.circleAngle+Math.PI/2,dog.heading),-7*dt,7*dt);
        this.progress=Math.min(1,this.elapsed/4.6);
        if(this.elapsed>=4.6){this.finish();dog.locomotion='idle';return true;}
      }else{
        const d=distance(dog.position,this.goal!);
        const heading=this.mode==='retreat'?Math.atan2(target.x-dog.position.x,target.z-dog.position.z):Math.atan2(this.goal!.x-dog.position.x,this.goal!.z-dog.position.z);
        dog.heading+=clamp(angle(heading,dog.heading),-3*dt,3*dt);
        const move=Math.min(d,dt*Math.min(2.3,Math.max(.3,d*3)));
        point={x:dog.position.x+(this.goal!.x-dog.position.x)*move/Math.max(.001,d),y:dog.position.y,z:dog.position.z+(this.goal!.z-dog.position.z)*move/Math.max(.001,d)};
        if(d<.045&&Math.abs(angle(heading,dog.heading))<.08){
          if(this.mode==='approach'){this.mode='greet';this.elapsed=0;}
          else this.finish();
        }
        if(this.elapsed>7){this.finish();dog.locomotion='idle';return true;}
      }
      if(!this.clear(dog.position,point,world)){this.finish();dog.locomotion='idle';return true;}
      dog.position.x=point.x;dog.position.z=point.z;
      dog.position.y=this.ground(point.x,point.z,point.y,world)!;
      dog.speed=dog.gaitSpeed=distance(old,dog.position)/Math.max(.001,dt);
    }
    dog.angularSpeed=Math.abs(angle(dog.heading,previousHeading))/Math.max(.001,dt);
    dog.locomotion=dog.speed>.05?'walk':'idle';
    return true;
  }

  get greeting():number{
    if(this.mode!=='greet')return 0;
    const t=Math.min(1,this.elapsed/.8,(4.2-this.elapsed)/.8);
    return Math.max(0,t*t*(3-2*t));
  }
  get status(){return {mode:this.mode,progress:this.progress,greeting:this.greeting};}
}
