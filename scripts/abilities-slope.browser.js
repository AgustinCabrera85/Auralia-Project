// Deterministic sloped collider with the production planner, terrain walls and animated GLBs.
(async()=>{
  const {world:w}=window.__auraliaGame;w.engine.stopRenderLoop();
  window.__rootsSlopeQa?.manager.dispose();window.__rootsSlopeQa?.scene.dispose();
  const coreUrl=performance.getEntriesByType('resource').find(r=>r.name.includes('/@babylonjs_core.js?v='))?.name;
  if(!coreUrl)throw Error('The loaded Babylon module was not found');
  const B=await import(coreUrl);
  const {RootsSurfaceAdapter}=await import('/src/game/abilities/RootsSurfaceAdapter.ts');
  const {RootsFx}=await import('/src/game/abilities/RootsFx.ts');
  const {terrainWallAt}=await import('/src/game/TerrainTraversal.ts');
  const {AbilityManager}=await import('/src/domain/abilities/AbilityManager.ts');
  const {ForestRootsBehavior,AbilityTargets}=await import('/src/domain/abilities/forestRoots.ts');
  const {ABILITIES}=await import('/src/domain/abilities/catalog.ts');
  const assert=(ok,m)=>{if(!ok)throw Error(m);};
  const scene=new B.Scene(w.engine);scene.clearColor=new B.Color4(.12,.16,.19,1);
  new B.ArcRotateCamera('slope-QA',-Math.PI/2-.4,1,30,new B.Vector3(0,2,0),scene);
  const light=new B.HemisphericLight('slope-light',new B.Vector3(0,1,-1),scene);light.intensity=1.5;
  const ground=B.MeshBuilder.CreateGround('slope',{width:28,height:28,subdivisions:1,updatable:true},scene);
  const height=(x,z)=>2+.7*x;
  const positions=ground.getVerticesData('position'),normals=ground.getVerticesData('normal');
  for(let i=0;i<positions.length;i+=3)positions[i+1]=height(positions[i],positions[i+2]);
  B.VertexData.ComputeNormals(positions,ground.getIndices(),normals);
  ground.updateVerticesData('position',positions);ground.updateVerticesData('normal',normals);ground.refreshBoundingInfo();
  const material=new B.StandardMaterial('slope-soil',scene);material.diffuseColor=new B.Color3(.22,.36,.16);ground.material=material;
  const traversal={
    ground:(x,z,origin,max)=>{
      const hit=scene.pickWithRay(new B.Ray(new B.Vector3(x,origin,z),new B.Vector3(0,-1,0),max),m=>m===ground);
      return hit?.hit?{height:hit.pickedPoint.y,normalY:hit.getNormal(true).y}:null;
    },
    wall:(...args)=>terrainWallAt(height,...args),headroom:()=>true,canMove:()=>true,waterLevel:()=>null
  };
  const surfaces=new RootsSurfaceAdapter(()=>traversal,()=>({x:0,y:0,z:0}),()=>true,()=>10);
  const fx=new RootsFx(scene);fx.prepare();
  for(let i=0;i<400&&fx.diagnostics.state==='loading';i++)await new Promise(r=>setTimeout(r,25));
  assert(fx.ready().ok,'GLBs did not load');
  const context={unlocked:['forest_roots'],equipment:'sword',swordLevel:4,levels:{},playerState:'grounded',
    position:{x:0,y:2,z:0},scope:'slope-QA',blocked:null,actionBusy:false,facts:{}};
  const manager=new AbilityManager(ABILITIES,()=>context,{prepare:()=>fx.prepare(),ready:()=>fx.ready(),
    start:()=>true,fx:e=>fx.start(e),update:e=>fx.update(e),end:()=>fx.clear(),dispose:()=>fx.dispose()});
  manager.register('forest_roots',new ForestRootsBehavior(surfaces,new AbilityTargets()));
  assert(manager.request('forest_roots').ok,'attack rejected');manager.update(.4);
  const e=manager.execution;assert(e?.plan.placements.length===48,'missing slope roots');
  const sequence=[],inclinations=[];
  for(const ring of e.profile.rings){
    manager.update(e.timeline.fx[0]+ring.delay+.03-e.elapsed);scene.render();
    sequence.push(fx.pool.filter(p=>p.root.isEnabled()).length);
    const ringIndex=e.profile.rings.indexOf(ring),index=e.plan.placements.findIndex(p=>p.ring===ringIndex);
    const instance=fx.pool[index],before=instance.root.position.clone();manager.update(.12);scene.render();
    assert(instance.root.position.equalsWithEpsilon(before,1e-8),'lean displaced root base');
    const p=e.plan.placements[index],normal=new B.Vector3(p.normal.x,p.normal.y,p.normal.z);
    const tangent=new B.Vector3(-p.z,0,p.x).normalize();tangent.subtractInPlace(normal.scale(B.Vector3.Dot(tangent,normal))).normalize();
    instance.root.computeWorldMatrix(true);const up=instance.root.getDirection(B.Vector3.Up()).normalize();
    const inclination=B.Vector3.Dot(up,tangent);
    assert(Math.sign(inclination)===(ringIndex%2===0?1:-1),'slope tip inclination did not alternate');inclinations.push(inclination);
    for(let j=0;j<fx.pool.length;j++)if(fx.pool[j].root.isEnabled()){
      const p=fx.pool[j].root.position;assert(Math.abs(p.y-height(p.x,p.z))<1e-5,'leaning root left the slope');
    }
  }
  assert(JSON.stringify(sequence)==='[6,16,30,48]','wrong slope sequence');
  manager.update(1.5-e.elapsed);scene.render();await scene.whenReadyAsync();
  for(let frame=0;frame<3;frame++){scene.render();await new Promise(r=>setTimeout(r,32));}
  const roots=fx.pool.map((instance,index)=>{
    let above=-Infinity;
    for(const mesh of instance.root.getChildMeshes()){
      const base=mesh.getVerticesData('position');if(!base)continue;
      const morphs=mesh.morphTargetManager,targets=morphs?Array.from({length:morphs.numTargets},(_,i)=>morphs.getTarget(i)):[];
      const world=mesh.computeWorldMatrix(true);
      for(let i=0;i<base.length;i+=3){
        const p=new B.Vector3(base[i],base[i+1],base[i+2]);
        for(const target of targets){const q=target.getPositions();if(!q)continue;
          p.x+=(q[i]-base[i])*target.influence;p.y+=(q[i+1]-base[i+1])*target.influence;p.z+=(q[i+2]-base[i+2])*target.influence;
        }
        const v=B.Vector3.TransformCoordinates(p,world);above=Math.max(above,v.y-height(v.x,v.z));
      }
    }
    assert(above>.5,`root ${index} remained buried`);
    const p=e.plan.placements[index];assert(Math.abs(p.y-height(p.x,p.z))<1e-5,'root anchor is not on collider');
    return {ring:p.ring,anchorY:p.y,scale:instance.root.scaling.x,aboveGround:above};
  });
  window.__rootsSlopeQa={scene,manager};
  return {grade:.7,sequence,inclinations,roots:roots.length,uphillRoots:roots.filter(r=>r.anchorY>2.01).length,
    minEmergence:Math.min(...roots.map(r=>r.aboveGround)),minAnchorY:Math.min(...roots.map(r=>r.anchorY)),
    maxAnchorY:Math.max(...roots.map(r=>r.anchorY)),allAnchoredOnCollider:true,allModelsEmerged:true};
})()
