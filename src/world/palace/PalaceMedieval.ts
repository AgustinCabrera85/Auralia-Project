import {geometry,turnedGeometry,unionBoxes,type Box} from './PalaceGeometry';
import type {Part} from './PalaceModel';

/** Keep the reference circulation, but give its spaces a courtly use. */
export const MEDIEVAL_ROOMS:Record<string,string>={
  P03:'Antesala de la corte',P04:'Cancillería',P05:'Guardarropa de la corte',S01:'Gran salón de la corte',
  S02:'Escalera de la torre oeste',S03:'Aposento de emisarios',S04:'Cámara de huéspedes oeste',
  S05:'Cámara de huéspedes este',S06:'Aposento de la corte',S07:'Escalera de la torre este',
  S08:'Galería de linajes',S10:'Escribanía',S12:'Cámara real oeste',S16:'Cámara real este',
};

/** Freestanding wash furniture: staved tubs, ewers and wooden close stools.
 * Everything fits the reference footprint; there is no plumbed sanitary ware. */
export function medievalWashFurniture(parts:Part[],id:string,bounds:readonly number[],y:number,kind:'tub'|'stool'|'basin'){
  const [a,b,c,d]=bounds,x=(a+b)/2,z=(c+d)/2,w=b-a,depth=d-c;
  const boxes=(suffix:string,material:string,bs:Box[])=>parts.push({id:id+':'+suffix,material,solid:false,detail:true,data:unionBoxes(bs,geometry(),material==='oak')});
  const turn=(suffix:string,material:string,cx:number,cz:number,profile:readonly (readonly [number,number])[],zScale=1)=>{
    const g=turnedGeometry(cx,cz,profile,24,true);
    for(let i=0;i<g.positions.length;i+=3){g.positions[i+2]=cz+(g.positions[i+2]-cz)*zScale;g.normals[i+2]/=zScale;const l=Math.hypot(...g.normals.slice(i,i+3));for(let k=0;k<3;k++)g.normals[i+k]/=l;}
    parts.push({id:id+':'+suffix,material,solid:false,detail:true,data:g});
  };
  if(kind==='tub'){
    const r=w*.46,scale=depth/w;
    turn('staved-tub','oak',x,z,[[0,y+.025],[r*.78,y+.025],[r*.8,y+.08],[r,y+.63],[r*.87,y+.63],[r*.69,y+.12],[0,y+.12]],scale);
    for(const h of [.13,.49]){const radius=r*(.8+.2*(h-.08)/.55);turn('forged-hoop'+h,'iron',x,z,[[radius+.007,y+h],[radius+.024,y+h],[radius+.038,y+h+.045],[radius+.022,y+h+.045]],scale);}
    for(let i=0;i<24;i++){const angle=i*Math.PI/12,xx=x+Math.cos(angle)*r*.92,zz=z+Math.sin(angle)*r*.92*scale;boxes('stave-peg'+i,'iron',[[xx-.012,xx+.012,y+.515,y+.54,zz-.012,zz+.012]]);}
  }else if(kind==='stool'){
    const seat=y+.49,hole=Math.min(w,depth)*.19;
    boxes('close-stool','oak',[[a+.04,b-.04,y+.02,seat,c+.04,c+.1],[a+.04,b-.04,y+.02,seat,d-.1,d-.04],[a+.04,a+.1,y+.02,seat,c+.1,d-.1],[b-.1,b-.04,y+.02,seat,c+.1,d-.1],
      [a,b,seat,seat+.065,c,z-hole],[a,b,seat,seat+.065,z+hole,d],[a,x-hole,seat,seat+.065,z-hole,z+hole],[x+hole,b,seat,seat+.065,z-hole,z+hole]]);
    boxes('stool-shadow','iron',[[a+.1,b-.1,y+.08,y+.09,c+.1,d-.1]]);
    boxes('stool-lid','oak',[[a+.015,b-.015,seat+.065,seat+.14,d-.12,d-.025]]);
  }else{
    boxes('washstand','oak',[[a,b,y+.7,y+.78,c,d],...[a+.04,b-.12].flatMap(xx=>[c+.04,d-.12].map(zz=>[xx,xx+.08,y,y+.7,zz,zz+.08] as Box))]);
    const count=Math.max(1,Math.floor(w/1.1)),r=Math.min(depth*.34,w/count*.3);
    for(let i=0;i<count;i++){
      const cx=a+w*(i+.5)/count;
      turn('beaten-basin'+i,'brass',cx,z,[[0,y+.78],[r*.65,y+.79],[r,y+.92],[r*.9,y+.94],[r*.54,y+.82],[0,y+.82]]);
      const ex=cx+r*.8,ez=z+depth*.32,er=Math.min(.075,depth*.1);
      turn('earthen-ewer'+i,'pottery',ex,ez,[[0,y+.78],[er*.7,y+.78],[er,y+.88],[er*.75,y+.96],[er*.42,y+1.02],[er*.55,y+1.06],[er*.4,y+1.06],[er*.3,y+1.0]]);
    }
  }
}
