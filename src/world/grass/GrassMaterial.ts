import { Color3, DirectionalLight, Effect, Scene, ShaderMaterial, Vector3 } from '@babylonjs/core';
import type { GrassConfig, GrassLod } from './grassData';

Effect.ShadersStore['auraliaGrassVertexShader']=`
  precision highp float;
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec4 color;
  attribute float bendWeight;
  #ifdef INSTANCES
  attribute vec4 world0;
  attribute vec4 world1;
  attribute vec4 world2;
  attribute vec4 world3;
  #endif
  #ifdef INSTANCESCOLOR
  attribute vec4 instanceColor;
  #endif
  uniform mat4 world;
  uniform mat4 viewProjection;
  uniform float time;
  uniform float windStrength;
  uniform float windSpeed;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec4 vColor;
  varying vec4 vTint;
  varying float vDitherSeed;
  void main(void){
    mat4 finalWorld=world;
    #ifdef INSTANCES
      finalWorld=mat4(world0,world1,world2,world3);
      #ifdef THIN_INSTANCES
        finalWorld=world*finalWorld;
      #endif
    #endif
    vec3 origin=(finalWorld*vec4(0.0,0.0,0.0,1.0)).xyz;
    vDitherSeed=fract(sin(dot(origin.xz,vec2(12.9898,78.233)))*43758.5453);
    vec3 p=(finalWorld*vec4(position,1.0)).xyz;
    float phase=origin.x*.19+origin.z*.13;
    float wave=sin(time*windSpeed*1.6+phase)*.65+
      sin(time*windSpeed*2.37+origin.z*.31-origin.x*.08)*.35;
    float gust=pow(max(0.0,sin(time*windSpeed*.31+origin.x*.023+origin.z*.017)),4.0);
    float flex=bendWeight*bendWeight;
    p.xz+=vec2(1.0,.37)*flex*windStrength*(wave+gust*.55);
    vWorldPos=p;
    vNormal=normalize(mat3(finalWorld)*normal);
    vColor=color;
    #ifdef INSTANCESCOLOR
      vTint=instanceColor;
    #else
      vTint=vec4(1.0);
    #endif
    gl_Position=viewProjection*vec4(p,1.0);
  }
`;

Effect.ShadersStore['auraliaGrassFragmentShader']=`
  precision highp float;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec4 vColor;
  varying vec4 vTint;
  varying float vDitherSeed;
  uniform vec3 cameraPosition;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float patchFade;
  void main(void){
    if(vColor.a>.5&&vTint.a<.5)discard;
    // A world-space seed keeps each clump stable while the camera moves.
    if(patchFade<=vDitherSeed)discard;
    vec3 normal=normalize(vNormal);
    if(!gl_FrontFacing)normal=-normal;
    float light=max(0.0,dot(normal,normalize(sunDirection)));
    vec3 base=vColor.a>.5?vColor.rgb:vColor.rgb*vTint.rgb;
    vec3 lit=base*(vec3(.52,.61,.43)+sunColor*light*.72);
    float fog=1.0-exp(-pow(length(vWorldPos-cameraPosition)*fogDensity,2.0));
    gl_FragColor=vec4(mix(lit,fogColor,clamp(fog,0.0,.98)),1.0);
  }
`;

export function createGrassMaterials(scene:Scene,config:GrassConfig):
  {materials:Record<GrassLod,ShaderMaterial>;setFocus:(x:number,z:number)=>void;dispose:()=>void}{
  const sun=scene.lights.find(light=>light instanceof DirectionalLight) as DirectionalLight|undefined;
  const direction=sun?sun.direction.scale(-1).normalize():new Vector3(.5,1,-.4).normalize();
  const sunColor=sun?sun.diffuse.scale(sun.intensity*.65):new Color3(.9,.82,.7);
  const focusPosition=new Vector3();
  const margin=config.patchSize*.72;
  const smooth=(start:number,end:number,value:number):number=>{
    const t=Math.max(0,Math.min(1,(value-start)/(end-start)));
    return t*t*(3-2*t);
  };
  const material=new ShaderMaterial('grass-field',scene,
      {vertex:'auraliaGrass',fragment:'auraliaGrass'},
      {attributes:['position','normal','color','bendWeight'],
        uniforms:['world','viewProjection','time','windStrength','windSpeed',
          'cameraPosition','sunDirection','sunColor','fogColor','fogDensity','patchFade']});
    material.backFaceCulling=false;
    material.setFloat('windStrength',config.windStrength);
    material.setFloat('windSpeed',config.windSpeed);
    material.setVector3('sunDirection',direction);
    material.setColor3('sunColor',sunColor);
    material.setColor3('fogColor',scene.fogColor);
    material.setFloat('fogDensity',scene.fogDensity);
    material.onBindObservable.add(mesh=>{
      const px=mesh.metadata?.px,pz=mesh.metadata?.pz,lod=mesh.metadata?.lod;
      if(typeof px!=='number'||typeof pz!=='number'||(lod!=='near'&&lod!=='medium'))return;
      const distance=Math.hypot((px+.5)*config.patchSize-focusPosition.x,
        (pz+.5)*config.patchSize-focusPosition.z);
      const nearFade=smooth(config.nearDistance-config.transitionDistance,
        config.nearDistance+margin,distance);
      const fade=lod==='near'?1-nearFade:nearFade*
        (1-smooth(config.farDistance-config.transitionDistance,
          config.farDistance+margin,distance));
      material.getEffect()?.setFloat('patchFade',fade);
    });
  const materials={near:material,medium:material};
  const setFocus=(x:number,z:number):void=>{
    focusPosition.set(x,0,z);
  };
  setFocus(0,0);
  const observer=scene.onBeforeRenderObservable.add(()=>{
    const camera=scene.activeCamera;
    if(!camera)return;
    const time=performance.now()*.001;
    material.setFloat('time',time);
    material.setVector3('cameraPosition',camera.globalPosition);
    material.setColor3('fogColor',scene.fogColor);
    material.setFloat('fogDensity',scene.fogMode===Scene.FOGMODE_EXP2?scene.fogDensity:0);
  });
  return {materials,setFocus,dispose:()=>{
    scene.onBeforeRenderObservable.remove(observer);
    material.dispose();
  }};
}
