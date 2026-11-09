import { Color3, DynamicTexture, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Texture,
  TransformNode, Vector3, Vector4, VertexData, VertexBuffer } from '@babylonjs/core';
import { bridgeRailBlocks, bridgeSurfaceAt, CHAMBER_RADIUS, createBridgeRoutes, MOUNTAIN_PORTALS,
  TUNNEL_LINKS, TUNNEL_NODES, TUNNEL_RADIUS, tunnelFloorAt, type BridgeRoute } from './mountainRoutes';
import { ChainDynamics } from '../physics/ChainDynamics';
import { HangingLanterns } from './HangingLanterns';
import { createMountainTrails, mountainTrailSurfaceAt, type MountainTrail } from './mountainTrails';

/** One regional connection system: shared materials, streamed exteriors, and
 * a real branched interior instantiated only while the player explores it. */
export class MountainPassSystem {
  readonly bridges:BridgeRoute[];
  readonly trails:MountainTrail[];
  readonly portals=new Map<string,TransformNode>();
  private readonly bridgeRoots:TransformNode[]=[];
  private readonly trailRoots:TransformNode[]=[];
  private interior:TransformNode|null=null;
  private lamp:PointLight|null=null;
  private readonly stone:StandardMaterial;
  private readonly deck:StandardMaterial;
  private readonly glow:StandardMaterial;
  private readonly dark:StandardMaterial;
  private readonly crystal:StandardMaterial;
  private readonly signs:StandardMaterial;
  private entryId:string|null=null;
  readonly secondaryDynamics=new ChainDynamics();
  private readonly hanging:HangingLanterns[]=[];
  private time=0;
  private readonly focus={x:0,y:0,z:0};
  private readonly playerCollider={id:1,kind:'capsule' as const,x:0,y:0,z:0,bx:0,by:0,bz:0,radius:.48,group:1,mask:1,friction:.4,restitution:0};
  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    private readonly heightAt:(x:number,z:number)=>number){
    this.stone=new StandardMaterial('pasos-roca',scene);
    this.stone.diffuseTexture=new Texture('/assets/terrain/biomes/textures/albedo/biome_volcanico_basalto_albedo_1k.webp',scene);
    this.stone.diffuseColor=new Color3(.72,.76,.79);this.stone.specularColor=Color3.Black();
    this.stone.backFaceCulling=false;this.stone.twoSidedLighting=true;
    this.deck=new StandardMaterial('pasos-piedra-tallada',scene);
    const masonry=new DynamicTexture('puente-losas',{width:256,height:256},scene,true);
    const ctx=masonry.getContext();ctx.fillStyle='#494d46';ctx.fillRect(0,0,256,256);
    for(let row=0;row<8;row++)for(let col=-1;col<4;col++){
      const shade=139+Math.round(16*Math.sin(row*7+col*3));
      ctx.fillStyle=`rgb(${shade},${shade+3},${shade-7})`;
      ctx.fillRect(col*80+(row%2)*40+2,row*32+2,77,29);
    }masonry.update();masonry.wrapU=masonry.wrapV=Texture.WRAP_ADDRESSMODE;this.deck.diffuseTexture=masonry;
    this.deck.diffuseColor=new Color3(.92,.9,.82);this.deck.specularColor=Color3.Black();
    this.deck.backFaceCulling=false;this.deck.twoSidedLighting=true;
    this.glow=new StandardMaterial('pasos-faroles',scene);
    this.glow.emissiveColor=new Color3(.75,.53,.21);
    this.dark=new StandardMaterial('pasos-umbral',scene);this.dark.diffuseColor=new Color3(.015,.02,.025);
    this.crystal=new StandardMaterial('pasos-cristales',scene);
    this.crystal.diffuseColor=new Color3(.12,.4,.48);this.crystal.emissiveColor=new Color3(.04,.25,.32);
    this.signs=new StandardMaterial('pasos-indicaciones',scene);
    const labels=new DynamicTexture('rutas-destinos',{width:512,height:256},scene,false);
    const labelCtx=labels.getContext() as CanvasRenderingContext2D;labelCtx.fillStyle='#302c21';labelCtx.fillRect(0,0,512,256);
    labelCtx.fillStyle='#f6dfaa';labelCtx.font='bold 26px Georgia';labelCtx.textAlign='center';
    ['Altapiedra · Cordillera','Altaluz · Paso Oriental','Altapiedra · Viaducto','Altaluz · Viaducto']
      .forEach((label,i)=>labelCtx.fillText(label,256,i*64+42));labels.update();
    this.signs.diffuseTexture=labels;this.signs.specularColor=Color3.Black();this.signs.emissiveColor=new Color3(.14,.12,.08);
    this.secondaryDynamics.enabled=typeof location==='undefined'||new URLSearchParams(location.search).get('secondaryPhysics')!=='0';
    this.bridges=createBridgeRoutes(heightAt);
    this.trails=createMountainTrails(heightAt,this.bridges);
    for(const route of this.bridges)this.bridgeRoots.push(this.buildBridge(route));
    for(const trail of this.trails)this.trailRoots.push(this.buildTrail(trail));
    for(let b=0;b<2;b++)for(let end=0;end<2;end++){
      const route=this.bridges[b],p=end?route.points.at(-1)!:route.points[0],root=this.bridgeRoots[b];
      const x=p.x,z=p.z+route.width/2+.8,y=this.heightAt(x,z),label=b*2+end;
      this.box('poste-direcciones',.35,4,.35,new Vector3(x,y+2,z),this.deck,root);
      const sign=MeshBuilder.CreatePlane('destino-'+route.id+'-'+end,{width:6,height:1.1,
        sideOrientation:Mesh.DOUBLESIDE,frontUVs:new Vector4(0,1-(label+1)/4,1,1-label/4),
        backUVs:new Vector4(0,1-(label+1)/4,1,1-label/4)},scene);
      sign.position.set(x,y+3.5,z);sign.material=this.signs;sign.parent=root;sign.isPickable=false;
    }
    for(const p of MOUNTAIN_PORTALS)this.portals.set(p.id,this.buildPortal(p.id,p.x,p.z));
  }
  get inside():boolean{return this.interior!==null;}
  visualFor(id:string):TransformNode|undefined{
    return this.portals.get(id)??this.bridgeRoots.find(root=>root.name===id);
  }
  get returnPortal(){return MOUNTAIN_PORTALS.find(p=>p.id===this.entryId)??MOUNTAIN_PORTALS[0];}
  exteriorHeight(x:number,z:number):number{return bridgeSurfaceAt(this.bridges,x,z)?.height??
    mountainTrailSurfaceAt(this.trails,x,z)?.height??this.heightAt(x,z);}
  nearestPortal(x:number,y:number,z:number){
    return MOUNTAIN_PORTALS.find(p=>{
      const n=this.inside?TUNNEL_NODES[p.node]:{x:p.x,z:p.z,y:this.exteriorHeight(p.x,p.z)};
      return Math.hypot(x-n.x,z-n.z)<8&&Math.abs(y-n.y)<4;
    });
  }
  enter(id:string):Vector3|null{
    const p=MOUNTAIN_PORTALS.find(p=>p.id===id);if(!p)return null;
    if(!this.interior)this.buildInterior();this.entryId=id;
    const n=TUNNEL_NODES[p.node];return new Vector3(n.x,n.y,n.z);
  }
  leave(id:string):Vector3|null{
    const p=MOUNTAIN_PORTALS.find(p=>p.id===id);if(!p)return null;
    this.disposeInterior();
    this.entryId=null;return new Vector3(p.x,this.exteriorHeight(p.x,p.z),p.z);
  }
  update(x:number,y:number,z:number,dt=1/60):void{
    for(let i=0;i<this.bridges.length;i++){
      const points=this.bridges[i].points;
      this.bridgeRoots[i].setEnabled(!this.inside&&points.some(p=>Math.hypot(p.x-x,p.z-z)<850));
    }
    for(let i=0;i<this.trails.length;i++){
      const b=this.trails[i].bounds;
      this.trailRoots[i].setEnabled(!this.inside&&x>b.minX-500&&x<b.maxX+500&&z>b.minZ-500&&z<b.maxZ+500);
    }
    for(const [id,root] of this.portals){const p=MOUNTAIN_PORTALS.find(p=>p.id===id)!;
      root.setEnabled(!this.inside&&Math.hypot(p.x-x,p.z-z)<550);}
    if(this.lamp)this.lamp.position.set(x,y+4,z);
    this.time+=Math.min(dt,.1);this.focus.x=x;this.focus.y=y;this.focus.z=z;
    const player=this.playerCollider;
    if(Math.hypot(player.x-x,player.y-y-.5,player.z-z)>.01){
      player.x=player.bx=x;player.z=player.bz=z;player.y=y+.5;player.by=y+1.6;
      this.secondaryDynamics.setCollider(player);
    }
    for(const group of this.hanging)group.prepare(this.time,this.inside);
    this.secondaryDynamics.advance(dt,this.focus);
    for(const group of this.hanging){group.render(this.secondaryDynamics.alpha);this.secondaryDynamics.metrics.reconstructionMs+=group.reconstructionMs;}
  }
  private root(name:string):TransformNode{const r=new TransformNode(name,this.scene);r.parent=this.parent;return r;}
  private box(name:string,w:number,h:number,d:number,p:Vector3,mat:StandardMaterial,root:TransformNode):Mesh{
    const m=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
    m.position.copyFrom(p);m.material=mat;m.parent=root;m.isPickable=false;return m;
  }
  private tube(name:string,path:Vector3[],radius:number,mat:StandardMaterial,root:TransformNode):Mesh{
    const m=MeshBuilder.CreateTube(name,{path,radius,tessellation:10,sideOrientation:Mesh.DOUBLESIDE},this.scene);
    // Use metres along the tube, not one texture stretched over a 200 m gallery.
    const uv=m.getVerticesData(VertexBuffer.UVKind);
    if(uv){let length=0;for(let i=1;i<path.length;i++)length+=Vector3.Distance(path[i-1],path[i]);
      for(let i=0;i<uv.length;i+=2){uv[i]*=Math.PI*radius/3;uv[i+1]*=length/6;}
      m.setVerticesData(VertexBuffer.UVKind,uv);}
    m.material=mat;m.parent=root;m.isPickable=false;return m;
  }
  private merge(root:TransformNode):void{
    const groups=new Map<StandardMaterial,Mesh[]>();
    for(const mesh of root.getChildMeshes(false))if(mesh instanceof Mesh){
      mesh.computeWorldMatrix(true);const mat=mesh.material as StandardMaterial;
      const group=groups.get(mat)??[];group.push(mesh);groups.set(mat,group);
    }
    for(const meshes of groups.values())if(meshes.length>1){
      const merged=Mesh.MergeMeshes(meshes,true,true);if(merged){merged.parent=root;merged.isPickable=false;}
    }
  }
  private buildTrail(trail:MountainTrail):TransformNode{
    const root=this.root(trail.id),positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[];
    const walls:number[]=[],wallIndices:number[]=[],wallUV:number[]=[],wallNormals:number[]=[];
    let along=0;
    for(let i=0;i<trail.points.length;i++){
      const p=trail.points[i],prev=trail.points[Math.max(0,i-1)],next=trail.points[Math.min(i+1,trail.points.length-1)];
      const dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
      if(i)along+=Math.hypot(p.x-prev.x,p.z-prev.z);
      for(const side of [-1,1]){
        const x=p.x+nx*trail.width*.5*side,z=p.z+nz*trail.width*.5*side;
        positions.push(x,p.y,z);uvs.push(side*trail.width/8,along/8);
        let ground=Math.min(p.y-.15,this.heightAt(x,z)-.25);
        // Leave an arched opening under stream crossings instead of extending
        // retaining walls across the channel. Walking support remains shared.
        const crossing=trail.crossings.find(c=>i>=c.start&&i<=c.end);
        if(crossing){
          const t=(i-crossing.start)/(crossing.end-crossing.start);
          ground=Math.max(ground,p.y-.65-4.5*(1-Math.sin(Math.PI*t)));
        }
        walls.push(x,p.y-.03,z,x,ground,z);wallUV.push(along/5,p.y/5,along/5,ground/5);
      }
      if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);
        for(const side of [0,2]){const a=(i-1)*4+side;wallIndices.push(a,a+1,a+4,a+1,a+5,a+4);}}
    }
    for(const [name,pos,idx,uv,norm,material] of [
      ['senda',positions,indices,uvs,normals,this.deck],['contencion',walls,wallIndices,wallUV,wallNormals,this.stone]
    ] as const){
      const mesh=new Mesh(name+'-'+trail.id,this.scene),data=new VertexData();
      VertexData.ComputeNormals(pos,idx,norm);Object.assign(data,{positions:pos,indices:idx,uvs:uv,normals:norm});
      data.applyToMesh(mesh);mesh.material=material;mesh.parent=root;mesh.isPickable=false;mesh.freezeWorldMatrix();
    }
    return root;
  }
  private buildBridge(route:BridgeRoute):TransformNode{
    const root=this.root(route.id),positions:number[]=[],indices:number[]=[],uvs:number[]=[],normals:number[]=[];
    let along=0;
    for(let i=0;i<route.points.length;i++){
      const p=route.points[i],other=route.points[Math.min(i+1,route.points.length-1)],prev=route.points[Math.max(0,i-1)];
      const dx=other.x-prev.x,dz=other.z-prev.z,len=Math.hypot(dx,dz),nx=-dz/len,nz=dx/len;
      if(i)along+=Math.hypot(p.x-prev.x,p.z-prev.z);
      for(const side of [-1,1]){positions.push(p.x+nx*route.width/2*side,p.y,p.z+nz*route.width/2*side);uvs.push(side*route.width/8,along/8);}
      if(i){const a=(i-1)*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
      if(i%8===0){
        const ground=this.heightAt(p.x,p.z),height=p.y-ground;
        if(height>2){this.box('pilar-viaducto',4.2,height-1.5,4.2,new Vector3(p.x,ground+(height-1.5)/2,p.z),this.stone,root);
          this.box('zapata-viaducto',7,2,7,new Vector3(p.x,ground+.4,p.z),this.stone,root);}
        if(bridgeRailBlocks(route,p.x,p.z))for(const side of [-1,1])this.box('poste-baranda',.65,1.9,.65,
          new Vector3(p.x+nx*side*(route.width/2-.2),p.y+1,p.z+nz*side*(route.width/2-.2)),this.deck,root);
      }
    }
    const mesh=new Mesh('tablero-'+route.id,this.scene),data=new VertexData();
    VertexData.ComputeNormals(positions,indices,normals);Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);
    mesh.material=this.deck;mesh.parent=root;mesh.isPickable=false;
    for(const side of [-1,1]){
      const a=route.points[0],b=route.points.at(-1)!,len=Math.hypot(b.x-a.x,b.z-a.z);
      const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
      let section:Vector3[]=[];
      const flush=()=>{if(section.length>1){this.tube('pasamanos-piedra',section,.22,this.deck,root);
        this.tube('baranda-inferior',section.map(p=>p.add(new Vector3(0,-.85,0))),.15,this.deck,root);}section=[];};
      for(const p of route.points){
        if(!bridgeRailBlocks(route,p.x,p.z)){flush();continue;}
        section.push(new Vector3(p.x+nx*side*(route.width/2-.2),p.y+1.75,p.z+nz*side*(route.width/2-.2)));
      }flush();
      this.tube('viga-longitudinal',route.points.map(p=>new Vector3(p.x+nx*side*(route.width/2-.6),p.y-.55,p.z+nz*side*(route.width/2-.6))),.42,this.stone,root);
      for(let i=1;i<route.points.length;i++){
        const a=route.points[i-1],b=route.points[i],length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
        const fascia=this.box('canto-tablero',length+.08,1.05,.55,
          new Vector3((a.x+b.x)/2+nx*side*route.width/2,(a.y+b.y)/2-.53,(a.z+b.z)/2+nz*side*route.width/2),this.deck,root);
        fascia.rotation.z=Math.atan2(b.y-a.y,Math.hypot(b.x-a.x,b.z-a.z));
        fascia.rotation.y=-Math.atan2(b.z-a.z,b.x-a.x);
      }
    }
    for(let i=8;i<route.points.length;i+=8){
      const a=route.points[i-8],b=route.points[i];
      if(Math.min(a.y-this.heightAt(a.x,a.z),b.y-this.heightAt(b.x,b.z))<7)continue;
      const path=Array.from({length:13},(_,k)=>{const t=k/12;
        return new Vector3(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t-8+Math.sin(t*Math.PI)*6.8,a.z+(b.z-a.z)*t);});
      this.tube('arco-portante',path,1.05,this.stone,root);
    }
    this.merge(root);return root;
  }
  private buildPortal(id:string,x:number,z:number):TransformNode{
    const root=this.root('acceso-'+id),y=this.exteriorHeight(x,z);
    this.tube('arco-minero',Array.from({length:17},(_,i)=>{
      const a=i*Math.PI/16;return new Vector3(x+Math.cos(a)*4.3,y+3+Math.sin(a)*4.3,z-4);
    }),1.25,this.stone,root);
    for(const side of [-1,1]){
      this.box('jamba',2.1,4,3,new Vector3(x+side*4.3,y+1.7,z-4),this.stone,root);
    }
    this.box('umbral',7.5,6,.3,new Vector3(x,y+3,z-4.4),this.dark,root);
    this.box('descanso-entrada',11,.35,11,new Vector3(x,y-.22,z),this.deck,root);
    this.merge(root);
    this.hanging.push(new HangingLanterns(this.scene,root,this.secondaryDynamics,
      [-1,1].map(side=>({x:x+side*3,y:y+6.8,z:z-2,length:2.35})),this.dark,this.glow));
    return root;
  }
  private buildInterior():void{
    const root=this.root('galerias-ferragris');this.interior=root;
    const quad=(name:string,points:Vector3[],mat:StandardMaterial)=>{
      const mesh=new Mesh(name,this.scene),data=new VertexData(),normals:number[]=[];
      const positions=points.flatMap(p=>[p.x,p.y,p.z]),indices=[0,1,2,0,2,3];
      const width=Vector3.Distance(points[0],points[1])/5,height=Vector3.Distance(points[1],points[2])/5;
      VertexData.ComputeNormals(positions,indices,normals);
      const horizontal=points.every(p=>Math.abs(p.y-points[0].y)<.001);
      const uvs=horizontal?points.flatMap(p=>[p.x/5,p.z/5]):[0,0,width,0,width,height,0,height];
      Object.assign(data,{positions,indices,normals,uvs});data.applyToMesh(mesh);
      mesh.parent=root;mesh.material=mat;mesh.isPickable=false;
    };
    for(const [a,b] of TUNNEL_LINKS){
      const start=TUNNEL_NODES[a],end=TUNNEL_NODES[b];
      const length=Math.hypot(end.x-start.x,end.z-start.z),dx=(end.x-start.x)/length,dz=(end.z-start.z)/length;
      // Exact circle/strip intersection closes junctions. The former round
      // tube left triangular sky leaks at floor level and through the vault.
      const lo=Math.sqrt(CHAMBER_RADIUS**2-TUNNEL_RADIUS**2)/length,hi=1-lo;
      const ts=[lo,CHAMBER_RADIUS/length,1-CHAMBER_RADIUS/length,hi];
      for(let d=24;d<length-CHAMBER_RADIUS;d+=24)ts.push(d/length);
      ts.sort((a,b)=>a-b);
      const point=(t:number,side:number,h:number)=>new Vector3(start.x+dx*length*t-dz*TUNNEL_RADIUS*side,
        tunnelFloorAt(start,end,t)+h,start.z+dz*length*t+dx*TUNNEL_RADIUS*side);
      for(let i=1;i<ts.length;i++){
        const t0=ts[i-1],t1=ts[i];
        quad('suelo-galeria',[point(t0,-1,-.015),point(t1,-1,-.015),point(t1,1,-.015),point(t0,1,-.015)],this.deck);
        quad('techo-galeria',[point(t0,-1,10),point(t1,-1,10),point(t1,1,10),point(t0,1,10)],this.stone);
        for(const side of [-1,1]){
          quad('pared-galeria',[point(t0,side,-.05),point(t1,side,-.05),point(t1,side,10.02),point(t0,side,10.02)],this.stone);
          if(t1>.06&&t1<.94){
            const post=this.box('refuerzo-minero',.4,9.7,.5,point(t1,side*.96,4.85),this.deck,root);
            post.rotation.y=-Math.atan2(dz,dx);
            this.box('baliza-galeria',.3,.5,.3,point(t1,side*.93,2.7),this.glow,root);
          }
        }
      }
    }
    for(const [id,n] of Object.entries(TUNNEL_NODES)){
      const neighbors=TUNNEL_LINKS.filter(([a,b])=>a===id||b===id).map(([a,b])=>TUNNEL_NODES[a===id?b:a]);
      const wrap=(angle:number)=>(angle+Math.PI*4)%(Math.PI*2),half=Math.asin(TUNNEL_RADIUS/CHAMBER_RADIUS);
      const directions=neighbors.map(p=>Math.atan2(p.z-n.z,p.x-n.x));
      const angles=Array.from({length:65},(_,i)=>i*Math.PI/32);
      for(const d of directions)angles.push(wrap(d-half),wrap(d+half));angles.sort((a,b)=>a-b);
      const edge=(angle:number,h:number)=>new Vector3(n.x+Math.cos(angle)*CHAMBER_RADIUS,n.y+h,n.z+Math.sin(angle)*CHAMBER_RADIUS);
      for(let i=1;i<angles.length;i++){
        const a=angles[i-1],b=angles[i],mid=(a+b)/2;
        // Floors/ceilings use these exact boundary vertices too, eliminating
        // gaps caused by a disc with a different tessellation at the opening.
        for(const h of [0,10])quad(h?'techo-sala':'suelo-sala',[
          new Vector3(n.x,n.y+h,n.z),edge(a,h),edge(b,h),new Vector3(n.x,n.y+h,n.z)],h?this.stone:this.deck);
        if(directions.some(d=>Math.abs(Math.atan2(Math.sin(mid-d),Math.cos(mid-d)))<half))continue;
        quad('pared-sala',[edge(a,0),edge(b,0),edge(b,10),edge(a,10)],this.stone);
      }
      if(id==='cristales')for(let i=0;i<9;i++){
        const angle=i*2.399,height=1.4+(i%4)*.7;
        const crystal=MeshBuilder.CreateCylinder('veta-cristal',{height,diameterTop:0,diameterBottom:1.2,tessellation:5},this.scene);
        crystal.position.set(n.x+Math.cos(angle)*8,n.y+height/2,n.z+Math.sin(angle)*8);
        crystal.rotation.z=Math.sin(angle)*.18;crystal.parent=root;crystal.material=this.crystal;crystal.isPickable=false;
      }
    }
    this.merge(root);
    this.hanging.push(new HangingLanterns(this.scene,root,this.secondaryDynamics,
      Object.values(TUNNEL_NODES).map(n=>({x:n.x,y:n.y+9.9,z:n.z,length:2})),this.dark,this.glow));
    const meshes=root.getChildMeshes();
    for(const light of this.scene.lights)light.excludedMeshes.push(...meshes);
    this.lamp=new PointLight('luz-explorador',Vector3.Zero(),this.scene);
    this.lamp.diffuse=new Color3(1,.84,.67);this.lamp.intensity=2.2;this.lamp.range=65;
    this.lamp.includedOnlyMeshes=meshes;
  }
  private disposeInterior():void{
    if(!this.interior)return;
    const meshes=new Set(this.interior.getChildMeshes());
    for(const light of this.scene.lights)light.excludedMeshes=light.excludedMeshes.filter(m=>!meshes.has(m));
    this.lamp?.dispose();this.lamp=null;
    for(let i=this.hanging.length-1;i>=0;i--)if(this.hanging[i].root===this.interior){this.hanging[i].dispose();this.hanging.splice(i,1);}
    this.interior.dispose(false,false);this.interior=null;
  }
  dispose():void{
    this.disposeInterior();
    for(const group of this.hanging)group.dispose();this.hanging.length=0;this.secondaryDynamics.dispose();
    for(const root of [...this.bridgeRoots,...this.trailRoots,...this.portals.values()])root.dispose(false,false);
    for(const mat of [this.stone,this.deck,this.glow,this.dark,this.crystal,this.signs])mat.dispose(false,true);
  }
}
