// Drives the existing isolated landscape fixture and F8 profiler. No save I/O.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const scenarios=[
  {id:'brisalia',x:1,z:10},
  {id:'bosque-ilustrado',x:-730,z:-420},
  {id:'pradera-florida',x:-790,z:-510},
  {id:'laguna',x:-160,z:-810},
  {id:'altapiedra',x:-275,z:-535},
  {id:'gruta',x:-6,z:-858,cave:true},
];
function pose(world){
  const c=world.camera,p=world.player.position;
  return {player:[p.x,p.y,p.z],camera:c.position.asArray(),target:c.target.asArray(),
    alpha:c.alpha,beta:c.beta,radius:c.radius,fov:c.fov,mode:world.traversal.mode,
    insideCave:world.lagoon.inside,postProcessActive:world.speedMotionBlur.active};
}
export function environment(){
  const {world}=window.review,gl=world.engine._gl,debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {browser:navigator.userAgent,cores:navigator.hardwareConcurrency,
    approximateDeviceMemoryGiB:navigator.deviceMemory??null,backend:`webgl${world.engine.webGLVersion}`,
    gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,
    viewportCss:[innerWidth,innerHeight],dpr:devicePixelRatio,
    material:world.mainland.material.name,materialState:world.mainland.material.metadata,
    navigation:performance.getEntriesByType('navigation').map(n=>({
      domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd,type:n.type})),
    notes:'Isolated dev-server fixture; DOM timings are not a measured game-ready time. Heap is not total Chrome RAM or VRAM.'};
}
export async function prepare(id){
  const scenario=scenarios.find(s=>s.id===id);if(!scenario)throw new Error(`Unknown scenario ${id}`);
  const {world}=window.review;
  if(world.lagoon.inside)world.lagoon.leave('laguna-sumergida');
  world.setRenderQuality('balanced');
  world.climate.clockScale=0;world.climate.forcedWeather='clear';world.climate.setElapsedHours(14);
  world.scene.activeCamera=world.camera;
  window.review.place(scenario.x,scenario.z,.42,1.15,10);
  if(scenario.cave){
    const p=world.lagoon.enter('laguna-sumergida');
    world.traversal.teleport(p.x,p.y,p.z);world.player.position.copyFrom(p);
  }
  // ArcRotateCamera.setTarget (used by place/update) can rebuild angles from the
  // old camera position. Reapply the requested orbit after the teleported target.
  const target=world.player.position.clone();target.y+=2.05;
  world.camera.setTarget(target);
  world.camera.alpha=.42;world.camera.beta=1.15;
  world.camera.inertialAlphaOffset=0;world.camera.inertialBetaOffset=0;
  world.camera.inertialRadiusOffset=0;
  world.camera.radius=10;world.cameraPreferredRadius=10;world.cameraAppliedRadius=10;
  if(!world.telemetry)world.toggleTelemetry();
  if(!world.telemetry.recording)world.telemetry.toggleVisibility();
  // Keep normal profiler instrumentation/refresh enabled, but avoid covering screenshots.
  document.getElementById('auralia-telemetry').style.opacity='0';
  const began=performance.now();let stable=0,previous='';
  while(performance.now()-began<90000){
    await sleep(1000);
    const signature=[world.scene.meshes.length,world.scene.textures.length,world.scene.getWaitingItemsCount(),world.mainland.pendingCount].join(':');
    stable=signature===previous?stable+1:0;previous=signature;
    if(performance.now()-began>=15000&&stable>=3&&world.scene.getWaitingItemsCount()===0&&world.mainland.pendingCount===0)break;
  }
  const settled=world.scene.getWaitingItemsCount()===0&&world.mainland.pendingCount===0&&stable>=3;
  return {scenario,warmupMs:performance.now()-began,settled,pose:pose(world)};
}
export async function measure(seconds=30){
  const {world}=window.review,t=world.telemetry;
  const frames=[],copyCosts=[];let cursor=-1;
  t.reset();const started=performance.now(),startPose=pose(world);
  // Drain the fixed F8 ring every 5 s: a 30 s test must not silently lose the
  // first half on a 120+ FPS display. The cost is reported, not hidden.
  while(performance.now()-started<seconds*1000){
    await sleep(Math.min(5000,Math.max(1,seconds*1000-(performance.now()-started))));
    const before=performance.now(),rows=t.history.exportRows();
    for(const frame of rows)if(frame.timeMs>cursor)frames.push(frame);
    if(rows.length)cursor=rows.at(-1).timeMs;
    copyCosts.push(performance.now()-before);
  }
  const snapshot=t.snapshot();snapshot.frames=frames;
  return {requestedSeconds:seconds,actualMs:performance.now()-started,
    startPose,endPose:pose(world),copyCostsMs:copyCosts,snapshot};
}
