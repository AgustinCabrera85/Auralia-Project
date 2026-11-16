// Reproducible design evidence, projected from the actual runtime mesh builders.
const fs=require('node:fs'),path=require('node:path');
const d=require('../.test-build/world/volcanicCaveData.js');
const dir='artifacts/volcanic-cave/design';fs.mkdirSync(`${dir}/plans`,{recursive:true});
const write=(name,value)=>fs.writeFileSync(`${dir}/${name}`,JSON.stringify(value,null,2)+'\n');
const shell=d.buildCaveShell();
const section=y=>{const lines=[];for(let i=0;i<shell.indices.length;i+=3){
  const p=shell.indices.slice(i,i+3).map(j=>shell.positions.slice(j*3,j*3+3)),hits=[];
  for(let k=0;k<3;k++){const a=p[k],b=p[(k+1)%3];if((a[1]<y)!==(b[1]<y)){const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])]);}}
  if(hits.length===2)lines.push(`M${hits[0].map(n=>n.toFixed(2)).join(' ')}L${hits[1].map(n=>n.toFixed(2)).join(' ')}`);
}return `<path d="${lines.join('')}" fill="none" stroke="#222" stroke-width=".18"/>`;};
const top=d.CAVE_ROUTES.map(route=>{const g=d.buildCaveRoute(route),polys=[];for(let i=0;i<g.indices.length;i+=3){
  const p=g.indices.slice(i,i+3).map(j=>g.positions.slice(j*3,j*3+3));
  const normalY=(p[0][2]-p[1][2])*(p[2][0]-p[1][0])-(p[0][0]-p[1][0])*(p[2][2]-p[1][2]);
  if(normalY>0)polys.push(`<polygon points="${p.map(v=>`${v[0].toFixed(2)},${v[2].toFixed(2)}`).join(' ')}" fill="${p[0][1]<-400?'#bbb':'#e4e4e4'}" stroke="#555" stroke-width=".06"/>`);
}return polys.join('');}).join('');
const svg=body=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-65 -92 130 175" width="780" height="1050"><rect x="-65" y="-92" width="130" height="175" fill="white"/>${body}</svg>`;
fs.writeFileSync(`${dir}/plans/floor.svg`,svg(section(-391)+top));
fs.writeFileSync(`${dir}/plans/ceiling.svg`,svg(section(-379)+section(-370)));
write('room-brief.json',{schema:'game-room.room-brief.v1',roomId:d.VOLCANIC_CAVE.id,family:'gameplay-room',
  purpose:'Discover and explore a volcanic cavern, cross above and below a natural bridge, find two persistent rewards and return safely.',
  runtimeSurface:'Existing local Auralia Babylon.js runtime; code-native procedural meshes, no Blender export or paid asset generation.',
  boundsMeters:[120,78,174],terrainPolicy:'Compact landing carved into the canonical terrain; mountain outside the entrance footprint is unchanged',hero:{id:'natural-bridge',role:'Reveal with separate upper and lower routes',reservedBoundsMeters:[36,13,11]},
  symmetry:{mode:'none',order:1,appliesTo:['architecture','circulation'],exceptions:['Asymmetric eroded lava-tube branches']},
  circulation:{description:'Main route, lower loop, mineral chamber and upper return shortcut. All routes walkable in both directions.',minimumClearanceMeters:3.8},
  productionCamera:{viewport:[1440,1000],location:[-20,-386,3],target:[-20,-392,-14],verticalFovDegrees:45.8},
  performanceBudget:{maxSceneTriangles:100000,maxVLowBytes:16000000,maxHighTextureBytes:8000000},creditBudget:{maximumCredits:0,approvalRequired:false},
  environment:{type:'none',identity:'Sealed cavern; weather continues outside',source:'',assignmentKey:'crisol'},
  artifacts:{floorPlan:'plans/floor.svg',reflectedCeilingPlan:'plans/ceiling.svg',planMetadata:'plan-metadata.json',visualTarget:'../bridge.png',wallElevations:['../under-bridge.png'],openingContactSheet:'../entrance.png'}});
write('room-layout.json',{schema:'game-room.layout.v1',roomId:d.VOLCANIC_CAVE.id,units:'meters',
  source:'src/world/volcanicCaveData.ts',baseY:d.VOLCANIC_CAVE.baseY,exterior:d.VOLCANIC_CAVE.entrance,
  surfaces:[{id:'shell',method:'marching tetrahedra of a smooth union of noisy air cavities',step:3},{id:'routes',method:'closed rock ribbons with mitered joints and tapered undersides'}],
  nodes:d.CAVE_NODES,routes:d.CAVE_ROUTES,fixtures:d.CAVE_LIGHTS,instances:[],
  productionCamera:{controller:'WorldView.updateCameraOcclusion',maxInteriorRadius:18,clearance:.5}});
write('props.json',{schema:'game-room.prop-manifest.v1',roomId:d.VOLCANIC_CAVE.id,generation:{provider:'repository-native geometry',hardCreditCeiling:0},
  assets:[{id:'mineral-cluster',class:'reusable',function:'Visible route cue and collectible discovery',dimensionsMeters:[3,4.8,3],attachmentFace:'floor',semanticFront:'positive-y',source:'src/world/VolcanicCaveSystem.ts',rejectionCriteria:['Floating bases','Occluded interaction','Unreachable reward']},
    {id:'basalt',class:'reusable',function:'Rock surface detail',source:'public/assets/terrain/biomes/textures/albedo/biome_volcanico_basalto_albedo_1k.webp',provenance:'Existing repository texture, reused unchanged'}]});
write('openings.json',{schema:'game-room.opening-schedule.v1',roomId:d.VOLCANIC_CAVE.id,
  primaryArrival:{openingId:'crisol-mouth',transition:'Walk into the exterior vestibule; E optionally enters the separate interior.'},
  openings:[{id:'crisol-mouth',kind:'walkable_cave_vestibule',widthMeters:12.4,profileHeight:10,depthMeters:10.5,wall:'locally recessed volcanic slope',destination:'Caverna del Crisol via E',threshold:'level landing shared by rendering and traversal at (-342,-4287)',geometry:'48-triangle rock shell and 9-triangle recessed back; existing terrain vertices form the approach and landing.'}]});
write('plan-metadata.json',{schema:'game-room.plan-metadata.v1',roomId:d.VOLCANIC_CAVE.id,style:'monochrome-engineering',projectionSource:'actual-meshes',
  layers:['lower-room','reflected-ceiling'],semanticLabelsOutsideImage:true,aiInspirationIncluded:false,source:'scripts/document-volcanic-cave.cjs',
  coverage:['room-outline','cutouts','circulation','placed-features'],
  notes:{signs:'No physical signage; the HUD identifies the E entrance and exit.',markers:'Mineral clusters mark route nodes.',openings:'Walkable vestibule reviewed separately in entrance.png and the left/right/above views; the interior exit has a recessed daylight cue.',ceiling:'Two horizontal sections of the actual cavity mesh; no decorative ceiling props.'}});
write('milestone-reviews.json',{schema:'game-room.milestone-reviews.v1',roomId:d.VOLCANIC_CAVE.id,
  function:{status:'authorized-scope',approvedBy:'user',evidence:['Conversation: Quiero que empieces por la primera caverna completa'],notes:'Execution of the proposed first cave authorized; no separate approval of later screenshots is claimed.'},
  form:{status:'local-review',evidence:['../bridge.png','../under-bridge.png','../ceiling.png'],notes:'Code-native runtime geometry; no export/deployment gate crossed.'},
  runtime:{status:'local-review',evidence:['../browser-checks.json'],notes:'Player review remains available in the local running project; no publication requested.'}});
console.log('Cave design evidence refreshed:',path.resolve(dir));
