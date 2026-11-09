import {
  Mesh, MeshBuilder, Scene, ShaderMaterial, VertexBuffer, Vector2, Vector3,
} from '@babylonjs/core';
import { MAINLAND, sampleMainlandHeight } from '../terrainData';
import { waterSurfaceAt } from '../geographicFeatures';
import { loadWaterMasks, WATER_PROFILES } from '../editor/AuraliaWaterProfiles';
import { createWorldWaterMaterial, updateWorldWaterMaterial } from '../editor/LiveWaterProfiles';

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

const PATCH_BUILD_BUDGET_MS = 1.5;
const PATCH_SLICE_VERTICES = 64;
type PatchBuild = { x: number; z: number; work: Generator<void,void> };

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
  private readonly masks: ReturnType<typeof loadWaterMasks>;
  private readonly halfSize: number;
  private readonly nearPositions: Float32Array | number[];
  private colors: Float32Array;
  private nextColors: Float32Array;
  private readonly patchCenter = Vector2.Zero();
  private pendingPatch: PatchBuild | null = null;
  private disposed = false;
  private time = 0;
  private lastX = Infinity;
  private lastZ = Infinity;
  private readonly level: number;

  constructor(private readonly scene: Scene, options: OceanWaterOptions = {}) {
    this.masks = loadWaterMasks(scene);
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
    this.colors = new Float32Array(this.near.getTotalVertices() * 4);
    this.nextColors = new Float32Array(this.colors.length);
    this.near.setVerticesData(VertexBuffer.ColorKind,this.colors,true);
    // Until the first mask is complete, the far surface covers the whole ocean.
    this.near.setEnabled(false);
    const waveAmp=WATER_PROFILES.ocean.params.uWaveAmp;
    this.nearMaterial=createWorldWaterMaterial(scene,'ocean',this.masks,{
      uWaveAmp:waveAmp*(options.waveStrength??1),
      uNormalStrength:options.normalStrength??1,
    });
    this.farMaterial=createWorldWaterMaterial(scene,'ocean',this.masks,{
      uWaveAmp:waveAmp*(options.waveStrength??1),
      uNormalStrength:(options.normalStrength??1)*.65,
    });
    this.nearMaterial.setFloat('uPatchRadius',this.halfSize);
    this.farMaterial.setFloat('uPatchRadius',0);
    this.nearMaterial.setVector2('uPatchCenter',this.patchCenter);
    this.farMaterial.setVector2('uPatchCenter',this.patchCenter);
    this.nearMaterial.setFloat('uNearPatch',1);
    this.farMaterial.setFloat('uNearPatch',0);
    this.near.material = this.nearMaterial;
    this.far.material = this.farMaterial;
    this.near.isPickable = false;
    this.far.isPickable = false;
    this.near.checkCollisions = false;
    this.far.checkCollisions = false;
    const farColors = new Float32Array(4 * this.far.getTotalVertices());
    for (let i=0;i<farColors.length;i+=4) farColors[i+3]=1;
    this.far.setVerticesData(VertexBuffer.ColorKind,farColors);
  }

  private reposition(x: number,z: number): void {
    const centerX = Math.round(x / 32) * 32;
    const centerZ = Math.round(z / 32) * 32;
    if (centerX === this.lastX && centerZ === this.lastZ) {
      this.pendingPatch?.work.return(undefined);
      this.pendingPatch=null;
      return;
    }
    if (centerX !== this.pendingPatch?.x || centerZ !== this.pendingPatch?.z) {
      // Only one destination is built. A teleport never queues obsolete patches.
      this.pendingPatch?.work.return(undefined);
      this.pendingPatch={x:centerX,z:centerZ,work:this.buildColors(centerX,centerZ)};
    }
    const deadline=performance.now()+PATCH_BUILD_BUDGET_MS;
    do {
      if (this.pendingPatch.work.next().done) {
        // Publish position, mask and the far-surface cutout together. Rendering
        // keeps using the previous complete patch while the new one is built.
        const previous=this.colors;
        this.colors=this.nextColors;this.nextColors=previous;
        this.near.updateVerticesData(VertexBuffer.ColorKind,this.colors,false,false);
        this.lastX=centerX;this.lastZ=centerZ;
        this.near.position.x=centerX;this.near.position.z=centerZ;
        this.patchCenter.set(centerX,centerZ);
        this.nearMaterial.setVector2('uPatchCenter',this.patchCenter);
        this.farMaterial.setVector2('uPatchCenter',this.patchCenter);
        this.farMaterial.setFloat('uPatchRadius',this.halfSize);
        this.near.setEnabled(true);
        this.pendingPatch=null;
        return;
      }
    } while (performance.now()<deadline);
  }

  private *buildColors(centerX:number,centerZ:number):Generator<void,void> {
    const data=this.nextColors,positions=this.nearPositions;
    const vertexCount=positions.length/3,stride=Math.sqrt(vertexCount);
    const shiftX=(centerX-this.lastX)/(positions[3]-positions[0]);
    const shiftZ=(centerZ-this.lastZ)/(positions[stride*3+2]-positions[2]);
    const canReuse=Number.isInteger(stride)&&Number.isInteger(shiftX)&&Number.isInteger(shiftZ);
    // Caches belong only to this build, bounded by the patch size rather than
    // distance travelled. Numeric keys avoid thousands of temporary strings.
    const sampleCache = new Map<number,Map<number,number>>();
    const inlandCache = new Map<number,Map<number,number>>();
    const cacheStep = 16;
    const shoreAt = (sx:number,sz:number):number => {
      let row=sampleCache.get(sz);
      const known=row?.get(sx);
      if(known!==undefined)return known;
      const depth=Math.max(0,this.level-sampleMainlandHeight(sx*cacheStep,sz*cacheStep));
      const shallow=1-Math.min(1,depth/3.2);
      if(!row)sampleCache.set(sz,row=new Map());
      row.set(sx,shallow);
      return shallow;
    };
    const inlandAt = (wx:number,wz:number):number => {
      const sx=Math.round(wx),sz=Math.round(wz);
      let row=inlandCache.get(sz),mask=row?.get(sx);
      if(mask===undefined){
        mask=waterSurfaceAt(sx,sz)?1:0;
        if(!row)inlandCache.set(sz,row=new Map());
        row.set(sx,mask);
      }
      return mask;
    };
    for (let i=0;i<vertexCount;i++) {
      if(i>0&&i%PATCH_SLICE_VERTICES===0)yield;
      const wx=centerX+positions[i*3],wz=centerZ+positions[i*3+2];
      const oldX=i%stride+shiftX,oldZ=Math.floor(i/stride)+shiftZ;
      const oldIndex=oldZ*stride+oldX;
      // The default 4m grid overlaps by 93% after a 32m move. Copy those
      // finished samples; custom grids reuse only exactly matching positions.
      if(canReuse&&oldX>=0&&oldX<stride&&oldZ>=0&&oldZ<stride&&
          wx===this.lastX+positions[oldIndex*3]&&wz===this.lastZ+positions[oldIndex*3+2]) {
        data[i*4]=this.colors[oldIndex*4];
        data[i*4+1]=this.colors[oldIndex*4+1];
        data[i*4+2]=0;data[i*4+3]=1;
        continue;
      }
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
  }

  /** Call from WorldView.update(dt), after the camera/player exists. */
  update(dt: number, center: Vector3): void {
    if(this.disposed)return;
    this.time += Math.max(0,Math.min(dt,.1));
    this.reposition(center.x,center.z);
    updateWorldWaterMaterial(this.nearMaterial,'ocean',this.scene,this.time);
    updateWorldWaterMaterial(this.farMaterial,'ocean',this.scene,this.time);
  }

  dispose(): void {
    this.disposed=true;
    this.pendingPatch?.work.return(undefined);
    this.pendingPatch=null;
    this.near.dispose(false,false);
    this.far.dispose(false,false);
    this.nearMaterial.dispose(false,false);
    this.farMaterial.dispose(false,false);
    this.masks.caustics.dispose();
    this.masks.waterfall.dispose();
  }
}
