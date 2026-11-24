import { Color3, Light, Material, Mesh, MeshBuilder, MultiMaterial, PBRMaterial,
  PointLight, Ray, Scene, StandardMaterial, TransformNode, Vector3,
  type AbstractMesh } from '@babylonjs/core';
import { setLightEnabled, setMaterialLightBudget } from './SceneLightBudget';

export interface EntranceLampMount { x:number; y:number; z:number; front:number; doorMin:number[]; doorMax:number[] }

/** Find the actual entrance and a solid mounting surface in converted source metres. */
export function entranceLampMount(id:string,parts:Mesh[]):EntranceLampMount {
  const doors=parts.filter(m=>/entry_leaf|arched_leaf|PUERTA_Puerta_principal|west_portal_leaf/.test(m.name));
  if(!doors.length)throw new Error(`${id}: missing authored entrance for lantern`);
  const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
  for(const mesh of doors){const b=mesh.getBoundingInfo().boundingBox;min.minimizeInPlace(b.minimumWorld);max.maximizeInPlace(b.maximumWorld);}
  const front=id==='B01'?1:-1,face=front>0?max.z:min.z,y=Math.max(1.85,Math.min(2.22,max.y-.16));
  const windows=parts.filter(m=>/window|ventana/i.test(m.name));
  const solid=parts.filter(m=>!/wear|weathering|moss|herbs|daisies|herb_volume|shutter|hinge/i.test(m.name));
  // Try both jambs. Window bounds include the shutters, so their opening stays clear.
  for(const x of [max.x+.44,min.x-.44,max.x+.68,min.x-.68]){
    if(windows.some(m=>{const b=m.getBoundingInfo().boundingBox,a=b.minimumWorld,c=b.maximumWorld;
      // Rev3 B02 batches panes on different walls in one mesh. Its aggregate
      // box spans empty facade too; individual shutter bounds remain usable.
      if(c.x-a.x>3||c.z-a.z>1)return false;
      return x+.22>a.x&&x-.22<c.x&&y+.42>a.y&&y-.42<c.y&&a.z<face+.6&&c.z>face-.6;}))continue;
    const ray=new Ray(new Vector3(x,y,face+front*2),new Vector3(0,0,-front),3);
    const hits=solid.map(m=>ray.intersectsMesh(m,false)).filter(h=>h.hit&&h.pickedPoint&&h.distance<=ray.length)
      .sort((a,b)=>a.distance-b.distance);
    if(hits[0]?.pickedPoint)return {x,y,z:hits[0].pickedPoint.z+front*.018,front,doorMin:min.asArray(),doorMax:max.asArray()};
  }
  throw new Error(`${id}: no clear solid wall beside entrance`);
}

/** Shared iron/amber wall lanterns. Each light reaches only its own facade and nearby Santi. */
export class BrisaliaEntranceLanterns {
  readonly lamps=new Map<string,{root:TransformNode;light:PointLight;meshes:Mesh[];receivers:Mesh[];mount:EntranceLampMount}>();
  private readonly iron:PBRMaterial;
  private readonly glass:StandardMaterial;
  private readonly templates:Mesh[];
  private characterMeshes:AbstractMesh[]=[];
  private character:TransformNode|null=null;
  private refreshSeconds=1;

  constructor(private scene:Scene){
    this.iron=new PBRMaterial('brisalia:lantern-forged-iron',scene);
    this.iron.albedoColor=new Color3(.075,.058,.039);this.iron.metallic=.75;this.iron.roughness=.65;
    this.glass=new StandardMaterial('brisalia:lantern-amber-glass',scene);
    this.glass.disableLighting=true;this.glass.emissiveColor=new Color3(.12,.065,.018);
    const pieces:Mesh[]=[];
    const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number)=>{
      const mesh=MeshBuilder.CreateBox(`lantern:${name}`,{width:w,height:h,depth:d},scene);
      mesh.position.set(x,y,z);pieces.push(mesh);return mesh;
    };
    // Wall is Z=0, the cage hangs toward -Z. All dimensions are source metres.
    box('backplate',.13,.42,.045,0,.11,-.025);
    box('arm',.055,.055,.42,0,.40,-.23);
    const brace=box('brace',.045,.30,.045,0,.27,-.16);brace.rotation.x=-.72;
    const ring=MeshBuilder.CreateTorus('lantern:hanging-ring',{diameter:.12,thickness:.025,tessellation:12},scene);
    ring.position.set(0,.32,-.42);ring.rotation.x=Math.PI/2;pieces.push(ring);
    for(const y of [-.27,.24])box('rim',.36,.055,.32,0,y,-.42);
    for(const x of [-.155,.155])for(const z of [-.555,-.285])box('cage',.027,.49,.027,x,-.015,z);
    const cap=MeshBuilder.CreateCylinder('lantern:hipped-cap',{height:.15,diameterTop:.08,diameterBottom:.51,tessellation:4},scene);
    cap.position.set(0,.34,-.42);cap.rotation.y=Math.PI/4;pieces.push(cap);
    const foot=MeshBuilder.CreateSphere('lantern:finial',{diameter:.08,segments:6},scene);
    foot.position.set(0,-.32,-.42);pieces.push(foot);
    const frame=Mesh.MergeMeshes(pieces,true,true)!;frame.name='brisalia:lantern-frame-template';frame.material=this.iron;
    const glass=MeshBuilder.CreateBox('brisalia:lantern-glass-template',{width:.28,height:.45,depth:.24},scene);
    // Bake the glass offset so every clone uses the same local mounting origin.
    glass.position.set(0,-.015,-.42);glass.bakeCurrentTransformIntoVertices();glass.material=this.glass;
    this.templates=[frame,glass];
    for(const mesh of this.templates){mesh.setEnabled(false);mesh.isPickable=false;}
  }

  add(id:string,building:TransformNode,receivers:Mesh[],mount:EntranceLampMount):void {
    if(this.lamps.has(id))return;
    const root=new TransformNode(`${id}:entrance-lantern`,this.scene);root.parent=building;
    root.position.set(mount.x,mount.y,mount.z);root.rotation.y=mount.front>0?Math.PI:0;
    root.metadata={buildingId:id,entranceLantern:true,mount};
    const meshes=this.templates.map(template=>{
      const mesh=template.clone(`${id}:${template===this.templates[0]?'lantern-iron':'lantern-glass'}`,root)!;
      mesh.setEnabled(true);mesh.isPickable=false;mesh.checkCollisions=false;
      mesh.metadata={buildingId:id,buildingCollision:false,entranceLantern:true};return mesh;
    });
    const light=new PointLight(`${id}:entrance-warm-light`,new Vector3(0,0,-.46),this.scene);
    light.parent=root;light.diffuse=new Color3(1,.61,.25);light.specular=new Color3(.65,.32,.10);
    light.range=20;light.falloffType=Light.FALLOFF_GLTF;light.intensity=0;light.setEnabled(false);
    light.includedOnlyMeshes=[...receivers,...meshes];
    // Four global sources (sky, sun, moon, forge) plus this facade's lamp.
    // Even zero-intensity sources occupy a slot in Babylon's light selection.
    for(const mesh of [...receivers,...meshes]){
      const materials=mesh.material instanceof MultiMaterial?mesh.material.subMaterials:[mesh.material];
      for(const material of materials)if(material)setMaterialLightBudget(material,5);
    }
    this.lamps.set(id,{root,light,meshes,receivers,mount});
  }

  update(night:number,observer:{x:number;z:number},character?:TransformNode,dt=0):void {
    const strength=Number.isFinite(night)?Math.max(0,Math.min(1,night)):0;
    this.glass.emissiveColor.set(.12+1.55*strength,.065+.78*strength,.018+.22*strength);
    this.refreshSeconds+=Math.max(0,dt);
    if(character&&(character!==this.character||this.refreshSeconds>=.5)){
      this.character=character;this.refreshSeconds=0;
      const prepare=(material:Material|null):boolean=>{
        if(material instanceof MultiMaterial)return material.subMaterials.every(prepare);
        if(!(material instanceof PBRMaterial))return false;
        // Sun + sky + moon + two wayfinding lights + one entrance lantern.
        setMaterialLightBudget(material,6);return true;
      };
      this.characterMeshes=character.getChildMeshes().filter(m=>m.getTotalVertices()>0&&prepare(m.material));
    }
    const nearby=[...this.lamps.values()].map(l=>({l,d:Vector3.Distance(l.root.getAbsolutePosition(),
      new Vector3(observer.x,l.root.getAbsolutePosition().y,observer.z))})).sort((a,b)=>a.d-b.d);
    for(let i=0;i<nearby.length;i++){
      const {l,d}=nearby[i],fade=Math.max(0,Math.min(1,(115-d)/25));
      const active=i<6&&l.root.isEnabled()&&strength>0&&fade>0;
      const receivers=[...l.receivers,...l.meshes,...(i===0&&d<22?this.characterMeshes:[])];
      if(receivers.length!==l.light.includedOnlyMeshes.length||receivers.some((m,j)=>m!==l.light.includedOnlyMeshes[j]))
        l.light.includedOnlyMeshes=receivers;
      l.light.intensity=active?95*strength*fade:0;setLightEnabled(l.light,active);
    }
  }

  dispose():void {
    for(const {light,root} of this.lamps.values()){light.dispose();root.dispose(false,false);}
    this.lamps.clear();for(const mesh of this.templates)mesh.dispose(false,false);
    this.iron.dispose();this.glass.dispose();this.characterMeshes=[];this.character=null;
  }
}
