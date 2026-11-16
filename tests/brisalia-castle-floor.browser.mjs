import { Vector3 } from '@babylonjs/core';
import { BRISALIA_SCALE as S } from '../src/world/brisaliaLayout.ts';

/** Compare the rendered Rev5 stone with the same interpolated terrain used by gameplay. */
export function auditCastleFloors(village,geography){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const castle=village.buildings.get('B28'),matrix=castle.root.computeWorldMatrix(true);
  const point=(x,y,z)=>Vector3.TransformCoordinates(new Vector3(x,y,z),matrix);
  let samples=0,minClearance=Infinity,maxClearance=0;
  for(const side of [-1,1])for(let ix=0;ix<=24;ix++)for(let iz=0;iz<=44;iz++){
    // Include a centimetre from every edge, where grid interpolation caused leaks.
    const p=point(side*(15.21+ix*11.58/24),1.35,-15.79+iz*21.58/44);
    const stone=village.ground(p.x,p.z,p.y+.04,.12);
    check(stone,`Wing ${side} floor exists at ${ix},${iz}`);
    const clearance=stone.height-geography.surface.heightAt(p.x,p.z);
    check(clearance>.18&&clearance<.35,`Wing ${side} stone/terrain clearance: ${clearance}`);
    minClearance=Math.min(minClearance,clearance);maxClearance=Math.max(maxClearance,clearance);samples++;
  }
  let stairSamples=0,minStairClearance=Infinity;
  for(const x of [-3.45,0,3.45])for(let i=0;i<=150;i++){
    const z=-33.15+i*3.41/150,p=point(x,1.5,z);
    const stone=village.ground(p.x,p.z,p.y,1.5*S);
    check(stone,`Gate stair exists at ${x},${z}`);
    const clearance=stone.height-geography.surface.heightAt(p.x,p.z);
    check(clearance>.015,`Gate tread terrain clearance: ${clearance} at ${x},${z}`);
    minStairClearance=Math.min(minStairClearance,clearance);stairSamples++;
  }
  let passageSamples=0;
  for(let ix=0;ix<=20;ix++)for(let iz=0;iz<=32;iz++){
    const p=point(-3.64+ix*7.28/20,1.375,-29.72+iz*6.71/32);
    const stone=village.ground(p.x,p.z,p.y+.04,.12);
    check(stone&&Math.abs(stone.height-p.y)<.001,`Continuous gatehouse stone floor at ${ix},${iz}: ${JSON.stringify({stone,expected:p.y})}`);
    check(stone.height-geography.surface.heightAt(p.x,p.z)>.3,'Soil stays below the whole gatehouse passage');
    passageSamples++;
  }
  // The keep and both thresholds must remain visible too.
  const landings=[];
  for(const [name,x,y,z] of [['gate',0,1.375,-30],['hall',0,3.025,-.9],['keep',0,3,6]]){
    const p=point(x,y,z),stone=village.ground(p.x,p.z,p.y+.04,.12);
    check(stone,`${name} landing exists`);
    const clearance=stone.height-geography.surface.heightAt(p.x,p.z);
    check(clearance>.015,`${name} terrain stays below stone: ${clearance}`);
    landings.push({name,clearance});
  }
  const yard=point(0,1.35,-16),center=point(0,1.35,0);
  check(Math.abs(geography.surface.heightAt(yard.x,yard.z)-yard.y)<.001,'Open yard height retained');
  check(Math.abs(geography.surface.heightAt(center.x,center.z)-center.y)<.001,'Castle placement height retained');
  check(!village.ground(yard.x,yard.z,yard.y+.15,.3),'Open yard remains map terrain');
  return {samples,minClearance,maxClearance,stairSamples,minStairClearance,passageSamples,landings,courtyardHeight:yard.y,scale:S};
}
