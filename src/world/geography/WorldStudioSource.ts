import type { GeographicBounds, GeographicSource, GeographicWeights } from './GeographicSource';

type Point={x:number;z:number};
export type StudioTile={id:string;heightFile:string;boundsXZ:GeographicBounds};
export type StudioManifest={schema:string;resolution:number;tileSizeMeters:number;seaLevelMetres:number;
  coordinateSystem:{boundsXZ:GeographicBounds};heightEncoding:{minMetres:number;maxMetres:number;byteOrder:string};
  tiles:StudioTile[];bookmarks:{name:string;x:number;z:number;floating?:string}[]};
export type StudioSpline={id:string;type:string;width:number;resolvedLevels?:boolean;controlPoints:(Point&{y?:number})[]};
export type StudioHydrology={lakes:{id:string;polygonXZ_m:readonly (readonly [number,number])[]}[]};
type Reservation={points:Point[];closed:boolean;width:number;bounds:GeographicBounds};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const overlaps=(a:GeographicBounds,b:GeographicBounds)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const hash=(x:number,z:number,seed:number)=>{
  let n=(Math.imul(x,374761393)+Math.imul(z,668265263)+seed)|0;
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296*2-1;
};
const noise=(x:number,z:number,seed:number)=>{
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,z-iz);
  const a=hash(ix,iz,seed),b=hash(ix+1,iz,seed),c=hash(ix,iz+1,seed),d=hash(ix+1,iz+1,seed);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
};
function distance(x:number,z:number,r:Reservation):number{
  let closest=Infinity,inside=false;
  for(let i=0,j=r.points.length-1;i<r.points.length;j=i++){
    const a=r.points[j],b=r.points[i];
    if(r.closed&&(a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
    if(i===0&&!r.closed)continue;
    const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1));
    closest=Math.min(closest,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  }
  return inside?0:closest;
}
export class GeographicDataUnavailable extends Error {
  constructor(readonly x:number,readonly z:number){super(`Geographic data not loaded at ${x}, ${z}`);}
}

/** Geographic scaffold + bounded deterministic detail. No legacy relief or water
 * carving is applied. R16 data are fetched on demand, at most nine resident tiles.
 */
export class WorldStudioSource implements GeographicSource {
  readonly id='worldstudio-hybrid-v1';readonly streamed=true;
  readonly bounds:GeographicBounds;readonly seaLevel:number;
  readonly maxResidentTiles=9;readonly seed=271828;
  private readonly tiles=new Map<string,Uint16Array>();
  private readonly reservations=new Map<string,Reservation[]>();
  private desired=new Set<string>();private epoch=0;
  private lastLoadMs=0;private totalLoaded=0;
  constructor(readonly manifest:StudioManifest,splines:StudioSpline[],hydrology:StudioHydrology,
    private readonly readTile:(url:string)=>Promise<ArrayBuffer>=async url=>{
      const r=await fetch(url);if(!r.ok)throw new Error(`Heightmap ${r.status}: ${url}`);return r.arrayBuffer();
    },readonly detailEnabled=true){
    if(manifest.schema!=='auralia-worldstudio-trial-v1'||manifest.resolution!==640||manifest.heightEncoding.byteOrder!=='little-endian')throw new Error('Unsupported World Studio scaffold');
    this.bounds=manifest.coordinateSystem.boundsXZ;this.seaLevel=manifest.seaLevelMetres;
    for(const lake of hydrology.lakes)this.reserve(lake.polygonXZ_m.map(([x,z])=>({x,z})),true,40);
    for(const spline of splines){
      const reserve=spline.id.startsWith('reserva-');
      this.reserve(spline.controlPoints,reserve,reserve?32:Math.max(0,spline.width/2)+16);
    }
    // Conservative no-detail disks supplement the authored settlement polygons.
    for(const p of manifest.bookmarks.filter(p=>/Brisalia|Ferragr/i.test(p.name))){
      const points=Array.from({length:24},(_,i)=>({x:p.x+Math.cos(i*Math.PI/12)*140,z:p.z+Math.sin(i*Math.PI/12)*140}));
      this.reserve(points,true,24);
    }
  }
  static async load(detailEnabled=true):Promise<WorldStudioSource>{
    const paths=['manifest.json','splines.json','hidrologia_v3_6.json'];
    const [manifest,splines,hydrology]=await Promise.all(paths.map(async name=>{
      const r=await fetch(`/auralia-preview/data/${name}`);if(!r.ok)throw new Error(`Geography metadata ${r.status}: ${name}`);return r.json();
    }));
    return new WorldStudioSource(manifest,splines,hydrology,undefined,detailEnabled);
  }
  private reserve(points:Point[],closed:boolean,width:number):void{
    if(points.length<2)return;
    const pad=width+48,bounds:GeographicBounds=[Math.min(...points.map(p=>p.x))-pad,Math.min(...points.map(p=>p.z))-pad,Math.max(...points.map(p=>p.x))+pad,Math.max(...points.map(p=>p.z))+pad];
    const r={points,closed,width,bounds};
    for(let z=Math.floor(bounds[1]/256);z<=Math.floor(bounds[3]/256);z++)for(let x=Math.floor(bounds[0]/256);x<=Math.floor(bounds[2]/256);x++){
      const key=`${x}:${z}`,list=this.reservations.get(key)??[];list.push(r);this.reservations.set(key,list);
    }
  }
  private needed(bounds:GeographicBounds):StudioTile[]{return this.manifest.tiles.filter(t=>overlaps(t.boundsXZ,bounds));}
  isReady(bounds:GeographicBounds):boolean{const tiles=this.needed(bounds);return tiles.length>0&&tiles.every(t=>this.tiles.has(t.id));}
  async prepare(bounds:GeographicBounds):Promise<void>{
    const wanted=this.needed(bounds);
    if(!wanted.length)throw new Error('Requested region is outside the scaffold');
    if(wanted.length>this.maxResidentTiles)throw new Error('Geographic window exceeds the nine-sector budget');
    const epoch=++this.epoch,start=performance.now();this.desired=new Set(wanted.map(t=>t.id));
    for(const id of this.tiles.keys())if(!this.desired.has(id))this.tiles.delete(id);
    const jobs=wanted.filter(t=>!this.tiles.has(t.id)),loads=jobs.length;
    const work=async()=>{while(jobs.length&&epoch===this.epoch){
      const tile=jobs.shift()!,bytes=await this.readTile(tile.heightFile);
      if(epoch!==this.epoch)continue;
      if(bytes.byteLength!==this.manifest.resolution**2*2)throw new Error(`Incomplete R16: ${tile.id}`);
      const data=new Uint16Array(bytes.byteLength/2),view=new DataView(bytes);
      for(let i=0;i<data.length;i++)data[i]=view.getUint16(i*2,true);
      this.tiles.set(tile.id,data);this.totalLoaded++;
    }};
    await Promise.all([work(),work()]);if(loads)this.lastLoadMs=performance.now()-start;
  }
  baseHeightAt(x:number,z:number):number{
    x=clamp(x,this.bounds[0],this.bounds[2]);z=clamp(z,this.bounds[1],this.bounds[3]);
    const tile=this.manifest.tiles.find(t=>x>=t.boundsXZ[0]&&x<=t.boundsXZ[2]&&z>=t.boundsXZ[1]&&z<=t.boundsXZ[3]);
    const data=tile&&this.tiles.get(tile.id);if(!tile||!data)throw new GeographicDataUnavailable(x,z);
    const n=this.manifest.resolution,fx=(x-tile.boundsXZ[0])/this.manifest.tileSizeMeters*(n-1),fz=(z-tile.boundsXZ[1])/this.manifest.tileSizeMeters*(n-1);
    const ix=Math.min(n-2,Math.floor(fx)),iz=Math.min(n-2,Math.floor(fz)),u=fx-ix,v=fz-iz;
    const a=data[iz*n+ix],b=data[iz*n+ix+1],c=data[(iz+1)*n+ix],d=data[(iz+1)*n+ix+1];
    const raw=(a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
    return this.manifest.heightEncoding.minMetres+raw/65535*(this.manifest.heightEncoding.maxMetres-this.manifest.heightEncoding.minMetres);
  }
  detailMaskAt(x:number,z:number,base=this.baseHeightAt(x,z)):number{
    let mask=smooth(this.seaLevel+6,this.seaLevel+28,base);
    for(const r of this.reservations.get(`${Math.floor(x/256)}:${Math.floor(z/256)}`)??[]){
      if(x<r.bounds[0]||x>r.bounds[2]||z<r.bounds[1]||z>r.bounds[3])continue;
      mask=Math.min(mask,smooth(r.width,r.width+48,distance(x,z,r)));
      if(mask===0)break;
    }
    return mask;
  }
  heightAt(x:number,z:number):number{
    const base=this.baseHeightAt(x,z);if(!this.detailEnabled)return base;
    const mask=this.detailMaskAt(x,z,base);if(mask===0)return base;
    // Keep authored cliffs. The minimum detail scale is three near-grid steps.
    const d=6,slope=Math.hypot(this.baseHeightAt(x-d,z)-this.baseHeightAt(x+d,z),this.baseHeightAt(x,z-d)-this.baseHeightAt(x,z+d))/(2*d);
    return base+mask*(1-smooth(.65,1.2,slope))*(.9*noise(x/48,z/48,this.seed)+.35*noise(x/18,z/18,this.seed+17));
  }
  weightsAt(_x:number,_z:number,height:number,slope:number):GeographicWeights{
    const rock=smooth(.32,1.2,slope)*.96;
    const sand=(1-smooth(this.seaLevel+1,this.seaLevel+8,height))*(1-rock);
    const soil=.15*(1-rock-sand);return [Math.max(0,1-rock-sand-soil),soil,rock,sand,0,0];
  }
  get stats(){return {residentTiles:this.tiles.size,maxResidentTiles:this.maxResidentTiles,
    heightBytes:[...this.tiles.values()].reduce((sum,t)=>sum+t.byteLength,0),lastLoadMs:this.lastLoadMs,totalLoaded:this.totalLoaded,
    sourceSpacing:this.manifest.tileSizeMeters/(this.manifest.resolution-1),detailAmplitudeBound:1.25};}
  dispose():void{this.epoch++;this.tiles.clear();this.desired.clear();}
}
