import type { EquipmentId } from '../domain/types';
import type { LocomotionMode } from './traversalRules';

/** NLA strips exported with Santi_NLA_SK_Opt.glb. Keep names in sync with the asset. */
export const SANTI_NLA_ACTIONS = [
  'Idle (1)',
  'Ascending Stairs',
  'Braced Hang To Crouch',
  'Climbing Ladder',
  'Climbing To Top',
  'Climbing',
  'Draw A Great Sword 2',
  'Falling Idle',
  'Falling To Roll',
  'Flying',
  'Great Sword High Spin Attack',
  'Hanging Idle',
  'Hard Landing',
  'Idle (2)',
  'Inside Crescent Kick',
  'Jump From Wall',
  'Jump To Freehang',
  'Jumping',
  'Kicking',
  'Left Shimmy',
  'Right Shimmy',
  'Run With Sword',
  'Run',
  'Running Backward',
  'Running Jump',
  'Running Slide',
  'Running Up Stairs',
  'Sheath A Great Sword 1',
  'Skateboarding',
  'Sprinting Forward Roll',
  'Swimming (3)',
  'Sword And Shield Casting',
  'Sword And Shield Power Up',
  'Two Hand Sword Combo',
  'Walking (6)'
] as const;

export type SantiActionName = typeof SANTI_NLA_ACTIONS[number];

export const SANTI_LOCOMOTION = {
  idle: 'Idle (1)',
  walk: 'Walking (6)',
  run: 'Run',
  backward: 'Running Backward',
  jump: 'Jumping',
  doubleJump: 'Jumping',
  runningJump: 'Running Jump',
  fall: 'Falling Idle',
  climb: 'Climbing',
  hanging: 'Hanging Idle',
  mantle: 'Climbing To Top'
} as const satisfies Record<string, SantiActionName>;

export const SANTI_COMBAT = {
  airKick: 'Inside Crescent Kick',
  kicks: ['Kicking','Inside Crescent Kick'],
  swordAttacks: ['Two Hand Sword Combo','Great Sword High Spin Attack'],
  attacks: [
    'Kicking', 'Inside Crescent Kick', 'Two Hand Sword Combo',
    'Great Sword High Spin Attack'
  ],
  sweep: 'Running Slide',
  roll: 'Sprinting Forward Roll',
  highFallRoll: 'Falling To Roll'
} as const satisfies {
  airKick:SantiActionName;
  kicks:readonly SantiActionName[];
  swordAttacks:readonly SantiActionName[];
  attacks:readonly SantiActionName[];
  sweep:SantiActionName;
  roll:SantiActionName;
  highFallRoll:SantiActionName;
};

export function availableCombatAttacks(equipped:EquipmentId):readonly SantiActionName[]{
  if(equipped==='unarmed')return SANTI_COMBAT.kicks;
  if(equipped==='sword')return SANTI_COMBAT.swordAttacks;
  return [];
}

/** Q changes meaning in the air; F and R remain grounded actions. */
export function combatInputForKey(key:string,mode:LocomotionMode,jumpsUsed:number):
  'attack'|'airKick'|'sweep'|'roll'|null{
  if(key==='q')return mode==='grounded'?'attack':
    mode==='airborne'&&jumpsUsed===1?'airKick':null;
  if(mode!=='grounded')return null;
  return key==='f'?'sweep':key==='r'?'roll':null;
}

export type SantiComboStep={
  action:typeof SANTI_COMBAT.attacks[number];
  speed:number;
  from:number;
  to:number;
  /** Fraction of playback after the strike, when recovery can link to the next hit. */
  linkAt:number;
};

// Keep the strike itself intact; only the recovery is cut when another Q is queued.
// The sword's first clip already contains several swings, so it gets a later link.
export const SANTI_COMBOS={
  unarmed:[
    {action:'Kicking',speed:1.18,from:.04,to:1,linkAt:.76},
    {action:'Inside Crescent Kick',speed:1.22,from:.04,to:1,linkAt:.78},
    {action:'Kicking',speed:1.3,from:.04,to:1,linkAt:1}
  ],
  sword:[
    {action:'Two Hand Sword Combo',speed:1.16,from:.02,to:1,linkAt:.88},
    {action:'Great Sword High Spin Attack',speed:1.22,from:.02,to:1,linkAt:1}
  ]
} as const satisfies Record<'unarmed'|'sword',readonly SantiComboStep[]>;

export function combatCombo(equipped:EquipmentId):readonly SantiComboStep[]{
  return equipped==='unarmed'?SANTI_COMBOS.unarmed:
    equipped==='sword'?SANTI_COMBOS.sword:[];
}

/** Named facial expressions; individual action units and visemes are also registered at load. */
export const SANTI_EXPRESSIONS = [
  'SF_01_FELIZ_SonrisaNatural',
  'SF_02_FELIZ_SonrisaGrande',
  'SF_03_FELIZ_Risa',
  'SF_04_FELIZ_Entusiasmo',
  'SF_05_FELIZ_SonrisaTraviesa',
  'SF_06_EMOCION_Sorpresa',
  'SF_07_EMOCION_Asombro',
  'SF_08_EMOCION_Tristeza',
  'SF_09_EMOCION_Enojo',
  'SF_10_EMOCION_Miedo',
  'SF_11_EMOCION_Curiosidad',
  'SF_12_EMOCION_Concentrado',
  'SF_13_EMOCION_Queja'
] as const;

export type SantiExpressionName = typeof SANTI_EXPRESSIONS[number];

