import { Color3, LinesMesh, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { BUILD_PLOT, type BuildPlan, type BuildEnvironment } from '../../domain/buildingRules';
import type { BuildType, Structure } from '../../domain/types';

/** Render-only construction pieces. Placement and support rules live in buildingRules. */
export class BuildVisuals {
  private readonly materials=new Map<string,StandardMaterial>();
  private grid:LinesMesh|null=null;
  private marker:Mesh|null=null;
  constructor(private readonly scene:Scene,private readonly parent:TransformNode,
    private readonly heightAt:BuildEnvironment['heightAt']){}

  setGridVisible(visible:boolean):void{
    if(!this.grid){
      const lines:Vector3[][]=[];
      for(let n=-4;n<=4;n++){
        const value=n*4-2;
        const along:Vector3[]=[],across:Vector3[]=[];
        for(let k=-17;k<=17;k+=2){
          const x=BUILD_PLOT.x+value,z=BUILD_PLOT.z+k;
          along.push(new Vector3(x,this.heightAt(x,z)+.12,z));
          const x2=BUILD_PLOT.x+k,z2=BUILD_PLOT.z+value;
          across.push(new Vector3(x2,this.heightAt(x2,z2)+.12,z2));
        }
        lines.push(along,across);
      }
      this.grid=MeshBuilder.CreateLineSystem('grilla-construcción',{lines},this.scene);
      this.grid.parent=this.parent;this.grid.color=Color3.FromHexString('#ead59a');
      this.grid.alpha=.55;this.grid.isPickable=false;
      this.marker=MeshBuilder.CreateBox('encastre-seleccionado',
        {width:.72,height:.08,depth:.72},this.scene);
      this.marker.parent=this.parent;this.marker.isPickable=false;
      this.marker.material=this.material('preview-good','#71e0a4',.58);
      this.marker.setEnabled(false);
    }
    this.grid.setEnabled(visible);
    if(!visible)this.marker?.setEnabled(false);
  }

  setAnchor(plan:BuildPlan|null,valid:boolean):void{
    if(!this.marker)return;
    this.marker.setEnabled(plan!==null);
    if(!plan)return;
    this.marker.position.set(plan.x,plan.baseY+.08,plan.z);
    this.marker.material=valid?this.material('preview-good','#71e0a4',.58):
      this.material('preview-bad','#e96a62',.6);
  }

  private material(name:string,hex:string,alpha=1):StandardMaterial{
    const key=`${name}:${alpha}`;
    const old=this.materials.get(key);
    if(old)return old;
    const mat=new StandardMaterial(`build-${key}`,this.scene);
    mat.diffuseColor=Color3.FromHexString(hex);
    mat.specularColor=new Color3(.1,.1,.1);
    mat.alpha=alpha;
    this.materials.set(key,mat);
    return mat;
  }

  private box(root:TransformNode,name:string,w:number,h:number,d:number,
    x:number,y:number,z:number,material:StandardMaterial,ghost:boolean,id?:string):Mesh{
    const mesh=MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},this.scene);
    mesh.parent=root;mesh.position.set(x,y,z);mesh.material=material;
    mesh.isPickable=!ghost;
    mesh.metadata=id?{structureId:id}:undefined;
    return mesh;
  }

  create(type:BuildType,plan:BuildPlan,id?:string,ghost=false):TransformNode{
    const root=new TransformNode(`build-${id??'preview'}-${type}`,this.scene);
    root.parent=this.parent;
    root.position.set(plan.x,plan.baseY,plan.z);
    root.rotation.y=plan.rotation*Math.PI/2;
    const wood=this.material('wood','#8b5938'),light=this.material('light-wood','#c99764');
    const stone=this.material('stone','#91958d'),stoneDark=this.material('stone-joint','#5f6967');
    const metal=this.material('metal','#829a95'),metalEdge=this.material('metal-edge','#c79a58');
    const roof=this.material('roof','#a85743'),roofEdge=this.material('roof-edge','#68473e');
    const b=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,
      mat:StandardMaterial)=>this.box(root,name,w,h,d,x,y,z,mat,ghost,id);
    if(type==='foundation'||type==='floor'){
      b('base',3.96,.36,3.96,0,.18,0,type==='foundation'?stoneDark:wood);
      if(type==='floor')for(let row=-2;row<=2;row++)
        b('tablón',3.9,.08,.7,0,.4,row*.74, row%2?light:wood);
      else for(const side of [-1.65,1.65])
        b('borde',.28,.18,3.96,side,.45,0,stone);
      for(const dx of [-1.73,1.73])for(const dz of [-1.73,1.73]){
        const ground=this.heightAt(plan.x+dx,plan.z+dz);
        const gap=Math.max(.18,plan.baseY-ground+.25);
        if(gap>.35)b('soporte',.4,gap,.4,dx,-gap*.5+.2,dz,type==='foundation'?stone:wood);
      }
    } else if(type==='post'){
      b('zapata',.65,.4,.65,0,.2,0,stone);
      b('columna',.34,3.12,.34,0,1.76,0,wood);
      b('capitel',.68,.3,.68,0,3.42,0,light);
    } else if(type==='roof'||type==='roof-section'){
      // The ridge runs along local Z; matching sections share their eave height.
      for(const sign of [-1,1]){
        const slope=b('faldón',2.48,.2,4.32,sign*1.06,4.01,0,roof);
        slope.rotation.z=-sign*.49;
        const beam=b('viga-alero',.22,.2,4.38,sign*2.05,3.48,0,roofEdge);
        beam.rotation.z=-sign*.49;
      }
      b('cumbrera',.34,.28,4.38,0,4.63,0,roofEdge);
    } else {
      const wallMaterial=type==='stone-wall'?stone:type==='metal-wall'?metal:light;
      const segment=(x:number,w:number,y:number,h:number)=>
        b('paño',w,h,.24,x,y,0,wallMaterial);
      if(type==='door-wall'){
        segment(-1.48,1.02,1.87,3.05);segment(1.48,1.02,1.87,3.05);
        segment(0,1.94,3.14,.52);
        for(const side of [-.91,.91])b('marco-puerta',.14,2.53,.34,side,1.58,0,wood);
      } else if(type==='window-wall'){
        segment(0,3.94,.87,1.04);segment(0,3.94,3.07,.84);
        for(const side of [-1.48,1.48])segment(side,.98,2.05,1.44);
        for(const side of [-.96,.96])b('marco-ventana',.13,1.42,.35,side,2.05,0,wood);
        b('antepecho',2.04,.14,.38,0,1.43,0,wood);
      } else if(type==='stone-wall'){
        segment(0,3.94,1.91,3.05);
        for(let row=0;row<4;row++)b('junta',3.7,.035,.255,0,.69+row*.72,0,stoneDark);
        for(const x of [-.98,.98])b('junta',.035,2.8,.255,x,1.9,0,stoneDark);
      } else if(type==='metal-wall'){
        for(const x of [-1.48,-.49,.49,1.48])segment(x,.95,1.91,3.05);
        for(const x of [-1.94,1.94])b('perfil',.11,3.18,.34,x,1.91,0,metalEdge);
        for(const x of [-1.73,1.73])for(const y of [.72,2.9])
          b('remache',.09,.09,.35,x,y,0,metalEdge);
      } else {
        for(let row=0;row<5;row++)b('tablón-pared',3.92,.57,.24,0,.67+row*.62,0,
          row%2?wood:light);
      }
      for(const x of [-1.88,1.88])b('montante',.18,3.35,.42,x,1.88,0,wood);
      b('viga-superior',4.06,.25,.45,0,3.53,0,wood);
      b('viga-inferior',4.06,.22,.45,0,.36,0,wood);
    }
    if(ghost)this.setPreviewValid(root,true);
    return root;
  }

  fromStructure(structure:Structure):TransformNode{
    return this.create(structure.type,{
      x:structure.x,z:structure.z,rotation:structure.rotation,
      anchor:structure.anchor!,baseY:structure.baseY!
    },structure.id);
  }

  setPreviewValid(root:TransformNode,valid:boolean):void{
    const material=valid?this.material('preview-good','#71e0a4',.58):
      this.material('preview-bad','#e96a62',.6);
    root.getChildMeshes().forEach(mesh=>{mesh.material=material;mesh.isPickable=false;});
  }

  dispose():void{
    this.grid?.dispose(false,false);this.marker?.dispose(false,false);
    for(const material of this.materials.values())material.dispose();this.materials.clear();
  }
}
