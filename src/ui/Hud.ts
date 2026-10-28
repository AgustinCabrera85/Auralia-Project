import { MAP_LOCATIONS, ZONES, type ZoneId } from '../data/world';
import { GameStore, type Milestone } from '../domain/GameStore';
import { BUILD_CATALOG, RECIPES, costAsText, hasCost } from '../domain/recipes';
import { ITEM_ICON, ITEM_LABEL, MATERIALS, type BuildType } from '../domain/types';
import { LANDMARKS } from '../world/terrainData';
import { mapPercent } from '../world/mapProjection';
import { POINTS_OF_INTEREST } from '../world/pointsOfInterest';

type HudActions = {
  interact: () => void;
  beginBuild: (type: BuildType) => void;
  cancelBuild: () => void;
  reset: () => void;
  virtualKey: (key: string, active: boolean) => void;
  gotoLandmark: (id: string) => void;
};

type Panel = 'map' | 'craft' | 'build' | 'help' | null;

const QUEST: Record<Milestone, { number: string; title: string; detail: string; emoji: string }> = {
  collect: { number: '01', title: 'Primeros materiales', detail: 'Buscá madera en el bosque y piedra en la cantera.', emoji: '🪵' },
  craft: { number: '02', title: 'Fabricá un martillo', detail: 'Abrí el taller con C o visitá el banco de trabajo.', emoji: '🔨' },
  build: { number: '03', title: 'Tu primer hogar', detail: 'Entrá al Claro del Hogar y colocá tres piezas.', emoji: '🏡' },
  sail: { number: '04', title: 'Más allá de la costa', detail: 'Encontrá el muelle al sur y navegá a la isla.', emoji: '⛵' },
  light: { number: '05', title: 'La luz de Auralia', detail: 'Recolectá dos cristales de chispa y fabricá la linterna.', emoji: '✨' },
  complete: { number: '✓', title: '¡Primera aventura terminada!', detail: 'El mundo sigue abierto: construí, fabricá y explorá.', emoji: '🌟' }
};

export class Hud {
  readonly canvas: HTMLCanvasElement;
  private panel: Panel = null;
  private mapSelection = 'brisalia';
  private mapView: 'regional' | 'illustrated' = 'regional';
  private local={x:1,z:10,region:'Valle de los Faroles',chunks:0};
  private toastTimeout = 0;
  private dialogueVisible = false;

  constructor(private readonly store: GameStore, private readonly actions: HudActions) {
    document.getElementById('app')!.innerHTML = `
      <canvas id="game-canvas" aria-label="Mundo 3D de Auralia"></canvas>
      <div class="hud-root">
        <header class="topbar">
          <div class="brand"><div class="brand-icon">✦</div><div><strong>AURALIA</strong><small>EL VALLE DE LOS FAROLES</small></div></div>
            <div class="region-label"><span class="status-dot"></span><span id="zone-name">Brisalia</span><span class="prototype-pill">POC · Update 4</span></div>
          <nav class="main-actions" aria-label="Menú de juego">
            <button data-panel="map" aria-label="Mapa (M)" title="Mapa (M)">🗺️ <span>Mapa</span></button>
            <button data-panel="craft" aria-label="Fabricación (C)" title="Fabricación (C)">⚒️ <span>Crafting</span></button>
            <button data-panel="build" aria-label="Construcción (B)" title="Construcción (B)">🏠 <span>Construir</span></button>
            <button data-panel="help" aria-label="Ayuda">❔</button>
          </nav>
        </header>
        <section class="quest-card" aria-live="polite">
          <div class="quest-eyebrow"><span>LA PRIMERA AVENTURA</span><span id="quest-number">01 / 05</span></div>
          <div class="quest-heading"><span id="quest-icon">🪵</span><div><strong id="quest-title">Primeros materiales</strong><p id="quest-detail"></p></div></div>
          <div id="quest-progress" class="quest-progress"></div>
        </section>
        <div class="compass"><div class="compass-n">N</div><span>✧</span><small id="biome-short">BRISALIA</small></div>
        <div class="terrain-status"><strong id="region-explore">Valle de los Faroles</strong><small><span id="position-explore">X 1 · Z 10</span><span> · </span><span id="chunks-explore">sectores…</span></small></div>
        <div class="interaction-pill" id="interaction-hint">WASD para caminar · E para interactuar · M para el mapa</div>
        <div class="footer-hud"><div class="inventory-label">MOCHILA <span>recursos</span></div><div id="inventory" class="inventory-items"></div><div class="key-help">W A S D <span>mover</span> · RATÓN <span>cámara</span> · SHIFT <span>correr</span></div></div>
        <div id="toast" class="toast" role="status"></div>
        <div id="dialogue" class="dialogue" hidden>
          <div class="dialogue-icon">✦</div><div><strong id="dialogue-name"></strong><p id="dialogue-text"></p></div>
          <button data-action="close-dialogue" aria-label="Cerrar diálogo">×</button>
        </div>
        <div class="touch-controls" aria-label="Controles táctiles">
          <div class="touch-cross"><button data-direction="w">▲</button><div><button data-direction="a">◀</button><button data-direction="s">▼</button><button data-direction="d">▶</button></div></div>
          <button class="touch-action" data-action="interact">INTERACTUAR</button>
        </div>
      </div>
      <div id="panel-backdrop" class="panel-backdrop" hidden>
        <section id="panel-window" class="panel-window" role="dialog" aria-modal="true" aria-labelledby="panel-title">
          <header class="panel-header"><div><span class="panel-kicker">CUADERNO DEL EXPLORADOR</span><h2 id="panel-title">Mapa de Auralia</h2></div><button data-action="close-panel" class="close-btn" aria-label="Cerrar">×</button></header>
          <div id="panel-content" class="panel-content"></div>
        </section>
      </div>
    `;
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    document.addEventListener('click', this.onClick);
    document.addEventListener('keydown', this.onKeyDown);
    document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button => {
      const key = button.dataset.direction!;
      const release = () => actions.virtualKey(key, false);
      button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); actions.virtualKey(key, true); });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
    store.subscribe(() => this.render());
  }

  get isModalOpen(): boolean { return this.panel !== null || this.dialogueVisible; }

  private readonly onClick = (event: MouseEvent) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-panel], [data-action], [data-recipe], [data-build], [data-marker], [data-map-view], [data-landmark]');
    if (!element) {
      if (event.target === document.getElementById('panel-backdrop')) this.close();
      return;
    }
    if (element.dataset.panel) { this.open(element.dataset.panel as Exclude<Panel, null>); return; }
    if (element.dataset.marker) { this.mapSelection = element.dataset.marker; this.renderPanel(); return; }
    if (element.dataset.mapView) {this.mapView=element.dataset.mapView as 'regional' | 'illustrated';this.renderPanel();return;}
    if (element.dataset.landmark) {this.close();this.actions.gotoLandmark(element.dataset.landmark);return;}
    if (element.dataset.recipe) {
      const result = this.store.craft(element.dataset.recipe);
      this.notify(result.message);
      return;
    }
    if (element.dataset.build) {
      const type = element.dataset.build as BuildType;
      this.close();
      this.actions.beginBuild(type);
      return;
    }
    const action = element.dataset.action;
    if (action === 'close-panel') this.close();
    if (action === 'close-dialogue') this.closeDialogue();
    if (action === 'interact') this.actions.interact();
    if (action === 'cancel-build') { this.actions.cancelBuild(); this.notify('Modo construcción cancelado.'); }
    if (action === 'reset' && window.confirm('¿Comenzar una partida nueva? Se perderá el progreso guardado en este navegador.')) {
      this.actions.reset(); this.close(); this.notify('Nueva partida creada.');
    }
    if (action === 'export') this.exportSave();
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') {
      if (this.dialogueVisible) this.closeDialogue();
      else if (this.panel) this.close();
      else this.actions.cancelBuild();
    }
    if (e.repeat || this.dialogueVisible) return;
    if (key === 'm') this.toggle('map');
    if (key === 'c') this.toggle('craft');
    if (key === 'b') this.toggle('build');
  };

  private toggle(panel: Exclude<Panel, null>): void { this.panel === panel ? this.close() : this.open(panel); }

  private render(): void {
    const state = this.store.state;
    const stage = this.store.milestone;
    const quest = QUEST[stage];
    this.text('zone-name', ZONES[state.zone].name);
    this.text('quest-number', `${quest.number} / 05`);
    this.text('quest-title', quest.title);
    this.text('quest-detail', quest.detail);
    this.text('quest-icon', quest.emoji);
    document.getElementById('quest-progress')!.innerHTML = this.getProgress(stage);
    document.getElementById('inventory')!.innerHTML = MATERIALS.map(item => `
      <div class="inventory-item" title="${ITEM_LABEL[item]}"><div class="inventory-icon">${ITEM_ICON[item]}</div><div><small>${ITEM_LABEL[item]}</small><strong>${state.inventory[item]}</strong></div></div>
    `).join('') + `${state.inventory.hammer > 0 ? `<div class="inventory-item special" title="Martillo">🔨 <strong>✓</strong></div>` : ''}` + `${state.inventory.lantern > 0 ? `<div class="inventory-item special" title="Linterna mágica">🏮 <strong>✓</strong></div>` : ''}`;
    if (this.panel === 'craft' || this.panel === 'build' || this.panel === 'map') this.renderPanel();
  }

  private getProgress(stage: Milestone): string {
    const { inventory: inv, structures } = this.store.state;
    if (stage === 'collect') return `<span>🪵 ${Math.min(inv.wood, 2)}/2</span><span>🪨 ${Math.min(inv.stone, 1)}/1</span>`;
    if (stage === 'build') return `<span>🏠 ${Math.min(structures.length, 3)}/3 piezas</span><span>Tecla B</span>`;
    if (stage === 'light') return `<span>✨ ${Math.min(inv.spark, 2)}/2</span><span>Tecla C</span>`;
    if (stage === 'complete') return `<span>🏮 Linterna conseguida</span><span>¡Seguí explorando!</span>`;
    return stage === 'craft' ? '<span>🔨 Abrir recetas</span><span>Tecla C</span>' : '<span>⛵ Buscá el muelle</span><span>Al sur</span>';
  }

  private text(id: string, value: string): void { document.getElementById(id)!.textContent = value; }

  open(which: Exclude<Panel, null>): void {
    this.closeDialogue();
    this.panel = which;
    document.getElementById('panel-backdrop')!.hidden = false;
    this.renderPanel();
  }

  close(): void {
    this.panel = null;
    document.getElementById('panel-backdrop')!.hidden = true;
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const panel = this.panel;
    this.text('panel-title', ({ map: 'Mapa de Auralia', craft: 'Taller de fabricación', build: 'Construí tu hogar', help: 'Guía del aventurero' } as const)[panel]);
    const target = document.getElementById('panel-content')!;
    if (panel === 'map') target.innerHTML = this.mapMarkup();
    else if (panel === 'craft') target.innerHTML = this.craftMarkup();
    else if (panel === 'build') target.innerHTML = this.buildMarkup();
    else target.innerHTML = this.helpMarkup();
  }

  private mapMarkup(): string {
    const tabs=`<div class="map-tabs"><button data-map-view="regional" class="${this.mapView==='regional'?'current':''}">🧭 Mapa del terreno jugable</button><button data-map-view="illustrated" class="${this.mapView==='illustrated'?'current':''}">🗺️ Atlas ilustrado de Auralia</button></div>`;
    if(this.mapView==='regional'){
      const pos=this.projectPosition();
      const discovered=new Set(this.store.state.discoveredPlaces??[]);
      const placeMarkers=POINTS_OF_INTEREST.filter(place=>discovered.has(place.id)).map(place=>{
        const p=mapPercent(place.x,place.z);
        return `<span class="poi-map-marker" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%" title="${place.name}" aria-label="Lugar descubierto: ${place.name}">◆</span>`;
      }).join('');
      return tabs+`<p class="panel-lead">Esta es la geografía real de la <strong>isla principal de aproximadamente 4 × 3 km</strong>. Sus seis biomas se pueden recorrer, pero <strong>las ciudades adicionales todavía no están construidas</strong>. Para facilitar las pruebas, elegí un mirador y teletransportate allí.</p>
      <div class="map-layout regional-layout">
        <div class="map-board regional-map-board">
          <img src="/assets/mapa-geografico-v0.2.svg" alt="Mapa geográfico de la isla principal con regiones, senderos e islas" />
          ${placeMarkers}
          <span id="map-player" class="player-map-marker" style="left:${pos.left.toFixed(2)}%;top:${pos.top.toFixed(2)}%" title="Tu ubicación">✦</span>
        </div>
        <div class="map-details">
          <span class="micro-title">EXPLORACIÓN CONTINENTAL</span>
          <h3>${this.local.region}</h3>
          <p>Posición <strong>X ${Math.round(this.local.x)} · Z ${Math.round(this.local.z)}</strong></p>
          <p>${this.local.chunks} sectores 3D activos cerca del personaje. Los demás se descargan para conservar recursos.</p>
          <div class="map-specialty"><small>VIAJE DE PRUEBA · NO MODIFICA LAS MISIONES</small><strong>Visitar un hito geográfico</strong></div>
          <div class="landmark-list">${LANDMARKS.map(land=>`<button data-landmark="${land.id}"><strong>${land.name}</strong><small>${land.description}</small></button>`).join('')}</div>
          <div class="map-specialty"><small>LUGARES DESCUBIERTOS · ${discovered.size}/${POINTS_OF_INTEREST.length}</small><strong>Accidentes y puntos de interés</strong></div>
          <div class="landmark-list">${POINTS_OF_INTEREST.map(place=>`<button data-landmark="${place.id}"><strong>${discovered.has(place.id)?'◆ ':''}${place.name}</strong><small>${discovered.has(place.id)?place.description:'Lugar por explorar · visitar para reconocerlo'}</small></button>`).join('')}</div>
          <p class="map-hint">Esta opción de viaje rápido es solo para desarrollo. Las rutas normales se pueden recorrer caminando.</p>
        </div>
      </div>`;
    }
    const selected=MAP_LOCATIONS.find(loc=>loc.id===this.mapSelection)??MAP_LOCATIONS[0];
    return tabs+`<div class="map-layout">
      <div class="map-board" aria-label="Mapa conceptual de Auralia">
        <img src="/assets/mapa-maestro-auralia.png" alt="Mapa maestro de Auralia con pueblos, regiones e islas" />
        ${MAP_LOCATIONS.map(loc=>`<button class="map-marker ${loc.status==='playable'?'active':loc.status==='explorable'?'explorable':'future'} ${selected.id===loc.id?'selected':''}" style="left:${loc.x}%;top:${loc.y}%" data-marker="${loc.id}" title="${loc.name}" aria-label="Ver ${loc.name}">${loc.status==='playable'?'✦':loc.status==='explorable'?'◈':'+'}</button>`).join('')}
      </div>
      <div class="map-details">
        <span class="micro-title">${selected.category==='island'?'ISLA SATÉLITE':'REGIÓN PRINCIPAL'}</span>
        <h3>${selected.name}</h3><p class="muted">${selected.subtitle}</p><p>${selected.description}</p>
        <div class="map-specialty"><small>PROGRESIÓN FUTURA</small><strong>${selected.specialty}</strong></div>
        <div class="map-status ${selected.status==='playable'?'available':''}">${selected.status==='playable'?'● Contenido inicial':selected.status==='explorable'?'◈ Terreno explorable · ciudad futura':'◌ Reservada para futuras expansiones'}</div>
        ${selected.id==='luciernagas'?'<p class="map-hint">Visitá el muelle al sur de Brisalia y presioná E para navegar.</p>':''}
        ${LANDMARKS.some(p=>p.id===selected.id)?`<div class="data-actions"><button data-landmark="${selected.id}">Viajar al mirador de prueba</button></div>`:''}
      </div>
    </div>`;
  }

  private projectPosition():{left:number;top:number}{
    const z=this.store.state.zone==='luciernagas'?this.local.z+420:this.local.z;
    const x=this.store.state.zone==='luciernagas'?this.local.x-210:this.local.x;
    return mapPercent(x,z);
  }

  onExplore(x:number,z:number,region:string,chunks:number):void {
    this.local={x,z,region,chunks};
    this.text('zone-name',region);
    this.text('region-explore',region);
    this.text('position-explore',`X ${Math.round(x)} · Z ${Math.round(z)}`);
    this.text('chunks-explore',`${chunks} sectores`);
    this.text('biome-short',this.store.state.zone==='luciernagas'?'ISLA':'AURALIA');
    const p=this.projectPosition();
    const marker=document.getElementById('map-player');
    if(marker){marker.style.left=`${p.left}%`;marker.style.top=`${p.top}%`;}
  }

  private craftMarkup(): string {
    const inv = this.store.state.inventory;
    return `<p class="panel-lead">Recogé materiales en el mundo y transformalos en herramientas y objetos mágicos. Las recetas viven como datos, para agregar cientos sin tocar el render.</p>
      <div class="catalog-grid">${RECIPES.map(r => {
        const enough = hasCost(inv, r.requires), owned = inv[r.output] > 0;
        return `<article class="catalog-card"><div class="catalog-icon">${ITEM_ICON[r.output]}</div><h3>${r.title}</h3><p>${r.description}</p><div class="catalog-cost">${costAsText(r.requires)}</div><button data-recipe="${r.id}" ${!enough || owned ? 'disabled' : ''}>${owned ? '✓ Fabricado' : enough ? 'Fabricar' : 'Faltan materiales'}</button></article>`;
      }).join('')}</div>`;
  }

  private buildMarkup(): string {
    const inv = this.store.state.inventory;
    return `<p class="panel-lead">Colocá piezas en el <strong>Claro del Hogar</strong> (sector delimitado al oeste del pueblo). Primero fabricá un martillo. <strong>R</strong> gira las piezas, <strong>clic</strong> coloca y <strong>Esc</strong> cancela.</p>
      <div class="catalog-grid">${BUILD_CATALOG.map(r => {
        const enough = hasCost(inv, r.requires), hammer = inv.hammer > 0;
        const icon = ({ floor:'▦',wall:'▥','stone-wall':'▥','metal-wall':'▥',roof:'⌂',post:'✧' } as const)[r.type];
        return `<article class="catalog-card"><div class="catalog-icon">${icon}</div><h3>${r.title}</h3><p>${r.description}</p><div class="catalog-cost">${costAsText(r.requires)}</div><button data-build="${r.type}" ${!hammer || !enough || this.store.state.zone !== 'brisalia' ? 'disabled' : ''}>${!hammer ? 'Necesitás un martillo' : !enough ? 'Faltan materiales' : this.store.state.zone !== 'brisalia' ? 'Volvé a Brisalia' : 'Colocar pieza'}</button></article>`;
      }).join('')}</div>`;
  }

  private helpMarkup(): string {
    return `<p class="panel-lead">Auralia: isla principal de aproximadamente 4 × 3 km, terreno generado por sectores, seis biomas explorables y posiciones persistentes. El mapa (M) permite teletransportarse a los miradores solamente para probar el desarrollo.</p><div class="help-grid">
      <article><h3>🧭 Exploración</h3><p><strong>WASD</strong> o flechas para moverte; arrastrá el ratón para girar la cámara; rueda para acercar y alejar; <strong>Shift</strong> para correr.</p></article>
      <article><h3>🪵 Recolección</h3><p>Acercate a árboles con marcador, rocas y cristales, y presioná <strong>E</strong>. Los recursos reaparecen después de unos segundos.</p></article>
      <article><h3>⚒️ Fabricación</h3><p>Presioná <strong>C</strong>, elegí una receta y usá los materiales que reuniste. Fabricá primero el martillo.</p></article>
      <article><h3>🏡 Construcción</h3><p>Presioná <strong>B</strong>, elegí una pieza y caminá al Claro del Hogar. Click para colocar; R para girar y Esc para cancelar.</p></article>
      <article><h3>⛵ Viaje</h3><p>Buscá el muelle al sur. El bote permite visitar la Isla de las Luciérnagas y volver al valle.</p></article>
      <article><h3>💾 Guardado</h3><p>Inventario, viaje y construcciones se guardan automáticamente en este navegador. Exportá un respaldo para conservarlo.</p></article>
    </div><div class="data-actions"><button data-action="export">⬇ Exportar partida JSON</button><button data-action="reset" class="danger">Reiniciar POC</button></div>`;
  }

  hint(message: string): void { this.text('interaction-hint', message); }
  notify(message: string): void {
    const toast = document.getElementById('toast')!;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 3600);
  }

  dialogue(name: string, text: string): void {
    this.text('dialogue-name', name);
    this.text('dialogue-text', text);
    document.getElementById('dialogue')!.hidden = false;
    this.dialogueVisible = true;
  }

  closeDialogue(): void { document.getElementById('dialogue')!.hidden = true; this.dialogueVisible = false; }

  onTravel(zone: ZoneId): void {
    this.close();
    this.notify(zone === 'brisalia' ? '¡De vuelta en el Valle de los Faroles!' : '¡Llegaste a la Isla de las Luciérnagas!');
  }

  private exportSave(): void {
    const json = JSON.stringify(this.store.state, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'auralia-partida-v1.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.notify('Respaldo JSON exportado.');
  }
}
