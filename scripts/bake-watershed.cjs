// Offline drainage audit and review map. Nothing here is shipped to the frame loop.
const fs=require('node:fs'),path=require('node:path');
const {PILOT_DRAINAGE,validateDrainage,WatershedHydrology}=require('../.test-build/world/WatershedHydrology.js');
const {LAGOON_CHANNELS,lagoonWaterAt,CASCADE_LAGOON}=require('../.test-build/world/lagoonData.js');
const {HEADWATER_CATCHMENTS,HEADWATER_LAKE}=require('../.test-build/world/watershedHeadwaters.js');
const {sampleMainlandHeight}=require('../.test-build/world/terrainData.js');
const {nearTerrainHeightAt}=require('../.test-build/world/terrainLod.js');
const ground=(x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight);
const errors=validateDrainage(),sections=[];
for(const [index,route] of LAGOON_CHANNELS.entries()){
  let length=0,minDepth=Infinity,maxGrade=0,stations=0;
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],len=Math.hypot(b.x-a.x,b.z-a.z),count=Math.ceil(len/3);
    maxGrade=Math.max(maxGrade,(a.level-b.level)/len);
    for(let j=1;j<=count;j++){
      const t=j/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      if(index>=4&&length+len*t<24)continue;
      const water=lagoonWaterAt(x,z),depth=(water?.level??-Infinity)-ground(x,z);
      minDepth=Math.min(minDepth,depth);stations++;
      if(depth<=.05)errors.push(`Obstrucción en reach-${index}: ${x.toFixed(2)}, ${z.toFixed(2)}`);
    }
    length+=len;
  }
  sections.push({id:`reach-${index}`,lengthM:+length.toFixed(1),stations,
    minRenderedDepthM:+minDepth.toFixed(3),maxGrade:+maxGrade.toFixed(3)});
}
const climateScenarios=[];
for(const [season,rain] of [['winter',0],['spring',0],['spring',1],['summer',0]]){
  const h=new WatershedHydrology();h.update(0,rain,season);
  climateScenarios.push({season,rain,relativeOutflow:h.flows.at(-1)});
}
const report={name:'Cuenca piloto de las Tres Vertientes',
  method:'Red dirigida diseñada y validada contra triángulos de terreno de 6 m. No es una extracción automática de cuencas ni una simulación de fluidos.',
  flowUnits:'Índice relativo de aporte de esta cuenca, no m³/s. El tramo compartido del río principal no incluye otros aportes.',
  stationSpacingM:3,catchments:HEADWATER_CATCHMENTS,sections,climateScenarios,
  reaches:PILOT_DRAINAGE,errors};
const dir=path.join(__dirname,'../artifacts/hydrology');fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'tres-vertientes.json'),JSON.stringify(report,null,2)+'\n');
const ox=70,oy=150,scale=.31,px=x=>ox+(x+1000)*scale,py=z=>oy+(z+1900)*scale;
const svg=[`<svg xmlns="http://www.w3.org/2000/svg" width="820" height="1020" viewBox="0 0 820 1020">
<rect width="820" height="1020" fill="#101f2a"/>
<style>text{font-family:Arial,sans-serif;fill:#dfebea} .label{font-size:12px;paint-order:stroke;stroke:#101f2a;stroke-width:4px;stroke-linejoin:round}</style>
<defs><marker id="flow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#87e4df"/></marker></defs>
<text x="40" y="45" font-size="24">Auralia · Cuenca de las Tres Vertientes</text>
<text x="40" y="73" font-size="14">Red piloto: nacimientos → afluentes → lagunas → río principal → mar</text>
<text x="40" y="97" font-size="12">Coordenadas en metros · norte arriba · escala del mundo aún abierta</text>`];
for(const c of HEADWATER_CATCHMENTS){
  svg.push(`<ellipse cx="${px(c.x)}" cy="${py(c.z-c.length*.5)}" rx="${c.halfWidth*scale}" ry="${c.length*.65*scale}" fill="#526d56" fill-opacity=".38" stroke="#91b279" stroke-dasharray="5 5"/>`);
}
for(const l of [HEADWATER_LAKE,CASCADE_LAGOON])svg.push(`<ellipse cx="${px(l.x)}" cy="${py(l.z)}" rx="${l.radiusX*scale}" ry="${l.radiusZ*scale}" fill="#277b8a" stroke="#87e4df"/>`);
for(const r of PILOT_DRAINAGE){
  if(r.kind==='lake'||r.kind==='sea')continue;
  svg.push(`<polyline points="${r.points.map(p=>`${px(p.x)},${py(p.z)}`).join(' ')}" fill="none" stroke="${r.kind==='fall'?'#ffffff':'#87e4df'}" stroke-width="${r.id.startsWith('reach-')&&+r.id.slice(6)>=4?2:3}" stroke-linejoin="round" marker-end="url(#flow)"/>`);
}
const labels=[[-920,-1565,'Ferragrís · manantial 150 m'],[-445,-1220,'Velo · dos quebradas de lluvia'],
  [115,-1360,'Gemelas · aporte estacional'],[105,-1140,'Laguna Alta · 64 m'],
  [-610,-800,'Tres Vertientes · 24 m'],[-45,-545,'Desagüe permanente'],[170,-175,'Arroyo del Prado'],
  [355,40,'Confluencia con el río principal'],[180,290,'Desembocadura · mar']];
for(const [x,z,text] of labels)svg.push(`<text class="label" x="${px(x)}" y="${py(z)}">${text}</text>`);
svg.push(`<text x="40" y="890" font-size="14">${sections.reduce((n,s)=>n+s.stations,0)} estaciones de cauce verificadas · ${errors.length} errores</text>
<text x="40" y="920" font-size="12">Líneas discontinuas: áreas de alimentación diseñadas; no divisorias calculadas.</text>
<text x="40" y="942" font-size="12">El caudal visual responde a lluvia y estación, con retardo en manantial y lagunas.</text>
<text x="40" y="964" font-size="12">La cota del agua permanece fija. La red no simula erosión ni inundaciones.</text></svg>`);
fs.writeFileSync(path.join(dir,'tres-vertientes.svg'),svg.join('\n'));
console.log(`Cuenca: ${PILOT_DRAINAGE.length} tramos, ${sections.reduce((n,s)=>n+s.stations,0)} estaciones, ${errors.length} errores. Artifacts: ${dir}`);
if(errors.length){console.error(errors.slice(0,12));process.exitCode=1;}
