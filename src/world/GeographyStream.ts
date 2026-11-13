import { Mesh, Scene, ShaderMaterial, TransformNode, Vector4, VertexData } from '@babylonjs/core';
import { dryWaterHeight, sampleRiverFlow, visualWaterLevel, visualWaterSurfaceAt } from './water/riverFlow';
import { loadWaterMasks } from './editor/AuraliaWaterProfiles';
import { createWorldWaterMaterial, updateWorldWaterMaterial } from './editor/LiveWaterProfiles';
import { WaterfallSurface } from './water/WaterfallSurface';
import { waterfallCutContainsCell, waterfallCutTouchesChunk, waterfallGroundAt } from './water/WaterfallGeometry';
import { chunkKey, MAINLAND, sampleMainlandHeight } from './terrainData';
import { getWorldDocument } from './editor/WorldEditState';
import { nearTerrainHeightAt } from './terrainLod';
import { riverSample, streamSample, waterNearChunk, waterSurfaceAt } from './geographicFeatures';
import { lagoonWaterAt, ownsLagoonWater, LAGOON_FALLS } from './lagoonData';
import { activeGeography } from './geography/ActiveGeography';
import { CLEAR_RIVER_PROFILE } from './water/RiverProfile';
import { clippedWaterSurface } from './water/ClippedWaterSurface';
const ownsWater=(x:number,z:number)=>activeGeography()?.ownsLagoon(x,z)??ownsLagoonWater(x,z);

type Cell={cx:number;cz:number};
type WaterJob=Cell&{lod:'near'|'far'};
const FAR_WATER_RADIUS=1250;
const WATER_BUILD_BUDGET_MS=4;

/** Streams detailed nearby water and coarse distant water on the same 72 m cells. */
export class GeographyStream {
  private readonly meshes=new Map<string,Mesh|null>();
  private readonly farMeshes=new Map<string,Mesh|null>();
  private pending:WaterJob[]=[];
  private activeBuild:{job:WaterJob;steps:Generator<void,Mesh|null,void>}|null=null;
  private readonly material:ShaderMaterial;
  private readonly poolMaterial:ShaderMaterial;
  private readonly waterMasks:ReturnType<typeof loadWaterMasks>;
  private waterfall:WaterfallSurface|null=null;
  // AURALIA_WATER_JOIN_V5: replaced only when a linked v4 cascade is authored.
  private usesAuthoredFall():boolean {
    return getWorldDocument().water.some(w=>w.profile==='fall'&&w.joinToLegacyRiver===true);
  }
  private time=0;
  private readonly impacts=LAGOON_FALLS.map(f=>new Vector4(f.x,f.z+f.run,f.width*.5,1));
  private readonly impactEnabled:boolean;

  get activeCount():number{return [...this.meshes.values()].filter(Boolean).length;}
  get farActiveCount():number{return [...this.farMeshes.values()].filter(Boolean).length;}

  constructor(private readonly scene:Scene,private readonly parent:TransformNode){
    const impacts=activeGeography()?.waterImpacts;
    this.impactEnabled=!activeGeography()||!!impacts?.length;
    if(impacts)for(let i=0;i<this.impacts.length;i++){
      const p=impacts[i];this.impacts[i].set(p?.x??0,p?.z??0,p?.radius??0,p?.strength??0);
    }
    this.waterMasks=loadWaterMasks(scene);
    this.material=createWorldWaterMaterial(scene,'river',this.waterMasks,activeGeography()?{
      ...CLEAR_RIVER_PROFILE,uDeepColor:'#214d50',uShallowColor:'#6a9b90'}:{});
    this.poolMaterial=createWorldWaterMaterial(scene,'pool',this.waterMasks,activeGeography()?{uClearWater:1,uWaveAmp:.28,
      uWaveSpeed:1.1,uNormalStrength:.9,uCaustics:.4,uDeepColor:'#103f46',uShallowColor:'#4b9987',
      uFoamIntensity:.85,uFoamWidth:2.1,uFoamBreakup:.65,uContactFoam:.85,
      uImpactWidth:5.5,uImpactFoam:1.2,uImpactRipples:1,uImpactTurbulence:1.1}:{});
  }

  setActiveChunks(cells:readonly Cell[],x:number,z:number):void{
    const size=MAINLAND.chunkSize;
    const hasWater=(cx:number,cz:number):boolean=>
      waterNearChunk(cx,cz,size)||(!activeGeography()&&
        cz*size<=-1060&&(cz+1)*size>=-1800&&
        // The upper visual bank can extend to the valley wall, so retain
        // chunks whose corners may contain that bank even if the center is dry.
        riverSample((cx+.5)*size,(cz+.5)*size).distance<90+size*.72);
    const desired=cells.filter(c=>hasWater(c.cx,c.cz));
    const nearKeys=new Set(desired.map(c=>chunkKey(c.cx,c.cz)));
    const far:Cell[]=[];
    const farKeys=new Set<string>();
    const centerX=Math.floor(x/size),centerZ=Math.floor(z/size);
    const reach=Math.ceil(FAR_WATER_RADIUS/size)+1;
    for(let cz=centerZ-reach;cz<=centerZ+reach;cz++)for(let cx=centerX-reach;cx<=centerX+reach;cx++){
      const key=chunkKey(cx,cz);
      if(nearKeys.has(key))continue;
      const dx=Math.max(0,Math.abs((cx+.5)*size-x)-size/2);
      const dz=Math.max(0,Math.abs((cz+.5)*size-z)-size/2);
      if(Math.hypot(dx,dz)>FAR_WATER_RADIUS||!hasWater(cx,cz))continue;
      far.push({cx,cz});farKeys.add(key);
    }
    const waterfallVisible=!activeGeography()&&[...desired,...far].some(cell=>
      waterfallCutTouchesChunk(cell.cx,cell.cz,size));
    if(waterfallVisible&&!this.waterfall&&!this.usesAuthoredFall())
      this.waterfall=new WaterfallSurface(this.scene,this.parent,this.waterMasks);
    else if((!waterfallVisible||this.usesAuthoredFall())&&this.waterfall){
      this.waterfall.dispose();
      this.waterfall=null;
    }
    for(const [key,mesh] of this.meshes)if(!nearKeys.has(key)&&(!farKeys.has(key)||this.farMeshes.has(key))){
      mesh?.dispose(false,false);
      this.meshes.delete(key);
    }
    for(const [key,mesh] of this.farMeshes)if(!farKeys.has(key)&&(!nearKeys.has(key)||this.meshes.has(key))){
      mesh?.dispose(false,false);
      this.farMeshes.delete(key);
    }
    this.pending=[
      ...desired.filter(c=>!this.meshes.has(chunkKey(c.cx,c.cz))).map(c=>({...c,lod:'near' as const})),
      ...far.filter(c=>!this.farMeshes.has(chunkKey(c.cx,c.cz))).map(c=>({...c,lod:'far' as const}))
    ];
    this.pending.sort((a,b)=>{
      if(a.lod!==b.lod)return a.lod==='near'?-1:1;
      const da=(a.cx+.5-x/size)**2+(a.cz+.5-z/size)**2;
      const db=(b.cx+.5-x/size)**2+(b.cz+.5-z/size)**2;
      return da-db;
    });
    if(this.activeBuild){
      const job=this.activeBuild.job;
      const index=this.pending.findIndex(c=>c.cx===job.cx&&c.cz===job.cz&&c.lod===job.lod);
      if(index>=0)this.pending.splice(index,1);
      else this.cancelBuild();
    }
  }

  /** Build water cooperatively; retain the previous LOD until its replacement is complete. */
  update(dt=1/60):void{
    if(this.usesAuthoredFall()&&this.waterfall){
      this.waterfall.dispose();this.waterfall=null;
    }
    this.time+=Math.min(.10,Math.max(0,dt));
    updateWorldWaterMaterial(this.material,'river',this.scene,this.time);
    updateWorldWaterMaterial(this.poolMaterial,'pool',this.scene,this.time,{impactEnabled:this.impactEnabled,
      impactA:this.impacts[0],impactB:this.impacts[1]});
    this.poolMaterial.setVector4('uImpactC',this.impacts[2]);
    this.waterfall?.update(this.time);
    const deadline=performance.now()+WATER_BUILD_BUDGET_MS;
    let completed=0;
    while((this.activeBuild||this.pending.length)&&completed<2){
      if(!this.activeBuild){
        const job=this.pending.shift()!;
        this.activeBuild={job,steps:this.createWater(job.cx,job.cz,activeGeography()?(job.lod==='near'?3:12):(job.lod==='near'?1.5:3),job.lod)};
      }
      const {job,steps}=this.activeBuild;
      const result=steps.next();
      if(!result.done){
        if(performance.now()>=deadline)break;
        continue;
      }
      this.activeBuild=null;
      completed++;
      const {cx,cz,lod}=job;
      const key=chunkKey(cx,cz);
      const target=lod==='near'?this.meshes:this.farMeshes;
      const previous=lod==='near'?this.farMeshes:this.meshes;
      const mesh=result.value;
      if(!mesh&&previous.get(key)){
        target.set(key,previous.get(key)!);
        previous.delete(key);
      }else{
        target.set(key,mesh);
        if(previous.has(key)){
          previous.get(key)?.dispose(false,false);
          previous.delete(key);
        }
      }
      if(lod==='near'||performance.now()>=deadline)break;
    }
  }

  private cancelBuild():void{
    this.activeBuild?.steps.return(null);
    this.activeBuild=null;
  }

  private *createWater(cx:number,cz:number,step:number,lod:'near'|'far'):Generator<void,Mesh|null,void>{
    const active=activeGeography();
    if(active?.waterFieldAt)return yield* clippedWaterSurface(this.scene,this.parent,active,cx,cz,lod,this.material,this.poolMaterial);
    const size=MAINLAND.chunkSize;
    const positions:number[]=[],normals:number[]=[],colors:number[]=[],uvs:number[]=[],uv2:number[]=[],indices:number[]=[];
    let poolQuads=0,riverQuads=0;
    const terrainGrid=new Map<string,number>();
    const terrainAtGrid=(x:number,z:number):number=>{
      const key=`${x}:${z}`;
      let height=terrainGrid.get(key);
      if(height===undefined){height=sampleMainlandHeight(x,z);terrainGrid.set(key,height);}
      return height;
    };
    const cornerCache=new Map<string,{
      surface:ReturnType<typeof waterSurfaceAt>;ground:number;renderedGround:number
    }>();
    const cornerAt=(ix:number,iz:number)=>{
      const key=`${ix}:${iz}`;
      let point=cornerCache.get(key);
      if(!point){
        const px=cx*size+ix*step,pz=cz*size+iz*step;
        const renderedGround=nearTerrainHeightAt(px,pz,terrainAtGrid);
        const ground=activeGeography()?renderedGround:Math.max(waterfallGroundAt(px,pz),renderedGround);
        let surface=ownsWater(px,pz)?null:visualWaterSurfaceAt(px,pz,ground);
        point={surface,ground,renderedGround};
        cornerCache.set(key,point);
      }
      return point;
    };
    const emitQuad=(ix:number,iz:number,scale:number):void=>{
      const x=cx*size+ix*step,z=cz*size+iz*step;
      if(ownsWater(x+step*scale*.5,z+step*scale*.5))return;
      if(!activeGeography()&&waterfallCutContainsCell(x,z,step*scale))return;
      const corners:[[number,number],[number,number],[number,number],[number,number]]=[
        [ix,iz],[ix+scale,iz],[ix+scale,iz+scale],[ix,iz+scale]
      ];
      const wetCorner=corners.map(([gx,gz])=>cornerAt(gx,gz))
        .find(point=>point.surface&&point.ground<point.surface.level-.035);
      if(!wetCorner)return;
      const reference=wetCorner.surface!;
      if(reference.kind==='lake'||reference.kind==='lagoon')poolQuads++;else riverQuads++;
      const start=positions.length/3;
      for(const [gx,gz] of corners){
        const px=cx*size+gx*step,pz=cz*size+gz*step;
        const {surface:sampled,ground,renderedGround}=cornerAt(gx,gz);
        const surface=sampled??reference;
        const level=visualWaterLevel(px,pz,surface);
        const depth=Math.max(0,level-ground);
        const wet=sampled&&depth>.035;
        const flow=sampleRiverFlow(px,pz,surface.kind);
        // Only the exposed terrain defines the visual bank. Route/lake edges
        // can meet inside water, so clipping at those edges creates zigzags.
        const shore=wet?1-Math.min(1,depth/.5):1;
        // A dry corner always uses its terrain height, regardless of which
        // adjacent water quad emitted it. This closes seams at route bends.
        // Keep dry water vertices below both the waterline and the actual
        // terrain triangle. Otherwise they climb the bank into blue spikes.
        const dryLevel=activeGeography()||lagoonWaterAt(px,pz)?level:surface.kind==='river'?Math.min(level,riverSample(px,pz).level):
          surface.kind==='stream'?Math.min(level,streamSample(px,pz).level):level;
        positions.push(px,wet?level+.035:dryWaterHeight(ground,renderedGround,dryLevel),pz);
        normals.push(0,1,0);
        uvs.push(px/16,pz/16);
        uv2.push(flow.directionX,flow.directionZ);
        // shore, speed, turbulence, depth (alpha channel stores depth, not opacity)
        colors.push(shore,Math.min(1,flow.velocity/4),flow.turbulence,
          wet?Math.min(1,depth/5):0);
      }
      // Use the same diagonal as the terrain mesh beneath each water quad.
      indices.push(start,start+1,start+3,start+1,start+2,start+3);
    };
    for(let iz=0;iz<size/step;iz++)for(let ix=0;ix<size/step;ix++){
      yield;
      if(ownsWater(cx*size+(ix+.5)*step,cz*size+(iz+.5)*step))continue;
      if(!activeGeography()&&waterfallCutContainsCell(cx*size+ix*step,cz*size+iz*step,step))continue;
      const points=[cornerAt(ix,iz),cornerAt(ix+1,iz),cornerAt(ix+1,iz+1),cornerAt(ix,iz+1)];
      const x=cx*size+(ix+.5)*step,z=cz*size+(iz+.5)*step;
      const wetPoint=points.find(point=>point.surface&&point.ground<point.surface.level-.035);
      if(!wetPoint)continue;
      const shoreCell=points.some(point=>
        !point.surface||point.ground>point.surface.level-.9);
      const levels=points.filter(point=>point.surface).map(point=>point.surface!.level);
      const levelSpread=levels.length?Math.max(...levels)-Math.min(...levels):0;
      const bend=sampleRiverFlow(x,z,wetPoint.surface!.kind).curvature>.06;
      const fallCell=levelSpread>step*.45;
      // Match the near mesh's edge spacing where LOD chunks touch. Refine
      // only the perimeter and banks; the far interior stays at 3 m.
      const edgeCell=ix===0||iz===0||ix===size/step-1||iz===size/step-1;
      const parts=lod==='near'?(fallCell?6:bend?3:shoreCell?2:1):
        edgeCell?(fallCell?12:bend?6:shoreCell?4:2):fallCell?3:1;
      for(let sz=0;sz<parts;sz++)for(let sx=0;sx<parts;sx++)
        emitQuad(ix+sx/parts,iz+sz/parts,1/parts);
    }
    if(!indices.length)return null;
    yield;
    // Blend geometric normals at coincident quad corners. The waterfall is
    // steep, and lighting every face as a horizontal river made its drop look
    // like stacked flat tiles even after adding vertices.
    VertexData.ComputeNormals(positions,indices,normals);
    const summed=new Map<string,[number,number,number]>();
    for(let i=0;i<positions.length;i+=3){
      if(i%768===0)yield;
      const key=`${Math.round(positions[i]*1000)}:${Math.round(positions[i+2]*1000)}`;
      const sum=summed.get(key)??[0,0,0];
      sum[0]+=normals[i];sum[1]+=normals[i+1];sum[2]+=normals[i+2];
      summed.set(key,sum);
    }
    for(let i=0;i<positions.length;i+=3){
      if(i%768===0)yield;
      const sum=summed.get(`${Math.round(positions[i]*1000)}:${Math.round(positions[i+2]*1000)}`)!;
      const length=Math.max(1e-5,Math.hypot(...sum));
      normals[i]=sum[0]/length;normals[i+1]=sum[1]/length;normals[i+2]=sum[2]/length;
    }
    yield;
    const mesh=new Mesh(`${lod==='near'?'agua-chunk':'agua-far-chunk'}-${cx}-${cz}`,this.scene);
    const data=new VertexData();
    data.positions=positions;data.normals=normals;data.uvs=uvs;data.uvs2=uv2;data.colors=colors;data.indices=indices;
    data.applyToMesh(mesh);
    mesh.parent=this.parent;
    mesh.material=poolQuads>riverQuads?this.poolMaterial:this.material;
    mesh.useVertexColors=true;
    mesh.hasVertexAlpha=false; // color.a holds normalized water depth
    mesh.isPickable=false;
    mesh.checkCollisions=false;
    mesh.metadata={inlandWater:true,waterLod:lod,cx,cz};
    mesh.freezeWorldMatrix();
    return mesh;
  }

  dispose():void{
    this.pending=[];
    this.cancelBuild();
    this.waterfall?.dispose();
    this.waterfall=null;
    for(const mesh of this.meshes.values())mesh?.dispose(false,false);
    this.meshes.clear();
    for(const mesh of this.farMeshes.values())mesh?.dispose(false,false);
    this.farMeshes.clear();
    this.material.dispose(false,false);
    this.poolMaterial.dispose(false,false);
    this.waterMasks.caustics.dispose();
    this.waterMasks.waterfall.dispose();
  }
}
