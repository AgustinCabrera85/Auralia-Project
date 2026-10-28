import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, VertexBuffer } from '@babylonjs/core';
import { biomeWeightsAt, chunkKey, desiredChunks, MAINLAND, sampleMainlandHeight, TERRAIN_CONFIG } from './terrainData';
import { riverSample, streamSample, waterSurfaceAt } from './geographicFeatures';

type Tile = {mesh:Mesh;cx:number;cz:number};

/**
 * Streaming circular de mallas de terreno con muestreo determinista.
 * Reutiliza el mismo sampler en la altura del personaje, la costa, las colisiones y el atlas.
 * La decoración rocosa lejana utiliza thin instances; la vegetación vive en VegetationSystem.
 */
export class TerrainStream {
  private readonly tiles=new Map<string,Tile>();
  private readonly material:StandardMaterial;
  private centerKey='';
  private pending:{cx:number;cz:number}[]=[];
  get activeCount():number {return this.tiles.size;}
  get activeCells():{cx:number;cz:number}[]{return [...this.tiles.values()].map(({cx,cz})=>({cx,cz}));}
  constructor(private readonly scene:Scene,private readonly parent:TransformNode){
    this.material=new StandardMaterial('material-terreno-continental',scene);
    this.material.diffuseColor=Color3.White();
    this.material.specularColor=Color3.Black();
  }
  private terrainColor(x:number,z:number,h:number):[number,number,number]{
    const water=waterSurfaceAt(x,z);
    if(water&&h<water.level)return [.29,.43,.43];
    if(h<0.9)return [.65,.69,.59];
    if(h<4.0)return [.78,.73,.52];
    const w=biomeWeightsAt(x,z);
    const colors:Record<keyof typeof w,[number,number,number]>={
      valle:[.43,.68,.40],ecos:[.28,.52,.39],sierras:[.46,.55,.47],
      nacar:[.43,.65,.55],costa:[.68,.67,.49],cumbres:[.53,.60,.58]
    };
    const c:[number,number,number]=[0,0,0];
    for(const key of Object.keys(w) as (keyof typeof w)[]){
      for(let i=0;i<3;i++)c[i]+=w[key]*colors[key][i];
    }
    const rocky=Math.min(1,Math.max(0,(h-38)/25))*(w.sierras+w.cumbres);
    const snow=Math.min(1,Math.max(0,(h-TERRAIN_CONFIG.biomes.snowLine)/20))*w.cumbres;
    for(let i=0;i<3;i++)c[i]=c[i]*(1-rocky)+[.62,.65,.62][i]*rocky;
    for(let i=0;i<3;i++)c[i]=c[i]*(1-snow)+[.88,.91,.91][i]*snow;
    const river=riverSample(x,z),stream=streamSample(x,z);
    const bankDistance=Math.min(river.distance-river.width,stream.distance-stream.width);
    const bank=Math.max(0,1-bankDistance/11);
    if(bank>0)for(let i=0;i<3;i++)c[i]=c[i]*(1-bank*.72)+[.62,.57,.43][i]*bank*.72;
    const variance=.96+.065*Math.sin(x*.15)*Math.cos(z*.11);
    return [c[0]*variance,c[1]*variance,c[2]*variance];
  }
  private createTile(cx:number,cz:number):Tile{
    const size=MAINLAND.chunkSize;
    const subdiv=MAINLAND.terrainSubdivisions;
    const mesh=MeshBuilder.CreateGround(`terreno-chunk-${cx}-${cz}`,{
      width:size,height:size,subdivisions:subdiv,updatable:true
    },this.scene);
    mesh.parent=this.parent;
    mesh.position.set(cx*size+size/2,0,cz*size+size/2);
    const vertices=mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const colors:number[]=[];
    const normals:number[]=[];
    for(let i=0;i<vertices.length;i+=3){
      const worldX=vertices[i]+mesh.position.x;
      const worldZ=vertices[i+2]+mesh.position.z;
      const h=sampleMainlandHeight(worldX,worldZ);
      vertices[i+1]=h;
      const color=this.terrainColor(worldX,worldZ,h);
      colors.push(color[0],color[1],color[2],1);
      // Normales compartidas matemáticamente entre chunks: evitan las costuras de iluminación.
      const eps=.7;
      const nx=sampleMainlandHeight(worldX-eps,worldZ)-sampleMainlandHeight(worldX+eps,worldZ);
      const nz=sampleMainlandHeight(worldX,worldZ-eps)-sampleMainlandHeight(worldX,worldZ+eps);
      const nl=Math.hypot(nx,2*eps,nz);
      normals.push(nx/nl,2*eps/nl,nz/nl);
    }
    mesh.updateVerticesData(VertexBuffer.PositionKind,vertices,true);
    mesh.updateVerticesData(VertexBuffer.NormalKind,normals);
    mesh.setVerticesData(VertexBuffer.ColorKind,colors);
    mesh.useVertexColors=true;
    mesh.material=this.material;
    mesh.isPickable=true;
    mesh.metadata={ terrainChunk:true, cx, cz };
    mesh.freezeWorldMatrix();
    return {mesh,cx,cz};
  }
  update(x:number,z:number):boolean{
    const baseX=Math.floor(x/MAINLAND.chunkSize),baseZ=Math.floor(z/MAINLAND.chunkSize);
    const center=`${baseX}:${baseZ}`;
    let changed=false;
    if(this.centerKey!==center){
      this.centerKey=center;
      const desired=new Set<string>();
      this.pending=[];
      for(const cell of desiredChunks(x,z)){
        const key=chunkKey(cell.cx,cell.cz);
        const midX=(cell.cx+.5)*MAINLAND.chunkSize,midZ=(cell.cz+.5)*MAINLAND.chunkSize;
        // Cull only fully submerged tiles; a midpoint alone can miss a narrow beach.
        const half=MAINLAND.chunkSize/2;
        if(sampleMainlandHeight(midX,midZ)<-24 &&
          [[-half,-half],[-half,half],[half,-half],[half,half]].every(([dx,dz])=>sampleMainlandHeight(midX+dx,midZ+dz)<-24))continue;
        desired.add(key);
        if(!this.tiles.has(key))this.pending.push(cell);
      }
      this.pending.sort((a,b)=>{
        const da=(a.cx+.5-x/MAINLAND.chunkSize)**2+(a.cz+.5-z/MAINLAND.chunkSize)**2;
        const db=(b.cx+.5-x/MAINLAND.chunkSize)**2+(b.cz+.5-z/MAINLAND.chunkSize)**2;
        return da-db;
      });
      for(const [key,tile] of this.tiles){
        if(!desired.has(key)){
          tile.mesh.dispose(false,false);
          this.tiles.delete(key);
          changed=true;
        }
      }
    }
    for(let i=0;i<MAINLAND.chunksPerFrame&&this.pending.length;i++){
      const cell=this.pending.shift()!;
      this.tiles.set(chunkKey(cell.cx,cell.cz),this.createTile(cell.cx,cell.cz));
      changed=true;
    }
    return changed;
  }
  dispose():void{
    for(const chunk of this.tiles.values())chunk.mesh.dispose(false,false);
    this.tiles.clear();
    this.material.dispose();
  }
}
