import {geometry,handrailGeometry,rampGeometry,slabBoxes,stairFlightGeometry,unionBoxes,type Box,type P3} from './PalaceGeometry';
import {PALACE_TOWER_CENTERS,towerFlights,towerRoofHole} from './PalaceTowerLayout';
import type {Part} from './PalaceModel';

/** Continuous stair cores from the upper gallery to the two battlement walks.
 * Flights bear on a central masonry spine and wall-to-wall landing beams. */
export function palaceTowerStairs(parts:Part[]){
  for(const cx of PALACE_TOWER_CENTERS){
    const prefix=`tower-stair:${cx}:`;
    const add=(id:string,material:string,data:Part['data'],solid=false)=>parts.push({id:prefix+id,material,data,solid,detail:false});
    const boxes=(id:string,material:string,bs:Box[],solid=false)=>add(id,material,unionBoxes(bs,geometry(),material==='oak'),solid);
    boxes('spine','masonry',[[cx-.25,cx+.25,4.8,14.62,2,8]],true);
    const posts:Box[]=[];
    const guard=(id:string,a:P3,b:P3)=>{
      const topA:P3=[a[0],a[1]+1.05,a[2]],topB:P3=[b[0],b[1]+1.05,b[2]];
      add(id+':handrail','oak',handrailGeometry([topA,topB],.16,.14));
      add(id+':collision','hidden',rampGeometry(topA,topB,.12,1.1),true);
      const n=Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.32);
      for(let j=0;j<=n;j++){
        const [x,y,z]=a.map((v,k)=>v+(b[k]-v)*j/n);
        posts.push([x-.055,x+.055,y-.03,y+1.0,z-.055,z+.055]);
      }
    };
    for(const [i,{start,end,width}] of towerFlights(cx).entries()){
      const [x,y,z]=start,dz=end[2]-z;
      const steps=Array.from({length:15},(_,j)=>({bounds_xz:[x-width/2,x+width/2,Math.min(z+dz*j/15,z+dz*(j+1)/15),Math.max(z+dz*j/15,z+dz*(j+1)/15)],top_y:y+2.5*(j+1)/15}));
      add('treads'+i,'stairStone',stairFlightGeometry(steps,start,end,.35));
      add('ramp'+i,'hidden',rampGeometry(start,end,width,.35),true);
      const outside=x+(x<cx?-1:1)*width/2;
      guard('flight'+i,[outside,y,z],[outside,end[1],end[2]]);
      // The last landing is already part of the stone roof deck.
      if(i<3){
        const front=end[2]===2,c=front?.35:8,d=front?2:9.65,ly=end[1];
        boxes('landing'+i,'paving',[[cx-2.15,cx+2.15,ly-.3,ly,c,d]],true);
        boxes('landing-bearer'+i,'oak',[[cx-3.85,cx+3.85,ly-.56,ly-.3,front?c+.15:d-.45,front?c+.45:d-.15]]);
        for(const side of [-1,1])guard('landing-side'+i+':'+side,[cx+side*2.15,ly,c],[cx+side*2.15,ly,d]);
        guard('landing-back'+i,[cx-2.15,ly,front?c:d],[cx+2.15,ly,front?c:d]);
      }
    }
    // Three sides and half of the fourth protect the roof opening. The final
    // right flight arrives at the rear through the remaining gap.
    const y=14.8;
    guard('roof-left',[cx-2.3,y,2],[cx-2.3,y,8]);
    guard('roof-right',[cx+2.3,y,2],[cx+2.3,y,8]);
    guard('roof-back',[cx-2.3,y,8],[cx+.2,y,8]);
    guard('roof-front',[cx-2.3,y,2],[cx+2.3,y,2]);
    boxes('balusters','oak',posts);
    add('roof-deck-collision','hidden',unionBoxes(slabBoxes([[cx-4.8,-.8],[cx+4.8,-.8],[cx+4.8,10.8],[cx-4.8,10.8]],[towerRoofHole(cx)],14.62,14.8)),true);
  }
}
