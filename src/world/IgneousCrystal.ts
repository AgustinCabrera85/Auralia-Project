import { AbstractMesh, AssetContainer, Constants, Light, Mesh, MeshBuilder,
  PBRMaterial, PointLight, Scene, ShaderMaterial, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';

/** The existing red crystal model, reserved for the final chamber. No full-screen glow pass. */
export class IgneousCrystal {
  readonly root:TransformNode;
  readonly meshes:AbstractMesh[]=[];
  readonly light:PointLight;
  private readonly pivot:TransformNode;
  private readonly gems:PBRMaterial[]=[];
  private readonly sparks:AbstractMesh[]=[];
  private readonly aura:Mesh;
  private readonly auraMaterial:ShaderMaterial;
  private readonly sparkMaterial:StandardMaterial;
  private time=0;
  private awakened=false;
  private surge=0;

  constructor(scene:Scene,private readonly container:AssetContainer,position:Vector3,height:number){
    this.root=new TransformNode('cristal-unico-reino-igneo',scene);this.root.position.copyFrom(position);
    this.pivot=new TransformNode('cristal-igneo-levitacion',scene);this.pivot.parent=this.root;
    container.addAllToScene();
    const parts=container.meshes.filter(m=>m.getTotalVertices()>0);
    const min=new Vector3(Infinity,Infinity,Infinity),max=min.scale(-1);
    for(const mesh of parts){mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;
      min.minimizeInPlace(box.minimumWorld);max.maximizeInPlace(box.maximumWorld);}
    const size=max.y-min.y;
    if(!Number.isFinite(size)||size<=0)throw new Error('Cristal ígneo sin geometría válida');
    const model=new TransformNode('cristal-igneo-modelo',scene);model.parent=this.pivot;
    const scale=height/size;model.scaling.setAll(scale);
    model.position.set(-(min.x+max.x)*.5*scale,-min.y*scale,-(min.z+max.z)*.5*scale);
    for(const node of container.rootNodes)node.parent=model;
    for(const mesh of parts){
      mesh.isPickable=false;mesh.checkCollisions=false;
      const mat=mesh.material;
      if(mat instanceof PBRMaterial&&!this.gems.includes(mat)){
        // Retain the painted red facets; their texture also modulates the inner fire.
        mat.metallic=.16;mat.roughness=.24;
        mat.clearCoat.isEnabled=true;mat.clearCoat.intensity=.65;mat.clearCoat.roughness=.18;
        mat.emissiveTexture=mat.albedoTexture;mat.emissiveColor.set(.95,.48,.12);
        mat.maxSimultaneousLights=9;this.gems.push(mat);
      }
      this.meshes.push(mesh);
    }
    this.auraMaterial=new ShaderMaterial('cristal-igneo-halo',scene,{
      vertexSource:'precision highp float; attribute vec3 position; attribute vec2 uv; uniform mat4 worldViewProjection; varying vec2 vUV; void main(){vUV=uv;gl_Position=worldViewProjection*vec4(position,1.);}',
      fragmentSource:'precision highp float; varying vec2 vUV; uniform float strength; void main(){float r=length((vUV-.5)*2.);float a=pow(max(0.,1.-r),3.)*strength;gl_FragColor=vec4(1.,.19,.018,a);}'
    },{attributes:['position','uv'],uniforms:['worldViewProjection','strength'],needAlphaBlending:true});
    this.auraMaterial.alphaMode=Constants.ALPHA_ADD;this.auraMaterial.disableDepthWrite=true;
    this.auraMaterial.backFaceCulling=false;
    this.aura=MeshBuilder.CreatePlane('cristal-igneo-aura',{size:height*1.7},scene);
    this.aura.parent=this.root;this.aura.position.y=height*.48;
    this.aura.billboardMode=Mesh.BILLBOARDMODE_ALL;this.aura.material=this.auraMaterial;
    this.aura.isPickable=false;this.meshes.push(this.aura);
    this.sparkMaterial=new StandardMaterial('cristal-igneo-brasas',scene);
    this.sparkMaterial.disableLighting=true;this.sparkMaterial.emissiveColor.set(1,.42,.045);
    const spark=MeshBuilder.CreateSphere('cristal-igneo-brasa-0',{diameter:.065,segments:2},scene);
    spark.material=this.sparkMaterial;
    for(let i=0;i<24;i++){
      const ember=i===0?spark:spark.createInstance('cristal-igneo-brasa-'+i);
      ember.parent=this.root;ember.isPickable=false;this.sparks.push(ember);this.meshes.push(ember);
    }
    this.light=new PointLight('igneo-cristal-poder',position.add(new Vector3(0,height*.45,0)),scene);
    this.light.diffuse.set(1,.27,.045);this.light.specular.set(1,.62,.25);
    this.light.range=height*3;this.light.radius=height*.4;this.light.falloffType=Light.FALLOFF_STANDARD;
    this.update(0);
    // Receiver assignment happens before the first render, after normalization.
    for(const mesh of this.meshes)mesh.computeWorldMatrix(true);
  }
  setAwakened(awakened:boolean):void{
    if(awakened&&!this.awakened)this.surge=1;
    this.awakened=awakened;
  }
  setActive(active:boolean):void{this.root.setEnabled(active);this.light.setEnabled(active);}
  update(dt:number):void{
    this.time+=dt;this.surge=Math.max(0,this.surge-dt*.42);
    const pulse=.5+.5*Math.sin(this.time*1.35),boost=this.surge*.45;
    this.pivot.position.y=.12+Math.sin(this.time*1.1)*.09;
    this.pivot.rotation.y=Math.sin(this.time*.35)*.06;
    for(const mat of this.gems)mat.emissiveColor.set(.82+pulse*.26+boost,.42+pulse*.12+boost*.4,.1+pulse*.04);
    this.auraMaterial.setFloat('strength',.16+pulse*.035+boost*.22);
    this.light.intensity=.85+pulse*.12+boost;
    const height=this.light.range/3;
    for(let i=0;i<this.sparks.length;i++){
      const progress=(i/this.sparks.length+this.time*(.07+(i%3)*.012))%1;
      const a=i*2.399+this.time*.28,r=height*(.22+.08*Math.sin(i*7.1+progress*3));
      this.sparks[i].position.set(Math.cos(a)*r,height*(.1+progress*.95),Math.sin(a)*r);
      this.sparks[i].scaling.setAll(Math.sin(progress*Math.PI)*(.65+(i%4)*.22));
    }
  }
  dispose():void{
    this.light.dispose();this.container.dispose();this.root.dispose();
    this.auraMaterial.dispose();this.sparkMaterial.dispose();
  }
}
