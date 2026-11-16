import { Matrix, PBRMaterial, type Mesh, type Scene, type Texture, type TransformNode } from '@babylonjs/core';
import { createSeasonalIvyTextures, SeasonalIvyPlugin } from './materials/SeasonalIvyMaterial';
import { BrisaliaIvyVolume } from './BrisaliaIvyVolume';

/** Match source names before batching removes their semantic identity. */
export function castleIvySurface(name:string):'wall'|'tower'|null {
  if (/^AUR034_CASTLE60_(curtain_shell|coping_x_|merlons_x_)/.test(name))return 'wall';
  if (/^AUR034_CASTLE60_(corner_tower_-?1_-?1|gate_tower_-?1)_(masonry_course_|individual_stones|carved_string_|crown_|projecting_crown)/.test(name))return 'tower';
  return null;
}

export class BrisaliaCastleIvy {
  readonly materials:PBRMaterial[]=[];
  private readonly textures:Texture[];
  readonly volume:BrisaliaIvyVolume;
  constructor(scene:Scene,parts:readonly Mesh[],root:TransformNode){
    this.textures=createSeasonalIvyTextures(scene);
    const worldToCastle=Matrix.Invert(root.computeWorldMatrix(true));
    const variants=new Map<string,PBRMaterial>();
    for(const mesh of parts){
      const surface=castleIvySurface(mesh.name),source=mesh.material;
      if(!surface||!(source instanceof PBRMaterial)||!source.name.includes('limestone'))continue;
      const key=`${surface}:${source.uniqueId}`;
      let material=variants.get(key);
      if(!material){
        material=source.clone(`${source.name}:seasonal-ivy:${surface}`);
        if(!material)throw new Error(`Cannot clone ivy material ${source.name}`);
        new SeasonalIvyPlugin(material,worldToCastle,surface==='tower');
        variants.set(key,material);this.materials.push(material);
      }
      mesh.material=material;
    }
    this.volume=new BrisaliaIvyVolume(scene,parts.flatMap(mesh=>{
      const surface=castleIvySurface(mesh.name);
      return surface&&this.materials.includes(mesh.material as PBRMaterial)?[{mesh,surface}]:[];
    }),root,this.textures);
  }
  dispose():void{
    this.volume.dispose();
    // Stone maps remain shared; the leaf atlas belongs to this controller.
    for(const material of this.materials)material.dispose(false,false);
    for(const texture of this.textures)texture.dispose();
    this.materials.length=0;
  }
}
