import { Effect, Mesh, MeshBuilder, ShaderMaterial, Texture, Vector2, Vector3, Vector4, VertexData } from '@babylonjs/core';
import { buildLocalWater, triangulateBoundary } from './waterGeometry.mjs';

const NAME = 'auraliaPreviewWater';
Effect.ShadersStore[`${NAME}VertexShader`] = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 world;
uniform mat4 worldViewProjection;
uniform float time;
uniform float waterKind;
uniform float nearPatchHalf;
varying vec3 vWorldPos;
varying float vDepth;
varying float vKind;
void main() {
  vec3 local = position;
  vec3 worldPosition = (world * vec4(local, 1.0)).xyz;
  float wave = sin(worldPosition.x * 0.055 + time * 1.15) *
    sin(worldPosition.z * 0.071 - time * 0.83) * 0.18;
  wave += sin((worldPosition.x + worldPosition.z) * 0.036 + time * 0.72) * 0.09;
  if (waterKind > 1.5) {
    float edge = nearPatchHalf - max(abs(position.x), abs(position.z));
    local.y += wave * smoothstep(0.0, 36.0, edge) * smoothstep(0.0, 1.5, uv.x);
  }
  vDepth = uv.x;
  vKind = waterKind > 1.5 ? uv.y : waterKind;
  vWorldPos = (world * vec4(local, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(local, 1.0);
}`;
Effect.ShadersStore[`${NAME}FragmentShader`] = `
precision highp float;
varying vec3 vWorldPos;
varying float vDepth;
varying float vKind;
uniform sampler2D waterMask;
uniform sampler2D waterNormal;
uniform vec4 mapBounds;
uniform vec3 cameraPosition;
uniform vec3 sunDirection;
uniform vec3 fogColor;
uniform float fogDensity;
uniform float time;
uniform float waterKind;
uniform vec2 nearPatchCenter;
uniform float nearPatchHalf;
void main() {
  float alpha = 1.0;
  if (waterKind < 0.5) {
    vec2 uv = (vWorldPos.xz - mapBounds.xy) / mapBounds.zw;
    bool inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
    alpha = inside ? texture2D(waterMask, uv).r : 1.0;
    if (alpha < 0.015) discard;
  }
  if (waterKind < 1.5 && nearPatchHalf > 0.0 &&
      max(abs(vWorldPos.x - nearPatchCenter.x), abs(vWorldPos.z - nearPatchCenter.y)) < nearPatchHalf - 8.0) discard;
  vec2 p = vWorldPos.xz * 0.018;
  vec3 n1 = texture2D(waterNormal, p + vec2(time * 0.003, time * 0.002)).rgb * 2.0 - 1.0;
  vec3 n2 = texture2D(waterNormal, p * 0.71 - vec2(time * 0.002, time * 0.004)).rgb * 2.0 - 1.0;
  vec2 ripple = (n1.xy + n2.xy) * 0.18;
  vec3 normal = normalize(vec3(ripple.x, 1.0, ripple.y));
  vec3 eye = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(normal, eye), 0.0), 2.4);
  float diffuse = max(dot(normal, normalize(sunDirection)), 0.0);
  float glint = pow(max(dot(reflect(-normalize(sunDirection), normal), eye), 0.0), 64.0);
  vec3 base = (vKind > 0.5 && vKind < 1.5) || vKind > 2.5 ?
    vec3(0.11, 0.46, 0.56) : vec3(0.055, 0.26, 0.39);
  vec3 color = base * (0.72 + 0.30 * diffuse) + vec3(0.22, 0.36, 0.43) * fresnel;
  color += vec3(0.92, 0.95, 0.98) * glint * 0.45;
  if (waterKind > 1.5) {
    float shore = 1.0 - smoothstep(0.08, 0.85, vDepth);
    float foam = shore * (0.45 + 0.35 * sin(time * 1.4 + vDepth * 8.0 + n1.x * 2.0));
    color = mix(color, vec3(0.76, 0.86, 0.83), foam);
    float edge = nearPatchHalf-max(abs(vWorldPos.x-nearPatchCenter.x),abs(vWorldPos.z-nearPatchCenter.y));
    alpha = smoothstep(0.0, 0.08, vDepth) * smoothstep(0.0, 8.0, edge);
  }
  float fog = 1.0 - exp(-pow(distance(cameraPosition, vWorldPos) * fogDensity, 2.0));
  gl_FragColor = vec4(mix(color, fogColor, clamp(fog, 0.0, 0.97)), alpha);
}`;

function makeLake(scene, lake, y, material) {
  const {points,indices}=triangulateBoundary(lake.polygonXZ_m);
  const mesh=new Mesh(`LAGO_${lake.id}_POLIGONO_APROBADO`,scene),data=new VertexData();
  data.positions=points.flatMap(([x,z])=>[x,y,z]);data.indices=indices;
  data.uvs=points.flatMap(()=>[0,1]);data.applyToMesh(mesh);
  mesh.material=material;mesh.isPickable=false;
  mesh.metadata={previewLake:lake.id,sourcePolygonVertices:points.length};return mesh;
}

async function oceanSelector(atlas) {
  const response=await fetch('/auralia-preview/data/water-mask-reference.png');
  if(!response.ok)throw new Error('No se pudo cargar la referencia de agua');
  const bitmap=await createImageBitmap(await response.blob());
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
  const {data}=context.getImageData(0,0,canvas.width,canvas.height),width=canvas.width,height=canvas.height;
  const ocean=new Uint8Array(width*height);
  for(let z=0;z<height;z++)for(let x=0;x<width;x++){
    const i=(z*width+x)*4;
    if(data[i+2]<240||data[i]>100||data[i+1]>100)continue;
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      const px=x+dx,pz=z+dz;if(px>=0&&px<width&&pz>=0&&pz<height)ocean[pz*width+px]=1;
    }
  }
  bitmap.close();canvas.width=canvas.height=1;
  return (x,z)=>{
    const u=(x-atlas.boundary[0])/(atlas.boundary[2]-atlas.boundary[0]);
    const v=(z-atlas.boundary[1])/(atlas.boundary[3]-atlas.boundary[1]);
    if(u<0||u>1||v<0||v>1)return true;
    return !!ocean[Math.min(height-1,Math.floor(v*height))*width+Math.min(width-1,Math.floor(u*width))];
  };
}

export async function createPreviewWater(scene, atlas, sun, field) {
  const response = await fetch('/auralia-preview/data/hidrologia_v3_6.json');
  if (!response.ok) throw new Error('No se encontraron los polígonos de lagos');
  const hydrology = await response.json();
  const mask = new Texture('/auralia-preview/data/shore-water-mask-2048.png', scene,
    false, false, Texture.TRILINEAR_SAMPLINGMODE);
  mask.wrapU = mask.wrapV = Texture.CLAMP_ADDRESSMODE;
  mask.gammaSpace = false;
  const normal = new Texture('/assets/water/ocean_normals_1k.png', scene,
    false, false, Texture.TRILINEAR_SAMPLINGMODE);
  normal.wrapU = normal.wrapV = Texture.WRAP_ADDRESSMODE;
  normal.gammaSpace = false;
  const bounds = new Vector4(atlas.boundary[0], atlas.boundary[1],
    atlas.boundary[2] - atlas.boundary[0], atlas.boundary[3] - atlas.boundary[1]);
  const nearPatchCenter = Vector2.Zero();
  function makeMaterial(name, kind) {
    const material = new ShaderMaterial(name, scene, { vertex: NAME, fragment: NAME }, {
      attributes: ['position', 'uv'],
      uniforms: ['world', 'worldViewProjection', 'mapBounds', 'cameraPosition',
        'sunDirection', 'fogColor', 'fogDensity', 'time', 'waterKind',
        'nearPatchCenter', 'nearPatchHalf'],
      samplers: ['waterMask', 'waterNormal'], needAlphaBlending: kind !== 1
    });
    material.backFaceCulling = false;
    material.setTexture('waterMask', mask);
    material.setTexture('waterNormal', normal);
    material.setVector4('mapBounds', bounds);
    material.setFloat('waterKind', kind);
    material.setVector2('nearPatchCenter', nearPatchCenter);
    material.setFloat('nearPatchHalf', 0);
    return material;
  }
  const oceanMaterial = makeMaterial('agua-preview-costa-r16', 0);
  const lakeMaterial = makeMaterial('agua-preview-lagos-poligono', 1);
  const nearMaterial = makeMaterial('agua-preview-oceano-cercano', 2);
  nearMaterial.zOffset = -1;
  const sea = MeshBuilder.CreateGround('OCEANO_CONTORNO_R16',
    { width: 50000, height: 50000, subdivisions: 1 }, scene);
  sea.position.y = atlas.manifest.seaLevelMetres;
  sea.material = oceanMaterial;
  sea.isPickable = false;
  let near=null,job=null,requestKey='';
  const oceanAt=await oceanSelector(atlas);
  const unit=atlas.size/(atlas.resolution-1);
  const lakes = hydrology.lakes.filter(lake => lake.polygonXZ_m?.length >= 3)
    .map(lake => makeLake(scene, lake, atlas.manifest.seaLevelMetres, lakeMaterial));
  const direction = new Vector3();
  const beforeRender = scene.onBeforeRenderObservable.add(() => {
    direction.copyFrom(sun.direction).scaleInPlace(-1).normalize();
    for (const material of [oceanMaterial, lakeMaterial, nearMaterial]) {
      material.setVector3('sunDirection', direction);
      if (scene.activeCamera) material.setVector3('cameraPosition', scene.activeCamera.globalPosition);
      material.setColor3('fogColor', scene.fogColor);
      material.setFloat('fogDensity', scene.fogDensity);
      material.setFloat('time', performance.now() / 1000);
    }
  });
  function setPatch(center,half){
    nearPatchCenter.set(center.x,center.z);
    for(const material of [oceanMaterial,lakeMaterial,nearMaterial]){
      material.setVector2('nearPatchCenter',nearPatchCenter);material.setFloat('nearPatchHalf',half);
    }
  }
  return { sea, lakes, get near(){return near;},
    update(focus,localView){
      const enabled=localView&&atlas.sample(focus.x,focus.z)<atlas.manifest.seaLevelMetres+180;
      if(!enabled){job?.iterator.return();job=null;near?.dispose();near=null;requestKey='';setPatch(focus,0);return;}
      const x=atlas.boundary[0]+Math.round((focus.x-atlas.boundary[0])/unit/16)*16*unit;
      const z=atlas.boundary[1]+Math.round((focus.z-atlas.boundary[1])/unit/16)*16*unit;
      const key=`${x}:${z}`;if(key===requestKey)return;
      job?.iterator.return();requestKey=key;
      job={center:{x,z},iterator:buildLocalWater(atlas,field,hydrology.lakes.map(l=>l.polygonXZ_m),oceanAt,{x,z})};
    },
    tick(budgetMs=2){
      const start=performance.now();
      while(job&&performance.now()-start<budgetMs){
        const result=job.iterator.next();if(!result.done)continue;
        const data=new VertexData();Object.assign(data,result.value);
        const next=new Mesh('AGUA_LOCAL_CONTORNO_R16',scene);data.applyToMesh(next);
        next.position.x=job.center.x;next.position.z=job.center.z;
        next.material=nearMaterial;next.isPickable=false;
        next.alphaIndex=2;
        near?.dispose();near=next;setPatch(job.center,result.value.half);job=null;
      }
    },
    dispose(){
      job?.iterator.return();scene.onBeforeRenderObservable.remove(beforeRender);
      sea.dispose();near?.dispose();for(const lake of lakes)lake.dispose();
      oceanMaterial.dispose();lakeMaterial.dispose();nearMaterial.dispose();mask.dispose();normal.dispose();
    }
  };
}
