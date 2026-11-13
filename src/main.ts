import { emptyWorldDocument, setWorldDocument } from './world/editor/WorldEditState';
import './style.css';
import { GameStore } from './domain/GameStore';
import { LocalStorageSaveRepository } from './persistence/SaveRepository';
import { WorldView } from './game/WorldView';
import { Hud } from './ui/Hud';
import { loadFoliageForestAssets } from './world/foliageForestData';
import { PlayableWorld } from './world/geography/PlayableWorld';
import { setActiveGeography } from './world/geography/ActiveGeography';
import { configureBuildPlot } from './domain/buildingRules';
import { newGame } from './domain/types';

async function start():Promise<void> {
const useStudio=new URLSearchParams(location.search).get('world')==='worldstudio';
const geographicWorld=useStudio?await PlayableWorld.load():null;
setActiveGeography(geographicWorld);
configureBuildPlot(-29+(geographicWorld?.town.x??0),18+(geographicWorld?.town.z??0));
// Authored world data is separate from per-player savegame data.
try{
  if(geographicWorld)setWorldDocument(emptyWorldDocument());
  else {const r=await fetch('/world/auralia-world.json',{cache:'no-store'});
    setWorldDocument(r.ok?await r.json():emptyWorldDocument());}
}catch(e){
  console.warn('[Auralia] World editor data unavailable:',e);
  setWorldDocument(emptyWorldDocument());
}
try {
  await loadFoliageForestAssets();
} catch (error) {
  console.warn('[Auralia] No se pudo cargar el Bosque Ilustrado:', error);
}
const repository=new LocalStorageSaveRepository(geographicWorld?'auralia:worldstudio-playable-v1:save:v1':undefined,()=>{
  const save=newGame();if(geographicWorld)save.playerPosition={zone:'brisalia',...geographicWorld.spawn};return save;
});
const store = new GameStore(repository);
let world: WorldView;

const hud = new Hud(store, {
  interact: () => world.interact(),
  beginBuild: type => world.beginPlacement(type),
  cancelBuild: () => world.cancelPlacement(),
  removeSelected:()=>world.removeSelected(),
  replaceSelected:type=>world.replaceSelected(type),
  undoLastBuild:()=>world.undoLastPlacement(),
  reset: () => { store.reset(); world.refreshFromSave(); },
  virtualKey: (key, active) => world.setVirtualKey(key, active),
  gotoLandmark: id => world.teleportToLandmark(id),
  setRenderQuality: quality => world.setRenderQuality(quality),
  canOpenPanel: () => world?.canOpenPanel()??true
});

try {
  world = new WorldView(hud.canvas, store, {
    notify: message => hud.notify(message),
    dialogue: (name, text) => hud.dialogue(name, text),
    openCraft: () => hud.open('craft'),
    hint: message => hud.hint(message),
    onTravel: zone => hud.onTravel(zone),
    onExplore: (x,z,region,chunks) => hud.onExplore(x,z,region,chunks),
    onClimate: frame => hud.setClimate(frame),
    onCameraHeading: radians => hud.setCameraHeading(radians),
    onBuild: () => {
      if (store.milestone === 'sail') hud.notify('¡Tu hogar ya tiene sus primeras piezas! Buscá el muelle al sur.');
    },
    onStructureSelected:structure=>hud.setSelectedStructure(structure)
  }, () => hud.isModalOpen,geographicWorld);
  const navigation=document.createElement('div');navigation.className='world-source-switch';
  navigation.style.cssText='position:fixed;left:12px;bottom:72px;z-index:25;display:flex;gap:6px;padding:8px;background:#142333e8;border-radius:8px;color:white;font:13px sans-serif;max-width:90vw;flex-wrap:wrap';
  const source=document.createElement('select');source.ariaLabel='Mundo';
  source.innerHTML='<option value="legacy">Mundo actual</option><option value="worldstudio">Nuevo continente</option>';
  source.value=useStudio?'worldstudio':'legacy';source.onchange=()=>{const url=new URL(location.href);url.search='';if(source.value==='worldstudio')url.searchParams.set('world','worldstudio');location.assign(url);};navigation.append(source);
  if(geographicWorld){
    const destinations=geographicWorld.destinations;
    const places=document.createElement('select');places.ariaLabel='Destino del nuevo continente';
    for(const p of destinations){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;places.append(o);}
    const visit=document.createElement('button');visit.textContent='Viajar';visit.onclick=()=>{const p=destinations.find(p=>p.id===places.value)!;world.teleportToLandmark(p.id);};
    const slot=document.createElement('span');slot.textContent='Partida del nuevo continente';navigation.append(places,visit,slot);
  }
  document.body.append(navigation);
  if(new URLSearchParams(location.search).has('qa'))Object.assign(window,{__auraliaGame:{world,store,repository,hud}});
  window.setTimeout(() => hud.notify('¡Bienvenido a Auralia! Buscá materiales, conocé Brisalia y construí tu hogar.'), 800);
} catch (error) {
  console.error('No se pudo iniciar Auralia', error);
  const errorPanel = document.createElement('div');
  errorPanel.className = 'fatal-error';
  errorPanel.innerHTML = '<h2>No se pudo iniciar el mundo 3D</h2><p>Verificá que tu navegador tenga WebGL habilitado y consultá la consola para más detalles.</p>';
  document.body.appendChild(errorPanel);
}
}

void start().catch(error=>{console.error(error);const panel=document.createElement('p');panel.className='fatal-error';panel.textContent=`No se pudo preparar el mundo: ${String(error)}`;document.body.append(panel);});
