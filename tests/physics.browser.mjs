export function verifySecondaryDynamics(world){
  world.engine.stopRenderLoop();
  const passes=world.mountainPasses,solver=passes.secondaryDynamics,results=[];
  if(passes.inside)passes.leave('cueva-antigua');
  const count=()=>({meshes:world.scene.meshes.length,geometries:world.scene.geometries.length,materials:world.scene.materials.length,textures:world.scene.textures.length,lights:world.scene.lights.length,chains:solver.chains.size});
  const before=count(),first=solver.chains.values().next().value,anchor={...first.anchor};
  const initial=first.p.slice();first.impulse(2,0,0);
  const times=[];
  for(let frame=0;frame<360;frame++){
    passes.update(anchor.x,anchor.y-4,anchor.z+3,1/60);
    if(frame>60)times.push(solver.metrics.simulationMs+solver.metrics.reconstructionMs);
  }
  times.sort((a,b)=>a-b);
  results.push({label:'faroles integrados en el mapa, con movimiento y buffers finitos',pass:first.p.some((v,i)=>Math.abs(v-initial[i])>.01)&&[...solver.chains.values()].every(c=>c.p.every(Number.isFinite)),medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)]});
  results.push({label:'anclajes y longitud de las cadenas',pass:Math.abs(first.p[1]-anchor.y)<1e-7&&solver.metrics.maxLengthError<.015,error:solver.metrics.maxLengthError});
  let contacts=0;
  const end=first.p.slice(-3);
  for(let i=0;i<30;i++){passes.update(end[0]-.6+i*.04,end[1]-1,end[2],1/60);contacts+=solver.metrics.contacts;}
  results.push({label:'cápsula de Santi interactúa con el farol',pass:contacts>0,contacts});
  for(let i=0;i<20;i++)passes.update(2000,0,2000,1/60);
  results.push({label:'suspensión fuera de la región',pass:solver.metrics.active===0&&solver.metrics.culled===6});
  for(let visit=0;visit<12;visit++){
    const p=passes.enter('cueva-antigua');passes.update(p.x,p.y,p.z,1/60);
    passes.leave('cueva-antigua');
  }
  const after=count();
  results.push({label:'12 descargas del interior sin acumular recursos ni cadenas',pass:Object.keys(before).every(k=>before[k]===after[k]),before,after});
  passes.update(anchor.x,anchor.y-4,anchor.z+3,1/60);
  return {results,metrics:{...solver.metrics},drawMeshes:passes.hanging.reduce((n,g)=>n+(g.root.isEnabled()?2:0),0)};
}
