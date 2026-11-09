import { SpatialHash, type Bounds3 } from './SpatialHash';
import { closestSegments, colliderBounds, fieldSample, segmentField, sweepSphere,
  type Collider, type Point3, type SegmentContact } from './DistanceFields';

export type ChainMode='analytic'|'ftl'|'pbd'|'xpbd';
export type ChainConfig={points:readonly Point3[];mode?:ChainMode;inverseMasses?:readonly number[];
  radius?:number;tipRadius?:number;compliance?:number;bendCompliance?:number;damping?:number;gravity?:number;
  iterations?:number;worldCollision?:boolean;selfCollision?:boolean;interCollision?:boolean;
  group?:number;mask?:number;critical?:boolean};
export type DynamicsMetrics={steps:number;active:number;sleeping:number;culled:number;particles:number;
  constraints:number;potentialPairs:number;candidates:number;tests:number;contacts:number;
  integrationMs:number;constraintsMs:number;collisionMs:number;broadPhaseMs:number;narrowPhaseMs:number;pairMs:number;simulationMs:number;reconstructionMs:number;
  droppedSeconds:number;maxLengthError:number;maxPenetration:number;bufferBytes:number};
const bounds=():Bounds3=>({minX:0,minY:0,minZ:0,maxX:0,maxY:0,maxZ:0});
const freshMetrics=():DynamicsMetrics=>({steps:0,active:0,sleeping:0,culled:0,particles:0,constraints:0,
  potentialPairs:0,candidates:0,tests:0,contacts:0,integrationMs:0,constraintsMs:0,collisionMs:0,broadPhaseMs:0,narrowPhaseMs:0,pairMs:0,
  simulationMs:0,reconstructionMs:0,droppedSeconds:0,maxLengthError:0,maxPenetration:0,bufferBytes:0});
const METRIC_KEYS=Object.keys(freshMetrics()) as (keyof DynamicsMetrics)[];
export class ChainState {
  readonly count:number;
  readonly p:Float64Array;readonly previous:Float64Array;readonly old:Float64Array;readonly velocity:Float64Array;
  readonly rest:Float64Array;readonly mass:Float64Array;readonly lengths:Float64Array;readonly lambda:Float64Array;
  readonly pairDelta:Float64Array|null;readonly pairCount:Float64Array|null;
  readonly config:Required<Omit<ChainConfig,'points'|'inverseMasses'|'bendCompliance'>>&{bendCompliance:number};
  readonly anchor:Point3;readonly origin:Point3;
  sleeping=false;quietTime=0;lod=0;enabled=true;distance=0;windX=0;windZ=0;
  constructor(readonly id:number,config:ChainConfig){
    const n=config.points.length;if(n<2||n>64||config.points.some(p=>!Number.isFinite(p.x+p.y+p.z)))throw new Error('Chain needs 2–64 finite points');
    this.count=n;this.p=new Float64Array(n*3);this.previous=new Float64Array(n*3);this.old=new Float64Array(n*3);this.velocity=new Float64Array(n*3);
    this.rest=new Float64Array(n*3);this.mass=new Float64Array(n);this.lengths=new Float64Array(n*2);this.lambda=new Float64Array(n*2);
    this.pairDelta=config.selfCollision||config.interCollision?new Float64Array(n*3):null;
    this.pairCount=this.pairDelta?new Float64Array(n):null;
    this.config={mode:'xpbd',radius:.06,tipRadius:config.radius??.06,compliance:1e-7,bendCompliance:-1,damping:1.8,gravity:-9.81,
      iterations:6,worldCollision:true,selfCollision:false,interCollision:false,group:1,mask:0xffffffff,critical:false,...config};
    const cfg=this.config;
    if(![cfg.radius,cfg.tipRadius,cfg.compliance,cfg.bendCompliance,cfg.gravity,cfg.damping,cfg.iterations].every(Number.isFinite)||cfg.radius<=0||cfg.tipRadius<=0||cfg.compliance<0||cfg.damping<0||!Number.isInteger(cfg.iterations)||cfg.iterations<1||cfg.iterations>32)throw new Error('Invalid chain configuration');
    this.anchor={...config.points[0]};this.origin={...config.points[0]};
    for(let i=0;i<n;i++){
      const p=config.points[i],j=i*3;this.p[j]=p.x;this.p[j+1]=p.y;this.p[j+2]=p.z;
      this.mass[i]=config.inverseMasses?.[i]??(i===0?0:1);
      if(!Number.isFinite(this.mass[i])||this.mass[i]<0)throw new Error('Invalid inverse mass');
      if(i)this.lengths[i]=Math.hypot(p.x-config.points[i-1].x,p.y-config.points[i-1].y,p.z-config.points[i-1].z);
      if(i>1)this.lengths[n+i]=Math.hypot(p.x-config.points[i-2].x,p.y-config.points[i-2].y,p.z-config.points[i-2].z);
    }
    this.previous.set(this.p);this.old.set(this.p);this.rest.set(this.p);
  }
  wake(){this.sleeping=false;this.quietTime=0;}
  setAnchor(x:number,y:number,z:number,teleport=false):void{
    if(!Number.isFinite(x+y+z))throw new Error('Invalid anchor');
    const dx=x-this.anchor.x,dy=y-this.anchor.y,dz=z-this.anchor.z;
    if(Math.hypot(dx,dy,dz)<1e-9)return;
    if(teleport){for(let i=0;i<this.p.length;i+=3){this.p[i]+=dx;this.p[i+1]+=dy;this.p[i+2]+=dz;}this.previous.set(this.p);this.old.set(this.p);this.velocity.fill(0);}
    this.anchor.x=x;this.anchor.y=y;this.anchor.z=z;this.pin();this.wake();
  }
  setWind(x:number,z:number){if(!Number.isFinite(x+z))throw new Error('Invalid wind');if(Math.hypot(x-this.windX,z-this.windZ)>.02)this.wake();this.windX=x;this.windZ=z;}
  impulse(x:number,y:number,z:number){if(!Number.isFinite(x+y+z))throw new Error('Invalid impulse');for(let i=0;i<this.count;i++)if(this.mass[i]>0){const j=i*3;this.velocity[j]+=x;this.velocity[j+1]+=y;this.velocity[j+2]+=z;}this.wake();}
  pin(){for(let i=0;i<this.count;i++)if(!this.mass[i]){const j=i*3;this.p[j]=this.rest[j]+this.anchor.x-this.origin.x;this.p[j+1]=this.rest[j+1]+this.anchor.y-this.origin.y;this.p[j+2]=this.rest[j+2]+this.anchor.z-this.origin.z;}}
  get bufferBytes(){return this.p.byteLength*5+this.mass.byteLength+this.lengths.byteLength+this.lambda.byteLength+(this.pairDelta?.byteLength??0)+(this.pairCount?.byteLength??0);}
}
/** Independent of Babylon; one owner calls advance, never one observer per chain.
 * Gameplay-critical chains bypass cosmetic distance/budget scheduling. */
export class ChainDynamics {
  readonly chains=new Map<number,ChainState>();
  readonly colliders=new Map<number,Collider>();
  readonly metrics=freshMetrics();
  readonly index=new SpatialHash(4);
  enabled=true;useIndex=true;useLod=true;maxActiveCosmetics=128;
  /** Smoothed feedback only changes cosmetic work, at the scheduler cadence. */
  budgetMs=2;adaptiveBudget=true;
  private cosmeticLimit=128;private smoothedMs=0;
  terrainHeight:((x:number,z:number)=>number|null)|null=null;
  private readonly planes=new Set<number>();
  private readonly candidates:number[]=[];
  private readonly box=bounds();
  private readonly contact:SegmentContact={...fieldSample(),s:0,t:0};
  private readonly sample=fieldSample();
  private readonly order:ChainState[]=[];
  private nextId=1;private accumulator=0;private clock=0;private scheduleTime=0;
  readonly fixedStep:number;readonly maxSteps:number;
  constructor(fixedStep=1/120,maxSteps=8){
    if(!Number.isFinite(fixedStep)||fixedStep<=0||!Number.isInteger(maxSteps)||maxSteps<1)throw new Error('Invalid fixed step');
    this.fixedStep=fixedStep;this.maxSteps=maxSteps;
  }
  get alpha(){return this.accumulator/this.fixedStep;}
  add(config:ChainConfig):ChainState{const c=new ChainState(this.nextId++,config);this.chains.set(c.id,c);this.order.push(c);return c;}
  remove(id:number){this.chains.delete(id);const i=this.order.findIndex(c=>c.id===id);if(i>=0)this.order.splice(i,1);}
  setCollider(c:Collider):void{
    this.colliders.set(c.id,c);this.index.remove(c.id);this.planes.delete(c.id);
    if(c.kind==='plane')this.planes.add(c.id);else this.index.upsert(c.id,colliderBounds(c,this.box));
    // Collider/anchor updates are infrequent; wake nearby sleeping chains.
    for(const ch of this.order)if(ch.sleeping){this.chainBounds(ch,this.box);
      this.index.query(this.box,this.candidates);if(c.kind==='plane'||this.candidates.includes(c.id))ch.wake();}
  }
  removeCollider(id:number){this.colliders.delete(id);this.index.remove(id);this.planes.delete(id);for(const c of this.order)c.wake();}
  /** Explicit validation pass, excluded from production frame cost. Reports
   * residual overlap after solving, distinct from contact correction magnitude. */
  measureResiduals():{penetration:number;lengthError:number}{
    let penetration=0,lengthError=0;
    for(const c of this.order){if(!c.enabled||c.lod===2)continue;const p=c.p;
      for(let i=1;i<c.count;i++){
        const a=(i-1)*3,b=i*3;
        lengthError=Math.max(lengthError,Math.abs(Math.hypot(p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2])-c.lengths[i]));
        if(c.config.worldCollision)for(const obstacle of this.colliders.values()){
          if(!(c.config.mask&obstacle.group)||!(obstacle.mask&c.config.group))continue;
          segmentField(obstacle,p[a],p[a+1],p[a+2],p[b],p[b+1],p[b+2],this.contact);
          penetration=Math.max(penetration,(i===c.count-1?c.config.tipRadius:c.config.radius)-this.contact.distance);
        }
      }
    }
    return {penetration,lengthError};
  }
  pause(){this.accumulator=0;for(const c of this.order){c.previous.set(c.p);c.velocity.fill(0);}}
  private chainBounds(c:ChainState,b:Bounds3){
    b.minX=b.minY=b.minZ=Infinity;b.maxX=b.maxY=b.maxZ=-Infinity;
    for(let j=0;j<c.p.length;j+=3){b.minX=Math.min(b.minX,c.p[j]);b.maxX=Math.max(b.maxX,c.p[j]);b.minY=Math.min(b.minY,c.p[j+1]);b.maxY=Math.max(b.maxY,c.p[j+1]);b.minZ=Math.min(b.minZ,c.p[j+2]);b.maxZ=Math.max(b.maxZ,c.p[j+2]);}
    const r=Math.max(c.config.radius,c.config.tipRadius);b.minX-=r;b.minY-=r;b.minZ-=r;b.maxX+=r;b.maxY+=r;b.maxZ+=r;
  }
  advance(dt:number,focus:Point3):void{
    const start=performance.now(),m=this.metrics,dropped=m.droppedSeconds;
    for(const key of METRIC_KEYS)m[key]=0;m.droppedSeconds=dropped;
    if(!this.enabled||!Number.isFinite(dt)||dt<0){this.pause();return;}
    this.scheduleTime-=dt;
    if(this.scheduleTime<=0){
      this.scheduleTime=.2;
      if(this.adaptiveBudget&&this.useLod){
        if(this.smoothedMs>this.budgetMs*1.25)this.cosmeticLimit=Math.max(8,Math.floor(this.cosmeticLimit*.85));
        else if(this.smoothedMs<this.budgetMs*.6)this.cosmeticLimit=Math.min(this.maxActiveCosmetics,this.cosmeticLimit+8);
      }else this.cosmeticLimit=this.maxActiveCosmetics;
      for(const c of this.order)c.distance=Math.hypot(c.anchor.x-focus.x,c.anchor.y-focus.y,c.anchor.z-focus.z);
      this.order.sort((a,b)=>Number(b.config.critical)-Number(a.config.critical)||a.distance-b.distance||a.id-b.id);
      let cosmetics=0;
      for(const c of this.order){const before=c.lod;
        c.lod=!this.useLod||c.config.critical?0:++cosmetics>Math.min(this.maxActiveCosmetics,this.cosmeticLimit)||c.distance>(before===2?160:190)?2:c.distance>(before===1?45:60)?1:0;
        if(c.lod!==before){c.previous.set(c.p);c.velocity.fill(0);c.wake();}
      }
    }
    this.accumulator+=dt;
    const steps=Math.min(this.maxSteps,Math.floor((this.accumulator+1e-10)/this.fixedStep));
    const excess=Math.max(0,Math.floor((this.accumulator+1e-10)/this.fixedStep)-steps);
    this.accumulator-=excess*this.fixedStep;m.droppedSeconds+=excess*this.fixedStep;
    for(let step=0;step<steps;step++){
      this.clock+=this.fixedStep;
      for(const c of this.order){
        if(!c.enabled||c.lod===2||c.sleeping){c.previous.set(c.p);continue;}
        this.stepChain(c,this.fixedStep);
      }
      const pairs=performance.now();this.solvePairs();m.pairMs+=performance.now()-pairs;
      this.accumulator-=this.fixedStep;
    }
    this.accumulator=Math.max(0,this.accumulator);m.steps=steps;
    for(const c of this.order){m.bufferBytes+=c.bufferBytes;m.particles+=c.count;
      if(!c.enabled||c.lod===2)m.culled++;else if(c.sleeping)m.sleeping++;else m.active++;
      for(let i=1;i<c.count;i++){const j=i*3;const err=Math.abs(Math.hypot(c.p[j]-c.p[j-3],c.p[j+1]-c.p[j-2],c.p[j+2]-c.p[j-1])-c.lengths[i]);m.maxLengthError=Math.max(m.maxLengthError,err);}
    }
    m.simulationMs=performance.now()-start;
    if(steps)this.smoothedMs=this.smoothedMs*.9+m.simulationMs*.1;
  }
  private stepChain(c:ChainState,h:number){
    const m=this.metrics,p=c.p,n=c.count;let start=performance.now();c.previous.set(p);c.old.set(p);c.lambda.fill(0);
    if(c.config.mode==='analytic'){
      const angle=Math.sin(this.clock*1.7+c.id)*.08;
      for(let i=0;i<n;i++){const j=i*3,dx=c.rest[j]-c.origin.x,dy=c.rest[j+1]-c.origin.y;
        p[j]=c.anchor.x+dx*Math.cos(angle)-dy*Math.sin(angle);p[j+1]=c.anchor.y+dx*Math.sin(angle)+dy*Math.cos(angle);p[j+2]=c.anchor.z+c.rest[j+2]-c.origin.z;}
      c.pin();m.integrationMs+=performance.now()-start;return;
    }
    const damp=Math.exp(-c.config.damping*h);
    for(let i=0;i<n;i++)if(c.mass[i]){const j=i*3;
      c.velocity[j]=(c.velocity[j]+c.windX*h)*damp;c.velocity[j+1]=(c.velocity[j+1]+c.config.gravity*h)*damp;c.velocity[j+2]=(c.velocity[j+2]+c.windZ*h)*damp;
      p[j]+=c.velocity[j]*h;p[j+1]+=c.velocity[j+1]*h;p[j+2]+=c.velocity[j+2]*h;
    }
    c.pin();m.integrationMs+=performance.now()-start;
    const iterations=c.config.mode==='ftl'?1:c.lod===1?Math.min(3,c.config.iterations):c.config.iterations;
    for(let iteration=0;iteration<iterations;iteration++){
      start=performance.now();
      for(let i=1;i<n;i++)this.distance(c,i-1,i,c.lengths[i],i,h,c.config.compliance);
      if(c.config.bendCompliance>=0&&c.config.mode!=='ftl')for(let i=2;i<n;i++)this.distance(c,i-2,i,c.lengths[n+i],n+i,h,c.config.bendCompliance);
      c.pin();m.constraintsMs+=performance.now()-start;
      start=performance.now();if(c.config.worldCollision)this.collide(c,iteration===0,h);m.collisionMs+=performance.now()-start;
    }
    let speed=0;
    for(let i=0;i<n;i++)for(let k=0;k<3;k++){const j=i*3+k;c.velocity[j]=c.mass[i]?(p[j]-c.old[j])/h:0;speed=Math.max(speed,Math.abs(c.velocity[j]));}
    c.quietTime=speed<.025?c.quietTime+h:0;if(c.quietTime>1.5){c.sleeping=true;c.velocity.fill(0);}
  }
  private distance(c:ChainState,a:number,b:number,rest:number,slot:number,h:number,compliance:number){
    const p=c.p,i=a*3,j=b*3;let dx=p[j]-p[i],dy=p[j+1]-p[i+1],dz=p[j+2]-p[i+2];
    const length=Math.hypot(dx,dy,dz);
    let wa=c.mass[a],wb=c.mass[b];if(c.config.mode==='ftl')wa=0;
    if(wa+wb===0)return;
    if(length<1e-10){
      if(rest<1e-10)return;
      dx=(c.rest[j]-c.rest[i])/rest;dy=(c.rest[j+1]-c.rest[i+1])/rest;dz=(c.rest[j+2]-c.rest[i+2])/rest;
    }else{dx/=length;dy/=length;dz/=length;}
    const alpha=c.config.mode==='xpbd'?compliance/(h*h):0;
    const dl=(-(length-rest)-alpha*c.lambda[slot])/(wa+wb+alpha);c.lambda[slot]+=dl;
    const x=dx*dl,y=dy*dl,z=dz*dl;
    p[i]-=wa*x;p[i+1]-=wa*y;p[i+2]-=wa*z;p[j]+=wb*x;p[j+1]+=wb*y;p[j+2]+=wb*z;this.metrics.constraints++;
  }
  private collide(c:ChainState,ccd:boolean,h:number){
    const p=c.p,b=this.box,m=this.metrics;
    // Most streamed chains have no nearby obstacle. Reject their whole swept
    // envelope once before asking the same empty cells about every segment.
    // Positive results still use the per-segment queries below.
    if(this.useIndex&&!this.planes.size&&!this.terrainHeight){
      const start=performance.now(),r=Math.max(c.config.radius,c.config.tipRadius);this.chainBounds(c,b);
      for(let j=0;j<c.old.length;j+=3){b.minX=Math.min(b.minX,c.old[j]-r);b.maxX=Math.max(b.maxX,c.old[j]+r);b.minY=Math.min(b.minY,c.old[j+1]-r);b.maxY=Math.max(b.maxY,c.old[j+1]+r);b.minZ=Math.min(b.minZ,c.old[j+2]-r);b.maxZ=Math.max(b.maxZ,c.old[j+2]+r);}
      this.index.query(b,this.candidates);m.broadPhaseMs+=performance.now()-start;
      if(!this.candidates.length){m.potentialPairs+=(c.count-1)*this.colliders.size;return;}
    }
    for(let i=1;i<c.count;i++){
      const a=(i-1)*3,j=i*3,r=i===c.count-1?c.config.tipRadius:c.config.radius;
      // Swept endpoints included in broad phase. Re-query after every constraint
      // iteration: projections can move a segment into a previously absent cell.
      b.minX=Math.min(p[a],p[j],c.old[a],c.old[j])-r;b.maxX=Math.max(p[a],p[j],c.old[a],c.old[j])+r;
      b.minY=Math.min(p[a+1],p[j+1],c.old[a+1],c.old[j+1])-r;b.maxY=Math.max(p[a+1],p[j+1],c.old[a+1],c.old[j+1])+r;
      b.minZ=Math.min(p[a+2],p[j+2],c.old[a+2],c.old[j+2])-r;b.maxZ=Math.max(p[a+2],p[j+2],c.old[a+2],c.old[j+2])+r;
      const broadStart=performance.now();
      this.index.query(b,this.candidates,!this.useIndex);for(const id of this.planes)this.candidates.push(id);
      m.broadPhaseMs+=performance.now()-broadStart;
      const narrowStart=performance.now();
      m.potentialPairs+=this.colliders.size;m.candidates+=this.candidates.length;
      for(const id of this.candidates){const obstacle=this.colliders.get(id)!;
        if(!(c.config.mask&obstacle.group)||!(obstacle.mask&c.config.group))continue;
        if(ccd)for(let endpoint=0;endpoint<2;endpoint++){
          const k=endpoint?j:a;if(c.mass[k/3]&&Math.hypot(p[k]-c.old[k],p[k+1]-c.old[k+1],p[k+2]-c.old[k+2])>r){
          const t=sweepSphere(obstacle,c.old[k],c.old[k+1],c.old[k+2],p[k],p[k+1],p[k+2],r,this.sample);
          if(t<1){p[k]=c.old[k]+(p[k]-c.old[k])*t;p[k+1]=c.old[k+1]+(p[k+1]-c.old[k+1])*t;p[k+2]=c.old[k+2]+(p[k+2]-c.old[k+2])*t;}
        }}
        segmentField(obstacle,p[a],p[a+1],p[a+2],p[j],p[j+1],p[j+2],this.contact);m.tests++;
        const hit=this.contact,depth=r-hit.distance;if(depth<=0)continue;
        const u=1-hit.s,wa=c.mass[i-1],wb=c.mass[i],den=wa*u*u+wb*hit.s*hit.s;if(den<1e-12)continue;
        m.contacts++;m.maxPenetration=Math.max(m.maxPenetration,depth);
        const amount=depth/den;
        p[a]+=hit.nx*amount*wa*u;p[a+1]+=hit.ny*amount*wa*u;p[a+2]+=hit.nz*amount*wa*u;
        p[j]+=hit.nx*amount*wb*hit.s;p[j+1]+=hit.ny*amount*wb*hit.s;p[j+2]+=hit.nz*amount*wb*hit.s;
        // Adjust previous positions: positional corrections must not turn into
        // explosive bounce; friction uses velocity relative to a kinematic shape.
        for(let endpoint=0;endpoint<2;endpoint++){
          const k=endpoint?j:a;if(!c.mass[k/3])continue;
          let vx=(p[k]-c.old[k])/h-(obstacle.vx??0),vy=(p[k+1]-c.old[k+1])/h-(obstacle.vy??0),vz=(p[k+2]-c.old[k+2])/h-(obstacle.vz??0);
          const vn=vx*hit.nx+vy*hit.ny+vz*hit.nz;
          const incoming=c.velocity[k]*hit.nx+c.velocity[k+1]*hit.ny+c.velocity[k+2]*hit.nz;
          const normal=Math.max(0,-incoming*Math.min(1,Math.max(0,obstacle.restitution)));
          const tangent=Math.max(0,1-Math.max(0,obstacle.friction)*h*20);
          vx=(vx-vn*hit.nx)*tangent+normal*hit.nx+(obstacle.vx??0);
          vy=(vy-vn*hit.ny)*tangent+normal*hit.ny+(obstacle.vy??0);
          vz=(vz-vn*hit.nz)*tangent+normal*hit.nz+(obstacle.vz??0);
          c.old[k]=p[k]-vx*h;c.old[k+1]=p[k+1]-vy*h;c.old[k+2]=p[k+2]-vz*h;
        }
      }
      m.narrowPhaseMs+=performance.now()-narrowStart;
    }
    if(this.terrainHeight)for(let i=0;i<c.count;i++)if(c.mass[i]){
      const j=i*3,height=this.terrainHeight(p[j],p[j+2]);
      // Vertical support query, deliberately not advertised as a Euclidean SDF.
      const r=i===c.count-1?c.config.tipRadius:c.config.radius;
      if(height!==null&&p[j+1]<height+r){m.contacts++;p[j+1]=height+r;c.old[j+1]=p[j+1];}
    }
  }
  private readonly pairGrid=new SpatialHash(2);
  private readonly segments:{chain:ChainState;index:number}[]=[];
  private readonly pairCandidates:number[]=[];
  private solvePairs(){
    // Optional, disabled for lanterns. Jacobi contacts evaluate a fixed snapshot
    // so projections never invalidate the hash during this pass. New contacts
    // created by the simultaneous correction are resolved next fixed substep.
    let count=0;this.pairGrid.clear();
    for(const c of this.order){c.pairDelta?.fill(0);c.pairCount?.fill(0);}
    for(const c of this.order)if(c.enabled&&c.lod<2&&(c.config.selfCollision||c.config.interCollision))for(let i=1;i<c.count;i++){
      const record=this.segments[count]??(this.segments[count]={chain:c,index:i});record.chain=c;record.index=i;
      const p=c.p,a=(i-1)*3,b=i*3,r=i===c.count-1?c.config.tipRadius:c.config.radius;
      Object.assign(this.box,{minX:Math.min(p[a],p[b])-r,maxX:Math.max(p[a],p[b])+r,minY:Math.min(p[a+1],p[b+1])-r,maxY:Math.max(p[a+1],p[b+1])+r,minZ:Math.min(p[a+2],p[b+2])-r,maxZ:Math.max(p[a+2],p[b+2])+r});
      this.pairGrid.upsert(count++,this.box);
    }
    this.metrics.potentialPairs+=count*(count-1)/2;
    for(let id=0;id<count;id++){
      const first=this.segments[id],c=first.chain,p=c.p,a=(first.index-1)*3,b=first.index*3;
      this.chainBounds(c,this.box);this.pairGrid.query(this.box,this.pairCandidates,!this.useIndex);
      for(const other of this.pairCandidates){if(other<=id)continue;const second=this.segments[other],d=second.chain;
        this.metrics.candidates++;
        if(c===d? !c.config.selfCollision||Math.abs(first.index-second.index)<=2:!c.config.interCollision||!d.config.interCollision)continue;
        if(!(c.config.mask&d.config.group)||!(d.config.mask&c.config.group))continue;
        const q=d.p,e=(second.index-1)*3,f=second.index*3;
        closestSegments(p[a],p[a+1],p[a+2],p[b],p[b+1],p[b+2],q[e],q[e+1],q[e+2],q[f],q[f+1],q[f+2],this.contact);
        const hit=this.contact,depth=(first.index===c.count-1?c.config.tipRadius:c.config.radius)+(second.index===d.count-1?d.config.tipRadius:d.config.radius)-hit.distance;this.metrics.tests++;
        if(depth<=0)continue;
        const u=1-hit.s,v=1-hit.t,w0=c.mass[a/3]*u,w1=c.mass[b/3]*hit.s,w2=d.mass[e/3]*v,w3=d.mass[f/3]*hit.t;
        const den=w0*u+w1*hit.s+w2*v+w3*hit.t;if(den<1e-12)continue;
        const scale=depth/den;this.metrics.contacts++;c.wake();d.wake();
        for(let k=0;k<3;k++){const n=k===0?hit.nx:k===1?hit.ny:hit.nz;
          c.pairDelta![a+k]+=n*scale*w0;c.pairDelta![b+k]+=n*scale*w1;d.pairDelta![e+k]-=n*scale*w2;d.pairDelta![f+k]-=n*scale*w3;}
        c.pairCount![a/3]++;c.pairCount![b/3]++;d.pairCount![e/3]++;d.pairCount![f/3]++;
      }
    }
    for(const c of this.order)if(c.pairDelta)for(let i=0;i<c.count;i++){
      const weight=c.pairCount![i];if(weight)for(let k=0;k<3;k++)c.p[i*3+k]+=c.pairDelta[i*3+k]/weight;
    }
    // Drop removed-chain references, without reallocating live records.
    this.segments.length=count;
  }
  dispose(){this.chains.clear();this.order.length=0;this.colliders.clear();this.index.clear();this.planes.clear();this.pairGrid.clear();this.segments.length=0;this.accumulator=0;}
}
