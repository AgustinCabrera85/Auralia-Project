import * as routes from '../src/world/mountainRoutes.ts';

// Uses the real WorldView collision adapter. Run from the isolated fixture;
// it stops rendering for deterministic simulation. Reload to resume play.
export function verifyMountainRoutes(world){
  const c=world.traversal,zone=world.zones.get('brisalia'),results=[];
  world.engine.stopRenderLoop();
  if(world.mountainPasses.inside)world.mountainPasses.leave('cueva-antigua');
  const input=(dx,dz)=>({moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,
    horizontal:0,vertical:1,run:true,sprint:true,jumpPressed:false});
  const travel=(label,a,b)=>{
    c.teleport(a.x,a.y,a.z);
    const adapter=world.traversalWorld(zone);
    const distance=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/distance,dz=(b.z-a.z)/distance;
    let steps=0,maxFloorError=0;
    for(;steps<distance*12+400;steps++){
      c.step(.025,input(dx,dz),adapter);
      const p=c.position;
      if(world.mountainPasses.inside){const floor=routes.tunnelSurfaceAt(p.x,p.z);
        if(floor)maxFloorError=Math.max(maxFloorError,Math.abs(p.y-floor.height));}
      if((p.x-a.x)*dx+(p.z-a.z)*dz>=distance-.4)break;
    }
    return {label,pass:Math.hypot(c.position.x-b.x,c.position.z-b.z)<1.2&&maxFloorError<.1,steps,maxFloorError};
  };
  for(const bridge of world.mountainPasses.bridges){
    const first=bridge.points[0],last=bridge.points.at(-1);
    results.push(travel(bridge.id+' →',first,last),travel(bridge.id+' ←',last,first));
    c.teleport(last.x,last.y,last.z);
    results.push({label:bridge.id+' salida',pass:world.traversalWorld(zone).canMove(last.x+1,last.z,last.x,last.z,last.y)});
  }
  const counts=()=>[world.scene.meshes.length,world.scene.materials.length,world.scene.textures.length,world.scene.lights.length];
  const before=counts();
  world.mountainPasses.enter('cueva-antigua');
  for(const [a,b] of routes.TUNNEL_LINKS){
    results.push(travel(a+' → '+b,routes.TUNNEL_NODES[a],routes.TUNNEL_NODES[b]));
    results.push(travel(b+' → '+a,routes.TUNNEL_NODES[b],routes.TUNNEL_NODES[a]));
  }
  c.teleport(-300,-100,-640);let ceilingOK=true;
  for(let i=0;i<200;i++){
    c.step(.025,{...input(0,0),vertical:0,jumpPressed:i===0||i===10},world.traversalWorld(zone));
    const p=c.position,surface=routes.tunnelSurfaceAt(p.x,p.z);c.constrainCeiling(surface.ceiling);
    ceilingOK=ceilingOK&&p.y+2.2<=surface.ceiling;
  }
  results.push({label:'doble salto bajo techo',pass:ceilingOK});
  world.mountainPasses.leave('cueva-antigua');
  for(let i=0;i<3;i++){world.mountainPasses.enter('cueva-antigua');world.mountainPasses.leave('cueva-antigua');}
  const after=counts(),disposedRefs=world.scene.lights.some(l=>l.excludedMeshes.some(m=>m.isDisposed()));
  results.push({label:'liberación del interior en cuatro visitas',pass:before.every((n,i)=>n===after[i])&&!disposedRefs,before,after});
  return results;
}

// Follow every bend with continuous movement. Testing only one metre beyond
// an abutment misses a bridge that stops at an impassable hillside.
export function verifyMountainTrails(world){
  world.engine.stopRenderLoop();
  const c=world.traversal,zone=world.zones.get('brisalia'),results=[];
  for(const trail of world.mountainPasses.trails)for(const reverse of [false,true]){
    const joined=[...trail.points];
    for(const [key,atStart]of [[trail.from,true],[trail.to,false]]){
      const [id,side]=key.split(':'),bridge=world.mountainPasses.bridges.find(b=>b.id===id);
      if(!bridge)continue;
      const approach=side==='west'?bridge.points.slice(0,5).reverse():bridge.points.slice(-5);
      if(atStart)joined.unshift(...approach.slice(0,-1));else joined.push(...approach.slice(0,-1).reverse());
    }
    const points=reverse?joined.reverse():joined,a=points[0];
    c.teleport(a.x,a.y,a.z);let index=1,steps=0,badMode=null,stuck=0;
    const adapter=world.traversalWorld(zone);
    const length=points.reduce((sum,p,i)=>sum+(i?Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z):0),0);
    for(;steps<length*30+500&&index<points.length;steps++){
      const goal=points[index],dx=goal.x-c.position.x,dz=goal.z-c.position.z,len=Math.hypot(dx,dz);
      if(len<.55){index++;continue;}
      const oldX=c.position.x,oldZ=c.position.z;
      c.step(.025,{moveX:dx/len,moveZ:dz/len,forwardX:dx/len,forwardZ:dz/len,
        horizontal:0,vertical:1,run:true,sprint:false,jumpPressed:false},adapter);
      stuck=Math.hypot(c.position.x-oldX,c.position.z-oldZ)<.002?stuck+1:0;
      if(stuck>80)break;
      if(c.mode==='climbing'||c.mode==='swimming'||c.mode==='mantling'){badMode=c.mode;break;}
    }
    results.push({label:trail.id+(reverse?' ←':' →'),pass:index===points.length&&!badMode,
      steps,point:index,badMode,position:{...c.position},goal:points[index]});
  }
  return results;
}
