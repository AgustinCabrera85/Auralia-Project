import type { ZoneId } from '../data/world';
import { BUILD_CATALOG, RECIPES, hasCost } from './recipes';
import { newGame, type BuildType, type ItemId, type MaterialId, type SaveGameV1, type Structure } from './types';
import type { SaveRepository } from '../persistence/SaveRepository';

export type Milestone = 'collect' | 'craft' | 'build' | 'sail' | 'light' | 'complete';
export type StoreListener = (state: Readonly<SaveGameV1>) => void;

export class GameStore {
  private data: SaveGameV1;
  private readonly listeners = new Set<StoreListener>();
  private nextId = 0;

  constructor(private readonly repository: SaveRepository) {
    this.data = repository.load();
    this.nextId = this.data.structures.length;
  }

  get state(): Readonly<SaveGameV1> { return this.data; }

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

  canBuild(type: BuildType, x: number, z: number): { ok: boolean; message: string } {
    const definition = BUILD_CATALOG.find(item => item.type === type);
    if (!definition) return { ok: false, message: 'Pieza inexistente.' };
    if (this.data.zone !== 'brisalia') return { ok: false, message: 'La primera parcela está en Brisalia.' };
    if (this.data.inventory.hammer < 1) return { ok: false, message: 'Primero fabricá un martillo.' };
    if (!hasCost(this.data.inventory, definition.requires)) return { ok: false, message: 'Necesitás más materiales.' };
    // Parcela de construcción reservada: centro (-29, 18), cuadrada, sin NPC.
    if (Math.abs(x + 29) > 17 || Math.abs(z - 18) > 17) {
      return { ok: false, message: 'Esta construcción va en el Claro del Hogar.' };
    }
    if (this.data.structures.some(b => b.type === type && Math.abs(b.x-x)<0.2 && Math.abs(b.z-z)<0.2)) {
      return { ok: false, message: 'Ya existe esa pieza en esta celda.' };
    }
    return { ok: true, message: 'Se puede construir.' };
  }

  build(type: BuildType, x: number, z: number, rotation: number): { ok: boolean; message: string; structure?: Structure } {
    const allowed = this.canBuild(type, x, z);
    if (!allowed.ok) return allowed;
    const definition = BUILD_CATALOG.find(item => item.type === type)!;
    for (const [key, amount] of Object.entries(definition.requires) as [ItemId, number][]) {
      this.data.inventory[key] -= amount;
    }
    const structure: Structure = {
      id: `build-${Date.now()}-${this.nextId++}`,
      type, zone: 'brisalia', x, z, rotation: ((rotation % 4) + 4) % 4
    };
    this.data.structures.push(structure);
    this.commit();
    return { ok: true, message: `¡Colocaste ${definition.title}!`, structure };
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
    this.commit();
  }
}
