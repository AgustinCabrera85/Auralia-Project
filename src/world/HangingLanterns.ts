import { Mesh, Scene, StandardMaterial, TransformNode, VertexBuffer, VertexData } from '@babylonjs/core';
import { ChainDynamics, type ChainState } from '../physics/ChainDynamics';
import { ChainCurve } from '../physics/ChainCurve';
import type { Point3 } from '../physics/DistanceFields';

/** Two dynamic meshes per streamed group, never a mesh/material/observer per
 * cable segment. Six simulation points reconstruct twenty-five render rings. */
export class HangingLanterns {
  readonly chains:ChainState[]=[];
  private readonly curve=new ChainCurve();
  private readonly rope:Mesh;private readonly lanterns:Mesh;
  private readonly ropePositions:Float32Array;private readonly ropeNormals:Float32Array;
  private readonly lampPositions:Float32Array;private readonly lampNormals:Float32Array;
  private readonly axes=new Float64Array(9);
  reconstructionMs=0;
  constructor(scene:Scene,readonly root:TransformNode,private readonly dynamics:ChainDynamics,
    anchors:readonly (Point3&{length:number})[],cord:StandardMaterial,glow:StandardMaterial){
    for(const a of anchors)this.chains.push(dynamics.add({points:Array.from({length:6},(_,i)=>({x:a.x,y:a.y-a.length*i/5,z:a.z})),
      radius:.045,tipRadius:.59,compliance:2e-7,iterations:6,damping:1.6,worldCollision:true}));
    this.ropePositions=new Float32Array(anchors.length*25*6*3);this.ropeNormals=new Float32Array(this.ropePositions.length);
    this.lampPositions=new Float32Array(anchors.length*24*3);this.lampNormals=new Float32Array(this.lampPositions.length);
    const ropeIndices:number[]=[],lampIndices:number[]=[];
    for(let c=0;c<anchors.length;c++){
      for(let ring=0;ring<24;ring++)for(let side=0;side<6;side++){
        const a=c*150+ring*6+side,b=c*150+ring*6+(side+1)%6;ropeIndices.push(a,a+6,b,b,a+6,b+6);
      }
      for(let f=0;f<6;f++){const a=c*24+f*4;lampIndices.push(a,a+1,a+2,a,a+2,a+3);}
    }
    const create=(name:string,positions:Float32Array,normals:Float32Array,indices:number[],mat:StandardMaterial)=>{
      const mesh=new Mesh(name,scene),data=new VertexData();Object.assign(data,{positions,normals,indices});data.applyToMesh(mesh,true);
      mesh.parent=root;mesh.material=mat;mesh.isPickable=false;return mesh;
    };
    this.rope=create('cables-faroles',this.ropePositions,this.ropeNormals,ropeIndices,cord);
    this.lanterns=create('faroles-colgantes',this.lampPositions,this.lampNormals,lampIndices,glow);
    this.render(1);
  }
  prepare(time:number,inside:boolean){
    const visible=this.root.isEnabled();
    for(const c of this.chains){c.enabled=visible;c.setWind(inside?.06:Math.sin(time*.8+c.id)*.6,inside?0:Math.cos(time*.6)*.35);}
  }
  render(alpha:number){
    const start=performance.now();if(!this.root.isEnabled()){this.reconstructionMs=0;return;}
    for(let c=0;c<this.chains.length;c++){
      const chain=this.chains[c];this.curve.update(chain,alpha);
      const p=this.curve.points,n=this.curve.normals,b=this.curve.binormals;
      for(let ring=0;ring<25;ring++)for(let side=0;side<6;side++){
        const angle=side*Math.PI/3,co=Math.cos(angle),si=Math.sin(angle),j=ring*3,k=(c*150+ring*6+side)*3;
        for(let axis=0;axis<3;axis++){const normal=n[j+axis]*co+b[j+axis]*si;this.ropeNormals[k+axis]=normal;this.ropePositions[k+axis]=p[j+axis]+normal*.035;}
      }
      // Cuboid attached to final tangent frame; shared vertex buffers.
      const j=72,nx=n[j],ny=n[j+1],nz=n[j+2],bx=b[j],by=b[j+1],bz=b[j+2];
      const tx=ny*bz-nz*by,ty=nz*bx-nx*bz,tz=nx*by-ny*bx;
      const axes=this.axes;axes[0]=nx;axes[1]=ny;axes[2]=nz;axes[3]=tx;axes[4]=ty;axes[5]=tz;axes[6]=bx;axes[7]=by;axes[8]=bz;
      for(let f=0;f<6;f++)for(let v=0;v<4;v++){
        const axis=Math.floor(f/2),sign=f%2?1:-1,u=(axis+1)%3,w=(axis+2)%3;
        const us=(v===0||v===3?-1:1),vs=(v<2?-1:1)*sign;
        for(let k=0;k<3;k++){
          const target=(c*24+f*4+v)*3+k;
          this.lampNormals[target]=axes[axis*3+k]*sign;
          this.lampPositions[target]=p[j+k]+axes[axis*3+k]*sign*(axis===1?.4:.3)+axes[u*3+k]*us*(u===1?.4:.3)+axes[w*3+k]*vs*(w===1?.4:.3);
        }
      }
    }
    this.rope.updateVerticesData(VertexBuffer.PositionKind,this.ropePositions,true);this.rope.updateVerticesData(VertexBuffer.NormalKind,this.ropeNormals);
    this.lanterns.updateVerticesData(VertexBuffer.PositionKind,this.lampPositions,true);this.lanterns.updateVerticesData(VertexBuffer.NormalKind,this.lampNormals);
    this.reconstructionMs=performance.now()-start;
  }
  dispose(){for(const c of this.chains)this.dynamics.remove(c.id);this.rope.dispose();this.lanterns.dispose();}
}
