import { EngineInstrumentation } from '@babylonjs/core';

const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]:null;
export function createInspection({scene,engine,atlas,channelField,terrainStream,baseline,visit}){
  const frames=[],cpu=[],gpu=[];
  const timing=new EngineInstrumentation(engine);
  timing.captureGPUFrameTime=true;
  let lastTime=0,lastRefresh=0,lastSnapshot=null,lastGpuCount=0,suite=null;
  const views=[
    {id:'costa',name:'Costa a pie · captura original',x:1373,z:-438,dx:0,dz:1,height:1.75},
    {id:'isla',name:'Isla de Nácar · desde la orilla',x:1369,z:-303,dx:0,dz:-1,height:1.75},
    {id:'ladera',name:'Ladera montañosa',x:2600,z:-3500,dx:.6,dz:1,height:1.75},
    {id:'vegetacion',name:'Vegetación · Brisalia',x:-1250,z:1920,dx:0,dz:-1,height:1.75}
  ];
  const rows=[...channelField.rowsByRiver.values()].find(rows=>rows.length>100);
  if(rows)for(const [id,name,index] of [['nacimiento','Nacimiento del río',0],['desembocadura','Desembocadura del río',rows.length-1]]){
    const point=rows[index];
    // Inspect across the channel from its upper bank, rather than staring
    // tangentially into the steep terrain immediately beside the source.
    const candidates=[-1,1].map(side=>({x:point.x+point.normalX*60*side,z:point.z+point.normalZ*60*side}));
    const bank=candidates.sort((a,b)=>channelField.heightAt(b.x,b.z)-channelField.heightAt(a.x,a.z))[0];
    views.push({id,name,...bank,dx:point.x-bank.x,dz:point.z-bank.z,height:4,
      targetX:point.x,targetZ:point.z,targetY:Math.max(point.waterY,channelField.heightAt(point.x,point.z)+.8,atlas.manifest.seaLevelMetres)});
  }
  const panel=document.createElement('details');panel.id='inspection';
  panel.innerHTML='<summary>Inspección geométrica</summary><select aria-label="Vista de inspección"></select><button type="button">Ir a la vista</button><button type="button">Guardar medición</button><button type="button">Capturar imagen</button><button type="button">Recorrer seis vistas</button><a id="compare-geometry">Comparar geometría anterior</a><p id="suite-status" role="status"></p><pre aria-live="off"></pre>';
  document.querySelector('#ui').append(panel);
  const select=panel.querySelector('select'),output=panel.querySelector('pre');
  for(const view of views){const option=document.createElement('option');option.value=view.id;option.textContent=view.name;select.append(option);}
  const go=id=>{const view=views.find(v=>v.id===id);if(view){select.value=id;frames.length=cpu.length=gpu.length=0;lastTime=0;visit(view);}};
  const download=(blob,name)=>{const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const buttons=panel.querySelectorAll('button');buttons[0].onclick=()=>go(select.value);
  buttons[1].onclick=()=>download(new Blob([JSON.stringify(lastSnapshot,null,2)],{type:'application/json'}),`auralia-${baseline?'baseline':'stream'}-${select.value}.json`);
  buttons[2].onclick=()=>scene.onAfterRenderObservable.addOnce(()=>engine.getRenderingCanvas().toBlob(blob=>{if(blob)download(blob,`auralia-${baseline?'baseline':'stream'}-${select.value}.png`);}));
  const compare=panel.querySelector('#compare-geometry'),comparisonUrl=new URL(location.href);
  if(baseline)comparisonUrl.searchParams.delete('geometry');else comparisonUrl.searchParams.set('geometry','baseline');
  compare.href=comparisonUrl.href;compare.textContent=baseline?'Comparar geometría nueva':'Comparar geometría anterior';
  const suiteStatus=panel.querySelector('#suite-status');
  buttons[3].onclick=()=>{
    if(suite)return;
    suite={index:0,stage:'warmup',start:performance.now(),captures:[],viewport:[engine.getRenderWidth(),engine.getRenderHeight()]};
    go(views[0].id);suiteStatus.textContent='Preparando vista 1/6. Mantené esta pestaña visible y el tamaño de la ventana.';
    for(const button of buttons)button.disabled=true;select.disabled=true;
  };
  const qa=new URLSearchParams(location.search).get('qa');if(qa){panel.open=true;go(qa);}
  function snapshot(){
    const active=scene.getActiveMeshes(),visible=new Set(active.data.slice(0,active.length));
    const terrain=terrainStream?.stats()??Object.fromEntries([96,384].map(subdivisions=>{
      const meshes=scene.meshes.filter(m=>m.metadata?.subdivisions===subdivisions);
      return [subdivisions===96?'far':'near',{spacing:atlas.size/subdivisions,resident:meshes.length,
        visible:meshes.filter(m=>visible.has(m)).length,vertices:meshes.reduce((s,m)=>s+m.getTotalVertices(),0),
        triangles:meshes.reduce((s,m)=>s+m.getTotalIndices()/3,0),visibleTriangles:meshes.filter(m=>visible.has(m)).reduce((s,m)=>s+m.getTotalIndices()/3,0),
        geometryBytes:meshes.reduce((s,m)=>s+m.getTotalVertices()*28+m.getTotalIndices()*4,0)}];
    }));
    return {schema:'auralia-preview-measurement-v1',mode:baseline?'baseline geometry':'patch stream',view:select.value,
      timestamp:new Date().toISOString(),camera:scene.activeCamera.position.asArray(),cameraForward:scene.activeCamera.getForwardRay().direction.asArray(),eyeHeight:views.find(v=>v.id===select.value)?.height,quality:document.querySelector('#quality').value,
      viewport:[engine.getRenderWidth(),engine.getRenderHeight()],samples:frames.length,
      frameMs:{median:percentile(frames,.5),p95:percentile(frames,.95)},cpuRenderMs:{median:percentile(cpu,.5),p95:percentile(cpu,.95)},
      gpuMs:{median:percentile(gpu,.5),p95:percentile(gpu,.95)},jsHeapBytes:performance.memory?.usedJSHeapSize??null,
      gpuSamples:gpu.length,graphics:engine.getGlInfo?.(),processMemoryBytes:null,terrain,visibleSceneTriangles:scene.getActiveIndices()/3};
  }
  return {views,go,snapshot,frame(renderMs){
    const now=performance.now();if(document.visibilityState!=='visible'){lastTime=0;return;}
    if(lastTime)frames.push(now-lastTime);lastTime=now;
    cpu.push(renderMs);const counter=timing.gpuFrameTimeCounter;
    if(counter.current>0&&counter.count!==lastGpuCount){gpu.push(counter.current/1e6);lastGpuCount=counter.count;}
    for(const values of [frames,cpu,gpu])if(values.length>300)values.shift();
    if(suite){
      if(suite.viewport[0]!==engine.getRenderWidth()||suite.viewport[1]!==engine.getRenderHeight()){
        suiteStatus.textContent='Prueba cancelada: cambió la resolución. Reiniciá con la ventana estable.';
        suite=null;for(const button of buttons)button.disabled=false;select.disabled=false;
      }else if(suite.stage==='warmup'&&now-suite.start>5000&&(!terrainStream||terrainStream.settled)&&scene.isReady()){
        frames.length=cpu.length=gpu.length=0;lastTime=0;suite.stage='measure';
        suiteStatus.textContent=`Midiendo ${views[suite.index].name} (${suite.index+1}/6): 300 frames.`;
      }else if(suite.stage==='measure'&&frames.length>=300){
        suite.captures.push({measurement:snapshot(),png:engine.getRenderingCanvas().toDataURL('image/png')});
        suite.index++;
        if(suite.index===views.length){
          download(new Blob([JSON.stringify({schema:'auralia-visual-suite-v1',captures:suite.captures})],{type:'application/json'}),`auralia-${baseline?'baseline':'stream'}-suite.json`);
          suiteStatus.textContent='Se guardaron las seis imágenes y sus mediciones en un único archivo JSON.';
          suite=null;for(const button of buttons)button.disabled=false;select.disabled=false;
        }else{suite.stage='warmup';suite.start=now;go(views[suite.index].id);suiteStatus.textContent=`Preparando vista ${suite.index+1}/6.`;}
      }
    }
    if(now-lastRefresh<1000)return;lastRefresh=now;lastSnapshot=snapshot();
    const n=x=>x==null?'n/d':x.toFixed(2),m=lastSnapshot;
    output.textContent=`${m.mode} · ${m.samples} frames\nFrame med/p95: ${n(m.frameMs.median)} / ${n(m.frameMs.p95)} ms\nCPU render: ${n(m.cpuRenderMs.median)} ms · GPU: ${n(m.gpuMs.median)} ms\nHeap JS: ${n(m.jsHeapBytes/1048576)} MiB (no proceso)\n`+
      Object.entries(m.terrain).map(([lod,s])=>`${lod}: ${s.spacing.toFixed(2)} m · ${s.resident} residentes / ${s.visible} visibles · ${s.triangles} tri res. / ${s.visibleTriangles} vis.`).join('\n');
  },dispose(){timing.dispose();panel.remove();}};
}
