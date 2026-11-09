import { Color3, Color4, DynamicTexture, Mesh, MeshBuilder, ParticleSystem, PointLight,
  Scene, ShaderMaterial, StandardMaterial, Texture, TransformNode, Vector3, Vector4, VertexData } from '@babylonjs/core';
import { CASCADE_LAGOON, GROTTO_LINKS, GROTTO_NODES, GROTTO_PORTALS, GROTTO_WATER,
  grottoRoomFloor, grottoSegment, grottoSurfaceAt, grottoJointNormal, grottoRoof, lagoonRadius, lagoonChannelAt, watershedDistance, LAGOON_CHANNELS, LAGOON_FALLS, LAGOON_SPRINGS } from './lagoonData';
import { createWorldWaterMaterial, updateWorldWaterMaterial } from './editor/LiveWaterProfiles';
import { loadWaterMasks } from './editor/AuraliaWaterProfiles';
import { LagoonRockMaterial } from './materials/LagoonRockMaterial';
import { RockColliderSystem } from './RockColliderSystem';
import { HEADWATER_LAKE, headwaterLakeRadius } from './watershedHeadwaters';
import { WatershedHydrology } from './WatershedHydrology';
import type { ClimateFrame } from './climate/ClimateModel';
import { createCascadeBedGeometry, createCascadeGeometry } from './water/CascadeGeometry';

/** Local scenery is streamed as a unit; plants use AuthoredAssets' shared GLB batches.
 * This watershed owns its continuous water surfaces. No rigid-body fluid particles. */
export class LagoonSystem {
  readonly hydrology=new WatershedHydrology();
  readonly rockColliders=new RockColliderSystem(()=>undefined);
  private exterior:TransformNode|null=null;
  private interior:TransformNode|null=null;
  private readonly stone:StandardMaterial;
  private readonly wetStone:StandardMaterial;
  private readonly floor:StandardMaterial;
  private readonly glow:StandardMaterial;
  private readonly fall:ShaderMaterial;
  private readonly pool:ShaderMaterial;
  private readonly river:ShaderMaterial;
  private riverBuild:Generator<void,void,void>|null=null;
  private readonly masks:ReturnType<typeof loadWaterMasks>;
  private readonly mistTexture:DynamicTexture;
  private readonly mist:ParticleSystem[]=[];
  private bubbles:ParticleSystem|null=null;
  private bubbleTexture:DynamicTexture|null=null;
  private readonly lights:PointLight[]=[];
  private swimmerLight:PointLight|null=null;
  private litPlayer:TransformNode|null=null;
  private litMeshCount=0;
  private time=0;
  private readonly impacts=LAGOON_FALLS.map(f=>new Vector4(f.x,f.z+f.run,f.width*.64,1));
  private fog:{color:Color3;density:number;mode:number}|null=null;
  private returnId='laguna-sumergida';
  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    private readonly heightAt:(x:number,z:number)=>number){
    const rock='/assets/terrain/biomes/textures/albedo/biome_volcanico_basalto_albedo_1k.webp';
    this.stone=new StandardMaterial('vertientes-roca-estratificada',scene);
    this.stone.diffuseTexture=new Texture(rock,scene);this.stone.diffuseColor=new Color3(.92,.94,.90);
    this.stone.bumpTexture=new Texture('/assets/terrain/biomes/textures/normal/biome_volcanico_basalto_normal_gl_1k.png',scene);
    this.stone.diffuseTexture.anisotropicFilteringLevel=8;this.stone.bumpTexture.anisotropicFilteringLevel=8;
    this.stone.bumpTexture.level=.32;
    this.stone.specularColor=new Color3(.07,.09,.08);this.stone.backFaceCulling=false;this.stone.twoSidedLighting=true;
    // A small texture-modulated ambient floor matches the terrain's indirect
    // lighting at night. No emissive map: adding the raw albedo would glow.
    this.stone.linkEmissiveWithDiffuse=true;
    this.wetStone=this.stone.clone('vertientes-roca-mojada');
    this.wetStone.diffuseColor=new Color3(.64,.72,.68);this.wetStone.specularColor=new Color3(.18,.21,.20);
    this.floor=this.stone.clone('gruta-suelo');this.floor.diffuseColor=new Color3(.66,.70,.65);
    this.floor.emissiveColor.set(.10,.12,.14);
    this.setRockAmbient(false);
    // Attach after cloning so every material has its own plugin and shares the
    // same two texture resources. No extra lights, render targets or passes.
    for(const material of [this.stone,this.wetStone,this.floor])new LagoonRockMaterial(material);
    this.glow=new StandardMaterial('gruta-balizas',scene);this.glow.emissiveColor=new Color3(.12,.65,.62);
    this.masks=loadWaterMasks(scene);
    this.fall=createWorldWaterMaterial(scene,'fall',this.masks,{uLocalFallUV:1,uRockEnabled:0,
      uWaveAmp:.22,uFlowSpeed:2.3,uFoamIntensity:1.15,uDeepColor:'#327773',uShallowColor:'#8fc6bd'});
    this.pool=createWorldWaterMaterial(scene,'pool',this.masks,{uClearWater:1,uWaveAmp:.08,uWaveSpeed:.6,
      uCaustics:.7,uDeepColor:'#103f46',uShallowColor:'#4b9987',uFoamIntensity:.35,uContactFoam:.85});
    this.river=createWorldWaterMaterial(scene,'river',this.masks,{uClearWater:1,uWaveAmp:.09,uWaveSpeed:.8,
      uFlowSpeed:1.2,uFoamIntensity:.4,uDeepColor:'#28595b',uShallowColor:'#79a79a',uCaustics:.2,uContactFoam:.95});
    this.mistTexture=new DynamicTexture('vertientes-rocío',{width:64,height:64},scene,false);
    const ctx=this.mistTexture.getContext();const g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(235,255,250,.65)');g.addColorStop(.4,'rgba(225,250,245,.25)');g.addColorStop(1,'rgba(225,250,245,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);this.mistTexture.update();
  }
  get inside():boolean{return this.interior!==null;}
  private setRockAmbient(inside:boolean){
    const scale=inside?.35:1;
    this.stone.emissiveColor.set(.30*scale,.32*scale,.35*scale);
    this.wetStone.emissiveColor.set(.25*scale,.28*scale,.30*scale);
  }
  get returnPortal(){return GROTTO_PORTALS.find(p=>p.id===this.returnId)!;}
  private root(name:string){const r=new TransformNode(name,this.scene);r.parent=this.parent;return r;}
  private mesh(name:string,positions:number[],indices:number[],uvs:number[],root:TransformNode,
    material:StandardMaterial|ShaderMaterial,colors?:number[],uvs2?:number[]):Mesh{
    const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);
    const d=new VertexData();Object.assign(d,{positions,indices,uvs,normals,colors,uvs2});
    const m=new Mesh(name,this.scene);d.applyToMesh(m);m.material=material;m.parent=root;m.isPickable=false;
    if(colors){m.useVertexColors=true;m.hasVertexAlpha=false;}m.freezeWorldMatrix();return m;
  }
  private quad(name:string,p:Vector3[],root:TransformNode,mat:StandardMaterial){
    const u=Vector3.Distance(p[0],p[1])/5,v=Vector3.Distance(p[1],p[2])/5;
    return this.mesh(name,p.flatMap(q=>[q.x,q.y,q.z]),[0,1,2,0,2,3],[0,0,u,0,u,v,0,v],root,mat);
  }
  private merge(root:TransformNode){
    for(const mat of [this.stone,this.wetStone,this.floor,this.glow]){
      const group=root.getChildMeshes().filter(m=>m.material===mat&&m instanceof Mesh&&!m.metadata?.rockCollider) as Mesh[];
      if(group.length>1){const m=Mesh.MergeMeshes(group,true,true);if(m){m.parent=root;m.isPickable=false;m.freezeWorldMatrix();}}
    }
  }
  /** Weathered columns with strata, broad shoulders and an irregular silhouette. */
  private rock(root:TransformNode,x:number,y:number,z:number,rx:number,height:number,rz:number,seed:number){
    const pos:number[]=[],uv:number[]=[],idx:number[]=[],rings=10,sides=16;
    for(let j=0;j<=rings;j++)for(let i=0;i<=sides;i++){
      const t=j/rings,a=i/sides*Math.PI*2;
      const shoulder=Math.pow(Math.sin(Math.PI*(.08+.86*t)),.10);
      const ridge=1+.045*Math.sin(j*2.1+seed)+.16*Math.sin(a*3+seed)+.035*Math.sin(a*7+j);
      pos.push(x+Math.cos(a)*rx*shoulder*ridge,y+height*t+Math.sin(a*3+seed)*(.35+2.2*t*t),
        z+Math.sin(a)*rz*shoulder*ridge);uv.push(a*rx/6,t*height/6);
      if(j&&i){const b=j*(sides+1)+i;idx.push(b,b-1,b-sides-2,b,b-sides-2,b-sides-1);}
    }
    // The top has its own planar UVs and normals. Reusing the cylindrical rim
    // collapsed its UV area and also tilted the top normals towards the sides.
    const rim=pos.length/3;
    for(let i=0;i<sides;i++){
      const p=(rings*(sides+1)+i)*3;
      pos.push(pos[p],pos[p+1],pos[p+2]);uv.push((pos[p]-x)/6,(pos[p+2]-z)/6);
    }
    const top=pos.length/3;pos.push(x+rx*.12,y+height-1.1,z-rz*.1);uv.push(rx*.12/6,-rz*.1/6);
    for(let i=0;i<sides;i++)idx.push(top,rim+i,rim+(i+1)%sides);
    this.rockColliders.registerGeneratedMesh(this.mesh('roca-estratos',pos,idx,uv,root,this.stone));
  }
  private arch(root:TransformNode,x:number,y:number,z:number,yaw=0){
    const path=Array.from({length:19},(_,i)=>{const a=i*Math.PI/18;
      return new Vector3(x+Math.cos(a)*6*Math.cos(yaw),y+Math.sin(a)*7,z+Math.cos(a)*6*Math.sin(yaw));});
    const m=MeshBuilder.CreateTube('boca-natural',{path,radius:2.1,tessellation:10},this.scene);
    m.parent=root;m.material=this.wetStone;m.isPickable=false;
    this.rockColliders.registerGeneratedMesh(m);
    for(const side of [-1,1])this.rock(root,x+side*7*Math.cos(yaw),y-3,z+side*7*Math.sin(yaw),3.5,9,4,side+5);
  }
  private buildExterior(){
    const root=this.root('cuenca-tres-vertientes');this.exterior=root;
    const p:number[]=[],idx:number[]=[],uv:number[]=[],col:number[]=[];
    const l=CASCADE_LAGOON,nx=120,nz=96,step=3;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const x=l.x+(i-nx/2)*step,z=l.z+(j-nz/2)*step,h=this.heightAt(x,z);
      const wet=lagoonRadius(x,z)<1.035&&h<l.level;
      // Dry samples are clipped by the shoreline mask, never lowered into
      // underwater triangles. The entire lake shares one continuous datum.
      p.push(x,l.level+.04,z);uv.push(x/16,z/16);
      col.push(wet?1-Math.min(1,(l.level-h)/.7):1,0,0,Math.max(0,Math.min(1,(l.level-h)/10)));
      if(j&&i){const a=j*(nx+1)+i;idx.push(a,a-1,a-nx-2,a,a-nx-2,a-nx-1);}
    }
    this.mesh('laguna-superficie',p,idx,uv,root,this.pool,col);
    this.buildHeadwaterLake(root);
    this.riverBuild=this.buildRivers(root);
    for(const spring of LAGOON_SPRINGS.filter(s=>s.kind==='aquifer')){
      const {x,z,level,dx,dz}=spring,nx=-dz,nz=dx;
      const mouth=spring.mouthDistance;
      const sx=x-dx*mouth,sz=z-dz*mouth;
      // The outlet sits under a rock vault embedded in the rising headwall.
      this.arch(root,sx,level-1,sz,Math.atan2(nz,nx));
      for(const side of [-1,1]){
        this.rock(root,sx+nx*side*10-dx*5,level-5,sz+nz*side*10-dz*5,7,16,8,side+9);
        this.rock(root,sx+nx*side*16-dx*11,level-6,sz+nz*side*16-dz*11,10,22,11,side+13);
      }
      // The spring shares the continuous river pool built below. Its waterline
      // reaches into the rock opening; there is no raised decorative sheet.
      // Bury the back wall below that datum so no gap exposes the grassy bank.
      this.rock(root,sx-dx*10,level-4,sz-dz*10,10,23,10,18);
    }
    for(const [n,f] of LAGOON_FALLS.entries()){
      for(const side of [-1,1])for(let tier=0;tier<2;tier++){
        const x=f.x+side*(f.width*.5+8+tier*13),z=f.z-7-tier*10;
        this.rock(root,x,22,z,11+tier*5,f.top-20+tier*7,15+tier*8,n*7+tier+side);
      }
      const spec={...f,seed:n*2.7};
      const bed=createCascadeBedGeometry(spec,this.heightAt);
      this.rockColliders.registerGeneratedMesh(this.mesh('lecho-cascada-'+f.id,
        bed.positions,bed.indices,bed.uvs,root,this.wetStone));
      const geometry=createCascadeGeometry(spec);
      const curtain=this.mesh('cascada-'+f.id,geometry.positions,geometry.indices,geometry.uvs,root,this.fall,geometry.colors);
      curtain.metadata={waterfall:true,curtainVertices:geometry.curtainVertices};
      // Small upper spring pools settle at the same level as their feeding channel.
      const spray=new ParticleSystem('rocío-'+f.id,120,this.scene);
      spray.particleTexture=this.mistTexture;spray.emitter=new Vector3(f.x,f.bottom+1,f.z+f.run);
      spray.minEmitBox=new Vector3(-f.width*.45,0,-2);spray.maxEmitBox=new Vector3(f.width*.45,1,3);
      spray.direction1=new Vector3(-1,2,0);spray.direction2=new Vector3(1,4,2);
      spray.color1=new Color4(.8,.94,.9,.18);spray.color2=new Color4(.86,.97,.94,.10);
      spray.colorDead=new Color4(.85,.97,.94,0);spray.minSize=2;spray.maxSize=5;
      spray.minLifeTime=1.1;spray.maxLifeTime=2.4;spray.emitRate=30;
      spray.minEmitPower=.6;spray.maxEmitPower=1.5;spray.gravity=new Vector3(0,.2,0);
      spray.blendMode=ParticleSystem.BLENDMODE_STANDARD;spray.start();this.mist.push(spray);
    }
    for(const p of GROTTO_PORTALS){const y=p.submerged?11:this.heightAt(p.x,p.z);
      this.arch(root,p.x,y,p.z,p.submerged?Math.PI/2:0);
    }
    this.merge(root);
  }
  nearestPortal(x:number,y:number,z:number){return GROTTO_PORTALS.find(p=>{
    const n=this.inside?GROTTO_NODES[p.node]:{x:p.x,z:p.z,y:p.submerged?11:this.heightAt(p.x,p.z)};
    return Math.hypot(x-n.x,z-n.z)<9&&Math.abs(y-n.y)<(p.submerged?7:4);
  });}
  private buildHeadwaterLake(root:TransformNode){
    const l=HEADWATER_LAKE,p:number[]=[],idx:number[]=[],uv:number[]=[],col:number[]=[];
    const nx=40,nz=44,step=3;
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const x=l.x+(i-nx/2)*step,z=l.z+(j-nz/2)*step;
      const depth=l.level-this.heightAt(x,z),wet=headwaterLakeRadius(x,z)<1.025;
      p.push(x,l.level+.045,z);uv.push(x/16,z/16);
      col.push(wet?1-Math.min(1,Math.max(0,depth)/.45):1,0,0,Math.min(1,Math.max(0,depth)/7));
      if(j&&i){const a=j*(nx+1)+i;idx.push(a,a-1,a-nx-2,a,a-nx-2,a-nx-1);}
    }
    this.mesh('laguna-alta-gemelas',p,idx,uv,root,this.pool,col);
  }
  /** Follow the continuous banks rather than stair-stepping on terrain cell edges.
   * Work is sliced over frames; every station shares one cross-section. */
  private *buildRivers(root:TransformNode):Generator<void,void,void>{
    for(const [n,route] of LAGOON_CHANNELS.entries()){
      const p:number[]=[],ix:number[]=[],uv:number[]=[],col:number[]=[],flow:number[]=[];
      let row=0,along=0;
      for(let s=1;s<route.length;s++){
        const a=route[s-1],b=route[s],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/3);
        for(let j=s===1?0:1;j<=steps;j++){
          const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
          const width=a.width+(b.width-a.width)*t,dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
          // Shared tangent at bends keeps neighbouring strips stitched together.
          const prev=route[Math.max(0,s-2)],next=route[Math.min(route.length-1,s+1)];
          let tx=dx,tz=dz;
          const blend=t<.25?1-t/.25:t>.75?(t-.75)/.25:0;
          if(blend){const xx=t<.25?b.x-prev.x:next.x-a.x,zz=t<.25?b.z-prev.z:next.z-a.z,l=Math.hypot(xx,zz);
            tx=dx*(1-blend)+xx/l*blend;tz=dz*(1-blend)+zz/l*blend;}
          const fall=n<3?LAGOON_FALLS[n]:null;
          const lip=fall&&s===route.length-1?Math.max(0,1-(1-t)*length/30):0;
          // Approach the exact width and transverse direction of the fall lip.
          tx*=1-lip;tz=tz*(1-lip)+lip;
          const tl=Math.hypot(tx,tz),nx=tz/tl,nz=-tx/tl;
          const waterY=(xx:number,zz:number)=>{
            if(headwaterLakeRadius(xx,zz)<1.02)return HEADWATER_LAKE.level;
            const level=lagoonChannelAt(xx,zz).level;
            return fall?level+(fall.top-level)*lip:level;
          };
          const bank=(side:number)=>{
            // Bracket the FIRST bank. A lower valley farther away must not make
            // the search skip over the bank and spawn isolated water triangles.
            let lo=0,hi=width+35;
            for(let d=2;d<=width+37;d+=2){
              const xx=x+nx*side*d,zz=z+nz*side*d;
              if(this.heightAt(xx,zz)>=waterY(xx,zz)){hi=d;break;}lo=d;
            }
            for(let k=0;k<12;k++){const mid=(lo+hi)/2;
              const xx=x+nx*side*mid,zz=z+nz*side*mid;
              if(this.heightAt(xx,zz)<waterY(xx,zz))lo=mid;else hi=mid;}
            return (lo+hi)/2;
          };
          const left=bank(-1)*(1-lip)+(fall?.width??0)*.5*lip;
          const right=bank(1)*(1-lip)+(fall?.width??0)*.5*lip,segments=24;
          for(let i=0;i<=segments;i++){
            const across=-left+(left+right)*i/segments,xx=x+nx*across,zz=z+nz*across;
            const ground=this.heightAt(xx,zz),localLevel=waterY(xx,zz),depth=Math.max(0,localLevel-ground);
            const highPool=headwaterLakeRadius(xx,zz)<1.015;
            const inPool=lagoonRadius(xx,zz)<1.015||highPool;
            const y=inPool?Math.min(localLevel,highPool?HEADWATER_LAKE.level:CASCADE_LAGOON.level):localLevel;
            p.push(xx,y+.045,zz);uv.push(across/16,(along+length*t)/16);flow.push(tx/tl,tz/tl);
            col.push(inPool?1:1-Math.min(1,depth/.45),.35,.08,Math.min(1,depth/6));
            if(row&&i){const v=row*(segments+1)+i;ix.push(v,v-1,v-segments-2,v,v-segments-2,v-segments-1);}
          }row++;yield;
          if(n===0&&s===1&&j===0){
            // Close the upstream end with a curved pool. Its radial boundary
            // meets the real terrain, and its diameter shares the river's row.
            const cp:number[]=[x,waterY(x,z)+.045,z],ci:number[]=[],cu:number[]=[x/16,z/16],cc:number[]=[0,0,0,.6],cf:number[]=[dx,dz];
            const rings=12,sides=48,edge:{vx:number;vz:number;radius:number}[]=[];
            for(let k=0;k<=sides;k++){
              const angle=k/sides*Math.PI,vx=-nx*Math.cos(angle)-dx*Math.sin(angle),vz=-nz*Math.cos(angle)-dz*Math.sin(angle);
              let lo=0,hi=width+55;
              if(k===0)hi=left;else if(k===sides)hi=right;else{
                for(let d=1;d<=width+55;d++)if(this.heightAt(x+vx*d,z+vz*d)>=waterY(x+vx*d,z+vz*d)){hi=d;lo=d-1;break;}
                for(let q=0;q<10;q++){const mid=(lo+hi)/2;
                  if(this.heightAt(x+vx*mid,z+vz*mid)<waterY(x+vx*mid,z+vz*mid))lo=mid;else hi=mid;}
              }
              edge.push({vx,vz,radius:hi});yield;
            }
            for(let ring=1;ring<=rings;ring++){
              for(let k=0;k<=sides;k++){
              const {vx,vz,radius}=edge[k],d=radius*ring/rings,xx=x+vx*d,zz=z+vz*d,level=waterY(xx,zz),depth=Math.max(0,level-this.heightAt(xx,zz));
              cp.push(xx,level+.045,zz);cu.push(xx/16,zz/16);cf.push(dx,dz);cc.push(1-Math.min(1,depth/.45),.35,.08,Math.min(1,depth/6));
              const v=1+(ring-1)*(sides+1)+k;
              if(k){if(ring===1)ci.push(0,v,v-1);else ci.push(v,v-sides-1,v-sides-2,v,v-sides-2,v-1);}
              }yield;
            }
            this.mesh('naciente-poza-'+n,cp,ci,cu,root,this.river,cc,cf);
          }
        }along+=length;
      }
      this.mesh('vertientes-río-'+n,p,ix,uv,root,this.river,col,flow);yield;
    }
  }
  enter(id:string):Vector3|null{
    const p=GROTTO_PORTALS.find(p=>p.id===id);if(!p)return null;
    this.returnId=id;if(!this.interior)this.buildInterior();this.exterior?.setEnabled(false);
    this.setRockAmbient(true);
    const n=GROTTO_NODES[p.node];return new Vector3(n.x,p.submerged?-121:n.y,n.z);
  }
  leave(id:string):Vector3|null{
    const p=GROTTO_PORTALS.find(p=>p.id===id);if(!p)return null;
    this.disposeInterior();return new Vector3(p.x,p.submerged?14:this.heightAt(p.x,p.z),p.z);
  }
  private buildInterior(){
    const root=this.root('gruta-de-las-vertientes');this.interior=root;
    for(const [aa,bb] of GROTTO_LINKS){
      const {a,b}=grottoSegment(GROTTO_NODES[aa],GROTTO_NODES[bb]),len=Math.hypot(b.x-a.x,b.z-a.z);
      const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
      const na=grottoJointNormal(aa,nz,-nx),nb=grottoJointNormal(bb,nz,-nx);
      const sidePoint=(p:typeof a,n:typeof na,side:number,y=0)=>new Vector3(p.x+n.x*side*6.15,p.y+y,p.z+n.z*side*6.15);
      this.quad('gruta-sendero',[sidePoint(a,na,-1),sidePoint(b,nb,-1),sidePoint(b,nb,1),sidePoint(a,na,1)],root,this.floor);
      for(let k=0;k<12;k++){
        const t0=k/12*Math.PI,t1=(k+1)/12*Math.PI;
        const point=(p:typeof a,n:typeof na,h:number,t:number)=>sidePoint(p,n,Math.cos(t),2+Math.sin(t)*(h-2));
        this.quad('galeria-boveda',[point(a,na,grottoRoof(aa),t0),point(b,nb,grottoRoof(bb),t0),
          point(b,nb,grottoRoof(bb),t1),point(a,na,grottoRoof(aa),t1)],root,this.wetStone);
      }
      for(const side of [-1,1])this.quad('zócalo',[sidePoint(a,na,side),sidePoint(b,nb,side),
        sidePoint(b,nb,side,2),sidePoint(a,na,side,2)],root,this.wetStone);
      for(const [id,p,n] of [[aa,a,na],[bb,b,nb]] as const){
        if(!GROTTO_PORTALS.some(portal=>portal.node===id))continue;
        // E owns the transition at terminal portals; their rear is solid rock.
        const cp:number[]=[p.x,p.y+2,p.z],ci:number[]=[],cu:number[]=[0,0];
        for(let k=0;k<=14;k++){
          const angle=k/14*Math.PI,point=sidePoint(p,n,Math.cos(angle),2+Math.sin(angle)*(grottoRoof(id)-2));
          cp.push(point.x,point.y,point.z);cu.push(point.x/5,point.y/5);
          if(k)ci.push(0,k,k+1);
        }
        this.mesh('fondo-portal-'+id,cp,ci,cu,root,this.wetStone);
        this.quad('base-portal',[sidePoint(p,n,-1),sidePoint(p,n,1),sidePoint(p,n,1,2),sidePoint(p,n,-1,2)],root,this.wetStone);
      }
      for(let d=12;d<len;d+=20){const t=d/len;
        const m=MeshBuilder.CreateSphere('baliza-sendero',{diameter:.45,segments:6},this.scene);
        m.position.set(a.x+(b.x-a.x)*t+nx*5,a.y+(b.y-a.y)*t+2,a.z+(b.z-a.z)*t+nz*5);
        m.parent=root;m.material=this.glow;
      }
    }
    const positions:number[]=[260,-114,-890],uv:number[]=[260/5,-890/5],indices:number[]=[];
    const openings=[{dir:Math.PI,floor:grottoRoomFloor(225)},
      {dir:Math.atan2(-50,70),floor:grottoRoomFloor(260+35*70/Math.hypot(70,50))},
      {dir:Math.atan2(60,90),floor:grottoRoomFloor(260+35*90/Math.hypot(90,60))}];
    const openingAngle=Math.asin(6.15/36),tau=Math.PI*2;
    const angles=[...Array.from({length:73},(_,i)=>i/72*tau),
      ...openings.flatMap(o=>[o.dir-openingAngle,o.dir+openingAngle].map(a=>(a+tau)%tau))].sort((a,b)=>a-b);
    for(let i=0;i<angles.length;i++){
      const a=angles[i],x=260+Math.cos(a)*36,z=-890+Math.sin(a)*36;
      positions.push(x,grottoRoomFloor(x),z);uv.push(x/5,z/5);
      if(i)indices.push(0,i,i+1);
      if(i===angles.length-1)continue;
      const b=angles[i+1],xx=260+Math.cos(b)*36,zz=-890+Math.sin(b)*36;
      const gap=openings.find(o=>Math.abs(Math.atan2(Math.sin((a+b)/2-o.dir),Math.cos((a+b)/2-o.dir)))<openingAngle);
      const lintel=(angle:number)=>gap?gap.floor+2+15*Math.sqrt(Math.max(0,1-(36*Math.sin(angle-gap.dir)/6.15)**2)):
        grottoRoomFloor(260+Math.cos(angle)*36);
      this.quad('sala-pared',[new Vector3(x,lintel(a),z),new Vector3(xx,lintel(b),zz),
        new Vector3(xx,-84,zz),new Vector3(x,-84,z)],root,this.stone);
      this.quad('sala-boveda',[new Vector3(x,-84,z),new Vector3(xx,-84,zz),
        new Vector3(260+(xx-260)*.45,-73,-890+(zz+890)*.45),new Vector3(260+(x-260)*.45,-73,-890+(z+890)*.45)],root,this.stone);
      if(i%8===0&&!gap){
        this.rock(root,x*.6+260*.4,-75,z*.6-890*.4,1.5,-9,1.5,i);
        this.rock(root,260+(x-260)*1.07,grottoRoomFloor(x),-890+(z+890)*1.07,3.4,22,3.4,i+6);
      }
    }
    this.mesh('sala-orilla',positions,indices,uv,root,this.floor);
    const roof=MeshBuilder.CreateDisc('techo-gruta',{radius:17,tessellation:32,sideOrientation:Mesh.DOUBLESIDE},this.scene);
    roof.rotation.x=Math.PI/2;roof.position.set(260,-73,-890);roof.parent=root;roof.material=this.stone;
    // A single connected water sheet, clipped to the tunnel / room footprint.
    const p:number[]=[],ix:number[]=[],uvs:number[]=[],colors:number[]=[];
    for(let z=-944;z<=-826;z+=2)for(let x=74;x<300;x+=2){
      if(!grottoSurfaceAt(x+1,z+1)||grottoSurfaceAt(x+1,z+1)!.height>=GROTTO_WATER-.1)continue;
      const start=p.length/3;
      for(const [dx,dz] of [[0,0],[2,0],[2,2],[0,2]]){
        const floor=grottoSurfaceAt(x+dx,z+dz)?.height??GROTTO_WATER+1;
        p.push(x+dx,GROTTO_WATER,z+dz);uvs.push((x+dx)/16,(z+dz)/16);
        colors.push(floor>=GROTTO_WATER?1:0,0,0,Math.min(1,(GROTTO_WATER-floor)/8));
      }ix.push(start,start+1,start+2,start,start+2,start+3);
    }
    this.mesh('gruta-agua',p,ix,uvs,root,this.pool,colors);this.merge(root);
    for(const [i,pos] of [new Vector3(260,-81,-890),new Vector3(80,-115,-850)].entries()){
      const light=new PointLight('gruta-luz-'+i,pos,this.scene);light.diffuse=new Color3(.35,.7,.64);
      light.intensity=i?1:2.4;light.range=i?28:85;light.includedOnlyMeshes=root.getChildMeshes();this.lights.push(light);
    }
  }
  restoreAtmosphere(){if(this.fog){this.scene.fogColor.copyFrom(this.fog.color);this.scene.fogDensity=this.fog.density;this.scene.fogMode=this.fog.mode;this.fog=null;}}
  update(dt:number,x:number,y:number,z:number,climate?:ClimateFrame){
    this.time+=Math.min(dt,.1);
    this.hydrology.update(dt,climate?.weatherMix.rain,climate?.season);
    const distance=watershedDistance(x,z);
    if(!this.inside&&distance<350&&!this.exterior)this.buildExterior();
    if(!this.inside&&distance>550&&this.exterior){
      this.riverBuild?.return();this.riverBuild=null;
      this.exterior.dispose();this.exterior=null;for(const p of this.mist)p.dispose(false);this.mist.length=0;
    }
    this.exterior?.setEnabled(!this.inside);
    if(this.riverBuild&&!this.inside){const deadline=performance.now()+1.5;
      while(this.riverBuild&&performance.now()<deadline)if(this.riverBuild.next().done)this.riverBuild=null;}
    for(let i=0;i<this.mist.length;i++){
      const f=LAGOON_FALLS[i];this.mist[i].emitRate=!this.inside&&Math.hypot(x-f.x,z-f.z)<230?30*this.hydrology.intensity:0;
    }
    if(this.inside)this.lights[1]?.position.set(x,y+3,z);
  }
  /** Local atmosphere and particles evaluated from the final camera each render. */
  updateView(eye:Vector3,player:Vector3,water:number|null,avatar:TransformNode){
    this.restoreAtmosphere();
    const depth=water===null?0:Math.max(0,water-eye.y);
    const underwater=depth>.1;
    if(this.inside){
      this.fog={color:this.scene.fogColor.clone(),density:this.scene.fogDensity,mode:this.scene.fogMode};
      this.scene.fogMode=Scene.FOGMODE_EXP2;
      this.scene.fogColor.set(.035,.065,.07);
      // Water absorption is evaluated per view segment by WaterOptics. Global
      // underwater fog would also tint the dry cliff above the surface.
      this.scene.fogDensity=.008;
    }
    const immersed=water!==null&&player.y+1.25<water;
    if(immersed&&!this.bubbles){
      this.bubbleTexture=new DynamicTexture('buceo-burbuja',{width:64,height:64},this.scene,false);
      this.bubbleTexture.hasAlpha=true;
      const ctx=this.bubbleTexture.getContext(),ring=ctx.createRadialGradient(32,32,0,32,32,31);
      ring.addColorStop(0,'rgba(175,225,235,0)');ring.addColorStop(.74,'rgba(175,225,235,.01)');
      ring.addColorStop(.9,'rgba(210,245,250,.48)');ring.addColorStop(1,'rgba(210,245,250,0)');
      ctx.fillStyle=ring;ctx.fillRect(0,0,64,64);this.bubbleTexture.update();
      const b=new ParticleSystem('buceo-burbujas',48,this.scene);b.particleTexture=this.bubbleTexture;
      b.blendMode=ParticleSystem.BLENDMODE_STANDARD;
      b.emitter=new Vector3();b.minEmitBox=new Vector3(-.2,1.2,-.2);b.maxEmitBox=new Vector3(.2,1.7,.2);
      b.direction1=new Vector3(-.15,1,-.15);b.direction2=new Vector3(.15,1.5,.15);
      b.minSize=.06;b.maxSize=.18;b.minLifeTime=.6;b.maxLifeTime=1.6;
      b.minEmitPower=.6;b.maxEmitPower=1.1;b.gravity=new Vector3(0,.4,0);
      b.color1=new Color4(.65,.9,.95,.28);b.color2=new Color4(.75,.95,1,.14);
      b.colorDead=new Color4(.7,.9,1,0);b.emitRate=0;b.start();this.bubbles=b;
    }
    if(this.bubbles){
      (this.bubbles.emitter as Vector3).copyFrom(player);
      this.bubbles.emitRate=immersed&&underwater?7:0;
    }
    if(immersed&&!this.swimmerLight){
      this.swimmerLight=new PointLight('santi-visibilidad-submarina',Vector3.Zero(),this.scene);
      this.swimmerLight.diffuse=new Color3(.28,.65,.72);this.swimmerLight.specular=Color3.Black();
      this.swimmerLight.intensity=.22;this.swimmerLight.range=18;
    }
    if(this.swimmerLight){
      this.swimmerLight.setEnabled(immersed);
      if(immersed){
        this.swimmerLight.intensity=.22-Math.min(1,Math.max(0,water!-player.y-1.25)/16)*.08;
        this.swimmerLight.position.copyFrom(eye);this.swimmerLight.position.y+=2;
        if(this.litPlayer!==avatar||this.litMeshCount!==this.scene.meshes.length){
          this.swimmerLight.includedOnlyMeshes=avatar.getChildMeshes();
          this.litPlayer=avatar;this.litMeshCount=this.scene.meshes.length;
        }
      }
    }
    if(this.exterior){
      updateWorldWaterMaterial(this.fall,'fall',this.scene,this.hydrology.phase,{rockEnabled:false});
      updateWorldWaterMaterial(this.river,'river',this.scene,this.hydrology.phase);
      this.fall.setFloat('uFoamIntensity',.8+.35*this.hydrology.intensity);
      this.river.setFloat('uFoamIntensity',.22+.18*this.hydrology.intensity);
      for(const impact of this.impacts)impact.w=this.hydrology.intensity;
    }
    if(this.inside||this.exterior){
      updateWorldWaterMaterial(this.pool,'pool',this.scene,this.time,{impactEnabled:!this.inside,
        impactA:this.impacts[0],impactB:this.impacts[1]});
      this.pool.setVector4('uImpactC',this.impacts[2]);
    }
  }
  private disposeInterior(){this.interior?.dispose();this.interior=null;for(const l of this.lights)l.dispose();this.lights.length=0;this.setRockAmbient(false);}
  dispose(){this.restoreAtmosphere();this.disposeInterior();this.swimmerLight?.dispose();this.bubbles?.dispose(false);this.exterior?.dispose();for(const p of this.mist)p.dispose(false);
    this.rockColliders.dispose();
    this.riverBuild?.return();this.riverBuild=null;
    this.mistTexture.dispose();this.bubbleTexture?.dispose();this.fall.dispose();this.pool.dispose();this.river.dispose();this.stone.dispose(false,true);
    this.wetStone.dispose();this.floor.dispose();this.glow.dispose();this.masks.caustics.dispose();this.masks.waterfall.dispose();}
}
