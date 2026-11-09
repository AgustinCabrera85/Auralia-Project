import {GROTTO_NODES,GROTTO_PORTALS,GROTTO_WATER,grottoSurfaceAt,LAGOON_SPRINGS,LAGOON_FALLS} from '../src/world/lagoonData.ts';
import {Ray,Vector3,Matrix} from '@babylonjs/core';
const check=(condition,message)=>{if(!condition)throw new Error(message);};
export async function verifyLagoon(world){
  for(let i=0;i<80&&!world.santi.isReady;i++)await new Promise(r=>setTimeout(r,250));
  world.engine.stopRenderLoop();world.scene.activeCamera=world.camera;
  const results=[],zone=world.zones.get('brisalia');
  const input=(extra={})=>({moveX:0,moveZ:0,forwardX:1,forwardZ:0,horizontal:0,vertical:0,
    run:false,sprint:false,jumpPressed:false,...extra});
  const enter=id=>{const p=world.lagoon.enter(id);world.traversal.teleport(p.x,p.y,p.z);};
  const traverse=(from,to)=>{
    const a=GROTTO_NODES[from],b=GROTTO_NODES[to],c=world.traversal;
    if(Math.hypot(c.position.x-a.x,c.position.z-a.z)>1)c.teleport(a.x,a.y,a.z);
    const start={...c.position};let frames=0;
    while(Math.hypot(c.position.x-b.x,c.position.z-b.z)>.3&&frames++<6500){
      const dx=b.x-c.position.x,dz=b.z-c.position.z,len=Math.hypot(dx,dz);
      c.step(1/60,input({moveX:dx/len,moveZ:dz/len,vertical:1,swimVertical:1}),world.traversalWorld(zone));
      const surface=grottoSurfaceAt(c.position.x,c.position.z);check(surface,'never leave tunnel support');
      c.constrainCeiling(surface.ceiling);
      check(c.position.y+3.8<=surface.ceiling+.01,'head stays below the visible roof');
      check(c.position.y>=surface.height-.05,'feet remain above the cave floor');
    }
    check(frames<6500,`blocked in ${from}-${to}: ${JSON.stringify(c.position)}`);
    results.push({route:from+' → '+to,frames,mode:c.mode,distance:Math.hypot(c.position.x-start.x,c.position.z-start.z)});
  };
  enter('laguna-sumergida');
  traverse('boca','sifon');traverse('sifon','recodo');traverse('recodo','sala');
  check(world.traversal.mode==='swimming','inner lake remains swimmable');
  traverse('sala','sendero');traverse('sendero','mirador');
  check(world.traversal.mode==='grounded','dry exit resumes walking');
  world.lagoon.leave('gruta-mirador');
  enter('gruta-bosque');traverse('bosque','galeria');traverse('galeria','sala');
  traverse('sala','recodo');traverse('recodo','sifon');traverse('sifon','boca');
  world.lagoon.leave('laguna-sumergida');
  const counts=()=>({meshes:world.scene.meshes.length,lights:world.scene.lights.length,
    materials:world.scene.materials.length,rockColliders:world.lagoon.rockColliders.activeColliderCount});
  const before=counts();
  for(let i=0;i<8;i++){enter(GROTTO_PORTALS[i%3].id);world.lagoon.leave(GROTTO_PORTALS[i%3].id);}
  check(JSON.stringify(counts())===JSON.stringify(before),'repeated visits dispose cave meshes/lights');
  world.traversal.teleport(-160,22.35,-810);world.traversal.mode='swimming';
  world.player.position.set(-160,22.35,-810);
  world.santi.update(1/60,{mode:'swimming',moving:true,movementIntent:true,run:false,sprint:false,
    backward:false,feetY:22.35,jumpStarted:false,doubleJumpStarted:false});
  world.scene.render();
  check(world.santi.active?.name==='Swimming (3)','real NLA swimming action is active');
  check(world.traversalWorld(zone).waterLevel(-160,-810)===24,'surface collider is the rendered lake level');
  check(GROTTO_WATER===-110,'cave lake datum');
  return {results,counts:counts(),repeatVisits:8,swimmingClip:world.santi.active.name};
}
export function checkGrottoGeometry(world){
  if(!world.lagoon.inside)world.lagoon.enter('laguna-sumergida');
  const paths=[['boca','sifon'],['sifon','recodo'],['recodo','sala'],['sala','sendero'],
    ['sendero','mirador'],['sala','galeria'],['galeria','bosque']];
  world.scene.render();
  return paths.map(([aa,bb])=>{
    const a=GROTTO_NODES[aa],b=GROTTO_NODES[bb];let collisions=[];
    const length=Math.hypot(b.x-a.x,b.z-a.z);
    for(let s=1;s<length-1;s+=1){
      const x=a.x+(b.x-a.x)*s/length,z=a.z+(b.z-a.z)*s/length;
      const xx=a.x+(b.x-a.x)*(s+1)/length,zz=a.z+(b.z-a.z)*(s+1)/length;
      const start=new Vector3(x,grottoSurfaceAt(x,z).height+2,z),end=new Vector3(xx,grottoSurfaceAt(xx,zz).height+2,zz);
      const ray=new Ray(start,end.subtract(start).normalize(),Vector3.Distance(start,end));
      if(world.lagoon.interior.getChildMeshes().some(m=>m.material===world.lagoon.stone||m.material===world.lagoon.wetStone
        ?ray.intersectsMesh(m,false).hit:false))collisions.push(+s.toFixed(1));
    }
    return {route:aa+'-'+bb,collisions};
  });
}

export async function verifyUnderwater(world){
  for(let i=0;i<80&&!world.santi.isReady;i++)await new Promise(r=>setTimeout(r,250));
  world.engine.stopRenderLoop();world.scene.activeCamera=world.camera;
  if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  const place=(x,y,z,beta,alpha)=>{
    world.traversal.teleport(x,y,z);world.traversal.mode='swimming';world.player.position.set(x,y,z);
    world.camera.setTarget(new Vector3(x,y+1.25,z));world.camera.alpha=alpha;world.camera.beta=beta;
    world.cameraPreferredRadius=11.5;world.cameraAppliedRadius=11.5;world.camera.radius=11.5;
    world.update(1/60);world.scene.render();
  };
  const results=[];
  for(const y of [22.35,20,14,7])for(const beta of [.4,1.1,1.85])for(const alpha of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    place(-160,y,-810,beta,alpha);
    const p=world.player.position.add(new Vector3(0,1.25,0));
    const projected=Vector3.Project(p,Matrix.Identity(),world.scene.getTransformMatrix(),world.camera.viewport.toGlobal(1,1));
    check(projected.x>.35&&projected.x<.65&&projected.y>.35&&projected.y<.65,'swimmer remains centred throughout orbit');
    if(y<21)check(world.camera.position.y<23.5,'diver and camera remain below the same waterline');
    check(world.camera.position.y>6.45,'camera stays above the real bed');
    results.push({y,beta,alpha,radius:world.camera.radius});
  }
  check(world.lagoon.pool.needAlphaBlending(),'water does not hide the submerged body');
  check(world.lagoon.swimmerLight.includedOnlyMeshes.some(m=>m.name.includes('Santi')),'underwater fill includes the loaded avatar');
  const counts=()=>[world.scene.meshes.length,world.scene.materials.length,world.scene.lights.length,world.scene.textures.length];
  const before=counts();
  for(let i=0;i<20;i++){
    world.lagoon.updateView(new Vector3(-160,14,-810),world.player.position,24,world.player);
    check(world.scene.fogDensity<.022,'clear near field underwater');
    world.lagoon.updateView(new Vector3(-160,30,-810),new Vector3(-160,30,-810),24,world.player);
    check(!world.lagoon.swimmerLight.isEnabled(),'fill is disabled outside water');
  }
  check(JSON.stringify(before)===JSON.stringify(counts()),'waterline crossings reuse resources');
  world.lagoon.enter('laguna-sumergida');
  for(const id of ['boca','sifon','recodo'])for(const alpha of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const n=GROTTO_NODES[id];place(n.x,n.y+2,n.z,1.1,alpha);
    const eye=world.camera.position,surface=grottoSurfaceAt(eye.x,eye.z,.6);
    check(surface&&eye.y>surface.height&&eye.y<surface.ceiling,'cave camera stays inside the tunnel');
  }
  world.lagoon.leave('laguna-sumergida');
  return {surfaceAndDiveOrbits:results.length,caveOrbits:12,waterlineCycles:20,resourcesStable:true};
}

export async function reviewSpring(world){
  world.engine.stopRenderLoop();if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  world.scene.activeCamera=world.camera;
  review.place(-744,-1515,-1.6,1.2,12);
  for(let i=0;i<1600;i++){world.update(1/60);if(i%80===0){world.scene.render();await new Promise(r=>setTimeout(r,2));}}
  const results=[];
  for(const [i,s] of LAGOON_SPRINGS.entries()){
    const m=world.scene.getMeshByName('naciente-poza-'+i);check(m,'each river has a rounded spring pool');
    const p=m.getVerticesData('position'),start=1+11*49;let gap=0;
    for(let k=0;k<49;k++){const j=(start+k)*3;gap=Math.max(gap,Math.abs(p[j+1]-.045-world.lagoon.heightAt(p[j],p[j+2])));}
    check(gap<.08,'no free upstream water edge: pool perimeter meets terrain');
    const mouth=new Vector3(s.x-s.dx*s.mouthDistance,s.level+4,s.z-s.dz*s.mouthDistance);
    const ray=new Ray(mouth,new Vector3(0,-1,0),8);
    const waterMeshes=world.scene.meshes.filter(m=>m.isEnabled()&&
      [world.lagoon.river,world.lagoon.pool,world.lagoon.fall].includes(m.material));
    const hits=ray.intersectsMeshes(waterMeshes,false);
    check(hits.length>0,'water reaches the rock opening');
    check(hits.every(h=>Math.abs(h.pickedPoint.y-s.level-.045)<.01),
      'spring has one continuous waterline, not a floating waterfall patch');
    results.push({spring:s.id,maxShoreGap:gap,mouthWaterLevel:hits[0].pickedPoint.y});
  }
  review.overview(-681,-1454,166,-716,-1516,153);
  await new Promise(r=>setTimeout(r,2000));world.scene.render();world.scene.render();
  return results;
}

export async function reviewWaterfallJoins(world){
  world.engine.stopRenderLoop();if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  world.scene.activeCamera=world.camera;review.place(-249,-873,Math.PI/2,1.35,8);
  for(let i=0;i<1400;i++){world.update(1/60);if(i%80===0){world.scene.render();await new Promise(r=>setTimeout(r,2));}}
  const joins=LAGOON_FALLS.map((f,i)=>{
    const river=world.scene.getMeshByName('vertientes-río-'+i).getVerticesData('position');
    const fall=world.scene.getMeshByName('cascada-'+f.id).getVerticesData('position');
    let gap=0;
    for(let k=0;k<25;k++)for(let a=0;a<3;a++)gap=Math.max(gap,Math.abs(river[river.length-75+k*3+a]-fall[k*3+a]));
    check(gap<.001,'river and waterfall lip share the exact same cross-section');
    check(fall[fall.length-2]<24,'fall penetrates the receiving pool');
    return {fall:f.id,maxLipGap:gap};
  });
  const pool=world.scene.getMeshByName('laguna-superficie').getVerticesData('position');
  let variation=0;for(let i=1;i<pool.length;i+=3)variation=Math.max(variation,Math.abs(pool[i]-24.04));
  check(variation<.001,'no folded underwater shoreline triangles');
  const origin=new Vector3(-272,29,-876),stray=new Vector3(-302.59,33.317,-907.48);
  const ray=new Ray(origin,stray.subtract(origin).normalize(),Vector3.Distance(origin,stray)+.5);
  check(!world.scene.meshes.some(m=>m.name.startsWith('agua-chunk')&&ray.intersectsMesh(m,false).hit),
    'legacy water does not produce a hanging strip beside Ferragris');
  review.overview(-272,-876,29,-286,-920,32);
  await new Promise(r=>setTimeout(r,1500));world.scene.render();world.scene.render();
  return {joins,poolHeightVariation:variation};
}

export async function reviewSpaceDive(world){
  world.engine.stopRenderLoop();if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  world.scene.activeCamera=world.camera;world.traversal.teleport(-160,22.35,-810);
  world.traversal.mode='swimming';world.player.position.set(-160,22.35,-810);
  world.camera.setTarget(new Vector3(-160,23.6,-810));world.camera.alpha=-Math.PI/2;world.camera.beta=1.3;
  const tick=async frames=>{for(let i=0;i<frames;i++){world.update(1/60);if(i%12===0){world.scene.render();await new Promise(r=>setTimeout(r,1));}}};
  await tick(900);
  window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}));
  await tick(120);
  // Browser autorepeat while held cannot flip back to the surface.
  window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',repeat:true}));
  await tick(180);window.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space'}));
  check(Math.abs(world.player.position.y-16)<.04,'Space held dives exactly once');
  await tick(120);const diveY=world.player.position.y;
  check(Math.abs(diveY-16)<.04,'swimmer holds depth without holding a key');
  check(world.speedMotionBlur.active,'underwater colour and peripheral distortion are active');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space'}));
  await tick(300);const surfaceY=world.player.position.y;
  check(Math.abs(surfaceY-22.35)<.04,'next Space press returns to surface');
  window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space'}));
  window.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space'}));
  await tick(300);await new Promise(r=>setTimeout(r,1500));world.scene.render();world.scene.render();
  return {diveY,surfaceY,heldKeyDoesNotRepeat:true,underwaterEffect:world.speedMotionBlur.active};
}

export async function reviewRockContacts(world){
  const {waterSurfaceAt}=await import('../src/world/geographicFeatures.ts');
  const {setWorldWaterContacts}=await import('../src/world/editor/LiveWaterProfiles.ts');
  world.engine.stopRenderLoop();if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  world.scene.activeCamera=world.camera;review.place(-363,-966,-2,1.05,14);
  for(let i=0;i<1400;i++){world.update(1/60);if(i%60===0){world.scene.render();await new Promise(r=>setTimeout(r,2));}}
  const contacts=world.props.waterContacts(-363,-966,(x,z)=>waterSurfaceAt(x,z)?.level??null);
  check(contacts.length>0&&contacts.length<=8,'real streamed rocks provide bounded water contacts');
  const river=world.scene.getMeshByName('vertientes-río-0'),flow=river.getVerticesData('uv2');
  check(flow?.length===river.getTotalVertices()*2&&flow.some(v=>Math.abs(v)>.1),'river mesh supplies current direction');
  const material=world.lagoon.river;
  check(material.getEffect()?.isReady()&&!material.getEffect().getCompilationError(),'contact shader compiles on WebGL');
  check(material._vectors4Arrays.uWaterContactInfo[3]>0,'contact data reaches the rendered shader');
  const counts=()=>[world.scene.meshes.length,world.scene.materials.length,world.scene.textures.length];
  const before=counts();
  for(let i=0;i<20;i++){world.waterContactTimer=0;world.update(1/60);world.scene.render();}
  check(JSON.stringify(before)===JSON.stringify(counts()),'contact refreshes create no meshes, materials or textures');
  setWorldWaterContacts(world.scene,[]);world.scene.render();
  check(material._vectors4Arrays.uWaterContactInfo.every(v=>v===0),'unloaded contacts clear every shader slot');
  setWorldWaterContacts(world.scene,contacts);
  const c=contacts[0];review.overview(c.x-7,c.z-14,c.level+8,c.x,c.z,c.level);
  world.scene.render();world.scene.render();
  return {contacts,shaderCompiled:true,riverDirection:true,resourcesStable:true,clearedWithoutGhosts:true};
}

export async function verifyGeneratedRockCollisions(world){
  world.engine.stopRenderLoop();world.scene.activeCamera=world.camera;
  if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  const zone=world.zones.get('brisalia'),rocks=world.lagoon.rockColliders;
  review.place(-694,-1553,1.5,1.2,11.5);
  for(let i=0;i<900;i++){
    world.update(1/60);
    if(i%60===0){world.scene.render();await new Promise(r=>setTimeout(r,2));}
  }
  const start={x:-694,y:world.walkHeightAt(-694,-1553),z:-1553};
  const dx=-11/Math.hypot(11,12),dz=12/Math.hypot(11,12);
  const wall=world.traversalWorld(zone).wall(start.x,start.y+1.8,start.z,dx,dz,30);
  check(wall?.rockId.startsWith('generated-rock:'),'real WorldView registers the spring boulders');
  const proxies=world.lagoon.exterior.getChildMeshes().filter(m=>m.metadata?.rockCollider);
  const modes=[];
  for(const motion of ['walk','sprint','roll','jump']){
    const c=world.traversal;c.teleport(start.x,start.y,start.z);
    if(motion==='roll')c.beginActionMotion('roll',dx,dz,30,1);
    for(let i=0;i<100;i++){
      c.step(1/60,{moveX:dx,moveZ:dz,forwardX:dx,forwardZ:dz,horizontal:0,vertical:1,
        run:motion==='sprint',sprint:motion==='sprint',jumpPressed:motion==='jump'&&(i===0||i===20)},world.traversalWorld(zone));
      const p=c.position,centre=new Vector3(p.x,p.y+1.8,p.z);
      for(const proxy of proxies){
        if(!proxy.getBoundingInfo().boundingBox.intersectsPoint(centre))continue;
        const enclosed=[Vector3.Left(),Vector3.Right(),Vector3.Forward(),Vector3.Backward()].every(d=>
          new Ray(centre,d,100).intersectsMesh(proxy,false).hit);
        check(!enclosed,`${motion} entered solid procedural rock`);
      }
    }
    modes.push({motion,mode:c.mode,position:{...c.position}});
  }
  // Sudden mouse orbits must be clipped on this frame, including the near-plane edges.
  let clipped=0;const camera=world.camera;
  const x=start.x+dx*4,z=start.z+dz*4,y=world.walkHeightAt(x,z);
  world.traversal.teleport(x,y,z);world.player.position.set(x,y,z);
  for(const beta of [.65,1.2,1.65])for(let i=0;i<24;i++){
    camera.alpha=i*Math.PI/12;camera.beta=beta;camera.setTarget(new Vector3(x,y+2.05,z));
    camera.radius=11.5;world.cameraAppliedRadius=11.5;world.cameraPreferredRadius=11.5;
    world.updateCameraOcclusion(1/60,zone);camera.getViewMatrix(true);
    if(camera.radius<11)clipped++;
    const hit=rocks.queryCameraObstruction(camera.getTarget(),camera.position,.15);
    check(hit===null,`camera penetrates a generated rock at orbit ${i}, beta ${beta}`);
  }
  check(clipped>5,'near rocks actually shorten the orbit');
  review.place(x,z,Math.atan2(dz,dx)+Math.PI,1.2,11.5);
  for(let i=0;i<10;i++){world.update(1/60);world.scene.render();await new Promise(r=>setTimeout(r,100));}
  return {generatedShells:rocks.activeColliderCount,modes,cameraOrbits:72,clippedOrbits:clipped};
}
