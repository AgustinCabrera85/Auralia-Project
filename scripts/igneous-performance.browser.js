(async()=>{
  const q=window.__igneousQA,w=q.w;
  w.engine.setSize(1920,1080);
  q.liveMeasure=async(label,seconds=10)=>{
    w.pressed.clear();w.engine.stopRenderLoop();const samples=[];
    const started=performance.now();let measuredAt=0;
    return await new Promise(resolve=>{
      const loop=()=>{
        const now=performance.now(),dt=Math.min(w.engine.getDeltaTime()/1000,.045),before=w.engine._drawCalls.current;
        w.cameraFrameDt=dt;w.update(dt);w.scene.render();
        w.callbacks.onCameraHeading?.(w.camera.alpha-Math.PI/2);w.updateGrassStats(dt);
        if(now-started<=2000)return;
        if(!measuredAt)measuredAt=now;
        samples.push({ms:performance.now()-now,draws:w.engine._drawCalls.current-before,triangles:w.scene.getActiveIndices()/3});
        if(now-measuredAt<seconds*1000)return;
        w.engine.stopRenderLoop(loop);const ms=samples.map(s=>s.ms).sort((a,b)=>a-b);
        resolve({label,mode:'engine.runRenderLoop with real delta time',fps:(samples.length-1)*1000/(now-measuredAt),
          seconds:(now-measuredAt)/1000,frames:samples.length,medianMs:ms[Math.floor(ms.length*.5)],p95Ms:ms[Math.floor(ms.length*.95)],
          ...samples.at(-1),resolution:[w.engine.getRenderWidth(),w.engine.getRenderHeight()],avatar:w.santi.isReady,
          companion:{visible:w.dogo.follow.visible,distance:Math.hypot(w.dogo.follow.position.x-w.player.position.x,w.dogo.follow.position.z-w.player.position.z)},
          loadMs:q.r.loadMilliseconds,renderer:w.engine.getGlInfo()});
      };
      w.engine.runRenderLoop(loop);
    });
  };
  q.pose([1.1903743,12.1468635,1.6505154],'mirador',-1.5,.65);
  return await q.liveMeasure('puente-lago-1080p');
})()
