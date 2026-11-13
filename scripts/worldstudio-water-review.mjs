/** Player-reported water views, in the harness's disposable save/profile. */
export async function checkWaterReview(evaluate,capture,save){
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),records=[];
  await evaluate(`(()=>{const w=window.__auraliaGame.world;w.engine.maxFPS=30;w.setRenderQuality('performance');
    window.__waterClimate=w.climate.update.bind(w.climate);w.climate.update=()=>window.__waterClimate(0);})()`);
  if(process.argv.includes('--blink-only')){
    await evaluate(`(()=>{const w=window.__auraliaGame.world,s=w.santi;
      w.climate.setElapsedHours(12);w.updateCameraOcclusion=()=>{};
      w.scene.onBeforeRenderObservable.add(()=>{const t=w.player.position.clone();t.y+=3.35;
        w.camera.setTarget(t);w.camera.alpha=Math.PI/2+w.player.rotation.y;w.camera.beta=1.5;w.camera.radius=2.4;});
      window.__blinkUpdate=s.updateBlink.bind(s);s.updateBlink=()=>{};s.blinkTime=-5;window.__blinkUpdate(0);})()`);
    await pause(1600);await capture('santi-eyes-open');
    await evaluate(`(()=>{const s=window.__auraliaGame.world.santi;s.blinkTime=.085;window.__blinkUpdate(0);})()`);
    await pause(200);await capture('santi-eyes-closed');
    await evaluate(`(()=>{const s=window.__auraliaGame.world.santi;s.blinkTime=.24;window.__blinkUpdate(0);s.updateBlink=window.__blinkUpdate;})()`);
    await pause(400);await capture('santi-eyes-reopened');
    await save('blink',{durationSeconds:.24,intervalSeconds:[2.6,6.2],doubleBlinkChance:.12});return;
  }
  for(const [id,x,z,alpha,beta,hour] of [
    ['cumbres-up',2145,-2340,2.18,1.95,.8],
    ['gruta-bed',-2760,-1517,1.1,1.4,12],
    ['gruta-shore',-2399,-1630,2.27,1.12,12],
    ['cordillera',-2471,108,-2.58,1.4,12]]){
    await evaluate(`window.__auraliaGame.world.travelGeographic(${x},${z},'${id}')`);
    for(let i=0;i<1800;i++){
      if(await evaluate('(()=>{const w=window.__auraliaGame.world;return w.geographicStatus.ready&&!w.geography.pending.length&&!w.geography.activeBuild;})()'))break;
      if(i===1799)throw Error('Water review streaming timeout');await pause(200);
    }
    await evaluate(`(()=>{const w=window.__auraliaGame.world;w.camera.alpha=${alpha};w.camera.beta=${beta};w.camera.radius=11.5;w.climate.setElapsedHours(${hour});})()`);
    await pause(1800);await capture(id);
    records.push(await evaluate(`(()=>{const w=window.__auraliaGame.world,o=w.speedMotionBlur.optics,p=w.player.position;
      const field=w.geographicWorld.waterFieldAt(p.x,p.z);
      return {id:'${id}',...w.geographicStatus,eye:w.camera.globalPosition.asArray(),camera:[w.camera.alpha,w.camera.beta,w.camera.radius],field,
        optics:{weight:o.weight,level:o.level,slope:o.slope.asArray(),surfaceMode:o.surfaceMode},
        fps:w.engine.getFps(),heap:performance.memory.usedJSHeapSize,triangles:w.scene.getActiveIndices()/3};})()`));
    if(id==='cumbres-up'){
      await evaluate(`(()=>{const w=window.__auraliaGame.world;window.__waterUpdate=w.speedMotionBlur.updateWaterSurface.bind(w.speedMotionBlur);w.speedMotionBlur.updateWaterSurface=dt=>window.__waterUpdate(dt,null);})()`);
      await pause(1500);await capture('cumbres-no-optics');
      await evaluate('window.__auraliaGame.world.speedMotionBlur.updateWaterSurface=window.__waterUpdate');
      if(process.argv.includes('--submerged-probe')){
        await evaluate(`(()=>{const w=window.__auraliaGame.world,g=w.geographicWorld;
          const points=[];for(let z=-2360;z<=-2320;z+=2)for(let x=2125;x<=2165;x+=2){
            const f=g.waterFieldAt(x,z),h=g.surface.heightAt(x,z);if(f&&f.level-h>2)points.push({x,z,y:f.level-.3,bed:h,d:Math.hypot(x-2145,z+2340)});}
          points.sort((a,b)=>a.d-b.d);if(!points.length)throw Error('No valid underwater camera point');
          window.__probeEye=points[0];window.__occlusion=w.updateCameraOcclusion.bind(w);
          w.camera.upperBetaLimit=2.3;w.camera.lowerRadiusLimit=1;
          w.updateCameraOcclusion=()=>{const p=window.__probeEye,b=window.__probeAngle||1.95,a=2.18,r=3;
            const t=w.player.position.clone();t.set(p.x-r*Math.sin(b)*Math.cos(a),p.y-r*Math.cos(b),p.z-r*Math.sin(b)*Math.sin(a));
            w.camera.setTarget(t);w.camera.alpha=a;w.camera.beta=b;w.camera.radius=r;};})()`);
        for(const angle of [1.95,2.1,2.25]){
          await evaluate(`window.__probeAngle=${angle}`);
          await pause(1800);await capture('submerged-'+angle);
          records.push(await evaluate(`(()=>{const w=window.__auraliaGame.world;return {angle:${angle},probe:window.__probeEye,eye:w.camera.globalPosition.asArray(),level:w.speedMotionBlur.optics.level,weight:w.speedMotionBlur.optics.weight};})()`));
        }
        await evaluate('window.__auraliaGame.world.speedMotionBlur.updateWaterSurface=dt=>window.__waterUpdate(dt,null)');
        await pause(500);await capture('submerged-no-optics');
        if(process.argv.includes('--isolate-surface')){
          await evaluate(`(()=>{const w=window.__auraliaGame.world;window.__hiddenWater=w.scene.meshes.filter(m=>m.isEnabled()&&m.metadata?.inlandWater);for(const m of window.__hiddenWater)m.setEnabled(false);})()`);
          await pause(500);await capture('submerged-no-surface');
          await evaluate('for(const m of window.__hiddenWater)m.setEnabled(true)');
          await evaluate(`window.__auraliaGame.world.scene.getMeshByName('auralia-climate-sky-dome').setEnabled(false)`);
          await pause(500);await capture('submerged-no-sky');
          await evaluate(`window.__auraliaGame.world.scene.getMeshByName('auralia-climate-sky-dome').setEnabled(true)`);
        }
        await evaluate('window.__auraliaGame.world.updateCameraOcclusion=window.__occlusion;window.__auraliaGame.world.camera.upperBetaLimit=1.95;window.__auraliaGame.world.camera.lowerRadiusLimit=5.5;window.__auraliaGame.world.speedMotionBlur.updateWaterSurface=window.__waterUpdate');
      }
    }
    if(process.argv.includes('--optics-only'))break;
  }
  await save(process.argv.includes('--submerged-probe')?'submerged-probe':'views',records);
}
