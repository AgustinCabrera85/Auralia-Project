import { BRISALIA_PALACE_SITE, PALACE_SCALE, PALACE_APPROACH, palaceSiteHeight, palaceSiteClearance } from '../palace/PalaceSite';
import { BRISALIA_SCALE, brisaliaPlatformWeight } from '../brisaliaLayout';
import { NACAR_PALACE, nacarPalaceHeight, nacarPalaceClearance } from './NacarPalace';
import { WorldStudioSource, type StudioHydrology, type StudioManifest, type StudioSpline } from './WorldStudioSource';
import { GeographicSurface, type GeographicBounds, type GeographicSource } from './GeographicSource';
import type { ActiveWorldGeography } from './ActiveGeography';
import type { WaterSample } from '../geographicFeatures';
import type { FlowSample } from '../water/riverFlow';
import { applyLagoonRelief, CASCADE_LAGOON, lagoonRadius, lagoonWaterAt, lagoonChannelAt, ownsLagoonWater, inLagoonRegion, LAGOON_CHANNELS, LAGOON_FALLS, watershedDistance } from '../lagoonData';
import { StudioRivers } from './StudioRivers';
import { InlandWaterMask } from '../water/InlandWaterMask';
import { settlementRiverBypass } from './SettlementRiverBypass';
import { NacarBathymetry } from './NacarBathymetry';
import { LakeWaterDomain } from './LakeWaterDomain';
import { VOLCANIC_CAVE } from '../volcanicCaveData';
import { caveApproachHeight, caveApproachWeight } from '../cavePortalGeometry';
import { createPlayablePlaces, placeNameAt, regionsFromAtlas, type PlayablePlace, type RegionalAtlas } from './PlayablePlaces';
import { playableMapMarkup } from './PlayableMap';
import { ocasoDesertAt } from './OcasoDesert';
import { regionalVegetationSampler } from './RegionalVegetation';
import { VegetationCorridors, type VegetationRoute } from './VegetationCorridors';
import { SOUTHERN_ISLANDS, southernArchipelagoHeight, southernBeachWeight } from './SouthernArchipelago';
import { southernCoastHeight, southernCoastSand } from './SouthernCoast';

export type RegionFrame={x:number;y:number;z:number;scale:number;waterFloor?:number;streamWater?:boolean};
/** These scaffold routes are replaced end-to-end by the playable watershed,
 * rather than leaving fragments behind at an arbitrary rectangular boundary. */
export const MIGRATED_WATERSHED_RIVERS=['rv-ferragris','rv-velo','rv-gemelas','canal-hidraulico-ferragris','arroyo-ingenieros-ferragris'] as const;
export const RIVER_FEATURE_OVERLAYS={'catarata-alta-altaluz':'rv-cumbres-nacar'} as const;
export const regionPoint=(f:RegionFrame,x:number,z:number)=>({x:f.x+x*f.scale,z:f.z+z*f.scale});
export const regionLocal=(f:RegionFrame,x:number,z:number)=>({x:(x-f.x)/f.scale,z:(z-f.z)/f.scale});
type Lake={id:string;points:readonly (readonly [number,number])[];bounds:GeographicBounds;level:number;domain?:LakeWaterDomain};
const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
function contains(points:readonly (readonly [number,number])[],x:number,z:number):boolean{
  let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
/** World Studio coordinates remain the world coordinate system. Regional frames
 * move existing content; only local settlement/watershed relief is adapted. */
export class PlayableWorld implements GeographicSource,ActiveWorldGeography {
  readonly id='worldstudio-playable-v1';readonly streamed=true;readonly source=this;
  readonly meshSpacing=3;
  readonly town={x:-1250,z:1943};readonly surface=new GeographicSurface(this);
  readonly dock={x:-1217,z:3700};
  readonly palace={...NACAR_PALACE,groundHeight:0};
  readonly brisaliaPalace={...BRISALIA_PALACE_SITE,groundHeight:0};
  get firefly(){return {x:this.dock.x-400,z:this.dock.z+420};}
  readonly lagoon:RegionFrame;
  readonly bounds:GeographicBounds;readonly seaLevel:number;
  private readonly lakes:Lake[]=[];private townHeight=0;
  private readonly riverBasins:LakeWaterDomain[]=[];
  private readonly lowlandLakes:LakeWaterDomain[]=[];
  private rivers!:StudioRivers;
  private nacarBathymetry?:NacarBathymetry;
  oceanExclusion!:InlandWaterMask;
  private riverDomain!:InlandWaterMask;
  runtimeSplines:StudioSpline[]=[];
  readonly windowRadius=2600;
  private places:readonly PlayablePlace[]=[];
  private listedPlaces:readonly PlayablePlace[]=[];
  readonly regions:ReturnType<typeof regionsFromAtlas>;
  readonly vegetationAt:ReturnType<typeof regionalVegetationSampler>;
  private readonly vegetationCorridors=new VegetationCorridors();
  private constructor(readonly scaffold:WorldStudioSource,readonly splines:StudioSpline[],
    readonly hydrology:StudioHydrology,atlas:RegionalAtlas){
    this.bounds=scaffold.bounds;this.seaLevel=scaffold.seaLevel;
    this.regions=regionsFromAtlas(atlas);
    this.vegetationAt=regionalVegetationSampler(this.regions);
    this.vegetationCorridors.add(splines.filter(s=>s.type==='road'&&!s.id.startsWith('reserva-')).map(s=>({width:s.width,points:s.controlPoints})));
    const polygon=hydrology.lakes.find(l=>l.id==='tres-vertientes')!.polygonXZ_m;
    const x=(Math.min(...polygon.map(p=>p[0]))+Math.max(...polygon.map(p=>p[0])))/2;
    const z=(Math.min(...polygon.map(p=>p[1]))+Math.max(...polygon.map(p=>p[1])))/2;
    this.lagoon={x:x-CASCADE_LAGOON.x*2.2,z:z-CASCADE_LAGOON.z*2.2,y:-24,scale:2.2};
  }
  static async load():Promise<PlayableWorld>{
    const [manifest,splines,hydrology,atlas]=await Promise.all(['manifest','splines','hidrologia_v3_6','reinos_v3_7'].map(async name=>{
      const r=await fetch(`/auralia-preview/data/${name}.json`);if(!r.ok)throw new Error(`Geography ${name}: ${r.status}`);return r.json();
    }));
    return this.create(new WorldStudioSource(manifest as StudioManifest,splines,hydrology),splines,hydrology,atlas);
  }
  static async create(scaffold:WorldStudioSource,splines:StudioSpline[],hydrology:StudioHydrology,atlas:RegionalAtlas={}):Promise<PlayableWorld>{
    const world=new PlayableWorld(scaffold,splines,hydrology,atlas);
    for(const lake of hydrology.lakes){
      const points=lake.polygonXZ_m;
      const bounds:GeographicBounds=[Math.min(...points.map(p=>p[0]))-8,Math.min(...points.map(p=>p[1]))-8,
        Math.max(...points.map(p=>p[0]))+8,Math.max(...points.map(p=>p[1]))+8];
      await scaffold.prepare([bounds[0]-528,bounds[1]-528,bounds[2]+528,bounds[3]+528]);
      const heights=points.map(([x,z])=>scaffold.baseHeightAt(x,z)).sort((a,b)=>a-b);
      const level=Math.max(world.seaLevel,Math.round(heights[Math.floor(heights.length/2)]));
      const domain=lake.id==='tres-vertientes'?undefined:new LakeWaterDomain(bounds,level,
        (x,z)=>contains(points,x,z),(x,z)=>scaffold.baseHeightAt(x,z));
      world.lakes.push({id:lake.id,points,bounds,level,domain});
      if(lake.id==='nacar'){
        world.nacarBathymetry=new NacarBathymetry(bounds,level,
          (x,z)=>contains(points,x,z),(x,z)=>scaffold.baseHeightAt(x,z));
        world.palace.groundHeight=scaffold.heightAt(NACAR_PALACE.x,NACAR_PALACE.z);
      }
      if(lake.id==='tres-vertientes')world.lagoon.y=level-CASCADE_LAGOON.level;
    }
    world.lagoon.waterFloor=world.seaLevel-world.lagoon.y;
    world.lagoon.streamWater=true;
    world.runtimeSplines=splines.filter(s=>s.type==='river'&&!(s.id in RIVER_FEATURE_OVERLAYS)&&!MIGRATED_WATERSHED_RIVERS.includes(s.id as typeof MIGRATED_WATERSHED_RIVERS[number])).map(s=>{
      if(s.id==='rv-prado')return settlementRiverBypass(s,world.town);
      if(s.id!=='rv-salida-vertientes')return s;
      const end=LAGOON_CHANNELS[3].at(-1)!,join=regionPoint(world.lagoon,end.x,end.z);
      const tail=s.controlPoints.filter(p=>{const q=regionLocal(world.lagoon,p.x,p.z);return !inLagoonRegion(q.x,q.z)&&p.z>join.z;});
      return {...s,resolvedLevels:true,controlPoints:[{...join,y:world.seaLevel},...tail.map(p=>({...p,y:world.seaLevel}))]};
    });
    world.rivers=new StudioRivers(world.runtimeSplines,world.seaLevel,(x,z)=>world.lakeAt(x,z)?.level??null);
    // The Salida de Vertientes channel crosses a closed lowland basin here.
    // Its authored axis is narrower than the flooded terrain: giving the outer
    // half to the ocean leaves a moving, differently shaded seam through water.
    // Trace the original basin, not the excavated channel (which runs onward).
    const basinSeed:GeographicBounds=[-2160,90,-2100,140];
    await scaffold.prepare([basinSeed[0]-528,basinSeed[1]-528,basinSeed[2]+528,basinSeed[3]+528]);
    const riverBasin=new LakeWaterDomain(basinSeed,world.seaLevel,
      (x,z)=>Math.hypot(x+2130,z-115)<24&&scaffold.baseHeightAt(x,z)<world.seaLevel,
      (x,z)=>scaffold.baseHeightAt(x,z));
    // Never let a bounded inland search truncate an open maritime coast.
    if(riverBasin.stats.boundaryContacts===0)world.riverBasins.push(riverBasin);
    // The neighboring closed lake has an R16 bed, but no authored lake polygon.
    // Register it as inland water so swimming, the surface and underwater optics
    // agree. Ocean fallback alone allows swimming with a dry-looking view.
    const lakeSeed:GeographicBounds=[-2332,76,-2284,124];
    await scaffold.prepare([lakeSeed[0]-528,lakeSeed[1]-528,lakeSeed[2]+528,lakeSeed[3]+528]);
    const lowlandLake=new LakeWaterDomain(lakeSeed,world.seaLevel,
      (x,z)=>Math.hypot(x+2308,z-100)<24&&scaffold.baseHeightAt(x,z)<world.seaLevel,
      (x,z)=>scaffold.baseHeightAt(x,z));
    if(lowlandLake.stats.boundaryContacts===0)world.lowlandLakes.push(lowlandLake);
    const regions:GeographicBounds[]=world.lakes.map(l=>l.domain?.bounds??l.bounds);
    regions.push(...world.riverBasins.map(b=>b.bounds),...world.lowlandLakes.map(b=>b.bounds));
    for(const s of world.runtimeSplines)for(let i=1;i<s.controlPoints.length;i++){
      const a=s.controlPoints[i-1],b=s.controlPoints[i],pad=s.width/2+24;
      regions.push([Math.min(a.x,b.x)-pad,Math.min(a.z,b.z)-pad,Math.max(a.x,b.x)+pad,Math.max(a.z,b.z)+pad]);
    }
    const f=world.lagoon;regions.push([f.x-1040*f.scale,f.z-1890*f.scale,f.x+300*f.scale,f.z-315*f.scale]);
    // Keep the existing river footprint separate: enlarging a lake's ocean
    // exclusion must never widen or lift the river's outer shoulder.
    world.riverDomain=new InlandWaterMask(regions,(x,z)=>world.riverWaterMaskAt(x,z));
    world.oceanExclusion=new InlandWaterMask(regions,(x,z)=>world.waterMaskAt(x,z)||world.ownsLagoon(x,z));
    await world.prepareAround(world.town.x,world.town.z);
    world.townHeight=scaffold.heightAt(world.town.x,world.town.z-23);
    world.brisaliaPalace.groundHeight=scaffold.heightAt(BRISALIA_PALACE_SITE.x,BRISALIA_PALACE_SITE.z-28*PALACE_SCALE)+.6*PALACE_SCALE;
    world.addVegetationRoutes([PALACE_APPROACH]);
    for(let z=world.town.z+200;z<world.town.z+2400;z+=4){
      if(world.heightAt(world.dock.x,z)<world.seaLevel+.4){world.dock.z=z-8;break;}
    }
    world.places=createPlayablePlaces(world.town,world.lagoon,world.dock);
    world.listedPlaces=world.places.filter(p=>!p.hidden);
    return world;
  }
  windowAt(x:number,z:number):GeographicBounds{const r=this.windowRadius;return [x-r,z-r,x+r,z+r];}
  prepareAround(x:number,z:number):Promise<void>{return this.prepare(this.windowAt(x,z));}
  prepare(bounds:GeographicBounds):Promise<void>{return this.scaffold.prepare(bounds);}
  isReady(bounds:GeographicBounds):boolean{return this.scaffold.isReady(bounds);}
  horizonLandmarksAt(x:number,z:number):GeographicBounds[]{
    return SOUTHERN_ISLANDS.filter(i=>Math.hypot(x-i.x,z-i.z)<3100).map(i=>
      [i.x-i.rx*1.18-32,i.z-i.rz*1.18-32,i.x+i.rx*1.18+32,i.z+i.rz*1.18+32]);
  }
  heightAt(x:number,z:number):number{
    let height=southernArchipelagoHeight(x,z,this.scaffold.heightAt(x,z),this.seaLevel);
    height=southernCoastHeight(x,z,height,this.seaLevel);
    const lake=this.lakeAt(x,z);
    if(lake?.id==='nacar')height=this.nacarBathymetry?.heightAt(x,z,height)??height;
    // A compact town platform preserves the metre-scale building grid. It is
    // part of the authoritative height function, never an overlapping ground.
    const townDistance=Math.hypot((x-this.town.x)/1.2,z-this.town.z+20);
    const platform=Math.max(1-smooth(90,155,townDistance),brisaliaPlatformWeight(x-this.town.x,z-this.town.z));
    height+=(this.townHeight-height)*platform;
    height=nacarPalaceHeight(x,z,height,this.palace.groundHeight);
    const p=regionLocal(this.lagoon,x,z);
    if(inLagoonRegion(p.x,p.z))height=applyLagoonRelief(p.x,p.z,height-this.lagoon.y,this.lagoon.waterFloor)+this.lagoon.y;
    if(!ownsLagoonWater(p.x,p.z)&&!lake&&platform===0){
      height=this.rivers.bedAt(x,z,height);
    }
    return palaceSiteHeight(x,z,caveApproachHeight(x,z,height,(gx,gz)=>this.scaffold.heightAt(gx,gz)),this.brisaliaPalace.groundHeight);
  }
  desertAt(x:number,z:number):number{return ocasoDesertAt(x,z);}
  weightsAt(x:number,z:number,height:number,slope:number){
    const raw=this.scaffold.weightsAt(x,z,height,slope);
    const desert=Math.max(this.desertAt(x,z),southernBeachWeight(x,z,height,this.seaLevel),southernCoastSand(x,z));
    // Preserve the physical relief and steep rock; replace fertile ground with sand.
    const base=desert>0?[raw[0]*(1-desert),raw[1]*(1-desert),raw[2],
      raw[3]+desert*(raw[0]+raw[1]),raw[4],raw[5]]:raw;
    const cave=caveApproachWeight(x,z);
    if(cave>0)return [base[0]*(1-cave),base[1]*(1-cave),base[2]*(1-cave)+cave,
      base[3]*(1-cave),base[4]*(1-cave),base[5]*(1-cave)] as const;
    const field=this.waterFieldAt(x,z);
    // Incised upland channels have exposed bedrock. Blend through the wetted
    // bank, retaining sand around lowland lagoons and the open coast.
    const rocky=field?.kind==='stream'?smooth(this.seaLevel+3,this.seaLevel+18,field.level)*
      (1-smooth(field.level-.4,field.level+2.2,height)):0;
    const dry=1-rocky;
    return [base[0]*dry,base[1]*dry+.14*rocky,base[2]*dry+.86*rocky,
      base[3]*dry,base[4]*dry,base[5]*dry] as const;
  }
  waterAt(x:number,z:number):WaterSample|null{
    const field=this.waterFieldAt(x,z);if(!field)return null;
    const depth=field.level-this.surface.heightAt(x,z);
    return depth>0?{...field,edge:Math.min(1,depth/.5)}:null;
  }
  /** OceanWater also fills unnamed lowland pools. Keep their optical waterline
   * separate from inland ownership so recognizing them cannot add a second mesh. */
  oceanLevelAt(x:number,z:number):number|null{
    if(this.oceanExclusion.valueAt(x,z)>.5)return null;
    return this.surface.heightAt(x,z)<this.seaLevel?this.seaLevel:null;
  }
  waterFieldAt(x:number,z:number):WaterSample|null{
    const p=regionLocal(this.lagoon,x,z),local=lagoonWaterAt(p.x,p.z);
    if(local)return {...local,level:Math.max(this.seaLevel,local.level+this.lagoon.y)};
    // Ownership extends under the dry bank. Actual canonical terrain clips
    // the waterline; neither the 8 m ocean mask nor an ellipse clips the shore.
    if(lagoonRadius(p.x,p.z)<1.12)
      return {kind:'lagoon',level:CASCADE_LAGOON.level+this.lagoon.y,distance:0,edge:1};
    const lake=this.lakeAt(x,z);if(lake)return {kind:'lake',level:lake.level,distance:0,edge:1};
    if(!ownsLagoonWater(p.x,p.z)){
      const r=this.rivers.at(x,z);
      // Only the rising inner bank; never flood the lower exterior shoulder.
      // The ocean and inland mesh share this domain at sea-level outlets.
      // Everywhere else the actual bed/shore intersection clips the mesh.
      if(r&&r.distance<r.width+24&&this.riverDomain.valueAt(x,z)>.5)
        return {kind:'stream',level:r.level,distance:r.distance,edge:1};
    }
    // The original polygon is a geographic scaffold, not the actual shore.
    // Outside it, the connected basin and ocean use the exact same grid domain.
    for(const l of this.lakes)if(l.domain&&l.domain.valueAt(x,z)>.5)
      return {kind:'lake',level:l.level,distance:0,edge:1};
    if(this.lowlandLakes.some(b=>b.valueAt(x,z)>.5))
      return {kind:'lake',level:this.seaLevel,distance:0,edge:1};
    if(this.riverBasins.some(b=>b.valueAt(x,z)>.5))
      return {kind:'stream',level:this.seaLevel,distance:0,edge:1};
    return null;
  }
  waterMaskAt(x:number,z:number):boolean{
    return this.lakes.some(l=>l.domain&&l.domain.valueAt(x,z)>.5)||
      this.lowlandLakes.some(b=>b.valueAt(x,z)>.5)||
      this.riverBasins.some(b=>b.valueAt(x,z)>.5)||this.riverWaterMaskAt(x,z);
  }
  private riverWaterMaskAt(x:number,z:number):boolean{
    const p=regionLocal(this.lagoon,x,z);
    if(lagoonRadius(p.x,p.z)<1.12||lagoonWaterAt(p.x,p.z)||this.lakeAt(x,z))return true;
    const r=this.rivers.at(x,z);
    return !!r&&r.distance<r.width+14;
  }
  private lakeAt(x:number,z:number):Lake|null{
    for(const lake of this.lakes){
      if(lake.id==='tres-vertientes')continue; // The migrated playable watershed owns this basin.
      const b=lake.bounds;if(x<b[0]||z<b[1]||x>b[2]||z>b[3])continue;
      if(contains(lake.points,x,z))return lake;
    }
    return null;
  }
  flowAt(x:number,z:number):FlowSample{
    const p=regionLocal(this.lagoon,x,z),c=lagoonChannelAt(p.x,p.z);
    const r=this.rivers.at(x,z);if(!ownsLagoonWater(p.x,p.z)&&r&&r.distance<r.width+14)
      return {directionX:r.dx,directionZ:r.dz,velocity:1.4,turbulence:.15,curvature:0};
    if(this.riverBasins.some(b=>b.valueAt(x,z)>.5))
      return {directionX:0,directionZ:0,velocity:0,turbulence:.02,curvature:0};
    return this.waterAt(x,z)?.kind==='stream'?{directionX:c.dx,directionZ:c.dz,velocity:1.6,turbulence:.2,curvature:0}:
      {directionX:0,directionZ:0,velocity:0,turbulence:.02,curvature:0};
  }
  // All horizontal surfaces use GeographyStream in the migrated world. The
  // native system retains specialised cascades/foam, scenery and gameplay.
  ownsLagoon(_x:number,_z:number):boolean{return false;}
  riverStrips(bounds:GeographicBounds){return this.rivers.strips(bounds);}
  riverLevelAt(x:number,z:number){return this.lakeAt(x,z)?.level??this.rivers.at(x,z)?.level??null;}
  preserveDetail(bounds:GeographicBounds):boolean{
    const entrance=VOLCANIC_CAVE.entrance;
    if(bounds[2]>=entrance.x-26&&bounds[0]<=entrance.x+26&&bounds[3]>=entrance.z-26&&bounds[1]<=entrance.z+36)return true;
    // Static foundations and the raised courtyard retain the same terrain
    // triangles at a distance, so LOD cannot push soil through the stairs.
    const s=BRISALIA_SCALE;
    if(bounds[2]>=this.town.x-128*s&&bounds[0]<=this.town.x+176*s&&
      bounds[3]>=this.town.z-144*s&&bounds[1]<=this.town.z+14*s)return true;
    // Protect water, banks and a two-cell guard. The outer dry shoulder can
    // still use ordinary LOD density; it cannot bridge across the channel.
    if(this.rivers.touches(bounds,26))return true;
    const x=(bounds[0]+bounds[2])/2,z=(bounds[1]+bounds[3])/2,p=regionLocal(this.lagoon,x,z);
    const c=lagoonChannelAt(p.x,p.z),radius=Math.hypot(bounds[2]-bounds[0],bounds[3]-bounds[1])/2;
    const r=lagoonRadius(p.x,p.z),margin=radius/(CASCADE_LAGOON.radiusZ*this.lagoon.scale);
    if(r+margin>.88&&r-margin<1.14)return true;
    return c.distance*this.lagoon.scale<c.width*this.lagoon.scale+26*this.lagoon.scale+radius;
  }
  get waterImpacts(){return LAGOON_FALLS.map(f=>({...regionPoint(this.lagoon,f.x,f.z+f.run),radius:f.width*.64*this.lagoon.scale,strength:1}));}
  waterNear(cx:number,cz:number,size:number):boolean{
    const x=cx*size,z=cz*size,p=regionLocal(this.lagoon,x+size/2,z+size/2);
    return watershedDistance(p.x,p.z)*this.lagoon.scale<size*.72+130||this.rivers.near(x,z,size)||
      this.lakes.some(l=>l.domain?.touches([x,z,x+size,z+size]))||this.riverBasins.some(b=>b.touches([x,z,x+size,z+size]))||
      this.lowlandLakes.some(b=>b.touches([x,z,x+size,z+size]));
  }
  biomeWeights(x:number,z:number){
    const h=this.heightAt(x,z),water=this.waterAt(x,z);
    const coast=1-smooth(this.seaLevel+2,this.seaLevel+28,h),mountain=smooth(60,240,h);
    const forest=(1-mountain)*(1-coast)*(.35+.15*Math.sin(x/750)*Math.cos(z/620));
    const nacar=water?.kind==='lake'?.5:0;
    const w={valle:.7,ecos:forest,sierras:mountain*.7,nacar,cumbres:mountain*.3,costa:coast};
    const sum=Object.values(w).reduce((a,b)=>a+b,0);for(const k of Object.keys(w) as (keyof typeof w)[])w[k]/=sum;
    return w;
  }
  masks(x:number,z:number){
    const water=this.waterAt(x,z);
    const nearTown=Math.hypot(x-this.town.x,z-this.town.z)<145;
    return {lake:water?.kind==='lake'||water?.kind==='lagoon'?1:0,river:water?.kind==='stream'?1:0,
      road:nearTown?.8:0,existingRoadClearance:nearTown?0:1000};
  }
  addVegetationRoutes(routes:readonly VegetationRoute[]):void{this.vegetationCorridors.add(routes);}
  vegetationClearanceAt(x:number,z:number):number{return Math.min(this.vegetationCorridors.clearanceAt(x,z),nacarPalaceClearance(x,z),palaceSiteClearance(x,z));}
  get spawn(){return {x:this.town.x+1,z:this.town.z+10};}
  get destinations(){return this.listedPlaces;}
  destination(id:string){return this.places.find(p=>p.id===id||p.aliases?.includes(id));}
  locationNameAt(x:number,z:number){return placeNameAt(this.places,this.regions,this.town,x,z);}
  mapMarkup(selected?:string):string{return playableMapMarkup(this.destinations,this.regions,this.bounds,selected);}
  get stats(){return {...this.scaffold.stats,worldId:this.id,townHeight:this.townHeight,nacarBathymetry:this.nacarBathymetry?.stats,waterLevels:this.lakes.map(l=>({id:l.id,level:l.level}))};}
  dispose(){this.scaffold.dispose();}
}
