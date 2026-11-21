/** Repair inward closed components in authored wood, leaving open roof sheets intact.
 * glTF uses CCW outward faces. UV seams duplicate vertices, so topology is welded
 * for classification only; positions, UVs and vertex indices remain unchanged.
 */
export function repairWoodSolids(positions:ArrayLike<number>,normals:ArrayLike<number>,indices:ArrayLike<number>){
  const parent:number[]=[],welded=new Uint32Array(positions.length/3),keys=new Map<string,number>();
  const find=(v:number):number=>{while(parent[v]!==v){parent[v]=parent[parent[v]];v=parent[v];}return v;};
  for(let i=0;i<welded.length;i++){
    const p=i*3,key=`${Math.round(positions[p]*1e5)}:${Math.round(positions[p+1]*1e5)}:${Math.round(positions[p+2]*1e5)}`;
    let id=keys.get(key);if(id===undefined){id=parent.length;parent.push(id);keys.set(key,id);}welded[i]=id;
  }
  for(let i=0;i<indices.length;i+=3){
    const a=find(welded[indices[i]]);parent[find(welded[indices[i+1]])]=a;parent[find(welded[indices[i+2]])]=a;
  }
  const groups=new Map<number,{triangles:number[];edges:Map<string,number>;origin:number;volume:number;normalSign:number}>();
  for(let i=0;i<indices.length;i+=3){
    const ids=[indices[i],indices[i+1],indices[i+2]],v=ids.map(n=>welded[n]);
    if(new Set(v).size<3)continue;
    const root=find(v[0]);let g=groups.get(root);
    if(!g){g={triangles:[],edges:new Map(),origin:ids[0]*3,volume:0,normalSign:0};groups.set(root,g);}
    g.triangles.push(i);
    for(let e=0;e<3;e++){const a=v[e],b=v[(e+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;g.edges.set(key,(g.edges.get(key)??0)+1);}
    const [a,b,c]=ids.map(n=>n*3),ox=g.origin;
    const ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2];
    const vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    g.volume+=(positions[a]-positions[ox])*nx+(positions[a+1]-positions[ox+1])*ny+(positions[a+2]-positions[ox+2])*nz;
    g.normalSign+=normals[a]*nx+normals[a+1]*ny+normals[a+2]*nz;
  }
  const inward=[...groups.values()].filter(g=>g.volume<-1e-7&&[...g.edges.values()].every(n=>n===2));
  if(!inward.length)return null;
  const fixedIndices=Array.from(indices),fixedNormals=new Float32Array(normals),flippedVertices=new Set<number>();
  for(const g of inward)for(const i of g.triangles){
    [fixedIndices[i+1],fixedIndices[i+2]]=[fixedIndices[i+2],fixedIndices[i+1]];
    if(g.normalSign>0)for(let k=0;k<3;k++)flippedVertices.add(indices[i+k]);
  }
  for(const v of flippedVertices)for(let k=0;k<3;k++)fixedNormals[v*3+k]*=-1;
  return {indices:fixedIndices,normals:fixedNormals,flippedVertices,components:inward.length};
}
