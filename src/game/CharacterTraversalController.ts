import { TRAVERSAL, canBeginClimb, canMantleRise, integrateAirborneVertical, slopeAllowed,
  type GroundHit, type LocomotionMode } from './traversalRules';

export type TraversalPosition={x:number;y:number;z:number};
export type TraversalWall={
  pointX:number;pointY:number;pointZ:number;distance:number;
  normalX:number;normalY:number;normalZ:number;rockId:string;climbable:boolean;
};
export type TraversalSolid={
  height:number;normalX:number;normalZ:number;rockId:string;centerX:number;centerZ:number;
};
export type TraversalWorld={
  ground:(x:number,z:number,originY:number,maxDistance:number,footRadius:number)=>GroundHit|null;
  solidTop:(x:number,z:number,originY:number,maxDistance:number,rockId?:string)=>TraversalSolid|null;
  wall:(x:number,y:number,z:number,dirX:number,dirZ:number,maxDistance:number)=>TraversalWall|null;
  headroom:(x:number,y:number,z:number,height:number,ignoreRockId?:string)=>boolean;
  sameSupport?:(a:string,b:string)=>boolean;
  canMove:(nextX:number,nextZ:number,fromX:number,fromZ:number,feetY:number)=>boolean;
  fallbackHeight:(x:number,z:number)=>number;
};
export type TraversalInput={
  moveX:number;moveZ:number;forwardX:number;forwardZ:number;
  horizontal:number;vertical:number;run:boolean;jumpPressed:boolean;
};

/** A small kinematic capsule controller. All positions are feet in local-zone meters. */
export class CharacterTraversalController {
  readonly position:TraversalPosition={x:0,y:0,z:0};
  mode:LocomotionMode='grounded';
  supportRockId:string|null=null;
  private velocityY=0;
  private climbRockId:string|null=null;
  private climbNormal={x:0,z:0};
  private climbProbeHeight=1.15;
  private lastClimbWall:TraversalWall|null=null;
  private mantle:{from:TraversalPosition;to:TraversalPosition;elapsed:number;duration:number}|null=null;

  private sameSupport(a:string,b:string|null,world:TraversalWorld):boolean{
    return b!==null&&(a===b||world.sameSupport?.(a,b)===true);
  }

  teleport(x:number,y:number,z:number):void{
    Object.assign(this.position,{x,y,z});
    this.mode='grounded';this.velocityY=0;this.supportRockId=null;
    this.climbRockId=null;this.lastClimbWall=null;this.mantle=null;
  }

  get canInteract():boolean{return this.mode!=='climbing'&&this.mode!=='mantling';}
  get canBuild():boolean{return this.mode==='grounded';}

  step(dt:number,input:TraversalInput,world:TraversalWorld):boolean{
    const count=Math.max(1,Math.ceil(Math.min(dt,.1)/.025));
    const subDt=Math.min(dt,.1)/count;
    let moved=false;
    for(let i=0;i<count;i++)moved=this.substep(subDt,{...input,jumpPressed:i===0&&input.jumpPressed},world)||moved;
    return moved;
  }

  private substep(dt:number,input:TraversalInput,world:TraversalWorld):boolean{
    const p=this.position;
    if(this.mode==='mantling'){
      const mantle=this.mantle!;
      mantle.elapsed=Math.min(mantle.duration,mantle.elapsed+dt);
      const t=mantle.elapsed/mantle.duration;
      const eased=t*t*(3-2*t);
      p.x=mantle.from.x+(mantle.to.x-mantle.from.x)*eased;
      p.y=mantle.from.y+(mantle.to.y-mantle.from.y)*eased;
      p.z=mantle.from.z+(mantle.to.z-mantle.from.z)*eased;
      if(t>=1){this.mode='grounded';this.mantle=null;this.velocityY=0;}
      return true;
    }
    if(this.mode==='climbing'){
      if(input.jumpPressed){
        this.mode='airborne';this.velocityY=TRAVERSAL.initialJumpSpeed*.48;
        p.x+=this.climbNormal.x*.18;p.z+=this.climbNormal.z*.18;
        this.climbRockId=null;this.lastClimbWall=null;this.supportRockId=null;
        return true;
      }
      const wall=this.findClimbWall(world);
      if(!wall||!this.sameSupport(wall.rockId,this.climbRockId,world)){
        if(this.lastClimbWall&&this.tryMantle(this.lastClimbWall,world))return true;
        this.mode='airborne';this.velocityY=0;this.climbRockId=null;
        this.lastClimbWall=null;this.supportRockId=null;
        return false;
      }
      this.lastClimbWall=wall;
      this.climbNormal={x:wall.normalX,z:wall.normalZ};
      this.climbRockId=wall.rockId;
      const desiredX=wall.pointX+wall.normalX*(TRAVERSAL.playerRadius+.2);
      const desiredZ=wall.pointZ+wall.normalZ*(TRAVERSAL.playerRadius+.2);
      const correctionX=desiredX-p.x,correctionZ=desiredZ-p.z;
      const correction=Math.hypot(correctionX,correctionZ);
      if(correction>1e-5){
        const fraction=Math.min(1,.14/correction);
        p.x+=correctionX*fraction;p.z+=correctionZ*fraction;
      }
      if(input.vertical>0&&this.tryMantle(wall,world))return true;
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
      const tangent={x:wall.normalZ,z:-wall.normalX};
      const right={x:input.forwardZ,z:-input.forwardX};
      const sign=tangent.x*right.x+tangent.z*right.z>=0?1:-1;
      const side=input.horizontal*sign*TRAVERSAL.climbSideSpeed*dt;
      const nextX=p.x+tangent.x*side,nextZ=p.z+tangent.z*side;
      const sideWall=world.wall(nextX,p.y+1.1,nextZ,-wall.normalX,-wall.normalZ,
        TRAVERSAL.climbReach+TRAVERSAL.playerRadius+.45);
      if(sideWall&&this.sameSupport(sideWall.rockId,this.climbRockId,world)&&
        world.canMove(nextX,nextZ,p.x,p.z,p.y)){
        p.x=nextX;p.z=nextZ;
        this.climbRockId=sideWall.rockId;
      }
      this.supportRockId=this.climbRockId;
      return climbDelta!==0||side!==0;
    }

    if(this.mode==='grounded'&&input.jumpPressed){
      this.mode='airborne';this.velocityY=TRAVERSAL.initialJumpSpeed;
      this.supportRockId=null;
    }
    if(input.vertical>0&&this.mode!=='airborne'){
      const forwardLength=Math.hypot(input.forwardX,input.forwardZ);
      if(forwardLength>0){
        let wall:TraversalWall|null=null;
        for(const probe of [1.15,1.8,2.5,3.2]){
          const hit=world.wall(p.x,p.y+probe,p.z,input.forwardX,input.forwardZ,
            TRAVERSAL.climbReach+TRAVERSAL.playerRadius+.4);
          if(hit&&canBeginClimb(hit.normalY,hit.climbable,
            hit.distance<=TRAVERSAL.climbReach+TRAVERSAL.playerRadius+.4)){
            wall=hit;this.climbProbeHeight=probe;break;
          }
        }
        if(wall){
          this.mode='climbing';this.climbRockId=wall.rockId;
          this.lastClimbWall=wall;
          this.climbNormal={x:wall.normalX,z:wall.normalZ};
          this.supportRockId=wall.rockId;this.velocityY=0;
          return false;
        }
      }
    }

    const speed=this.mode==='grounded'&&input.run?19:11;
    const dx=input.moveX*speed*dt,dz=input.moveZ*speed*dt;
    let moved=false;
    if(Math.hypot(dx,dz)>1e-7){
      const nextX=p.x+dx,nextZ=p.z+dz;
      const distance=Math.hypot(dx,dz);
      let blockingWall:TraversalWall|null=null;
      for(const h of [.35,1.8,TRAVERSAL.playerHeight-.3]){
        const wall=world.wall(p.x,p.y+h,p.z,dx,dz,distance+TRAVERSAL.playerRadius);
        if(wall&&wall.distance<=distance+TRAVERSAL.playerRadius){blockingWall=wall;break;}
      }
      if(blockingWall&&this.mode==='airborne'&&this.velocityY>=0&&
        this.tryMantle(blockingWall,world))return true;
      const risingTerrain=world.fallbackHeight(nextX,nextZ)>p.y+TRAVERSAL.stepHeight;
      if(!blockingWall&&!risingTerrain&&world.canMove(nextX,nextZ,p.x,p.z,p.y)){
        if(this.mode==='grounded'){
          const floor=world.ground(nextX,nextZ,p.y+TRAVERSAL.stepHeight+.05,
            TRAVERSAL.stepHeight+TRAVERSAL.groundSnap+.65,TRAVERSAL.playerRadius*.55);
          if(floor&&slopeAllowed(floor.normalY)&&floor.height<=p.y+TRAVERSAL.stepHeight&&
            floor.height>=p.y-TRAVERSAL.groundSnap-.2){
            if(world.headroom(nextX,floor.height+.05,nextZ,TRAVERSAL.playerHeight-.1,
              floor.rockId??this.supportRockId??undefined)){
              p.x=nextX;p.z=nextZ;p.y=floor.height;this.supportRockId=floor.rockId??null;
              moved=true;
            }
          }else if(!floor||slopeAllowed(floor.normalY)||floor.height<p.y-.01){
            // A rising facet is a wall. A level or lower facet is a ledge:
            // leave the support and let gravity find the next surface.
            const shell=this.supportRockId?world.solidTop(nextX,nextZ,
              p.y+TRAVERSAL.playerHeight,TRAVERSAL.playerHeight+1,this.supportRockId):null;
            if(!shell||shell.height<=p.y+.05){
              p.x=nextX;p.z=nextZ;this.mode='airborne';this.velocityY=0;
              moved=true;
            }
          }
        }else{p.x=nextX;p.z=nextZ;moved=true;}
      }
    }
    if(this.mode==='airborne'){
      const oldY=p.y;
      const integrated=integrateAirborneVertical(this.velocityY,dt);
      this.velocityY=integrated.velocityY;
      const nextY=oldY+integrated.deltaY;
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
        if(floor&&!slopeAllowed(floor.normalY)&&floor.height>=nextY-TRAVERSAL.groundSnap){
          const d=.5;
          const gx=world.fallbackHeight(p.x+d,p.z)-world.fallbackHeight(p.x-d,p.z);
          const gz=world.fallbackHeight(p.x,p.z+d)-world.fallbackHeight(p.x,p.z-d);
          const length=Math.hypot(gx,gz);
          if(length>1e-5){
            const slideX=p.x-gx/length*4*dt,slideZ=p.z-gz/length*4*dt;
            if(world.canMove(slideX,slideZ,p.x,p.z,p.y)){p.x=slideX;p.z=slideZ;}
          }
          p.y=world.fallbackHeight(p.x,p.z)+.02;this.velocityY=0;
          return true;
        }
        if(floor&&slopeAllowed(floor.normalY)&&floor.height<=oldY+.06&&
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

  private findClimbWall(world:TraversalWorld):TraversalWall|null{
    const p=this.position,normal=this.climbNormal;
    const probes=[this.climbProbeHeight,1.15,1.8,2.5,3.2];
    for(const height of probes){
      for(const outside of [0,1.5,3]){
        const wall=world.wall(p.x+normal.x*outside,p.y+height,p.z+normal.z*outside,
          -normal.x,-normal.z,TRAVERSAL.climbReach+TRAVERSAL.playerRadius+outside+.55);
        if(!wall||!wall.climbable||!this.sameSupport(wall.rockId,this.climbRockId,world)||
          !canBeginClimb(wall.normalY,wall.climbable,true))continue;
        this.climbProbeHeight=height;
        return wall;
      }
    }
    return null;
  }

  private tryMantle(wall:TraversalWall,world:TraversalWorld):boolean{
    const p=this.position;
    const normalLength=Math.hypot(wall.normalX,wall.normalZ);
    if(normalLength<1e-5)return false;
    const nx=wall.normalX/normalLength,nz=wall.normalZ/normalLength;
    const tangentX=-nz,tangentZ=nx;
    let target:TraversalPosition|null=null;
    for(const depth of [TRAVERSAL.playerRadius+.35,TRAVERSAL.playerRadius+.8,
      TRAVERSAL.playerRadius+1.25,3]){
      for(const side of [0,-TRAVERSAL.playerRadius*.55,TRAVERSAL.playerRadius*.55]){
        const x=wall.pointX-nx*depth+tangentX*side;
        const z=wall.pointZ-nz*depth+tangentZ*side;
        const top=world.ground(x,z,p.y+TRAVERSAL.mantleMaxHeight+.2,
          TRAVERSAL.mantleMaxHeight+.4,TRAVERSAL.playerRadius*.45);
        if(!top||!top.rockId||!this.sameSupport(top.rockId,wall.rockId,world)||
          !canMantleRise(top.height-p.y,world.headroom(x,top.height+.05,z,TRAVERSAL.playerHeight-.1))||
          !world.canMove(x,z,p.x,p.z,p.y))continue;
        const inward=world.ground(x-nx*.7,z-nz*.7,top.height+.5,1.1,
          TRAVERSAL.playerRadius*.45);
        if(!inward||inward.height<top.height-.5||
          inward.rockId&&!this.sameSupport(inward.rockId,top.rockId,world))continue;
        target={x,y:top.height,z};break;
      }
      if(target)break;
    }
    if(!target)return false;
    const distance=Math.hypot(target.x-p.x,target.z-p.z);
    this.mode='mantling';this.mantle={from:{...p},to:target,elapsed:0,
      duration:Math.max(.28,Math.min(1,distance/8))};
    this.supportRockId=wall.rockId;this.climbRockId=null;this.lastClimbWall=null;this.velocityY=0;
    return true;
  }
}
