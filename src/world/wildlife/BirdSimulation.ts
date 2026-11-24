import { BIRDS, type BirdClip, type BirdSpecies } from './BirdCatalog';
import { planBirdFlight, sampleBirdFlight, type BirdFlightPath } from './BirdFlightPath';

export type BirdPoint={x:number;y:number;z:number};
export type BirdSite=BirdPoint&{id:string;kind:'tree'|'perch'|'food'|'water'|'shore';heading?:number;canopy?:boolean};
export type BirdObstacle={id:string;minX:number;maxX:number;minZ:number;maxZ:number;top:number};
export type BirdHabitat={sites:readonly BirdSite[];obstacles:readonly BirdObstacle[];
  ground:(x:number,z:number)=>number;water:(x:number,z:number)=>number|null;allowed?:(x:number,z:number)=>boolean};
export type BirdState='fly'|'glide'|'takeoff'|'landing'|'perch'|'forage'|'hop'|'drink'|'skim'|'alert'|'flee';
export type BirdIntent='forage'|'drink'|'perch'|'cruise';
export type BirdAgent={id:number;species:BirdSpecies;position:BirdPoint;velocity:BirdPoint;
  state:BirdState;time:number;duration:number;heading:number;bank:number;clip:BirdClip;
  target:BirdSite|null;intent:BirdIntent;flight:BirdFlight|null;landed:boolean;
  hunger:number;thirst:number;fatigue:number;cooldown:number;phase:number;roosting:boolean};
type Flock={species:BirdSpecies;home:BirdPoint;intent:BirdIntent;timer:number;cycle:number;center:BirdPoint};
type BirdFlight={target:BirdSite;path:BirdFlightPath;travel:number;speed:number;offset:number;offsetRate:number};
export type BirdContext={threats:readonly BirdPoint[];night:number;rain:number};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const distance=(a:BirdPoint,b:BirdPoint)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const horizontal=(a:BirdPoint,b:BirdPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const angle=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
const flying=(b:BirdAgent)=>!b.landed;
const aerial=(target:BirdSite)=>['air','escape','skim','water-exit'].includes(target.id);
const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const approach=(v:number,target:number,step:number)=>v+clamp(target-v,-step,step);

/** Deterministic, bounded simulation. Rendering and asset loading live elsewhere. */
export class BirdSimulation {
  readonly birds:BirdAgent[]=[];
  private flocks:Flock[]=[];
  private seed:number;
  private clock=0;
  private pathsRemaining=Infinity;
  constructor(seed=73291){this.seed=seed;}
  private random():number{
    this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
    return this.seed/4294967296;
  }

  reset(focus:BirdPoint,habitat:BirdHabitat,counts:Record<BirdSpecies,number>):void{
    this.clear();this.populate(focus,habitat,counts);
  }

  clear():void{this.birds.length=0;this.flocks=[];this.clock=0;}

  /** Fill only real, free canopy slots. Later asset/terrain arrivals never reset existing birds. */
  populate(focus:BirdPoint,habitat:BirdHabitat,counts:Record<BirdSpecies,number>):void{
    if(habitat.allowed?.(focus.x,focus.z)===false)return;
    if((['canary','swallow'] as const).every(species=>
      this.birds.filter(b=>b.species===species).length>=Math.min(counts[species],BIRDS[species].count)))return;
    const sites=habitat.sites.filter(s=>s.kind==='tree'&&s.canopy!==false&&
      [s.x,s.y,s.z].every(Number.isFinite)&&horizontal(s,focus)>14&&horizontal(s,focus)<85&&
      habitat.allowed?.(s.x,s.z)!==false&&s.y>habitat.ground(s.x,s.z)+2&&
      s.y>(habitat.water(s.x,s.z)??-Infinity)+.5);
    sites.sort((a,b)=>Math.abs(horizontal(a,focus)-38)-Math.abs(horizontal(b,focus)-38)||a.id.localeCompare(b.id));
    // Alternate species when trees have few free branches. IDs stay tied to the
    // species/slot so pooled visual rigs cannot change species when capacity changes.
    for(let i=0;i<Math.max(BIRDS.canary.count,BIRDS.swallow.count);i++){
      for(const species of ['canary','swallow'] as const){
        if(i>=Math.min(counts[species],BIRDS[species].count))continue;
        const id=(species==='canary'?0:BIRDS.canary.count)+i;
        if(this.birds.some(b=>b.id===id))continue;
        let flock=this.flocks.find(f=>f.species===species);
        const site=sites.find(s=>(!flock||horizontal(s,flock.home)<70)&&
          !this.birds.some(b=>b.target?.id===s.id||distance(b.position,s)<.65));
        if(!site)continue;
        if(!flock){
          const home={x:site.x,y:site.y,z:site.z},center={...home,y:home.y+BIRDS[species].altitude};
          flock={species,home,intent:'forage',timer:22+this.random()*12,cycle:1,center};this.flocks.push(flock);
        }
        const phase=this.random()*Math.PI*2;
        const position={x:site.x,y:site.y,z:site.z};
        this.birds.push({id,species,position,velocity:{x:0,y:0,z:0},
          state:'perch',time:0,duration:1.5+i*.45+this.random()*1.5,heading:phase,bank:0,clip:'Reposo',target:site,
          intent:'forage',flight:null,landed:true,hunger:.5+this.random()*.2,
          thirst:.3+this.random()*.25,fatigue:this.random()*.2,cooldown:0,phase,roosting:false});
      }
    }
  }

  step(elapsed:number,habitat:BirdHabitat,context:BirdContext,maxNewPaths=Infinity):void{
    if(!Number.isFinite(elapsed)||elapsed<=0)return;
    this.pathsRemaining=maxNewPaths;
    // Tab suspension cannot propel a bird through terrain or skip transitions.
    let remaining=Math.min(elapsed,.2);
    while(remaining>1e-6){const dt=Math.min(remaining,1/30);this.tick(dt,habitat,context);remaining-=dt;}
  }

  private enter(b:BirdAgent,state:BirdState,duration=0):void{
    b.state=state;b.time=0;b.duration=duration;
    b.clip=({fly:'Volar',glide:'Planear',takeoff:'Despegar',landing:'Aterrizar',perch:'Reposo',
      forage:'Picotear',hop:'Saltar',drink:'Picotear',skim:'Planear',alert:'Alerta',flee:'Volar'} as const)[state];
  }

  private tick(dt:number,h:BirdHabitat,c:BirdContext):void{
    this.clock+=dt;
    const roost=c.night>.65||c.rain>.85;
    for(const flock of this.flocks){
      flock.timer-=dt;
      const members=this.birds.filter(b=>b.species===flock.species);
      if(!members.length)continue;
      if(flock.timer<=0||roost&&flock.intent!=='perch'){
        const thirst=members.reduce((n,b)=>n+b.thirst,0)/members.length;
        const hunger=members.reduce((n,b)=>n+b.hunger,0)/members.length;
        const fatigue=members.reduce((n,b)=>n+b.fatigue,0)/members.length;
        const cycle:BirdIntent[]=['forage','perch','drink','cruise'];
        flock.intent=roost?'perch':thirst>.82?'drink':hunger>.85?'forage':fatigue>.8?'perch':cycle[flock.cycle++%4];
        flock.timer=roost?12:22+this.random()*12;
        const kind=flock.intent==='drink'?(flock.species==='swallow'?'water':'shore'):
          flock.intent==='perch'?'tree':flock.species==='swallow'?'water':'food';
        const candidates=h.sites.filter(s=>s.kind===kind&&horizontal(s,flock.home)<85);
        if(candidates.length)flock.center={...candidates[Math.floor(this.random()*candidates.length)]};
        else flock.center={...flock.home};
        if(flock.intent==='cruise'){
          const a=this.random()*Math.PI*2;flock.center.x+=Math.cos(a)*26;flock.center.z+=Math.sin(a)*26;
        }
      }
    }
    // Snapshot neighbours: boids must not depend on update order within a frame.
    const neighbours=this.birds.map(b=>({id:b.id,species:b.species,p:{...b.position},v:{...b.velocity},air:flying(b)}));
    for(const b of this.birds){
      const flock=this.flocks.find(f=>f.species===b.species)!;
      b.time+=dt;b.cooldown=Math.max(0,b.cooldown-dt);
      b.hunger=clamp(b.hunger+dt*.003,0,1);b.thirst=clamp(b.thirst+dt*.004,0,1);
      b.fatigue=clamp(b.fatigue+dt*(b.landed?-.014:.003),0,1);
      const threat=c.threats.find(p=>distance(p,b.position)<BIRDS[b.species].fear);
      if(threat&&b.cooldown<=0){
        // A nearby startled bird also starts the flock; high perches remain safe.
        for(const mate of this.birds.filter(m=>m.species===b.species&&distance(m.position,b.position)<15)){
          const dx=mate.position.x-threat.x,dz=mate.position.z-threat.z,len=Math.hypot(dx,dz)||1;
          mate.target={id:'escape',kind:'perch',x:mate.position.x+dx/len*16+Math.sin(mate.phase)*3,
            z:mate.position.z+dz/len*16+Math.cos(mate.phase)*3,y:mate.position.y+7};
          mate.intent='cruise';mate.cooldown=9;
          this.enter(mate,mate.landed?'alert':'flee',mate.landed?.25:3);
        }
      }
      if(b.target&&!aerial(b.target)&&!h.sites.some(s=>s.id===b.target!.id)){
        // A harvested tree, edited building or unloaded chunk invalidates its perch.
        b.target=null;if(b.landed||b.state==='landing'){b.landed=false;this.enter(b,'takeoff',.8);}
      }
      if(b.state==='alert'){
        if(b.time>=b.duration){b.landed=false;this.enter(b,'takeoff',.8);}
        continue;
      }
      if(b.landed){
        b.roosting=roost&&b.state==='perch';
        if(b.state==='forage')b.hunger=Math.max(0,b.hunger-dt*.09);
        if(b.state==='drink')b.thirst=Math.max(0,b.thirst-dt*.18);
        if(b.state==='perch'&&!roost){
          const t=b.time%12;b.clip=t<4?'Reposo':t<8?'Mirar alrededor':b.species==='canary'?'Cantar':'Reposo';
        }
        if(b.state==='hop'&&b.target){
          const d=horizontal(b.position,b.target),step=Math.min(d,dt*.45);
          if(d>.001){b.position.x+=(b.target.x-b.position.x)/d*step;b.position.z+=(b.target.z-b.position.z)/d*step;}
          b.position.y=h.ground(b.position.x,b.position.z);
          if(b.time>=b.duration)this.enter(b,'forage',3+this.random()*3);
        }
        if(b.roosting)continue;
        if(roost||b.intent!==flock.intent||b.time>=b.duration){
          if(!roost&&b.state==='forage'&&b.intent===flock.intent&&this.random()<.5){
            const site=h.sites.find(s=>s.kind==='food'&&horizontal(s,b.position)>.3&&horizontal(s,b.position)<1.2);
            if(site){b.target=site;b.heading=Math.atan2(site.x-b.position.x,site.z-b.position.z);this.enter(b,'hop',2);continue;}
          }
          b.target=null;b.landed=false;this.enter(b,'takeoff',.8);
        }
        continue;
      }
      b.roosting=false;
      if(b.state==='takeoff'&&b.time>=.8)this.enter(b,b.cooldown>0?'flee':'fly',3);
      if(b.state==='flee'&&b.time>3){b.target=null;this.enter(b,'fly');}
      if(b.state==='skim'){
        const water=h.water(b.position.x,b.position.z);
        if(water!==null&&h.ground(b.position.x,b.position.z)<water&&Math.abs(b.position.y-water-.18)<.4)
          b.thirst=Math.max(0,b.thirst-dt*.65);
        else this.leaveWater(b,h);
      }
      if(!b.target)this.chooseTarget(b,flock,h,roost);
      let target=b.target!;
      if(!b.flight||b.flight.target!==target){
        // Stagger flock decisions across rendered frames. Planning a landing
        // samples its whole corridor and must not run eleven times at once.
        if(this.pathsRemaining<=0){
          // Continue the existing smooth corridor while the next decision waits.
          if(!b.flight)continue;
          target=b.flight.target;
        }else{
          this.pathsRemaining--;
          b.flight={target,path:planBirdFlight(b.position,target,b.velocity,b.heading,h,
            {heading:target.heading,departure:b.state==='takeoff',side:Math.sin(b.phase)>=0?1:-1}),
            travel:0,speed:Math.hypot(b.velocity.x,b.velocity.y,b.velocity.z),offset:0,offsetRate:0};
        }
      }
      const waterPass=b.species==='swallow'&&target.kind==='water';
      const resting=!aerial(target)&&!waterPass;
      const flight=b.flight,remaining=flight.path.length-flight.travel;
      const cruise=BIRDS[b.species].speed*(b.state==='flee'?1.3:waterPass?.8:1);
      const acceleration=b.species==='canary'?3.2:4.5;
      const desiredSpeed=resting?Math.min(cruise,Math.sqrt(Math.max(0,acceleration*remaining)),remaining*2):cruise;
      const oldSpeed=flight.speed;
      flight.speed=approach(flight.speed,desiredSpeed,acceleration*dt);
      const advance=Math.min(remaining,Math.max(.02,(oldSpeed+flight.speed)*.5)*dt);
      flight.travel+=advance;
      const sample=sampleBirdFlight(flight.path,flight.travel),base=sample.point;
      const horizontalTangent=Math.hypot(sample.tangent.x,sample.tangent.z)||1;
      const lateral={x:sample.tangent.z/horizontalTangent,z:-sample.tangent.x/horizontalTangent};
      let separation=0,cohesion=0,alignment=0,count=0;
      for(const n of neighbours){
        if(n.id===b.id||n.species!==b.species||!n.air)continue;
        const dist=distance(b.position,n.p);
        const side=(b.position.x-n.p.x)*lateral.x+(b.position.z-n.p.z)*lateral.z;
        if(dist<2)separation+=side/Math.max(.15,dist*dist)*1.5;
        if(dist<12){cohesion-=side;alignment+=n.v.x*lateral.x+n.v.z*lateral.z;count++;}
      }
      const desiredOffset=clamp(separation+(count?cohesion/count*.06+alignment/count*.08:0),-1.1,1.1);
      flight.offsetRate+=((desiredOffset-flight.offset)*5-flight.offsetRate*4.5)*dt;
      flight.offsetRate=clamp(flight.offsetRate,-.7,.7);flight.offset+=flight.offsetRate*dt;
      // Fade the small flock correction at both ends: the curve's tangent and
      // touchdown remain continuous even when neighbours choose another perch.
      const envelope=smooth(Math.min(flight.travel/5,(flight.path.length-flight.travel)/9));
      let offset=flight.offset*envelope;
      const ox=base.x+lateral.x*offset,oz=base.z+lateral.z*offset;
      offset*=smooth((base.y-h.ground(ox,oz))/.6);
      for(const o of h.obstacles){
        const horizontalClearance=Math.hypot(Math.max(o.minX-base.x,0,base.x-o.maxX),Math.max(o.minZ-base.z,0,base.z-o.maxZ));
        offset*=smooth(Math.max(horizontalClearance-.4,base.y-o.top-.4)/1.5);
      }
      const next={x:base.x+lateral.x*offset,y:base.y,z:base.z+lateral.z*offset};
      b.velocity={x:(next.x-b.position.x)/dt,y:(next.y-b.position.y)/dt,z:(next.z-b.position.z)/dt};
      Object.assign(b.position,next);
      if(Math.hypot(b.velocity.x,b.velocity.z)>.04){
        const turn=angle(Math.atan2(b.velocity.x,b.velocity.z)-b.heading);
        const yaw=clamp(turn*(1-Math.exp(-dt*5)),-dt*2.1,dt*2.1);
        b.heading+=yaw;
        const bank=clamp(-yaw/Math.max(dt,.001)*.24,-.45,.45);
        b.bank+=(bank-b.bank)*(1-Math.exp(-dt*4));
      }
      if(b.target!==target)continue;
      if(flight.travel>=flight.path.length-1e-6){
        if(resting){
          b.landed=true;b.velocity={x:0,y:0,z:0};b.bank=0;
          this.enter(b,b.intent==='forage'?'forage':b.intent==='drink'?'drink':'perch',4+this.random()*6);
        }else if(waterPass&&target.id!=='skim'){
          const heading=target.heading??b.heading;
          b.target={id:'skim',kind:'water',x:target.x+Math.sin(heading)*5.5,
            y:target.y,z:target.z+Math.cos(heading)*5.5,heading};
          this.enter(b,'skim');
        }else if(target.id==='skim')this.leaveWater(b,h);
        else{
          if(b.species==='swallow'&&b.intent==='forage')b.hunger=Math.max(0,b.hunger-.22);
          b.target=null;
        }
      }else if(resting&&remaining<Math.max(1.1,flight.speed*.9)&&b.state!=='landing')this.enter(b,'landing');
      else if(!['takeoff','landing','skim','flee'].includes(b.state)){
        const glide=b.species==='swallow'&&Math.sin(this.clock*.75+b.phase)>.25&&b.velocity.y<.6;
        if(glide&&b.state!=='glide')this.enter(b,'glide');
        else if(!glide&&b.state!=='fly')this.enter(b,'fly');
      }
    }
  }

  private leaveWater(b:BirdAgent,h:BirdHabitat):void{
    const x=b.position.x+Math.sin(b.heading)*12,z=b.position.z+Math.cos(b.heading)*12;
    b.target={id:'water-exit',kind:'perch',x,y:Math.max(b.position.y+3,h.ground(x,z)+2),z};
    this.enter(b,'fly');
  }

  private chooseTarget(b:BirdAgent,flock:Flock,h:BirdHabitat,roost:boolean):void{
    b.intent=roost?'perch':flock.intent;
    const kinds=b.intent==='perch'?['tree','perch']:b.intent==='drink'?[b.species==='canary'?'shore':'water']:
      b.intent==='forage'&&b.species==='canary'?['food']:[];
    const reserved=this.birds.filter(n=>n!==b&&n.target).map(n=>n.target!);
    const candidates=h.sites.filter(s=>kinds.includes(s.kind)&&horizontal(s,flock.home)<100&&
      !reserved.some(r=>r.id===s.id||distance(r,s)<.65));
    candidates.sort((a,z)=>horizontal(a,flock.center)-horizontal(z,flock.center));
    const selected=candidates[Math.floor(this.random()*Math.min(7,candidates.length))];
    if(selected)b.target={...selected};
    else{
      const a=this.random()*Math.PI*2,r=8+this.random()*18;
      const x=flock.center.x+Math.cos(a)*r,z=flock.center.z+Math.sin(a)*r;
      const base=Math.max(h.ground(x,z),h.water(x,z)??-Infinity);
      b.target={id:'air',kind:'perch',x,z,y:base+(b.species==='swallow'&&b.intent==='forage'?2.5:BIRDS[b.species].altitude)};
    }
  }
}
