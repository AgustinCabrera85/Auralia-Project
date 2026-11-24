(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<1200&&!window.__auraliaGame?.world.santi?.isReady;i++)await wait(50);
 const w=window.__auraliaGame.world;window.dispatchEvent(new Event('focus'));
 if(!w.volcanicCave.inside)await w.enterIgneousRealm('A0',true);
 w.engine.stopRenderLoop();const r=w.volcanicCave.realm,p=r.point([22,14,-25.75]),hit=r.colliders.queryGround(p.x,p.z,p.y+5,20,0);
 w.player.position.set(p.x,hit.height,p.z);w.traversal.teleport(p.x,hit.height,p.z);
 w.player.rotation.y=Math.atan2(6,-7.5);w.pressed.clear();
 const santi=w.santi,align=santi.alignIdleAnkle;
 const step=()=>{w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();};
 for(let i=0;i<90;i++){w.cameraFrameDt=1/60;w.update(1/60);w.scene.render();}
 const sample=()=>{
  const point=n=>{n.computeWorldMatrix(true);return n.absolutePosition.clone();};
  const right=point(santi.idleShoulders[1]).subtract(point(santi.idleShoulders[0])),forward=new right.constructor(-right.z,0,right.x).normalize();
  const lead=santi.idleFeet.map((f,i)=>({f,lead:point(f.foot).subtract(point(santi.idleFeet[1-i].foot)).dot(forward)})).sort((a,b)=>b.lead-a.lead)[0].f;
  const direction=point(lead.toe).subtract(point(lead.foot));direction.y=0;direction.normalize();
  return {forward,foot:lead.foot.name,toeInDegrees:-lead.side*Math.atan2(forward.z*direction.x-forward.x*direction.z,forward.dot(direction))*180/Math.PI};
 };
 // Compare the same source pose and transforms, not different idle frames.
 santi.alignIdleAnkle=()=>{};for(let i=0;i<30;i++)step();
 const before=sample(),knees=santi.idleFeet.map(f=>({node:f.foot.parent,rotation:f.foot.parent.rotationQuaternion.clone(),position:f.foot.absolutePosition.clone()}));
 santi.alignIdleAnkle=align;santi.alignIdleAnkle();const corrected=sample();
 if(corrected.toeInDegrees>.2||corrected.toeInDegrees>=before.toeInDegrees)throw Error('Idle toe-in not corrected');
 if(knees.some(k=>!k.node.rotationQuaternion.equalsWithEpsilon(k.rotation,1e-7)))throw Error('Knee/shin rotation changed');
 if(santi.idleFeet.some((f,i)=>{f.foot.computeWorldMatrix(true);return f.foot.absolutePosition.subtract(knees[i].position).length()>.001;}))throw Error('Ankle pivot moved');
 const capture=enabled=>{
  santi.alignIdleAnkle=enabled?align:()=>{};
  for(let i=0;i<30;i++)step();
  w.camera.alpha=Math.atan2(before.forward.z,before.forward.x);w.camera.beta=1.22;w.camera.radius=8;w.cameraPreferredRadius=w.cameraAppliedRadius=8;
  w.scene.render();
 };
 window.__ankleIdleQA={w,capture};capture(true);
 return {scene:'Reino Igneo stairs',active:santi.active.name,foot:before.foot,beforeToeInDegrees:before.toeInDegrees,afterToeInDegrees:corrected.toeInDegrees,kneeAndShinUnchanged:true,anklePivotUnchanged:true,contact:santi.footContact};
})()
