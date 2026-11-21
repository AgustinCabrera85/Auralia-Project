(async()=>{
 for(let i=0;i<1200&&!window.__auraliaGame?.world;i++)await new Promise(r=>setTimeout(r,50));
 const w=window.__auraliaGame?.world;if(!w)throw Error('QA world not ready');
 await w.village.ready;
 const mib=n=>Math.round(n/1048576*10)/10;
 const gpuBytes=t=>{
  const block16=[36492,36493,33778,33779,37496,37497,37808,37840].includes(t.format);
  const block8=[33776,33777,37492,37493].includes(t.format);
  const bytes=t.type===1?4:t.type===2?2:1,channels=t.format===6?1:t.format===7?2:4;
  let w=t.width,h=t.height,total=0;
  do{total+=(block16||block8)?Math.ceil(w/4)*Math.ceil(h/4)*(block16?16:8):w*h*channels*bytes;
   if(!t.generateMipMaps||w===1&&h===1)break;w=Math.max(1,w>>1);h=Math.max(1,h>>1);
  }while(true);
  return total*(t.isCube?6:1)*(t.is2DArray?Math.max(1,t.depth):1);
 };
 const textures=w.engine.getLoadedTexturesCache().map(t=>({name:(t.url??'').slice(0,230),width:t.width,height:t.height,
   format:t.format,gpuBytes:gpuBytes(t),compressed:t._extension==='.ktx2',
   references:t._references,estimatedBytes:t.width*t.height*4*(t.generateMipMaps?4/3:1)*(t.isCube?6:1),
   retainedImage:!!t._buffer,source:t.source}));
 const groups={};for(const t of textures){const key=t.name.match(/assets\/([^/]+)(?:\/([^/]+))?/)?.slice(1).join('/')??'generated/other';
  const g=groups[key]??={count:0,estimatedBytes:0};g.count++;g.estimatedBytes+=t.estimatedBytes;}
 const imageBuffers=new Map();
 for(const t of [...w.scene.textures,...w.engine.getLoadedTexturesCache()]){
  const b=t._buffer;if(b&&ArrayBuffer.isView(b))imageBuffers.set(b.buffer,b.buffer.byteLength);
 }
 const dataBuffers=new Set();let geometryBytes=0;
 for(const g of w.scene.geometries){
  for(const k of g.getVerticesDataKinds()){const a=g.getVertexBuffer(k)?.getData();if(a&&!dataBuffers.has(a.buffer??a)){dataBuffers.add(a.buffer??a);geometryBytes+=a.buffer?.byteLength??a.length*8;}}
  const a=g.getIndices();if(a&&!dataBuffers.has(a.buffer??a)){dataBuffers.add(a.buffer??a);geometryBytes+=a.buffer?.byteLength??a.length*8;}
 }
 return {at:new Date().toISOString(),buildings:w.village.buildings.size,lamps:w.village.lanterns?.lamps.size,
  heapMiB:performance.memory?{used:mib(performance.memory.usedJSHeapSize),total:mib(performance.memory.totalJSHeapSize)}:null,
  meshes:w.scene.meshes.length,geometries:w.scene.geometries.length,materials:w.scene.materials.length,
  textureWrappers:w.scene.textures.length,gpuTextures:textures.length,estimatedRgbaTextureMiB:mib(textures.reduce((n,t)=>n+t.estimatedBytes,0)),
  estimatedGpuTextureMiB:mib(textures.reduce((n,t)=>n+t.gpuBytes,0)),compressedImages:textures.filter(t=>t.compressed).length,
  geometryCpuMiB:mib(geometryBytes),encodedImageMiB:mib([...imageBuffers.values()].reduce((n,v)=>n+v,0)),
  groups:Object.entries(groups).map(([name,g])=>({name,count:g.count,estimatedMiB:mib(g.estimatedBytes)})).sort((a,b)=>b.estimatedMiB-a.estimatedMiB),
  largest:textures.sort((a,b)=>b.estimatedBytes-a.estimatedBytes).slice(0,35)};
})()
