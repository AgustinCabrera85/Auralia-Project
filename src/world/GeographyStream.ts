import { Color3, Mesh, Scene, StandardMaterial, TransformNode, VertexData } from '@babylonjs/core';
import { chunkKey, MAINLAND, sampleMainlandHeight } from './terrainData';
import { waterNearChunk, waterSurfaceAt } from './geographicFeatures';

type Cell={cx:number;cz:number};

/** Builds only nearby inland water surfaces, on the same cells as TerrainStream. */
export class GeographyStream {
  private readonly meshes=new Map<string,Mesh|null>();
  private pending:Cell[]=[];
  private readonly material:StandardMaterial;

  get activeCount():number{return [...this.meshes.values()].filter(Boolean).length;}

  constructor(private readonly scene:Scene,private readonly parent:TransformNode){
    this.material=new StandardMaterial('agua-interior',scene);
    this.material.diffuseColor=new Color3(.16,.48,.59);
    this.material.emissiveColor=new Color3(.012,.035,.045);
    this.material.specularColor=new Color3(.7,.85,.9);
    this.material.alpha=.74;
    this.material.backFaceCulling=false;
  }

  setActiveChunks(cells:readonly Cell[],x:number,z:number):void{
    const desired=cells.filter(c=>waterNearChunk(c.cx,c.cz,MAINLAND.chunkSize));
    const keys=new Set(desired.map(c=>chunkKey(c.cx,c.cz)));
    for(const [key,mesh] of this.meshes)if(!keys.has(key)){
      mesh?.dispose(false,false);
      this.meshes.delete(key);
    }
    this.pending=desired.filter(c=>!this.meshes.has(chunkKey(c.cx,c.cz)));
    this.pending.sort((a,b)=>{
      const da=(a.cx+.5-x/MAINLAND.chunkSize)**2+(a.cz+.5-z/MAINLAND.chunkSize)**2;
      const db=(b.cx+.5-x/MAINLAND.chunkSize)**2+(b.cz+.5-z/MAINLAND.chunkSize)**2;
      return da-db;
    });
  }

  /** At most one cell and one small 4 m grid per frame. */
  update():void{
    if(!this.pending.length)return;
    const {cx,cz}=this.pending.shift()!;
    this.meshes.set(chunkKey(cx,cz),this.createWater(cx,cz));
  }

  private createWater(cx:number,cz:number):Mesh|null{
    const size=MAINLAND.chunkSize,step=3;
    const positions:number[]=[],normals:number[]=[],colors:number[]=[],indices:number[]=[];
    for(let iz=0;iz<size/step;iz++)for(let ix=0;ix<size/step;ix++){
      const x=cx*size+ix*step,z=cz*size+iz*step;
      const center=waterSurfaceAt(x+step/2,z+step/2);
      if(!center||sampleMainlandHeight(x+step/2,z+step/2)>=center.level-.035)continue;
      const corners:[[number,number],[number,number],[number,number],[number,number]]=[
        [x,z],[x+step,z],[x+step,z+step],[x,z+step]
      ];
      const start=positions.length/3;
      for(const [px,pz] of corners){
        const surface=waterSurfaceAt(px,pz);
        positions.push(px,(surface?.level??center.level)+.025,pz);
        normals.push(0,1,0);
        colors.push(1,1,1,surface?.edge??0);
      }
      indices.push(start,start+1,start+2,start,start+2,start+3);
    }
    if(!indices.length)return null;
    const mesh=new Mesh(`agua-chunk-${cx}-${cz}`,this.scene);
    const data=new VertexData();
    data.positions=positions;data.normals=normals;data.colors=colors;data.indices=indices;
    data.applyToMesh(mesh);
    mesh.parent=this.parent;
    mesh.material=this.material;
    mesh.useVertexColors=true;
    mesh.hasVertexAlpha=true;
    mesh.isPickable=false;
    mesh.checkCollisions=false;
    mesh.metadata={inlandWater:true,cx,cz};
    mesh.freezeWorldMatrix();
    return mesh;
  }

  dispose():void{
    this.pending=[];
    for(const mesh of this.meshes.values())mesh?.dispose(false,false);
    this.meshes.clear();
    this.material.dispose();
  }
}
