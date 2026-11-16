import { Color3, Mesh, PBRMaterial, Ray, Vector3, VertexData,
  type Observer, type Scene, type Texture, type TransformNode } from '@babylonjs/core';
import { getSeasonalIvyState, ivyBend, ivyHash, ivyShoot, IVY_ROOT_SPACING as SPACING,
  IVY_BRANCH_STEP as STEP, SeasonalIvyLeafPlugin } from './materials/SeasonalIvyMaterial';

type Part={mesh:Mesh;surface:'wall'|'tower'};
type Domain={id:string;wall:boolean;x:number;z:number;radius:number;columns:number;height:number;seed:number};
type Anchor={point:Vector3;normal:Vector3;random:number};
type Buffer={positions:number[];normals:number[];indices:number[];uvs:number[];seeds:number[]};
const buffer=():Buffer=>({positions:[],normals:[],indices:[],uvs:[],seeds:[]});
const mod=(x:number,n:number)=>((x%n)+n)%n;
const fract=(x:number)=>x-Math.floor(x);
const TAU=Math.PI*2;

/** Dense fine branching and two separate layers of the same leaf atlas as the trees. */
export class BrisaliaIvyVolume {
  readonly meshes:Mesh[]=[];
  readonly ready:Promise<void>;
  // Bump the version if root/branch paths or their sampling change. Rebuild with
  // node scripts/bake-brisalia-ivy.mjs (Vite running on port 5173).
  readonly attachmentInfo={version:2,sourceHash:0,samples:0};
  readonly attachmentSamples:number[]=[];
  readonly stats={patches:0,roots:0,twigs:0,stemSegments:0,triangles:0,layers:2,
    maxStemRadius:0,minLeafClearance:.018,layerGap:.03,buildMs:0,attachmentCacheUsed:false};
  private readonly materials:PBRMaterial[]=[];
  private readonly observer:Observer<Scene>;
  private disposed=false;
  private readonly domains:Domain[]=[
    ...[-1,1].map(sign=>({id:`wall:${sign}`,wall:true,x:sign*30.48,z:0,
      radius:0,columns:4096,height:14.85,seed:sign*19})),
    ...[[-30,-26],[-30,26],[30,-26],[30,26],[-11.4,-27],[11.4,-27]].map(([x,z])=>{
      const gate=Math.abs(x)<20,radius=gate?4.38:5.15;
      return {id:`tower:${x}:${z}`,wall:false,x,z,radius,
        columns:Math.round(Math.PI*radius/SPACING),height:gate?31.5:27.9,seed:x*1.37+z*3.71};
    }),
  ];
  constructor(private readonly scene:Scene,parts:readonly Part[],root:TransformNode,textures:readonly Texture[]){
    const state=getSeasonalIvyState(scene);
    this.observer=scene.onBeforeRenderObservable.add(()=>{
      const eye=scene.activeCamera?.globalPosition;
      for(const mesh of this.meshes){
        const sphere=mesh.getBoundingInfo().boundingSphere,layer=mesh.metadata.ivyLayer;
        const limit=layer===0?600:layer===1?320:240;
        const near=!eye||Vector3.Distance(eye,sphere.centerWorld)-sphere.radiusWorld<limit;
        mesh.setEnabled(near&&(layer<0||state.leaves>.001));
      }
    });
    this.ready=this.build(parts,root,textures[0]);
  }
  private async build(parts:readonly Part[],root:TransformNode,atlas:Texture):Promise<void>{
    const started=performance.now(),scene=this.scene;
    const bark=new PBRMaterial('brisalia:ivy:fine-wood',scene);
    bark.albedoColor=new Color3(.10,.064,.034);bark.metallic=0;bark.roughness=.92;
    bark.backFaceCulling=false;this.materials.push(bark);
    const leaves=[0,1].map(layer=>{
      const material=new PBRMaterial(`brisalia:ivy:tree-leaves:${layer}`,scene);
      material.albedoTexture=atlas;material.useAlphaFromAlbedoTexture=true;
      material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;material.alphaCutOff=.5;
      material.metallic=0;material.roughness=.9;material.backFaceCulling=false;material.twoSidedLighting=true;
      new SeasonalIvyLeafPlugin(material,scene,layer,atlas);this.materials.push(material);return material;
    });
    const buckets=new Map<number,Part[]>();
    let sourceHash=2166136261;
    for(const part of parts){
      const {mesh}=part;
      mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;
      const fingerprint=[mesh.name,mesh.getTotalVertices(),mesh.getTotalIndices(),
        ...box.minimumWorld.asArray().map(n=>Math.round(n*1000)),
        ...box.maximumWorld.asArray().map(n=>Math.round(n*1000))].join(':');
      for(let i=0;i<fingerprint.length;i++)sourceHash=Math.imul(sourceHash^fingerprint.charCodeAt(i),16777619)>>>0;
      for(let y=Math.floor(box.minimumWorld.y/2);y<=Math.floor(box.maximumWorld.y/2);y++){
        const list=buckets.get(y)??[];list.push(part);buckets.set(y,list);
      }
    }
    this.attachmentInfo.sourceHash=sourceHash;
    const baking=!!scene.metadata?.bakeIvy;
    let cached:Uint16Array|null=null,sampleIndex=0;
    if(!baking){
      try{
        const response=await fetch('/assets/ivy/brisalia-attachments.bin');
        if(response.ok){
          const bytes=await response.arrayBuffer(),header=new DataView(bytes);
          if(bytes.byteLength>=16&&header.getUint32(0,true)===0x49565932&&
            header.getUint32(4,true)===this.attachmentInfo.version&&header.getUint32(8,true)===sourceHash&&
            bytes.byteLength===16+header.getUint32(12,true)*2)cached=new Uint16Array(bytes,16);
        }
      }catch{/* Authoring fallback: fit the actual revised source geometry. */}
    }
    this.stats.attachmentCacheUsed=!!cached;
    if(this.disposed)return;
    for(const domain of this.domains){
      if(this.disposed)return;
      const wood=buffer(),anchors:Anchor[]=[],profile=new Map<number,number>();
      const depth=(p:Vector3)=>domain.wall?Math.abs(p.x):Math.hypot(p.x-domain.x,p.z-domain.z);
      const attach=(x:number,y:number):{point:Vector3;normal:Vector3}|null=>{
        const angle=x/(SPACING*domain.columns*2)*TAU;
        const normal=domain.wall?new Vector3(Math.sign(domain.x),0,0):new Vector3(Math.cos(angle),0,Math.sin(angle));
        const base=domain.wall?new Vector3(domain.x,y,x):new Vector3(domain.x+normal.x*domain.radius,y,domain.z+normal.z*domain.radius);
        // The side curtain is a known solid plane below the coping.
        if(domain.wall&&y<13.25)return {point:base,normal};
        if(cached){
          if(sampleIndex>=cached.length)throw new Error('Ivy attachment cache needs rebuilding');
          const encoded=cached[sampleIndex++];
          return encoded?{point:base.add(normal.scale((encoded-30001)/10000)),normal}:null;
        }
        const ray=new Ray(base.add(normal.scale(2.5)),normal.negate(),4);
        let distance=Infinity,point:Vector3|null=null;
        for(const {mesh,surface} of buckets.get(Math.floor(y/2))??[]){
          if(surface!==(domain.wall?'wall':'tower'))continue;
          const box=mesh.getBoundingInfo().boundingBox;
          if(!ray.intersectsBoxMinMax(box.minimumWorld,box.maximumWorld))continue;
          const hit=ray.intersectsMesh(mesh,false);
          if(hit.hit&&hit.pickedPoint&&hit.distance<distance&&hit.distance<=ray.length){distance=hit.distance;point=hit.pickedPoint;}
        }
        if(!point||(!domain.wall&&depth(point)<domain.radius-.22)){
          if(baking)this.attachmentSamples.push(0);sampleIndex++;return null;
        }
        if(baking)this.attachmentSamples.push(Math.round(Vector3.Dot(point.subtract(base),normal)*10000)+30001);
        sampleIndex++;
        return {point,normal};
      };
      const path=(sample:(y:number)=>{x:number;radius:number},start:number,end:number,step:number,main=false,seed=0)=>{
        let previous:number|null=null;
        const count=Math.ceil((end-start)/step),sides=main?4:2;
        for(let j=0;j<=count;j++){
          const y=start+(end-start)*j/count,samplePoint=sample(y),hit=attach(samplePoint.x,y);
          if(!hit){previous=null;continue;}
          const next=sample(y+.01),dx=(next.x-samplePoint.x)/.01;
          const side=domain.wall?new Vector3(0,0,1):new Vector3(-hit.normal.z,0,hit.normal.x);
          const tangent=new Vector3(0,1,0).add(side.scale(dx)).normalize();
          const u=Vector3.Cross(tangent,hit.normal).normalize(),v=Vector3.Cross(tangent,u).normalize();
          const radius=samplePoint.radius,center=hit.point.add(hit.normal.scale(radius*.7+.003));
          const reach=depth(hit.point)+radius*1.7+.003,bin=Math.floor(y/.2);
          profile.set(bin,Math.max(profile.get(bin)??0,reach));
          this.stats.maxStemRadius=Math.max(this.stats.maxStemRadius,radius);
          const index=wood.positions.length/3;
          for(let k=0;k<sides;k++){
            const n=main?u.scale(Math.cos(k/4*TAU)).add(v.scale(Math.sin(k/4*TAU))):hit.normal;
            const offset=main?n.scale(radius):u.scale(k===0?-radius:radius);
            wood.positions.push(...center.add(offset).asArray());wood.normals.push(...n.asArray());
          }
          if(previous!==null){
            for(let k=0;k<(main?4:1);k++){
              const a=previous+k,b=previous+(k+1)%sides,c=index+k,d=index+(k+1)%sides;
              wood.indices.push(a,c,b,b,c,d);
            }
            this.stats.stemSegments++;
          }
          if(main&&j%2===0&&y>.3)anchors.push({...hit,random:ivyHash(seed,j+.17)});
          previous=index;
        }
      };
      const limit=domain.wall?Math.floor(21.8/SPACING):domain.columns;
      for(let id=-limit;id<(domain.wall?limit+1:limit);id++){
        const key=mod(id,domain.columns*2),random=ivyHash(key,domain.seed),phase=random*6.2831853;
        const rootX=(id+.08+random*.84)*SPACING;this.stats.roots++;
        path(y=>({x:rootX+ivyBend(y,phase),radius:(.0035+.009*Math.exp(-y*.085))*(.75+.35*random)}),
          .16,domain.height,.38,true,key+domain.seed);
        for(let branch=0;branch<domain.height/STEP;branch++){
          const variant=ivyHash(key+domain.seed,branch),anchor=branch*STEP-random*STEP;
          if(anchor<.1)continue;
          const height=1.1+.9*variant,direction=variant>.5?1:-1,reach=.5+.7*fract(variant*7.31);
          const startX=rootX+ivyBend(anchor,phase);
          path(y=>{const t=(y-anchor)/height;return {x:startX+ivyShoot(t,reach,direction,phase),radius:.005-.004*t};},
            anchor,Math.min(domain.height,anchor+height),.38);
          for(const fork of [.22,.48,.74]){
            const twigY=anchor+height*fork;if(twigY>=domain.height)continue;
            const twigX=startX+ivyShoot(fork,reach,direction,phase),twigHeight=.35+.3*variant;
            path(y=>{const t=(y-twigY)/twigHeight;return {
              x:twigX+ivyShoot(t,.2+.25*variant,-direction,phase),radius:.0035-.0028*t};},
              twigY,Math.min(domain.height,twigY+twigHeight),.28);this.stats.twigs++;
          }
        }
      }
      this.addMesh(`wood:${domain.id}`,wood,bark,root,-1);
      for(const layer of [0,1]){
        const data=buffer();
        for(const anchor of anchors){
          const r=anchor.random,n=anchor.normal,angle=(r-.5)*1.5+layer*.37;
          const right=Vector3.Cross(Vector3.Up(),n).normalize(),up=Vector3.Cross(n,right).normalize();
          const u=right.scale(Math.cos(angle)).add(up.scale(Math.sin(angle)));
          const v=up.scale(Math.cos(angle)).subtract(right.scale(Math.sin(angle)));
          const width=(1.02+r*.28)*(layer===1?.90:1),height=.84+fract(r*11.3)*.22;
          // Use the outermost branch envelope through the entire card height.
          // This also bridges projecting stone courses rather than sinking into them.
          let outer=depth(anchor.point);
          for(let y=Math.floor((anchor.point.y-1.2)/.2);y<=Math.floor((anchor.point.y+1.2)/.2);y++)outer=Math.max(outer,profile.get(y)??0);
          const shift=layer===1?u.scale(r>.5?.22:-.22).add(v.scale(.16)):Vector3.Zero();
          const center=anchor.point.add(n.scale(outer-depth(anchor.point))).add(shift);
          // Two shallow layers sit just above the fine stems. Keep enough room
          // for flutter without making the foliage float away from the wall.
          const lift=layer===0?.018:.058,fold=layer===0?.01:.012;
          const tile=Math.floor(fract(r*7.1+layer*.37)*4),tx=(tile%2)*.5,ty=Math.floor(tile/2)*.5;
          const start=data.positions.length/3,survival=.005+.99*fract(r*3.37+layer*.173);
          for(let row=0;row<3;row++)for(let col=0;col<2;col++){
            const x=col-.5,y=row*.5-.5;
            const p=center.add(u.scale(x*width)).add(v.scale(y*height)).add(n.scale(lift+(row===1?fold:0)));
            data.positions.push(...p.asArray());data.normals.push(...n.add(v.scale((row-1)*fold/height*3)).normalize().asArray());
            data.uvs.push(tx+.007+col*.486,ty+.007+row*.243);data.seeds.push(survival);
          }
          // Babylon's left-handed front-face winding must agree with outward normals.
          data.indices.push(start,start+3,start+1,start,start+2,start+3,
            start+2,start+5,start+3,start+2,start+4,start+5);
          this.stats.patches++;
        }
        this.addMesh(`leaves:${layer}:${domain.id}`,data,leaves[layer],root,layer);
      }
      // Avoid a single long construction frame while ray-fitting all six towers.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
    }
    if(cached&&sampleIndex!==cached.length)throw new Error('Ivy attachment cache sample count changed');
    this.attachmentInfo.samples=sampleIndex;
    this.stats.buildMs=performance.now()-started;
  }
  private addMesh(name:string,buffer:Buffer,material:PBRMaterial,root:TransformNode,layer:number):void {
    if(!buffer.indices.length||this.disposed)return;
    const mesh=new Mesh(`brisalia:ivy-volume:${name}`,this.scene),data=new VertexData();
    data.positions=buffer.positions;data.normals=buffer.normals;data.indices=buffer.indices;
    if(layer>=0)data.uvs=buffer.uvs;data.applyToMesh(mesh);
    if(layer>=0)mesh.setVerticesData('aurIvyLeaf',buffer.seeds,false,1);
    mesh.parent=root;mesh.material=material;mesh.isPickable=false;mesh.checkCollisions=false;
    mesh.metadata={ivyVolume:true,ivyLeaves:layer>=0,ivyLayer:layer};mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();
    this.stats.triangles+=buffer.indices.length/3;this.meshes.push(mesh);
  }
  dispose():void {
    this.disposed=true;this.scene.onBeforeRenderObservable.remove(this.observer);
    for(const mesh of this.meshes)mesh.dispose(false,false);
    for(const material of this.materials)material.dispose(false,false);
    this.meshes.length=0;
  }
}
