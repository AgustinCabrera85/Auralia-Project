import {MaterialPluginBase,type PBRMaterial} from '@babylonjs/core';
import {BRISALIA_PALACE_SITE,PALACE_SCALE} from './PalaceSite';

/** Metre-scaled mineral mottling and sheltered dirt. World coordinates keep
 * adjoining batches continuous and prevent the same stain on every UV tile. */
export class PalaceWeathering extends MaterialPluginBase{
  constructor(material:PBRMaterial,private floor:number,private ground=false){super(material,'PalaceWeathering',180,{},true,true);}
  getClassName(){return 'PalaceWeathering';}
  getCustomCode(type:string){
    if(type!=='fragment')return null;
    return {CUSTOM_FRAGMENT_DEFINITIONS:`
      float palaceHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float palaceNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(palaceHash(i),palaceHash(i+vec3(1,0,0)),f.x),mix(palaceHash(i+vec3(0,1,0)),palaceHash(i+vec3(1,1,0)),f.x),f.y),
        mix(mix(palaceHash(i+vec3(0,0,1)),palaceHash(i+vec3(1,0,1)),f.x),mix(palaceHash(i+vec3(0,1,1)),palaceHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    `,CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
      vec3 palaceP=(vPositionW-vec3(${BRISALIA_PALACE_SITE.x.toFixed(3)},${(this.floor??0).toFixed(3)},${BRISALIA_PALACE_SITE.z.toFixed(3)}))/${PALACE_SCALE.toFixed(6)};
      float palaceCloud=palaceNoise(palaceP*.43)*.65+palaceNoise(palaceP*1.73)*.35;
      float palaceFine=palaceNoise(palaceP*vec3(7.0,.9,7.0));
      float palaceWall=1.0-smoothstep(.25,.8,abs(normalW.y));
      float palaceBand=min(abs(palaceP.y-4.1),min(abs(palaceP.y-8.5),abs(palaceP.y-11.65)));
      float palaceDirt=palaceWall*(exp(-max(palaceP.y,0.0)*2.3)*.19+exp(-palaceBand*12.0)*.2)*(palaceFine*.7+.3);
      surfaceAlbedo*=mix(vec3(.76,.72,.66),vec3(1.04,1.01,.96),palaceCloud)*(1.0-palaceDirt);
      ${this.ground?'surfaceAlbedo*=mix(vec3(.54,.45,.28),vec3(.95,1.04,.71),smoothstep(.3,.75,palaceCloud));':''}
    `};
  }
}
