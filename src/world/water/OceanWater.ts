import {
  Mesh, MeshBuilder, Scene, ShaderMaterial, VertexBuffer, Vector2, Vector3,
} from '@babylonjs/core';
import { MAINLAND, sampleMainlandHeight } from '../terrainData';
import { waterSurfaceAt } from '../geographicFeatures';
import { acquireWaterTextures, updateWaterUniforms, type WaterTextureBank } from './waterResources';

export type OceanWaterOptions = {
  /** In-world meters, not UV coordinates. */
  nearSize?: number;
  nearSubdivisions?: number;
  /** Bigger than the main island so the sea continues to the horizon. */
  farWidth?: number;
  farHeight?: number;
  waveStrength?: number;
  normalStrength?: number;
};

function makeMaterial(scene: Scene, textures: WaterTextureBank, name: string, near: boolean,
  nearRadius: number, waveStrength: number, normalStrength: number): ShaderMaterial {
  const material = new ShaderMaterial(name, scene, 'auraliaOcean', {
    attributes: ['position', 'color'],
    uniforms: ['world','worldViewProjection','uCameraPosition','uSunDirection','uFogColor',
      'uFogDensity','uTime','uPatchRadius','uNearPatch','uPatchCenter','uWaveStrength','uNormalStrength'],
    samplers: ['uNormals','uFoamNoise'],
    needAlphaBlending: false,
  });
  material.setTexture('uNormals', textures.oceanNormals);
  material.setTexture('uFoamNoise', textures.foamNoise);
  material.setFloat('uPatchRadius', nearRadius);
  material.setFloat('uNearPatch', near ? 1 : 0);
  material.setFloat('uWaveStrength', waveStrength);
  material.setFloat('uNormalStrength', normalStrength);
  material.backFaceCulling = false;
  return material;
}

/**
 * A moving high-resolution ocean patch, plus a cheap flat far plane.
 * Wave displacement fades to zero before reaching the patch's edge.
 * Both surfaces sample the same world-space wave field to avoid swimming UVs.
 */
export class OceanWater {
  private readonly near: Mesh;
  private readonly far: Mesh;
  private readonly nearMaterial: ShaderMaterial;
  private readonly farMaterial: ShaderMaterial;
  private readonly textures: WaterTextureBank;
  private readonly halfSize: number;
  private readonly nearPositions: Float32Array | number[];
  private time = 0;
  private lastX = Infinity;
  private lastZ = Infinity;
  private readonly level: number;

  constructor(private readonly scene: Scene, options: OceanWaterOptions = {}) {
    this.textures = acquireWaterTextures(scene);
    this.level = MAINLAND.waterLevel;
    const size = options.nearSize ?? 480;
    const subdivisions = options.nearSubdivisions ?? 120;
    this.halfSize = size / 2;
    this.far = MeshBuilder.CreateGround('auralia-ocean-far', {
      width: options.farWidth ?? 6500, height: options.farHeight ?? 6200,
      subdivisions: 1,
    }, scene);
    this.far.position.set(MAINLAND.centerX,this.level - .035, MAINLAND.centerZ);
    this.near = MeshBuilder.CreateGround('auralia-ocean-near', {
      width: size, height: size, subdivisions,
    }, scene);
    this.near.position.set(0,this.level,0);
    this.nearPositions = this.near.getVerticesData(VertexBuffer.PositionKind) ?? [];
    this.nearMaterial = makeMaterial(scene, this.textures, 'auralia-ocean-near-mat',
      true, this.halfSize, options.waveStrength ?? 1, options.normalStrength ?? 1);
    this.farMaterial = makeMaterial(scene, this.textures, 'auralia-ocean-far-mat',
      false, this.halfSize, 0, options.normalStrength ?? .65);
    this.near.material = this.nearMaterial;
    this.far.material = this.farMaterial;
    this.near.isPickable = false;
    this.far.isPickable = false;
    this.near.checkCollisions = false;
    this.far.checkCollisions = false;
    const farColors = new Float32Array(4 * this.far.getTotalVertices());
    for (let i=0;i<farColors.length;i+=4) farColors[i+3]=1;
    this.far.setVerticesData(VertexBuffer.ColorKind,farColors);
    this.reposition(0,0);
  }

  private reposition(x: number,z: number): void {
    // Keep stable geometry most frames and resample shoreline only when patch moves.
    const centerX = Math.round(x / 32) * 32;
    const centerZ = Math.round(z / 32) * 32;
    if (centerX === this.lastX && centerZ === this.lastZ) return;
    this.lastX=centerX;this.lastZ=centerZ;
    this.near.position.x=centerX;
    this.near.position.z=centerZ;
    const center = new Vector2(centerX,centerZ);
    this.nearMaterial.setVector2('uPatchCenter',center);
    this.farMaterial.setVector2('uPatchCenter',center);
    const data = new Float32Array((this.nearPositions.length/3)*4);
    // Cache low-frequency depth samples to avoid thousands of terrain evaluations
    // whenever the camera crosses a 32m boundary.
    const sampleCache = new Map<string,number>();
    const inlandCache = new Map<string,number>();
    const cacheStep = 16;
    const shoreAt = (sx:number,sz:number):number => {
      const key=`${sx}:${sz}`;
      const known=sampleCache.get(key);
      if(known!==undefined)return known;
      const depth=Math.max(0,this.level-sampleMainlandHeight(sx*cacheStep,sz*cacheStep));
      const shallow=1-Math.min(1,depth/3.2);
      sampleCache.set(key,shallow);
      return shallow;
    };
    const inlandAt = (wx:number,wz:number):number => {
      const sx=Math.round(wx),sz=Math.round(wz),key=`${sx}:${sz}`;
      let mask=inlandCache.get(key);
      if(mask===undefined){
        mask=waterSurfaceAt(sx,sz)?1:0;
        inlandCache.set(key,mask);
      }
      return mask;
    };
    for (let i=0;i<this.nearPositions.length/3;i++) {
      const wx=centerX+this.nearPositions[i*3],wz=centerZ+this.nearPositions[i*3+2];
      const gx=wx/cacheStep,gz=wz/cacheStep;
      const sx=Math.floor(gx),sz=Math.floor(gz);
      const tx=gx-sx,tz=gz-sz;
      const a=shoreAt(sx,sz),b=shoreAt(sx+1,sz);
      const c=shoreAt(sx,sz+1),d=shoreAt(sx+1,sz+1);
      data[i*4]=(a+(b-a)*tx)*(1-tz)+(c+(d-c)*tx)*tz;
      // Ocean crests must stay below lakes and rivers. A small margin also
      // keeps moving waves from poking through their shoreline vertices.
      data[i*4+1]=Math.max(inlandAt(wx,wz),inlandAt(wx-8,wz),inlandAt(wx+8,wz),
        inlandAt(wx,wz-8),inlandAt(wx,wz+8));
      data[i*4+2]=0;
      data[i*4+3]=1;
    }
    this.near.setVerticesData(VertexBuffer.ColorKind,data);
    this.near.refreshBoundingInfo();
  }

  /** Call from WorldView.update(dt), after the camera/player exists. */
  update(dt: number, center: Vector3): void {
    this.time += Math.max(0,Math.min(dt,.1));
    this.reposition(center.x,center.z);
    updateWaterUniforms(this.nearMaterial,this.scene,this.time);
    updateWaterUniforms(this.farMaterial,this.scene,this.time);
  }

  dispose(): void {
    this.near.dispose(false,false);
    this.far.dispose(false,false);
    this.nearMaterial.dispose(false,false);
    this.farMaterial.dispose(false,false);
    this.textures.release();
  }
}
