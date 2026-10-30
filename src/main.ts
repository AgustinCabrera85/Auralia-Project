import './style.css';
import { GameStore } from './domain/GameStore';
import { LocalStorageSaveRepository } from './persistence/SaveRepository';
import { WorldView } from './game/WorldView';
import { Hud } from './ui/Hud';

const store = new GameStore(new LocalStorageSaveRepository());
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
    onBuild: () => {
      if (store.milestone === 'sail') hud.notify('¡Tu hogar ya tiene sus primeras piezas! Buscá el muelle al sur.');
    },
    onStructureSelected:structure=>hud.setSelectedStructure(structure)
  }, () => hud.isModalOpen);
  window.setTimeout(() => hud.notify('¡Bienvenido a Auralia! Buscá materiales, conocé Brisalia y construí tu hogar.'), 800);
} catch (error) {
  console.error('No se pudo iniciar Auralia', error);
  const errorPanel = document.createElement('div');
  errorPanel.className = 'fatal-error';
  errorPanel.innerHTML = '<h2>No se pudo iniciar el mundo 3D</h2><p>Verificá que tu navegador tenga WebGL habilitado y consultá la consola para más detalles.</p>';
  document.body.appendChild(errorPanel);
}
