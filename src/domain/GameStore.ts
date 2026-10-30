import type { ZoneId } from '../data/world';
import { BUILD_CATALOG, RECIPES, hasCost } from './recipes';
import { newGame, type BuildType, type ItemId, type MaterialId, type SaveGameV1, type Structure } from './types';
import { canReplaceWall, planBuild, removalProblem, wallReplacementProblem, type BuildEnvironment } from './buildingRules';
import { sampleMainlandHeight } from '../world/terrainData';
import type { SaveRepository } from '../persistence/SaveRepository';

export type Milestone = 'collect' | 'craft' | 'build' | 'sail' | 'light' | 'complete';
export type StoreListener = (state: Readonly<SaveGameV1>) => void;

export class GameStore {
  private data: SaveGameV1;
  private readonly listeners = new Set<StoreListener>();
  private nextId = 0;
  private lastPlacedId:string|null=null;
  private buildEnvironment:()=>BuildEnvironment=()=>({heightAt:sampleMainlandHeight});

  constructor(private readonly repository: SaveRepository) {
    this.data = repository.load();
    this.nextId = this.data.structures.length;
  }

  get state(): Readonly<SaveGameV1> { return this.data; }
  setBuildEnvironment(provider:()=>BuildEnvironment):void{this.buildEnvironment=provider;}

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    listener(this.data);
    return () => this.listeners.delete(listener);
  }

  private commit(): void {
    this.data.updatedAt = new Date().toISOString();
    this.repository.save(this.data);
    for (const listener of this.listeners) listener(this.data);
  }

  collect(resource: MaterialId, amount: number): boolean {
    if (!Number.isInteger(amount) || amount < 1 || amount > 10) return false;
    this.data.inventory[resource] += amount;
    this.commit();
    return true;
  }

  resourceReadyAt(id:string):number{return this.data.resourceRespawns?.[id]??0;}

  /** Atomic harvest: cooldown and inventory are committed together. */
  collectResourceNode(id:string,resource:MaterialId,amount:number,cooldownMs:number,now=Date.now()):boolean {
    if(!/^[a-z0-9:-]{1,100}$/.test(id)||!Number.isInteger(amount)||amount<1||amount>10||
      !Number.isFinite(now)||!Number.isFinite(cooldownMs)||cooldownMs<1000||cooldownMs>3600000)return false;
    const respawns=this.data.resourceRespawns??(this.data.resourceRespawns={});
    if((respawns[id]??0)>now)return false;
    for(const [oldId,readyAt] of Object.entries(respawns))if(readyAt<=now)delete respawns[oldId];
    this.data.inventory[resource]+=amount;
    respawns[id]=now+cooldownMs;
    this.commit();
    return true;
  }

  craft(recipeId: string): { ok: boolean; message: string } {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { ok: false, message: 'Receta desconocida.' };
    if (!hasCost(this.data.inventory, recipe.requires)) return { ok: false, message: 'Todavía faltan materiales.' };
    if (this.data.inventory[recipe.output] >= 1) return { ok: false, message: 'Ya fabricaste ese objeto.' };
    for (const [key, amount] of Object.entries(recipe.requires) as [ItemId, number][]) {
      this.data.inventory[key] -= amount;
    }
    this.data.inventory[recipe.output]++;
    this.commit();
    return { ok: true, message: `¡Fabricaste ${recipe.title}!` };
  }

  canBuild(type: BuildType, x: number, z: number, rotation=0): ReturnType<typeof planBuild> {
    const definition = BUILD_CATALOG.find(item => item.type === type);
    if (!definition) return { ok: false, message: 'Pieza inexistente.' };
    if (this.data.zone !== 'brisalia') return { ok: false, message: 'La primera parcela está en Brisalia.' };
    if (this.data.inventory.hammer < 1) return { ok: false, message: 'Primero fabricá un martillo.' };
    const decision=planBuild(type,x,z,rotation,this.data.structures,this.buildEnvironment());
    if(!decision.ok)return decision;
    if(!hasCost(this.data.inventory,definition.requires))
      return {...decision,ok:false,message:'Necesitás más materiales.'};
    return decision;
  }

  build(type: BuildType, x: number, z: number, rotation: number): { ok: boolean; message: string; structure?: Structure } {
    const allowed = this.canBuild(type, x, z, rotation);
    if (!allowed.ok || !allowed.plan) return allowed;
    const definition = BUILD_CATALOG.find(item => item.type === type)!;
    for (const [key, amount] of Object.entries(definition.requires) as [ItemId, number][]) {
      this.data.inventory[key] -= amount;
    }
    const structure: Structure = {
      id: `build-${Date.now()}-${this.nextId++}`,
      type,zone:'brisalia',x:allowed.plan.x,z:allowed.plan.z,
      rotation:allowed.plan.rotation,anchor:allowed.plan.anchor,level:0,baseY:allowed.plan.baseY
    };
    this.data.structures.push(structure);
    this.lastPlacedId=structure.id;
    this.commit();
    return { ok: true, message: `¡Colocaste ${definition.title}!`, structure };
  }

  removeStructure(id:string):{ok:boolean;message:string;structure?:Structure}{
    const index=this.data.structures.findIndex(s=>s.id===id);
    if(index<0)return {ok:false,message:'No encontramos esa pieza.'};
    const structure=this.data.structures[index];
    const problem=removalProblem(structure,this.data.structures);
    if(problem)return {ok:false,message:problem};
    const cost=BUILD_CATALOG.find(item=>item.type===structure.type)?.requires;
    if(cost)for(const [key,amount] of Object.entries(cost) as [ItemId,number][])
      this.data.inventory[key]+=amount;
    this.data.structures.splice(index,1);
    if(this.lastPlacedId===id)this.lastPlacedId=null;
    this.commit();
    return {ok:true,message:'Pieza retirada. Recuperaste todos sus materiales.',structure};
  }

  replaceWall(id:string,type:BuildType):{ok:boolean;message:string;structure?:Structure}{
    const old=this.data.structures.find(s=>s.id===id);
    const next=BUILD_CATALOG.find(item=>item.type===type);
    if(!old||!next||!canReplaceWall(old.type,type)||old.legacy||!old.anchor)
      return {ok:false,message:'Elegí una pared existente y otro material compatible.'};
    const placement=wallReplacementProblem(old,type,this.data.structures,
      this.buildEnvironment().player);
    if(placement)return {ok:false,message:placement};
    const previous=BUILD_CATALOG.find(item=>item.type===old.type)!.requires;
    const available={...this.data.inventory};
    for(const [key,amount] of Object.entries(previous) as [ItemId,number][])
      available[key]+=amount;
    if(!hasCost(available,next.requires))return {ok:false,message:'Faltan materiales para reemplazar esa pared.'};
    for(const [key,amount] of Object.entries(previous) as [ItemId,number][])
      this.data.inventory[key]+=amount;
    for(const [key,amount] of Object.entries(next.requires) as [ItemId,number][])
      this.data.inventory[key]-=amount;
    const replacement={...old,type};
    this.data.structures[this.data.structures.indexOf(old)]=replacement;
    this.commit();
    return {ok:true,message:`Pared cambiada por ${next.title}.`,structure:replacement};
  }

  undoLastBuild():{ok:boolean;message:string;structure?:Structure}{
    if(!this.lastPlacedId)return {ok:false,message:'No hay una colocación reciente para deshacer.'};
    return this.removeStructure(this.lastPlacedId);
  }

  setPlayerPosition(zone:ZoneId,x:number,z:number):void {
    if(this.data.zone!==zone||!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>10000||Math.abs(z)>10000)return;
    const old=this.data.playerPosition;
    if(old?.zone===zone && Math.hypot(old.x-x,old.z-z)<1.5)return;
    this.data.playerPosition={zone,x,z};
    this.commit();
  }

  discoverPlace(id:string):void {
    if(!/^[a-z0-9-]{1,64}$/.test(id))return;
    const discovered=this.data.discoveredPlaces??(this.data.discoveredPlaces=[]);
    if(discovered.includes(id)||discovered.length>=100)return;
    discovered.push(id);
    this.commit();
  }

  travel(zone: ZoneId): void {
    this.data.zone = zone;
    this.data.playerPosition=undefined;
    if (!this.data.visited.includes(zone)) this.data.visited.push(zone);
    this.commit();
  }

  get milestone(): Milestone {
    if (this.data.inventory.hammer < 1) return this.data.inventory.wood >= 2 && this.data.inventory.stone >= 1 ? 'craft' : 'collect';
    if (this.data.structures.length < 3) return 'build';
    if (!this.data.visited.includes('luciernagas')) return 'sail';
    if (this.data.inventory.lantern < 1) return 'light';
    return 'complete';
  }

  reset(): void {
    this.repository.clear();
    this.data = newGame();
    this.nextId = 0;
    this.lastPlacedId=null;
    this.commit();
  }
}
