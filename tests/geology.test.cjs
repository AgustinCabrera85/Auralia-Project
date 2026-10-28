const assert=require('node:assert/strict');
const fs=require('node:fs');
const {NullEngine,Scene,TransformNode,ImportMeshAsync,VertexBuffer}=require('@babylonjs/core');
const {GameStore}=require('../.test-build/domain/GameStore.js');
const {newGame}=require('../.test-build/domain/types.js');
const {GEOLOGY_FORMATIONS,geologyPoint,geologyInfluence,geologyFaceExcludes,
  geologyIntersectsChunk,sameGeologyFormation}=require('../.test-build/world/geologyData.js');
const {GEOLOGY_COMPOSITIONS,composeGeology}=require('../.test-build/world/geologyPresets.js');
const {MAINLAND,chunkOf,geographyMasks,sampleMainlandHeight,LANDMARKS}=require('../.test-build/world/terrainData.js');
const {vegetationForChunk}=require('../.test-build/world/vegetationData.js');
const {WorldPropSystem}=require('../.test-build/world/WorldPropSystem.js');
const {CharacterTraversalController}=require('../.test-build/game/CharacterTraversalController.js');

assert.equal(GEOLOGY_FORMATIONS.length,3);
assert.deepEqual(GEOLOGY_FORMATIONS.map(f=>f.kind),['cliff','plateau','coastalCliff']);
const allPieces=GEOLOGY_COMPOSITIONS.flatMap(c=>c.pieces);
assert.equal(new Set(allPieces.map(p=>p.id)).size,allPieces.length,'piece IDs are unique');
for(const composition of GEOLOGY_COMPOSITIONS){
  const f=composition.formation;
  assert.deepEqual(composeGeology(f),composition,'a composition is deterministic');
  assert.ok(composition.pieces.length>=18);
  assert.ok(new Set(composition.pieces.map(p=>p.kind)).size>=5,'each landscape uses several GLBs');
  assert.ok(composition.pieces.every(p=>geographyMasks(p.x,p.z).road<.2),
    'structural pieces leave existing and reserved routes clear');
  const walls=composition.pieces.filter(p=>p.id.includes(':wall:'));
  for(let i=1;i<walls.length;i++){
    const gap=Math.hypot(walls[i].x-walls[i-1].x,walls[i].z-walls[i-1].z);
    assert.ok(gap<(walls[i].scale+walls[i-1].scale)*.45,
      'adjacent cliff meshes overlap to hide seams');
  }
  const near=geologyPoint(f,0,35);
  assert.ok(Math.abs(sampleMainlandHeight(near.x,near.z)-f.targetHeight)<1.5,
    'the top terrain reaches the composition crest');
  const face=geologyPoint(f,0,0),step=2;
  const lower=geologyPoint(f,0,-step),upper=geologyPoint(f,0,step);
  const faceSlope=(sampleMainlandHeight(upper.x,upper.z)-sampleMainlandHeight(lower.x,lower.z))/(2*step);
  assert.ok(faceSlope>1,'the exposed face is steep');
  assert.ok(geologyFaceExcludes(face.x,face.z));
  assert.ok(!geologyFaceExcludes(near.x,near.z),'the upper terrace remains available to vegetation');
  for(let across=f.depth-55;across<=f.depth+16;across+=4){
    const a=geologyPoint(f,0,across-1),b=geologyPoint(f,0,across+1);
    const slope=Math.abs(sampleMainlandHeight(a.x,a.z)-sampleMainlandHeight(b.x,b.z))/2;
    assert.ok(slope<.91,`rear approach stays walkable at ${f.id}, ${across}: ${slope}`);
  }
  const centerCell=chunkOf(f.x,f.z);
  assert.ok(geologyIntersectsChunk(f,centerCell.cx,centerCell.cz,MAINLAND.chunkSize));
  assert.ok(!geologyIntersectsChunk(f,centerCell.cx+8,centerCell.cz+8,MAINLAND.chunkSize));
  const cells=[];
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++)
    if(geologyIntersectsChunk(f,centerCell.cx+dx,centerCell.cz+dz,MAINLAND.chunkSize))
      cells.push(`${centerCell.cx+dx}:${centerCell.cz+dz}`);
  assert.ok(cells.length>=2,'a formation crosses chunk boundaries');
}
for(const site of LANDMARKS.filter(p=>['brisalia','hogar','puerto','altapiedra'].includes(p.id))){
  assert.ok(GEOLOGY_FORMATIONS.every(f=>geologyInfluence(f,site.x,site.z)<.01),
    `${site.name} remains outside altered terrain`);
  assert.ok(!geologyFaceExcludes(site.x,site.z));
}
assert.ok(!geologyFaceExcludes(-410,-565),'the fixed Altapiedra crystal is accessible');
assert.ok(geographyMasks(-275,-535).road>.9,'the existing Altapiedra route is reserved');
for(const f of GEOLOGY_FORMATIONS){
  const cell=chunkOf(f.x,f.z);
  const vegetation=[];
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)
    vegetation.push(...vegetationForChunk(cell.cx+dx,cell.cz+dz));
  assert.ok(vegetation.every(p=>!geologyFaceExcludes(p.x,p.z)),
    'tree roots do not cross geological walls');
  assert.ok(vegetation.some(p=>p.kind==='plantitas1'&&
    [-1,0,1].some(i=>{
      const at=geologyPoint(f,i*22,51+(i===0?8:0));
      return Math.hypot(p.x-at.x,p.z-at.z)<.01;
    })),'a terrace receives vegetation');
}

(async()=>{
  const engine=new NullEngine(),scene=new Scene(engine),parent=new TransformNode('mainland',scene);
  const repository={current:newGame(),load(){return structuredClone(this.current);},
    save(state){this.current=structuredClone(state);},clear(){this.current=newGame();}};
  const store=new GameStore(repository);
  const imports=[];
  const importer=async(url,target)=>{
    imports.push(url);
    return ImportMeshAsync(new Uint8Array(fs.readFileSync(`public${url}`)),target,{pluginExtension:'.glb'});
  };
  const system=new WorldPropSystem(scene,parent,store,()=>[],importer);
  const first=GEOLOGY_COMPOSITIONS[0],f=first.formation;
  const cell=chunkOf(f.x,f.z);
  system.setActiveChunks([cell],f.x,f.z);
  await system.load();
  system.update(1/60);
  assert.equal(system.activeFormationCount,1,'a single cell streams the whole formation');
  assert.deepEqual(system.activeFormationIds,[f.id]);
  assert.ok(system.activeRockColliderCount>0);
  const usedKinds=new Set(allPieces.map(p=>p.kind));
  for(const kind of usedKinds){
    const sources=scene.meshes.filter(m=>m.metadata?.sharedWorldAsset===kind);
    assert.ok(sources.length>0);
    assert.ok(sources.every(m=>m.material?.albedoTexture&&m.getVerticesData(VertexBuffer.UVKind)?.length),
      `${kind} preserves GLB texture and UVs`);
  }
  assert.equal(new Set(imports).size,imports.length,'the compositions share one import per GLB');
  const wall=first.pieces.find(p=>p.id.includes(':wall:3'));
  const approach=geologyPoint(f,0,-42);
  let contact=null;
  for(let y=wall.y+2;y<wall.y+wall.worldHeight-2&&!contact;y+=2){
    const hit=system.queryRockWall(approach.x,y,approach.z,f.highX,f.highZ,65);
    if(hit?.climbable&&hit.normal.y>=-.3&&hit.normal.y<=.6)contact=hit;
  }
  assert.ok(contact?.rockId.startsWith(`geo:${f.id}:`),'the actual wall is climbable');
  const terrace=first.pieces.find(p=>p.id.includes(':terrace:0'));
  let platform=null,platformPoint=null;
  for(let dx=-9;dx<=9&&!platform;dx+=3)for(let dz=-9;dz<=9&&!platform;dz+=3){
    const x=terrace.x+dx,z=terrace.z+dz;
    const hit=system.queryRockGround(x,z,f.targetHeight+4,6,.33);
    if(hit?.rockId===terrace.id&&hit.height>=sampleMainlandHeight(x,z)-.05){
      platform=hit;platformPoint={x,z};
    }
  }
  assert.ok(platform&&platform.normal.y>=Math.cos(42*Math.PI/180),
    'the terrace GLB has a walkable surface');
  const world={
    ground:(x,z,rayY,reach,radius)=>{
      const rock=system.queryRockGround(x,z,rayY,reach,radius);
      const terrain=sampleMainlandHeight(x,z);
      if(rock&&rock.height>=terrain)return {height:rock.height,normalY:rock.normal.y,rockId:rock.rockId};
      const d=.55,gradientX=(sampleMainlandHeight(x+d,z)-sampleMainlandHeight(x-d,z))/(2*d);
      const gradientZ=(sampleMainlandHeight(x,z+d)-sampleMainlandHeight(x,z-d))/(2*d);
      return terrain<=rayY&&terrain>=rayY-reach
        ?{height:terrain,normalY:1/Math.hypot(1,gradientX,gradientZ)}:null;
    },
    solidTop:(x,z,rayY,reach,rockId)=>{
      const hit=system.queryRockSolidTop(x,z,rayY,reach,rockId);
      return hit?{height:hit.height,normalX:hit.normal.x,normalZ:hit.normal.z,
        rockId:hit.rockId,centerX:hit.centerX,centerZ:hit.centerZ}:null;
    },
    wall:(x,y,z,dx,dz,reach)=>{
      const hit=system.queryRockWall(x,y,z,dx,dz,reach);
      return hit?{pointX:hit.point.x,pointY:hit.point.y,pointZ:hit.point.z,
        distance:hit.distance,normalX:hit.normal.x,normalY:hit.normal.y,
        normalZ:hit.normal.z,rockId:hit.rockId,climbable:hit.climbable}:null;
    },
    headroom:(x,y,z,room,ignoreRockId)=>system.hasRockHeadroom(x,y,z,room,ignoreRockId),
    sameSupport:sameGeologyFormation,
    canMove:()=>true,fallbackHeight:sampleMainlandHeight
  };
  const underRock=system.queryRockSolidTop(-443,-481,85,80);
  assert.ok(underRock&&underRock.height>sampleMainlandHeight(-443,-481)+10,
    'the reported save position has a high visible rock roof above the base terrain');
  const outward=system.queryRockWall(-443,sampleMainlandHeight(-443,-481)+1.5,
    -481,-f.highX,-f.highZ,24);
  assert.ok(outward&&sameGeologyFormation(outward.rockId,underRock.rockId),
    'the interior of the reported cliff has an exterior face to recover toward');
  const outside=[1.3,2,4,8,12].map(distance=>({
    x:outward.point.x-f.highX*distance,z:outward.point.z-f.highZ*distance
  })).find(point=>{
    const terrain=sampleMainlandHeight(point.x,point.z);
    const roof=system.queryRockSolidTop(point.x,point.z,terrain+80,80);
    return !roof||roof.height<=terrain+4.4;
  });
  assert.ok(outside,'the reported interior position has a nearby open landing area');
  const screenshotClimber=new CharacterTraversalController();
  screenshotClimber.teleport(-414,sampleMainlandHeight(-414,-562),-562);
  const screenshotInput={moveX:-1,moveZ:0,forwardX:-1,forwardZ:0,
    horizontal:0,vertical:1,run:false,jumpPressed:false};
  let climbed=false,lowestAfterClimb=Infinity;
  for(let i=0;i<550;i++){
    screenshotClimber.step(.025,screenshotInput,world);
    climbed ||= screenshotClimber.mode==='climbing';
    if(climbed)lowestAfterClimb=Math.min(lowestAfterClimb,screenshotClimber.position.y);
    assert.ok(screenshotClimber.position.y>=sampleMainlandHeight(
      screenshotClimber.position.x,screenshotClimber.position.z)-.12,
    `the character stays above the terrain during the full ascent at step ${i}`);
  }
  assert.ok(climbed,'the player can grab the cliff from the reported screenshot position');
  assert.ok(screenshotClimber.mode==='grounded'&&
    screenshotClimber.position.y>f.targetHeight-5&&lowestAfterClimb>25,
  `the full Altapiedra ascent stays on the visible shell: ${screenshotClimber.mode} ${JSON.stringify(screenshotClimber.position)}`);
  assert.ok(system.queryRockGround(-430,-562,46,4,.33),
    'a narrow mesh seam on the climbing route retains foot support');
  const climber=new CharacterTraversalController();
  climber.teleport(contact.point.x+contact.normal.x*1.25,contact.point.y-1.15,
    contact.point.z+contact.normal.z*1.25);
  const climbInput={moveX:0,moveZ:0,forwardX:f.highX,forwardZ:f.highZ,
    horizontal:0,vertical:1,run:false,jumpPressed:false};
  climber.step(.02,climbInput,world);
  assert.equal(climber.mode,'climbing','the composition starts contextual climbing');
  const climbStart=climber.position.y;
  for(let i=0;i<10;i++)climber.step(.02,climbInput,world);
  assert.ok(climber.position.y>climbStart+.1,'the player ascends the rock wall');
  let topContact=null;
  for(let y=wall.y+wall.worldHeight-1;y>wall.y+2&&!topContact;y-=.5){
    const hit=system.queryRockWall(approach.x,y,approach.z,f.highX,f.highZ,65);
    if(hit?.climbable&&hit.normal.y>=-.3&&hit.normal.y<=.6)topContact=hit;
  }
  assert.ok(topContact,'the climbing face continues to its crest');
  const topClimber=new CharacterTraversalController();
  topClimber.teleport(topContact.point.x+topContact.normal.x*1.25,
    topContact.point.y-1.15,topContact.point.z+topContact.normal.z*1.25);
  topClimber.step(.02,climbInput,world);
  assert.equal(topClimber.mode,'climbing','the upper face is still climbable');
  for(let i=0;i<150&&topClimber.mode!=='grounded';i++)
    topClimber.step(.02,climbInput,world);
  assert.ok(topClimber.mode==='grounded'&&topClimber.position.y>f.targetHeight-3,
    `climbing reaches the crest: ${topClimber.mode} at ${topClimber.position.y.toFixed(1)}`);
  const crestStart=geologyPoint(f,-40,28);
  const crestWalker=new CharacterTraversalController();
  crestWalker.teleport(crestStart.x,sampleMainlandHeight(crestStart.x,crestStart.z),crestStart.z);
  const walkInput={moveX:f.axisX,moveZ:f.axisZ,forwardX:f.axisX,forwardZ:f.axisZ,
    horizontal:0,vertical:1,run:false,jumpPressed:false};
  let lowest=Infinity;
  for(let i=0;i<300;i++){
    crestWalker.step(.025,walkInput,world);
    lowest=Math.min(lowest,crestWalker.position.y);
  }
  assert.ok(crestWalker.position.z>crestStart.z+60&&lowest>f.targetHeight-5,
    `walking across the crest stays supported: z=${crestWalker.position.z.toFixed(1)}, y=${lowest.toFixed(1)}`);
  const player=new CharacterTraversalController();
  player.teleport(platformPoint.x,platform.height,platformPoint.z);
  const idle={moveX:0,moveZ:0,forwardX:1,forwardZ:0,
    horizontal:0,vertical:0,run:false,jumpPressed:true};
  player.step(.02,idle,world);
  assert.equal(player.mode,'airborne','the player can jump from a geological terrace');
  for(let i=0;i<100&&player.mode!=='grounded';i++)player.step(.02,{...idle,jumpPressed:false},world);
  assert.equal(player.mode,'grounded','the player lands on the composition');
  assert.ok(player.position.y>=sampleMainlandHeight(platformPoint.x,platformPoint.z)-.05);
  const otherCell=chunkOf(f.x,f.z+MAINLAND.chunkSize);
  system.setActiveChunks([otherCell],f.x,f.z+MAINLAND.chunkSize);
  system.update(1/60);
  assert.equal(system.activeFormationCount,1,'crossing a chunk does not duplicate or cut the composition');
  const support=terrace.id;
  system.setColliderFocus(terrace.x,terrace.z,support);
  system.setActiveChunks([],1000,1000);
  assert.equal(system.activeFormationCount,1,'support keeps the whole composition streamed');
  assert.ok(system.activeRockColliderCount>=first.pieces.length,
    'all supporting pieces retain their colliders');
  const nextSupport=first.pieces.find(p=>p.id.includes(':wall:3')).id;
  system.setColliderFocus(wall.x,wall.z,nextSupport);
  assert.equal(system.activeFormationCount,1,'support can move to another piece in the same formation');
  system.setColliderFocus(1000,1000,null);
  assert.equal(system.activeFormationCount,0);
  assert.equal(system.activeRockColliderCount,0);
  for(const composition of GEOLOGY_COMPOSITIONS.slice(1)){
    const region=composition.formation,regionCell=chunkOf(region.x,region.z);
    system.setActiveChunks([regionCell],region.x,region.z);
    system.setColliderFocus(region.x,region.z,null);
    system.update(1/60);
    assert.deepEqual(system.activeFormationIds,[region.id],
      'another region loads its own composition without duplicates');
    const ledge=composition.pieces.find(p=>p.id.includes(':terrace:0'));
    let walkable=false;
    for(let dx=-9;dx<=9&&!walkable;dx+=3)for(let dz=-9;dz<=9&&!walkable;dz+=3)
      walkable=system.queryRockGround(ledge.x+dx,ledge.z+dz,
        region.targetHeight+4,6,.33)?.rockId===ledge.id;
    assert.ok(walkable,`${region.id} has a real walkable ledge`);
    assert.equal(system.queryRockWall(region.x+800,region.targetHeight,region.z,
      region.highX,region.highZ,10),null,'there is no invisible region-wide wall');
  }
  system.dispose();scene.dispose();engine.dispose();
  console.log('✓ Geología: tres composiciones deterministas, terreno conectado, mallas y streaming');
})().catch(error=>{console.error(error);process.exitCode=1;});
