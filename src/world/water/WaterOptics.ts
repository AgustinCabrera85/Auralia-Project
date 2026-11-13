import { AbstractMesh, Camera, Color4, DepthRenderer, DynamicTexture, Effect, Matrix, ParticleSystem,
  Texture, Vector2, Vector3, RegisterDepthRendererSceneComponent } from '@babylonjs/core';
import '@babylonjs/core/Shaders/depth.vertex.js';
import '@babylonjs/core/Shaders/depth.fragment.js';

/** Shared air/water boundary, independent of the identity or location of a lake.
 * Opaque depth includes skinned characters, instances and terrain. Transparent
 * water and spray stay out of that pass, so they cannot hide the swimmer. */
export const WATER_OPTICS_GLSL=`
uniform sampler2D waterSceneDepth;
uniform sampler2D waterSurfaceDepth;
uniform float waterSurfaceMode;
uniform mat4 waterInverseViewProjection;
uniform vec3 waterEye;
uniform float waterLevel;
uniform float waterOpticsWeight;
uniform vec2 waterFlow;
uniform vec2 waterSlope;
vec3 waterPositionAtDepth(vec2 uv,float z){
  vec4 p=waterInverseViewProjection*vec4(uv*2.0-1.0,z*2.0-1.0,1.0);
  return p.xyz/p.w;
}
vec3 waterWorldPosition(vec2 uv){return waterPositionAtDepth(uv,texture2D(waterSceneDepth,uv).r);}
vec2 waterRefractedUV(vec2 uv){
  if(waterOpticsWeight<=0.0)return uv;
  vec3 end=waterWorldPosition(uv);
  float a=waterLevel-waterEye.y;
  float b=waterLevel+dot(end.xz-waterEye.xz,waterSlope)-end.y;
  // Only distort the view through the air/water interface. Nearby submerged
  // characters keep their silhouette; scenery beyond the surface undulates.
  if(a<=0.0||b>=0.0)return uv;
  vec3 hit=mix(waterEye,end,a/max(a-b,.00001));
  if(waterSurfaceMode>.5){
    float surface=texture2D(waterSurfaceDepth,uv).r;
    if(surface>=.999999)return uv;
    hit=waterPositionAtDepth(uv,surface);
    if(length(hit-waterEye)>=length(end-waterEye))return uv;
  }
  vec2 p=hit.xz*.35-waterFlow*waterTime*.3;
  vec2 ripple=vec2(sin(p.y*1.7+p.x*.6+waterTime*.7),sin(p.x*1.3-p.y*.4-waterTime*.6));
  float strength=smoothstep(0.0,.6,a)*smoothstep(0.0,.6,-b)*waterOpticsWeight;
  return clamp(uv+ripple*.0035*strength,vec2(.001),vec2(.999));
}
vec3 throughWater(vec3 colour,vec2 uv){
  if(waterOpticsWeight<=0.0)return colour;
  vec3 end=waterWorldPosition(uv);
  float a=waterLevel-waterEye.y;
  float b=waterLevel+dot(end.xz-waterEye.xz,waterSlope)-end.y;
  float localWeight=waterOpticsWeight;
  if(waterSurfaceMode>.5&&a<=0.0){
    // The opaque-depth pass is local (100 m), while the interface pass also
    // contains distant rivers. Its clear depth is missing information, not a
    // deep water column. Leave those pixels to the water material and fog.
    if(texture2D(waterSceneDepth,uv).r>=.999999)return colour;
    // Fade before the depth culling boundary, including large terrain tiles
    // whose bounds intersect the pass but extend beyond its useful range.
    localWeight*=1.0-smoothstep(60.0,90.0,length(end-waterEye));
    if(localWeight<=0.0)return colour;
  }
  // Intersect the view segment with the surface. The air part never acquires
  // the same fog as the submerged part, even in a split-level view.
  float wet=0.0;
  if(a>0.0&&b>0.0)wet=1.0;
  else if(a>0.0)wet=a/max(a-b,.00001);
  else if(b>0.0)wet=b/max(b-a,.00001);
  float metres=min(90.0,length(end-waterEye)*wet);
  if(waterSurfaceMode>.5){
    // Use the streamed water's actual footprint and descending profile. An
    // infinite tangent plane floods distant dry banks at elevated springs.
    float surface=texture2D(waterSurfaceDepth,uv).r;
    float total=length(end-waterEye),path=0.0;
    if(surface<.999999){
      float crossing=length(waterPositionAtDepth(uv,surface)-waterEye);
      path=a>0.0?min(total,crossing):max(0.0,total-crossing);
    }else if(a>0.0)path=total;
    metres=min(90.0,path);
  }
  vec3 transmission=exp(-vec3(.095,.035,.022)*metres);
  vec3 scattering=vec3(.035,.22,.25);
  // Moving refracted light is projected onto submerged geometry, not onto a
  // transparent horizontal panel. Advection follows the same river flow field.
  vec2 flowUV=end.xz*.72-waterFlow*waterTime*.48;
  float warp=sin(flowUV.x*1.7+flowUV.y*.8+waterTime*.35)*.28;
  float veins=abs(sin(flowUV.x*2.4+warp)+sin(flowUV.y*2.1-warp));
  float caustic=pow(max(0.0,1.0-veins),12.0);
  vec3 face=cross(dFdx(end),dFdy(end));
  float facing=abs(face.y)/max(length(face),.00001);
  float lit=smoothstep(0.0,.25,b)*exp(-max(0.0,b)*.09)*facing;
  colour*=1.0+caustic*lit*.16*localWeight;
  return mix(colour,colour*transmission+scattering*(1.0-transmission),localWeight);
}
`;

export class WaterOptics {
  private depth:DepthRenderer|null=null;
  private surfaceDepth:DepthRenderer|null=null;
  private surfaceMode=false;
  private surfaceReady=false;
  private readonly surfaces:AbstractMesh[]=[];
  private readonly inverse=Matrix.Identity();
  private level=0;
  private weight=0;
  private ready=false;
  private readonly nearby:AbstractMesh[]=[];
  private readonly flow=new Vector2();
  private readonly slope=new Vector2();
  private particles:ParticleSystem|null=null;
  private particleTexture:DynamicTexture|null=null;
  constructor(private readonly camera:Camera){}
  get active():boolean{return this.weight>0;}
  update(level:number|null,flowX=0,flowZ=0,slopeX=0,slopeZ=0,useSurfaceDepth=false):void{
    const eye=this.camera.globalPosition;
    const above=level===null?Infinity:eye.y-level;
    const t=Math.min(1,Math.max(0,(above-4)/4));
    this.weight=level===null?0:1-t*t*(3-2*t);
    this.level=level??0;
    this.flow.set(flowX,flowZ);
    this.slope.set(slopeX,slopeZ);
    this.surfaceMode=useSurfaceDepth&&this.active;
    if(this.active&&!this.depth){
      // One R32F target, allocated once and reused. No reflection scene copy,
      // colour target, blur pyramid or CPU mesh copies are needed.
      RegisterDepthRendererSceneComponent(DepthRenderer);
      this.depth=this.camera.getScene().enableDepthRenderer(this.camera,true,true,Texture.NEAREST_SAMPLINGMODE);
      const map=this.depth.getDepthMap();map.name='agua-profundidad-optica';
      // Beyond the optical range the shader already converges to scattering.
      // Do not skin/rasterize the distant forest and mountain backdrop twice.
      // Test the nearest point of the world bounds, not a large tile's centre.
      map.getCustomRenderList=(_layer,list,length)=>{
        this.nearby.length=0;
        if(!list)return this.nearby;
        const p=this.camera.globalPosition;
        for(let i=0;i<length;i++){
          const mesh=list[i],box=mesh.getBoundingInfo().boundingBox;
          const a=box.minimumWorld,b=box.maximumWorld;
          const x=Math.max(a.x-p.x,0,p.x-b.x),y=Math.max(a.y-p.y,0,p.y-b.y),z=Math.max(a.z-p.z,0,p.z-b.z);
          if(x*x+y*y+z*z<100*100)this.nearby.push(mesh);
        }
        return this.nearby;
      };
      this.depth.useOnlyInActiveCamera=true;
    }
    if(!this.depth)return;
    const scene=this.camera.getScene(),map=this.depth.getDepthMap();
    if(this.surfaceMode&&!this.surfaceDepth){
      this.surfaceDepth=new DepthRenderer(scene,1,this.camera,true,Texture.NEAREST_SAMPLINGMODE,false,'agua-interfaz-optica');
      this.surfaceDepth.forceDepthWriteTransparentMeshes=true;
      this.surfaceDepth.getDepthMap().getCustomRenderList=(_layer,list,length)=>{
        this.surfaces.length=0;
        if(list)for(let i=0;i<length;i++)if(list[i].metadata?.inlandWater)this.surfaces.push(list[i]);
        return this.surfaces;
      };
    }
    if(this.surfaceDepth){
      const surface=this.surfaceDepth.getDepthMap(),index=scene.customRenderTargets.indexOf(surface);
      if(this.surfaceMode&&index<0)scene.customRenderTargets.push(surface);
      else if(!this.surfaceMode&&index>=0)scene.customRenderTargets.splice(index,1);
      const engine=scene.getEngine();
      if(this.surfaceMode&&(surface.getSize().width!==engine.getRenderWidth()||surface.getSize().height!==engine.getRenderHeight()))
        surface.resize({width:engine.getRenderWidth(),height:engine.getRenderHeight()});
      // Readiness can bind another GL program. Never do it inside bind(),
      // between setting post-process uniforms: that corrupts cached uniforms.
      if(this.surfaceMode&&!this.surfaceReady)this.surfaceReady=surface.isReadyForRendering();
    }
    this.depth.enabled=this.active;
    if(this.active){
      if(!this.ready)this.ready=map.isReadyForRendering();
      const engine=scene.getEngine();
      if(map.getSize().width!==engine.getRenderWidth()||map.getSize().height!==engine.getRenderHeight())
        map.resize({width:engine.getRenderWidth(),height:engine.getRenderHeight()});
      this.camera.getTransformationMatrix().invertToRef(this.inverse);
    }
    this.updateCurrentParticles(level);
  }
  bind(effect:Effect):void{
    effect.setFloat('waterOpticsWeight',this.ready?this.weight:0);
    effect.setFloat('waterLevel',this.level);
    effect.setVector3('waterEye',this.camera.globalPosition);
    effect.setMatrix('waterInverseViewProjection',this.inverse);
    effect.setVector2('waterFlow',this.flow);
    effect.setVector2('waterSlope',this.slope);
    effect.setFloat('waterSurfaceMode',this.surfaceMode&&this.surfaceReady?1:0);
    if(this.surfaceMode&&!this.surfaceReady)effect.setFloat('waterOpticsWeight',0);
    if(this.surfaceDepth)effect.setTexture('waterSurfaceDepth',this.surfaceDepth.getDepthMap());
    else if(this.depth)effect.setTexture('waterSurfaceDepth',this.depth.getDepthMap());
    if(this.depth)effect.setTexture('waterSceneDepth',this.depth.getDepthMap());
  }
  dispose():void{
    this.update(null);this.surfaceDepth?.dispose();this.surfaceDepth=null;this.depth?.dispose();this.depth=null;
    this.particles?.dispose(false);this.particleTexture?.dispose();
  }

  private updateCurrentParticles(level:number|null):void{
    const eye=this.camera.globalPosition,submerged=level!==null&&eye.y<level-.2;
    if(submerged&&!this.particles){
      const scene=this.camera.getScene();
      this.particleTexture=new DynamicTexture('agua-motas-textura',{width:32,height:32},scene,false);
      this.particleTexture.hasAlpha=true;
      const ctx=this.particleTexture.getContext(),g=ctx.createRadialGradient(16,16,0,16,16,15);
      g.addColorStop(0,'rgba(200,235,225,.65)');g.addColorStop(.3,'rgba(200,235,225,.25)');
      g.addColorStop(1,'rgba(200,235,225,0)');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);this.particleTexture.update();
      const p=this.particles=new ParticleSystem('agua-particulas-corriente',72,scene);
      p.particleTexture=this.particleTexture;p.emitter=new Vector3();
      p.minEmitBox=new Vector3(-9,-5,-9);p.maxEmitBox=new Vector3(9,4,9);
      p.direction1=new Vector3();p.direction2=new Vector3();p.gravity=Vector3.Zero();
      p.minSize=.035;p.maxSize=.10;p.minLifeTime=3;p.maxLifeTime=6;
      p.minEmitPower=.7;p.maxEmitPower=1.1;
      p.color1=new Color4(.6,.85,.8,.18);p.color2=new Color4(.45,.7,.65,.1);
      p.colorDead=new Color4(.5,.8,.75,0);p.blendMode=ParticleSystem.BLENDMODE_STANDARD;p.start();
    }
    if(this.particles){
      const p=this.particles;p.emitRate=submerged?10:0;
      (p.emitter as Vector3).copyFrom(eye);
      p.maxEmitBox.y=Math.min(4,(level??eye.y)-eye.y-.2);
      p.direction1.set(this.flow.x-.08,.035,this.flow.y-.08);
      p.direction2.set(this.flow.x+.08,.10,this.flow.y+.08);
    }
  }
}
