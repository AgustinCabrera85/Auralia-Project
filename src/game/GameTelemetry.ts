import { Engine, EngineInstrumentation, Scene, SceneInstrumentation } from '@babylonjs/core';
import { PHASE_LABELS, T, TELEMETRY_COLUMNS, TELEMETRY_PHASES, TelemetryHistory,
  type TelemetryPhase } from './telemetryData';

export type TelemetryWorldStats={zone:string;near:number;mid:number;far:number;
  vegetation:number;vegetationLod:number;grass:number;grassSectors:number};
type BrowserEvent={timeMs:number;kind:'resource'|'longtask';label:string;durationMs:number};
const ms=(value:number):string=>value.toFixed(1)+' ms';

/** Optional local profiler: F8 or ?telemetry=1. No instrumentation runs while hidden. */
export class GameTelemetry {
  readonly history=new TelemetryHistory();
  private readonly panel:HTMLDivElement;
  private readonly fields=new Map<string,HTMLElement>();
  private readonly canvas:HTMLCanvasElement;
  private sceneStats:SceneInstrumentation|null=null;
  private engineStats:EngineInstrumentation|null=null;
  private browserObserver:PerformanceObserver|null=null;
  private readonly events:BrowserEvent[]=[];
  private readonly frame=new Float64Array(TELEMETRY_COLUMNS.length);
  private started=performance.now();
  private previousBegin:number|null=null;
  private frameStart=0;
  private lastMark=0;
  private updateEnd=0;
  private renderEnd=0;
  private shaderBaseline=0;
  private lastRefresh=-Infinity;
  private pendingFrame=false;
  private capturing=false;
  private visible=true;
  private paused=false;
  private disposed=false;
  private readonly gpuSupported:boolean;

  constructor(private readonly scene:Scene,private readonly engine:Engine,
    private readonly worldStats:()=>TelemetryWorldStats){
    this.gpuSupported=!!engine.getCaps().timerQuery;
    this.panel=document.createElement('div');this.panel.id='auralia-telemetry';
    this.panel.setAttribute('role','region');this.panel.setAttribute('aria-label','Telemetría del juego');
    this.panel.style.cssText='position:fixed;right:14px;bottom:82px;z-index:1400;'+
      'width:min(410px,calc(100vw - 28px));box-sizing:border-box;padding:12px;'+
      'background:#101c2aef;color:#e7edf5;border:1px solid #708a9b;border-radius:10px;'+
      'font:12px/1.45 system-ui;box-shadow:0 5px 24px #0007;overflow:auto;';
    this.panel.innerHTML=`<style>
      #auralia-telemetry header{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #auralia-telemetry button{color:#f1f6fc;background:#2d4559;border:1px solid #637c90;border-radius:5px;padding:5px 9px;cursor:pointer}
      #auralia-telemetry pre{font:11px/1.5 ui-monospace,monospace;margin:7px 0;white-space:pre-wrap}
      #auralia-telemetry summary{cursor:pointer;color:#aac4db}
      #auralia-telemetry .telemetry-actions{display:flex;gap:6px;position:sticky;bottom:-12px;background:#101c2a;padding:10px 0 4px}
      #auralia-telemetry canvas{width:100%;height:64px;display:block;background:#0a131d;border-radius:4px}
    </style>
    <header><strong>TELEMETRÍA · <span data-t="status">Midiendo</span></strong><button data-action="close" aria-label="Ocultar telemetría">F8 ×</button></header>
    <pre data-t="frames">Esperando frames…</pre>
    <canvas width="386" height="64" aria-label="Tiempo real de los últimos 180 frames"></canvas>
    <small data-t="graph">Intervalo real entre frames · referencia 60 FPS: 16,7 ms</small>
    <details open><summary>CPU por bloque · promedio / pico en 10 s</summary><pre data-t="phases"></pre></details>
    <pre data-t="scene"></pre>
    <details open><summary>Picos recientes &gt;50 ms · mayor coste medido</summary><pre data-t="hitches"></pre></details>
    <details><summary>Cargas y tareas largas del navegador</summary><pre data-t="events"></pre></details>
    <small>Babylon CPU incluye cámara y envío de dibujos. GPU es una medida asíncrona cuando el navegador la ofrece.</small>
    <div class="telemetry-actions"><button data-action="pause">Pausar</button><button data-action="export">Exportar JSON</button><button data-action="reset">Reiniciar</button></div>`;
    for(const el of this.panel.querySelectorAll<HTMLElement>('[data-t]'))this.fields.set(el.dataset.t!,el);
    this.canvas=this.panel.querySelector('canvas')!;
    this.panel.addEventListener('click',this.handleClick);
    // Panel interactions should not collect resources, rotate the camera or close the HUD.
    this.panel.addEventListener('pointerdown',event=>event.stopPropagation());
    document.body.appendChild(this.panel);
    this.layout();window.addEventListener('resize',this.layout);
    document.addEventListener('visibilitychange',this.visibilityChanged);
    this.syncCapture();
  }
  get recording():boolean{return this.visible&&!this.paused&&!document.hidden&&!this.disposed;}
  private readonly layout=():void=>{
    const climate=document.getElementById('auralia-climate-debug');
    const reserved=climate?climate.getBoundingClientRect().bottom+96:160;
    this.panel.style.maxHeight=`max(180px,min(74vh,calc(100vh - ${reserved}px)))`;
  };
  toggleVisibility():void{
    this.visible=!this.visible;this.panel.hidden=!this.visible;this.syncCapture();
  }
  private readonly visibilityChanged=():void=>this.syncCapture();
  private syncCapture():void{
    this.capturing=false;this.pendingFrame=false;this.previousBegin=null;
    if(this.recording&&!this.sceneStats){
      this.sceneStats=new SceneInstrumentation(this.scene);
      this.sceneStats.captureActiveMeshesEvaluationTime=true;
      this.engineStats=new EngineInstrumentation(this.engine);
      this.engineStats.captureShaderCompilationTime=true;
      if(this.gpuSupported)this.engineStats.captureGPUFrameTime=true;
      this.shaderBaseline=this.engineStats.shaderCompilationTimeCounter.total;
      if(typeof PerformanceObserver!=='undefined'){
        const supported=PerformanceObserver.supportedEntryTypes??[];
        const types=['resource','longtask'].filter(type=>supported.includes(type));
        if(types.length){
          this.browserObserver=new PerformanceObserver(list=>{
            if(!this.recording)return;
            for(const entry of list.getEntries()){
              const isLong=entry.entryType==='longtask';
              if(!isLong&&!/\.(glb|png|jpe?g|webp)(?:$|\?)/i.test(entry.name))continue;
              const label=isLong?'Tarea larga del navegador':
                decodeURIComponent(new URL(entry.name,location.href).pathname.split('/').pop()??'Recurso');
              this.events.push({timeMs:entry.startTime+entry.duration-this.started,
                kind:isLong?'longtask':'resource',label:label.slice(0,90),durationMs:entry.duration});
              if(this.events.length>128)this.events.shift();
            }
          });
          this.browserObserver.observe({entryTypes:types});
        }
      }
    }else if(!this.recording&&this.sceneStats){
      if(this.gpuSupported)this.engineStats!.captureGPUFrameTime=false;
      this.engineStats?.dispose();this.sceneStats.dispose();
      this.engineStats=null;this.sceneStats=null;
      this.browserObserver?.disconnect();this.browserObserver=null;
    }
    this.fields.get('status')!.textContent=this.paused?'Pausado':'Midiendo';
  }

  beginFrame():void{
    this.capturing=this.recording;
    if(!this.capturing){this.previousBegin=null;this.pendingFrame=false;return;}
    const now=performance.now(),shaderTotal=this.engineStats!.shaderCompilationTimeCounter.total;
    if(this.previousBegin!==null&&this.pendingFrame){
      // An interval describes the PREVIOUS frame. Keep its own CPU blocks/context,
      // rather than incorrectly blaming the update that happens after the hitch.
      this.frame[T.timeMs]=now-this.started;
      this.frame[T.frameMs]=now-this.previousBegin;
      this.frame[T.shaderMs]=Math.max(0,shaderTotal-this.shaderBaseline);
      const gpu=this.engineStats!.gpuFrameTimeCounter;
      this.frame[T.gpuMs]=this.gpuSupported&&gpu?.count?gpu.current/1e6:NaN;
      this.history.push(this.frame);
    }
    this.frame.fill(0);this.frame[T.gpuMs]=NaN;
    this.pendingFrame=false;this.previousBegin=now;this.frameStart=now;this.lastMark=now;
    this.shaderBaseline=shaderTotal;
  }
  mark(phase:TelemetryPhase):void{
    if(!this.capturing)return;
    const now=performance.now();this.frame[T[phase]]+=now-this.lastMark;this.lastMark=now;
  }
  endUpdate():void{
    if(!this.capturing)return;
    this.updateEnd=performance.now();this.frame[T.updateMs]=this.updateEnd-this.frameStart;
  }
  recordCamera(durationMs:number):void{
    if(this.capturing)this.frame[T.cameraMs]+=durationMs;
  }
  endRender():void{
    if(!this.capturing)return;
    this.renderEnd=performance.now();this.frame[T.renderMs]=this.renderEnd-this.updateEnd;
  }
  endFrame(pendingTerrain:number,x:number,z:number):void{
    if(!this.capturing)return;
    this.frame[T.drawCalls]=this.sceneStats!.drawCallsCounter.current;
    this.frame[T.activeMeshesMs]=this.sceneStats!.activeMeshesEvaluationTimeCounter.current;
    this.frame[T.triangles]=this.scene.getActiveIndices()/3;
    this.frame[T.pendingTerrain]=pendingTerrain;
    this.frame[T.pendingLoads]=this.scene.getWaitingItemsCount();
    this.frame[T.x]=x;this.frame[T.z]=z;this.pendingFrame=true;
    const now=performance.now();
    if(now-this.lastRefresh>=250){this.lastRefresh=now;this.refresh(now);}
  }
  private refresh(now:number):void{
    const stats=this.history.summary(now-this.started),a=stats.averages,p=stats.peaks;
    const f=this.fields;
    f.get('status')!.style.color=stats.p95>50?'#ff938d':stats.p95>33.4?'#f5ce77':'#a8df9a';
    f.get('frames')!.textContent=`${stats.fps.toFixed(0)} FPS · media ${ms(stats.mean)} · pico ${ms(stats.max)}\n`+
      `P95 ${ms(stats.p95)} · P99 ${ms(stats.p99)}\n`+
      `Picos >50 ms: ${stats.over50} · >100 ms: ${stats.over100} (últimos 10 s)`;
    f.get('phases')!.textContent=
      `Actualización       ${ms(a[T.updateMs]).padStart(8)} / ${ms(p[T.updateMs])}\n`+
      TELEMETRY_PHASES.map(phase=>`${PHASE_LABELS[phase].padEnd(22)}${ms(a[T[phase]]).padStart(8)} / ${ms(p[T[phase]])}`).join('\n')+
      `\nBabylon CPU         ${ms(a[T.renderMs]).padStart(8)} / ${ms(p[T.renderMs])}`+
      `\n  Cámara (incluida)  ${ms(a[T.cameraMs]).padStart(8)} / ${ms(p[T.cameraMs])}`+
      `\n  Evaluación mallas  ${ms(a[T.activeMeshesMs]).padStart(8)} / ${ms(p[T.activeMeshesMs])}`+
      `\nGPU                 ${stats.gpuMs===null?(this.gpuSupported?'esperando muestra':'no disponible'):ms(stats.gpuMs)}`+
      `\nShaders CPU (suma)  ${ms(a[T.shaderMs]*stats.count)}`;
    const world=this.worldStats();
    const memory=(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory;
    f.get('scene')!.textContent=`Draw calls ${Math.round(this.frame[T.drawCalls])} · triángulos ${Math.round(this.frame[T.triangles]).toLocaleString()}\n`+
      `Mallas activas ${this.scene.getActiveMeshes().length}/${this.scene.meshes.length} · materiales ${this.scene.materials.length}\n`+
      `Terreno N/M/F ${world.near}/${world.mid}/${world.far} · cola ${pending(this.frame[T.pendingTerrain])}\n`+
      `Vegetación ${world.vegetation} (${world.vegetationLod} LOD)\n`+
      `Pasto ${world.grass} · sectores ${world.grassSectors}\n`+
      `Cargas Babylon pendientes ${pending(this.frame[T.pendingLoads])}`+
      (memory?` · JS ${(memory.usedJSHeapSize/1048576).toFixed(0)} MiB`:'')+
      `\nRender ${this.engine.getRenderWidth()}×${this.engine.getRenderHeight()} · ${world.zone}`+
      `\nX ${Math.round(this.frame[T.x])} · Z ${Math.round(this.frame[T.z])}`;
    const slow=this.history.slowFrames(now-this.started);
    f.get('hitches')!.textContent=slow.length?slow.map(row=>
      `${(row.timeMs/1000).toFixed(1)} s · ${ms(row.frameMs)} · ${row.label}`+
      (row.label==='Sin pico CPU claro'?'':` ${ms(row.costMs)}`)).join('\n'):'Sin picos >50 ms en esta ventana';
    f.get('events')!.textContent=this.events.slice(-6).reverse().map(event=>
      `${(event.timeMs/1000).toFixed(1)} s · ${ms(event.durationMs)} · ${event.label}`).join('\n')||'Sin eventos nuevos';
    this.drawGraph();
  }
  private drawGraph():void{
    const ctx=this.canvas.getContext('2d');if(!ctx)return;
    const values=this.history.graph(),w=this.canvas.width,h=this.canvas.height;
    // Keep the 16.7/33.3 ms references readable even after a multi-second hitch.
    const peak=Math.max(0,...values),range=Math.max(50,Math.min(100,peak));
    this.fields.get('graph')!.textContent=`Últimos 180 frames · escala 0–${range.toFixed(0)} ms`+
      (peak>range?' · ↑ supera la escala':' · 60 FPS = 16,7 ms');
    ctx.clearRect(0,0,w,h);
    ctx.font='9px monospace';
    for(const limit of [16.67,33.33]){
      const y=h-limit/range*(h-8);ctx.strokeStyle='#526377';ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
      ctx.fillStyle='#b0c3d8';ctx.fillText(limit.toFixed(1),3,Math.max(9,y-2));
    }
    for(let i=0;i<values.length;i++){
      const x=i/180*w,y=h-Math.min(values[i],range)/range*(h-8);
      ctx.strokeStyle=values[i]>50?'#f58079':values[i]>33.4?'#e6c16d':'#83c9a0';
      ctx.beginPath();ctx.moveTo(x,h);ctx.lineTo(x,y);ctx.stroke();
      if(values[i]>range)ctx.fillRect(x,0,2,3);
    }
  }
  private readonly handleClick=(event:MouseEvent):void=>{
    const action=(event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if(!action)return;event.stopPropagation();
    if(action==='close')this.toggleVisibility();
    if(action==='pause'){
      this.paused=!this.paused;(event.target as HTMLElement).textContent=this.paused?'Continuar':'Pausar';this.syncCapture();
    }
    if(action==='reset'){
      this.history.clear();this.events.length=0;this.started=performance.now();
      this.previousBegin=null;this.pendingFrame=false;this.refresh(this.started);
    }
    if(action==='export'){
      const report={version:1,exportedAt:new Date().toISOString(),windowMs:10000,
        capacityFrames:this.history.capacity,gpuTimerSupported:this.gpuSupported,
        notes:'frameMs es el intervalo real; bloques CPU pertenecen al frame anterior. GPU asíncrona; null si no está disponible.',
        world:this.worldStats(),resolution:[this.engine.getRenderWidth(),this.engine.getRenderHeight()],
        phases:PHASE_LABELS,frames:this.history.exportRows(),events:this.events};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='auralia-telemetria.json';a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  };
  dispose():void{
    this.disposed=true;this.syncCapture();
    window.removeEventListener('resize',this.layout);
    document.removeEventListener('visibilitychange',this.visibilityChanged);this.panel.remove();
  }
}
const pending=(value:number):string=>Math.round(value).toString();
