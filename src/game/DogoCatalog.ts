/** Logical actions stay independent of Blender's action/NLA prefixes. */
export const DOGO_CLIPS={
  Idle:'idle_breathe',Walk:'walk',Trot:'trot',Run:'run',Walk_Back:'walk_back',
  Look_Around:'idle_look_around',Tail_Swish:'idle_tail_swish',Eat:'eat_ground',
  Jump_In_Place:'jump',Lie_Down:'lie_down',Stand_Up:'get_up',Sit:'sit',
  Hit:'hit_react',Death:'death',Shake:'shake',Drink:'drink',Stalk_Walk:'stalk_walk',
  Turn_Left:'turn_90_L',Turn_Right:'turn_90_R',Sleep:'sleep_loop',Sniff:'sniff_ground',
  Claw_Left:'attack_claw_L',Claw_Right:'attack_claw_R',Bite:'attack_bite',Pounce:'pounce',
  Howl:'howl',Growl:'snarl',Lunge:'lunge_bite',Tail_Wag:'tail_wag',Cower:'cower',
  Dig:'dig',Alert:'point_alert',Sleep_Curl:'sleep_curl',Sniff_Walk:'sniff_walk'
} as const;
export const DOGO_NLA_ACTIONS=Object.keys(DOGO_CLIPS) as (keyof typeof DOGO_CLIPS)[];
export type DogoActionName = keyof typeof DOGO_CLIPS|'Swim_Forward'|'Swim_Idle';
export const DOGO_FOOT_CHAINS=[
  ['front_thigh.L','front_shin.L','front_toe.L'],['front_thigh.R','front_shin.R','front_toe.R'],
  ['thigh.L','shin.L','toe.L'],['thigh.R','shin.R','toe.R']
] as const;
export type DogoLocomotion = 'idle' | 'walk' | 'run' | 'swim' | 'swimIdle';
export const DOGO_LOCOMOTION = {
  idle: 'Idle', walk: 'Walk', run: 'Run', swim: 'Swim_Forward', swimIdle: 'Swim_Idle'
} as const satisfies Record<DogoLocomotion,DogoActionName>;
export const DOGO = {
  model: '/assets/characters/dogo/Dogo_Refined.glb',
  sha256:'1891bf32badcae20f5c4a10d46cd0334194e62613fec212c2adfcaa048f12646',
  height: 1.35, radius: .32, stopDistance: 3.6, resumeDistance: 5,
  walkSpeed: 6, runSpeed: 20, catchupSpeed: 32, swimSpeed: 14,
  stepHeight: .55, maxDrop: 1.35, maxSlope: 48, recoverDistance: 65,
  acceleration: 18, braking: 22, turnRate: 2.8,
  trailSpacing: 1.2, maxTrail: 120
} as const;
