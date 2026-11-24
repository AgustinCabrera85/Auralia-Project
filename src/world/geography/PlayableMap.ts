import type { PlayablePlace, PlayableRegion } from './PlayablePlaces';
import type { GeographicBounds } from './GeographicSource';

const xml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
/** Square, north-up projection shared by the baked relief and live markers.
 * No scene capture, terrain generation or GPU pass is needed to open the atlas. */
export function playableMapMarkup(places:readonly PlayablePlace[],regions:readonly PlayableRegion[],
  bounds:GeographicBounds,selected='brisalia'):string{
  const [x0,z0,x1,z1]=bounds;
  const project=(x:number,z:number)=>({x:(x-x0)/(x1-x0)*1000,y:(z-z0)/(z1-z0)*1000});
  const regionLabels=regions.map(r=>{
    const p=project(r.x,r.z),words=r.name.split(' '),lines:string[]=[''];
    for(const word of words){const i=lines.length-1;
      if(lines[i].length+word.length>23)lines.push(word);else lines[i]+=(lines[i]?' ':'')+word;}
    // Valle's settlement cluster needs a little breathing room south of town.
    const dy=r.id==='VAL'?64:r.id==='NAC'?37:-18;
    return `<text class="atlas-region" x="${p.x}" y="${p.y+dy}" text-anchor="middle"><title>${xml(r.name)}</title>${lines.map((line,i)=>
      `<tspan x="${p.x}" dy="${i?'1.2em':0}">${xml(line)}</tspan>`).join('')}</text>`;
  }).join('');
  const pins=places.map((d,index)=>{
    const p=project(d.x,d.z),active=d.id===selected;
    return `<a href="#destino-${xml(d.id)}" data-marker="${xml(d.id)}" data-place="${xml(d.id)}" class="atlas-marker${active?' selected':''}" aria-label="Ver ${xml(d.name)}">
      <title>${xml(d.name)}</title><g transform="translate(${p.x} ${p.y})"><g class="atlas-symbol">
      <circle class="atlas-hit" r="10"/>
      ${d.floating?'<path class="atlas-pin floating" d="M0 -7 6 0 0 7 -6 0Z"/>':`<circle class="atlas-pin" r="${active?6:4}"/>`}
      <circle class="atlas-pin-center" r="1.4"/>
      <text class="atlas-number" x="8" y="-6">${index+1}</text></g></g></a>`;
  }).join('');
  return `<svg class="atlas-relief" viewBox="0 0 1000 1000" role="group" aria-label="Mapa de relieve de Auralia, norte arriba">
    <image href="/auralia-preview/maps/playable-relief.webp" width="1000" height="1000"/>
    <g class="atlas-grid" aria-hidden="true">${[-6000,-4000,-2000,0,2000,4000,6000].map(v=>{
      const p=project(v,v);return `<path d="M${p.x} 0V1000 M0 ${p.y}H1000"/>`;
    }).join('')}</g>
    ${regionLabels}${pins}
    <text class="atlas-ocean" x="500" y="950" text-anchor="middle">OCÉANO DE AURALIA</text>
  </svg>`;
}
