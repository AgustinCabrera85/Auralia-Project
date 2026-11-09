import { Color3, LinesMesh, Mesh, MeshBuilder, Scene, ShaderMaterial, StandardMaterial,
  TransformNode, Vector2, Vector3, Vector4, VertexBuffer, VertexData } from '@babylonjs/core';
import { createAuraliaWater, loadWaterMasks, updateAuraliaWater } from './AuraliaWaterProfiles';
import { getWorldDocument, type WaterPlacement } from './WorldEditState';
import { WATER_PROFILES } from './AuraliaWaterProfiles';
import { conformJoinedFall, joinedFallShaders } from './WaterJoin';
import { createWaterfallRibbon, fallControlPoints, waterfallFootWidth,
  waterfallImpactPoint } from './WaterfallSpline';

/** Water Lab v4 shaders are reused verbatim. Geometry is now an editable 3D
 * Bézier sheet; editor handles do not exist in the gameplay runtime. */
export class AuthoredWater {
  private readonly masks:ReturnType<typeof loadWaterMasks>;
  private readonly items=new Map<string,{mesh:Mesh;material:ShaderMaterial;body:WaterPlacement;mode:number}>();
  private time=0;
  private selectedId:string|null=null;
  private selectedHandle=-1;
  private guideHandles:Mesh[]=[];
  private guideMaterials:StandardMaterial[]=[];
  private guideLine:LinesMesh|null=null;

  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    private readonly editable=false){
    this.masks=loadWaterMasks(scene,
      '/assets/water/caustics-refractive-1k.png',
      '/assets/water/waterfall-foam-plates-1k.png');
  }
  get count():number{return this.items.size;}

  private ellipse(body:WaterPlacement):Mesh {
    const sectors=64,rings=12;
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    const rx=body.width*.5,rz=body.length*.5;
    for(let j=0;j<=rings;j++){
      const r=j/rings;
      for(let i=0;i<=sectors;i++){
        const a=i*2*Math.PI/sectors;
        positions.push(rx*r*Math.cos(a),0,rz*r*Math.sin(a));
        uvs.push(.5+.5*r*Math.cos(a),.5+.5*r*Math.sin(a));
      }
    }
    for(let j=0;j<rings;j++)for(let i=0;i<sectors;i++){
      const a=j*(sectors+1)+i,b=a+1,c=a+sectors+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    return this.fromGeometry(body,positions,uvs,indices);
  }

  private ribbon(body:WaterPlacement):Mesh {
    const half=body.width*.5;
    const pts=body.points&&body.points.length>=2?body.points:
      [[body.x-Math.sin(body.rotation)*body.length*.5,body.z-Math.cos(body.rotation)*body.length*.5],
        [body.x+Math.sin(body.rotation)*body.length*.5,body.z+Math.cos(body.rotation)*body.length*.5]];
    const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    let length=0;
    for(let i=0;i<pts.length;i++){
      const p=pts[i],a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
      if(i>0)length+=Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]);
      const dx=b[0]-a[0],dz=b[1]-a[1],norm=Math.max(.001,Math.hypot(dx,dz));
      const nx=-dz/norm,nz=dx/norm;
      for(const s of [-1,1]){
        const wx=p[0]+nx*s*half,wz=p[1]+nz*s*half;
        positions.push(wx-body.x,0,wz-body.z);
        uvs.push((s+1)*.5,length/Math.max(1,body.width));
      }
      if(i>0){const k=(i-1)*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
    return this.fromGeometry(body,positions,uvs,indices);
  }

  private waterfall(body:WaterPlacement):Mesh {
    const geometry=createWaterfallRibbon(body);
    conformJoinedFall(body,geometry);
    return this.fromGeometry(body,geometry.positions,geometry.uvs,geometry.indices);
  }

  private ocean(body:WaterPlacement):Mesh {
    const mesh=MeshBuilder.CreateGround(`authored-ocean-${body.id}`,{
      width:body.width,height:body.length,subdivisions:64},this.scene);
    mesh.parent=this.parent;mesh.position.set(body.x,body.y,body.z);
    return mesh;
  }

  private fromGeometry(body:WaterPlacement,positions:number[],uvs:number[],indices:number[]):Mesh {
    const data=new VertexData(),normals:number[]=[];
    VertexData.ComputeNormals(positions,indices,normals);
    data.positions=positions;data.indices=indices;data.uvs=uvs;data.normals=normals;
    const mesh=new Mesh(`authored-water-${body.id}`,this.scene);
    // Updatable buffers allow real-time control-point drags without recreating GLSL.
    data.applyToMesh(mesh,true);
    mesh.parent=this.parent;mesh.position.set(body.x,body.y,body.z);
    return mesh;
  }

  /** Cheap geometry-only refresh during mouse dragging, with no shader recompile. */
  refreshFall(id:string):void {
    const current=this.items.get(id);
    if(!current||current.body.profile!=='fall')return;
    const {mesh,body}=current;
    const data=createWaterfallRibbon(body),normals:number[]=[];
    conformJoinedFall(body,data);
    VertexData.ComputeNormals(data.positions,data.indices,normals);
    mesh.updateVerticesData(VertexBuffer.PositionKind,data.positions);
    mesh.updateVerticesData(VertexBuffer.NormalKind,normals);
    mesh.position.set(body.x,body.y,body.z);
    mesh.refreshBoundingInfo(true);
    if(this.selectedId===id)this.updateGuides();
  }

  private impactTargets(pool:WaterPlacement):{a:Vector4;b:Vector4;enabled:boolean}{
    const falls=getWorldDocument().water.filter(w=>w.profile==='fall'&&
      Math.hypot(waterfallImpactPoint(w)[0]-pool.x,waterfallImpactPoint(w)[2]-pool.z)<
      Math.max(pool.width,pool.length));
    const impact=falls.map(w=>{
      const p=waterfallImpactPoint(w);
      return new Vector4(p[0],p[2],waterfallFootWidth(w)*.5,1);
    });
    return {a:impact[0]??Vector4.Zero(),b:impact[1]??Vector4.Zero(),enabled:impact.length>0};
  }

  sync():void{
    this.clear();
    for(const body of getWorldDocument().water){
      const mode={ocean:0,river:1,fall:2,pool:3}[body.profile];
      const mesh=body.profile==='ocean'?this.ocean(body):
        body.profile==='river'?this.ribbon(body):
        body.profile==='fall'?this.waterfall(body):this.ellipse(body);
      const preset=getWorldDocument().waterPresets[body.profile];
      const shaderOverride=body.profile==='fall'&&body.joinToLegacyRiver
        ?joinedFallShaders(preset?.vertex??WATER_PROFILES.fall.vertex,
          preset?.fragment??WATER_PROFILES.fall.fragment):preset;
      const material=createAuraliaWater(this.scene,body.profile,this.masks,mode,
        {...(preset?.params??{}),...(body.params??{})},shaderOverride);
      mesh.material=material;
      // The game runtime remains non-pickable; the editor can select water.
      mesh.isPickable=this.editable;mesh.checkCollisions=false;
      mesh.alphaIndex=2;
      mesh.metadata={authoredWater:true,waterId:body.id};
      this.items.set(body.id,{mesh,material,mode,body});
    }
    this.updateGuides();
  }

  /** Called only by the editor. Makes four directly draggable 3D handles. */
  setSelected(id:string|null):void{
    if(!this.editable)return;
    if(this.selectedId===id)return;
    this.selectedId=id;
    this.selectedHandle=-1;
    this.updateGuides();
  }
  setSelectedHandle(index:number):void{
    this.selectedHandle=index;
    this.updateGuides();
  }
  private makeGuides():void{
    if(this.guideHandles.length)return;
    const colors=['#b5ee99','#70daf8','#ffd17d','#ff956f'];
    for(let index=0;index<4;index++){
      const handle=MeshBuilder.CreateSphere(`fall-handle-${index}`,{diameter:2.2,segments:10},this.scene);
      handle.isPickable=true;
      handle.metadata={waterFallHandle:index};
      handle.renderingGroupId=2;
      const mat=new StandardMaterial(`fall-handle-mat-${index}`,this.scene);
      mat.diffuseColor=Color3.FromHexString(colors[index]);
      mat.emissiveColor=Color3.FromHexString(colors[index]).scale(.45);
      mat.disableLighting=true;
      mat.disableDepthWrite=true;
      handle.material=mat;
      this.guideMaterials.push(mat);
      this.guideHandles.push(handle);
    }
  }
  private updateGuides():void{
    const current=this.selectedId?this.items.get(this.selectedId):null;
    if(!current||current.body.profile!=='fall'){
      for(const handle of this.guideHandles)handle.setEnabled(false);
      this.guideLine?.setEnabled(false);
      return;
    }
    this.makeGuides();
    const points=fallControlPoints(current.body);
    for(let i=0;i<4;i++){
      const handle=this.guideHandles[i];
      handle.setEnabled(true);
      handle.position.set(points[i][0],points[i][1],points[i][2]);
      handle.metadata={waterFallHandle:i,waterId:current.body.id};
      handle.scaling.setAll(i===this.selectedHandle?1.7:1);
    }
    const vertices=createWaterfallRibbon(current.body,64,1).centerline.map(p=>
      new Vector3(p[0],p[1],p[2]));
    if(this.guideLine){
      this.guideLine=MeshBuilder.CreateLines('fall-guide',{points:vertices,instance:this.guideLine},this.scene);
      this.guideLine.setEnabled(true);
    }else{
      this.guideLine=MeshBuilder.CreateLines('fall-guide',{points:vertices,updatable:true},this.scene);
      this.guideLine.color=new Color3(.99,.85,.45);
      this.guideLine.isPickable=false;
      this.guideLine.renderingGroupId=2;
    }
  }

  update(dt:number):void {
    this.time+=dt;
    const camera=this.scene.activeCamera?.globalPosition??new Vector3(0,10,0);
    const sun=new Vector3(.5,.9,-.3).normalize();
    for(const {body,material,mode} of this.items.values()){
      const impact=this.impactTargets(body);
      updateAuraliaWater(material,body.profile,mode,{
        time:this.time,camera,sunDirection:sun,
        shoreX:body.x+body.width*.5,poolCenter:new Vector2(body.x,body.z),
        poolRadius:body.width*.5,
        impactA:impact.a,impactB:impact.b,impactEnabled:body.profile==='pool'&&impact.enabled,
        rockEnabled:body.profile==='fall'&&body.rockEnabled===true,
        rockInfo:new Vector4(body.rockX??body.x,body.rockY??body.y-body.length*.4,
          body.rockRadius??2.3,(body.rockRadius??2.3)*.64)
      });
    }
    // Keep handles usable at different zoom levels without scaling water itself.
    if(this.guideHandles.length&&this.selectedId){
      const scale=Math.max(.8,Math.min(4,camera.subtract(this.guideHandles[0].position).length()/100));
      for(const [i,handle] of this.guideHandles.entries())
        handle.scaling.setAll(scale*(i===this.selectedHandle?1.5:1));
    }
  }
  clear():void{
    for(const item of this.items.values()){
      item.mesh.dispose(false,false);item.material.dispose(false,false);
    }
    this.items.clear();
  }
  dispose():void{
    this.clear();
    for(const handle of this.guideHandles)handle.dispose(false,false);
    this.guideHandles=[];
    for(const mat of this.guideMaterials)mat.dispose();
    this.guideMaterials=[];
    this.guideLine?.dispose();this.guideLine=null;
    this.masks.caustics.dispose();this.masks.waterfall.dispose();
  }
}
