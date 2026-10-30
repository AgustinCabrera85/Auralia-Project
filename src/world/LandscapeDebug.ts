import { Color3, Engine, Scene, SceneInstrumentation } from '@babylonjs/core';
import { LANDSCAPE_ATMOSPHERE_CONFIG } from './LandscapeAtmosphere';
import type { TerrainStream } from './TerrainStream';
import type { VegetationSystem } from './VegetationSystem';
import type { WorldPropSystem } from './WorldPropSystem';
import type { GrassFieldSystem } from './grass/GrassFieldSystem';

/** Developer-only overlay: enabled with ?landscapeDebug=1. */
export class LandscapeDebug {
  private readonly overlay:HTMLDivElement;
  private readonly instrumentation:SceneInstrumentation;
  private elapsed=0;
  private fogOn=true;
  private geologyAdjusted=true;
  private colorIndex=0;
  private readonly colors=[LANDSCAPE_ATMOSPHERE_CONFIG.fogColor,'#d6d1bd','#a9c3dc'];

  constructor(private readonly scene:Scene,private readonly engine:Engine,
    private readonly terrain:TerrainStream,private readonly props:WorldPropSystem,
    private readonly vegetation:VegetationSystem,private readonly grass:GrassFieldSystem){
    this.overlay=document.createElement('div');
    this.overlay.style.cssText='position:fixed;left:12px;top:170px;z-index:20;'+
      'padding:10px 12px;background:#10241be8;color:#e9ffdb;font:12px monospace;'+
      'white-space:pre;pointer-events:none;border-radius:6px;line-height:1.35';
    document.body.appendChild(this.overlay);
    this.instrumentation=new SceneInstrumentation(scene);
  }

  handleKey(key:string):boolean{
    if(key==='f'){
      this.fogOn=!this.fogOn;
      this.scene.fogMode=this.fogOn?LANDSCAPE_ATMOSPHERE_CONFIG.fogMode:Scene.FOGMODE_NONE;
    }else if(key==='g'){
      this.geologyAdjusted=!this.geologyAdjusted;
      this.props.setGeologyAdjusted(this.geologyAdjusted);
    }else if(key==='['||key===']'){
      this.scene.fogDensity=Math.max(0,Math.min(.004,
        this.scene.fogDensity+(key==='['?-.00015:.00015)));
    }else if(key==='v'){
      this.colorIndex=(this.colorIndex+1)%this.colors.length;
      this.scene.fogColor=Color3.FromHexString(this.colors[this.colorIndex]);
    }else if(['0','1','2','3'].includes(key)){
      this.terrain.setDebugLayer(({'0':'all','1':'near','2':'mid','3':'far'} as const)[key as '0'|'1'|'2'|'3']);
    }else return false;
    this.elapsed=1;
    return true;
  }

  update(dt:number,x:number,z:number):void{
    this.elapsed+=dt;
    if(this.elapsed<.5)return;
    this.elapsed=0;
    const draws=this.instrumentation.drawCallsCounter.current;
    this.overlay.textContent=
      `PAISAJE  X ${Math.round(x)} · Z ${Math.round(z)}\n`+
      `LOD ${this.terrain.visibleLayer.toUpperCase()}  Near ${this.terrain.activeCount}`+
      ` · Mid ${this.terrain.activeMidCount} · Far ${this.terrain.activeFarCount}\n`+
      `Pendientes ${this.terrain.pendingCount} · cobertura ${this.terrain.residentFarCount}`+
      ` · generación ${this.terrain.generationMs.toFixed(1)} ms\n`+
      `Geometría terreno ~${(this.terrain.approxGeometryBytes/1048576).toFixed(1)} MiB`+
      ` · formaciones ${this.props.activeFormationCount}\n`+
      `Árboles ${this.vegetation.instanceCount} (${this.vegetation.farInstanceCount} LOD)`+
      ` · césped ${this.grass.instanceCount}\n`+
      `FPS ${Math.round(this.engine.getFps())} · draw calls ${draws}`+
      ` · triángulos ${Math.round(this.scene.getActiveIndices()/3)}\n`+
      `Fog ${this.fogOn?'sí':'no'} ${this.scene.fogDensity.toFixed(5)}`+
      ` ${this.colors[this.colorIndex]} · geología ${this.geologyAdjusted?'ajustada':'GLB original'}\n`+
      `F fog · G geología · [ ] densidad · V color · 0-3 LOD`;
  }

  dispose():void{
    this.instrumentation.dispose();
    this.overlay.remove();
  }
}
