export type AudioChannel='master'|'music'|'ambience';
export type SoundPreferences={master:number;music:number;ambience:number;muted:boolean;musicEnabled:boolean};
export const SOUND_DEFAULTS:Readonly<SoundPreferences>={master:.8,music:.6,ambience:.7,muted:false,musicEnabled:true};
export const SOUND_STORAGE_KEY='auralia:audio:v1';
const level=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(1,value)):fallback;

/** Device preferences are independent of saved adventures. */
export class AudioSettings {
  private value:SoundPreferences={...SOUND_DEFAULTS};
  private readonly listeners=new Set<(preferences:Readonly<SoundPreferences>)=>void>();
  constructor(private readonly storage:Pick<Storage,'getItem'|'setItem'>|null=null){
    try{
      const data=JSON.parse(storage?.getItem(SOUND_STORAGE_KEY)??'null');
      if(data&&typeof data==='object')this.value={
        master:level(data.master,.8),music:level(data.music,.6),ambience:level(data.ambience,.7),
        muted:data.muted===true,musicEnabled:data.musicEnabled!==false};
    }catch{/* A blocked or malformed preference store must not prevent playing. */}
  }
  get current():Readonly<SoundPreferences>{return {...this.value};}
  gain(channel:'music'|'ambience'):number{return this.value.muted?0:this.value.master*this.value[channel];}
  set(patch:Partial<SoundPreferences>):void{
    const next={...this.value};
    for(const channel of ['master','music','ambience'] as const)if(channel in patch)next[channel]=level(patch[channel],next[channel]);
    if(typeof patch.muted==='boolean')next.muted=patch.muted;
    if(typeof patch.musicEnabled==='boolean')next.musicEnabled=patch.musicEnabled;
    if(JSON.stringify(next)===JSON.stringify(this.value))return;
    this.value=next;
    try{this.storage?.setItem(SOUND_STORAGE_KEY,JSON.stringify(next));}catch{/* Still usable for this session. */}
    for(const listener of this.listeners)listener(this.current);
  }
  subscribe(listener:(preferences:Readonly<SoundPreferences>)=>void):()=>void{
    this.listeners.add(listener);listener(this.current);return ()=>this.listeners.delete(listener);
  }
}
function browserStorage():Storage|null{try{return globalThis.localStorage??null;}catch{return null;}}
export const audioSettings=new AudioSettings(browserStorage());
