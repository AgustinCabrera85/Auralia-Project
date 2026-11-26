import {Matrix,Mesh,Quaternion,Scene,TransformNode,Vector3,type Material} from '@babylonjs/core';
import {importGpuMeshAsync} from '../GpuAssets';
import {ASSET_CATALOG} from '../assetCatalog';
import {setMaterialLightBudget} from '../SceneLightBudget';
import type {PalacePlantSpec} from './PalaceModel';

/** Existing Brisalia foliage, fitted by measured bounds to authored beds.
 * One draw per imported submesh; no terrain-relative placement on raised soil. */
export class PalaceVegetation{
  readonly meshes:Mesh[]=[];
  readonly materials=new Set<Material>();
  private disposed=false;
  constructor(private scene:Scene,private parent:TransformNode){}
  async load(plants:PalacePlantSpec[]){
    for(const asset of ['brisaliaMatorral','brisaliaYuyos'] as const){
      const placements=plants.filter(p=>p.asset===asset);if(!placements.length)continue;
      const entry=ASSET_CATALOG[asset],result=await importGpuMeshAsync(entry.lodPath,this.scene);
      const meshes=result.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.getTotalVertices()>0);
      if(this.disposed){for(const m of result.meshes)m.dispose(false,false);return;}
      let min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
      for(const m of meshes){m.computeWorldMatrix(true);m.bakeTransformIntoVertices(m.getWorldMatrix().clone());m.refreshBoundingInfo();min=Vector3.Minimize(min,m.getBoundingInfo().boundingBox.minimum);max=Vector3.Maximize(max,m.getBoundingInfo().boundingBox.maximum);}
      const dimensions=max.subtract(min),centre=min.add(max).scale(.5),clones=new Map<Material,Material>();
      for(const [index,m] of meshes.entries()){
        m.parent=null;m.position.setAll(0);m.scaling.setAll(1);m.rotation.setAll(0);m.rotationQuaternion=null;
        m.bakeTransformIntoVertices(Matrix.Translation(-centre.x,-min.y,-centre.z));
        const source=m.material;
        if(source){let material=clones.get(source);if(!material){material=source.clone('palace:foliage:'+asset+':'+source.name)!;setMaterialLightBudget(material,5);clones.set(source,material);this.materials.add(material);}m.material=material;}
        const transforms=new Float32Array(placements.length*16);
        placements.forEach((p,i)=>Matrix.Compose(new Vector3(p.radius*2/Math.max(dimensions.x,dimensions.z),p.height/dimensions.y,p.radius*2/Math.max(dimensions.x,dimensions.z)),Quaternion.RotationYawPitchRoll(i*2.399,0,0),new Vector3(p.x,p.y,p.z)).copyToArray(transforms,i*16));
        m.name='palace:reused-foliage:'+asset+':'+index;m.parent=this.parent;m.layerMask|=0x10000000;m.receiveShadows=true;m.isPickable=false;
        m.metadata={palace:true,palaceVegetation:true,source:entry.lodPath,placements:placements.length};
        m.thinInstanceSetBuffer('matrix',transforms,16,true);m.thinInstanceRefreshBoundingInfo();m.freezeWorldMatrix();this.meshes.push(m);
      }
      for(const m of result.meshes)if(!meshes.includes(m as Mesh))m.dispose(false,false);
    }
  }
  dispose(){this.disposed=true;for(const m of this.meshes)m.dispose(false,false);for(const m of this.materials)m.dispose(false,false);}
}
