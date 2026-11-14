import { ImportMeshAsync, Matrix, Quaternion, Scene, TransformNode, Vector3, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/2.0/glTFLoader.js';
import type { SwordLevel } from '../domain/brisaliaSword';
import { SANTI_COMBAT } from './SantiCatalog';
import { TRAVERSAL } from './traversalRules';

export const BRISALIA_SWORD_MODELS=[
  '/assets/equipment/brisalia-sword/Espada_Brisalia_01.glb',
  '/assets/equipment/brisalia-sword/Espada_Brisalia_02.glb',
  '/assets/equipment/brisalia-sword/Espada_Brisalia_03.glb',
  '/assets/equipment/brisalia-sword/Espada_Brisalia_04.glb'
] as const;
export const BRISALIA_SWORD_DEFAULT_POSITION_CM=[-15.5,-1,-10] as const;
export const BRISALIA_SWORD_DEFAULT_ROTATION_DEG=[38,-1,10] as const;
const PALM_FRACTION=.75;
const EDGE_DOWN_ROLL=150*Math.PI/180;
const HANDLE_CENTER_Y=-.07;
const BLADE_TURN=-Math.PI/2;
const PALM_SURFACE_Z=3.7;
type GripJoint={node:TransformNode;rest:Quaternion;closed:Quaternion};

/** The GLBs share a GripSocket at the origin and point along local +Y. */
export class BrisaliaSwordVisual {
  private desiredLevel:SwordLevel=0;
  private currentLevel:SwordLevel=0;
  private currentRoot:AbstractMesh|null=null;
  private pendingLoad:Promise<void>=Promise.resolve();
  private serial=0;
  private disposed=false;
  private readonly gripJoints:GripJoint[];
  private releaseGrip=false;
  private gripTarget:Vector3|null=null;
  private baseRotation:Quaternion|null=null;
  private handScale:Vector3|null=null;
  private placementOffset=new Vector3(...BRISALIA_SWORD_DEFAULT_POSITION_CM).scaleInPlace(.01);
  private placementRotation=new Vector3(...BRISALIA_SWORD_DEFAULT_ROTATION_DEG);

  constructor(private readonly scene:Scene,private readonly hand:TransformNode,
    private readonly importer:typeof ImportMeshAsync=ImportMeshAsync){
    const descendants=new Map(this.hand.getDescendants(false).filter((node):node is TransformNode=>
      node instanceof TransformNode).map(node=>[node.name,node]));
    const idle=this.scene.getAnimationGroupByName('Idle (1)');
    const swordAttack=this.scene.getAnimationGroupByName(SANTI_COMBAT.swordAttacks[0]);
    const restPose=(node:TransformNode)=>{
      const key=idle?.targetedAnimations.find(track=>track.target===node&&
        track.animation.targetProperty==='rotationQuaternion')?.animation.getKeys()[0]?.value;
      return key instanceof Quaternion?key.clone():node.rotationQuaternion!.clone();
    };
    this.gripJoints=[];
    const attackPose=(node:TransformNode)=>{
      const key=swordAttack?.targetedAnimations.find(track=>track.target===node&&
        track.animation.targetProperty==='rotationQuaternion')?.animation.getKeys()[0]?.value;
      return key instanceof Quaternion?key.clone():restPose(node);
    };
    for(const finger of ['Index','Middle','Ring','Pinky'])
      for(let joint=1;joint<=3;joint++){
        const node=descendants.get(`mixamorig:RightHand${finger}${joint}`);
        if(!node?.rotationQuaternion)continue;
        const rest=restPose(node);
        this.gripJoints.push({node,rest,closed:attackPose(node)});
      }
    for(let joint=1;joint<=3;joint++){
      const node=descendants.get(`mixamorig:RightHandThumb${joint}`);
      if(!node?.rotationQuaternion)continue;
      const rest=restPose(node);
      this.gripJoints.push({node,rest,closed:attackPose(node)});
    }
  }

  get level():SwordLevel{return this.currentRoot?.isEnabled()?this.currentLevel:0;}
  get offsetMeters():Vector3{return this.placementOffset.clone();}
  get rotationDegrees():Vector3{return this.placementRotation.clone();}
  whenReady():Promise<void>{return this.pendingLoad;}

  setOffsetMeters(x:number,y:number,z:number):void{
    if(![x,y,z].every(Number.isFinite))return;
    this.placementOffset.set(x,y,z);
    this.applyPlacement();
  }

  setRotationDegrees(x:number,y:number,z:number):void{
    if(![x,y,z].every(Number.isFinite))return;
    this.placementRotation.set(x,y,z);
    this.applyPlacement();
  }

  private applyPlacement():void{
    if(!this.currentRoot||!this.gripTarget||!this.baseRotation||!this.handScale)return;
    const radians=this.placementRotation.scale(Math.PI/180);
    const turn=Quaternion.RotationAxis(Vector3.Up(),radians.y).multiply(
      Quaternion.RotationAxis(Vector3.Right(),radians.x)).multiply(
      Quaternion.RotationAxis(new Vector3(0,0,1),radians.z));
    const rotation=turn.multiply(this.baseRotation);
    this.currentRoot.rotationQuaternion=rotation;
    const handleOffset=Vector3.TransformCoordinates(new Vector3(0,HANDLE_CENTER_Y,0),
      Matrix.Compose(this.currentRoot.scaling,rotation,Vector3.Zero()));
    this.currentRoot.position.copyFrom(this.gripTarget).subtractInPlace(handleOffset).addInPlaceFromFloats(
      this.placementOffset.x/Math.abs(this.handScale.x),
      this.placementOffset.y/Math.abs(this.handScale.y),
      this.placementOffset.z/Math.abs(this.handScale.z));
  }

  setLevel(level:SwordLevel):void{
    if(this.disposed||level===this.desiredLevel)return;
    this.desiredLevel=level;
    const serial=++this.serial;
    if(level===0){this.currentRoot?.setEnabled(false);this.releaseGrip=true;return;}
    if(this.currentLevel===level&&this.currentRoot){this.currentRoot.setEnabled(true);return;}
    this.pendingLoad=this.loadLevel(level,serial);
  }

  /** Keep the fist closed after the source NLA action samples its open hand. */
  applyGrip():void{
    if(this.disposed||this.desiredLevel===0&&!this.releaseGrip)return;
    for(const {node,rest,closed} of this.gripJoints){
      node.rotationQuaternion?.copyFrom(this.desiredLevel>0?closed:rest);
      node.markAsDirty('rotationQuaternion');
    }
    this.releaseGrip=false;
  }

  private async loadLevel(level:Exclude<SwordLevel,0>,serial:number):Promise<void>{
    const path=BRISALIA_SWORD_MODELS[level-1];
    try{
      const result=await this.importer(path,this.scene);
      const root=result.meshes.find(mesh=>mesh.name==='__root__');
      const socket=result.transformNodes.find(node=>node.name==='GripSocket');
      if(!root||!socket||!result.meshes.some(mesh=>mesh.getTotalVertices()>0)){
        for(const mesh of result.meshes)mesh.dispose(false,true);
        throw new Error(`Espada de Brisalia incompleta: ${path}`);
      }
      if(this.disposed||serial!==this.serial||this.desiredLevel!==level){
        root.dispose(false,true);return;
      }
      // Mixamo's hand inherits the rig's 1/100 unit conversion. Compensate
      // its world scale so the authored blade is proportional to Santi's body.
      this.hand.computeWorldMatrix(true);
      const handScale=new Vector3();
      this.hand.getWorldMatrix().decompose(handScale);
      if([handScale.x,handScale.y,handScale.z].some(value=>
        !Number.isFinite(value)||Math.abs(value)<1e-6)){
        root.dispose(false,true);
        throw new Error('Escala de la mano de Santi inválida');
      }
      root.parent=this.hand;
      // The hand node is at the wrist; the finger base locates the palm.
      const fingerBase=this.hand.getChildren(undefined,true).find(node=>
        node.name==='mixamorig:RightHandMiddle1') as TransformNode|undefined;
      const palm=fingerBase?fingerBase.position.scale(PALM_FRACTION):Vector3.Zero();
      // Turn the blade ninety degrees through the fist; the roll keeps its
      // cutting edge facing the ground with the arm relaxed.
      root.rotationQuaternion=Quaternion.RotationAxis(new Vector3(0,0,1),BLADE_TURN).multiply(
        (root.rotationQuaternion??Quaternion.Identity()).multiply(
          Quaternion.RotationAxis(new Vector3(0,1,0),EDGE_DOWN_ROLL)));
      const visualScale=TRAVERSAL.playerHeight*.45;
      root.scaling.multiplyInPlace(new Vector3(
        visualScale/Math.abs(handScale.x),
        visualScale/Math.abs(handScale.y),
        visualScale/Math.abs(handScale.z)));
      // The inner palm skin is near local +Z 2.2 and the handle extends about
      // 1.5 units toward it. Seat the handle against that surface, outside it.
      const gripTarget=palm.add(new Vector3(0,0,PALM_SURFACE_Z));
      for(const mesh of result.meshes){
        mesh.isPickable=false;mesh.checkCollisions=false;
        mesh.metadata={...mesh.metadata,brisaliaSword:true,swordLevel:level};
      }
      this.currentRoot?.dispose(false,true);
      this.currentRoot=root;this.currentLevel=level;
      this.gripTarget=gripTarget;this.baseRotation=root.rotationQuaternion.clone();
      this.handScale=handScale;
      this.applyPlacement();
      root.setEnabled(true);
    }catch(error){
      if(!this.disposed)console.warn('[Auralia] No se pudo cargar '+path,error);
    }
  }

  dispose():void{
    this.disposed=true;this.serial++;
    this.currentRoot?.dispose(false,true);this.currentRoot=null;
    this.gripTarget=null;this.baseRotation=null;this.handScale=null;
    this.currentLevel=0;this.desiredLevel=0;
  }
}
