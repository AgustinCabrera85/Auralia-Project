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
import { GameMusic } from './audio/GameMusic';
import { type LoadingScreen, paintLoadingScreen } from './ui/LoadingScreen';

export async function start(loading:LoadingScreen):Promise<void> {
loading.update(10,'Buscando los caminos de Auralia…','geography');
setWorldDocument(emptyWorldDocument());
const forest=loadFoliageForestAssets().catch(error=>console.warn('[Auralia] No se pudo cargar el Bosque Ilustrado:',error));
const geographicWorld=await PlayableWorld.load();
setActiveGeography(geographicWorld);
configureBuildPlot(-29+geographicWorld.town.x,18+geographicWorld.town.z);
// Authored world data is separate from per-player savegame data.
await forest;
performance.mark('auralia:geography-ready');
loading.update(22,'Preparando Brisalia y sus habitantes…','world');
await paintLoadingScreen();
const repository=new LocalStorageSaveRepository('auralia:worldstudio-playable-v1:save:v1',()=>{
  const save=newGame();save.playerPosition={zone:'brisalia',...geographicWorld.spawn};return save;
});
const store = new GameStore(repository);
let world!: WorldView;
const music=new GameMusic();

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
  canOpenPanel: () => !loading.isBlocking&&(world?.canOpenPanel()??false)
});
hud.attachAudio(music);

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
    onStartupProgress:(progress,message)=>loading.update(progress,message,'terrain'),
    onBuild: () => {
      if (store.milestone === 'sail') hud.notify('¡Tu hogar ya tiene sus primeras piezas! Buscá el muelle al sur.');
    },
    onStructureSelected:structure=>hud.setSelectedStructure(structure)
  }, () => loading.isBlocking||hud.isModalOpen,geographicWorld);
  hud.attachAbilities(world.abilities);
  performance.mark('auralia:world-created');
  if(new URLSearchParams(location.search).has('qa'))Object.assign(window,{__auraliaGame:{world,store,repository,hud,music}});
  if(import.meta.hot)import.meta.hot.dispose(()=>{music.dispose();hud.dispose();world.dispose();document.querySelector('.world-travel')?.remove();});
  await world.prepareStartup();
  await loading.finish();
  music.setInGame(true);
  const debug=new URLSearchParams(location.search).has('debug');
  if(import.meta.env.DEV&&debug){
  const navigation=document.createElement('div');navigation.className='world-travel';
  navigation.style.cssText='position:fixed;left:12px;bottom:72px;z-index:25;display:flex;gap:6px;padding:8px;background:#142333e8;border-radius:8px;color:white;font:13px sans-serif;max-width:90vw;flex-wrap:wrap';
    const destinations=geographicWorld.destinations;
    const places=document.createElement('select');places.ariaLabel='Destino del continente';
    for(const p of destinations){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;places.append(o);}
    const visit=document.createElement('button');visit.textContent='Viajar';visit.onclick=()=>{const p=destinations.find(p=>p.id===places.value)!;world.teleportToLandmark(p.id);};
    const slot=document.createElement('span');slot.textContent='Auralia · Continente';navigation.append(places,visit,slot);
  const igneous=document.createElement('button');igneous.textContent='Reino Ígneo · probar';
  igneous.onclick=()=>{void world.enterIgneousRealm('A0',true).catch(()=>{});};navigation.append(igneous);
  document.body.append(navigation);
  }
  if(new URLSearchParams(location.search).has('reinoIgneo'))
    void world.enterIgneousRealm(new URLSearchParams(location.search).get('checkpoint')??'A0',true).catch(()=>{});
  window.setTimeout(() => hud.notify('¡Bienvenido a Auralia! Buscá materiales, conocé Brisalia y construí tu hogar.'), 800);
} catch (error) {
  music.dispose();
  hud.dispose();
  world?.dispose();
  throw error;
}
}
