import { LoadAssetContainerAsync, type Scene } from '@babylonjs/core';
import { GLTFLoaderAnimationStartMode } from '@babylonjs/loaders/glTF/glTFFileLoader.js';
import { allowed, denied, type AbilityDefinition, type AbilityExecution,
  type AbilityPresentation as PresentationPort, type Decision } from '../../domain/abilities/types';
import type { SantiCharacter } from '../SantiCharacter';
import { RootsFx } from './RootsFx';

/** An adapter may combine models, material uniforms, particles and optional audio cues. */
export interface AbilityFxAdapter {
  prepare():void;ready():Decision;start(execution:AbilityExecution):void;
  update(execution:AbilityExecution):void;clear():void;dispose():void;
}

/** Presentation adapters own loading and visuals, never unlocks or damage. */
export class AbilityPresentation implements PresentationPort {
  readonly roots:RootsFx;
  private readonly clips=new Map<string,'loading'|'ready'|'failed'>();
  private readonly effects=new Map<string,AbilityFxAdapter>();
  private readonly abort=new AbortController();
  private disposed=false;
  constructor(private readonly scene:Scene,private readonly santi:()=>SantiCharacter|null,diagnostic=false){
    this.roots=new RootsFx(scene,diagnostic);
    this.effects.set('forest_roots',this.roots);
  }
  registerFx(id:string,adapter:AbilityFxAdapter):void{
    if(this.effects.has(id)||this.effects.size>=8)throw Error(`FX duplicado o caché llena: ${id}`);
    this.effects.set(id,adapter);
  }
  prepare(d:AbilityDefinition):void{
    if(this.disposed||d.implementation!=='available')return;
    if(d.fx)this.effects.get(d.fx)?.prepare();
    const a=d.animation;
    if(a&&a.file!=='santi'&&this.santi()?.isReady){
      const key=`${a.file}#${a.clip}`;
      if(this.clips.has(key)||this.clips.size>=8)return;
      this.clips.set(key,'loading');
      void (async()=>{
        try{
          if(!a.file.startsWith('/assets/'))throw Error('La animación debe usar /assets/.');
          const response=await fetch(a.file,{signal:this.abort.signal});
          if(!response.ok)throw Error(`HTTP ${response.status}`);
          const bytes=new Uint8Array(await response.arrayBuffer());if(this.disposed)return;
          const c=await LoadAssetContainerAsync(bytes,this.scene,{pluginExtension:'.glb',
            pluginOptions:{gltf:{animationStartMode:GLTFLoaderAnimationStartMode.NONE}}});
          try{
            if(this.disposed)return;
            this.clips.set(key,this.santi()?.installAbilityAnimation(c,a)?'ready':'failed');
          }finally{c.dispose();}
        }catch{if(!this.disposed)this.clips.set(key,'failed');}
      })();
    }
  }
  ready(d:AbilityDefinition):Decision{
    if(this.disposed)return denied('Escena cerrada.');
    if(!d.animation)return denied('Animación pendiente.');
    if(!this.santi()?.hasAbilityAnimation(d.animation))return denied('Animación de Santi ausente, incompatible o cargando.');
    return d.fx?this.effects.get(d.fx)?.ready()??denied(`Adaptador FX pendiente: ${d.fx}`):allowed;
  }
  start(e:AbilityExecution):boolean{return !!e.definition.animation&&!!this.santi()?.startAbilityAnimation(e.definition.animation);}
  fx(e:AbilityExecution):void{if(e.definition.fx)this.effects.get(e.definition.fx)?.start(e);}
  update(e:AbilityExecution):void{
    if(e.definition.animation)this.santi()?.sampleAbilityAnimation(e.definition.animation,e.elapsed);
    if(e.definition.fx&&e.committed)this.effects.get(e.definition.fx)?.update(e);
  }
  end(e:AbilityExecution):void{this.santi()?.endAbilityAnimation();if(e.definition.fx)this.effects.get(e.definition.fx)?.clear();}
  dispose():void{this.disposed=true;this.abort.abort();this.effects.forEach(fx=>fx.dispose());
    this.effects.clear();this.clips.clear();this.santi()?.endAbilityAnimation();}
}
