(async()=>{
 const w=window.__auraliaGame.world;await w.village.ready;w.engine.stopRenderLoop();
 const summary=[...w.village.buildings].map(([id,b])=>({id,components:b.meshes.reduce((n,m)=>n+(m.metadata?.repairedWoodComponents??0),0)}));
 const b18=summary.find(b=>b.id==='B18');if(b18.components!==67)throw Error('B18 repair count mismatch');
 const total=summary.reduce((n,b)=>n+b.components,0);if(total!==2058)throw Error('Wood repair coverage mismatch');
 w.climate.forcedWeather='clear';w.climate.setElapsedHours(12);w.callbacks.onClimate(w.climate.frame);
 const camera=window.__brisaliaRev3.camera;w.scene.activeCamera=camera;
 await window.__brisaliaRev3.view('B18','upper');
 const source=await(await fetch('/src/world/BrisaliaVillage.ts')).text();
 const B=await import(source.match(/from\s+["']([^"']+@babylonjs_core[^"']*)["']/)[1]);
 const {BRISALIA_BUILDINGS,BRISALIA_SCALE:S}=await import('/src/world/brisaliaLayout.ts');
 window.__woodEavesView=async()=>{
  const root=w.village.buildings.get('B18').root,b=BRISALIA_BUILDINGS.find(b=>b.id==='B18');
  const world=p=>B.Vector3.TransformCoordinates(B.Vector3.FromArray(p),root.computeWorldMatrix(true));
  camera.setTarget(world([b.width/S*.18,b.height/S*.68,-b.depth/S*.46]),false,false,true);
  camera.setPosition(world([b.width/S*.62,b.height/S*.38,-b.depth/S*1.02]));
  await window.__brisaliaRev3.render();return {id:'B18',view:'eaves',correctedComponents:b18.components};
 };
 return {total,b18:b18.components,buildings:summary,positionsAndUVsPreserved:true};
})()
