// Evaluated only by the isolated browser harness. Movement uses WorldView's normal WASD update.
(async()=>{
  const w=window.__auraliaGame.world,r=w.volcanicCave.realm;
  const waitStart=performance.now();
  while(!w.volcanicCave.inside&&w.igneousTransition&&performance.now()-waitStart<120000)await new Promise(resolve=>setTimeout(resolve,200));
  if(!w.volcanicCave.inside)throw Error('Enter the loaded realm first');
  w.engine.stopRenderLoop();
  const meta=await (await fetch('/assets/reino-igneo/nivel.json')).json();
  const q=window.__igneousQA={w,r,meta,visited:[],frames:0,recoveries:[],samples:[],errors:[],stage:'ready'};
  // Explicit setup for isolated performance/hazard cases only. The recorded
  // main walkthrough uses walk(), never this positioning helper between rooms.
  q.pose=(point,checkpoint,alpha,beta)=>{
    const p=r.point(point);w.traversal.teleport(p.x,p.y+.1,p.z);w.player.position.copyFrom(p);
    r.checkpointId=checkpoint;r.checkpoint.copyFrom(p);
    w.camera.setTarget(p.add(new p.constructor(0,2.05,0)),false,false,true);
    w.camera.alpha=alpha;w.camera.beta=beta;w.cameraPreferredRadius=18;
  };
  window.addEventListener('error',e=>q.errors.push(e.message));
  q.frame=async(keys=[])=>{
    const before={...w.traversal.position};w.pressed.clear();keys.forEach(k=>w.pressed.add(k));
    const started=performance.now(),drawsBefore=w.engine._drawCalls.current;
    w.engine.beginFrame();w.cameraFrameDt=1/30;w.update(1/30);w.scene.render();w.engine.endFrame();
    const p=w.traversal.position;if(Math.hypot(p.x-before.x,p.y-before.y,p.z-before.z)>4)q.recoveries.push({stage:q.stage,from:before,to:{...p}});
    q.samples.push({ms:performance.now()-started,draws:w.engine._drawCalls.current-drawsBefore,indices:w.scene.getActiveIndices()});q.frames++;
    await new Promise(resolve=>requestAnimationFrame(resolve));
  };
  q.walk=async(points,name)=>{
    q.stage=name;const started=performance.now();
    for(let i=0;i<points.length;i++){
      const target=r.point(typeof points[i]==='string'?meta.checkpoints[points[i]]:points[i]);
      let last=Infinity,stalled=0,reached=false;
      for(let frame=0;frame<2400;frame++){
        const p=w.traversal.position,dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
        q.current={name,index:i,target:points[i],local:r.local(w.player.position).asArray(),mode:w.traversal.mode,d};
        if(d<.3){reached=true;break;}
        stalled=Math.abs(last-d)<.005?stalled+1:0;last=d;
        if(stalled===30&&w.traversal.mode==='grounded')w.jumpRequested=true;
        if(stalled>90)throw Error('Blocked '+JSON.stringify(q.current));
        w.camera.alpha=Math.atan2(-dz,-dx);w.camera.beta=1.28;
        await q.frame(['w']);
        if(q.recoveries.length)throw Error('Recovered during '+name+': '+JSON.stringify(q.recoveries.at(-1)));
      }
      if(!reached)throw Error('Waypoint timed out '+JSON.stringify(q.current));
      q.visited.push({name,point:points[i],position:r.local(w.player.position).asArray(),mode:w.traversal.mode});
    }
    w.pressed.clear();return {name,seconds:(performance.now()-started)/1000,position:r.local(w.player.position).asArray(),visited:q.visited.length,frames:q.frames};
  };
  q.record=()=>{
    q.chunks=[];q.recorder=new MediaRecorder(w.engine.getRenderingCanvas().captureStream(20),{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:3500000});
    q.recorder.ondataavailable=e=>{if(e.data.size)q.chunks.push(e.data);};q.recorder.start(1000);
  };
  q.stop=async()=>{
    if(q.recorder.state!=='inactive')await new Promise(resolve=>{q.recorder.onstop=resolve;q.recorder.stop();});
    return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(q.chunks,{type:'video/webm'}));});
  };
  w.camera.alpha=Math.PI/2;w.camera.beta=1.28;w.cameraPreferredRadius=16;
  for(let i=0;i<8;i++)await q.frame();
  const supported=Object.entries(meta.checkpoints).map(([id,p])=>{
    const v=r.point(p),g=r.colliders.queryGround(v.x,v.z,v.y+3.2,8,.2);
    return {id,supported:!!g,delta:g?g.height-v.y:null,headroom:g?w.volcanicCave.traversalWorld().headroom(v.x,g.height+.1,v.z,3.8):null};
  });
  return {supported,position:r.local(w.player.position).asArray(),render:{width:w.engine.getRenderWidth(),height:w.engine.getRenderHeight()},renderer:w.engine.getGlInfo(),samples:q.samples};
})()
