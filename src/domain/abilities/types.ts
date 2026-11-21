export const ABILITY_IDS = ['forest_roots','forest_ultimate','igneo_fire','albor_flight',
  'valdoria_light','valdemonte_stone','sylvarin_resonance','ferragris_magnetism',
  'solhar_sand','umbrael_shadow','nacar_water','viridara_vines','doravena_beasts','thalamar_lightning'] as const;
export type AbilityId = typeof ABILITY_IDS[number];
export type Point = Readonly<{x:number;y:number;z:number}>;
export type SurfacePoint = Point & {normal:Point};
export type AbilityPlacement = SurfacePoint & {
  ring?:number;delay?:number;scale?:number;lean?:number;
};
export type AbilityProgress = {unlocked:AbilityId[];selected:AbilityId|null;levels:Partial<Record<AbilityId,number>>};
export type AbilityCondition =
  | {all:readonly AbilityCondition[]}
  | {any:readonly AbilityCondition[]}
  | {rule:string;value?:string|number|boolean;reason:string};
export type AbilityAnimation = {
  /** 'santi' uses the loaded rig. An external GLB must use matching bone names/rest rig. */
  file:string;clip:string;speed:number;blendSeconds:number;loop?:boolean;
};
export type AbilityTimeline = {
  commit:number;fx:readonly number[];impacts:readonly number[];recovery:number;release:number;
};
export type AbilityProfile = {
  level:number;radius:number;roots:number;damageMultiplier:number;rootScale:number;fxIntensity:number;
  emergence:number;hold:number;retraction:number;push:number;immobilize:number;
  rings?:readonly {radius:number;roots:number;scale:number;delay:number;lean?:number}[];
  cameraShake?:Readonly<{amplitude:number;duration:number;frequency:number}>;
  timeline?:Partial<Pick<AbilityTimeline,'impacts'|'recovery'|'release'>>;
};
export type AbilityDefinition = {
  id:AbilityId;name:string;origin:string;description:string;
  design:'confirmed'|'proposed';implementation:'available'|'pending';pendingReason?:string;
  slot:'special'|'ultimate';activation:'instant'|'timed'|'toggle';
  unlockDescription:string;conditions:AbilityCondition|null;
  levelSource:'sword'|'ability';profiles:readonly AbilityProfile[];
  behavior:string|null;fx:string|null;animation:AbilityAnimation|null;
  timeline:AbilityTimeline;cooldown:number;cooldownStarts:'commit'|'end';
  cost?:{resource:string;amount:number};
  cancel:{beforeCommit:boolean;afterCommit:boolean};
};
export type AbilityContext = {
  unlocked:readonly AbilityId[];swordLevel:number;levels:Partial<Record<AbilityId,number>>;
  equipment:string;playerState:string;position:Point;scope:string;
  blocked:string|null;actionBusy:boolean;facts:Readonly<Record<string,string|number|boolean>>;
};
export type AbilityPhase='idle'|'preparing'|'executing'|'recovering'|'active';
export type AbilityStatus={
  id:AbilityId;design:AbilityDefinition['design'];implementation:AbilityDefinition['implementation'];
  unlocked:boolean;available:boolean;activable:boolean;reason:string|null;
  cooldown:number;phase:AbilityPhase;level:number;profile:AbilityProfile;
};
export type AbilityPlan={center:Point;placements:readonly AbilityPlacement[]};
export type AbilityExecution={
  readonly id:string;readonly definition:AbilityDefinition;readonly scope:string;
  profile:Readonly<AbilityProfile>;timeline:Readonly<AbilityTimeline>;plan:AbilityPlan|null;elapsed:number;committed:boolean;
  readonly hits:Set<string>;readonly markers:Set<string>;phase:AbilityPhase;
};
export type Decision={ok:true}|{ok:false;reason:string};
export const allowed:Decision={ok:true};
export const denied=(reason:string):Decision=>({ok:false,reason});
export interface AbilityPresentation {
  prepare(definition:AbilityDefinition):void;
  ready(definition:AbilityDefinition):Decision;
  start(execution:AbilityExecution):boolean;
  fx(execution:AbilityExecution,index:number):void;
  update(execution:AbilityExecution,dt:number):void;
  end(execution:AbilityExecution):void;
  dispose():void;
}
export interface AbilityBehavior {
  plan(context:AbilityContext,profile:Readonly<AbilityProfile>):AbilityPlan|null;
  commit?(execution:AbilityExecution):void;
  impact(execution:AbilityExecution,index:number):void;
  update?(execution:AbilityExecution,dt:number):void;
  end?(execution:AbilityExecution):void;
}
/** Future Albor adapter must own collision-aware flight and release it on every end. */
export interface FlightMovementPort {
  canStart():Decision;
  start(executionId:string):void;
  update(dt:number,input:{horizontal:number;forward:number;vertical:number}):void;
  stop(executionId:string):void;
}
