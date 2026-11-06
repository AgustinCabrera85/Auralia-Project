import { Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial,
  TransformNode, Vector3 } from '@babylonjs/core';

/** Firewood and a small animated fire inside the blacksmith crucible's open arch. */
export class ForgeFire {
  private readonly meshes:Mesh[]=[];
  private readonly materials:StandardMaterial[]=[];
  private readonly flames:TransformNode[]=[];
  private readonly light:PointLight;

  constructor(scene:Scene,root:TransformNode){
    const material=(name:string,diffuse:string,emissive?:string):StandardMaterial=>{
      const mat=new StandardMaterial(name,scene);
      mat.diffuseColor=Color3.FromHexString(diffuse);
      mat.specularColor=Color3.Black();
      if(emissive)mat.emissiveColor=Color3.FromHexString(emissive);
      this.materials.push(mat);
      return mat;
    };
    const bark=material('forge-log-bark','#684126');
    const char=material('forge-log-char','#38261b');
    const embers=material('forge-embers','#642119','#c7370c');
    const orange=material('forge-flame-orange','#ff711c','#ff6b12');
    const gold=material('forge-flame-gold','#ffbd37','#ffb52b');

    const bed=MeshBuilder.CreateSphere('forge-ember-bed',
      {diameter:1,segments:8},scene);
    bed.parent=root;bed.position.set(0,.46,0);
    bed.scaling.set(.58,.075,.40);bed.material=embers;
    bed.isPickable=false;bed.checkCollisions=false;this.meshes.push(bed);

    const logs:[number,number][]=[[-.24,.58],[.24,.58],[0,.82]];
    for(const [index,[z,y]] of logs.entries()){
      const log=MeshBuilder.CreateCylinder(`forge-firewood-${index}`,
        {height:1.25,diameter:.28,tessellation:8},scene);
      log.parent=root;log.position.set(0,y,z);
      log.rotation.z=Math.PI/2;
      log.rotation.y=(index-1)*.42;
      log.material=index===1?char:bark;
      log.isPickable=false;log.checkCollisions=false;
      this.meshes.push(log);
    }

    const flameSpecs:[number,number,number,number,StandardMaterial][]=[
      [-.23,0,.88,.43,orange],
      [.22,.06,.78,.38,orange],
      [0,-.08,.68,.28,gold]
    ];
    for(const [index,[x,z,height,width,mat]] of flameSpecs.entries()){
      const pivot=new TransformNode(`forge-flame-pivot-${index}`,scene);
      pivot.parent=root;pivot.position.set(x,.67,z);
      const flame=MeshBuilder.CreateCylinder(`forge-flame-${index}`,
        {height,diameterBottom:width,diameterTop:0,tessellation:5},scene);
      flame.parent=pivot;flame.position.y=height*.5;
      flame.material=mat;flame.isPickable=false;flame.checkCollisions=false;
      this.flames.push(pivot);this.meshes.push(flame);
    }

    this.light=new PointLight('forge-fire-light',new Vector3(0,1.15,0),scene);
    this.light.parent=root;
    this.light.diffuse=Color3.FromHexString('#ff9b48');
    this.light.specular=Color3.FromHexString('#7a2c08');
    this.light.range=5;
    this.update(0);
  }

  update(time:number):void{
    for(const [index,pivot] of this.flames.entries()){
      const phase=index*2.1;
      pivot.scaling.y=.90+.18*Math.sin(time*5.2+phase);
      pivot.rotation.z=.12*Math.sin(time*3.0+phase);
      pivot.rotation.x=.08*Math.sin(time*2.4+phase*1.4);
    }
    this.light.intensity=.62+.12*Math.sin(time*7.1)+.06*Math.sin(time*11.7);
  }

  dispose():void{
    this.light.dispose();
    for(const pivot of this.flames)pivot.dispose(false,false);
    for(const mesh of this.meshes)mesh.dispose(false,false);
    for(const mat of this.materials)mat.dispose();
  }
}
