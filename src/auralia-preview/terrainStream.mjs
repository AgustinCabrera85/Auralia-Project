import { Mesh, VertexData } from '@babylonjs/core';
import { LEVELS, patchTopology, patchDistance, childPatches, topologyHeight } from './terrainGeometry.mjs';

export const STREAM_RADII = { near: 420, mid: 1100 };
export const TERRAIN_BUFFER_BUDGET = 28 * 1024 * 1024;
export function planTerrain(manifest, focus, localView=true) {
  const unit=manifest.tileSizeMeters/(manifest.resolution-1), nodes=new Map();
  for(const tile of manifest.tiles){
    const root={tile,lod:'far',gx:0,gz:0,x:tile.boundsXZ[0],z:tile.boundsXZ[1],key:`${tile.id}:far:0:0`};
    nodes.set(root.key,root);
    if(!localView||patchDistance(root,focus.x,focus.z,unit)>STREAM_RADII.mid)continue;
    for(const mid of childPatches(root,unit)){
      nodes.set(mid.key,mid);
      if(patchDistance(mid,focus.x,focus.z,unit)>STREAM_RADII.near)continue;
      for(const near of childPatches(mid,unit))nodes.set(near.key,near);
    }
  }
  return nodes;
}

/** Bounded, incremental 3x3 hierarchy with source-sample perimeter stitching.
 * A parent stays available until its nine children are ready; transitions morph
 * against its actual triangles. This is the same coverage contract as TerrainStream.
 */
export class PreviewTerrainStream {
  constructor(scene,atlas,field,material){
    this.scene=scene;this.atlas=atlas;this.field=field;this.material=material;
    this.unit=atlas.size/(atlas.resolution-1);this.records=new Map();this.splits=new Map();
    this.desired=new Map();this.job=null;this.focus={x:0,z:0};
    this.settled=false;this.localView=null;
  }
  async initialize(onProgress=()=>{}){
    this.desired=planTerrain(this.atlas.manifest,{x:0,z:0},false);
    for(const node of this.desired.values()){
      const build=this.build(node);let result;
      do{result=build.next();if(!result.done)await new Promise(resolve=>setTimeout(resolve,0));}while(!result.done);
      this.records.set(node.key,result.value);result.value.mesh.setEnabled(true);
      onProgress(this.records.size,this.desired.size);
    }
  }
  *build(node){
    const topology=patchTopology(node.lod), count=topology.offsets.length;
    const positions=new Float32Array(count*3),normals=new Float32Array(count*3);
    const heights=new Float32Array(count),parentHeight=new Float32Array(count);
    const parent=this.records.get(node.parent);
    for(let i=0;i<count;i++){
      const [gx,gz]=topology.offsets[i];
      const x=node.x+gx*this.unit,z=node.z+gz*this.unit,h=this.field.heightAt(x,z);
      heights[i]=h;positions.set([x,h,z],i*3);
      parentHeight[i]=parent?topologyHeight(parent.topology,parent.heights,node.gx-parent.node.gx+gx,node.gz-parent.node.gz+gz):h;
      const d=this.unit,nx=this.field.heightAt(x-d,z)-this.field.heightAt(x+d,z);
      const nz=this.field.heightAt(x,z-d)-this.field.heightAt(x,z+d),length=Math.hypot(nx,2*d,nz);
      normals.set([nx/length,2*d/length,nz/length],i*3);
      if(i%128===127)yield;
    }
    const mesh=new Mesh(`MAP_${node.key}`,this.scene),data=new VertexData();
    data.positions=positions;data.normals=normals;data.indices=topology.indices;data.applyToMesh(mesh);
    mesh.setVerticesData('parentHeight',parentHeight,false,1);
    mesh.material=this.material;mesh.isPickable=false;mesh.setEnabled(false);
    mesh.metadata={previewTile:node.tile.id,lod:node.lod,lodBlend:1};
    // Include both endpoints of the morph in the bounds, particularly high cliffs.
    const min=mesh.getBoundingInfo().minimum.clone(),max=mesh.getBoundingInfo().maximum.clone();
    for(const h of parentHeight){min.y=Math.min(min.y,h);max.y=Math.max(max.y,h);}
    mesh.getBoundingInfo().reConstruct(min,max,mesh.getWorldMatrix());
    return {node,mesh,topology,heights,bytes:positions.byteLength+normals.byteLength+topology.indices.byteLength+parentHeight.byteLength};
  }
  update(focus,localView){
    if(localView===this.localView&&Math.hypot(focus.x-this.focus.x,focus.z-this.focus.z)<this.unit*8)return;
    this.localView=localView;this.settled=false;
    this.focus={x:focus.x,z:focus.z};this.desired=planTerrain(this.atlas.manifest,focus,localView);
    if(this.job&&!this.desired.has(this.job.node.key)){this.job.iterator.return();this.job=null;}
  }
  tick(dt,budgetMs=4){
    if(this.settled)return;
    const start=performance.now();
    if(!this.job){
      const residentBytes=[...this.records.values()].reduce((sum,r)=>sum+r.bytes,0);
      const next=[...this.desired.values()].filter(n=>!this.records.has(n.key)&&this.records.has(n.parent))
        .sort((a,b)=>(a.lod==='mid'?0:1)-(b.lod==='mid'?0:1)||patchDistance(a,this.focus.x,this.focus.z,this.unit)-patchDistance(b,this.focus.x,this.focus.z,this.unit))
        .find(n=>{const t=patchTopology(n.lod);return residentBytes+t.offsets.length*28+t.indices.byteLength<=TERRAIN_BUFFER_BUDGET;});
      if(next)this.job={node:next,iterator:this.build(next)};
    }
    while(this.job&&performance.now()-start<budgetMs){
      const result=this.job.iterator.next();
      if(result.done){this.records.set(this.job.node.key,result.value);this.job=null;break;}
    }
    const retained=new Set(),enabled=new Set();let transitioning=false;
    const visit=(record)=>{
      retained.add(record.node.key);
      const children=record.node.lod==='near'?[]:childPatches(record.node,this.unit);
      const wanted=children.length&&this.desired.has(children[0].key);
      let split=this.splits.get(record.node.key);
      if(!split&&wanted&&children.every(c=>this.records.has(c.key))){split={blend:0};this.splits.set(record.node.key,split);}
      if(split){
        const nested=children.some(c=>this.splits.has(c.key));
        split.blend=Math.max(0,Math.min(1,split.blend+(wanted?1:nested?0:-1)*dt/0.35));
        if(!wanted&&!nested&&split.blend===0){this.splits.delete(record.node.key);split=null;}
      }
      if(!split){enabled.add(record.node.key);record.mesh.metadata.lodBlend=1;return;}
      if(split.blend<1||!wanted)transitioning=true;
      for(const child of children){
        const r=this.records.get(child.key);
        if(split.blend<1){retained.add(child.key);enabled.add(child.key);r.mesh.metadata.lodBlend=split.blend;}
        else visit(r);
      }
    };
    for(const record of this.records.values())if(record.node.lod==='far')visit(record);
    for(const [key,record] of this.records){
      if(!retained.has(key)&&!this.desired.has(key)){record.mesh.dispose();this.records.delete(key);}
      else if(record.mesh.isEnabled()!==enabled.has(key))record.mesh.setEnabled(enabled.has(key));
    }
    this.settled=!this.job&&!transitioning&&[...this.desired.keys()].every(key=>this.records.has(key));
  }
  heightAt(x,z){
    let best=null;
    for(const r of this.records.values()){
      const span=LEVELS[r.node.lod].span*this.unit;
      if(!r.mesh.isEnabled()||x<r.node.x||z<r.node.z||x>r.node.x+span||z>r.node.z+span)continue;
      best=r;break;
    }
    if(!best)return this.field.heightAt(x,z);
    const h=topologyHeight(best.topology,best.heights,(x-best.node.x)/this.unit,(z-best.node.z)/this.unit);
    const parent=this.records.get(best.node.parent),blend=best.mesh.metadata.lodBlend;
    if(!parent||blend===1)return h;
    return topologyHeight(parent.topology,parent.heights,(x-parent.node.x)/this.unit,(z-parent.node.z)/this.unit)*(1-blend)+h*blend;
  }
  stats(){
    const visible=new Set(this.scene.getActiveMeshes().data.slice(0,this.scene.getActiveMeshes().length));
    const result={};
    for(const lod of Object.keys(LEVELS))result[lod]={spacing:this.unit*LEVELS[lod].step,resident:0,enabled:0,visible:0,vertices:0,triangles:0,visibleTriangles:0,geometryBytes:0};
    for(const r of this.records.values()){
      const s=result[r.node.lod];s.resident++;s.enabled+=Number(r.mesh.isEnabled());s.visible+=Number(visible.has(r.mesh));
      s.vertices+=r.mesh.getTotalVertices();s.triangles+=r.mesh.getTotalIndices()/3;s.geometryBytes+=r.bytes;
      if(visible.has(r.mesh))s.visibleTriangles+=r.mesh.getTotalIndices()/3;
    }
    return result;
  }
  dispose(){this.job?.iterator.return();for(const r of this.records.values())r.mesh.dispose();this.records.clear();this.splits.clear();}
}
