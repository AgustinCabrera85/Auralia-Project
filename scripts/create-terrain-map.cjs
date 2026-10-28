const fs=require('node:fs');
const path=require('node:path');
const {islandOutline,LANDMARKS,MAINLAND,ROAD_RESERVATIONS,RIVER_RESERVATION,LAKE_RESERVATIONS,biomeAt,isLand}=require('../.test-build/world/terrainData.js');
const {STREAMS,LAGOONS,LAKE_ISLANDS}=require('../.test-build/world/geographicFeatures.js');
const {MAP_VIEW}=require('../.test-build/world/mapProjection.js');
const W=1400,H=1120;
const px=x=>(x-MAP_VIEW.minX)*W/(MAP_VIEW.maxX-MAP_VIEW.minX);
const py=z=>(z-MAP_VIEW.minZ)*H/(MAP_VIEW.maxZ-MAP_VIEW.minZ);
const point=(x,z)=>`${px(x).toFixed(1)},${py(z).toFixed(1)}`;
const outline=islandOutline(240).map(p=>point(p.x,p.z)).join(' ');
const roadPaths=ROAD_RESERVATIONS.map(route=>`<polyline points="${route.points.map(p=>point(...p)).join(' ')}" fill="none" stroke="${route.existing?'#e3d6a5':'#f5eac9'}" stroke-width="${route.existing?5:3}" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${route.existing?'2 13':'10 18'}" opacity="${route.existing?'.88':'.52'}"/>`).join('');
const riverPath=`<polyline points="${RIVER_RESERVATION.map(p=>point(...p)).join(' ')}" fill="none" stroke="#85d8e4" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity=".93"/>`;
const streamPaths=STREAMS.map(s=>`<polyline points="${s.points.map(p=>point(p.x,p.z)).join(' ')}" fill="none" stroke="#9de4e7" stroke-width="3" stroke-linecap="round" opacity=".85"/>`).join('');
const palette={valle:'#a4cb82',ecos:'#4f8969',sierras:'#89988a',nacar:'#70a99e',costa:'#d8c99b',cumbres:'#c4cbd0'};
const biomeCells=Object.fromEntries(Object.keys(palette).map(key=>[key,[]]));
for(let z=MAP_VIEW.minZ;z<MAP_VIEW.maxZ;z+=65){
 for(let x=MAP_VIEW.minX;x<MAP_VIEW.maxX;x+=65){
  if(!isLand(x+32.5,z+32.5))continue;
  biomeCells[biomeAt(x+32.5,z+32.5)].push(`<rect x="${px(x).toFixed(1)}" y="${py(z).toFixed(1)}" width="${(65*W/(MAP_VIEW.maxX-MAP_VIEW.minX)).toFixed(2)}" height="${(65*H/(MAP_VIEW.maxZ-MAP_VIEW.minZ)).toFixed(2)}"/>`);
 }
}
const biomeLayer=Object.keys(palette).map(key=>`<g fill="${palette[key]}">${biomeCells[key].join('')}</g>`).join('');
const waves=[];
for(let i=0;i<180;i++){
 const a=((i*177+41)%W),b=((i*103+97)%H);
 waves.push(`<path d="M${a} ${b} q7 -4 15 0 q8 4 16 0" fill="none" stroke="#b7f0e7" stroke-width="1.5" opacity=".25"/>`);
}
const text=(x,y,title,sub,accent='#f8e9c6')=>`
  <g transform="translate(${x} ${y})">
    <rect x="-92" y="-23" width="184" height="43" rx="12" fill="#143647" stroke="${accent}" stroke-opacity=".65" stroke-width="1.5"/>
    <text text-anchor="middle" y="-4" fill="#fff0cb" font-size="17" font-weight="bold" font-family="Georgia,serif">${title}</text>
    <text text-anchor="middle" y="11" fill="#c4e6d8" font-size="10" letter-spacing=".8">${sub}</text>
  </g>`;
const seedIcon=(x,z,name)=>`
  <g transform="translate(${px(x)} ${py(z)})">
    <circle r="11" fill="#133844" stroke="#fff5c6" stroke-width="3"/>
    <circle r="3.5" fill="#f5c879"/>
    <title>${name}</title>
  </g>`;
const labels=[
 [35,-65,'BRISALIA','Valle templado'],
 [-1120,-880,'LINDEBRUMAS','Bosque encantado'],
 [-620,-1710,'ALTAPIEDRA','Sierras rocosas'],
 [1120,-680,'NÁCAR','Humedales'],
 [260,-2280,'ALTALUZ','Alta montaña'],
 [-1370,120,'COSTA','Bahías y acantilados']
];
const labelEl=labels.map(([x,z,n,sub])=>text(px(x),py(z)-30,n,sub)).join('');
const landMarks=LANDMARKS.map(p=>seedIcon(p.x,p.z,p.name)).join('');
const grid=[];
for(let x=-2000;x<=2000;x+=500){
  grid.push(`<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${H}" stroke="#ddf3e9" stroke-opacity=".13" stroke-dasharray="3 12"/>`);
}
for(let z=-2500;z<=500;z+=500){
  grid.push(`<line x1="0" y1="${py(z)}" x2="${W}" y2="${py(z)}" stroke="#ddf3e9" stroke-opacity=".13" stroke-dasharray="3 12"/>`);
}
const mountains=[];
for(let i=0;i<22;i++){
 const x=-1150+(i%11)*105,z=-1800+(Math.floor(i/11)*115);const yy=py(z),xx=px(x);
 mountains.push(`<path d="M${xx-17} ${yy+16} L${xx} ${yy-30-(i%3)*5} L${xx+24} ${yy+16} Z" fill="#839c91" stroke="#d6ded0" stroke-width="2" opacity=".77"/>`);
}
for(let i=0;i<18;i++){
 const x=-220+(i%9)*110,z=-2260+Math.floor(i/9)*95,yy=py(z),xx=px(x);
 mountains.push(`<path d="M${xx-15} ${yy+17} L${xx} ${yy-31-(i%4)*5} L${xx+18} ${yy+17} Z" fill="#b8c7b9" stroke="#f8f7df" stroke-width="2" opacity=".84"/>`);
}
const isles=[
 {x:-210,z:420,rx:76,rz:61,name:'ISLA DE LAS LUCIÉRNAGAS'},
 {x:2250,z:420,rx:55,rz:40,name:'Peñasco del Herrero (futuro)'},
 {x:2240,z:-650,rx:42,rz:64,name:'Cristal Sonoro (futuro)'},
 {x:-2250,z:-1000,rx:56,rz:49,name:'Bruma Serena (futuro)'}
];
const islandEls=isles.map((s,i)=>{
 const ell=`<ellipse cx="${px(s.x)}" cy="${py(s.z)}" rx="${s.rx*W/(MAP_VIEW.maxX-MAP_VIEW.minX)}" ry="${s.rz*H/(MAP_VIEW.maxZ-MAP_VIEW.minZ)}" fill="${i===0?'#7cb28c':'#759b91'}" stroke="#ffe9b8" stroke-width="5"/>`;
 return `<g>${ell}<circle cx="${px(s.x)}" cy="${py(s.z)}" r="${i===0?8:5}" fill="#ffe2a2"/><title>${s.name}</title></g>`;
}).join('');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">Auralia, mapa geográfico técnico · Update 3</title>
<desc id="desc">Isla principal de aproximadamente 4 por 3 km con seis biomas, río descendente, Lago de Nácar, arroyos y espacio marítimo para otras islas.</desc>
<defs>
<radialGradient id="sea"><stop stop-color="#3d91aa"/><stop offset="1" stop-color="#164c72"/></radialGradient>
<linearGradient id="land" x1=".3" x2=".7" y1="1" y2="0"><stop stop-color="#a4cb82"/><stop offset=".55" stop-color="#739c74"/><stop offset="1" stop-color="#a1b29b"/></linearGradient>
<radialGradient id="west"><stop stop-color="#346b61" stop-opacity=".9"/><stop offset="1" stop-color="#346b61" stop-opacity="0"/></radialGradient>
<radialGradient id="east"><stop stop-color="#8ccbb6" stop-opacity=".8"/><stop offset="1" stop-color="#8ccbb6" stop-opacity="0"/></radialGradient>
<filter id="blend" x="-4%" y="-4%" width="108%" height="108%"><feGaussianBlur stdDeviation="7"/></filter>
<clipPath id="coast"><polygon points="${outline}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="url(#sea)"/>
${waves.join('')} ${grid.join('')}
<polygon points="${outline}" transform="translate(0 9)" fill="#052f46" opacity=".55"/>
<polygon points="${outline}" fill="url(#land)" stroke="#f4dfae" stroke-width="10" stroke-linejoin="round"/>
<g clip-path="url(#coast)">
 <g filter="url(#blend)" opacity=".9">${biomeLayer}</g>
 ${[...LAKE_RESERVATIONS,...LAGOONS].map(p=>`<ellipse cx="${px(p.x)}" cy="${py(p.z)}" rx="${p.radiusX*W/(MAP_VIEW.maxX-MAP_VIEW.minX)*.8}" ry="${p.radiusZ*H/(MAP_VIEW.maxZ-MAP_VIEW.minZ)*.8}" fill="#399da4" stroke="#9ed5bc" stroke-width="4" opacity=".8"/>`).join('')}
 ${LAKE_ISLANDS.map(p=>`<circle cx="${px(p.x)}" cy="${py(p.z)}" r="${p.radius*W/(MAP_VIEW.maxX-MAP_VIEW.minX)*.72}" fill="#9fc58c" stroke="#e3dab0" stroke-width="2"/>`).join('')}
 ${riverPath}
 ${streamPaths}
 ${mountains.join('')}
 ${roadPaths}
</g>
${islandEls}
${landMarks}
${labelEl}
<g transform="translate(${px(-210)} ${py(420)-80})"><rect x="-154" y="0" width="308" height="32" rx="12" fill="#153e51" stroke="#ddc994"/><text x="0" y="21" text-anchor="middle" fill="#fff0cb" font-size="17" font-family="Georgia">Isla de las Luciérnagas · jugable</text></g>
<path d="M${point(33,120)} Q${point(-22,272)} ${point(-210,420)}" fill="none" stroke="#9ee1ee" stroke-width="5" stroke-dasharray="14 12" opacity=".94"/>
<g transform="translate(45 44)"><rect width="480" height="98" rx="18" fill="#103d51" stroke="#e4cb93" stroke-width="3"/>
<text x="23" y="42" font-family="Georgia,serif" font-size="38" fill="#ffedc5">AURALIA</text>
<text x="25" y="70" font-size="17" fill="#c6e8df">GEOGRAFÍA JUGABLE · UPDATE 3 · 4 × 3 KM</text></g>
<g transform="translate(1045 885)"><rect width="310" height="193" rx="15" fill="#103c4fe8" stroke="#d4c295" stroke-width="2"/>
<text x="20" y="32" fill="#f8e7bd" font-size="22" font-family="Georgia">Referencias</text>
<circle cx="32" cy="62" r="8" fill="#f3c979"/><text x="55" y="68" font-size="16" fill="#d9f0e5">Hitos explorables</text>
<line x1="24" y1="98" x2="45" y2="98" stroke="#ffe5b4" stroke-width="5" stroke-dasharray="3 6"/><text x="55" y="104" font-size="16" fill="#d9f0e5">Senderos</text>
<line x1="24" y1="130" x2="45" y2="130" stroke="#98e7ff" stroke-width="4" stroke-dasharray="5 5"/><text x="55" y="135" font-size="16" fill="#d9f0e5">Rutas marítimas</text>
<text x="20" y="168" font-size="12" fill="#c6e2da">Río, lagos y arroyos explorables</text></g>
<g transform="translate(1282 75)" fill="#f2e7c5" text-anchor="middle"><path d="M0 0L-12 40L0 27L12 40Z" fill="#f1cc7e"/><text y="-9" font-size="25" font-family="Georgia">N</text><text y="66" font-size="14">S</text></g>
<text x="38" y="1093" fill="#d5ede6" font-size="15">Coordenadas del terreno real · norte arriba · escala aproximada en metros</text>
</svg>`;
const target=path.resolve(__dirname,'../public/assets/mapa-geografico-v0.2.svg');
fs.writeFileSync(target,svg);
fs.writeFileSync(path.resolve(__dirname,'../docs/Mapa_geografico_auralia_v0.2.svg'),svg);
console.log(`✓ Mapa regional generado ${W}×${H} (${Math.round(fs.statSync(target).size/1024)} KB)`);
