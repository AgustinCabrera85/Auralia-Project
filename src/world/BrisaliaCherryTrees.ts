import {palaceWorld, palaceTreeGroundOffset} from './palace/PalaceSite';
import {ASSET_CATALOG} from './assetCatalog';
import {BRISALIA_SCALE,brisaliaPlatformWeight,brisaliaRoadEdge,inBrisaliaFootprint} from './brisaliaLayout';
import {getWorldDocument,type PlacedAsset} from './editor/WorldEditState';
import type {ActiveWorldGeography} from './geography/ActiveGeography';
import {vegetationTouchesBeach} from './geography/VegetationBeach';
import {vegetationTouchesWater} from './geography/VegetationWater';
import {hash01} from './terrainData';
import {terrainFootprintAt} from './terrainLod';
import type {VegetationExclusion} from './vegetationData';

export const BRISALIA_CHERRY_PREFIX='brisalia-cherry-';
export const BRISALIA_CHERRIES=['v3TreeCherryPink','v3TreeCherryWhite','v3TreeCherryTwin'] as const;
// Conservative horizontal radii measured from the existing GLB crowns.
const crownRadii=[7,7.1,7.2] as const;
export const brisaliaCherryCrown=(p:PlacedAsset):number=>
  crownRadii[BRISALIA_CHERRIES.indexOf(p.assetId as typeof BRISALIA_CHERRIES[number])]*1.7*p.scale;
export const inBrisaliaCherryDistrict=(x:number,z:number):boolean=>brisaliaPlatformWeight(x,z)>.02;

/** Seeded, bounded city planting. Shared GLBs, wind and LODs are streamed by
 * AuthoredAssets; placement is generated once without touching player saves. */
export function brisaliaCherryTrees(world:ActiveWorldGeography,exclusions:readonly VegetationExclusion[]=[],
  existing:readonly PlacedAsset[]=[]):PlacedAsset[]{
  const result:PlacedAsset[]=[],grid=new Map<string,number>();
  const heightAt=(x:number,z:number)=>{
    const key=`${x}:${z}`;let h=grid.get(key);
    if(h===undefined){h=world.source.heightAt(x,z);grid.set(key,h);}return h;
  };
  const obstacles=exclusions.filter(e=>!e.buildingId);
  for(let iz=-16;iz<=7;iz++)for(let ix=-15;ix<=20;ix++){
    const lx=(ix+.18+.64*hash01(ix,iz,601))*32,lz=(iz+.18+.64*hash01(ix,iz,602))*32;
    if(!inBrisaliaCherryDistrict(lx,lz)||hash01(ix,iz,603)>.62)continue;
    const variant=hash01(ix,iz,604),index=variant<.65?0:variant<.85?1:2;
    const assetId=BRISALIA_CHERRIES[index],catalog=ASSET_CATALOG[assetId];
    const scale=.85+.3*hash01(ix,iz,605),radius=crownRadii[index]*catalog.referenceScale*scale;
    const x=world.town.x+lx,z=world.town.z+lz;
    if(inBrisaliaFootprint(lx,lz,radius+2)||brisaliaRoadEdge(lx,lz)<radius+1||
      Math.hypot(lx,lz+65*BRISALIA_SCALE)<15*BRISALIA_SCALE+radius)continue;
    if((world.vegetationClearanceAt?.(x,z)??Infinity)<radius+1||
      obstacles.some(e=>Math.hypot(x-e.x,z-e.z)<e.radius+radius)||
      existing.some(e=>Math.hypot(x-e.x,z-e.z)<(e.collisionRadius??0)*e.scale+radius+2)||
      result.some(e=>Math.hypot(x-e.x,z-e.z)<brisaliaCherryCrown(e)+radius+3))continue;
    const support=terrainFootprintAt(x,z,1,heightAt,world.source.meshSpacing);
    if(support.minHeight<world.source.seaLevel+1.5||support.maxSlope>.35||support.maxHeight-support.minHeight>.7||
      vegetationTouchesBeach(world.source,x,z,radius+1,heightAt)||vegetationTouchesWater(world,x,z,radius+1))continue;
    result.push({id:`${BRISALIA_CHERRY_PREFIX}${ix}:${iz}`,assetId,x,z,scale,
      yaw:hash01(ix,iz,606)*Math.PI*2,yOffset:-.03,collisionRadius:catalog.collisionRadius});
  }
  return result;
}

export function installBrisaliaCherryTrees(world:ActiveWorldGeography,exclusions:readonly VegetationExclusion[]):number{
  const doc=getWorldDocument(),existing=doc.assets.filter(p=>!p.id.startsWith(BRISALIA_CHERRY_PREFIX));
  const trees=brisaliaCherryTrees(world,exclusions,existing);
  for(const [i,[x,z]] of [[0,29],[-24,-11],[24,-11],[-43,15],[43,15],[-43,42],[43,42],[-25,70],[25,70]].entries()){
    const assetId=BRISALIA_CHERRIES[i%3];trees.push({id:`${BRISALIA_CHERRY_PREFIX}palace:${i}`,assetId,...palaceWorld(x,z),scale:i===0?1.4:i<=2?1.5:1.2,yaw:i*1.7,
      yOffset:palaceTreeGroundOffset(x,z),collisionRadius:ASSET_CATALOG[assetId].collisionRadius});
  }
  doc.assets=[...existing,...trees];return trees.length;
}
