import {SSAO2RenderingPipeline,type Camera,type Observer,type Scene} from '@babylonjs/core';

/** Short-radius contact occlusion complements the sun's large shadow map.
 * It follows the active camera and detaches when the palace is out of range. */
export class PalaceContactShadows{
  private pipeline:SSAO2RenderingPipeline|null=null;
  private camera:Camera|null=null;
  private observer:Observer<Scene>|null=null;
  private enabled=false;
  constructor(private scene:Scene){
    if(!SSAO2RenderingPipeline.IsSupported)return;
    const ao=this.pipeline=new SSAO2RenderingPipeline('palace:contact-shadows',scene,{ssaoRatio:.75,blurRatio:1},[]);
    ao.samples=16;ao.radius=.65;ao.totalStrength=.65;ao.epsilon=.04;
    ao.bilateralSamples=16;ao.bilateralSoften=.025;
    this.observer=scene.onBeforeRenderObservable.add(()=>this.syncCamera());
  }
  setEnabled(enabled:boolean){this.enabled=enabled;this.syncCamera();}
  private syncCamera(){
    if(!this.pipeline)return;
    const next=this.enabled?this.scene.activeCamera:null;if(next===this.camera)return;
    const manager=this.scene.postProcessRenderPipelineManager;
    if(this.camera)manager.detachCamerasFromRenderPipeline(this.pipeline.name,this.camera);
    this.camera=next;
    if(next)manager.attachCamerasToRenderPipeline(this.pipeline.name,next);
  }
  dispose(){this.setEnabled(false);if(this.observer)this.scene.onBeforeRenderObservable.remove(this.observer);this.pipeline?.dispose();}
}
