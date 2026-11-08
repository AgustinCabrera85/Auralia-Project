export const TELEMETRY_PHASES=['clima','movimiento','oceano','terreno','vegetacion','pasto','props','assets','agua','ui'] as const;
export type TelemetryPhase=typeof TELEMETRY_PHASES[number];
export const PHASE_LABELS:Record<TelemetryPhase,string>={clima:'Clima',movimiento:'Movimiento/colisiones',
  terreno:'Terreno/streaming',vegetacion:'Vegetación',pasto:'Pasto',props:'Rocas/recursos',
  assets:'Assets GLB/LOD',agua:'Agua',oceano:'Océano',ui:'UI/guardado'};
export const TELEMETRY_COLUMNS=['timeMs','frameMs','updateMs','renderMs','cameraMs','activeMeshesMs','gpuMs',
  'shaderMs','drawCalls','triangles','pendingTerrain','pendingLoads','x','z',...TELEMETRY_PHASES] as const;
export const T=Object.fromEntries(TELEMETRY_COLUMNS.map((name,i)=>[name,i])) as
  Record<typeof TELEMETRY_COLUMNS[number],number>;
const STRIDE=TELEMETRY_COLUMNS.length;

export type TelemetryMemorySample={
  timeMs:number;jsUsedBytes:number|null;jsAllocatedBytes:number|null;jsLimitBytes:number|null;
  meshes:number;geometries:number;textures:number;materials:number;skeletons:number;
  morphManagers:number;animationGroups:number;animatables:number;x:number;z:number;
};

/** One sample per second, independent of FPS; at most ten minutes of storage. */
export class TelemetryMemoryHistory {
  private readonly samples:TelemetryMemorySample[]=[];
  private cursor=0;
  private lastTime=-Infinity;
  constructor(readonly capacity=600,readonly intervalMs=1000){}
  get count():number{return this.samples.length;}
  due(timeMs:number):boolean{
    return Number.isFinite(timeMs)&&timeMs>=0&&timeMs-this.lastTime>=this.intervalMs;
  }
  push(sample:TelemetryMemorySample):boolean{
    if(!this.due(sample.timeMs))return false;
    this.samples[this.cursor]={...sample};
    this.cursor=(this.cursor+1)%this.capacity;
    this.lastTime=sample.timeMs;
    return true;
  }
  clear():void{this.samples.length=0;this.cursor=0;this.lastTime=-Infinity;}
  exportRows():TelemetryMemorySample[]{
    const start=this.samples.length===this.capacity?this.cursor:0;
    return Array.from({length:this.samples.length},(_,i)=>
      ({...this.samples[(start+i)%this.samples.length]}));
  }
}

/** Fixed storage: recording never allocates a new frame object or grows indefinitely. */
export class TelemetryHistory {
  private readonly values:Float64Array;
  private cursor=0;
  private length=0;
  constructor(readonly capacity=1800){this.values=new Float64Array(capacity*STRIDE);}
  get count():number{return this.length;}
  clear():void{this.cursor=0;this.length=0;}
  push(frame:Float64Array):void{
    if(!Number.isFinite(frame[T.timeMs])||!Number.isFinite(frame[T.frameMs])||frame[T.frameMs]<=0)return;
    this.values.set(frame,this.cursor*STRIDE);
    this.cursor=(this.cursor+1)%this.capacity;
    this.length=Math.min(this.capacity,this.length+1);
  }
  private offset(i:number):number{
    return ((this.cursor-this.length+i+this.capacity)%this.capacity)*STRIDE;
  }
  summary(now:number,windowMs=10000){
    const intervals:number[]=[],sums=new Float64Array(STRIDE),peaks=new Float64Array(STRIDE);
    let over50=0,over100=0,gpuCount=0;
    for(let i=0;i<this.length;i++){
      const offset=this.offset(i);
      if(this.values[offset+T.timeMs]<now-windowMs)continue;
      const ms=this.values[offset+T.frameMs];intervals.push(ms);
      if(ms>50)over50++;if(ms>100)over100++;
      if(Number.isFinite(this.values[offset+T.gpuMs]))gpuCount++;
      for(let c=0;c<STRIDE;c++){
        const value=this.values[offset+c];
        if(!Number.isFinite(value))continue;
        sums[c]+=value;peaks[c]=Math.max(peaks[c],value);
      }
    }
    intervals.sort((a,b)=>a-b);
    const n=intervals.length;
    const mean=n?sums[T.frameMs]/n:0;
    const percentile=(p:number):number=>n?intervals[Math.max(0,Math.ceil(n*p)-1)]:0;
    return {count:n,fps:mean?1000/mean:0,mean,p95:percentile(.95),p99:percentile(.99),
      max:peaks[T.frameMs],over50,over100,gpuMs:gpuCount?sums[T.gpuMs]/gpuCount:null,
      averages:Float64Array.from(sums,value=>n?value/n:0),peaks};
  }
  graph(limit=180):number[]{
    const frames:number[]=[];
    for(let i=Math.max(0,this.length-limit);i<this.length;i++)
      frames.push(this.values[this.offset(i)+T.frameMs]);
    return frames;
  }
  slowFrames(now:number,limit=5):{timeMs:number;frameMs:number;label:string;costMs:number}[]{
    const result=[];
    for(let i=this.length-1;i>=0&&result.length<limit;i--){
      const o=this.offset(i),frameMs=this.values[o+T.frameMs];
      if(this.values[o+T.timeMs]<now-10000)break;
      if(frameMs<=50)continue;
      let label='Babylon CPU',costMs=this.values[o+T.renderMs];
      for(const phase of TELEMETRY_PHASES){
        const value=this.values[o+T[phase]];
        if(value>costMs){costMs=value;label=PHASE_LABELS[phase];}
      }
      if(costMs<5||costMs<frameMs*.25)label='Sin pico CPU claro';
      result.push({timeMs:this.values[o+T.timeMs],frameMs,label,costMs});
    }
    return result;
  }
  exportRows():Record<string,number|null>[] {
    return Array.from({length:this.length},(_,i)=>{
      const o=this.offset(i);
      return Object.fromEntries(TELEMETRY_COLUMNS.map((name,c)=>{
        const value=this.values[o+c];
        return [name,Number.isFinite(value)?Math.round(value*100)/100:null];
      }));
    });
  }
}
