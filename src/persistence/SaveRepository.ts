import { newGame, type SaveGameV1 } from '../domain/types';
import { type ItemId, emptyInventory } from '../domain/types';

/** Se puede reemplazar por IndexedDB o una API remota sin cambiar la lógica del juego. */
export interface SaveRepository {
  load(): SaveGameV1;
  save(state: SaveGameV1): void;
  clear(): void;
}

export class LocalStorageSaveRepository implements SaveRepository {
  private readonly key = 'auralia:poc:save:v1';

  load(): SaveGameV1 {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return newGame();
      const parsed: unknown = JSON.parse(raw);
      if (!this.isValidSave(parsed)) return newGame();
      return {
        ...parsed,
        inventory: { ...emptyInventory(), ...parsed.inventory },
        discoveredPlaces:Array.isArray(parsed.discoveredPlaces)
          ? parsed.discoveredPlaces.filter((id):id is string=>typeof id==='string'&&/^[a-z0-9-]{1,64}$/.test(id)).slice(0,100)
          : [],
        resourceRespawns:parsed.resourceRespawns&&typeof parsed.resourceRespawns==='object'&&!Array.isArray(parsed.resourceRespawns)
          ? Object.fromEntries(Object.entries(parsed.resourceRespawns).filter(([id,time])=>
            /^[a-z0-9:-]{1,100}$/.test(id)&&typeof time==='number'&&Number.isFinite(time)&&time>=0).slice(0,2000))
          : {}
      };
    } catch (error) {
      console.warn('[Auralia] El guardado no pudo leerse.', error);
      return newGame();
    }
  }

  save(state: SaveGameV1): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
    } catch (error) {
      console.warn('[Auralia] Guardado local no disponible.', error);
    }
  }

  clear(): void {
    try { localStorage.removeItem(this.key); } catch { /* almacenamiento restringido */ }
  }

  private isValidSave(input: unknown): input is SaveGameV1 {
    if (typeof input !== 'object' || input === null) return false;
    const obj = input as Partial<SaveGameV1>;
    if (obj.version !== 1 || (obj.zone !== 'brisalia' && obj.zone !== 'luciernagas')) return false;
    if (!obj.inventory || !Array.isArray(obj.structures) || !Array.isArray(obj.visited)) return false;
    if (typeof obj.inventory !== 'object') return false;
    const counts = Object.values(obj.inventory as Partial<Record<ItemId, unknown>>);
    if (counts.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000)) return false;
    if (obj.structures.length > 2000) return false;
    if (obj.playerPosition !== undefined) {
      const p=obj.playerPosition;
      if (!p || (p.zone!=='brisalia'&&p.zone!=='luciernagas') ||
          !Number.isFinite(p.x)||!Number.isFinite(p.z)||Math.abs(p.x)>10000||Math.abs(p.z)>10000) return false;
    }
    return obj.structures.every(s => s && typeof s.id === 'string' &&
      ['floor','wall','stone-wall','metal-wall','roof','post'].includes(s.type) &&
      s.zone === 'brisalia' && Number.isFinite(s.x) && Number.isFinite(s.z) &&
      Number.isFinite(s.rotation));
  }
}
