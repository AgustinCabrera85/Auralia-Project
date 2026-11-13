import { AbstractMesh, ImportMeshAsync, Matrix, Mesh, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import { ASSET_CATALOG, type AssetDefinition, type AssetId } from '../assetCatalog';
import { AuraliaFoliageWind } from '../AuraliaFoliageWind';
import { configureExpansionV3Material, configureFoliageV4Material } from '../LandscapeAtmosphere';
import { sampleMainlandHeight } from '../terrainData';
import { nearTerrainSurfaceAt, nearTerrainHeightAt } from '../terrainLod';
import { FOLIAGE_FOREST } from '../foliageForestConfig';
import { waterSurfaceAt } from '../geographicFeatures';
import { visualWaterLevel } from '../water/riverFlow';
import { lagoonRadius } from '../lagoonData';
import { getWorldDocument, type PlacedAsset } from './WorldEditState';

const placementVariation=(id:string):number=>{
  let hash=2166136261;
  for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
  return (hash>>>0)/4294967296;
};
type RenderDefinition=Pick<AssetDefinition,'path'|'referenceScale'>&Partial<AssetDefinition>;
const renderDistanceFor=(p:PlacedAsset,catalog:RenderDefinition|undefined):number=>
  p.id.startsWith('lagoon-shore-v1-')?(catalog?.renderDistance??155)+(placementVariation(p.id)-.5)*24:
  p.assetId.startsWith('v3Wetland')&&lagoonRadius(p.x,p.z)<1.6
    ?280:catalog?.renderDistance??1100;

/** Paintable manual assets. Each GLB submesh is loaded once and batched using thin instances.
 * The same component runs in the World Editor and the released game. */
export class AuthoredAssets {
  private readonly sources=new Map<string,Mesh[]>();
  private readonly lodSources=new Map<string,Mesh[]>();
  private readonly inFlight=new Map<string,Promise<void>>();
  private readonly idsByMesh=new Map<string,string[]>();
  private readonly groundBases=new Map<string,readonly [number,number][]>();
  private readonly matrixCache=new Map<string,Float32Array>();
  private readonly terrainGrid=new Map<string,number>();
  private lastFocus={x:Infinity,z:Infinity};
  private dirty=true;
  private wetlandFocus=false;
  private disposed=false;
  private readonly failures=new Set<string>();
  private readonly foliageWind:AuraliaFoliageWind;
  constructor(private readonly scene:Scene,private readonly parent:TransformNode){
    this.foliageWind=new AuraliaFoliageWind(scene);
  }

  get drawnCount():number{return [...this.idsByMesh.values()].reduce((n,ids)=>n+ids.length,0);}
  get v4DrawnCount():number{
    return new Set([...this.idsByMesh.entries()].filter(([name])=>
      name.startsWith('auralia-authored-v4')).flatMap(([,ids])=>ids)).size;
  }
  get v4LodCount():number{
    return new Set([...this.idsByMesh.entries()].filter(([name])=>
      name.startsWith('auralia-authored-v4')&&name.includes('-lod-'))
      .flatMap(([,ids])=>ids)).size;
  }
  get windMaterialCount():number{return this.foliageWind.materialCount;}
  get errors():readonly string[]{return [...this.failures];}

  private async importParts(id:string,path:string,lod=false):Promise<Mesh[]>{
    const result=await ImportMeshAsync(path,this.scene);
    const meshes=result.meshes.filter((m:AbstractMesh):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
    if(this.disposed){for(const mesh of result.meshes)mesh.dispose(false,false);return [];}
    if(!meshes.length)throw new Error(`GLB sin geometría: ${path}`);
    for(const [i,mesh] of meshes.entries()){
      mesh.computeWorldMatrix(true);
      mesh.bakeTransformIntoVertices(mesh.getWorldMatrix().clone());
      if(id==='packRocas'||id==='rocasRectangulares'){
        mesh.refreshBoundingInfo(true);
        const bb=mesh.getBoundingInfo().boundingBox;
        mesh.bakeTransformIntoVertices(Matrix.Translation(
          -(bb.minimum.x+bb.maximum.x)*.5,-bb.minimum.y,
          -(bb.minimum.z+bb.maximum.z)*.5));
      }
      mesh.parent=null;mesh.position.setAll(0);mesh.scaling.setAll(1);
      mesh.rotation.setAll(0);mesh.rotationQuaternion=null;
      mesh.parent=this.parent;
      mesh.name=`auralia-authored-${id}-${lod?'lod-':''}${i}`;
      mesh.isVisible=false;mesh.isPickable=true;
      mesh.thinInstanceEnablePicking=true;
      mesh.checkCollisions=false;
      mesh.metadata={authoredAsset:id,partIndex:i,lod};
      if(id.startsWith('v4'))configureFoliageV4Material(mesh.material);
      if(id.startsWith('v3'))configureExpansionV3Material(mesh.material);
    }
    for(const mesh of result.meshes)if(!meshes.includes(mesh as Mesh))mesh.dispose(false,false);
    if(!lod&&(/^v4(Grass|Meadow|Ground|Flower)/.test(id)||
      id.startsWith('v3Wetland')&&!/Lily|Camalote|Duckweed/.test(id))){
      const vertices:number[]=[];
      for(const mesh of meshes){
        const positions=mesh.getVerticesData('position')??[];
        for(const value of positions)vertices.push(value);
      }
      let bottom=Infinity;
      for(let i=1;i<vertices.length;i+=3)bottom=Math.min(bottom,vertices[i]);
      const directions:[[number,number],...Array<[number,number]>]=[
        [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
      const bases: [number,number][]=directions.map(([dx,dz])=>{
        let best=-Infinity,point:[number,number]=[0,0];
        for(let i=0;i<vertices.length;i+=3){
          if(vertices[i+1]>bottom+.03)continue;
          const score=vertices[i]*dx+vertices[i+2]*dz;
          if(score>best){best=score;point=[vertices[i],vertices[i+2]];}
        }
        return point;
      });
      this.groundBases.set(id,bases);
    }
    this.foliageWind.register(meshes,id);
    return meshes;
  }

  private async ensure(id:string):Promise<void>{
    if(this.sources.has(id)||this.inFlight.has(id)||this.disposed)return;
    const entry:RenderDefinition | undefined=Object.prototype.hasOwnProperty.call(ASSET_CATALOG,id)
      ?ASSET_CATALOG[id as AssetId]:getWorldDocument().models.find(model=>model.id===id);
    if(!entry)return;
    const asset=entry;
    if(asset.instantiation==='individual')return; // Resources require individual gameplay state.
    const promise=(async()=>{
      try{
        const meshes=await this.importParts(id,asset.path);
        if(this.disposed)return;
        this.sources.set(id,meshes);
        this.matrixCache.clear();
        if(asset.lodPath){
          try{
            const lod=await this.importParts(id,asset.lodPath,true);
            if(!this.disposed)this.lodSources.set(id,lod);
          }catch(e){
            this.failures.add(`${id} LOD: ${e instanceof Error?e.message:String(e)}`);
            console.warn('[Auralia WorldEditor] LOD no disponible:',id,e);
          }
        }
      }catch(e){
        this.failures.add(`${id}: ${e instanceof Error?e.message:String(e)}`);
        console.warn('[Auralia WorldEditor] Asset no disponible:',id,e);
      }finally{
        this.inFlight.delete(id);
        this.dirty=true;
      }
    })();
    this.inFlight.set(id,promise);
    await promise;
  }

  async sync(x=this.lastFocus.x,z=this.lastFocus.z):Promise<void>{
    const names=[...new Set(getWorldDocument().assets.filter(p=>{
      const catalog:AssetDefinition|undefined=Object.prototype.hasOwnProperty.call(ASSET_CATALOG,p.assetId)
        ?ASSET_CATALOG[p.assetId as AssetId]:undefined;
      const distantGround=/^v4(Grass|Meadow)/.test(p.assetId);
      return Math.hypot(p.x-x,p.z-z)<renderDistanceFor(p,catalog)+(distantGround?20:0);
    }).map(p=>p.assetId))];
    await Promise.all(names.map(id=>this.ensure(id)));
  }
  markDirty():void{this.dirty=true;this.matrixCache.clear();this.terrainGrid.clear();}

  private heightAtGrid=(x:number,z:number):number=>{
    const key=`${x}:${z}`;
    let height=this.terrainGrid.get(key);
    if(height===undefined){height=sampleMainlandHeight(x,z);this.terrainGrid.set(key,height);}
    return height;
  };

  private placementMatrix(id:string,p:PlacedAsset,catalog:RenderDefinition|undefined):Float32Array{
    const cached=this.matrixCache.get(p.id);
    if(cached)return cached;
    const base=(catalog?.referenceScale??1)*p.scale;
    const spread=catalog?.horizontalScale??1;
    const water=catalog?.surface==='water'?waterSurfaceAt(p.x,p.z):null;
    const surface=!water&&(id.startsWith('v4')||id.startsWith('v3'))
      ?nearTerrainSurfaceAt(p.x,p.z,this.heightAtGrid):null;
    // Floating flora follows the water plane, while rooted plants fit rendered terrain.
    const height=water?visualWaterLevel(p.x,p.z,water):
      surface?.height??sampleMainlandHeight(p.x,p.z);
    const matrix=Matrix.Compose(new Vector3(base*spread,base,base*spread),
      Quaternion.RotationAxis(Vector3.Up(),p.yaw),
      new Vector3(p.x,height+p.yOffset,p.z));
    const transform=Float32Array.from(matrix.m);
    const bases=this.groundBases.get(id);
    if(surface&&bases?.length){
      transform[1]=surface.slopeX*transform[0]+surface.slopeZ*transform[2];
      transform[9]=surface.slopeX*transform[8]+surface.slopeZ*transform[10];
      let maxGap=0;
      for(const [bx,bz] of bases){
        const dx=transform[0]*bx+transform[8]*bz;
        const dz=transform[2]*bx+transform[10]*bz;
        const plane=surface.height+surface.slopeX*dx+surface.slopeZ*dz;
        maxGap=Math.max(maxGap,plane-nearTerrainHeightAt(p.x+dx,p.z+dz,this.heightAtGrid));
      }
      transform[13]-=maxGap+.02;
    }
    this.matrixCache.set(p.id,transform);
    return transform;
  }

  update(x:number,z:number):void{
    if(this.disposed)return;
    const moved=Math.hypot(x-this.lastFocus.x,z-this.lastFocus.z);
    if(!this.dirty&&moved<(this.wetlandFocus?8:Math.hypot(x-FOLIAGE_FOREST.x,z-FOLIAGE_FOREST.z)<400?10:36))return;
    this.dirty=false;this.lastFocus={x,z};
    const placements=getWorldDocument().assets;
    this.wetlandFocus=placements.some(p=>p.id.startsWith('lagoon-shore-v1-')&&Math.hypot(p.x-x,p.z-z)<200);
    void this.sync(x,z);
    this.idsByMesh.clear();
    for(const [id,parts] of this.sources){
      const catalog:RenderDefinition|undefined=Object.prototype.hasOwnProperty.call(ASSET_CATALOG,id)?
        ASSET_CATALOG[id as AssetId]:getWorldDocument().models.find(m=>m.id===id);
      const distantGround=/^v4(Grass|Meadow)/.test(id);
      const nearby=placements.filter(p=>p.assetId===id&&
        Math.hypot(p.x-x,p.z-z)<renderDistanceFor(p,catalog)+
          (distantGround?(placementVariation(p.id)-.5)*40:0));
      const lodParts=this.lodSources.get(id);
      const lodDistance=lodParts?catalog?.lodDistance:undefined;
      const nearLimit=(p:PlacedAsset):number=>(lodDistance??Infinity)+
        (distantGround?(placementVariation(p.id)-.5)*32:p.id.startsWith('lagoon-shore-v1-')?(placementVariation(p.id)-.5)*12:0);
      const near=lodDistance===undefined?nearby:nearby.filter(p=>Math.hypot(p.x-x,p.z-z)<nearLimit(p));
      const far=lodDistance===undefined?[]:nearby.filter(p=>Math.hypot(p.x-x,p.z-z)>=nearLimit(p));
      const fill=(batch:Mesh[],items:PlacedAsset[]):void=>{
        for(const [index,part] of batch.entries()){
          const selected=(id==='packRocas'||id==='rocasRectangulares')
            ?items.filter(p=>(p.partIndex??0)===index):items;
          const data=new Float32Array(selected.length*16);
          for(const [i,p] of selected.entries())data.set(this.placementMatrix(id,p,catalog),i*16);
          part.thinInstanceSetBuffer('matrix',selected.length?data:null,16,true);
          part.isVisible=selected.length>0;
          if(selected.length)part.thinInstanceRefreshBoundingInfo();
          this.idsByMesh.set(part.name,selected.map(p=>p.id));
        }
      };
      fill(parts,near);
      if(lodParts)fill(lodParts,far);
    }
  }
  idFromPick(mesh:Mesh,thinInstanceIndex:number):string|null{
    if(thinInstanceIndex<0)return null;
    return this.idsByMesh.get(mesh.name)?.[thinInstanceIndex]??null;
  }
  /** Useful for a selection marker and in-editor property panels. */
  find(id:string):PlacedAsset|undefined{return getWorldDocument().assets.find(p=>p.id===id);}
  dispose():void{
    this.disposed=true;
    this.foliageWind.dispose();
    for(const parts of this.sources.values())for(const mesh of parts)mesh.dispose(false,false);
    for(const parts of this.lodSources.values())for(const mesh of parts)mesh.dispose(false,false);
    this.sources.clear();this.lodSources.clear();this.inFlight.clear();this.idsByMesh.clear();
    this.groundBases.clear();this.matrixCache.clear();this.terrainGrid.clear();
  }
}
