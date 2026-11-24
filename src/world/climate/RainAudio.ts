/** Procedural ambience from the supplied preview; one reusable noise loop. */
export class RainAudio {
  private context:AudioContext|null=null;
  private source:AudioBufferSourceNode|null=null;
  private gain:GainNode|null=null;
  private disposed=false;
  private unlocked=false;
  private target=0;
  private volume=1;
  private intensity=0;
  private paused=false;
  private applied=-1;
  private silenceTimer:ReturnType<typeof setTimeout>|null=null;
  private readonly unlock=()=>{
    if(this.disposed)return;
    this.unlocked=true;
    if(this.target<=0)return;
    this.wake();
  };
  private wake():void{
    if(this.silenceTimer!==null){clearTimeout(this.silenceTimer);this.silenceTimer=null;}
    if(!this.context){
      this.context=new AudioContext();
      const buffer=this.context.createBuffer(1,this.context.sampleRate*3,this.context.sampleRate);
      const data=buffer.getChannelData(0);let seed=991;
      for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*.6;}
      this.source=this.context.createBufferSource();this.source.buffer=buffer;this.source.loop=true;
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=6200;
      this.gain=this.context.createGain();this.gain.gain.value=0;
      this.source.connect(filter).connect(this.gain).connect(this.context.destination);this.source.start();
    }
    if(this.context.state==='suspended')void this.context.resume().catch(()=>{});
    this.applyGain();
  }
  private applyGain():void{
    if(!this.context||!this.gain||Math.abs(this.applied-this.target)<.0001)return;
    this.applied=this.target;
    const now=this.context.currentTime;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(this.target,now,.06);
  }
  constructor(){
    window.addEventListener('pointerdown',this.unlock);
    window.addEventListener('keydown',this.unlock);
  }
  update(intensity:number,paused:boolean):void{
    if(this.disposed)return;
    this.intensity=intensity;this.paused=paused;
    const previous=this.target;
    this.target=paused||intensity<=.0001?0:Math.max(0,Math.min(1,intensity))*.13*this.volume;
    if(this.target>0&&this.unlocked&&(!this.context||previous===0))this.wake();
    this.applyGain();
    if(this.target===0&&previous>0&&this.context&&this.silenceTimer===null){
      this.silenceTimer=setTimeout(()=>{
        this.silenceTimer=null;
        if(!this.disposed&&this.target===0)void this.context?.suspend().catch(()=>{});
      },350);
    }
  }
  setVolume(volume:number):void{
    this.volume=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):1;
    this.update(this.intensity,this.paused);
  }
  dispose():void{
    if(this.disposed)return;this.disposed=true;
    if(this.silenceTimer!==null)clearTimeout(this.silenceTimer);
    window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);
    this.source?.stop();void this.context?.close();this.source=null;this.gain=null;this.context=null;
  }
}
