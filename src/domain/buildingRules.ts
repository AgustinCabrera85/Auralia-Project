import type { BuildAnchor, BuildType, Structure } from './types';

export const BUILD_GRID=4;
export const BUILD_LEVEL_HEIGHT=3.5;
export const BUILD_PLOT={x:-29,z:18,halfSize:17} as const;
export const WALL_TYPES:readonly BuildType[]=['wall','stone-wall','metal-wall','door-wall','window-wall'];
export type BuildObstacle={x:number;z:number;radius:number;kind:'tree'|'resource'|'rock'|'house'};
export type BuildEnvironment={
  heightAt:(x:number,z:number)=>number;
  obstacles?:readonly BuildObstacle[];
  player?:{x:number;z:number;y:number};
};
export type BuildPlan={x:number;z:number;rotation:number;anchor:BuildAnchor;baseY:number};
export type BuildDecision={ok:boolean;message:string;plan?:BuildPlan};
const cell=(i:number,j:number)=>({x:BUILD_PLOT.x+i*BUILD_GRID,z:BUILD_PLOT.z+j*BUILD_GRID});
const norm=(n:number):0|1|2|3=>((Math.round(n)%4+4)%4) as 0|1|2|3;
const isWall=(type:BuildType)=>WALL_TYPES.includes(type);
const isFloor=(type:BuildType)=>type==='floor'||type==='foundation';
const sameCell=(a:BuildAnchor,b:BuildAnchor)=>a.i===b.i&&a.j===b.j&&a.level===b.level;

export function nearestEdgeSide(x:number,z:number):0|1|2|3{
  const i=Math.round((x-BUILD_PLOT.x)/BUILD_GRID),j=Math.round((z-BUILD_PLOT.z)/BUILD_GRID);
  const c=cell(i,j),dx=x-c.x,dz=z-c.z;
  return Math.abs(dx)>Math.abs(dz)?(dx>=0?1:3):(dz>=0?2:0);
}

export function anchorPoint(anchor:BuildAnchor):{x:number;z:number}{
  const p=cell(anchor.i,anchor.j);
  if(anchor.kind==='corner')return {x:p.x-2,z:p.z-2};
  if(anchor.kind!=='edge')return p;
  const side=anchor.side??0;
  return {x:p.x+(side===1?2:side===3?-2:0),
    z:p.z+(side===2?2:side===0?-2:0)};
}

export function slotKey(anchor:BuildAnchor,type?:BuildType):string{
  const p=anchorPoint(anchor);
  const kind=anchor.kind==='cell'&&type==='foundation'?'foundation':anchor.kind;
  return `${kind}:${anchor.level}:${Math.round(p.x*2)}:${Math.round(p.z*2)}`;
}

export function anchorFor(type:BuildType,x:number,z:number,rotation=0):BuildAnchor{
  if(type==='post')return {kind:'corner',i:Math.round((x-BUILD_PLOT.x+2)/4),
    j:Math.round((z-BUILD_PLOT.z+2)/4),level:0};
  const i=Math.round((x-BUILD_PLOT.x)/4),j=Math.round((z-BUILD_PLOT.z)/4);
  if(isWall(type))return {kind:'edge',i,j,side:norm(rotation),level:0};
  return {kind:type==='roof'||type==='roof-section'?'roof':'cell',i,j,level:0};
}

export function footprint(structure:Structure):{x:number;z:number;radius:number}{
  return {x:structure.x,z:structure.z,radius:structure.anchor?.kind==='edge'?2.25:
    structure.anchor?.kind==='corner'?.65:2.55};
}

function adjacentCells(anchor:BuildAnchor):{i:number;j:number}[]{
  const {i,j,side=0}=anchor;
  return [{i,j},side===0?{i,j:j-1}:side===1?{i:i+1,j}:
    side===2?{i,j:j+1}:{i:i-1,j}];
}

function cellSupport(anchor:BuildAnchor,existing:readonly Structure[]):boolean{
  return existing.some(s=>s.anchor?.kind==='cell'&&isFloor(s.type)&&
    sameCell(s.anchor,anchor));
}

function edgeSupports(anchor:BuildAnchor,existing:readonly Structure[]):number{
  let count=0;
  for(let side=0;side<4;side++){
    const edge={...anchor,kind:'edge' as const,side:side as 0|1|2|3};
    if(existing.some(s=>s.anchor?.kind==='edge'&&slotKey(s.anchor)===slotKey(edge)))count++;
  }
  return count;
}

export function supportProblem(type:BuildType,anchor:BuildAnchor,
  existing:readonly Structure[]):string|null{
  if(isWall(type)&&!adjacentCells(anchor).some(c=>
    cellSupport({...anchor,kind:'cell',i:c.i,j:c.j},existing)))
    return 'La pared necesita un piso o cimiento junto a ese borde.';
  if(type==='roof'||type==='roof-section'){
    if(!cellSupport({...anchor,kind:'cell'},existing))
      return 'El techo necesita un piso o cimiento debajo.';
    if(edgeSupports(anchor,existing)<2)
      return 'El techo necesita al menos dos paredes de apoyo.';
  }
  return null;
}

function heightRange(x:number,z:number,heightAt:BuildEnvironment['heightAt']):number{
  const values=[[-2,-2],[-2,2],[2,-2],[2,2],[0,0]].map(([dx,dz])=>heightAt(x+dx,z+dz));
  return Math.max(...values)-Math.min(...values);
}

function enclosesPlayer(nextType:BuildType,next:BuildAnchor,existing:readonly Structure[],
  player:NonNullable<BuildEnvironment['player']>):boolean{
  const start={i:Math.round((player.x-BUILD_PLOT.x)/4),
    j:Math.round((player.z-BUILD_PLOT.z)/4)};
  if(Math.abs(start.i)>4||Math.abs(start.j)>4)return false;
  const walls=[...existing.filter(s=>!s.legacy&&s.anchor?.kind==='edge'&&
    isWall(s.type)&&s.type!=='door-wall').map(s=>s.anchor!),
    ...(nextType!=='door-wall'?[next]:[])];
  const blocked=new Set(walls.map(anchor=>slotKey(anchor)));
  const seen=new Set<string>(),queue=[start];
  while(queue.length){
    const current=queue.shift()!,key=`${current.i}:${current.j}`;
    if(seen.has(key))continue;
    seen.add(key);
    if(Math.abs(current.i)>4||Math.abs(current.j)>4)return false;
    for(const [side,di,dj] of [[0,0,-1],[1,1,0],[2,0,1],[3,-1,0]]){
      const edge:BuildAnchor={kind:'edge',i:current.i,j:current.j,
        side:side as 0|1|2|3,level:0};
      if(!blocked.has(slotKey(edge)))queue.push({i:current.i+di,j:current.j+dj});
    }
  }
  return true;
}

export function planBuild(type:BuildType,rawX:number,rawZ:number,rotation:number,
  existing:readonly Structure[],env:BuildEnvironment):BuildDecision{
  const anchor=anchorFor(type,rawX,rawZ,rotation);
  const point=anchorPoint(anchor);
  const nearby=existing.find(s=>!s.legacy&&s.baseY!==undefined&&s.anchor&&
    Math.hypot(s.x-point.x,s.z-point.z)<=BUILD_GRID*1.65);
  const baseY=nearby?.baseY??env.heightAt(cell(anchor.i,anchor.j).x,cell(anchor.i,anchor.j).z);
  const plan={...point,rotation:isWall(type)?(anchor.side??0)%2:
    norm(rotation)%2,anchor,baseY};
  if(anchor.level!==0)return {ok:false,message:'Por ahora se construye sólo la planta baja.',plan};
  if(Math.abs(point.x-BUILD_PLOT.x)>BUILD_PLOT.halfSize-1||
    Math.abs(point.z-BUILD_PLOT.z)>BUILD_PLOT.halfSize-1)
    return {ok:false,message:'Esta pieza queda fuera del Claro del Hogar.',plan};
  if(existing.some(s=>!s.legacy&&s.anchor&&
    slotKey(s.anchor,s.type)===slotKey(anchor,type)))
    return {ok:false,message:'Ese punto de encastre ya está ocupado.',plan};
  const c=cell(anchor.i,anchor.j);
  if(heightRange(c.x,c.z,env.heightAt)>1.25)
    return {ok:false,message:'El terreno tiene demasiada pendiente para esa pieza.',plan};
  if(env.obstacles?.some(ob=>Math.hypot(ob.x-point.x,ob.z-point.z)<ob.radius+
    (anchor.kind==='edge'?1.25:anchor.kind==='corner'?.35:2)))
    return {ok:false,message:'Hay un árbol, recurso o roca en ese lugar.',plan};
  const support=supportProblem(type,anchor,existing);
  if(support)return {ok:false,message:support,plan};
  if((type==='roof'||type==='roof-section')&&existing.some(s=>!s.legacy&&
    (s.type==='roof'||s.type==='roof-section')&&s.anchor?.kind==='roof'&&
    Math.hypot(s.x-point.x,s.z-point.z)<=BUILD_GRID+.01&&s.rotation!==plan.rotation))
    return {ok:false,message:'Alineá la cumbrera con el techo vecino (R).',plan};
  if(isWall(type)&&env.player&&Math.hypot(env.player.x-point.x,env.player.z-point.z)<1.1&&
    env.player.y>=baseY-.3&&env.player.y<baseY+BUILD_LEVEL_HEIGHT)
    return {ok:false,message:'El personaje está en el espacio de esa pared.',plan};
  if(isWall(type)&&type!=='door-wall'&&env.player&&
    enclosesPlayer(type,anchor,existing,env.player))
    return {ok:false,message:'Esa pared dejaría al personaje encerrado. Agregá una puerta.',plan};
  return {ok:true,message:'Se puede construir.',plan};
}

export function removalProblem(target:Structure,existing:readonly Structure[]):string|null{
  const remaining=existing.filter(s=>s.id!==target.id);
  for(const structure of remaining){
    if(structure.legacy||!structure.anchor)continue;
    const problem=supportProblem(structure.type,structure.anchor,remaining);
    if(problem)return `${structure.type} depende de esta pieza: ${problem}`;
  }
  return null;
}

export function canReplaceWall(from:BuildType,to:BuildType):boolean{
  return isWall(from)&&isWall(to)&&from!==to;
}

export function wallReplacementProblem(target:Structure,to:BuildType,
  existing:readonly Structure[],player?:BuildEnvironment['player']):string|null{
  if(!target.anchor||target.anchor.kind!=='edge'||!player||to==='door-wall'||
    target.baseY===undefined)return null;
  if(Math.hypot(player.x-target.x,player.z-target.z)<1.1&&
    player.y>=target.baseY-.3&&player.y<target.baseY+BUILD_LEVEL_HEIGHT)
    return 'El personaje está en el espacio de esa pared.';
  if(enclosesPlayer(to,target.anchor,existing.filter(s=>s.id!==target.id),player))
    return 'Esa pared dejaría al personaje encerrado. Conservá una puerta.';
  return null;
}

/** Floors and foundations are walkable; roofs provide an overhead surface. */
export function buildingFloorAt(x:number,z:number,originY:number,
  structures:readonly Structure[]):number|null{
  let best:number|null=null;
  for(const s of structures){
    if(s.legacy||!s.anchor||s.baseY===undefined)continue;
    const surface=isFloor(s.type)?s.baseY+.34:
      (s.type==='roof'||s.type==='roof-section')?s.baseY+BUILD_LEVEL_HEIGHT+.22:null;
    if(surface===null||surface>originY+.01||Math.abs(x-s.x)>1.96||Math.abs(z-s.z)>1.96)continue;
    best=best===null?surface:Math.max(best,surface);
  }
  return best;
}

export function buildingHeadroom(x:number,y:number,z:number,room:number,
  structures:readonly Structure[]):boolean{
  return !structures.some(s=>!s.legacy&&s.anchor?.kind==='roof'&&
    s.baseY!==undefined&&Math.abs(x-s.x)<1.9&&Math.abs(z-s.z)<1.9&&
    y<s.baseY+BUILD_LEVEL_HEIGHT+.28&&y+room>s.baseY+BUILD_LEVEL_HEIGHT-.2);
}

/** Horizontal movement against real wall edges, with a centered doorway gap. */
export function buildingBlocksMove(fromX:number,fromZ:number,nextX:number,nextZ:number,
  feetY:number,structures:readonly Structure[]):boolean{
  for(const s of structures){
    if(s.legacy||s.anchor?.kind!=='edge'||s.baseY===undefined||!isWall(s.type)||
      feetY>s.baseY+BUILD_LEVEL_HEIGHT||feetY+1.7<s.baseY)continue;
    const vertical=(s.anchor.side??0)%2===1;
    const fromSide=vertical?fromX-s.x:fromZ-s.z;
    const nextSide=vertical?nextX-s.x:nextZ-s.z;
    const crossing=fromSide*nextSide<0;
    const t=crossing?fromSide/(fromSide-nextSide):1;
    const along=vertical?fromZ+(nextZ-fromZ)*t-s.z:
      fromX+(nextX-fromX)*t-s.x;
    if(Math.abs(along)>2.2)continue;
    if(s.type==='door-wall'&&Math.abs(along)<.72)continue;
    const before=Math.abs(fromSide),after=Math.abs(nextSide);
    if(crossing||after<.48&&after<before-.001)return true;
  }
  return false;
}
