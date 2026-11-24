import { TRAVERSAL, canBeginClimb, canMantleRise, integrateAirborneVertical, slopeAllowed,
  type GroundHit, type LocomotionMode } from './traversalRules';

export type TraversalPosition={x:number;y:number;z:number};
export type TraversalWall={
  pointX:number;pointY:number;pointZ:number;distance:number;
  normalX:number;normalY:number;normalZ:number;rockId:string;climbable:boolean;
  terrain?:boolean;
};
export type TraversalSolid={
  height:number;normalX:number;normalZ:number;rockId:string;centerX:number;centerZ:number;
};
export type TraversalWorld={
  stepHeightAt?:(x:number,z:number)=>number;
  ground:(x:number,z:number,originY:number,maxDistance:number,footRadius:number)=>GroundHit|null;
  solidTop:(x:number,z:number,originY:number,maxDistance:number,rockId?:string)=>TraversalSolid|null;
  wall:(x:number,y:number,z:number,dirX:number,dirZ:number,maxDistance:number)=>TraversalWall|null;
  headroom:(x:number,y:number,z:number,height:number,ignoreRockId?:string)=>boolean;
  sameSupport?:(a:string,b:string)=>boolean;
  canMove:(nextX:number,nextZ:number,fromX:number,fromZ:number,feetY:number)=>boolean;
  fallbackHeight:(x:number,z:number)=>number;
  waterLevel?:(x:number,z:number)=>number|null;
};
export type TraversalInput={
  moveX:number;moveZ:number;forwardX:number;forwardZ:number;
  horizontal:number;vertical:number;run:boolean;sprint:boolean;jumpPressed:boolean;
  airKickPressed?:boolean;
  swimVertical?:number;
};
export type ActionMotionKind='sweep'|'roll'|'landingRoll'|'landingHold'|'attackHold';

/** A small kinematic capsule controller. All positions are feet in local-zone meters. */
export class CharacterTraversalController {
  readonly position:TraversalPosition={x:0,y:0,z:0};
  mode:LocomotionMode='grounded';
  supportRockId:string|null=null;
  private velocityY=0;
  private jumpsUsed=0;
  private airVelocityX=0;
  private airVelocityZ=0;
  private airTargetSpeed=11;
  private airDashRemaining=0;
  private verticalAirKick=false;
  private groundVelocityX=0;
  private groundVelocityZ=0;
  private rollCarryX=0;
  private rollCarryZ=0;
  private actionMotion:{
    kind:ActionMotionKind;
    directionX:number;directionZ:number;initialSpeed:number;
    duration:number;elapsed:number;movementFraction:number
  }|null=null;
  private climbRockId:string|null=null;
  private climbNormal={x:0,z:0};
  private climbProbeHeight=1.15;
  private mantleProbeCooldown=0;
  private climbDetachRemaining=0;
  private grade=0;
  private slideHeading:{x:number;z:number;grade:number}|null=null;
  private swimVelocityX=0;
  private swimVelocityZ=0;
  private swimFlowX=0;
  private swimFlowZ=0;
  private swimSlopeX=0;
  private swimSlopeZ=0;
  private swimSlopeSampled=false;
  private swimTravel={x:0,y:0,z:0};
  private swimDepthTarget:number|null=null;
  private climbTravel={vertical:0,side:0};
  private lastClimbWall:TraversalWall|null=null;
  private mantle:{from:TraversalPosition;to:TraversalPosition;elapsed:number;duration:number;ledge?:boolean}|null=null;
  private ledge:{wall:TraversalWall;target:TraversalPosition;armed:boolean}|null=null;

  private sameSupport(a:string,b:string|null,world:TraversalWorld):boolean{
    return b!==null&&(a===b||world.sameSupport?.(a,b)===true);
  }

  teleport(x:number,y:number,z:number):void{
    Object.assign(this.position,{x,y,z});
    this.mode='grounded';this.velocityY=0;this.supportRockId=null;
    this.jumpsUsed=0;
    this.airVelocityX=0;this.airVelocityZ=0;this.airDashRemaining=0;
    this.verticalAirKick=false;
    this.groundVelocityX=0;this.groundVelocityZ=0;
    this.rollCarryX=0;this.rollCarryZ=0;
    this.actionMotion=null;
    this.climbRockId=null;this.lastClimbWall=null;this.mantle=null;this.ledge=null;
    this.mantleProbeCooldown=0;
    this.climbDetachRemaining=0;this.grade=0;
    this.slideHeading=null;
    this.climbTravel={vertical:0,side:0};
    this.swimVelocityX=0;this.swimVelocityZ=0;
    this.swimFlowX=0;this.swimFlowZ=0;
    this.swimTravel={x:0,y:0,z:0};
    this.swimDepthTarget=null;
  }

  get canInteract():boolean{return this.mode!=='climbing'&&this.mode!=='mantling'&&this.mode!=='hanging';}
  constrainCeiling(ceiling:number):void{
    const maxY=ceiling-TRAVERSAL.playerHeight-.08;
    if(this.position.y>maxY){this.position.y=maxY;this.velocityY=Math.min(0,this.velocityY);}
  }
  get canBuild():boolean{return this.mode==='grounded';}
  get swimSubmerged():boolean{return this.mode==='swimming'&&this.swimDepthTarget!==null;}
  get swimTravelDirection():{x:number;z:number}|null{
    if(this.mode!=='swimming')return null;
    const speed=Math.hypot(this.swimTravel.x,this.swimTravel.z);
    return speed>.15?{x:this.swimTravel.x/speed,z:this.swimTravel.z/speed}:null;
  }
  /** Positive pitch points the swimmer's head down. Use actual travel, including
   * depth changes, rather than the lakebed normal or the requested input. */
  get swimPitch():number{
    return this.mode==='swimming'?Math.atan2(-this.swimTravel.y,
      Math.max(1.5,Math.hypot(this.swimTravel.x,this.swimTravel.z))):0;
  }
  get jumpCount():number{return this.jumpsUsed;}
  get airKickActive():boolean{return this.verticalAirKick&&this.airDashRemaining>0;}
  get actionMotionActive():boolean{return this.actionMotion!==null;}
  get rollCarryActive():boolean{return Math.hypot(this.rollCarryX,this.rollCarryZ)>.05;}
  get groundGrade():number{return this.grade;}
  get slopeSlideDirection():{x:number;z:number;grade:number}|null{return this.slideHeading;}
  get climbMotion():{vertical:number;side:number}{return this.climbTravel;}
  get climbContact():TraversalWall|null{return this.mode==='hanging'?this.ledge?.wall??null:this.mode==='climbing'?this.lastClimbWall:null;}
  get climbFacing():{x:number;z:number}|null{
    return this.mode==='climbing'||this.mode==='mantling'||this.mode==='hanging'
      ?{x:-this.climbNormal.x,z:-this.climbNormal.z}:null;
  }
  get mantleProgress():number{return this.mantle?this.mantle.elapsed/this.mantle.duration:0;}
  get groundTravelVelocity():{x:number;z:number;speed:number}{
    return {x:this.groundVelocityX,z:this.groundVelocityZ,
      speed:Math.hypot(this.groundVelocityX,this.groundVelocityZ)};
  }
  get airTravelDirection():{x:number;z:number}|null{
    if(this.mode!=='airborne')return null;
    const speed=Math.hypot(this.airVelocityX,this.airVelocityZ);
    return speed>1e-5?{x:this.airVelocityX/speed,z:this.airVelocityZ/speed}:null;
  }

  /** Match the attack's actual playback clock, including shortened combo recovery. */
  setAttackHold(remainingSeconds:number):void{
    if(remainingSeconds>0){
      if(!this.actionMotion||this.actionMotion.kind==='attackHold')
        this.beginActionMotion('attackHold',1,0,0,remainingSeconds);
    }else if(this.actionMotion?.kind==='attackHold')this.actionMotion=null;
  }

  beginActionMotion(kind:ActionMotionKind,directionX:number,directionZ:number,
    initialSpeed:number,duration:number):boolean{
    if(this.mode!=='grounded'||duration<=0)return false;
    const length=Math.hypot(directionX,directionZ);
    if(length<1e-5)return false;
    this.rollCarryX=0;this.rollCarryZ=0;
    this.actionMotion={kind,directionX:directionX/length,directionZ:directionZ/length,
      initialSpeed:Math.max(0,initialSpeed),duration,elapsed:0,
      movementFraction:kind==='landingRoll'?.7:1};
    return true;
  }

  step(dt:number,input:TraversalInput,world:TraversalWorld):boolean{
    this.slideHeading=null;
    this.swimSlopeSampled=false;
    const startX=this.position.x,startY=this.position.y,startZ=this.position.z;
    const startedMode=this.mode;
    const count=Math.max(1,Math.ceil(Math.min(dt,.1)/.025));
    const subDt=Math.min(dt,.1)/count;
    let moved=false;
    for(let i=0;i<count;i++)moved=this.substep(subDt,{...input,
      jumpPressed:i===0&&input.jumpPressed,airKickPressed:i===0&&input.airKickPressed},world)||moved;
    if(this.mode!=='airborne')this.slideHeading=null;
    const distance=Math.hypot(this.position.x-startX,this.position.z-startZ);
    this.grade=this.mode==='grounded'&&startedMode==='grounded'&&distance>.001
      ?(this.position.y-startY)/distance:0;
    const elapsed=Math.max(.001,Math.min(dt,.1));
    if(this.mode==='swimming'){
      this.swimTravel.x=(this.position.x-startX)/elapsed;
      this.swimTravel.y=(this.position.y-startY)/elapsed;
      this.swimTravel.z=(this.position.z-startZ)/elapsed;
    }else{this.swimTravel.x=0;this.swimTravel.y=0;this.swimTravel.z=0;}
    this.climbTravel=this.mode==='climbing'&&startedMode==='climbing'?{
      vertical:(this.position.y-startY)/(elapsed*TRAVERSAL.climbUpSpeed),
      side:((this.position.x-startX)*-this.climbNormal.z+
        (this.position.z-startZ)*this.climbNormal.x)/(elapsed*TRAVERSAL.climbSideSpeed)
    }:{vertical:0,side:0};
    if(this.mode==='grounded'&&!this.actionMotion&&dt>0){
      const elapsed=Math.min(dt,.1);
      this.groundVelocityX=(this.position.x-startX)/elapsed;
      this.groundVelocityZ=(this.position.z-startZ)/elapsed;
    }else{this.groundVelocityX=0;this.groundVelocityZ=0;}
    if(this.mode==='grounded'){
      this.jumpsUsed=0;
      this.airVelocityX=0;this.airVelocityZ=0;this.airDashRemaining=0;
      this.verticalAirKick=false;
    }else{this.actionMotion=null;this.rollCarryX=0;this.rollCarryZ=0;}
    if(this.actionMotion&&this.actionMotion.elapsed>=this.actionMotion.duration){
      if(this.actionMotion.kind==='roll'){
        const exitSpeed=this.actionMotion.initialSpeed*.6;
        this.rollCarryX=this.actionMotion.directionX*exitSpeed;
        this.rollCarryZ=this.actionMotion.directionZ*exitSpeed;
      }
      this.actionMotion=null;
    }
    return moved;
  }

  private substep(dt:number,input:TraversalInput,world:TraversalWorld):boolean{
    const p=this.position;
    const stepHeight=world.stepHeightAt?.(p.x,p.z)??TRAVERSAL.stepHeight;
    const water=world.waterLevel?.(p.x,p.z);
    if(water!==undefined&&water!==null&&p.y<water-1.7&&
      water-world.fallbackHeight(p.x,p.z)>3&&this.mode!=='mantling'){
      if(this.mode!=='swimming')this.swimDepthTarget=water-p.y>3?water-p.y:null;
      this.mode='swimming';this.velocityY=0;this.jumpsUsed=0;this.actionMotion=null;
      this.climbRockId=null;this.lastClimbWall=null;this.supportRockId=null;
    }
    if(this.mode==='swimming')return this.swimStep(dt,input,world,water??null);
    this.climbDetachRemaining=Math.max(0,this.climbDetachRemaining-dt);
    if(this.mode==='hanging'){
      const ledge=this.ledge!,top=world.ground(ledge.target.x,ledge.target.z,ledge.target.y+.2,.4,TRAVERSAL.playerRadius*.45);
      const supported=top&&Math.abs(top.height-ledge.target.y)<.15&&
        (ledge.wall.terrain&&!top.rockId||!!top.rockId&&this.sameSupport(top.rockId,ledge.wall.rockId,world));
      if(!supported||input.jumpPressed||input.vertical<0){
        this.mode='airborne';this.ledge=null;this.supportRockId=null;this.velocityY=0;
        this.airVelocityX=this.climbNormal.x*2;this.airVelocityZ=this.climbNormal.z*2;
        this.climbDetachRemaining=.4;return true;
      }
      if(input.vertical<=0)ledge.armed=true;
      if(input.vertical>0&&ledge.armed&&world.headroom(p.x,p.y+.05,p.z,TRAVERSAL.playerHeight+ledge.target.y-p.y)&&
        world.headroom(ledge.target.x,ledge.target.y+.05,ledge.target.z,TRAVERSAL.playerHeight-.1,top.rockId)&&
        world.canMove(ledge.target.x,ledge.target.z,p.x,p.z,ledge.target.y+.05)){
        this.mode='mantling';this.mantle={from:{...p},to:ledge.target,elapsed:0,duration:.95,ledge:true};
        this.ledge=null;return true;
      }
      return false;
    }
    if(this.mode==='mantling'){
      const mantle=this.mantle!;
      mantle.elapsed=Math.min(mantle.duration,mantle.elapsed+dt);
      const t=mantle.elapsed/mantle.duration;
      const eased=t*t*(3-2*t);
      // Lift clear of the vertical face before bringing the capsule over the lip.
      const lift=mantle.ledge?Math.min(1,t/.65):t,over=mantle.ledge?Math.max(0,(t-.6)/.4):t;
      const horizontal=mantle.ledge?over*over*(3-2*over):eased;
      p.x=mantle.from.x+(mantle.to.x-mantle.from.x)*horizontal;
      p.y=mantle.from.y+(mantle.to.y-mantle.from.y)*lift*lift*(3-2*lift);
      p.z=mantle.from.z+(mantle.to.z-mantle.from.z)*horizontal;
      if(t>=1){
        this.mode='grounded';this.mantle=null;this.velocityY=0;
        if(this.supportRockId==='terrain:mainland')this.supportRockId=null;
      }
      return true;
    }
    if(this.mode==='climbing'){
      if(input.jumpPressed){
        this.mode='airborne';this.velocityY=TRAVERSAL.initialJumpSpeed*.48;
        this.jumpsUsed=1;
        this.airVelocityX=this.climbNormal.x*5;
        this.airVelocityZ=this.climbNormal.z*5;
        this.airTargetSpeed=11;
        p.x+=this.climbNormal.x*.18;p.z+=this.climbNormal.z*.18;
        this.climbRockId=null;this.lastClimbWall=null;this.supportRockId=null;
        this.climbDetachRemaining=.4;
        return true;
      }
      const wall=this.findClimbWall(world);
      if(!wall||!this.sameSupport(wall.rockId,this.climbRockId,world)){
        // A rounded mountain shoulder becomes walkable gradually, without a
        // sharp ledge to mantle. Settle onto it instead of dropping/regrabbing.
        const floor=this.lastClimbWall?.terrain
          ?world.ground(p.x,p.z,p.y+.5,1.7,TRAVERSAL.playerRadius*.55):null;
        if(floor&&slopeAllowed(floor.normalY)&&
          world.headroom(p.x,floor.height+.05,p.z,TRAVERSAL.playerHeight-.1)){
          p.y=floor.height;this.mode='grounded';this.velocityY=0;
          this.climbRockId=null;this.lastClimbWall=null;this.supportRockId=floor.rockId??null;
          return true;
        }
        if(this.lastClimbWall&&this.tryMantle(this.lastClimbWall,world,input))return true;
        this.mode='airborne';this.velocityY=0;this.climbRockId=null;
        this.lastClimbWall=null;this.supportRockId=null;
        this.climbDetachRemaining=.15;
        return false;
      }
      this.lastClimbWall=wall;
      const normalLength=Math.hypot(wall.normalX,wall.normalZ)||1;
      this.climbNormal={x:wall.normalX/normalLength,z:wall.normalZ/normalLength};
      this.climbRockId=wall.rockId;
      const standOff=Math.max(TRAVERSAL.playerRadius+.2,wall.terrain
        ?(this.climbProbeHeight+.15)*Math.max(0,wall.normalY)/normalLength:0);
      const desiredX=wall.pointX+this.climbNormal.x*standOff;
      const desiredZ=wall.pointZ+this.climbNormal.z*standOff;
      const correctionX=desiredX-p.x,correctionZ=desiredZ-p.z;
      const correction=Math.hypot(correctionX,correctionZ);
      if(correction>1e-5){
        const fraction=Math.min(1,7*dt/correction);
        p.x+=correctionX*fraction;p.z+=correctionZ*fraction;
      }
      this.mantleProbeCooldown=Math.max(0,this.mantleProbeCooldown-dt);
      if(input.vertical>0&&this.mantleProbeCooldown===0){
        this.mantleProbeCooldown=.12;
        if(this.tryMantle(wall,world,input))return true;
      }
      const climbDelta=input.vertical*TRAVERSAL.climbUpSpeed*dt;
      if(climbDelta>0&&world.headroom(p.x,p.y+TRAVERSAL.playerHeight-.1,p.z,
        climbDelta+.1,this.climbRockId))
        p.y+=climbDelta;
      else if(climbDelta<0){
        p.y=Math.max(world.fallbackHeight(p.x,p.z),p.y+climbDelta);
        if(p.y<=world.fallbackHeight(p.x,p.z)+.01){
          this.mode='grounded';this.climbRockId=null;this.lastClimbWall=null;this.supportRockId=null;
          return true;
        }
      }
      const tangent={x:this.climbNormal.z,z:-this.climbNormal.x};
      const right={x:input.forwardZ,z:-input.forwardX};
      const sign=tangent.x*right.x+tangent.z*right.z>=0?1:-1;
      const side=input.horizontal*sign*TRAVERSAL.climbSideSpeed*dt;
      if(Math.abs(side)>1e-7){
        const nextX=p.x+tangent.x*side,nextZ=p.z+tangent.z*side;
        const sideWall=world.wall(nextX,p.y+1.1,nextZ,-wall.normalX,-wall.normalZ,
          TRAVERSAL.climbReach+TRAVERSAL.playerRadius+.45);
        if(sideWall&&canBeginClimb(sideWall.normalY,sideWall.climbable,true,sideWall.terrain)&&
          this.sameSupport(sideWall.rockId,this.climbRockId,world)&&
          world.canMove(nextX,nextZ,p.x,p.z,p.y)){
          p.x=nextX;p.z=nextZ;
          this.climbRockId=sideWall.rockId;
        }
      }
      this.supportRockId=this.climbRockId;
      return climbDelta!==0||side!==0;
    }

    if(this.mode==='grounded'&&input.jumpPressed&&!this.actionMotion){
      this.mode='airborne';
      this.velocityY=input.sprint?TRAVERSAL.sprintJumpSpeed:
        input.run?TRAVERSAL.runningJumpSpeed:TRAVERSAL.initialJumpSpeed;
      this.jumpsUsed=1;this.supportRockId=null;
      this.airTargetSpeed=input.sprint?27:input.run?20:11;
      this.airVelocityX=input.moveX*this.airTargetSpeed;
      this.airVelocityZ=input.moveZ*this.airTargetSpeed;
    }else if(this.mode==='airborne'&&(input.jumpPressed||input.airKickPressed)&&this.jumpsUsed===1){
      this.velocityY=input.airKickPressed?TRAVERSAL.airKickJumpSpeed:TRAVERSAL.doubleJumpSpeed;
      this.jumpsUsed=2;this.supportRockId=null;
      this.verticalAirKick=input.airKickPressed===true;
      const directionLength=this.verticalAirKick?0:Math.hypot(input.moveX,input.moveZ);
      // A second jump without movement input rises in place. Directional input
      // locks in the dash vector for its brief opening impulse.
      this.airVelocityX=directionLength>1e-5
        ?input.moveX/directionLength*TRAVERSAL.doubleJumpDashSpeed:0;
      this.airVelocityZ=directionLength>1e-5
        ?input.moveZ/directionLength*TRAVERSAL.doubleJumpDashSpeed:0;
      // Q spends the same second jump, but holds the kick in place instead of dashing.
      this.airDashRemaining=this.verticalAirKick?TRAVERSAL.airKickSeconds:
        directionLength>1e-5?TRAVERSAL.doubleJumpDashSeconds:0;
    }
    if(this.mode==='airborne'&&this.climbDetachRemaining===0&&!this.airKickActive&&
      this.tryCatchLedge(world,input))return true;
    if(input.vertical>0&&this.climbDetachRemaining===0&&!this.actionMotion&&
      !input.jumpPressed&&!input.airKickPressed&&!this.airKickActive){
      const forwardLength=Math.hypot(input.forwardX,input.forwardZ);
      if(forwardLength>0){
        let wall:TraversalWall|null=null;
        for(const probe of [1.15,1.8,2.5,3.2]){
          const hit=world.wall(p.x,p.y+probe,p.z,input.forwardX,input.forwardZ,
            TRAVERSAL.climbReach+TRAVERSAL.playerRadius+.4);
          if(hit&&!(this.mode==='airborne'&&Math.abs(hit.normalY)<=(hit.terrain?.25:.4))&&
            !(hit.terrain&&slopeAllowed(hit.normalY,input.sprint))&&
            canBeginClimb(hit.normalY,hit.climbable,
            hit.distance<=TRAVERSAL.climbReach+TRAVERSAL.playerRadius+.4,hit.terrain)){
            wall=hit;this.climbProbeHeight=probe;break;
          }
        }
        if(wall){
          this.mode='climbing';this.climbRockId=wall.rockId;
          this.lastClimbWall=wall;
          const length=Math.hypot(wall.normalX,wall.normalZ)||1;
          this.climbNormal={x:wall.normalX/length,z:wall.normalZ/length};
          this.supportRockId=wall.rockId;this.velocityY=0;
          this.mantleProbeCooldown=.12;
          return false;
        }
      }
    }

    let dx:number,dz:number;
    if(this.mode==='grounded'&&this.actionMotion){
      const action=this.actionMotion;
      const progress=Math.min(1,(action.elapsed+dt*.5)/
        (action.duration*action.movementFraction));
      const speed=action.kind==='roll'
        ?action.initialSpeed*(1-.4*progress)
        :action.initialSpeed*(1-progress)**2;
      dx=action.directionX*speed*dt;dz=action.directionZ*speed*dt;
      action.elapsed=Math.min(action.duration,action.elapsed+dt);
    }else if(this.mode==='airborne'){
      if(this.airDashRemaining>0)this.airDashRemaining=Math.max(0,this.airDashRemaining-dt);
      else if(Math.hypot(input.moveX,input.moveZ)>1e-5){
        const blend=Math.min(1,dt*4);
        this.airVelocityX+=(input.moveX*this.airTargetSpeed-this.airVelocityX)*blend;
        this.airVelocityZ+=(input.moveZ*this.airTargetSpeed-this.airVelocityZ)*blend;
      }else{
        const drag=Math.max(0,1-dt*1.2);
        this.airVelocityX*=drag;this.airVelocityZ*=drag;
      }
      dx=this.airVelocityX*dt;dz=this.airVelocityZ*dt;
    }else{
      const speed=input.sprint?27:input.run?19:11;
      if(Math.hypot(this.rollCarryX,this.rollCarryZ)>.05){
        if(Math.hypot(input.moveX,input.moveZ)>1e-5){
          const blend=Math.min(1,dt*12);
          this.rollCarryX+=(input.moveX*speed-this.rollCarryX)*blend;
          this.rollCarryZ+=(input.moveZ*speed-this.rollCarryZ)*blend;
        }else{
          const drag=Math.max(0,1-dt*5);
          this.rollCarryX*=drag;this.rollCarryZ*=drag;
        }
        dx=this.rollCarryX*dt;dz=this.rollCarryZ*dt;
      }else{
        this.rollCarryX=0;this.rollCarryZ=0;
        dx=input.moveX*speed*dt;dz=input.moveZ*speed*dt;
      }
    }
    let moved=false;
    if(Math.hypot(dx,dz)>1e-7){
      // Keep surface speed consistent on continuous slopes. A fixed 40 cm step
      // cap otherwise rejects a sprint solely because it travels farther per frame.
      if(this.mode==='grounded'&&!this.supportRockId){
        const distance=Math.hypot(dx,dz);
        const rise=world.fallbackHeight(p.x+dx,p.z+dz)-world.fallbackHeight(p.x,p.z);
        const grade=rise/distance;
        if(grade>0&&slopeAllowed(1/Math.hypot(1,grade),input.sprint)){
          const scale=1/Math.hypot(1,grade);dx*=scale;dz*=scale;
        }
      }
      const nextX=p.x+dx,nextZ=p.z+dz;
      const distance=Math.hypot(dx,dz);
      const slopeLimit=input.sprint?TRAVERSAL.maxSprintSlopeDeg:TRAVERSAL.maxWalkSlopeDeg;
      const groundRise=Math.max(stepHeight,distance*Math.tan(slopeLimit*Math.PI/180));
      let blockingWall:TraversalWall|null=null;
      // A calibrated stair riser is tested by the ground probe; the wall probe
      // must start above that riser or it prevents reaching the first tread.
      const lowProbe=this.mode==='grounded'&&stepHeight>TRAVERSAL.stepHeight?stepHeight+.05:.35;
      for(const h of [lowProbe,1.8,TRAVERSAL.playerHeight-.3]){
        const wall=world.wall(p.x,p.y+h,p.z,dx,dz,distance+TRAVERSAL.playerRadius);
        if(wall&&wall.distance<=distance+TRAVERSAL.playerRadius&&
          !(wall.terrain&&this.mode==='grounded'&&slopeAllowed(wall.normalY,input.sprint))){
          blockingWall=wall;break;
        }
      }
      if(blockingWall&&blockingWall.terrain&&Math.abs(blockingWall.normalY)>.25&&this.mode==='airborne'&&this.velocityY>=0&&
        this.tryMantle(blockingWall,world,input))return true;
      const risingTerrain=world.fallbackHeight(nextX,nextZ)>
        p.y+(this.mode==='grounded'?groundRise:stepHeight)+.001;
      if(!blockingWall&&!risingTerrain&&world.canMove(nextX,nextZ,p.x,p.z,p.y)){
        if(this.mode==='grounded'){
          const floor=world.ground(nextX,nextZ,p.y+groundRise+.05,
            groundRise+TRAVERSAL.groundSnap+.65,TRAVERSAL.playerRadius*.55);
          const allowedRise=floor?.rockId?stepHeight:groundRise;
          if(floor&&slopeAllowed(floor.normalY,input.sprint)&&floor.height<=p.y+allowedRise+.001&&
            floor.height>=p.y-TRAVERSAL.groundSnap-.2){
            if(world.headroom(nextX,floor.height+.05,nextZ,TRAVERSAL.playerHeight-.1,
              floor.rockId??this.supportRockId??undefined)){
              p.x=nextX;p.z=nextZ;p.y=floor.height;this.supportRockId=floor.rockId??null;
              moved=true;
            }
          }else if(!floor||slopeAllowed(floor.normalY,input.sprint)||floor.height<p.y-.01){
            // A rising facet is a wall. A level or lower facet is a ledge:
            // leave the support and let gravity find the next surface.
            const shell=this.supportRockId?world.solidTop(nextX,nextZ,
              p.y+TRAVERSAL.playerHeight,TRAVERSAL.playerHeight+1,this.supportRockId):null;
            if(!shell||shell.height<=p.y+.05){
              p.x=nextX;p.z=nextZ;this.mode='airborne';this.velocityY=0;
              this.airVelocityX=input.moveX*3.5;this.airVelocityZ=input.moveZ*3.5;
              this.airTargetSpeed=11;
              moved=true;
            }
          }
        }else{p.x=nextX;p.z=nextZ;moved=true;}
      }
    }
    if(this.mode==='grounded'&&!this.actionMotion&&!this.supportRockId&&
      Math.hypot(input.moveX,input.moveZ)<1e-5){
      const floor=world.ground(p.x,p.z,p.y+.1,TRAVERSAL.groundSnap+.2,TRAVERSAL.playerRadius*.55);
      if(!floor||!floor.rockId&&!slopeAllowed(floor.normalY)){
        this.mode='airborne';this.velocityY=0;
      }
    }
    if(this.mode==='airborne'){
      const oldY=p.y;
      const integrated=integrateAirborneVertical(this.velocityY,dt);
      this.velocityY=integrated.velocityY;
      let nextY=oldY+integrated.deltaY;
      // Sweep the rising capsule, including the extra air-jump impulse, so a
      // thin roof cannot be crossed between substeps. Stop at the last clear height.
      const clearRise=(rise:number)=>world.headroom(p.x,oldY+.05,p.z,TRAVERSAL.playerHeight+rise-.05);
      if(integrated.deltaY>0&&!clearRise(integrated.deltaY)){
        let clear=0,blocked=integrated.deltaY;
        for(let i=0;i<8;i++){
          const middle=(clear+blocked)/2;
          if(clearRise(middle))clear=middle;else blocked=middle;
        }
        nextY=oldY+clear;this.velocityY=0;
      }
      const terrainY=world.fallbackHeight(p.x,p.z);
      if(oldY<terrainY-.1){
        p.y=terrainY;this.mode='grounded';this.velocityY=0;this.supportRockId=null;
        return true;
      }
      if(this.velocityY<=0){
        const descent=Math.max(.1,oldY-nextY+TRAVERSAL.groundSnap+.12);
        const floor=world.ground(p.x,p.z,oldY+.06,descent,TRAVERSAL.playerRadius*.55);
        const shell=world.solidTop(p.x,p.z,oldY+.06,descent);
        if(shell&&shell.height>=terrainY-.05&&
          shell.height>=nextY-.03&&shell.height<=oldY+.06&&
          (!floor||floor.height<shell.height-.1)){
          p.y=shell.height+.035;this.velocityY=0;this.supportRockId=shell.rockId;
          const outwardX=p.x-shell.centerX,outwardZ=p.z-shell.centerZ;
          const length=Math.hypot(outwardX,outwardZ);
          if(length>1e-5){
            const slideX=p.x+outwardX/length*2.5*dt;
            const slideZ=p.z+outwardZ/length*2.5*dt;
            if(world.canMove(slideX,slideZ,p.x,p.z,p.y)){p.x=slideX;p.z=slideZ;}
          }
          return true;
        }
        if(floor&&!slopeAllowed(floor.normalY,input.sprint)&&floor.height>=nextY-TRAVERSAL.groundSnap){
          const d=.5;
          // A bevel on masonry is still solid. Sliding against the terrain
          // below it would teleport the feet inside the supporting structure.
          const slideHeight=(x:number,z:number)=>floor.rockId?
            world.ground(x,z,floor.height+1,Math.max(2,floor.height-world.fallbackHeight(x,z)+1.05),0)?.height??
              world.fallbackHeight(x,z):world.fallbackHeight(x,z);
          const gx=slideHeight(p.x+d,p.z)-slideHeight(p.x-d,p.z);
          const gz=slideHeight(p.x,p.z+d)-slideHeight(p.x,p.z-d);
          const length=Math.hypot(gx,gz);
          if(length>1e-5){
            const slideX=p.x-gx/length*4*dt,slideZ=p.z-gz/length*4*dt;
            if(world.canMove(slideX,slideZ,p.x,p.z,p.y)){
              p.x=slideX;p.z=slideZ;
              this.slideHeading={x:-gx/length,z:-gz/length,grade:length/(2*d)};
            }
          }
          p.y=(floor.rockId?floor.height:world.fallbackHeight(p.x,p.z))+.02;this.velocityY=0;
          return true;
        }
        if(floor&&slopeAllowed(floor.normalY,input.sprint)&&floor.height<=oldY+.06&&
          floor.height>=nextY-TRAVERSAL.groundSnap){
          p.y=floor.height;this.mode='grounded';this.velocityY=0;
          this.supportRockId=floor.rockId??null;
          return moved;
        }
      }
      p.y=nextY;
      if(p.y<terrainY-.1){
        p.y=terrainY;this.mode='grounded';this.velocityY=0;this.supportRockId=null;
        return true;
      }
      if(!world.solidTop(p.x,p.z,p.y+TRAVERSAL.playerHeight,
        TRAVERSAL.playerHeight+.2,this.supportRockId??undefined))this.supportRockId=null;
      if(p.y<world.fallbackHeight(p.x,p.z)-TRAVERSAL.maxFallResetHeight)
        this.teleport(p.x,world.fallbackHeight(p.x,p.z),p.z);
    }
    return moved;
  }

  private swimStep(dt:number,input:TraversalInput,world:TraversalWorld,water:number|null):boolean{
    const p=this.position,oldX=p.x,oldY=p.y,oldZ=p.z;
    if(water===null){
      this.mode='airborne';this.velocityY=Math.min(0,this.swimTravel.y);
      this.airVelocityX=this.swimVelocityX;this.airVelocityZ=this.swimVelocityZ;
      this.swimVelocityX=0;this.swimVelocityZ=0;this.swimFlowX=0;this.swimFlowZ=0;
      this.swimDepthTarget=null;return false;
    }
    // Four local water samples per frame, shared by physics substeps. A sloping
    // lakebed does not create a current in a level lake; missing shore samples
    // use a one-sided derivative instead of inventing a drop to zero.
    if(!this.swimSlopeSampled){
      const r=1.25;
      const left=world.waterLevel?.(p.x-r,p.z)??null,right=world.waterLevel?.(p.x+r,p.z)??null;
      const back=world.waterLevel?.(p.x,p.z-r)??null,front=world.waterLevel?.(p.x,p.z+r)??null;
      this.swimSlopeX=left!==null&&right!==null?(right-left)/(2*r):
        right!==null?(right-water)/r:left!==null?(water-left)/r:0;
      this.swimSlopeZ=back!==null&&front!==null?(front-back)/(2*r):
        front!==null?(front-water)/r:back!==null?(water-back)/r:0;
      this.swimSlopeSampled=true;
    }
    const gx=this.swimSlopeX,gz=this.swimSlopeZ;
    const speed=input.run?8:5.5,blend=1-Math.exp(-dt*5);
    const inputLength=Math.hypot(input.moveX,input.moveZ);
    const inputGrade=inputLength>1e-5?(gx*input.moveX+gz*input.moveZ)/inputLength:0;
    const strokeSpeed=speed/Math.sqrt(1+inputGrade*inputGrade);
    let strokeX=this.swimVelocityX-this.swimFlowX,strokeZ=this.swimVelocityZ-this.swimFlowZ;
    strokeX+=(input.moveX*strokeSpeed-strokeX)*blend;
    strokeZ+=(input.moveZ*strokeSpeed-strokeZ)*blend;
    // Gravity projected onto the water surface, with water drag. Integrating
    // drag exponentially keeps the same acceleration at different frame rates.
    const drag=1.25,flowBlend=1-Math.exp(-dt*drag);
    const gravity=TRAVERSAL.gravity/(1+gx*gx+gz*gz);
    this.swimFlowX+=(-gravity*gx/drag-this.swimFlowX)*flowBlend;
    this.swimFlowZ+=(-gravity*gz/drag-this.swimFlowZ)*flowBlend;
    const flowSpeed=Math.hypot(this.swimFlowX,this.swimFlowZ,
      gx*this.swimFlowX+gz*this.swimFlowZ);
    if(flowSpeed>18){this.swimFlowX*=18/flowSpeed;this.swimFlowZ*=18/flowSpeed;}
    this.swimVelocityX=strokeX+this.swimFlowX;
    this.swimVelocityZ=strokeZ+this.swimFlowZ;
    // Swimming uses the same solid shells as walking. Remove only the inward
    // velocity so the swimmer can still slide along a submerged rock face.
    for(let pass=0;pass<2;pass++){
      const length=Math.hypot(this.swimVelocityX,this.swimVelocityZ);
      if(length<.001)break;
      const dx=this.swimVelocityX/length,dz=this.swimVelocityZ/length;
      let nearest:TraversalWall|null=null;
      for(const h of [.35,1.15,1.8])for(const side of [-1,0,1]){
        const offset=side*TRAVERSAL.playerRadius;
        const reach=length*dt+.08+(side===0?TRAVERSAL.playerRadius:0);
        const hit=world.wall(p.x-dz*offset,p.y+h,p.z+dx*offset,dx,dz,reach);
        if(hit&&(!nearest||hit.distance<nearest.distance))nearest=hit;
      }
      if(!nearest)break;
      const n=Math.hypot(nearest.normalX,nearest.normalZ);
      if(pass===1||n<1e-5){
        this.swimVelocityX=0;this.swimVelocityZ=0;this.swimFlowX=0;this.swimFlowZ=0;break;
      }
      const nx=nearest.normalX/n,nz=nearest.normalZ/n;
      const inward=Math.min(0,this.swimVelocityX*nx+this.swimVelocityZ*nz);
      this.swimVelocityX-=nx*inward;this.swimVelocityZ-=nz*inward;
      const flowInward=Math.min(0,this.swimFlowX*nx+this.swimFlowZ*nz);
      this.swimFlowX-=nx*flowInward;this.swimFlowZ-=nz*flowInward;
    }
    const x=p.x+this.swimVelocityX*dt,z=p.z+this.swimVelocityZ*dt;
    const bed=world.fallbackHeight(x,z);
    if(world.canMove(x,z,p.x,p.z,p.y)&&bed<p.y+1.2){p.x=x;p.z=z;}
    else{this.swimVelocityX=0;this.swimVelocityZ=0;this.swimFlowX=0;this.swimFlowZ=0;}
    const nextWater=world.waterLevel?.(p.x,p.z)??water;
    // A distinct Space press toggles dive / resurface. Releasing it holds the
    // chosen depth; the controller owns the transition, not keyboard repeats.
    if(input.jumpPressed)this.swimDepthTarget=this.swimDepthTarget===null?8:null;
    const vertical=input.swimVertical??0;
    const target=this.swimDepthTarget===null?nextWater-1.65:nextWater-this.swimDepthTarget;
    // Carry the selected depth down the river with the surface. Buoyancy and
    // diving remain relative to that moving level, including underwater travel.
    const carriedY=p.y+nextWater-water;
    const verticalSpeed=vertical!==0?vertical*4:Math.max(-4,Math.min(4,(target-carriedY)*3));
    let nextY=Math.max(world.fallbackHeight(p.x,p.z)+.3,
      Math.min(nextWater-1.65,carriedY+verticalSpeed*dt));
    if(nextY>p.y&&!world.headroom(p.x,p.y+.2,p.z,1.6+nextY-p.y))nextY=p.y;
    if(nextY<p.y){
      const floor=world.solidTop(p.x,p.z,p.y+.1,p.y-nextY+.4);
      if(floor)nextY=Math.max(nextY,Math.min(p.y,floor.height+.3));
    }
    p.y=nextY;
    if(vertical!==0)this.swimDepthTarget=p.y>=nextWater-1.66?null:nextWater-p.y;
    if(nextWater-world.fallbackHeight(p.x,p.z)<1.8){
      p.y=world.fallbackHeight(p.x,p.z);this.mode='grounded';
      this.swimVelocityX=0;this.swimVelocityZ=0;
      this.swimFlowX=0;this.swimFlowZ=0;
      this.swimDepthTarget=null;
    }
    return Math.hypot(p.x-oldX,p.y-oldY,p.z-oldZ)>.001;
  }

  /** Catch a real flat lip at hand height, including walls that are not marked
   * climbable. No continuous wall climb is enabled by this edge-only query. */
  private tryCatchLedge(world:TraversalWorld,input:TraversalInput):boolean{
    const p=this.position,dx=input.moveX||input.moveZ?input.moveX:input.forwardX,
      dz=input.moveX||input.moveZ?input.moveZ:input.forwardZ,length=Math.hypot(dx,dz);
    if(length<1e-5)return false;
    const handY=p.y+TRAVERSAL.ledgeHandHeight,tolerance=TRAVERSAL.ledgeCatchTolerance;
    const wall=world.wall(p.x,handY-tolerance,p.z,dx/length,dz/length,TRAVERSAL.playerRadius+.65);
    if(!wall||Math.abs(wall.normalY)>.4)return false;
    const n=Math.hypot(wall.normalX,wall.normalZ);if(n<.5)return false;
    const sign=wall.normalX*dx+wall.normalZ*dz>0?-1:1,nx=wall.normalX/n*sign,nz=wall.normalZ/n*sign;
    const depth=TRAVERSAL.playerRadius+.45,x=wall.pointX-nx*depth,z=wall.pointZ-nz*depth;
    const top=world.ground(x,z,handY+tolerance,2*tolerance,TRAVERSAL.playerRadius*.45);
    if(!top||top.normalY<.96||Math.abs(top.height-handY)>tolerance||
      !(wall.terrain&&!top.rockId||!!top.rockId&&this.sameSupport(top.rockId,wall.rockId,world)))return false;
    // Both hands and the landing must have a broad, level top, not a rounded
    // shoulder or a narrow post. A ray above the edge must be unobstructed.
    for(const side of [-.5,.5]){
      const hand=world.ground(wall.pointX-nx*.35-nz*side,wall.pointZ-nz*.35+nx*side,top.height+.2,.4,0);
      if(!hand||hand.normalY<.96||Math.abs(hand.height-top.height)>.12||
        !(wall.terrain&&!hand.rockId||!!hand.rockId&&this.sameSupport(hand.rockId,wall.rockId,world)))return false;
    }
    if(world.wall(p.x,top.height+.15,p.z,-nx,-nz,wall.distance+.3))return false;
    // The side ray strikes below the lip. On tapered rock that point is further
    // out than the actual edge: locate the last supported top triangle before
    // fixing the hands, rather than hanging from an imaginary vertical plane.
    let outside=-.65,inside=depth,lipY=top.height;
    for(let i=0;i<10;i++){
      const inset=(outside+inside)/2;
      const lip=world.ground(wall.pointX-nx*inset,wall.pointZ-nz*inset,top.height+.2,.45,0);
      if(lip&&lip.normalY>=.96&&(wall.terrain&&!lip.rockId||!!lip.rockId&&this.sameSupport(lip.rockId,wall.rockId,world))){inside=inset;lipY=lip.height;}
      else outside=inset;
    }
    const edgeX=wall.pointX-nx*inside,edgeZ=wall.pointZ-nz*inside;
    const hang={x:edgeX+nx*(TRAVERSAL.playerRadius+.18),y:lipY-TRAVERSAL.ledgeHandHeight,
      z:edgeZ+nz*(TRAVERSAL.playerRadius+.18)};
    if(hang.y<world.fallbackHeight(hang.x,hang.z)+.15||
      !world.headroom(hang.x,hang.y+.05,hang.z,TRAVERSAL.playerHeight-.1)||
      !world.headroom(x,top.height+.05,z,TRAVERSAL.playerHeight-.1,top.rockId))return false;
    this.mode='hanging';Object.assign(p,hang);this.climbNormal={x:nx,z:nz};
    this.ledge={wall:{...wall,normalX:nx,normalY:0,normalZ:nz,pointX:edgeX,pointY:lipY,pointZ:edgeZ},target:{x,y:top.height,z},armed:input.vertical<=0};
    this.supportRockId=top.rockId??wall.rockId;this.velocityY=0;
    this.airVelocityX=0;this.airVelocityZ=0;this.airDashRemaining=0;this.verticalAirKick=false;
    this.climbRockId=null;this.lastClimbWall=null;return true;
  }

  private findClimbWall(world:TraversalWorld):TraversalWall|null{
    const p=this.position,normal=this.climbNormal;
    const probes=[this.climbProbeHeight,1.15,1.8,2.5,3.2];
    for(const height of probes){
      for(const outside of [0,1.5,3]){
        const wall=world.wall(p.x+normal.x*outside,p.y+height,p.z+normal.z*outside,
          -normal.x,-normal.z,TRAVERSAL.climbReach+TRAVERSAL.playerRadius+outside+.55);
        if(!wall||!wall.climbable||!this.sameSupport(wall.rockId,this.climbRockId,world)||
          !(canBeginClimb(wall.normalY,wall.climbable,true,wall.terrain)||
            wall.terrain&&wall.normalY<=Math.cos((TRAVERSAL.maxWalkSlopeDeg-2)*Math.PI/180)))continue;
        this.climbProbeHeight=height;
        return wall;
      }
    }
    return null;
  }

  private tryMantle(wall:TraversalWall,world:TraversalWorld,input:TraversalInput):boolean{
    const p=this.position;
    const normalLength=Math.hypot(wall.normalX,wall.normalZ);
    if(normalLength<1e-5)return false;
    let target:TraversalPosition|null=null;
    // Sculpted cliff pieces can expose an inward-facing facet. Use the player's
    // forward direction to keep the mantle aimed into the formation.
    const facing=this.mode==='climbing'?1:
      wall.normalX*input.forwardX+wall.normalZ*input.forwardZ>0?-1:1;
    const nx=wall.normalX/normalLength*facing,nz=wall.normalZ/normalLength*facing;
    const tangentX=-nz,tangentZ=nx;
    const depths=[TRAVERSAL.playerRadius+.35,TRAVERSAL.playerRadius+.8,
      TRAVERSAL.playerRadius+1.25,3];
    // A rounded terrain crest has no overhang to clear. Looking a full capsule
    // behind the ray hit can skip the reachable start of its walkable shoulder.
    if(wall.terrain)depths.unshift(.15,.35);
    for(const depth of depths){
      for(const side of [0,-TRAVERSAL.playerRadius*.55,TRAVERSAL.playerRadius*.55]){
        const x=wall.pointX-nx*depth+tangentX*side;
        const z=wall.pointZ-nz*depth+tangentZ*side;
        const top=world.ground(x,z,p.y+TRAVERSAL.mantleMaxHeight+.2,
          TRAVERSAL.mantleMaxHeight+.4,TRAVERSAL.playerRadius*.45);
        if(!top||!slopeAllowed(top.normalY)||
          !(wall.terrain&&!top.rockId||top.rockId&&this.sameSupport(top.rockId,wall.rockId,world))||
          !canMantleRise(top.height-p.y,world.headroom(x,top.height+.05,z,
            TRAVERSAL.playerHeight-.1,top.rockId))||
          !world.canMove(x,z,p.x,p.z,p.y))continue;
        const inwardRise=.7*Math.tan(TRAVERSAL.maxWalkSlopeDeg*Math.PI/180)+.05;
        const inward=world.ground(x-nx*.7,z-nz*.7,top.height+inwardRise,inwardRise+.6,
          TRAVERSAL.playerRadius*.45);
        if(!inward||inward.height<top.height-.5||
          inward.rockId&&!this.sameSupport(inward.rockId,top.rockId??null,world))continue;
        target={x,y:top.height,z};break;
      }
      if(target)break;
    }
    if(!target)return false;
    const distance=Math.hypot(target.x-p.x,target.z-p.z);
    this.mode='mantling';this.mantle={from:{...p},to:target,elapsed:0,
      duration:Math.max(.65,Math.min(1.1,distance/6))};
    this.supportRockId=wall.rockId;this.climbRockId=null;this.lastClimbWall=null;this.velocityY=0;
    return true;
  }
}
