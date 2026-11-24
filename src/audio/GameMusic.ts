import {audioSettings,type AudioSettings} from './AudioSettings';

export const FIRST_TRACK={title:'Pueblo Brisalia',src:'/assets/audio/music/pueblo-brisalia.mp3'} as const;
export type MusicState='waiting'|'playing'|'paused'|'loading'|'error';

/** One streaming element for the entire adventure, including region changes. */
export class GameMusic {
  readonly track=FIRST_TRACK;
  private readonly media:HTMLAudioElement;
  private readonly unsubscribe:()=>void;
  private readonly listeners=new Set<()=>void>();
  private inGame=false;
  private unlocked=false;
  private pending=false;
  private disposed=false;
  private state:MusicState='waiting';
  private fade=0;
  constructor(private readonly settings:AudioSettings=audioSettings,media:HTMLAudioElement=new Audio()){
    this.media=media;media.src=FIRST_TRACK.src;media.preload='metadata';media.loop=true;media.volume=0;
    media.addEventListener('playing',this.onPlaying);media.addEventListener('error',this.onError);
    window.addEventListener('pointerdown',this.unlock,true);window.addEventListener('keydown',this.unlock,true);
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('pagehide',this.onHide);window.addEventListener('pageshow',this.onVisibility);
    this.unsubscribe=settings.subscribe(()=>this.sync());
  }
  private readonly unlock=(event?:Event)=>{
    if(event?.target instanceof Element&&event.target.closest('[data-sound="music"]'))return;
    if(!this.disposed){this.unlocked=true;this.sync();}
  };
  private readonly onVisibility=()=>this.sync();
  private readonly onHide=()=>{this.pause();};
  private readonly onPlaying=()=>{
    if(!this.shouldPlay){this.pause();return;}
    this.setState('playing');this.applyVolume();
  };
  private readonly onError=()=>{this.pending=false;this.setState('error');};
  private get shouldPlay():boolean{return this.inGame&&this.settings.current.musicEnabled&&!document.hidden&&!this.disposed;}
  private setState(state:MusicState):void{
    if(state===this.state)return;this.state=state;for(const fn of this.listeners)fn();
  }
  setInGame(active:boolean):void{this.inGame=active;this.sync();}
  retry():void{this.media.load();this.setState('waiting');this.unlock();}
  private sync():void{
    if(this.disposed)return;
    this.applyVolume();
    if(!this.shouldPlay){this.pause();return;}
    if(!this.unlocked||this.pending||!this.media.paused||this.state==='error')return;
    this.pending=true;this.setState('loading');
    // Called inside the initial user gesture; no autoplay-policy bypass.
    void this.media.play().then(()=>{
      if(!this.shouldPlay)this.pause();
    }).catch(error=>{
      if(this.disposed)return;
      if(error?.name==='NotAllowedError'){this.unlocked=false;this.setState('waiting');}
      else if(error?.name!=='AbortError')this.setState('error');
    }).finally(()=>{this.pending=false;});
  }
  private applyVolume():void{
    cancelAnimationFrame(this.fade);this.fade=0;
    this.media.muted=this.settings.current.muted;
    const target=this.settings.gain('music');
    if(this.media.paused){this.media.volume=0;return;}
    if(target===0){this.media.volume=0;return;}
    const start=this.media.volume,began=performance.now();
    const step=(now:number)=>{
      // rAF shares the frame timestamp, which can precede a late input handler.
      const t=Math.max(0,Math.min(1,(now-began)/650));
      this.media.volume=Math.max(0,Math.min(1,start+(target-start)*t));
      if(t<1&&!this.disposed)this.fade=requestAnimationFrame(step);else this.fade=0;
    };
    this.fade=requestAnimationFrame(step);
  }
  private pause():void{
    cancelAnimationFrame(this.fade);this.fade=0;this.media.pause();this.media.volume=0;
    if(this.state!=='error')this.setState(this.unlocked?'paused':'waiting');
  }
  get status(){return {state:this.state,title:this.track.title,time:this.media.currentTime,
    duration:Number.isFinite(this.media.duration)?this.media.duration:0,volume:this.media.volume,muted:this.media.muted};}
  subscribe(listener:()=>void):()=>void{this.listeners.add(listener);listener();return ()=>this.listeners.delete(listener);}
  dispose():void{
    if(this.disposed)return;this.disposed=true;this.pause();this.unsubscribe();
    window.removeEventListener('pointerdown',this.unlock,true);window.removeEventListener('keydown',this.unlock,true);
    document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pagehide',this.onHide);window.removeEventListener('pageshow',this.onVisibility);
    this.media.removeEventListener('playing',this.onPlaying);this.media.removeEventListener('error',this.onError);
    this.media.removeAttribute('src');this.media.load();this.listeners.clear();
  }
}
