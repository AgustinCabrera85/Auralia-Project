import {
  ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight,
  Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3,
  VertexBuffer, VertexData, PointLight
} from '@babylonjs/core';
import type { ZoneId } from '../data/world';
import type { BuildType, MaterialId, Structure } from '../domain/types';
import { GameStore } from '../domain/GameStore';
import { TerrainStream } from '../world/TerrainStream';
import { GeographyStream } from '../world/GeographyStream';
import { VegetationSystem } from '../world/VegetationSystem';
import { WorldPropSystem } from '../world/WorldPropSystem';
import { propsForChunk } from '../world/worldPropsData';
import { GEOLOGY_FORMATIONS, geologyLocal, geologyPoint, sameGeologyFormation } from '../world/geologyData';
import { selectRockPart } from '../world/rockPackData';
import type { VegetationExclusion } from '../world/vegetationData';
import { bridgeDeckAt, isInlandWater } from '../world/geographicFeatures';
import { POINTS_OF_INTEREST, pointOfInterest } from '../world/pointsOfInterest';
import { createPointOfInterestView } from '../world/PointOfInterestView';
import { BIOME_NAMES, biomeAt, chunkOf, LANDMARKS, MAINLAND, ROAD_RESERVATIONS, isLand, sampleMainlandHeight } from '../world/terrainData';
import { cameraRelativeMovement } from './movement';
import { CharacterTraversalController, type TraversalWorld } from './CharacterTraversalController';
import { TRAVERSAL } from './traversalRules';

export type Interactable = {
  id: string;
  label: string;
  verb: string;
  type: 'resource' | 'dock' | 'npc' | 'workbench' | 'lore';
  localPosition: Vector3;
  visual: TransformNode;
  resource?: MaterialId;
  resourceNodeId?: string;
  amount?: number;
  destination?: ZoneId;
  dialogue?: string;
  enabled: boolean;
};

type IslandInfo = {
  id: ZoneId;
  root: TransformNode;
  terrain: Mesh | null;
  offset: Vector3;
  radiusX: number;
  radiusZ: number;
  spawn: { x: number; z: number };
  nodes: Interactable[];
};

type BuildPreview = { localX: number; localZ: number; type: BuildType; rotation: number; valid: boolean; message: string };

type WorldCallbacks = {
  notify: (message: string) => void;
  dialogue: (name: string, text: string) => void;
  openCraft: () => void;
  hint: (message: string) => void;
  onTravel: (destination: ZoneId) => void;
  onBuild: (structure: Structure) => void;
  onExplore: (x: number, z: number, name: string, chunks: number) => void;
};

const TOWN_OFFSET = { x: 0, z: 0 };
const ISLAND_OFFSET = { x: -210, z: 420 };

/** Vista del mundo con terreno por chunks y vegetación GLB compartida. */
export class WorldView {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private readonly zones = new Map<ZoneId, IslandInfo>();
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly built = new Map<string, TransformNode>();
  private readonly pressed = new Set<string>();
  private player!: TransformNode;
  private playerBody!: TransformNode;
  private movementTime = 0;
  private interactTarget: Interactable | null = null;
  private previousHint = '';
  private placement: { type: BuildType; rotation: number; ghost: TransformNode } | null = null;
  private preview: BuildPreview | null = null;
  private readonly plot = { x: -29, z: 18, halfSize: 17 };
  private readonly mainland: TerrainStream;
  private readonly geography: GeographyStream;
  private readonly vegetation: VegetationSystem;
  private readonly props: WorldPropSystem;
  private readonly traversal=new CharacterTraversalController();
  private jumpRequested=false;
  private lastSafePosition={x:1,z:10};
  private readonly vegetationExclusions: VegetationExclusion[] = [];
  private readonly rockVisualRequests:{root:TransformNode;partIndex:number;diameter:number;copper:boolean}[]=[];
  private exploreTimer = 0;
  private saveTimer = 0;
  private lastBiome = "";
  private vegetationCenter = '';
  private cameraPreferredRadius=29;
  private cameraAppliedRadius=29;
  private cameraOcclusionTimer=0;
  private cameraOcclusionDistance=Infinity;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: GameStore,
    private readonly callbacks: WorldCallbacks,
    private readonly blocked: () => boolean
  ) {
    this.engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: true });
    this.engine.setHardwareScalingLevel(Math.min(1.35, Math.max(1, window.devicePixelRatio / 1.7)));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.73, 0.85, 0.97, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.0023;
    this.scene.fogColor = new Color3(0.71, 0.84, 0.95);

    const hemi = new HemisphericLight('ambiente', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.88;
    hemi.groundColor = new Color3(0.48, 0.55, 0.62);
    const sun = new DirectionalLight('sol', new Vector3(-0.5, -1.3, 0.55), this.scene);
    sun.intensity = 1.35;
    sun.diffuse = new Color3(1, 0.91, 0.76);

    this.camera = new ArcRotateCamera('camara-aventura', -Math.PI / 2.3, 1.05, 29, new Vector3(0, 3, 0), this.scene);
    this.camera.lowerRadiusLimit = 4;
    this.camera.upperRadiusLimit = 46;
    this.camera.lowerBetaLimit = 0.35;
    this.camera.upperBetaLimit = 1.35;
    this.camera.wheelPrecision = 32;
    this.camera.maxZ = 1300;
    this.camera.panningSensibility = 0;
    this.camera.inertia = 0.7;
    this.camera.attachControl(canvas, true);
    // Las flechas se reservan para el personaje, no para orbitar la cámara.
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');

    this.createSea();
    const continentRoot=new TransformNode('zona-brisalia',this.scene);
    continentRoot.position.set(TOWN_OFFSET.x,0,TOWN_OFFSET.z);
    this.zones.set('brisalia',{
      id:'brisalia',root:continentRoot,terrain:null,offset:new Vector3(0,0,0),
      radiusX:MAINLAND.radiusX,radiusZ:MAINLAND.radiusZ,spawn:{x:1,z:10},nodes:[]
    });
    this.mainland=new TerrainStream(this.scene,continentRoot);
    this.geography=new GeographyStream(this.scene,continentRoot);
    this.createZone('luciernagas', new Vector3(ISLAND_OFFSET.x, 0, ISLAND_OFFSET.z), 78, 65, { x: -3, z: -20 });
    this.populateMainland();
    this.populateFireflyIsland();
    this.createPlayer();

    for (const s of store.state.structures) this.drawStructure(s);
    this.vegetation=new VegetationSystem(this.scene,continentRoot,()=>[
      ...this.vegetationExclusions,
      ...this.store.state.structures.map(s=>({x:s.x,z:s.z,radius:5}))
    ]);
    this.props=new WorldPropSystem(this.scene,continentRoot,this.store,()=>[
      ...this.vegetationExclusions,
      ...this.store.state.structures.map(s=>({x:s.x,z:s.z,radius:5}))
    ]);
    void this.vegetation.load();
    void this.props.load().then(()=>{
      for(const request of this.rockVisualRequests){
        this.props.attachRockVisual(request.root,request.partIndex,request.diameter,request.copper);
      }
      this.rockVisualRequests.length=0;
    });
    this.activateZone(store.state.zone);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.045);
      this.update(dt);
      this.scene.render();
    });
  }

  private readonly resize = () => this.engine.resize();
  private readonly onBlur = () => this.pressed.clear();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'e', 'r',' '].includes(key)) e.preventDefault();
    this.pressed.add(key);
    if (e.repeat || this.blocked()) return;
    if(key===' '&&!this.placement)this.jumpRequested=true;
    if (key === 'e') this.interact();
    if (key === 'r' && this.placement) this.rotatePlacement();
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.pressed.delete(e.key.toLowerCase());
  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.placement || this.blocked() || !this.traversal.canBuild) return;
    this.refreshPreview();
    if (!this.preview) return;
    if (!this.preview.valid) { this.callbacks.notify(this.preview.message); return; }
    const outcome = this.store.build(this.preview.type, this.preview.localX, this.preview.localZ, this.preview.rotation);
    if (outcome.ok && outcome.structure) {
      this.drawStructure(outcome.structure);
      this.callbacks.notify(outcome.message);
      this.callbacks.onBuild(outcome.structure);
      this.refreshPreview();
    } else this.callbacks.notify(outcome.message);
  };

  private mat(name: string, color: string, emissive = 0, alpha = 1): StandardMaterial {
    if (this.materials.has(name)) return this.materials.get(name)!;
    const value = Color3.FromHexString(color);
    const material = new StandardMaterial(name, this.scene);
    material.diffuseColor = value;
    material.specularColor = new Color3(0.13, 0.13, 0.13);
    material.emissiveColor = value.scale(emissive);
    material.alpha = alpha;
    this.materials.set(name, material);
    return material;
  }

  private createSea(): void {
    const sea = MeshBuilder.CreateGround('Mar de Auralia', { width: 5600, height: 5000 }, this.scene);
    sea.position.set(MAINLAND.centerX,MAINLAND.waterLevel,MAINLAND.centerZ);
    const water = this.mat('agua-turquesa', '#4babc1', 0.2);
    water.specularColor = new Color3(0.55, 0.74, 0.79);
    sea.material = water;
    sea.isPickable = false;

    // Manchas en el agua para dar profundidad visual, sin shaders de producción todavía.
    const foam = this.mat('espuma-lejana', '#b6e9df', 0.15, 0.32);
    for (let i = 0; i < 28; i++) {
      const x = Math.sin(i * 17.3) * (100 + (i % 6) * 43);
      const z = Math.cos(i * 11.7) * (110 + (i % 5) * 42);
      const patch = MeshBuilder.CreateDisc(`brillo-mar-${i}`, { radius: 2.5 + i % 4, tessellation: 20 }, this.scene);
      patch.rotation.x = Math.PI / 2;
      patch.position.set(x, -0.09, z);
      patch.scaling.y = 0.25;
      patch.material = foam;
      patch.isPickable = false;
    }
  }

  private terrainHeight(x: number, z: number, zone: IslandInfo): number {
    if(zone.id==='brisalia')return sampleMainlandHeight(x,z);
    const radial = Math.sqrt((x / zone.radiusX) ** 2 + (z / zone.radiusZ) ** 2);
    const rolling = 0.45 * Math.sin(x * 0.095) * Math.cos(z * 0.07);
    const coastDrop = Math.max(0, radial - 0.69) * 22;
    return 2.95 + rolling - coastDrop;
  }

  private createZone(id: ZoneId, offset: Vector3, radiusX: number, radiusZ: number, spawn: { x: number; z: number }): void {
    const root = new TransformNode(`zona-${id}`, this.scene);
    root.position.copyFrom(offset);
    const mesh = MeshBuilder.CreateGround(`terreno-${id}`, { width: radiusX * 2.15, height: radiusZ * 2.15, subdivisions: 88, updatable: true }, this.scene);
    mesh.parent = root;
    const info: IslandInfo = { id, root, terrain: mesh, offset, radiusX, radiusZ, spawn, nodes: [] };
    this.zones.set(id, info);

    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const colors: number[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i], z = positions[i + 2];
      const h = this.terrainHeight(x, z, info);
      positions[i + 1] = h;
      const edge = Math.sqrt((x/radiusX)**2+(z/radiusZ)**2);
      let color = id === 'brisalia' ? new Color3(0.40, 0.65, 0.39) : new Color3(0.38, 0.73, 0.53);
      if (edge > 0.69) color = new Color3(0.83, 0.77, 0.54);
      if (edge > 0.79) color = new Color3(0.72, 0.70, 0.51);
      const variation = 0.95 + 0.08 * Math.sin(x * 0.55) * Math.cos(z * 0.38);
      colors.push(color.r * variation, color.g * variation, color.b * variation, 1);
    }
    mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    const normals: number[] = [];
    const indices = mesh.getIndices()!;
    VertexData.ComputeNormals(positions, indices, normals);
    mesh.updateVerticesData(VertexBuffer.NormalKind, normals);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    const material = this.mat(`suelo-${id}`, '#ffffff');
    material.specularColor = Color3.Black();
    mesh.material = material;
    mesh.isPickable = true;
  }

  private y(zone: IslandInfo, x: number, z: number): number { return this.terrainHeight(x, z, zone); }
  private host(zone: IslandInfo, name: string, x: number, z: number): TransformNode {
    const root = new TransformNode(name, this.scene);
    root.parent = zone.root;
    root.position.set(x, this.y(zone, x, z), z);
    return root;
  }

  private box(name: string, parent: TransformNode, width: number, height: number, depth: number, x: number, y: number, z: number, mat: StandardMaterial): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  }

  private cyl(name: string, parent: TransformNode, diameter: number, height: number, x: number, y: number, z: number, mat: StandardMaterial, tessellation = 8): Mesh {
    const mesh = MeshBuilder.CreateCylinder(name, { diameter, height, tessellation }, this.scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  }

  private ball(name: string, parent: TransformNode, diameter: number, x: number, y: number, z: number, mat: StandardMaterial): Mesh {
    const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, this.scene);
    mesh.parent = parent;
    mesh.position.set(x, y, z);
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  }

  private tree(zone: IslandInfo, x: number, z: number, scale = 1, purple = false): TransformNode {
    if(zone.id==='brisalia')this.vegetationExclusions.push({x,z,radius:3.2*scale+2});
    const root = this.host(zone, 'arbol', x, z);
    const bark = this.mat('corteza', '#805a3c');
    const leaf = this.mat(purple ? 'hojas-lilas' : 'hojas-verdes', purple ? '#8d8fd4' : '#2e8158');
    const lightLeaf = this.mat(purple ? 'hojas-lavanda' : 'hojas-claras', purple ? '#b9a5e9' : '#52a76e');
    this.cyl('tronco', root, 0.9 * scale, 4.4 * scale, 0, 2.2 * scale, 0, bark);
    this.ball('copa-principal', root, 5.2 * scale, 0, 5.7 * scale, 0, leaf);
    this.ball('copa-secundaria', root, 3.9 * scale, -1.4 * scale, 5.1 * scale, 0.9 * scale, lightLeaf);
    return root;
  }

  private rock(zone: IslandInfo, x: number, z: number, copper = false): TransformNode {
    if(zone.id==='brisalia')this.vegetationExclusions.push({x,z,radius:3});
    const root=this.host(zone,copper?'roca-cobre':'roca',x,z);
    // Existing resource IDs, interaction and respawn remain unchanged.
    // The 1K GLB is loaded once after zones have been populated.
    const u=Math.abs(Math.sin(x*12.9898+z*78.233));
    const partIndex=selectRockPart(copper?u*.34:u*.8);
    const diameter=copper?2.6:1.45+u*1.25;
    this.rockVisualRequests.push({root,partIndex,diameter,copper});
    return root;
  }

  private crystal(zone: IslandInfo, x: number, z: number): TransformNode {
    const root = this.host(zone, 'cristal-chispa', x, z);
    const gem = this.mat('cristal-violeta', '#90ddeb', 0.7);
    const gem2 = this.mat('cristal-azul', '#719deb', 0.55);
    const crystal = MeshBuilder.CreateCylinder('cristal-grande', { diameterTop: 0, diameterBottom: 1.45, height: 3.8, tessellation: 5 }, this.scene);
    crystal.parent = root; crystal.position.y = 2.2; crystal.rotation.z = 0.13; crystal.material = gem; crystal.isPickable = false;
    this.cyl('cristal-pequeno', root, 1.1, 2.4, -1, 1.1, -0.6, gem2, 5).rotation.z = -0.34;
    return root;
  }

  private sign(zone: IslandInfo, x: number, z: number): TransformNode {
    const root = this.host(zone, 'poste-senal', x, z);
    this.cyl('poste', root, 0.34, 2.7, 0, 1.35, 0, this.mat('poste', '#754d2e'));
    this.box('tabla', root, 3.1, 0.8, 0.25, 0.9, 2.4, 0, this.mat('tabla', '#cc9a61'));
    return root;
  }

  private home(zone: IslandInfo, x: number, z: number, roofColor: '#b96550' | '#5c90a3' | '#a784c2', scale = 1): void {
    if(zone.id==='brisalia')this.vegetationExclusions.push({x,z,radius:8*scale});
    const root = this.host(zone, 'casa-pueblo', x, z);
    root.scaling.setAll(scale);
    const walls = this.mat('revoque-calido', '#f5dca5');
    const timber = this.mat('vigas', '#7b583d');
    this.box('casa-cuerpo', root, 9.5, 5.4, 8.3, 0, 2.7, 0, walls);
    this.box('viga-1', root, 0.55, 5.4, 8.6, -4.6, 2.7, 0, timber);
    this.box('viga-2', root, 0.55, 5.4, 8.6, 4.6, 2.7, 0, timber);
    this.box('puerta', root, 2.0, 3.45, 0.25, 0, 1.75, 4.2, timber);
    const blue = this.mat('ventana', '#5c899a', 0.12);
    this.box('ventana-izq', root, 1.5, 1.5, 0.3, -2.9, 3.3, 4.2, blue);
    this.box('ventana-der', root, 1.5, 1.5, 0.3, 2.9, 3.3, 4.2, blue);
    const roof = MeshBuilder.CreateCylinder('techo-cuatro-aguas', { diameterTop: 0, diameterBottom: 14.7, height: 4.8, tessellation: 4 }, this.scene);
    roof.parent = root; roof.position.y = 7.3; roof.rotation.y = Math.PI / 4; roof.material = this.mat(`tejado-${roofColor}`, roofColor);
    roof.isPickable = false;
    this.cyl('chimenea', root, 1.4, 3.5, 2.1, 8.2, -1.3, timber, 4);
  }

  private path(zone: IslandInfo, coords: readonly (readonly [number, number])[], width = 5): void {
    const sand = this.mat('sendero', '#d0b987');
    for(let i=1;i<coords.length;i++){
      const [ax,az]=coords[i-1],[bx,bz]=coords[i];
      const len=Math.hypot(bx-ax,bz-az);
      const parts=Math.max(1,Math.ceil(len/10));
      for(let j=0;j<parts;j++){
        const t0=j/parts,t1=(j+1)/parts;
        const x0=ax+(bx-ax)*t0,z0=az+(bz-az)*t0;
        const x1=ax+(bx-ax)*t1,z1=az+(bz-az)*t1;
        const x=(x0+x1)/2,z=(z0+z1)/2;
        const y0=zone.id==='brisalia'?this.walkHeightAt(x0,z0):this.y(zone,x0,z0);
        const y1=zone.id==='brisalia'?this.walkHeightAt(x1,z1):this.y(zone,x1,z1);
        if(zone.id==='brisalia' && (y0<.45||y1<.45))continue;
        const root=this.host(zone,'camino-segmento',x,z);
        root.position.y=(y0+y1)/2+.1;
        const distance=Math.hypot(x1-x0,z1-z0);
        const mesh=this.box('tramo',root,width,.075,distance+.8,0,0,0,sand);
        mesh.rotation.y=Math.atan2(x1-x0,z1-z0);
        mesh.rotation.x=-Math.atan2(y1-y0,distance);
      }
    }
  }

  private markInteraction(zone: IslandInfo, node: Interactable): void {
    zone.nodes.push(node);
    if(zone.id==='brisalia')this.vegetationExclusions.push({
      x:node.localPosition.x,z:node.localPosition.z,
      radius:node.type==='dock'?16:node.type==='lore'?9:node.type==='resource'?5:6
    });
    // Marca flotante que destaca interacciones para niños sin sobrecargar la escena.
    const markerHeight = node.resource === 'wood' ? 8.6 : node.resource === 'spark' ? 5.2 :
      node.type === 'npc' ? 4.3 : node.type === 'dock' ? 4.8 : 3.5;
    const mark = this.ball(`marcador-${node.id}`, node.visual, 0.57, 0, markerHeight, 0,
      this.mat(node.type === 'dock' ? 'marca-navegacion' : 'marca-interactiva', node.type === 'dock' ? '#81e7ff' : '#f8de75', 0.6));
    mark.isPickable = false;
  }

  private resource(zone: IslandInfo, id: string, label: string, resource: MaterialId, amount: number, x: number, z: number): void {
    const visual = resource === 'wood' ? this.tree(zone, x, z, 0.8) :
      resource === 'spark' ? this.crystal(zone, x, z) : this.rock(zone, x, z, resource === 'copper');
    this.markInteraction(zone, {
      id, label, verb: `Recolectar ${label.toLowerCase()}`, type: 'resource',
      localPosition: new Vector3(x, 0, z), visual, resource, amount, enabled: true
    });
  }

  private npc(zone: IslandInfo, id: string, label: string, dialogue: string, x: number, z: number, color: string): void {
    const root = this.host(zone, `npc-${id}`, x, z);
    const fabric = this.mat(`ropa-${id}`, color);
    this.cyl('cuerpo', root, 1.65, 2.1, 0, 1.6, 0, fabric);
    this.ball('cabeza', root, 1.35, 0, 3.25, 0, this.mat('piel-npc', '#edc3a0'));
    this.cyl('pierna-1', root, 0.45, 1.15, -0.4, 0.53, 0, this.mat('botas', '#675447'));
    this.cyl('pierna-2', root, 0.45, 1.15, 0.4, 0.53, 0, this.mat('botas', '#675447'));
    this.markInteraction(zone, {
      id, label, verb: `Hablar con ${label}`, type: 'npc', localPosition: new Vector3(x, 0, z),
      visual: root, dialogue, enabled: true
    });
  }

  private dock(zone: IslandInfo, x: number, z: number, destination: ZoneId, label: string): void {
    const root = this.host(zone, 'muelle', x, z);
    const wood = this.mat('madera-muelle', '#a87844');
    for (let i = 0; i < 5; i++) {
      this.box('tabla-muelle', root, 6, 0.22, 2.15, 0, -0.05, i * 1.9, wood);
      if (i % 2 === 0) {
        this.cyl('pilote-izq', root, 0.38, 3.5, -2.7, -1.1, i * 1.9, this.mat('tronco-oscuro', '#75553b'));
        this.cyl('pilote-der', root, 0.38, 3.5, 2.7, -1.1, i * 1.9, this.mat('tronco-oscuro', '#75553b'));
      }
    }
    this.box('barquita', root, 5.0, 0.9, 7.2, 8, -0.2, 6, this.mat('barca', '#80522d'));
    this.cyl('mastil', root, 0.3, 5, 8, 2.4, 6, this.mat('marco-velero', '#64412c'));
    const sail = this.box('vela', root, 0.15, 3.5, 2.3, 8, 2.9, 7.4, this.mat('vela', '#fff2cd'));
    sail.rotation.y = 0.25;
    this.markInteraction(zone, {
      id: zone.id==='brisalia'?'embarcadero-brisalia':`muelle-${zone.id}`, label, verb: `Navegar: ${label}`, type: 'dock', destination,
      localPosition: new Vector3(x, 0, z + 2), visual: root, enabled: true
    });
  }

  private populateMainland(): void {
    const zone = this.zones.get('brisalia')!;
    for(const route of ROAD_RESERVATIONS){
      if(route.existing)this.path(zone,route.points,route.width);
    }
    this.home(zone, -8, -32, '#b96550', 1.1);
    this.home(zone, 9, -33, '#5c90a3', 0.94);
    this.home(zone, 24, -22, '#a784c2', 0.85);
    this.home(zone, -25, -27, '#b96550', 0.88);
    this.home(zone, 9, -12, '#b96550', 0.82);

    // Plaza del pueblo.
    const plaza = this.host(zone, 'plaza', 1, -19);
    this.vegetationExclusions.push({x:1,z:-19,radius:14});
    this.cyl('estanque', plaza, 5.4, 0.7, 0, 0.3, 0, this.mat('piedra-plaza', '#b2b2a0'));
    this.cyl('fuente', plaza, 3.5, 0.35, 0, 0.72, 0, this.mat('agua-fuente', '#6dbfdd', 0.25));
    this.cyl('obelisco', plaza, 1.1, 3, 0, 2.2, 0, this.mat('cristal-plaza', '#d7c99a'));
    this.sign(zone, -13, 4);

    // Parcela de construcción visible, sin obstáculos.
    const plot = this.host(zone, 'claro-del-hogar', this.plot.x, this.plot.z);
    this.vegetationExclusions.push({x:this.plot.x,z:this.plot.z,radius:24});
    const border = this.mat('piedra-parcela', '#dbb875');
    for (const v of [-17, 17]) {
      this.box('limite-x', plot, 35, 0.16, 0.45, 0, 0.13, v, border);
      this.box('limite-z', plot, 0.45, 0.16, 35, v, 0.13, 0, border);
    }
    this.sign(zone, -44, 18);
    const flag = this.cyl('banderin-parcela', plot, 0.3, 4, -15, 2, -15, this.mat('poste-bandera', '#976e46'));
    flag.rotation.z = 0.05;
    this.box('bandera', plot, 2.4, 1.2, 0.1, -13.8, 3.4, -15, this.mat('bandera', '#e0bd63'));

    // Bosques, recursos y rocas. Algunas instancias decorativas, otras recolectables.
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399;
      const x = -52 + Math.cos(a) * (11 + (i % 5) * 3.5);
      const z = -4 + Math.sin(a) * (11 + (i % 6) * 4);
      if (Math.abs(x + 29) < 19 && Math.abs(z - 18) < 20) continue;
      if ((x/103)**2+(z/87)**2 > 0.6) continue;
      this.tree(zone, x, z, 0.65 + (i % 4) * 0.13, i % 9 === 0);
    }
    for (let i = 0; i < 10; i++) {
      const x = -54 + (i % 5) * 6;
      const z = 24 + Math.floor(i / 5) * 8;
      this.resource(zone, `madera-${i}`, 'Madera', 'wood', 3, x, z);
    }
    for (let i = 0; i < 9; i++) {
      const x = 33 + (i % 3) * 6.2;
      const z = -6 + Math.floor(i / 3) * 6.5;
      this.resource(zone, `piedra-${i}`, 'Piedra', 'stone', 2, x, z);
    }
    for (let i = 0; i < 4; i++) this.resource(zone, `cobre-${i}`, 'Cobre', 'copper', 1, 42 + i * 3.1, 20 + i * 2.8);
    for (let i = 0; i < 17; i++) {
      const angle = i * 2.1;
      const x = 32 + Math.sin(angle) * 20;
      const z = 21 + Math.cos(angle) * 23;
      if (Math.abs(x) < 18) continue;
      this.rock(zone, x, z);
    }
    // Primera mesa de trabajo.
    const table = this.host(zone, 'banco-carpinteria', -10, 7);
    this.box('mesa', table, 4.5, 0.35, 2.8, 0, 1.6, 0, this.mat('madera-taller', '#a66d3c'));
    for (const dx of [-1.8, 1.8]) for (const dz of [-1, 1]) this.cyl('pata', table, 0.38, 1.8, dx, 0.82, dz, this.mat('madera-patas', '#755136'));
    this.markInteraction(zone, {
      id: 'taller', label: 'Banco de trabajo', verb: 'Abrir recetas', type: 'workbench',
      localPosition: new Vector3(-10, 0, 7), visual: table, enabled: true
    });
    this.npc(zone, 'aro', 'Arlo, el carpintero', '¡Bienvenido a Brisalia! Recogé madera y piedra, fabricá un martillo y construí tu hogar en el claro marcado.', -6, 2, '#b25c45');
    this.npc(zone, 'mira', 'Mira, la herrera', 'En Altapiedra hay talleres inmensos. Por ahora, aprendé a reconocer el cobre en las rocas del valle.', 15, -6, '#4c7a9b');
    this.npc(zone, 'nilo', 'Nilo, el cartógrafo', 'El Mapa Vivo muestra tierras que todavía no conocemos. Las islas son las mejores escuelas para un explorador curioso.', -1, 24, '#6b8e54');
    this.dock(zone, 33, 120, 'luciernagas', 'Isla de las Luciérnagas');
    this.populateRegionOutposts(zone);
    this.populatePointsOfInterest(zone);
  }

  private populatePointsOfInterest(zone:IslandInfo):void {
    for(const place of POINTS_OF_INTEREST){
      if(place.kind==='dock')continue; // El muelle jugable ya existe y conserva su viaje.
      const visual=createPointOfInterestView(this.scene,zone.root,place,(x,z)=>this.y(zone,x,z));
      this.markInteraction(zone,{
        id:place.id,label:place.name,verb:`Examinar: ${place.name}`,type:'lore',
        localPosition:new Vector3(place.x,0,place.z),visual,dialogue:place.dialogue,enabled:true
      });
    }
  }

  private populateRegionOutposts(zone:IslandInfo):void {
    // No son ciudades completas: son miradores explorables que fijan la geografía futura.
    // Se expandirán por módulos, sin cambiar las coordenadas del mundo continental.
    const archStone=this.mat('arcos-antiguos','#949ca3');
    const glow=this.mat('chispa-arco','#96cae0',.5);
    const wood=this.mat('maquinas-madera','#966944');
    const metal=this.mat('maquinas-metal','#869aa1');
    const landmark=(id:string,label:string,x:number,z:number,dialogue:string):void=>{
      const p=this.host(zone,`hito-${id}`,x,z);
      this.cyl('piedra-base',p,5,1.2,0,.55,0,archStone,8);
      this.ball('luz-del-hito',p,1.5,0,4.1,0,glow);
      this.markInteraction(zone,{id:`hito-${id}`,label,verb:`Examinar: ${label}`,type:'lore',localPosition:new Vector3(x,0,z),visual:p,dialogue,enabled:true});
    };
    // BOSQUE DE LOS ECOS
    this.tree(zone,-363,-283,3.1,true);
    for(const x of [-360,-345,-330])this.cyl('piedra-durmiente',this.host(zone,'piedra-del-eco',x,-307),1.8,7,0,3.5,0,archStone,6);
    landmark('ecos','Arco del Bosque de los Ecos',-350,-285,'Más adelante, aquí comenzarán los senderos cambiantes de Lindebrumas. El bosque ya es explorable.');
    for(let i=0;i<8;i++)this.resource(zone,`ecos-madera-${i}`,'Madera','wood',2,-320+i*7,-245+(i%3)*12);
    // SIERRAS DE LOS ENGRANAJES
    const mine=this.host(zone,'puesto-minero',-275,-535);
    for(const s of [-8,8])this.cyl('poste-de-grua',mine,.9,14,s,7,0,wood);
    this.box('viga-grua',mine,20,1,1.2,0,14,0,wood);
    this.cyl('rueda-grua',mine,4,.9,2,11,0,metal,10).rotation.z=Math.PI/2;
    landmark('altapiedra','Paso de Altapiedra',-275,-535,'Las Sierras guardan máquinas antiguas y vetas de metal. La ciudad de Altapiedra llegará en otra actualización.');
    for(let i=0;i<9;i++)this.resource(zone,`sierra-cobre-${i}`,'Cobre','copper',1,-260+(i%3)*10,-490+Math.floor(i/3)*9);
    // LAGO DE LAS DOS ORILLAS
    for(const [x,z,color] of [[265,-205,'#5c90a3'],[285,-194,'#b96550'],[300,-160,'#a784c2']] as const)this.home(zone,x,z,color,.72);
    const pier=this.host(zone,'mirador-lago',250,-200);
    this.vegetationExclusions.push({x:250,z:-192,radius:20});
    for(let k=0;k<6;k++)this.box('pasarela-lago',pier,4.2,.3,3.2,0,.2,k*3,wood);
    landmark('nacar','Orilla de Nácar',245,-250,'Al otro lado del lago se fundará Nácar, una ciudad dedicada a la navegación y los intercambios.');
    for(let i=0;i<7;i++)this.resource(zone,`nacar-piedra-${i}`,'Piedra','stone',2,250+(i%4)*10,-265+Math.floor(i/4)*15);
    // CUMBRES DEL PRIMER AMANECER
    const shrine=this.host(zone,'mirador-altaluz',200,-660);
    for(const x of [-7,7])this.box('pilastra',shrine,2.1,12,2.1,x,6,0,archStone);
    this.box('dintel',shrine,18,2.3,3.1,0,12,0,archStone);
    this.ball('faro-pequeno',shrine,3.6,0,16,0,glow);
    landmark('altaluz','Mirador de Altaluz',200,-660,'Desde aquí se ve el camino hacia el Gran Faro. La ciudadela todavía está por construirse.');
  }

  private populateFireflyIsland(): void {
    const zone = this.zones.get('luciernagas')!;
    for (let i = 0; i < 13; i++) {
      const a = i * 2.4;
      const x = Math.cos(a) * (9 + i % 4 * 3.5);
      const z = Math.sin(a) * (8 + i % 3 * 3.4);
      this.tree(zone, x, z, 0.6 + (i % 3) * 0.15, true);
    }
    for (let i = 0; i < 8; i++) {
      const x = -13 + (i % 4) * 7.5, z = 1 + Math.floor(i / 4) * 9;
      this.resource(zone, `chispa-${i}`, 'Cristal de chispa', 'spark', 1, x, z);
    }
    for (let i = 0; i < 3; i++) this.resource(zone, `madera-isla-${i}`, 'Madera', 'wood', 2, 18, -3 + i * 6);
    const altar = this.host(zone, 'altar-de-los-caminos', 2, 11);
    this.cyl('pedestal', altar, 7, 0.9, 0, 0.42, 0, this.mat('altar-base', '#b7b1c4'), 8);
    this.ball('orbe', altar, 2.5, 0, 3.4, 0, this.mat('orbe', '#e8fff3', 0.85));
    this.cyl('columna', altar, 1.3, 2.2, 0, 1.6, 0, this.mat('altar-cuerpo', '#a49dbb'));
    const light = new PointLight('luz-altar', new Vector3(2, 7, 11), this.scene);
    light.parent = zone.root;
    light.diffuse = new Color3(0.55, 0.85, 0.98); light.intensity = 0.7; light.range = 20;
    this.markInteraction(zone, {
      id: 'altar', label: 'Orbe del pequeño santuario', verb: 'Examinar el orbe', type: 'lore',
      localPosition: new Vector3(2, 0, 11), visual: altar, enabled: true,
      dialogue: 'Las Chispas aparecen donde alguien aprende, construye o ayuda. Con dos cristales podés fabricar una linterna que nunca se apaga.'
    });
    this.dock(zone, -2, -22, 'brisalia', 'Brisalia');
  }

  private createPlayer(): void {
    this.player = new TransformNode('protagonista', this.scene);
    this.playerBody = new TransformNode('cuerpo-animado', this.scene);
    this.playerBody.parent = this.player;
    const skin = this.mat('piel-jugador', '#ecc49f');
    const shirt = this.mat('tunica-jugador', '#337d9b');
    const pants = this.mat('pantalon-jugador', '#58646b');
    const hair = this.mat('pelo-jugador', '#66432e');
    const backpack = this.mat('mochila-jugador', '#a9774d');
    this.cyl('torso', this.playerBody, 1.65, 2.0, 0, 1.75, 0, shirt);
    this.ball('cabeza', this.playerBody, 1.4, 0, 3.24, 0, skin);
    this.ball('cabello', this.playerBody, 1.4, 0, 3.73, -0.18, hair);
    this.cyl('brazo-izq', this.playerBody, 0.42, 1.65, -1.1, 1.9, 0, skin).rotation.z = -0.24;
    this.cyl('brazo-der', this.playerBody, 0.42, 1.65, 1.1, 1.9, 0, skin).rotation.z = 0.24;
    this.cyl('pierna-izq', this.playerBody, 0.58, 1.32, -0.45, 0.65, 0, pants);
    this.cyl('pierna-der', this.playerBody, 0.58, 1.32, 0.45, 0.65, 0, pants);
    this.box('mochila', this.playerBody, 1.7, 1.6, 0.65, 0, 2, -0.9, backpack);
    const eye = this.mat('ojos-jugador', '#283c4b');
    this.ball('ojo-izq', this.playerBody, 0.18, -0.24, 3.34, 0.67, eye);
    this.ball('ojo-der', this.playerBody, 0.18, 0.24, 3.34, 0.67, eye);
  }

  activateZone(id: ZoneId): void {
    for(const zone of this.zones.values())zone.root.setEnabled(zone.id===id);
    this.cancelPlacement();
    const zone=this.zones.get(id)!;
    const previous=this.store.state.playerPosition;
    const saved=previous?.zone===id ? previous : null;
    const start=saved&&id==='brisalia'?this.safeSavedStart(saved.x,saved.z):saved??zone.spawn;
    this.player.position.set(zone.offset.x+start.x,id==='brisalia'?this.walkHeightAt(start.x,start.z):this.y(zone,start.x,start.z),zone.offset.z+start.z);
    this.traversal.teleport(start.x,this.player.position.y,start.z);
    this.lastSafePosition={x:start.x,z:start.z};
    this.jumpRequested=false;
    if(id==='brisalia')this.props.setColliderFocus(start.x,start.z,null);
    else {
      this.props.setColliderFocus(start.x,start.z,null);
      this.props.setActiveChunks([],start.x,start.z);
      this.vegetationCenter='';
    }
    if(id==='brisalia')this.streamMainland(start.x,start.z);
    this.interactTarget=null;
    this.camera.setTarget(this.player.position.add(new Vector3(0,1.9,0)));
    this.sendLocation();
  }

  /** Old saves have only X/Z; keep a saved foot out of a newly generated rock base. */
  private safeSavedStart(x:number,z:number):{x:number;z:number}{
    // Saves store X/Z only. A saved position on the exposed rock face would
    // otherwise respawn at the terrain height, underneath the visible mesh.
    for(const formation of GEOLOGY_FORMATIONS){
      if(formation.kind==='canyon')continue;
      const local=geologyLocal(formation,x,z);
      if(Math.abs(local.along)>formation.length*.5+8||local.across<=-34||
        local.across>=30||sampleMainlandHeight(x,z)>formation.targetHeight-4)continue;
      for(const across of [-38,-46,-55]){
        const candidate=geologyPoint(formation,local.along,across);
        if(isLand(candidate.x,candidate.z)&&!isInlandWater(candidate.x,candidate.z,
          sampleMainlandHeight(candidate.x,candidate.z))){
          x=candidate.x;z=candidate.z;break;
        }
      }
    }
    const center=chunkOf(x,z);
    const exclusions=[...this.vegetationExclusions,
      ...this.store.state.structures.map(s=>({x:s.x,z:s.z,radius:5}))];
    const rocks=[] as ReturnType<typeof propsForChunk>;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
      rocks.push(...propsForChunk(center.cx+dx,center.cz+dz,exclusions).filter(p=>
        p.kind==='rocasRectangulares'||p.kind==='packRocas'));
    for(const rock of rocks){
      const radius=rock.worldRadius??(rock.rockDiameter??0)*.5;
      const distance=Math.hypot(x-rock.x,z-rock.z);
      if(distance>radius+1.2)continue;
      const dx=distance>.01?(x-rock.x)/distance:1;
      const dz=distance>.01?(z-rock.z)/distance:0;
      for(const [ux,uz] of [[dx,dz],[1,0],[-1,0],[0,1],[0,-1]]){
        const nextX=rock.x+ux*(radius+2.5),nextZ=rock.z+uz*(radius+2.5);
        if(isLand(nextX,nextZ)&&!isInlandWater(nextX,nextZ,sampleMainlandHeight(nextX,nextZ))){
          x=nextX;z=nextZ;break;
        }
      }
    }
    return {x,z};
  }

  /** Desplazamiento de desarrollo: recorrer los biomas antes de crear las ciudades. */
  teleportToLandmark(id:string):void {
    const point=LANDMARKS.find(p=>p.id===id)??pointOfInterest(id);
    if(!point)return;
    if(this.store.state.zone!=='brisalia')this.store.travel('brisalia');
    this.activateZone('brisalia');
    const y=this.walkHeightAt(point.x,point.z);
    this.player.position.set(point.x,y,point.z);
    this.traversal.teleport(point.x,y,point.z);
    this.lastSafePosition={x:point.x,z:point.z};
    this.streamMainland(point.x,point.z);
    this.camera.setTarget(this.player.position.add(new Vector3(0,1.9,0)));
    this.store.setPlayerPosition('brisalia',point.x,point.z);
    this.sendLocation();
    this.callbacks.notify(`Explorando: ${point.name}`);
  }

  private sendLocation():void {
    const zone=this.zones.get(this.store.state.zone)!;
    const x=this.player.position.x-zone.offset.x,z=this.player.position.z-zone.offset.z;
    const name=zone.id==='brisalia'?BIOME_NAMES[biomeAt(x,z)]:'Isla de las Luciérnagas';
    if(this.lastBiome!==name){this.lastBiome=name;}
    this.callbacks.onExplore(x,z,name,zone.id==='brisalia'?this.mainland.activeCount:1);
    if(zone.id==='brisalia')for(const place of POINTS_OF_INTEREST){
      if(Math.hypot(x-place.x,z-place.z)<place.discoverRadius)this.store.discoverPlace(place.id);
    }
  }

  private walkHeightAt(x:number,z:number):number {
    return bridgeDeckAt(x,z)??sampleMainlandHeight(x,z);
  }

  private traversalWorld(zone:IslandInfo):TraversalWorld{
    const isMainland=zone.id==='brisalia';
    const height=(x:number,z:number)=>isMainland?this.walkHeightAt(x,z):this.y(zone,x,z);
    return {
      ground:(x,z,originY,maxDistance,footRadius)=>{
        const terrainY=height(x,z);
        const deck=isMainland?bridgeDeckAt(x,z):null;
        const d=.55;
        const slope=deck!==null?1:1/Math.hypot(1,
          (height(x+d,z)-height(x-d,z))/(2*d),(height(x,z+d)-height(x,z-d))/(2*d));
        const terrain=terrainY<=originY+.001&&terrainY>=originY-maxDistance-.001
          ?{height:terrainY,normalY:slope}:null;
        const rock=isMainland?this.props.queryRockGround(x,z,originY,maxDistance,footRadius):null;
        const root=isMainland?this.vegetation.queryTreeGround(x,z,originY,maxDistance):null;
        const surfaces=[terrain,root,rock?{height:rock.height,normalY:rock.normal.y,rockId:rock.rockId}:null]
          .filter((hit):hit is NonNullable<typeof hit>=>hit!==null);
        return surfaces.reduce<typeof terrain>((highest,hit)=>
          !highest||hit.height>highest.height?hit:highest,null);
      },
      solidTop:(x,z,originY,maxDistance,rockId)=>{
        if(!isMainland)return null;
        const hit=this.props.queryRockSolidTop(x,z,originY,maxDistance,rockId);
        return hit?{height:hit.height,normalX:hit.normal.x,normalZ:hit.normal.z,
          rockId:hit.rockId,centerX:hit.centerX,centerZ:hit.centerZ}:null;
      },
      wall:(x,y,z,dx,dz,reach)=>{
        if(!isMainland)return null;
        const hit=this.props.queryRockWall(x,y,z,dx,dz,reach);
        const tree=this.vegetation.queryTreeWall(x,y,z,dx,dz,reach);
        if(tree&&(!hit||tree.distance<hit.distance))return {
          pointX:tree.point.x,pointY:tree.point.y,pointZ:tree.point.z,
          distance:tree.distance,normalX:tree.normal.x,normalY:tree.normal.y,
          normalZ:tree.normal.z,rockId:tree.id,climbable:false
        };
        return hit?{pointX:hit.point.x,pointY:hit.point.y,pointZ:hit.point.z,
          distance:hit.distance,normalX:hit.normal.x,normalY:hit.normal.y,
          normalZ:hit.normal.z,rockId:hit.rockId,climbable:hit.climbable}:null;
      },
      headroom:(x,y,z,room,ignoreRockId)=>!isMainland||
        this.props.hasRockHeadroom(x,y,z,room,ignoreRockId),
      sameSupport:sameGeologyFormation,
      canMove:(nextX,nextZ,fromX,fromZ,feetY)=>{
        const elevated=feetY>height(fromX,fromZ)+4;
        const coastalRock=isMainland&&elevated&&!isLand(nextX,nextZ)
          ?this.props.queryRockGround(nextX,nextZ,feetY+1.8,3,.33):null;
        const canWalk=isMainland?(isLand(nextX,nextZ)||
          !!coastalRock&&coastalRock.height>MAINLAND.waterLevel+1)&&
          (elevated||!isInlandWater(nextX,nextZ,sampleMainlandHeight(nextX,nextZ))):
          Math.sqrt((nextX/zone.radiusX)**2+(nextZ/zone.radiusZ)**2)<.80;
        const houses=isMainland&&!elevated&&[
          {x:-8,z:-32,r:6},{x:9,z:-33,r:5.5},{x:24,z:-22,r:5},
          {x:-25,z:-27,r:5},{x:9,z:-12,r:5}
        ].some(ob=>Math.hypot(ob.x-nextX,ob.z-nextZ)<ob.r);
        return canWalk&&!houses&&
          (!isMainland||elevated||!this.props.blocksMovement(nextX,nextZ,fromX,fromZ,false));
      },
      fallbackHeight:height
    };
  }

  private streamMainland(x:number,z:number):void {
    const changed=this.mainland.update(x,z);
    const cell=chunkOf(x,z);
    const center=`${cell.cx}:${cell.cz}`;
    if(changed||center!==this.vegetationCenter){
      this.vegetationCenter=center;
      const cells=this.mainland.activeCells;
      this.vegetation.setActiveChunks(cells,x,z);
      this.props.setActiveChunks(cells,x,z);
      this.geography.setActiveChunks(cells,x,z);
    }
  }

  private exitEmbeddedGeology(x:number,y:number,z:number):{x:number;y:number;z:number}|null{
    for(const formation of GEOLOGY_FORMATIONS){
      const local=geologyLocal(formation,x,z);
      if(Math.abs(local.along)>formation.length*.5+8||local.across<=-34||local.across>=30)
        continue;
      const roof=this.props.queryRockSolidTop(x,z,y+80,80);
      if(!roof||roof.height<=y+TRAVERSAL.playerHeight+.6||
        !roof.rockId.startsWith(`geo:${formation.id}:`))continue;
      const outwardX=-formation.highX,outwardZ=-formation.highZ;
      const wall=this.props.queryRockWall(x,y+1.5,z,outwardX,outwardZ,24);
      if(!wall||!sameGeologyFormation(wall.rockId,roof.rockId))continue;
      for(const distance of [TRAVERSAL.playerRadius+.7,2,4,8,12]){
        const nextX=wall.point.x+outwardX*distance;
        const nextZ=wall.point.z+outwardZ*distance;
        if(!isLand(nextX,nextZ)||isInlandWater(nextX,nextZ,
          sampleMainlandHeight(nextX,nextZ)))continue;
        const nextY=this.walkHeightAt(nextX,nextZ);
        const nextRoof=this.props.queryRockSolidTop(nextX,nextZ,nextY+80,80);
        if(!nextRoof||nextRoof.height<=nextY+TRAVERSAL.playerHeight+.6)
          return {x:nextX,y:nextY,z:nextZ};
      }
    }
    return null;
  }

  private update(dt: number): void {
    const zone=this.zones.get(this.store.state.zone)!;
    const controls=!this.blocked()&&!this.placement;
    const horizontal=controls?Number(this.pressed.has('d')||this.pressed.has('arrowright'))-
      Number(this.pressed.has('a')||this.pressed.has('arrowleft')):0;
    const vertical=controls?Number(this.pressed.has('w')||this.pressed.has('arrowup'))-
      Number(this.pressed.has('s')||this.pressed.has('arrowdown')):0;
    const look=this.camera.getTarget().subtract(this.camera.position);
    const forwardLength=Math.hypot(look.x,look.z)||1;
    const direction=cameraRelativeMovement({x:look.x,z:look.z},horizontal,vertical);
    if(zone.id==='brisalia'){
      this.props.setColliderFocus(this.traversal.position.x,
        this.traversal.position.z,this.traversal.supportRockId);
      this.vegetation.setColliderFocus(this.traversal.position.x,this.traversal.position.z);
    }
    const walking=this.traversal.step(dt,{
      moveX:direction.x,moveZ:direction.z,forwardX:look.x/forwardLength,forwardZ:look.z/forwardLength,
      horizontal,vertical,run:controls&&this.pressed.has('shift'),
      jumpPressed:controls&&this.jumpRequested
    },this.traversalWorld(zone));
    this.jumpRequested=false;
    let {x:localX,y:localY,z:localZ}=this.traversal.position;
    if(zone.id==='brisalia'&&this.traversal.mode==='grounded'&&!this.traversal.supportRockId){
      const exit=this.exitEmbeddedGeology(localX,localY,localZ);
      if(exit){
        this.traversal.teleport(exit.x,exit.y,exit.z);
        localX=exit.x;localY=exit.y;localZ=exit.z;
      }
    }
    this.player.position.set(zone.offset.x+localX,localY,zone.offset.z+localZ);
    if(zone.id==='brisalia'){
      this.props.setColliderFocus(localX,localZ,this.traversal.supportRockId);
      this.vegetation.setColliderFocus(localX,localZ);
    }
    if(walking&&this.traversal.mode!=='climbing')this.player.rotation.y=Math.atan2(direction.x,direction.z);
    if(this.traversal.mode==='grounded'&&!this.traversal.supportRockId&&
      (zone.id!=='brisalia'||!GEOLOGY_FORMATIONS.some(formation=>{
        const local=geologyLocal(formation,localX,localZ);
        return Math.abs(local.along)<formation.length*.5+8&&
          local.across>-34&&local.across<30;
      })))
      this.lastSafePosition={x:localX,z:localZ};
    this.movementTime+=dt*(walking?10:2.3);
    this.playerBody.position.y=this.traversal.mode==='grounded'
      ?walking?Math.sin(this.movementTime)*.11:Math.sin(this.movementTime)*.025:0;
    this.playerBody.rotation.z=this.traversal.mode==='climbing'?.08:0;
    this.camera.setTarget(Vector3.Lerp(this.camera.getTarget(),this.player.position.add(new Vector3(0,1.85,0)),Math.min(1,7.5*dt)));
    this.updateCameraOcclusion(dt);
    if(zone.id==='brisalia'){
      this.streamMainland(localX,localZ);
      this.vegetation.update();
      this.props.update(dt);
      this.geography.update();
    }
    this.exploreTimer+=dt;
    this.saveTimer+=dt;
    if(this.exploreTimer>0.26){this.sendLocation();this.exploreTimer=0;}
    if(this.saveTimer>4 && walking){
      this.store.setPlayerPosition(zone.id,this.lastSafePosition.x,this.lastSafePosition.z);this.saveTimer=0;
    }
    this.findNearest();
    if(this.placement)this.refreshPreview();
  }

  private updateCameraOcclusion(dt:number):void{
    const changed=this.camera.radius-this.cameraAppliedRadius;
    if(Math.abs(changed)>.001)this.cameraPreferredRadius=Math.max(4,
      Math.min(46,this.cameraPreferredRadius+changed));
    this.cameraOcclusionTimer-=dt;
    if(this.cameraOcclusionTimer<=0){
      this.cameraOcclusionTimer=.12;
      const {alpha,beta}=this.camera,radius=this.cameraPreferredRadius;
      const target=this.camera.getTarget();
      const desired=target.add(new Vector3(
        Math.cos(alpha)*Math.sin(beta)*radius,
        Math.cos(beta)*radius,
        Math.sin(alpha)*Math.sin(beta)*radius));
      const hit=this.props.queryCameraObstruction(target,desired);
      this.cameraOcclusionDistance=hit===null?Infinity:Math.max(4,hit-1.1);
    }
    const safe=Math.min(this.cameraPreferredRadius,this.cameraOcclusionDistance);
    this.camera.radius=safe<this.camera.radius?safe:
      this.camera.radius+(safe-this.camera.radius)*Math.min(1,dt*5);
    this.cameraAppliedRadius=this.camera.radius;
  }

  private findNearest(): void {
    const zone = this.zones.get(this.store.state.zone)!;
    const playerLocal = this.player.position.subtract(zone.offset);
    let nearest: Interactable | null = null;
    let best = 6.4;
    for (const target of zone.nodes) {
      if (!target.enabled) continue;
      if(Math.abs(this.player.position.y-target.visual.getAbsolutePosition().y)>4.5)continue;
      const distance = Math.hypot(target.localPosition.x - playerLocal.x, target.localPosition.z - playerLocal.z);
      if (distance < best) { best = distance; nearest = target; }
    }
    if(zone.id==='brisalia'){
      const crystal=this.props.nearestResource(playerLocal.x,playerLocal.z,best);
      if(crystal&&Math.abs(this.player.position.y-crystal.visual.getAbsolutePosition().y)<=4.5){
        nearest={id:crystal.id,label:crystal.label,verb:`Recolectar ${crystal.label.toLowerCase()}`,type:'resource',
          localPosition:new Vector3(crystal.x,0,crystal.z),visual:crystal.visual,resource:crystal.resource,
          resourceNodeId:crystal.id,amount:crystal.amount,enabled:true};
      }
    }
    this.interactTarget = this.traversal.canInteract?nearest:null;
    let label=nearest&&this.traversal.canInteract?`E  ·  ${nearest.verb}`:
      'WASD caminar · Espacio saltar · E interactuar · M mapa';
    if(this.traversal.mode==='climbing')label='W/S trepar · A/D moverse · Espacio soltarse';
    else if(this.traversal.mode==='mantling')label='Subiendo al borde...';
    else if(zone.id==='brisalia'&&this.traversal.mode==='grounded'){
      const forward={x:Math.sin(this.player.rotation.y),z:Math.cos(this.player.rotation.y)};
      const face=this.props.queryRockWall(playerLocal.x,this.player.position.y+1.15,
        playerLocal.z,forward.x,forward.z,1.7);
      if(face?.climbable&&face.normal.y>=-.3&&face.normal.y<=.6)label='W para trepar · Espacio para saltar';
    }
    if (label !== this.previousHint) {
      this.previousHint = label;
      this.callbacks.hint(label);
    }
  }

  setVirtualKey(key: string, active: boolean): void {
    if(key==='space'&&active&&!this.blocked()&&!this.placement)this.jumpRequested=true;
    if (active) this.pressed.add(key); else this.pressed.delete(key);
  }

  canOpenPanel():boolean{return this.traversal.canInteract;}

  interact(): void {
    const node = this.interactTarget;
    if (!node || this.placement || this.blocked() || !this.traversal.canInteract) return;
    if(node.resourceNodeId){
      const collected=this.props.collect(node.resourceNodeId);
      if(!collected)return;
      this.callbacks.notify(`+${collected.amount} ${collected.label}`);
      this.interactTarget=null;
    } else if (node.type === 'resource' && node.resource && node.amount) {
      if (!this.store.collect(node.resource, node.amount)) return;
      node.enabled = false;
      node.visual.setEnabled(false);
      this.callbacks.notify(`+${node.amount} ${node.label}`);
      window.setTimeout(() => {
        node.enabled = true;
        node.visual.setEnabled(true);
      }, 42000);
    } else if (node.type === 'dock' && node.destination) {
      this.store.travel(node.destination);
      this.activateZone(node.destination);
      this.callbacks.onTravel(node.destination);
    } else if (node.type === 'workbench') {
      this.callbacks.openCraft();
    } else if ((node.type === 'npc' || node.type === 'lore') && node.dialogue) {
      this.callbacks.dialogue(node.label, node.dialogue);
    }
  }

  private makeBuildMesh(type: BuildType, x: number, z: number, rotation: number, ghost = false): TransformNode {
    const zone = this.zones.get('brisalia')!;
    const base = new TransformNode(`pieza-${type}`, this.scene);
    base.parent = zone.root;
    base.position.set(x, this.y(zone, x, z) + 0.09, z);
    base.rotation.y = rotation * Math.PI / 2;
    const wood = ghost ? this.mat('fantasma-verde', '#76e7c5', 0.28, 0.56) : this.mat('obra-madera', '#ae8155');
    const pale = ghost ? wood : this.mat('obra-pared', '#e5cfaa');
    const slate = ghost ? wood : this.mat('obra-tejas', '#b87054');
    if (type === 'floor') {
      this.box('piso', base, 4.0, 0.34, 4.0, 0, 0.13, 0, wood);
      for (const side of [-1.9, 1.9]) this.box('viga', base, 0.22, 0.24, 4.1, side, 0.17, 0, wood);
    } else if (type === 'wall' || type === 'stone-wall' || type === 'metal-wall') {
      const wallMaterial = type === 'stone-wall' && !ghost ? this.mat('obra-piedra', '#a8a9a2') :
        type === 'metal-wall' && !ghost ? this.mat('obra-metal', '#9eaea8') : pale;
      this.box('pared', base, 3.95, 3.25, 0.45, 0, 1.78, 0, wallMaterial);
      this.box('marco', base, 4.05, 0.35, 0.60, 0, 3.35, 0, wood);
      for (const side of [-1.8, 1.8]) this.box('viga', base, 0.35, 3.2, 0.56, side, 1.78, 0, wood);
    } else if (type === 'roof') {
      const roof = MeshBuilder.CreateCylinder('techo', { diameterTop: 0, diameterBottom: 6.2, height: 2.5, tessellation: 4 }, this.scene);
      roof.parent = base; roof.position.y = 4.45; roof.rotation.y = Math.PI / 4;
      roof.material = slate; roof.isPickable = false;
    } else if (type === 'post') {
      this.cyl('poste', base, 0.65, 3.3, 0, 1.65, 0, wood);
      this.ball('luz', base, 1.35, 0, 3.55, 0, ghost ? wood : this.mat('farol-luminoso', '#f8d47d', 0.7));
    }
    return base;
  }

  drawStructure(structure: Structure): void {
    if (this.built.has(structure.id)) return;
    const root = this.makeBuildMesh(structure.type, structure.x, structure.z, structure.rotation);
    this.built.set(structure.id, root);
  }

  beginPlacement(type: BuildType): void {
    if(!this.traversal.canBuild)return;
    this.cancelPlacement();
    const ghost = this.makeBuildMesh(type, this.plot.x, this.plot.z, 0, true);
    this.placement = { type, rotation: 0, ghost };
    this.callbacks.notify('Hacé clic dentro del Claro del Hogar para colocar. R para girar · Esc para salir.');
  }

  rotatePlacement(): void {
    if (!this.placement) return;
    this.placement.rotation = (this.placement.rotation + 1) % 4;
    this.placement.ghost.rotation.y = this.placement.rotation * Math.PI / 2;
  }

  cancelPlacement(): void {
    if (!this.placement) return;
    this.placement.ghost.dispose(false, false);
    this.placement = null;
    this.preview = null;
  }

  get isPlacing(): boolean { return this.placement !== null; }

  private refreshPreview(): void {
    const placing = this.placement;
    if (!placing) return;
    const zone = this.zones.get(this.store.state.zone)!;
    if (zone.id !== 'brisalia') { placing.ghost.setEnabled(false); return; }
    const hit = this.scene.pick(this.scene.pointerX, this.scene.pointerY, mesh => mesh.metadata?.terrainChunk === true);
    if (!hit?.hit || !hit.pickedPoint) { placing.ghost.setEnabled(false); this.preview = null; return; }
    const p = hit.pickedPoint;
    const x = this.plot.x + Math.round((p.x - zone.offset.x - this.plot.x) / 4) * 4;
    const z = this.plot.z + Math.round((p.z - zone.offset.z - this.plot.z) / 4) * 4;
    const allowed = this.store.canBuild(placing.type, x, z);
    placing.ghost.setEnabled(true);
    placing.ghost.position.set(x, this.y(zone, x, z) + 0.09, z);
    placing.ghost.rotation.y = placing.rotation * Math.PI / 2;
    const validMaterial = this.mat('fantasma-verde', '#76e7c5', 0.28, 0.56);
    const invalidMaterial = this.mat('fantasma-rojo', '#f17f70', 0.28, 0.56);
    placing.ghost.getChildMeshes().forEach(m => { m.material = allowed.ok ? validMaterial : invalidMaterial; });
    this.preview = { localX: x, localZ: z, type: placing.type, rotation: placing.rotation, valid: allowed.ok, message: allowed.message };
  }

  /** Nueva partida y relectura del guardado sin recargar el navegador. */
  refreshFromSave(): void {
    this.props.refreshFromSave();
    for (const zone of this.zones.values()) {
      for (const node of zone.nodes) {
        if (node.type === 'resource') { node.enabled = true; node.visual.setEnabled(true); }
      }
    }
    for (const object of this.built.values()) object.dispose(false, false);
    this.built.clear();
    for (const s of this.store.state.structures) this.drawStructure(s);
    this.activateZone(this.store.state.zone);
  }

  dispose(): void {
    this.engine.stopRenderLoop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.vegetation.dispose();
    this.props.dispose();
    this.geography.dispose();
    this.mainland.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
