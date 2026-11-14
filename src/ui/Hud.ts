import { MAP_LOCATIONS, ZONES, type ZoneId } from '../data/world';
import { REGIONS, regionAt } from '../world/RegionCatalog';
import { BRIDGE_DEFINITIONS, TUNNEL_LINKS, TUNNEL_NODES } from '../world/mountainRoutes';
import { GameStore, type Milestone } from '../domain/GameStore';
import { nextBrisaliaSwordObjective } from '../domain/brisaliaSword';
import { BUILD_CATALOG, RECIPES, costAsText, hasCost } from '../domain/recipes';
import { EQUIPMENT_IDS, ITEM_ICON, ITEM_LABEL, MATERIALS,
  type BuildType, type EquipmentId, type Structure } from '../domain/types';
import { islandOutline, LANDMARKS } from '../world/terrainData';
import { MAIN_RIVER, LAKE_RESERVATIONS, STREAMS } from '../world/geographicFeatures';
import { LANDSCAPE_LANDFORMS } from '../world/landscapeRelief';
import { FOLIAGE_FOREST } from '../world/foliageForestConfig';
import { mapPercent } from '../world/mapProjection';
import { activeGeography } from '../world/geography/ActiveGeography';
import { POINTS_OF_INTEREST } from '../world/pointsOfInterest';
import { SEASON_LABELS, WEATHER_ICONS, WEATHER_LABELS, type ClimateFrame } from '../world/climate/ClimateModel';
import { readRenderQuality, RENDER_QUALITIES, type RenderQuality } from '../game/renderResolution';

type HudActions = {
  interact: () => void;
  beginBuild: (type: BuildType) => void;
  cancelBuild: () => void;
  removeSelected:()=>void;
  replaceSelected:(type:BuildType)=>void;
  undoLastBuild:()=>void;
  reset: () => void;
  virtualKey: (key: string, active: boolean) => void;
  gotoLandmark: (id: string) => void;
  canOpenPanel: () => boolean;
  setRenderQuality: (quality:RenderQuality) => void;
};

type Panel = 'map' | 'craft' | 'build' | 'equip' | 'graphics' | 'help' | null;

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

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
  private renderQuality=readRenderQuality();
  private readonly compass: HTMLElement;
  private readonly compassRotor: HTMLElement;
  private readonly compassHeading: HTMLElement;
  private compassDegrees = NaN;

  constructor(private readonly store: GameStore, private readonly actions: HudActions) {
    document.getElementById('app')!.innerHTML = `
      <canvas id="game-canvas" aria-label="Mundo 3D de Auralia"></canvas>
      <div class="hud-root">
        <header class="topbar">
          <div class="brand"><div class="brand-icon">✦</div><div><strong>AURALIA</strong><small>EL VALLE DE LOS FAROLES</small></div></div>
            <div class="region-label"><span class="status-dot"></span><span id="zone-name">Brisalia</span><span class="prototype-pill">POC · Update 4</span></div>
          <nav class="main-actions" aria-label="Menú de juego">
            <button data-panel="equip" aria-label="Equipo (V)" title="Equipo (V)">🗡️ <span>Equipo</span></button>
            <button data-panel="map" aria-label="Mapa (M)" title="Mapa (M)">🗺️ <span>Mapa</span></button>
            <button data-panel="craft" aria-label="Fabricación (C)" title="Fabricación (C)">⚒️ <span>Crafting</span></button>
            <button data-panel="build" aria-label="Construcción (B)" title="Construcción (B)">🏠 <span>Construir</span></button>
            <button data-panel="graphics" aria-label="Gráficos" title="Gráficos">⚙ <span>Gráficos</span></button>
            <button data-panel="help" aria-label="Ayuda">❔</button>
          </nav>
        </header>
        <section class="quest-card" aria-live="polite">
          <div class="quest-eyebrow"><span>LA PRIMERA AVENTURA</span><span id="quest-number">01 / 05</span></div>
          <div class="quest-heading"><span id="quest-icon">🪵</span><div><strong id="quest-title">Primeros materiales</strong><p id="quest-detail"></p></div></div>
          <div id="quest-progress" class="quest-progress"></div>
        </section>
        <div class="compass" id="compass" role="img" aria-label="Brújula" title="Orientación de la cámara">
          <div class="compass-dial" aria-hidden="true">
            <div class="compass-forward">▾</div>
            <div class="compass-rotor" id="compass-rotor">
              <span class="compass-cardinal compass-n">N</span><span class="compass-cardinal compass-e">E</span>
              <span class="compass-cardinal compass-s">S</span><span class="compass-cardinal compass-o">O</span>
              <svg viewBox="0 0 64 64" class="compass-needle"><path d="M32 17 38 35 32 31 26 35Z" fill="#f3cd77"/><path d="M32 47 26 29 32 33 38 29Z" fill="#b6cecc"/></svg>
            </div>
          </div>
          <div class="compass-heading" id="compass-heading" aria-hidden="true">—</div>
          <small id="biome-short" aria-hidden="true">BRISALIA</small>
        </div>
        <div class="climate-status" id="climate-status">🌤️ 09:00 · Primavera</div>
        <div class="terrain-status"><strong id="region-explore">Valle de los Faroles</strong><small><span id="position-explore">X 1 · Z 10</span><span> · </span><span id="chunks-explore">sectores…</span></small></div>
        <div class="interaction-pill" id="interaction-hint">WASD para caminar · E para interactuar · M para el mapa</div>
        <aside id="build-selection" class="build-selection" hidden></aside>
        <div class="footer-hud"><div class="inventory-label">MOCHILA <span>recursos</span></div><div id="inventory" class="inventory-items"></div><button data-panel="equip" id="equipment-status" class="equipment-status" title="Cambiar equipo (V)">✊ Mano limpia</button><div class="key-help">W A S D <span>mover</span> · RATÓN <span>cámara</span> · SHIFT <span>correr</span> · DOBLE SHIFT <span>sprint</span></div></div>
        <div id="toast" class="toast" role="status"></div>
        <div id="dialogue" class="dialogue" hidden>
          <div class="dialogue-icon">✦</div><div><strong id="dialogue-name"></strong><p id="dialogue-text"></p></div>
          <button data-action="close-dialogue" aria-label="Cerrar diálogo">×</button>
        </div>
        <div class="touch-controls" aria-label="Controles táctiles">
          <div class="touch-cross"><button data-direction="w">▲</button><div><button data-direction="a">◀</button><button data-direction="s">▼</button><button data-direction="d">▶</button></div></div>
          <button class="touch-action" data-action="interact">INTERACTUAR</button>
          <button class="touch-action" data-direction="space">SALTAR</button>
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
    this.compass = document.getElementById('compass')!;
    this.compassRotor = document.getElementById('compass-rotor')!;
    this.compassHeading = document.getElementById('compass-heading')!;
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

  /** Clockwise camera heading from map north (-Z), in radians. */
  setCameraHeading(radians: number): void {
    if (!Number.isFinite(radians)) return;
    const degrees = Math.round(radians * 180 / Math.PI * 10) / 10;
    if (degrees === this.compassDegrees) return;
    this.compassDegrees = degrees;
    // Keep rotation continuous across north; only the displayed bearing wraps.
    this.compassRotor.style.setProperty('--compass-rotation', `${-degrees}deg`);
    const bearing = ((Math.round(degrees) % 360) + 360) % 360;
    const direction = COMPASS_DIRECTIONS[Math.round(bearing / 45) % 8];
    const label = `${direction} · ${bearing}°`;
    if (this.compassHeading.textContent !== label) {
      this.compassHeading.textContent = label;
      this.compass.setAttribute('aria-label', `Brújula: cámara hacia ${direction}, ${bearing} grados`);
    }
  }

  setClimate(frame:ClimateFrame):void {
    const el=document.getElementById('climate-status');
    if(!el)return;
    const hh=String(Math.floor(frame.hour)).padStart(2,'0');
    const mm=String(Math.floor((frame.hour%1)*60)).padStart(2,'0');
    el.textContent=`${WEATHER_ICONS[frame.weather]} ${hh}:${mm} · ${SEASON_LABELS[frame.season]}`;
    el.title=WEATHER_LABELS[frame.weather];
  }

  private readonly onClick = (event: MouseEvent) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-panel], [data-action], [data-recipe], [data-equip], [data-build], [data-replace], [data-marker], [data-map-view], [data-landmark], [data-render-quality]');
    if (!element) {
      if (event.target === document.getElementById('panel-backdrop')) this.close();
      return;
    }
    if (element.dataset.panel) { this.open(element.dataset.panel as Exclude<Panel, null>); return; }
    if(element.dataset.renderQuality){
      const profile=RENDER_QUALITIES.find(p=>p.id===element.dataset.renderQuality);
      if(profile){
        this.actions.setRenderQuality(profile.id);this.renderQuality=profile.id;this.renderPanel();
      }
      return;
    }
    if (element.dataset.marker) { this.mapSelection = element.dataset.marker; this.renderPanel(); return; }
    if (element.dataset.mapView) {this.mapView=element.dataset.mapView as 'regional' | 'illustrated';this.renderPanel();return;}
    if (element.dataset.landmark) {this.close();this.actions.gotoLandmark(element.dataset.landmark);return;}
    if (element.dataset.recipe) {
      const result = this.store.craft(element.dataset.recipe);
      this.notify(result.message);
      return;
    }
    if(element.dataset.equip){
      const item=EQUIPMENT_IDS.find(id=>id===element.dataset.equip);
      if(item)this.notify(this.store.equip(item).message);
      return;
    }
    if (element.dataset.build) {
      const type = element.dataset.build as BuildType;
      this.close();
      this.actions.beginBuild(type);
      return;
    }
    if(element.dataset.replace){this.actions.replaceSelected(element.dataset.replace as BuildType);return;}
    const action = element.dataset.action;
    if (action === 'close-panel') this.close();
    if (action === 'close-dialogue') this.closeDialogue();
    if (action === 'interact') this.actions.interact();
    if (action === 'cancel-build') { this.actions.cancelBuild(); this.notify('Modo construcción cancelado.'); }
    if (action === 'remove-piece') this.actions.removeSelected();
    if (action === 'undo-build') this.actions.undoLastBuild();
    if (action === 'reset' && window.confirm('¿Comenzar una partida nueva? Se perderá el progreso guardado en este navegador.')) {
      this.actions.reset(); this.close(); this.notify('Nueva partida creada.');
    }
    if (action === 'export') this.exportSave();
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement) return;
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
    if (key === 'v') this.toggle('equip');
    const quick=({'1':'unarmed','2':'sword','3':'pickaxe',
      '4':'hammer','5':'lantern'} as const)[key as '1'|'2'|'3'|'4'|'5'];
    if(quick)this.notify(this.store.equip(quick).message);
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
    `).join('') + `${state.inventory.hammer > 0 ? `<div class="inventory-item special" title="Martillo">🔨 <strong>✓</strong></div>` : ''}` + `${state.inventory.lantern > 0 ? `<div class="inventory-item special" title="Linterna mágica">🏮 <strong>✓</strong></div>` : ''}` + `${state.inventory.sword > 0 ? `<div class="inventory-item special" title="Espada del Bosque Encantado · nivel ${this.store.swordLevel}">🗡️ <strong>${this.store.swordLevel}</strong></div>` : ''}`;
    const equipped=state.equippedItem??'unarmed';
    document.getElementById('equipment-status')!.textContent=equipped==='unarmed'
      ?'✊ Mano limpia':`${ITEM_ICON[equipped]} ${ITEM_LABEL[equipped]}${equipped==='sword'?` · N${this.store.swordLevel}`:''}`;
    if (this.panel === 'craft' || this.panel === 'build' ||
      this.panel === 'map' || this.panel === 'equip') this.renderPanel();
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
    if(!this.actions.canOpenPanel())return;
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
    this.text('panel-title', ({ map: 'Mapa de Auralia', craft: 'Taller de fabricación', build: 'Construí tu hogar', equip:'Equipo de Santi', graphics:'Gráficos', help: 'Guía del aventurero' } as const)[panel]);
    const target = document.getElementById('panel-content')!;
    if (panel === 'map') target.innerHTML = this.mapMarkup();
    else if (panel === 'craft') target.innerHTML = this.craftMarkup();
    else if (panel === 'build') target.innerHTML = this.buildMarkup();
    else if (panel === 'equip') target.innerHTML = this.equipmentMarkup();
    else if (panel === 'graphics') target.innerHTML = this.graphicsMarkup();
    else target.innerHTML = this.helpMarkup();
  }

  private graphicsMarkup():string{
    return `<p class="panel-lead">Elegí la resolución del mundo 3D. Equilibrada es la opción recomendada para jugar con buen detalle y menor consumo. Los textos y menús conservan su nitidez.</p>
      <div class="catalog-grid">${RENDER_QUALITIES.map(profile=>`<article class="catalog-card">
        <h3>${profile.label}</h3><p>${profile.detail}</p>
        <button data-render-quality="${profile.id}" ${this.renderQuality===profile.id?'disabled':''}>${this.renderQuality===profile.id?'En uso':'Elegir'}</button>
      </article>`).join('')}</div>
      <p class="map-hint">Se aplica al instante y se guarda en este navegador. La imagen se ajusta a la proporción de tu ventana.</p>`;
  }

  private mapMarkup(): string {
    const geography=activeGeography();
    if(geography){const p=this.projectPosition();return `<p class="panel-lead">Nuevo continente · Brisalia y sus sistemas trasladados. Elegí un destino para explorar.</p>
      <div class="map-layout regional-layout"><div class="map-board regional-map-board">${geography.mapMarkup()}
      <span id="map-player" class="player-map-marker" style="left:${p.left}%;top:${p.top}%">✦</span></div>
      <div class="map-details"><h3>${this.local.region}</h3><p>X ${Math.round(this.local.x)} · Z ${Math.round(this.local.z)}</p>
      <div class="landmark-list">${geography.destinations.map(d=>`<button data-landmark="${d.id}"><strong>${d.name}</strong></button>`).join('')}</div>
      <p>Los traslados de esta rama de pruebas conservan las misiones. Esta partida es independiente del mundo actual.</p></div></div>`;}
    const tabs=`<div class="map-tabs"><button data-map-view="regional" class="${this.mapView==='regional'?'current':''}">🧭 Mapa del terreno jugable</button><button data-map-view="illustrated" class="${this.mapView==='illustrated'?'current':''}">🗺️ Atlas ilustrado de Auralia</button></div>`;
    if(this.mapView==='regional'){
      const pos=this.projectPosition();
      const region=regionAt(this.local.x,this.local.z);
      const mapPoint=(x:number,z:number)=>{const p=mapPercent(x,z);return `${p.left},${p.top*.8}`;};
      const coast=islandOutline(220).map(p=>mapPoint(p.x,p.z)).join(' ');
      const palette=['#8da467','#839469','#386a58','#7f8174','#7c544a','#a7b4b5',
        '#bd965d','#685a79','#538e8c','#397560','#a5a565','#6d929c'];
      const territories=`<svg viewBox="0 0 100 80" style="display:block;width:100%;height:auto" role="img" aria-label="Territorios y conexiones de las Doce Coronas">
        <defs><clipPath id="region-coast"><polygon points="${coast}"/></clipPath></defs>
        <rect width="100" height="80" fill="#184455"/>
        <polygon points="${coast}" fill="#829077" stroke="#e2ca8e" stroke-width=".55"/>
        <g clip-path="url(#region-coast)">
        ${REGIONS.map((r,i)=>`<polygon points="${r.polygon.map(p=>mapPoint(...p)).join(' ')}" fill="${palette[i]}" stroke="#f8e3ac" stroke-opacity=".5" stroke-width=".15"/>`).join('')}
        ${LANDSCAPE_LANDFORMS.map(f=>{const p=mapPercent(f.x,f.z),edge=mapPercent(f.x+f.rx,f.z+f.rz);
          return [1,.7,.4].map(scale=>`<ellipse cx="${p.left}" cy="${p.top*.8}" rx="${(edge.left-p.left)*scale}" ry="${(edge.top-p.top)*.8*scale}" fill="none" stroke="#ebe5cf" stroke-opacity=".22" stroke-width=".18"/>`).join('');}).join('')}
        <polyline points="${MAIN_RIVER.map(p=>mapPoint(p.x,p.z)).join(' ')}" fill="none" stroke="#8fdae0" stroke-width=".6"/>
        ${STREAMS.map(s=>`<polyline points="${s.points.map(p=>mapPoint(p.x,p.z)).join(' ')}" fill="none" stroke="#8fdae0" stroke-width=".25"/>`).join('')}
        ${LAKE_RESERVATIONS.map(l=>{const p=mapPercent(l.x,l.z),edge=mapPercent(l.x+l.radiusX,l.z+l.radiusZ);
          return `<ellipse cx="${p.left}" cy="${p.top*.8}" rx="${edge.left-p.left}" ry="${(edge.top-p.top)*.8}" fill="#4c9da9" stroke="#a8e5df" stroke-width=".2"/>`;}).join('')}
        ${TUNNEL_LINKS.map(([a,b])=>`<polyline points="${mapPoint(TUNNEL_NODES[a].x,TUNNEL_NODES[a].z)} ${mapPoint(TUNNEL_NODES[b].x,TUNNEL_NODES[b].z)}" fill="none" stroke="#f4b54f" stroke-width=".35" stroke-dasharray=".6 .4"/>`).join('')}
        ${BRIDGE_DEFINITIONS.map(b=>`<polyline points="${mapPoint(b.a.x,b.a.z)} ${mapPoint(b.b.x,b.b.z)}" stroke="#fff5d4" stroke-width=".6"/>`).join('')}
        </g>
        ${REGIONS.map(r=>`<text x="${mapPercent(...r.center).left}" y="${mapPercent(...r.center).top*.8-1.6}" text-anchor="middle" fill="#fff3cd" stroke="#233c40" stroke-width=".14" paint-order="stroke" font-size="1.45" font-family="Georgia,serif">${r.realm}<title>${r.name}</title></text>`).join('')}
        <text x="4" y="6" font-family="Georgia,serif" font-size="3" fill="#f5dfaa">AURALIA</text>
        <text x="4" y="8.4" font-size="1.25" fill="#cbe1da">Territorios y conexiones · en desarrollo</text>
        <text x="94" y="6" text-anchor="middle" font-size="2" fill="#f5dfaa">N</text>
        <path d="M94 7L93.2 10L94 9.5L94.8 10Z" fill="#f5dfaa"/>
      </svg>`;
      const discovered=new Set(this.store.state.discoveredPlaces??[]);
      const placeMarkers=POINTS_OF_INTEREST.filter(place=>
        place.id!==FOLIAGE_FOREST.id&&
        place.id!==FOLIAGE_FOREST.flowerMeadow.id&&discovered.has(place.id)).map(place=>{
        const p=mapPercent(place.x,place.z);
        return `<span class="poi-map-marker" style="left:${p.left.toFixed(2)}%;top:${p.top.toFixed(2)}%" title="${place.name}" aria-label="Lugar descubierto: ${place.name}">◆</span>`;
      }).join('');
      const forest=mapPercent(FOLIAGE_FOREST.x,FOLIAGE_FOREST.z);
      const forestMarker=`<button class="poi-map-marker forest-map-marker" data-landmark="${FOLIAGE_FOREST.id}" style="left:${forest.left.toFixed(2)}%;top:${forest.top.toFixed(2)}%" title="Viajar al ${FOLIAGE_FOREST.name}" aria-label="Viajar al ${FOLIAGE_FOREST.name}">♣</button>`;
      return tabs+`<p class="panel-lead">Las <strong>Doce Coronas</strong> comparten cordilleras, valles y cuencas. El mapa muestra sus territorios en desarrollo. La línea dorada discontinua recorre las Galerías de Ferragrís; los trazos claros señalan sus puentes de montaña.</p>
      <div class="map-layout regional-layout">
        <div class="map-board regional-map-board">
          ${territories}
          ${placeMarkers}
          ${forestMarker}
          <span id="map-player" class="player-map-marker" style="left:${pos.left.toFixed(2)}%;top:${pos.top.toFixed(2)}%" title="Tu ubicación">✦</span>
        </div>
        <div class="map-details">
          <span class="micro-title">EXPLORACIÓN CONTINENTAL</span>
          <h3>${this.local.region}</h3>
          <p><strong>${region.realm}</strong> · ${region.id}</p>
          <p>${region.landforms.join(' · ')}</p>
          <p>Posición <strong>X ${Math.round(this.local.x)} · Z ${Math.round(this.local.z)}</strong></p>
          <p>${this.local.chunks} sectores 3D activos cerca del personaje. Los demás se descargan para conservar recursos.</p>
          <div class="map-specialty"><small>VIAJE DE PRUEBA · NO MODIFICA LAS MISIONES</small><strong>Visitar un hito geográfico</strong></div>
          <div class="landmark-list">${LANDMARKS.map(land=>`<button data-landmark="${land.id}"><strong>${land.name}</strong><small>${land.description}</small></button>`).join('')}</div>
          <div class="map-specialty"><small>LUGARES DESCUBIERTOS · ${discovered.size}/${POINTS_OF_INTEREST.length}</small><strong>Accidentes y puntos de interés</strong></div>
          <div class="landmark-list">${POINTS_OF_INTEREST.map(place=>`<button data-landmark="${place.id}"><strong>${place.id===FOLIAGE_FOREST.id?'♣ ':place.id===FOLIAGE_FOREST.flowerMeadow.id?'✿ ':discovered.has(place.id)?'◆ ':''}${place.name}</strong><small>${discovered.has(place.id)||place.id===FOLIAGE_FOREST.id||place.id===FOLIAGE_FOREST.flowerMeadow.id?place.description:'Lugar por explorar · visitar para reconocerlo'}</small></button>`).join('')}</div>
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
    const geography=activeGeography();if(geography){const island=this.store.state.zone==='luciernagas'?geography.firefly:{x:0,z:0};
      return {left:(this.local.x+island.x+7000)/140,top:(this.local.z+island.z+7000)/140};}
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

  private equipmentMarkup():string{
    const inventory=this.store.state.inventory;
    const equipped=this.store.state.equippedItem??'unarmed';
    const swordLevel=this.store.swordLevel;
    const groups:{title:string;items:{id:EquipmentId;description:string;key:string}[]}[]=[
      {title:'A mano limpia',items:[
        {id:'unarmed',description:'Q alterna patadas. F ejecuta la barrida.',key:'1'}]},
      {title:'Armas',items:[
        {id:'sword',description:swordLevel>0?
          `Nivel ${swordLevel}/4 · ${nextBrisaliaSwordObjective(this.store.state)} Q alterna los ataques.`:
          nextBrisaliaSwordObjective(this.store.state),key:'2'}]},
      {title:'Herramientas',items:[
        {id:'pickaxe',description:'Pico de explorador. Sin ataque de Q asignado.',key:'3'},
        {id:'hammer',description:'Martillo de construcción. Sin ataque de Q asignado.',key:'4'},
        {id:'lantern',description:'Linterna mágica. Sin ataque de Q asignado.',key:'5'}]}
    ];
    return `<p class="panel-lead">Elegí qué lleva Santi. La espada del bosque evoluciona del nivel 1 al 4 al cumplir sus objetivos de exploración. Seleccionarla habilita sus ataques. También podés cambiar con las teclas 1–5. La barrida permanece en F.</p>
      ${groups.map(group=>`<h3 class="equipment-group-title">${group.title}</h3>
        <div class="equipment-grid">${group.items.map(item=>{
          const owned=item.id==='unarmed'||inventory[item.id]>0;
          const selected=equipped===item.id;
          const icon=item.id==='unarmed'?'✊':ITEM_ICON[item.id];
          const label=item.id==='unarmed'?'Mano limpia':ITEM_LABEL[item.id];
          return `<article class="equipment-card${selected?' selected':''}">
            <div class="equipment-icon">${icon}</div><div><h4>${label} <small>${item.key}</small></h4>
            <p>${item.description}</p></div>
            <button data-equip="${item.id}" aria-pressed="${selected}" ${!owned||selected?'disabled':''}>
              ${selected?'Seleccionado':owned?'Elegir':'No disponible'}</button></article>`;
        }).join('')}</div>`).join('')}`;
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
    const groups=['Cimientos y pisos','Paredes y aberturas','Techos','Decoración'] as const;
    return `<p class="panel-lead">En el <strong>Claro del Hogar</strong>, elegí una pieza y buscá un encastre. <strong>R</strong> gira, <strong>clic</strong> coloca y <strong>Esc</strong> cancela. Hacé clic en una pieza construida para retirarla o cambiar una pared. Recuperás todos los materiales al desmontar.</p>
      <div class="data-actions"><button data-action="undo-build">Deshacer última colocación (Z)</button></div>
      ${groups.map(group=>`<h3 class="build-group-title">${group}</h3><div class="catalog-grid">${BUILD_CATALOG.filter(r=>r.group===group).map(r => {
        const enough = hasCost(inv, r.requires), hammer = inv.hammer > 0;
        const icon=({'foundation':'▤',floor:'▦',wall:'▥','stone-wall':'▥',
          'metal-wall':'▥','door-wall':'▯','window-wall':'▣',roof:'⌂',
          'roof-section':'⌂',post:'✧'} as const)[r.type];
        const available=Object.entries(r.requires).map(([item,count])=>
          `${ITEM_LABEL[item as keyof typeof ITEM_LABEL]} ${inv[item as keyof typeof inv]}/${count}`).join(' · ');
        return `<article class="catalog-card"><div class="catalog-icon">${icon}</div><h3>${r.title}</h3><p>${r.description}</p><div class="catalog-cost">${costAsText(r.requires)}</div><small class="build-available">Tenés: ${available}</small><button data-build="${r.type}" ${!hammer || !enough || this.store.state.zone !== 'brisalia' ? 'disabled' : ''}>${!hammer ? 'Necesitás un martillo' : !enough ? 'Faltan materiales' : this.store.state.zone !== 'brisalia' ? 'Volvé a Brisalia' : 'Colocar pieza'}</button></article>`;
      }).join('')}</div>`).join('')}`;
  }

  setSelectedStructure(structure:Structure|null):void{
    const panel=document.getElementById('build-selection')!;
    panel.hidden=!structure;
    if(!structure){panel.innerHTML='';return;}
    const definition=BUILD_CATALOG.find(item=>item.type===structure.type);
    const replacements=['wall','stone-wall','metal-wall','door-wall','window-wall']
      .filter(type=>type!==structure.type&&!structure.legacy);
    panel.innerHTML=`<strong>${definition?.title??structure.type}${structure.legacy?' · pieza antigua':''}</strong>
      <small>Costo original: ${definition?costAsText(definition.requires):'sin receta'} · reintegro completo</small>
      <div class="build-selection-actions"><button data-action="remove-piece">Retirar pieza</button>
      ${replacements.map(type=>`<button data-replace="${type}">Cambiar por ${BUILD_CATALOG.find(item=>item.type===type)?.title}</button>`).join('')}</div>`;
  }

  private helpMarkup(): string {
    return `<p class="panel-lead">Las Doce Coronas están en desarrollo sobre el continente actual. El tamaño definitivo del mundo sigue abierto. El mapa (M) permite visitar hitos para probar los recorridos. En las entradas de Ferragrís, presioná E para explorar las galerías o salir por otro acceso.</p><div class="help-grid">
      <article><h3>🧭 Exploración</h3><p><strong>WASD</strong> o flechas para moverte; arrastrá el ratón para girar la cámara; rueda para acercar y alejar; <strong>Shift</strong> para correr, dos pulsaciones rápidas de <strong>Shift</strong> y mantener la segunda para sprint, y <strong>Espacio</strong> para saltar o volver a saltar en el aire. Frente a una roca trepable, mantené <strong>W</strong> para subir, <strong>S</strong> para bajar, <strong>A/D</strong> para desplazarte y <strong>Espacio</strong> para soltarte.</p></article>
      <article><h3>⚔️ Acciones de Santi</h3><p>Abrí <strong>Equipo (V)</strong> o usá <strong>1–5</strong> para elegir mano limpia, espada o herramienta. <strong>Q</strong> alterna las patadas a mano limpia o los ataques de espada si está seleccionada. <strong>F</strong> ejecuta la barrida y <strong>R</strong> el roll. Las patadas no trasladan al personaje; el roll conserva la dirección con la que empezó. Patadas, barrida y rolls deben terminar antes de repetirse. Tras una caída muy alta, Santi hace automáticamente el roll de aterrizaje.</p></article>
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
