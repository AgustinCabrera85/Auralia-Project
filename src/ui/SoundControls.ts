import {audioSettings,type AudioChannel} from '../audio/AudioSettings';
import type {GameMusic} from '../audio/GameMusic';
import {icon} from './HudIcons';

/** Sound controls update in place so sliders never lose pointer or keyboard focus. */
export class SoundControls {
  private readonly unsubscribe:(()=>void)[];
  constructor(private readonly music:GameMusic){
    document.getElementById('sound-dock')!.innerHTML=`
      <button class="now-playing" data-panel="sound" aria-label="Abrir controles de sonido" title="Sonido">
        <span class="music-emblem">${icon('music')}</span><span><small data-music-state>BANDA SONORA</small><strong>Pueblo Brisalia</strong></span>
        <span class="music-bars" aria-hidden="true"><i></i><i></i><i></i></span></button>
      <button class="sound-quick-mute" data-sound="mute" aria-label="Silenciar sonido" aria-pressed="false">${icon('volume')}</button>`;
    this.unsubscribe=[audioSettings.subscribe(()=>this.refresh()),music.subscribe(()=>this.refresh())];
    document.addEventListener('click',this.onClick);document.addEventListener('input',this.onInput);
  }
  markup():string{
    const p=audioSettings.current;
    return `<div class="sound-panel">
      <div class="sound-track"><div class="sound-record">${icon('leaf')}<span>✦</span></div><div><span class="panel-kicker">BANDA SONORA · 01</span><h3>Pueblo Brisalia</h3><p data-music-state></p></div>
        <button class="music-toggle" data-sound="music" aria-label="Pausar música">${icon('pause')}</button></div>
      <div class="sound-levels">${([
        ['master','Volumen general','Todos los sonidos de Auralia','volume'],
        ['music','Música','La melodía que acompaña tu viaje','music'],
        ['ambience','Ambiente','Lluvia y sonidos del entorno','leaf']
      ] as const).map(([key,title,detail,glyph])=>`<div class="sound-level">
        <label for="volume-${key}">${icon(glyph)}<span><strong>${title}</strong><small>${detail}</small></span></label>
        <output id="volume-${key}-value" for="volume-${key}">${Math.round(p[key]*100)}%</output>
        <input id="volume-${key}" data-volume="${key}" type="range" min="0" max="100" step="1" value="${Math.round(p[key]*100)}" aria-describedby="volume-${key}-value">
      </div>`).join('')}</div>
      <div class="sound-bottom"><button data-sound="mute" class="sound-mute" aria-pressed="${p.muted}">${icon(p.muted?'mute':'volume')}<span data-mute-label>Silenciar todo</span></button><span>Se guarda automáticamente</span></div>
      <p class="sound-hint">La música continúa al viajar y se pausa al ocultar el juego.</p>
    </div>`;
  }
  refresh():void{
    const p=audioSettings.current,s=this.music.status;
    const message=p.muted?'Sonido silenciado':!p.musicEnabled?'Música en pausa':
      s.state==='playing'?(audioSettings.gain('music')>0?'Sonando en Auralia':'Volumen en cero'):
      s.state==='waiting'?'Tocá para escuchar':s.state==='loading'?'Preparando música':s.state==='error'?'No se pudo cargar la canción':'Música en pausa';
    document.querySelectorAll<HTMLElement>('[data-music-state]').forEach(el=>el.textContent=message);
    document.getElementById('sound-dock')?.classList.toggle('is-playing',s.state==='playing'&&!p.muted&&audioSettings.gain('music')>0);
    document.querySelectorAll<HTMLButtonElement>('[data-sound="mute"]').forEach(el=>{
      el.setAttribute('aria-pressed',String(p.muted));el.setAttribute('aria-label',p.muted?'Activar sonido':'Silenciar sonido');
      const glyph=el.querySelector('svg');if(glyph)glyph.outerHTML=icon(p.muted?'mute':'volume');
    });
    document.querySelectorAll<HTMLElement>('[data-mute-label]').forEach(el=>el.textContent=p.muted?'Activar sonido':'Silenciar todo');
    document.querySelectorAll<HTMLButtonElement>('[data-sound="music"]').forEach(el=>{
      const paused=!p.musicEnabled||s.state==='error'||s.state==='waiting';
      el.innerHTML=icon(paused?'play':'pause');el.setAttribute('aria-label',s.state==='error'?'Reintentar música':paused?'Reproducir música':'Pausar música');
    });
    for(const key of ['master','music','ambience'] as const){
      const input=document.getElementById(`volume-${key}`) as HTMLInputElement|null;
      if(input){input.value=String(Math.round(p[key]*100));input.style.setProperty('--level',`${input.value}%`);}
      const output=document.getElementById(`volume-${key}-value`);if(output)output.textContent=`${Math.round(p[key]*100)}%`;
    }
  }
  private readonly onInput=(e:Event)=>{
    const input=e.target;if(!(input instanceof HTMLInputElement)||!input.dataset.volume)return;
    const channel=input.dataset.volume as AudioChannel;
    if(['master','music','ambience'].includes(channel))audioSettings.set({[channel]:Number(input.value)/100});
  };
  private readonly onClick=(e:MouseEvent)=>{
    const action=(e.target as HTMLElement).closest<HTMLElement>('[data-sound]')?.dataset.sound;
    if(action==='mute')audioSettings.set({muted:!audioSettings.current.muted});
    if(action==='music'){
      if(this.music.status.state==='error'||this.music.status.state==='waiting'){audioSettings.set({musicEnabled:true});this.music.retry();}
      else audioSettings.set({musicEnabled:!audioSettings.current.musicEnabled});
    }
  };
  dispose():void{for(const fn of this.unsubscribe)fn();document.removeEventListener('click',this.onClick);document.removeEventListener('input',this.onInput);}
}
