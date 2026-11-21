// Real playable scene audit. Leaves window.__brisaliaRev3.view(id, detail) for captures.
(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(ok,m)=>{if(!ok)throw Error(m);};
  for(let i=0;i<600&&!window.__auraliaGame?.world;i++)await wait(50);
  const w=window.__auraliaGame.world;await w.village.ready;
  check(w.village.errors.length===0,w.village.errors.join('\n'));
  w.engine.stopRenderLoop();w.pressed.clear();w.sprintDust.reset();w.abilities.resetScene();
  w.climate.forcedWeather='clear';w.climate.setElapsedHours(12);
  const source=await(await fetch('/src/world/BrisaliaVillage.ts')).text();
  const coreUrl=source.match(/from\s+["']([^"']+@babylonjs_core[^"']*)["']/)?.[1],B=await import(coreUrl);
  const {BRISALIA_BUILDINGS,BRISALIA_SCALE:S,brisaliaApproach}=await import('/src/world/brisaliaLayout.ts');
  const before=await(await fetch('/artifacts/brisalia-rev3/placements-before.json')).json();
  const report={buildings:[],textures:{},errors:[...w.village.errors]};
  check(w.village.buildings.size===28,'Expected 27 houses plus the existing castle');
  const allTextures=new Set(),shared=new Map();
  for(const b of BRISALIA_BUILDINGS){
    const old=before.find(x=>x.id===b.id),placed=w.village.buildings.get(b.id),root=placed.root;
    check(root.metadata.revision===(b.id==='B28'?5:3),`${b.id} revision`);
    check(w.scene.transformNodes.filter(n=>n.name===`brisalia:${b.id}`).length===1,`${b.id} duplicate root`);
    check(Math.abs(root.position.x-w.village.origin.x-old.x*S)<1e-6&&
      Math.abs(root.position.z-w.village.origin.z-old.z*S)<1e-6,`${b.id} moved`);
    check(Math.abs(root.rotation.y-old.yaw*Math.PI/180)<1e-8&&Math.abs(root.scaling.x-S)<1e-8,`${b.id} transform changed`);
    const min=new B.Vector3(Infinity,Infinity,Infinity),max=new B.Vector3(-Infinity,-Infinity,-Infinity);
    const materials=new Set(placed.meshes.flatMap(m=>m.material?.subMaterials??[m.material]).filter(Boolean));
    for(const mesh of placed.meshes){
      const box=mesh.getBoundingInfo().boundingBox;min.minimizeInPlace(box.minimumWorld);max.maximizeInPlace(box.maximumWorld);
    }
    check(Math.abs(max.x-min.x-b.width)<.05&&Math.abs(max.z-min.z-b.depth)<.05&&Math.abs(max.y-min.y-b.height)<.05,`${b.id} bounds/axis mismatch`);
    const pbr=[...materials].filter(m=>m.albedoTexture&&m.bumpTexture&&m.metallicTexture);
    check(pbr.length>0,`${b.id} lost PBR maps`);
    const names=placed.meshes.flatMap(m=>m.metadata?.sourceNames??[]);
    const index=Number(b.id.slice(1));
    if(index>=7&&index<=26)check(!names.some(n=>/dressed_corner_stones|planter_herb/i.test(n)),`${b.id} obsolete corners/plants`);
    let flowers=0,foliage=0;
    if(b.revision===3){
      for(const material of materials){
        for(const t of material.getActiveTextures()){
          check(t.isReady(),`${b.id} unready texture ${t.name}`);allTextures.add(t);
          const url=t.url??t.name;
          if(!url.includes('shared_textures'))continue;
          const ids=shared.get(url)??new Set();ids.add(t.getInternalTexture()?.uniqueId);shared.set(url,ids);
        }
        if(/daisy|herb_tuft/i.test(material.name)){
          check(material.needAlphaBlending()||material.needAlphaTesting(),`${b.id} lost plant transparency`);
          check(!material.backFaceCulling,`${b.id} crossed foliage became one-sided`);
        }
      }
      flowers=names.filter(n=>/daisies/i.test(n)).length;foliage=names.filter(n=>/herbs|herb_volume/i.test(n)).length;
      if([2,4,5].includes(index)||index>=7&&index<=26)check(flowers>0&&foliage>0,`${b.id} missing separate flowers/leaves`);
      for(const m of placed.meshes.filter(m=>m.metadata?.sourceNames?.some(n=>/corner_wear|joint_wear|herbs|daisies|herb_volume/i.test(n))))
        check(m.metadata.buildingCollision===false,`${b.id} visual layer blocks navigation`);
      const at=brisaliaApproach(b),front=(b.id==='B01'?1:-1)*(b.yaw===180?-1:1);
      const hit=w.village.wall(w.village.origin.x+at[0],root.position.y+1.1*S,
        w.village.origin.z+at[1]+front*S,0,-front,b.depth+2*S);
      check(hit?.rockId===`building:${b.id}`,`${b.id} front collision/reference mismatch`);
    }
    report.buildings.push({id:b.id,revision:root.metadata.revision,asset:root.metadata.sourceAsset,
      position:root.position.asArray(),yaw:root.rotation.y,scale:root.scaling.x,boundsMin:min.asArray(),boundsMax:max.asArray(),
      batches:placed.meshes.length,pbrMaterials:pbr.length,flowers,foliage});
  }
  check([...shared.values()].every(ids=>ids.size===1),'Shared image duplicated on GPU');
  report.textures={wrappers:allTextures.size,sharedImages:shared.size,gpuImages:new Set([...shared.values()].flatMap(s=>[...s])).size,
    webp:[...shared.keys()].filter(u=>u.endsWith('.webp')).length,allReady:true};
  report.b27='Retained the existing placement';report.castle='B28 Rev5 preserved';
  check(!w.scene.meshes.some(m=>m.name==='casa-pueblo'),'Old placeholder houses remain');
  window.__brisaliaRev3?.camera?.dispose();
  const camera=new B.ArcRotateCamera('rev3-review',0,1,50,B.Vector3.Zero(),w.scene);
  camera.minZ=.05;camera.maxZ=5000;w.scene.activeCamera=camera;
  camera.upperRadiusLimit=null;camera.lowerRadiusLimit=.5;
  const render=async()=>{await w.scene.whenReadyAsync();for(let i=0;i<4;i++){w.scene.render();await wait(30);}};
  const view=async(id,detail='front')=>{
    const placed=w.village.buildings.get(id),b=BRISALIA_BUILDINGS.find(b=>b.id===id),root=placed.root;
    const width=b.width/S,height=b.height/S,depth=b.depth/S;
    let target=[0,height*.45,0],eye=[width*.95,height*.9,-depth*1.35];
    if(detail==='door'||detail==='planter'){
      const anchors=root.metadata.authoredAnchors??[];
      const matches=anchors.filter(a=>detail==='door'?/entry_leaf|arched_leaf/.test(a.name):/daisies|herbs|herb_volume/.test(a.name));
      matches.sort((a,b)=>a.min[2]-b.min[2]||a.min[0]-b.min[0]);
      const a=matches[0];check(a,`${id} missing ${detail} anchor`);
      target=a.min.map((v,i)=>(v+a.max[i])/2);
      eye=[target[0]+(detail==='door'?.8:.7),target[1]+.45,target[2]-(detail==='door'?3.5:2.2)];
    }else if(detail==='upper'){
      target=[width*.37,height*.65,-depth*.35];eye=[width*.85,height*.82,-depth*.9];
    }
    const world=p=>B.Vector3.TransformCoordinates(B.Vector3.FromArray(p),root.computeWorldMatrix(true));
    camera.setTarget(world(target),false,false,true);camera.setPosition(world(eye));await render();
    return {id,detail,eye:camera.position.asArray(),target:camera.target.asArray()};
  };
  window.__brisaliaRev3={view,report,render,camera};
  const town=w.village.origin;
  camera.setTarget(new B.Vector3(town.x-20*S,w.player.position.y+10,town.z-70*S),false,false,true);
  camera.alpha=-Math.PI/2-.3;camera.beta=.65;camera.radius=620;await render();
  return report;
})()
