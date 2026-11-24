import type {GrassPlacement} from './GrassPatchData';

type CachedPatch={placements:GrassPlacement[];detail:boolean};
/** CPU placements and matrices survive streaming/zone switches, including empty sectors.
 * Both limits matter: a desert costs keys, while a meadow costs matrices/objects. */
export class GrassPatchCache {
 private readonly entries=new Map<string,CachedPatch>();
 private placements=0;
 hits=0;
 evictions=0;
 constructor(readonly maxPatches=2048,readonly maxPlacements=100_000){}
 get size(){return this.entries.size;}
 get placementCount(){return this.placements;}
 take(key:string):CachedPatch|undefined{
  const entry=this.entries.get(key);
  if(entry){this.entries.delete(key);this.placements-=entry.placements.length;this.hits++;}
  return entry;
 }
 put(key:string,placements:GrassPlacement[],detail:boolean):void{
  const previous=this.entries.get(key);
  if(previous)this.placements-=previous.placements.length;
  this.entries.delete(key);
  this.entries.set(key,{placements,detail});this.placements+=placements.length;
  while(this.entries.size>this.maxPatches||this.placements>this.maxPlacements){
   const oldest=this.entries.keys().next().value!;
   this.placements-=this.entries.get(oldest)!.placements.length;this.entries.delete(oldest);this.evictions++;
  }
 }
 clear():void{this.entries.clear();this.placements=0;}
}
