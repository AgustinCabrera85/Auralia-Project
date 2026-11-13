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
const geographicWorld=await PlayableWorld.load();
setActiveGeography(geographicWorld);
configureBuildPlot(-29+geographicWorld.town.x,18+geographicWorld.town.z);
// Authored world data is separate from per-player savegame data.
setWorldDocument(emptyWorldDocument());
try {
  await loadFoliageForestAssets();
} catch (error) {
  console.warn('[Auralia] No se pudo cargar el Bosque Ilustrado:', error);
}
const repository=new LocalStorageSaveRepository('auralia:worldstudio-playable-v1:save:v1',()=>{
  const save=newGame();save.playerPosition={zone:'brisalia',...geographicWorld.spawn};return save;
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
  const navigation=document.createElement('div');navigation.className='world-travel';
  navigation.style.cssText='position:fixed;left:12px;bottom:72px;z-index:25;display:flex;gap:6px;padding:8px;background:#142333e8;border-radius:8px;color:white;font:13px sans-serif;max-width:90vw;flex-wrap:wrap';
    const destinations=geographicWorld.destinations;
    const places=document.createElement('select');places.ariaLabel='Destino del continente';
    for(const p of destinations){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;places.append(o);}
    const visit=document.createElement('button');visit.textContent='Viajar';visit.onclick=()=>{const p=destinations.find(p=>p.id===places.value)!;world.teleportToLandmark(p.id);};
    const slot=document.createElement('span');slot.textContent='Auralia · Continente';navigation.append(places,visit,slot);
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
