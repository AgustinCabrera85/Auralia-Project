import type {GeographicSource} from '../geography/GeographicSource';
import {TERRAIN_LOD_CONFIG} from '../terrainLod';

/** Interpolate the terrain's six material weights, using its exact vertex slope stencil. */
export function grassHabitatSampler(source:GeographicSource){
 const step=TERRAIN_LOD_CONFIG.nearSize/TERRAIN_LOD_CONFIG.nearSubdivisions,eps=step/2;
 const cache=new Map<string,readonly number[]>();
 const at=(x:number,z:number)=>{
  const key=x+':'+z;let weights=cache.get(key);if(weights)return weights;
  const h=source.heightAt(x,z),slope=Math.hypot(source.heightAt(x-eps,z)-source.heightAt(x+eps,z),
   source.heightAt(x,z-eps)-source.heightAt(x,z+eps))/(2*eps);
  weights=source.weightsAt?.(x,z,h,slope)??[1,0,0,0,0,0];cache.set(key,weights);return weights;
 };
 return (x:number,z:number)=>{
  const x0=Math.floor(x/step)*step,z0=Math.floor(z/step)*step,tx=(x-x0)/step,tz=(z-z0)/step;
  const a=at(x0,z0),b=at(x0+step,z0),c=at(x0,z0+step),d=at(x0+step,z0+step);
  const weights=a.map((v,i)=>tx+tz<=1?v+tx*(b[i]-v)+tz*(c[i]-v):d[i]+(1-tz)*(b[i]-d[i])+(1-tx)*(c[i]-d[i]));
  // A conservative boundary keeps the whole tuft on green ground, outside mixed beaches/rock.
  return weights[0]>.64&&weights[2]<.12&&weights[3]<.12&&weights[4]<.05&&weights[5]<.05;
 };
}
