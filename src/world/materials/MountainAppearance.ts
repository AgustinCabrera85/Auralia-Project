import {VEGETATION_REGIONS} from '../geography/RegionalVegetation';

/** Use the current continental atlas centres, with wide geological transitions.
 * These masks affect exposed stone only, never height or grass habitat weights. */
export const MOUNTAIN_ROCK_REGIONS=[
 {id:'SIE',radiusX:2400,radiusZ:1900},
 {id:'CRI',radiusX:1800,radiusZ:1600},
 {id:'ALB',radiusX:2000,radiusZ:1800},
 {id:'MAL',radiusX:1900,radiusZ:1800}
].map(region=>{
 const center=VEGETATION_REGIONS.find(r=>r.id===region.id)!;
 return {...region,x:center.x,z:center.z};
});
const regionGLSL=MOUNTAIN_ROCK_REGIONS.map(r=>
 `float stone${r.id}=regionMask(p,vec4(${[r.x,r.z,r.radiusX,r.radiusZ].map(v=>v.toFixed(1)).join(',')}));`).join('\n');

/** Randomized samples at the vertices of a triangular world-space lattice.
 * Adjacent triangles share vertex seeds and blend weights; every texture-sized
 * cell varies, rather than repeating a motif inside a broad noise patch.
 * Explicit gradients keep mip selection independent of random offsets. */
export const MOUNTAIN_APPEARANCE_GLSL=`
float stoneVolumeNoise(vec3 p){
  float slice=floor(p.z),blend=fract(p.z);blend=blend*blend*(3.0-2.0*blend);
  return mix(noise(p.xy+vec2(37.0,17.0)*slice),
    noise(p.xy+vec2(37.0,17.0)*(slice+1.0)),blend);
}
Surface stoneSample(float index,vec2 plane,vec2 du,vec2 dv,vec2 cell){
  vec3 params=surfaceParams[int(index)];
  float seed=hash(cell+index*17.3),angle=seed*6.2831853;
  float scale=params.x*mix(.80,1.20,seed);
  vec2 uv=rotateUV(plane*scale,angle)+vec2(hash(cell+43.7),hash(cell-17.2))*19.0;
  vec2 dx=rotateUV(du*scale,angle),dy=rotateUV(dv*scale,angle);
  vec3 albedo=textureGrad(biomeAlbedos,vec3(uv,index),dx,dy).rgb;
  vec3 normal=geometricNormal;
  if(bumpFade>.001){
    vec3 n=textureGrad(biomeNormals,vec3(uv,index),dx,dy).rgb*2.0-1.0;
    n.xy*=params.y*bumpFade;normal=tangentNormal(normalize(n),dx,dy);
  }
  return Surface(albedo,normal,params.z);
}
Surface stoneLayer(float index,vec2 plane,vec2 du,vec2 dv){
  vec3 params=surfaceParams[int(index)],meanColor=surfaceMeans[int(index)];
  vec2 grid=mat2(1.0,0.0,-.57735027,1.15470054)*(plane*params.x);
  vec2 cell=floor(grid),f=fract(grid),a,b,c;
  vec3 weights;
  if(f.x+f.y<1.0){
    a=cell;b=cell+vec2(1,0);c=cell+vec2(0,1);weights=vec3(1.0-f.x-f.y,f.x,f.y);
  }else{
    a=cell+vec2(1,1);b=cell+vec2(0,1);c=cell+vec2(1,0);weights=vec3(f.x+f.y-1.0,1.0-f.x,1.0-f.y);
  }
  weights=weights*weights*weights;weights/=dot(weights,vec3(1.0));
  Surface sa=stoneSample(index,plane,du,dv,a),sb=stoneSample(index,plane,du,dv,b),sc=stoneSample(index,plane,du,dv,c);
  vec3 color=sa.color*weights.x+sb.color*weights.y+sc.color*weights.z;
  return Surface(mix(meanColor,color,stoneTextureDetail),
    sa.normal*weights.x+sb.normal*weights.y+sc.normal*weights.z,params.z);
}

void weatherMountain(inout Surface rock,float desert,float volcanic,float cursed){
  vec2 p=vWorldPos.xz;
  ${regionGLSL}
  float sierra=stoneSIE*(1.0-desert),crisol=stoneCRI*(1.0-desert),alpine=stoneALB;
  float barren=max(cursed,stoneMAL);
  float mass=noise(p*.0026+vec2(41.7,13.2));
  float folds=noise(rotateUV(p,.48)*.008+vec2(7.2,19.4));
  // Irregular tilted strata: no periodic sine bands around every mountain.
  float elevation=vWorldPos.y+dot(p,vec2(.055,-.035))+mass*65.0+folds*18.0;
  float strata=noise(vec2(elevation*.026+folds*1.4,dot(p,vec2(.0048,.0033))+mass*1.2));
  float weather=smoothstep(.22,.79,mass*.72+folds*.18+strata*.10);
  float mineral=smoothstep(.50,.76,folds*.65+strata*.35);
  float streak=noise(vec2(dot(p,vec2(.038,.027))+folds*.7,vWorldPos.y*.006));
  float damp=smoothstep(.55,.85,streak)*smoothstep(.44,.75,mass)*(1.0-desert);
  // Volumetric mottling does not wrap every slope in the same horizontal bands.
  vec3 fracturePoint=vWorldPos*.055+vec3(folds,mass,strata)*1.8;
  float fractures=stoneVolumeNoise(fracturePoint)*.65+stoneVolumeNoise(fracturePoint.yzx*2.1+17.3)*.35;
  float value=dot(rock.color,vec3(.299,.587,.114));
  vec3 tint=mix(vec3(.92,.98,1.02),vec3(1.50,1.48,1.40),weather);
  tint=mix(tint,tint*vec3(1.025,1.0,.96),sierra*.75);
  tint=mix(tint,tint*vec3(.91,.98,1.10),alpine*.75);
  tint=mix(tint,tint*vec3(.76,.73,.70),max(volcanic,crisol)*.65);
  tint=mix(tint,tint*vec3(.84,.80,.91),barren*.65);
  tint=mix(tint,tint*vec3(1.12,.90,.70),mineral*sierra*.28);
  rock.color=mix(rock.color,vec3(value),.72)*tint;
  rock.color*=1.0-damp*.24;
  // Broad mottling still reads beyond normal-map distance. The caller blends
  // the authored red desert stone after this treatment.
  rock.color*=mix(.88,1.16,folds)*mix(.84,1.16,fractures);
  rock.roughness=mix(rock.roughness,.78,damp*.6);
}
`;
