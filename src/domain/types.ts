import type { ZoneId } from '../data/world';
import { START_HOUR } from '../world/climate/ClimateModel';

export type ItemId = 'wood' | 'stone' | 'copper' | 'spark' | 'fireCrystal' | 'hammer' | 'pickaxe' | 'lantern' | 'sword';
export const EQUIPMENT_IDS=['unarmed','sword','pickaxe','hammer','lantern'] as const;
export type EquipmentId=typeof EQUIPMENT_IDS[number];
export type MaterialId = 'wood' | 'stone' | 'copper' | 'spark' | 'fireCrystal';
export type BuildType = 'foundation' | 'floor' | 'wall' | 'stone-wall' | 'metal-wall' |
  'door-wall' | 'window-wall' | 'roof' | 'roof-section' | 'post';
export type BuildAnchor = {
  kind:'cell'|'edge'|'corner'|'roof';
  i:number;j:number;side?:0|1|2|3;level:number;
};
export type Inventory = Record<ItemId, number>;

export type Structure = {
  id: string;
  type: BuildType;
  zone: 'brisalia';
  x: number;
  z: number;
  rotation: number;
  /** Missing on old saves. Legacy pieces keep their original coordinates and appearance. */
  anchor?:BuildAnchor;
  level?:number;
  baseY?:number;
  legacy?:boolean;
};

export type SaveGameV1 = {
  version: 1;
  zone: ZoneId;
  inventory: Inventory;
  /** The selected combat or tool mode. Old saves default to unarmed. */
  equippedItem?: EquipmentId;
  structures: Structure[];
  visited: ZoneId[];
  /** Optional so saves created before geographic discoveries load unchanged. */
  discoveredPlaces?: string[];
  /** Stable crystal node IDs mapped to the millisecond when each node becomes available. */
  resourceRespawns?: Record<string,number>;
  /** Global clock; optional so existing v1 saves remain readable. */
  environment?: { elapsedHours:number };
  /** Opcional para abrir guardados v0.1 sin migración destructiva. */
  playerPosition?: {zone: ZoneId; x: number; z: number; realm?:string};
  createdAt: string;
  updatedAt: string;
};

export const MATERIALS: MaterialId[] = ['wood', 'stone', 'copper', 'spark', 'fireCrystal'];
export const ITEM_LABEL: Record<ItemId, string> = {
  wood: 'Madera', stone: 'Piedra', copper: 'Cobre', spark: 'Chispa', fireCrystal:'Cristal ígneo',
  hammer: 'Martillo', pickaxe: 'Pico', lantern: 'Linterna mágica', sword:'Espada de cobre'
};
export const ITEM_ICON: Record<ItemId, string> = {
  wood: '🪵', stone: '🪨', copper: '🔩', spark: '✨', fireCrystal:'🔥',
  hammer: '🔨', pickaxe: '⛏️', lantern: '🏮', sword:'🗡️'
};

export function emptyInventory(): Inventory {
  return { wood: 0, stone: 0, copper: 0, spark: 0, fireCrystal:0, hammer: 0, pickaxe: 0, lantern: 0, sword:0 };
}
export function newGame(): SaveGameV1 {
  const now = new Date().toISOString();
  return {
    version: 1, zone: 'brisalia', playerPosition: {zone:'brisalia',x:1,z:10},
    inventory: emptyInventory(), equippedItem:'unarmed', structures: [],
    visited: ['brisalia'], discoveredPlaces: [], resourceRespawns:{},
    environment:{elapsedHours:START_HOUR}, createdAt: now, updatedAt: now
  };
}
