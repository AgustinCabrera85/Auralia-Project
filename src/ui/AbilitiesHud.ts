import { ABILITIES } from '../domain/abilities/catalog';
import type { AbilityId } from '../domain/abilities/types';
import type { AbilitySystem, AbilityView } from '../game/abilities/AbilitySystem';
import './abilities.css';
import {icon} from './HudIcons';

const typing=(target:EventTarget|null)=>target instanceof HTMLElement&&
  (!!target.closest('input,textarea,select')||target.isContentEditable);
export class AbilitiesHud {
  private readonly root=document.createElement('aside');
  private readonly panel=document.createElement('section');
  private readonly special=document.createElement('button');
  private readonly ultimate=document.createElement('button');
  private readonly select=document.createElement('select');
  private readonly rows=new Map<AbilityId,HTMLElement>();
  private readonly note=document.createElement('p');
  private readonly unsubscribe:()=>void;
  private optionKey='';
  get isOpen():boolean{return !this.panel.hidden;}
  constructor(private readonly system:AbilitySystem,private readonly beforeOpen:()=>void=()=>{}){
    this.root.className='abilities-hud';this.root.ariaLabel='Habilidades de Santi';
    this.special.innerHTML=`${icon('leaf')}<kbd>X</kbd><strong></strong><small></small>`;
    this.ultimate.innerHTML=`${icon('spark')}<kbd>T</kbd><strong>Definitivo</strong><small></small>`;
    this.special.onclick=()=>system.request();this.ultimate.onclick=()=>system.request(true);
    const open=document.createElement('button');open.innerHTML=`${icon('map')}<kbd>H</kbd><strong>Poderes</strong><small>Ver habilidades</small>`;open.ariaLabel='Poderes (H)';open.onclick=()=>this.toggle();
    this.root.append(this.special,this.ultimate,open);document.querySelector('.hud-root')!.append(this.root);
    this.panel.className='abilities-panel';this.panel.hidden=true;this.panel.setAttribute('role','dialog');
    this.panel.ariaLabel='Poderes y requisitos';this.panel.setAttribute('aria-modal','true');
    const close=document.createElement('button');close.textContent='Cerrar · H / Esc';close.onclick=()=>this.toggle(false);
    const title=document.createElement('h2');title.textContent='Poderes de los reinos';
    const help=document.createElement('p');help.textContent='X: especial seleccionado · T: definitivo · Esc: cancelar. El origen indica dónde se aprende cada poder.';
    this.select.ariaLabel='Habilidad especial seleccionada';this.select.onchange=()=>system.select(this.select.value as AbilityId);
    this.panel.append(close,title,help,this.note,this.select);
    for(const d of ABILITIES){
      const row=document.createElement('article'),name=document.createElement('strong'),description=document.createElement('p'),status=document.createElement('p');
      name.textContent=`${d.name} · ${d.origin}`;description.textContent=d.description;
      const requirement=document.createElement('small');requirement.textContent=d.unlockDescription;
      row.append(name,description,requirement,status);this.panel.append(row);this.rows.set(d.id,status);
    }
    if(import.meta.env.DEV&&new URLSearchParams(location.search).has('debug'))this.addDevelopment();
    document.body.append(this.panel);document.addEventListener('keydown',this.onKey);
    this.unsubscribe=system.subscribe(v=>this.update(v));
  }
  close():void{this.toggle(false);}
  private toggle(open=!this.isOpen):void{if(open)this.beforeOpen();this.panel.hidden=!open;if(open)this.system.interrupt();}
  private readonly onKey=(e:KeyboardEvent)=>{
    if(e.repeat||typing(e.target))return;
    if(e.key.toLowerCase()==='h'){e.preventDefault();this.toggle();}
    else if(e.key==='Escape'&&this.isOpen){this.toggle(false);}
  };
  private update(view:AbilityView):void{
    const selected=view.statuses.find(s=>s.id===view.selected),d=ABILITIES.find(a=>a.id===view.selected);
    const set=(node:HTMLElement,text:string)=>{if(node.textContent!==text)node.textContent=text;};
    set(this.special.querySelector('strong')!,d?.name??'Especial');
    const state=selected?.cooldown?`${selected.cooldown.toFixed(1)} s`:selected?.activable?'Listo':selected?.unlocked?'No disponible':'Por descubrir';
    set(this.special.querySelector('small')!,state);
    this.special.title=`${d?.name??'Especial'} · ${selected?.reason??state} (X)`;
    this.special.ariaLabel=this.special.title;
    this.special.disabled=!selected?.activable;
    const ultimate=view.statuses.find(s=>s.id==='forest_ultimate')!;
    set(this.ultimate.querySelector('small')!,ultimate.activable?'Listo':'Por descubrir');this.ultimate.disabled=!ultimate.activable;
    this.ultimate.title=`Definitivo · ${ultimate.reason??'Listo'} (T)`;this.ultimate.ariaLabel=this.ultimate.title;
    set(this.note,`${view.sandbox?'LABORATORIO TEMPORAL · no se guarda. ':''}${view.fxDiagnostic?'FX DE DIAGNÓSTICO · falta el asset. ':''}${selected?.id==='forest_roots'?
      `Raíces N${selected.level}: ${selected.profile.rings?.length??1} anillo(s) en secuencia · ${selected.profile.radius} m · ${selected.profile.roots} brotes · daño ×${selected.profile.damageMultiplier}.`:
      selected?.id==='igneo_fire'?`Llamarada: ${selected.profile.radius} m · ráfaga hacia delante · 5 s de enfriamiento · no consume cristales.`:''}`);
    const options=view.statuses.filter(s=>s.unlocked&&s.implementation==='available'&&ABILITIES.find(a=>a.id===s.id)!.slot==='special');
    const key=options.map(s=>s.id).join('|');
    if(this.optionKey!==key||!this.select.options.length){
      this.optionKey=key;this.select.replaceChildren();
      if(!options.length)this.select.add(new Option('Sin habilidades aprendidas',''));
      for(const s of options)this.select.add(new Option(ABILITIES.find(a=>a.id===s.id)!.name,s.id));
    }
    this.select.value=view.selected??'';this.select.disabled=!options.length;
    for(const s of view.statuses)set(this.rows.get(s.id)!,
      `${s.unlocked?'Aprendida':'Por descubrir'} · ${s.reason??(s.available?'Lista para usar':'No disponible')}`);
  }
  private addDevelopment():void{
    const box=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Laboratorio · solo desarrollo';box.append(legend);
    const add=(label:string,command:Parameters<AbilitySystem['development']>[0],value?:string)=>{
      const b=document.createElement('button');b.textContent=label;b.onclick=()=>{
        this.system.development(command,value);if(command==='fire')this.toggle(false);
      };box.append(b);
    };
    add('Entrar a prueba temporal','sandbox');add('Salir de prueba','exit');
    add('Probar llamarada','fire');
    const power=document.createElement('select');power.ariaLabel='Poder para desbloquear en prueba';
    for(const a of ABILITIES)power.add(new Option(a.name,a.id));box.append(power);
    const unlock=document.createElement('button');unlock.textContent='Aprender en prueba';unlock.onclick=()=>this.system.development('unlock',power.value);box.append(unlock);
    for(const n of [1,2,3,4])add(`Raíces N${n}`,'level',String(n));
    add('Reiniciar enfriamientos','cooldown');add('Crear blancos de prueba','targets');
    const fact=document.createElement('input');fact.placeholder='evento=true';fact.ariaLabel='Condición temporal';box.append(fact);
    const apply=document.createElement('button');apply.textContent='Simular condición';apply.onclick=()=>this.system.development('fact',fact.value);box.append(apply);
    const explanation=document.createElement('p');explanation.textContent='Aprendizaje, nivel y hechos simulados no modifican la partida. El equipo se elige normalmente con 1–5 o V; probar un nivel no equipa la espada. Probar llamarada prepara el fuego y cierra este panel; después pulsá X en suelo firme.';box.append(explanation);
    this.panel.append(box);
  }
  dispose():void{this.unsubscribe();document.removeEventListener('keydown',this.onKey);this.root.remove();this.panel.remove();}
}
