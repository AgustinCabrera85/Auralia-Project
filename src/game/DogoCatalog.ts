/** Original NLA names exported by Blender in Dogo_Auralia.glb. */
export const DOGO_NLA_ACTIONS = [
  'Idle', 'Walk', 'Run', 'Sit', 'Sit_Idle', 'Scratch_Ear', 'Stand_Up',
  'Tail_Wag', 'Growl', 'Bark', 'Carry_Pickup', 'Carry_Idle', 'Carry_Walk',
  'Carry_Drop', 'Lie_Down', 'Sleep', 'Wake_Up', 'Celebrate', 'Jump_In_Place',
  'Jump_Running', 'Swim_Forward', 'Swim_Idle'
] as const;
export type DogoActionName = typeof DOGO_NLA_ACTIONS[number];
export type DogoLocomotion = 'idle' | 'walk' | 'run' | 'swim' | 'swimIdle';
export const DOGO_LOCOMOTION = {
  idle: 'Idle', walk: 'Walk', run: 'Run', swim: 'Swim_Forward', swimIdle: 'Swim_Idle'
} as const satisfies Record<DogoLocomotion,DogoActionName>;
export const DOGO = {
  model: '/assets/characters/dogo/Dogo_Auralia.glb',
  height: 1.35, radius: .32, stopDistance: 3.6, resumeDistance: 5,
  walkSpeed: 6, runSpeed: 20, catchupSpeed: 32, swimSpeed: 14,
  stepHeight: .55, maxDrop: 1.35, maxSlope: 48, recoverDistance: 65,
  acceleration: 18, braking: 22, turnRate: 2.8,
  trailSpacing: 1.2, maxTrail: 120
} as const;
