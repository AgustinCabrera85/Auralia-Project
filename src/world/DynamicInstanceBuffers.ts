import type { Mesh } from '@babylonjs/core';

type Stream={data:Float32Array;stride:number};
const streams=new WeakMap<Mesh,Map<string,Stream>>();

/** Reuse GPU storage for moving vegetation selections. Capacity is bounded by
 * the largest resident selection, not the number of refreshes or distance walked. */
export function updateInstanceBuffer(mesh:Mesh,kind:string,values:ArrayLike<number>,stride:number):number{
  let attributes=streams.get(mesh);
  if(!attributes)streams.set(mesh,attributes=new Map());
  let stream=attributes.get(kind);
  const count=values.length/stride;
  if(kind==='matrix'&&count===0){mesh.thinInstanceCount=0;return stream?.data.byteLength??0;}
  if(!stream||stream.stride!==stride||stream.data.length<values.length){
    const capacity=2**Math.ceil(Math.log2(Math.max(1,count)));
    stream={data:new Float32Array(capacity*stride),stride};
    stream.data.set(values);attributes.set(kind,stream);
    // SetBuffer normally scans the whole capacity. Publish the real instance
    // count first, then evaluate its bounds once, without unused/stale slots.
    const skipBounds=mesh.doNotSyncBoundingInfo;
    mesh.doNotSyncBoundingInfo=true;
    try{mesh.thinInstanceSetBuffer(kind,stream.data,stride,false);}
    finally{mesh.doNotSyncBoundingInfo=skipBounds;}
  }else{
    stream.data.set(values);
    if(kind==='matrix')mesh.thinInstanceCount=count;
    mesh.thinInstanceBufferUpdated(kind);
  }
  if(kind==='matrix'){
    mesh.thinInstanceCount=count;
    if(!mesh.doNotSyncBoundingInfo)mesh.thinInstanceRefreshBoundingInfo(false);
  }
  return stream.data.byteLength;
}
