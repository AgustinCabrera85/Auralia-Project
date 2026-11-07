import { Color3, Color4, DirectionalLight, HemisphericLight, Scene, Vector3, type ArcRotateCamera } from '@babylonjs/core';
import {
  sampleClimate, SEASONS, SEASON_LABELS, WEATHERS, WEATHER_LABELS,
  REAL_SECONDS_PER_GAME_DAY, START_HOUR,
  type ClimateFrame, type Season, type Weather
} from './ClimateModel';
import { SkyDome } from './SkyDome';
import { Precipitation } from './Precipitation';
import { LANDSCAPE_ATMOSPHERE_CONFIG } from '../LandscapeAtmosphere';
import { getAuraliaWind, type AuraliaWindState } from '../AuraliaWindSystem';
import { getAuraliaTreeColors, type AuraliaTreeColors } from '../AuraliaFoliageWind';

/** One shared environmental clock for every playable zone of Auralia. */
export class EnvironmentSystem {
  private readonly sky:SkyDome;
  private readonly moon:DirectionalLight;
  private readonly precipitation:Precipitation;
  private readonly wind:AuraliaWindState;
  private readonly treeColors:AuraliaTreeColors;
  private elapsed:number;
  private animationSeconds=0;
  private clockScale=1;
  private forcedWeather:Weather|null=null;
  private flash=0;
  private nextLightning=9;
  private readonly originalSunIntensity:number;
  private readonly originalHemiIntensity:number;
  private debugPanel:HTMLDivElement|null=null;
  private debugHour:HTMLInputElement|null=null;
  private debugLabel:HTMLElement|null=null;
  private debugTimer=0;
  private current:ClimateFrame;

  constructor(
    private readonly scene:Scene,
    camera:ArcRotateCamera,
    private readonly sun:DirectionalLight,
    private readonly hemi:HemisphericLight,
    elapsedHours=START_HOUR
  ) {
    this.elapsed=Number.isFinite(elapsedHours)&&elapsedHours>=0?elapsedHours:START_HOUR;
    this.current=sampleClimate(this.elapsed);
    this.originalSunIntensity=sun.intensity;
    this.originalHemiIntensity=hemi.intensity;
    this.wind=getAuraliaWind(scene);
    this.treeColors=getAuraliaTreeColors(scene);
    this.sky=new SkyDome(scene,camera);
    // One cool directional fill follows the moon; it needs no shadow map.
    this.moon=new DirectionalLight('luz-lunar',new Vector3(0,-1,0),scene);
    this.moon.diffuse=new Color3(.48,.63,.90);
    this.moon.specular=new Color3(.14,.19,.28);
    this.moon.intensity=0;
    this.precipitation=new Precipitation(scene,camera);
    if(new URLSearchParams(location.search).has('climateDebug'))this.createDebugPanel();
    this.update(0);
  }

  get elapsedHours():number{return this.elapsed;}
  get frame():ClimateFrame{return this.current;}

  /** Reset on a new game; environmental settings are always serialized separately. */
  setElapsedHours(hours:number):void {
    this.elapsed=Number.isFinite(hours)&&hours>=0?hours:START_HOUR;
    this.update(0);
  }

  update(dt:number):ClimateFrame {
    const step=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    this.animationSeconds+=step;
    this.elapsed+=step*this.clockScale*24/REAL_SECONDS_PER_GAME_DAY;
    this.current=sampleClimate(this.elapsed,this.forcedWeather);
    const frame=this.current,weather=frame.weatherMix;
    this.treeColors.update(frame.season,step);
    // Clear weather preserves the existing breeze; storms raise its baseline.
    // The scene wind controller layers its short gusts on top in one update.
    this.wind.setStrength(.45+weather.wind*.9);
    this.flash=Math.max(0,this.flash-step*2.5);
    if(weather.rain>.8&&weather.darken>.42&&this.animationSeconds>=this.nextLightning){
      // Single, quickly fading glow. No strobing loop.
      this.flash=.6;
      const jitter=Math.sin(this.animationSeconds*17.17)*43758.5453;
      this.nextLightning=this.animationSeconds+9+((jitter-Math.floor(jitter))*12);
    }
    if(this.animationSeconds>=this.nextLightning&&weather.rain<.8)
      this.nextLightning=this.animationSeconds+8;

    this.sky.update(frame,this.flash,this.animationSeconds);
    this.precipitation.update(frame);

    // Existing sun and hemispheric lights are modified; no duplicate light sources.
    this.sun.direction.set(-frame.sunDirection[0],-frame.sunDirection[1],-frame.sunDirection[2]);
    // Babylon light direction points toward the world, opposite the moon's
    // position in the dome. Clouds and storms dim its restrained night fill.
    this.moon.direction.set(frame.sunDirection[0],frame.sunDirection[1],frame.sunDirection[2]);
    const moonHeight=Math.max(0,-frame.sunHeight);
    this.moon.intensity=.18*frame.night*Math.min(1,moonHeight/.25)*
      (1-weather.darken*.78)*(1-weather.cloud*.42);
    // Gentle broad illumination changes as animated cloud bands pass overhead.
    // This avoids expensive shadow-maps for the whole streamed world.
    const cloudShadow=weather.cloud*.14*(.5+.5*Math.sin(this.animationSeconds*.055+
      Math.sin(this.animationSeconds*.012)));
    this.sun.intensity=this.originalSunIntensity*frame.dayLight*
      (1-weather.darken*.72)*(1-cloudShadow)+this.flash*.23;
    const sun=frame.sunColor;
    this.sun.diffuse.set(sun[0],sun[1],sun[2]);
    this.hemi.intensity=this.originalHemiIntensity*(.37+.63*frame.dayLight)*(1-weather.darken*.40)+this.flash*.12;
    this.hemi.diffuse=Color3.Lerp(new Color3(.43,.53,.74),new Color3(.95,.97,1),frame.dayLight);
    this.hemi.groundColor=Color3.Lerp(new Color3(.14,.18,.26),new Color3(.48,.55,.62),frame.dayLight);
    const h=frame.skyHorizon;
    const fog=new Color3(h[0],h[1],h[2]);
    this.scene.fogColor=fog;
    this.scene.fogDensity=LANDSCAPE_ATMOSPHERE_CONFIG.fogDensity*weather.fog*(1+.13*frame.twilight);
    this.scene.clearColor=new Color4(h[0],h[1],h[2],1);
    this.updateDebugPanel(step);
    return frame;
  }

  private createDebugPanel():void {
    const root=document.createElement('div');
    root.id='auralia-climate-debug';
    root.style.cssText='position:fixed;right:12px;top:80px;width:232px;z-index:1100;'+
      'padding:12px;background:#101b29ea;border:1px solid #60788b;color:#eaf3ff;'+
      'border-radius:9px;font:12px system-ui;box-shadow:0 5px 20px #0006';
    root.innerHTML='<strong style="display:block;margin-bottom:8px">🌤️ CLIMA · AURALIA</strong>'+
      '<div data-climate-readout style="margin-bottom:8px"></div>'+
      '<label for="auralia-climate-hour">Hora</label>'+
      '<input id="auralia-climate-hour" type="range" min="0" max="23.75" step="0.25" style="width:100%">'+
      '<label for="auralia-climate-season">Estación</label>'+
      '<select id="auralia-climate-season" style="display:block;width:100%;margin:3px 0 8px"></select>'+
      '<label for="auralia-climate-weather">Clima</label>'+
      '<select id="auralia-climate-weather" style="display:block;width:100%;margin:3px 0 8px"></select>'+
      '<label for="auralia-climate-speed">Velocidad del reloj</label>'+
      '<select id="auralia-climate-speed" style="display:block;width:100%;margin-top:3px">'+
      '<option value="0">Pausado (nubes animadas)</option>'+
      '<option value="1" selected>Normal · 36 min/día</option>'+
      '<option value="30">Rápido · ×30</option>'+
      '<option value="120">Timelapse · ×120</option></select>';
    this.debugHour=root.querySelector<HTMLInputElement>('#auralia-climate-hour');
    this.debugLabel=root.querySelector<HTMLElement>('[data-climate-readout]');
    const season=root.querySelector<HTMLSelectElement>('#auralia-climate-season')!;
    season.innerHTML=SEASONS.map(s=>`<option value="${s}">${SEASON_LABELS[s]}</option>`).join('');
    const weather=root.querySelector<HTMLSelectElement>('#auralia-climate-weather')!;
    weather.innerHTML='<option value="auto">Automático</option>'+
      WEATHERS.map(w=>`<option value="${w}">${WEATHER_LABELS[w]}</option>`).join('');
    this.debugHour?.addEventListener('input',()=>{
      const hour=Number(this.debugHour?.value)||0;
      this.elapsed=Math.floor(this.elapsed/24)*24+hour;
      this.update(0);
    });
    season.addEventListener('change',()=>{
      const target=SEASONS.indexOf(season.value as Season);
      if(target<0)return;
      const dayInSeason=this.current.day%12;
      const cycle=Math.floor(this.current.day/48);
      this.elapsed=((cycle*48+target*12+dayInSeason)*24)+this.current.hour;
      this.update(0);
    });
    weather.addEventListener('change',()=>{
      this.forcedWeather=weather.value==='auto'?null:weather.value as Weather;
      this.update(0);
    });
    root.querySelector<HTMLSelectElement>('#auralia-climate-speed')?.addEventListener('change',e=>{
      this.clockScale=Number((e.target as HTMLSelectElement).value)||0;
    });
    this.debugPanel=root;
    document.body.appendChild(root);
  }

  private updateDebugPanel(dt:number):void {
    if(!this.debugPanel)return;
    this.debugTimer+=dt;
    if(dt>0&&this.debugTimer<.5)return;
    this.debugTimer=0;
    if(this.debugHour&&document.activeElement!==this.debugHour)
      this.debugHour.value=String(this.current.hour);
    const season=this.debugPanel.querySelector<HTMLSelectElement>('#auralia-climate-season');
    if(season&&document.activeElement!==season)season.value=this.current.season;
    if(this.debugLabel){
      const hh=Math.floor(this.current.hour).toString().padStart(2,'0');
      const mm=Math.floor(this.current.hour%1*60).toString().padStart(2,'0');
      this.debugLabel.textContent=`Día ${this.current.day+1} · ${hh}:${mm} · ${WEATHER_LABELS[this.current.weather]}`;
    }
  }

  dispose():void {
    this.debugPanel?.remove();
    this.precipitation.dispose();
    this.moon.dispose();
    this.sky.dispose();
  }
}
