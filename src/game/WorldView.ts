import { paintTerrainRoads } from '../world/materials/TerrainRoadPaint';
import { BrisaliaPalace } from '../world/palace/BrisaliaPalace';
import { PALACE_APPROACH, palaceWorld } from '../world/palace/PalaceSite';
import { BrisaliaVillage } from '../world/BrisaliaVillage';
import { audioSettings } from '../audio/AudioSettings';
import { installSceneLightBudget } from '../world/SceneLightBudget';
import { installGpuAssets } from '../world/GpuAssets';
import { SantiDoubleJumpFX } from './SantiDoubleJumpFX.js';
import { GroundSlamFX } from './GroundSlamFX.js';
import { captureImpactGround, type ImpactProbe } from './GroundImpactSurface';
import { WayfindingSystem } from '../world/WayfindingSystem';
import { brisaliaWayfinding } from '../world/wayfindingData';
import { installBrisaliaCherryTrees } from '../world/BrisaliaCherryTrees';
import { BRISALIA_BUILDINGS, CASTLE_BUILDING, BRISALIA_ROADS, BRISALIA_SCALE, brisaliaRoadEdge, distanceToRoad, inBrisaliaFootprint } from '../world/brisaliaLayout';
import { inNacarPalaceFootprint } from '../world/geography/NacarPalace';
import {
  ArcRotateCamera, ArcRotateCameraPointersInput, Color3, DirectionalLight, Engine, HemisphericLight,
  Mesh, MeshBuilder, Scene, SceneInstrumentation, StandardMaterial, TransformNode, Vector3,
  VertexBuffer, VertexData, PointLight, type AbstractMesh
} from '@babylonjs/core';
import type { ZoneId } from '../data/world';
import type { BuildType, MaterialId, Structure } from '../domain/types';
import { GameStore } from '../domain/GameStore';
import { anchorFor, buildingBlocksMove, buildingFloorAt, buildingHeadroom,
  footprint, nearestEdgeSide, type BuildObstacle, type BuildPlan } from '../domain/buildingRules';
import { BUILD_CATALOG, costAsText } from '../domain/recipes';
import { BuildVisuals } from '../world/building/BuildVisuals';
import { AuthoredWater } from '../world/editor/AuthoredWater';
import { AuthoredAssets } from '../world/editor/AuthoredAssets';
import { authoredAssetExclusions, blocksAuthoredMovement, surfaceWeightsAt, getWorldDocument } from '../world/editor/WorldEditState';
import type { RainSurface } from '../world/climate/RainFX.js';
import { terrainMaterialWeightsAt } from '../world/materials/TerrainMaterial';
import { TerrainStream } from '../world/TerrainStream';
import { applyLandscapeAtmosphere, LANDSCAPE_ATMOSPHERE_CONFIG } from '../world/LandscapeAtmosphere';
import { landscapeNameAt } from '../world/landscapeRegions';
import { EnvironmentSystem } from '../world/climate/EnvironmentSystem';
import { RareTornadoes } from '../world/climate/RareTornadoes';
import { tornadoBiome, type TornadoSurface } from '../world/climate/TornadoSchedule';
import type { ClimateFrame } from '../world/climate/ClimateModel';
import { LandscapeDebug } from '../world/LandscapeDebug';
import { FOLIAGE_FOREST } from '../world/foliageForestConfig';
import { installExpansionBiomeAssets } from '../world/expansionBiomeData';
import { GeographyStream } from '../world/GeographyStream';
import { MountainPassSystem } from '../world/MountainPassSystem';
import { LagoonSystem } from '../world/LagoonSystem';
import { GROTTO_WATER, grottoSurfaceAt, lagoonWaterAt } from '../world/lagoonData';
import { groundRoads, mountainTrailSurfaceAt } from '../world/mountainTrails';
import { setWorldWaterContacts } from '../world/editor/LiveWaterProfiles';
import { bridgeRailBlocks, bridgeSurfaceAt, tunnelSurfaceAt, MOUNTAIN_PORTALS } from '../world/mountainRoutes';
import { OceanWater } from '../world/water/OceanWater';
import { VegetationSystem } from '../world/VegetationSystem';
import { BirdFlockSystem } from '../world/wildlife/BirdFlockSystem';
import { birdRegionAllowsFlocks, woodlandBirdHabitatAllowed } from '../world/wildlife/BirdHabitatRules';
import { regionAt } from '../world/RegionCatalog';
import { GrassSectorSystem } from '../world/grass/GrassSectorSystem';
import { WorldPropSystem } from '../world/WorldPropSystem';
import { propsForChunk } from '../world/worldPropsData';
import { GEOLOGY_FORMATIONS, geologyLocal, geologyPoint, sameGeologyFormation } from '../world/geologyData';
import { selectRockPart } from '../world/rockPackData';
import { vegetationForChunk, type VegetationExclusion } from '../world/vegetationData';
import { bridgeDeckAt, isInlandWater, waterSurfaceAt } from '../world/geographicFeatures';
import { sampleRiverFlow } from '../world/water/riverFlow';
import { POINTS_OF_INTEREST, pointOfInterest } from '../world/pointsOfInterest';
import { createPointOfInterestView, createPlacedPointOfInterestView } from '../world/PointOfInterestView';
import { BIOME_NAMES, biomeAt, chunkOf, LANDMARKS, MAINLAND, isLand, sampleMainlandHeight } from '../world/terrainData';
import { cameraRelativeMovement } from './movement';
import { CharacterTraversalController, type ActionMotionKind,
  type TraversalWorld } from './CharacterTraversalController';
import { TRAVERSAL, type GroundHit } from './traversalRules';
import { terrainWallAt } from './TerrainTraversal';
import { CAMERA_TERRAIN, THIRD_PERSON_CAMERA, CameraObstructionProbe, cameraRadiusAfterCollision,
  cameraTerrainView, swimmingCameraOrbit } from './cameraTerrain';
import { nearTerrainHeightAt, nearTerrainSurfaceAt } from '../world/terrainLod';
import { GameTelemetry } from './GameTelemetry';
import { FrameWorkScheduler } from '../world/FrameWorkScheduler';
import { SantiCharacter } from './SantiCharacter';
import { AssetPlacementDebug } from './AssetPlacementDebug';
import { DogoCompanion } from './DogoCompanion';
import { CharacterShadows } from './CharacterShadows';
import { SANTI_COMBAT, combatInputForKey, type SantiActionName } from './SantiCatalog';
import { DoubleTapSprint } from './DoubleTapSprint';
import { SpeedMotionBlur } from './SpeedMotionBlur';
import { SantiSprintDust, type DustGround, type DustSurface } from './SantiSprintDust.js';
import { readRenderQuality, renderResolution, saveRenderQuality, type RenderQuality } from './renderResolution';
import { PlayableWorld, regionPoint } from '../world/geography/PlayableWorld';
import { findPlaceArrival, type PlayablePlace } from '../world/geography/PlayablePlaces';
import { GeographicPrefetch } from '../world/geography/GeographicPrefetch';
import { FloatingKingdoms } from '../world/geography/FloatingKingdoms';
import { LagoonVegetation } from '../world/geography/LagoonVegetation';
import { VolcanicCaveSystem } from '../world/VolcanicCaveSystem';
import { igneousFlag } from '../world/IgneousRealm';
import { VOLCANIC_CAVE } from '../world/volcanicCaveData';
import { AbilitySystem } from './abilities/AbilitySystem';
import { RootsSurfaceAdapter } from './abilities/RootsSurfaceAdapter';
import { FlameSurfaceAdapter } from './abilities/FlameSurfaceAdapter';
import { PROVISIONAL_SWORD_DAMAGE } from '../domain/abilities/forestRoots';

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

type BuildPreview = { localX: number; localZ: number; type: BuildType; rotation: number;
  valid: boolean; message: string; plan:BuildPlan|null };

type WorldCallbacks = {
  notify: (message: string) => void;
  dialogue: (name: string, text: string) => void;
  openCraft: () => void;
  hint: (message: string) => void;
  onTravel: (destination: ZoneId) => void;
  onBuild: (structure: Structure) => void;
  onStructureSelected:(structure:Structure|null)=>void;
  onExplore: (x: number, z: number, name: string, chunks: number) => void;
  onClimate: (frame: ClimateFrame) => void;
  onCameraHeading?: (radians: number) => void;
  onStartupProgress?: (progress:number,message:string) => void;
};

const TOWN_OFFSET = { x: 0, z: 0 };
const ISLAND_OFFSET = { x: -210, z: 420 };

/** Vista del mundo con terreno por chunks y vegetación GLB compartida. */
export class WorldView {
  readonly abilities:AbilitySystem;
  private abilityFocus=true;
  private floating:FloatingKingdoms|null=null;
  private ocean: OceanWater | null = null;
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  private readonly climate:EnvironmentSystem;
  private readonly unsubscribeAudio:()=>void;
  private readonly tornadoes:RareTornadoes;
  private climateSaveTimer=0;
  private climateHudTimer=0;
  private readonly zones = new Map<ZoneId, IslandInfo>();
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly built = new Map<string, TransformNode>();
  private readonly buildVisuals:BuildVisuals;
  private readonly buildObstacles:BuildObstacle[]=[];
  private selectedStructureId:string|null=null;
  private readonly pressed = new Set<string>();
  private readonly sprintTap=new DoubleTapSprint();
  private readonly speedMotionBlur:SpeedMotionBlur;
  private readonly sprintDust:SantiSprintDust;
  private readonly doubleJumpFX:SantiDoubleJumpFX;
  private readonly groundImpactFX:GroundSlamFX;
  private readonly attackBlade:Vector3[]=[];
  private sprintDustPaused=false;
  private player!: TransformNode;
  private playerBody!: TransformNode;
  private santi:SantiCharacter|null=null;
  private readonly assetPlacement=import.meta.env.DEV?new AssetPlacementDebug():null;
  private dogo:DogoCompanion|null=null;
  private readonly characterShadows:CharacterShadows;
  private attackSerial=0;
  private movementTime = 0;
  private interactTarget: Interactable | null = null;
  private previousHint = '';
  private placement: { type: BuildType; rotation: number; ghost: TransformNode } | null = null;
  private preview: BuildPreview | null = null;
  private readonly plot = { x: -29, z: 18, halfSize: 17 };
  private readonly mainland: TerrainStream;
  private readonly geography: GeographyStream;
  private readonly mountainPasses:MountainPassSystem;
  private readonly lagoon:LagoonSystem;
  private readonly volcanicCave:VolcanicCaveSystem;
  private igneousTransition=false;
  private waterContactTimer=0;
  private get insideUnderground(){return this.mountainPasses.inside||this.lagoon.inside||this.volcanicCave.inside;}
  private readonly vegetation: VegetationSystem;
  private readonly birds: BirdFlockSystem;
  private readonly grass: GrassSectorSystem;
  private readonly props: WorldPropSystem;
  private readonly authoredWater:AuthoredWater;
  private readonly authoredAssets:AuthoredAssets;
  private readonly lagoonVegetation:LagoonVegetation|null;
  private readonly traversal=new CharacterTraversalController();
  private jumpRequested=false;
  private airKickRequested=false;
  private lastSafePosition={x:1,z:10};
  private readonly vegetationExclusions: VegetationExclusion[] = [];
  private readonly rockVisualRequests:{root:TransformNode;partIndex:number;diameter:number;copper:boolean}[]=[];
  private readonly treeVisualRequests:{root:TransformNode;variant:number;height:number;harvestable:boolean}[]=[];
  private exploreTimer = 0;
  private saveTimer = 0;
  private lastBiome = "";
  private vegetationCenter = '';
  private readonly streamingWork=new FrameWorkScheduler();
  private grassStatsOverlay:HTMLDivElement|null=null;
  private grassInstrumentation:SceneInstrumentation|null=null;
  private landscapeDebug:LandscapeDebug|null=null;
  private telemetry:GameTelemetry|null=null;
  private grassStatsTimer=0;
  private cameraPreferredRadius:number=THIRD_PERSON_CAMERA.distance;
  private cameraAppliedRadius:number=THIRD_PERSON_CAMERA.distance;
  private sprintCameraOffset=0;
  private readonly cameraObstructionProbe=new CameraObstructionProbe();
  private readonly cameraLiftProbe=new CameraObstructionProbe();
  private cameraFrameDt=0;
  private readonly closeCameraMeshes=new Map<AbstractMesh,boolean>();
  private renderQuality=readRenderQuality();
  private placingMainland=false;
  readonly village:BrisaliaVillage;
  readonly brisaliaPalace:BrisaliaPalace|null;
  readonly wayfinding:WayfindingSystem;
  private geographyLoading=false;
  private geographyFailure:string|null=null;
  private readonly geographyPrefetch:GeographicPrefetch|null;
  private startupActive=false;
  private avatarLoad:Promise<void>=Promise.resolve();
  private companionLoad:Promise<void>=Promise.resolve();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: GameStore,
    private readonly callbacks: WorldCallbacks,
    private readonly blocked: () => boolean,
    readonly geographicWorld:PlayableWorld|null=null
  ) {
    this.startupActive=!!callbacks.onStartupProgress;
    this.geographyPrefetch=geographicWorld?new GeographicPrefetch(geographicWorld,geographicWorld.windowRadius):null;
    if(!geographicWorld)installExpansionBiomeAssets();
    if(geographicWorld){this.plot.x+=geographicWorld.town.x;this.plot.z+=geographicWorld.town.z;}
    // Resolution is managed explicitly, including browser zoom / monitor DPR
    // changes, so Babylon must not apply a second device-ratio adjustment.
    this.engine = new Engine(canvas, true, { antialias: true, adaptToDeviceRatio: false });
    if(geographicWorld)this.engine.maxFPS=this.renderQuality==='performance'?30:60;
    this.resize();
    this.scene = new Scene(this.engine);
    // Imports repeatedly change material/light flags. Batch that invalidation
    // while nothing is rendered, then refresh every material once at reveal.
    this.scene.blockMaterialDirtyMechanism=this.startupActive;
    // Orbit controls consume pointer coordinates, not mesh hover hits. Building
    // placement and selection already perform their own explicit scene.pick().
    this.scene.skipPointerMovePicking=true;
    installSceneLightBudget(this.scene);
    installGpuAssets(this.scene);
    applyLandscapeAtmosphere(this.scene);

    const hemi = new HemisphericLight('ambiente', new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.88;
    hemi.groundColor = new Color3(0.48, 0.55, 0.62);
    const sun = new DirectionalLight('sol', new Vector3(-0.5, -1.3, 0.55), this.scene);
    sun.intensity = 1.35;
    sun.diffuse = new Color3(1, 0.91, 0.76);
    this.characterShadows=new CharacterShadows(sun);

    this.camera = new ArcRotateCamera('camara-aventura', THIRD_PERSON_CAMERA.alpha, THIRD_PERSON_CAMERA.beta,
      THIRD_PERSON_CAMERA.distance, new Vector3(0, 3, 0), this.scene);
    this.camera.fov = THIRD_PERSON_CAMERA.fov;
    // Occlusion may need to pull the camera closer than the player's zoom limit.
    this.camera.lowerRadiusLimit = .25;
    this.camera.upperRadiusLimit = THIRD_PERSON_CAMERA.maxDistance;
    this.camera.lowerAlphaLimit = null;
    this.camera.upperAlphaLimit = null;
    this.camera.lowerBetaLimit = THIRD_PERSON_CAMERA.minBeta;
    this.camera.upperBetaLimit = THIRD_PERSON_CAMERA.maxBeta;
    this.camera.wheelPrecision = 32;
    this.camera.minZ = .15;
    this.camera.maxZ = LANDSCAPE_ATMOSPHERE_CONFIG.cameraFar;
    this.camera.panningSensibility = 0;
    this.camera.inertia = 0.42;
    this.camera.attachControl(canvas, true);
    const pointerInput=this.camera.inputs.attached.pointers as ArcRotateCameraPointersInput;
    pointerInput.angularSensibilityX=THIRD_PERSON_CAMERA.angularSensitivity;
    pointerInput.angularSensibilityY=THIRD_PERSON_CAMERA.angularSensitivity;
    this.climate=new EnvironmentSystem(this.scene,this.camera,sun,hemi,
      store.state.environment?.elapsedHours);
    this.unsubscribeAudio=audioSettings.subscribe(()=>this.climate.setAudioVolume(audioSettings.gain('ambience')));
    this.tornadoes=new RareTornadoes(this.scene,(x,z)=>this.tornadoSurfaceAt(x,z));
    // Las flechas se reservan para el personaje, no para orbitar la cámara.
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
    this.speedMotionBlur=new SpeedMotionBlur(this.camera,this.engine);
    this.sprintDust=new SantiSprintDust(this.scene,{intensity:2.8,scale:3.6,capacity:72,
      sampleGround:(x,z,y)=>this.sampleSprintDustGround(x,z,y)});
    this.doubleJumpFX=new SantiDoubleJumpFX(this.scene,{intensity:.9,scale:1});
    void this.doubleJumpFX.prepare().catch(error=>console.error('[Double jump FX]',error));
    this.groundImpactFX=new GroundSlamFX(this.scene,{intensity:1,radius:3.4,poolSize:2});
    void this.groundImpactFX.prepare().catch(error=>console.error('[Ground impact FX]',error));

    this.createSea();
    const continentRoot=new TransformNode('zona-brisalia',this.scene);
    continentRoot.position.set(TOWN_OFFSET.x,0,TOWN_OFFSET.z);
    this.zones.set('brisalia',{
      id:'brisalia',root:continentRoot,terrain:null,offset:new Vector3(0,0,0),
      radiusX:MAINLAND.radiusX,radiusZ:MAINLAND.radiusZ,spawn:geographicWorld?.spawn??{x:1,z:10},nodes:[]
    });
    this.mainland=new TerrainStream(this.scene,continentRoot,{},geographicWorld??undefined);
    this.geography=new GeographyStream(this.scene,continentRoot);
    this.mountainPasses=new MountainPassSystem(this.scene,continentRoot,
      (x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight),geographicWorld?.town);
    paintTerrainRoads(this.mainland.material,[...groundRoads(this.mountainPasses.trails),...(geographicWorld?[PALACE_APPROACH]:[])]);
    geographicWorld?.addVegetationRoutes([...this.mountainPasses.bridges,...this.mountainPasses.trails]);
    this.lagoon=new LagoonSystem(this.scene,continentRoot,
      (x,z)=>nearTerrainHeightAt(x,z,sampleMainlandHeight),geographicWorld?.lagoon);
    this.volcanicCave=new VolcanicCaveSystem(this.scene,
      (x,z)=>geographicWorld?.surface.heightAt(x,z)??nearTerrainHeightAt(x,z,sampleMainlandHeight),!!geographicWorld,true);
    this.volcanicCave.setEffectMeshes(this.groundImpactFX.meshes);
    const islandOffset=geographicWorld?.firefly??ISLAND_OFFSET;
    this.createZone('luciernagas', new Vector3(islandOffset.x, 0, islandOffset.z), 78, 65, { x: -3, z: -20 });
    this.placingMainland=!!geographicWorld;
    // Population functions retain local content coordinates and gameplay IDs.
    // The construction plot is already world-space; convert it just for authoring.
    if(geographicWorld){this.plot.x-=geographicWorld.town.x;this.plot.z-=geographicWorld.town.z;}
    this.populateMainland();
    if(geographicWorld){
      for(const node of this.zones.get('brisalia')!.nodes){node.localPosition.x+=geographicWorld.town.x;node.localPosition.z+=geographicWorld.town.z;}
      for(const e of this.vegetationExclusions){e.x+=geographicWorld.town.x;e.z+=geographicWorld.town.z;}
      this.plot.x+=geographicWorld.town.x;this.plot.z+=geographicWorld.town.z;
    }
    this.placingMainland=false;
    if(geographicWorld)this.vegetationExclusions.push({...geographicWorld.palace,
      radius:Math.hypot(CASTLE_BUILDING.width,CASTLE_BUILDING.depth)/2+2,excludeGrass:false,buildingId:'B28'});
    this.vegetationExclusions.push({...this.volcanicCave.entrance,radius:30});
    this.village=new BrisaliaVillage(this.scene,continentRoot,geographicWorld?.town??{x:0,z:0},
      (x,z)=>geographicWorld?.surface.heightAt(x,z)??sampleMainlandHeight(x,z),geographicWorld?.palace);
    this.brisaliaPalace=geographicWorld?new BrisaliaPalace(this.scene,continentRoot,geographicWorld.brisaliaPalace.groundHeight,this.characterShadows.generator):null;
    if(geographicWorld)this.vegetationExclusions.push({...palaceWorld(0,28),radius:150});
    const guideSites=brisaliaWayfinding(geographicWorld?.town??{x:0,z:0});
    this.wayfinding=new WayfindingSystem(this.scene,continentRoot,guideSites,
      (x,z)=>geographicWorld?.surface.heightAt(x,z)??sampleMainlandHeight(x,z));
    for(const s of guideSites){
      this.vegetationExclusions.push({x:s.at[0],z:s.at[1],radius:2.2});
      this.buildObstacles.push({x:s.at[0],z:s.at[1],radius:1.2,kind:'resource'});
    }
    this.populateFireflyIsland();
    if(geographicWorld)installBrisaliaCherryTrees(geographicWorld,[...this.vegetationExclusions,
      ...this.store.state.structures.map(footprint)]);
    this.createPlayer();
    this.wayfinding.addCharacter(this.player);
    for(const zone of this.zones.values())for(const node of zone.nodes)
      if(node.type==='npc')this.wayfinding.addCharacter(node.visual);
    const buildHeight=(x:number,z:number)=>geographicWorld?.surface.heightAt(x,z)??sampleMainlandHeight(x,z);
    this.buildVisuals=new BuildVisuals(this.scene,continentRoot,buildHeight);
    this.buildObstacles.push(...this.collectBuildObstacles());
    this.store.setBuildEnvironment(()=>({heightAt:buildHeight,
      obstacles:this.buildObstacles,player:this.traversal.position}));

    for (const s of store.state.structures) this.drawStructure(s,false);
    this.vegetation=new VegetationSystem(this.scene,continentRoot,()=>[
      ...this.vegetationExclusions,
      ...this.store.state.structures.map(footprint),
      ...authoredAssetExclusions()
    ]);
    this.grass=new GrassSectorSystem(this.scene,continentRoot,()=>[
      ...this.vegetationExclusions.filter(e=>
        (!geographicWorld||e.excludeGrass!==false)&&!(e.x===this.plot.x&&e.z===this.plot.z&&e.radius===24)),
      ...this.store.state.structures.map(footprint),
      ...authoredAssetExclusions()
    ]);
    this.props=new WorldPropSystem(this.scene,continentRoot,this.store,()=>[
      ...this.vegetationExclusions,
      ...this.store.state.structures.map(footprint),
      ...authoredAssetExclusions()
    ]);
    this.authoredWater=new AuthoredWater(this.scene,continentRoot);
    this.authoredWater.sync();
    this.authoredAssets=new AuthoredAssets(this.scene,continentRoot);
    this.birds=new BirdFlockSystem(this.scene,continentRoot,{
      ground:geographicWorld?(x,z)=>geographicWorld.heightAt(x,z):buildHeight,
      groundSpacing:geographicWorld?.meshSpacing,
      water:(x,z)=>waterSurfaceAt(x,z)?.level??null,
      habitatAllowed:(x,z)=>geographicWorld?
        woodlandBirdHabitatAllowed(x,z,geographicWorld.desertAt(x,z),geographicWorld.regions):
        birdRegionAllowsFlocks(regionAt(x,z).id),
      trees:(x,z,radius)=>[...this.vegetation.birdTrees(x,z,radius),...this.authoredAssets.birdTrees(x,z,radius)],
      foodAllowed:(x,z)=>buildHeight(x,z)>(this.geographicWorld?.seaLevel??MAINLAND.waterLevel)+.1&&
        !inBrisaliaFootprint(x-(this.geographicWorld?.town.x??0),z-(this.geographicWorld?.town.z??0))&&
        !(this.geographicWorld&&inNacarPalaceFootprint(x,z))&&
        !this.store.state.structures.some(s=>Math.hypot(s.x-x,s.z-z)<footprint(s).radius+1)&&
        !blocksAuthoredMovement(x,z)
    },readRenderQuality()==='performance');
    this.lagoonVegetation=geographicWorld?new LagoonVegetation(geographicWorld):null;
    void this.authoredAssets.sync();
    if(new URLSearchParams(window.location.search).has('landscapeDebug'))
      this.landscapeDebug=new LandscapeDebug(this.scene,this.engine,this.mainland,
        this.props,this.vegetation,this.grass,this.authoredAssets);
    void this.vegetation.load().then(()=>{
      for(const request of this.treeVisualRequests)
        this.vegetation.attachTreeVisual(request.root,request.variant,request.height,request.harvestable);
      this.treeVisualRequests.length=0;
    });
    void this.props.load().then(()=>{
      for(const request of this.rockVisualRequests){
        this.props.attachRockVisual(request.root,request.partIndex,request.diameter,request.copper);
      }
      this.rockVisualRequests.length=0;
    });
    const flameSurfaces=new FlameSurfaceAdapter(()=>this.traversalWorld(this.zones.get(store.state.zone)!),
      ()=>this.zones.get(store.state.zone)!.offset,(from,to)=>store.state.zone==='brisalia'&&!this.insideUnderground&&
        (blocksAuthoredMovement(to.x,to.z)||buildingBlocksMove(from.x,from.z,to.x,to.z,from.y-1.2,store.state.structures)));
    this.abilities=new AbilitySystem(this.scene,store,()=>this.santi,()=>{
      const zone=this.zones.get(store.state.zone)!,p=this.traversal.position;
      return {position:{x:p.x+zone.offset.x,y:p.y+zone.offset.y,z:p.z+zone.offset.z},
        scope:`${store.state.zone}:${this.floating?.id??''}:${this.volcanicCave.inside}:${this.lagoon.inside}:${this.mountainPasses.inside}`,
        playerState:this.traversal.mode,
        blocked:!this.abilityFocus||document.hidden?'Juego en pausa.':this.blocked()?'Cerrá el panel para activar.':
          this.assetPlacement?.capturesControls?'Cerrá el editor de assets.':this.placement?'Salí del modo construcción.':
          this.geographyLoading||this.geographyFailure||this.igneousTransition?'Esperá a que termine el viaje.':
          this.traversal.slopeSlideDirection?'Buscá suelo firme.':null};
    },new RootsSurfaceAdapter(()=>this.traversalWorld(this.zones.get(store.state.zone)!),
      ()=>this.zones.get(store.state.zone)!.offset,(x,z,y)=>{
        if(store.state.zone==='brisalia'&&!this.insideUnderground&&!this.floating?.id){
          if(buildingFloorAt(x,z,y+.1,store.state.structures)!==null||this.village.ground(x,z,y+.1,.3))return false;
        }
        return this.insideUnderground||!!this.floating?.id||y>(this.geographicWorld?.seaLevel??MAINLAND.waterLevel)+.05;
      },()=>PROVISIONAL_SWORD_DAMAGE),callbacks.notify,(origin,direction,length)=>flameSurfaces.trace(origin,direction,length));
    this.activateZone(store.state.zone);
    this.climate.configureRain((x,z)=>this.rainSurfaceAt(x,z),this.renderQuality==='performance'?'low':'medium');
    this.callbacks.onClimate(this.climate.frame);
    if(new URLSearchParams(window.location.search).has('grassStats')){
      this.grassInstrumentation=new SceneInstrumentation(this.scene);
      this.grassStatsOverlay=document.createElement('div');
      this.grassStatsOverlay.style.cssText='position:fixed;right:10px;bottom:10px;z-index:20;'+
        'padding:8px 10px;background:#10241bd9;color:#e9ffdb;font:12px monospace;'+
        'white-space:pre;pointer-events:none;border-radius:6px';
      document.body.appendChild(this.grassStatsOverlay);
    }

    if(new URLSearchParams(window.location.search).has('telemetry'))this.toggleTelemetry();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus',this.onFocus);
    document.addEventListener('visibilitychange',this.onVisibility);
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    let rainDocument=getWorldDocument(),rainBuildings=0;
    this.scene.onBeforeRenderObservable.add(()=>{
      const document=getWorldDocument(),buildings=this.village.surfaceRevision;
      if(document!==rainDocument||buildings!==rainBuildings)this.climate.invalidateRainSurfaces();
      rainDocument=document;rainBuildings=buildings;
      const paused=!this.abilityFocus||globalThis.document.hidden||this.blocked()||this.geographyLoading||!!this.geographyFailure||this.igneousTransition;
      if(this.geographyLoading||this.geographyFailure){this.climate.pauseRain(true);this.tornadoes.reset();return;}
      const start=this.telemetry?.recording?performance.now():0;
      this.updateCameraOcclusion(this.cameraFrameDt,this.zones.get(this.store.state.zone)!);
      // Evaluate immersion after the orbit/occlusion has placed the active camera.
      this.scene.activeCamera?.getViewMatrix(true);
      const collisionEnd=start?performance.now():0;
      this.climate.updatePrecipitation(this.cameraFrameDt,paused);
      this.tornadoes.update(this.cameraFrameDt,this.climate.frame,this.player.position,this.camera,
        this.store.state.zone==='brisalia'&&!!this.geographicWorld&&!this.insideUnderground&&!this.floating?.id,
        paused,this.renderQuality==='performance');
      const precipitationEnd=start?performance.now():0;
      if(this.volcanicCave.inside){
        // Interior coordinates lie below sea level. Clear the exterior water
        // depth pass before rendering so it cannot cover the dry arrival view.
        const eye=this.scene.activeCamera?.globalPosition??this.camera.position;
        this.lagoon.updateView(eye,this.player.position,null,this.player);
        this.speedMotionBlur.updateWaterSurface(this.cameraFrameDt,null);
        if(start)this.telemetry?.recordCamera(performance.now()-start,collisionEnd-start,precipitationEnd-collisionEnd);
        return;
      }
      const eye=this.scene.activeCamera?.globalPosition??this.camera.position;
      const surface=this.lagoon.inside?null:waterSurfaceAt(eye.x,eye.z);
      // Unnamed lowland pools already have a bed and an OceanWater surface,
      // but no inland field. Resolve that surface for immersion as well.
      const exterior=this.store.state.zone==='brisalia'&&!this.insideUnderground&&!this.floating?.id;
      const water=this.lagoon.inside?GROTTO_WATER:surface?.level??
        (exterior?this.geographicWorld?.oceanLevelAt(eye.x,eye.z):null);
      const flow=surface?sampleRiverFlow(eye.x,eye.z,surface.kind):null;
      // Lakes are level; rivers follow their own descending surface. Using a
      // horizontal lake plane for a sloped river creates a false blue horizon.
      const sloped=surface&&(surface.kind==='river'||surface.kind==='stream');
      const slopeX=sloped?((waterSurfaceAt(eye.x+1,eye.z)?.level??water!)-
        (waterSurfaceAt(eye.x-1,eye.z)?.level??water!))*.5:0;
      const slopeZ=sloped?((waterSurfaceAt(eye.x,eye.z+1)?.level??water!)-
        (waterSurfaceAt(eye.x,eye.z-1)?.level??water!))*.5:0;
      this.lagoon.updateView(eye,this.player.position,water??null,this.player);
      this.speedMotionBlur.updateWaterSurface(this.cameraFrameDt,water??null,
        flow?flow.directionX*flow.velocity:0,flow?flow.directionZ*flow.velocity:0,slopeX,slopeZ,
        !!this.geographicWorld&&!this.lagoon.inside&&!!this.geographicWorld.waterFieldAt(eye.x,eye.z));
      if(start)this.telemetry?.recordCamera(performance.now()-start,collisionEnd-start,precipitationEnd-collisionEnd);
    },-1,true); // Other materials consume the resolved atmosphere this frame.
    this.engine.runRenderLoop(() => {
      // Initial entry and explicit travel keep the previous image until the
      // destination has a complete horizon. Ordinary streaming never gates here.
      if(this.startupActive||this.geographyLoading||this.geographyFailure)return;
      this.telemetry?.beginFrame();
      const rawDt=this.engine.getDeltaTime()/1000;
      // The special attack uses simulation time: a slow frame must not erase
      // its impact or cancel the animation's pending ground-strike marker.
      if(rawDt>.25){this.sprintDust.reset();this.doubleJumpFX.reset();}
      const dt = Math.min(rawDt, 0.045);
      this.cameraFrameDt=dt;
      this.update(dt);
      this.telemetry?.endUpdate();
      this.scene.render();
      this.telemetry?.endRender();
      // ArcRotate alpha points from target to camera; map north is -Z.
      // Read after rendering so pointer input and camera inertia are included.
      this.callbacks.onCameraHeading?.(this.camera.alpha - Math.PI / 2);
      this.updateGrassStats(dt);
      this.telemetry?.endFrame(this.mainland.pendingCount,this.player.position.x,this.player.position.z,this.santi?.renderMeshes);
    });
  }

  /** Build the exact arrival terrain while the DOM loader is visible. Rendering
   * hundreds of hidden frames used to compete with this work and shader uploads. */
  async prepareStartup():Promise<void>{
    const next=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    const check=()=>{if(this.scene.isDisposed)throw new Error('Startup cancelled');
      if(this.geographyFailure)throw new Error(this.geographyFailure);};
    while(this.geographyLoading){check();await next();}check();
    performance.mark('auralia:horizon-ready');
    const p=this.traversal.position,total=Math.max(1,this.mainland.pendingCount);
    while(this.mainland.pendingCount){
      check();const deadline=performance.now()+12;
      do{this.mainland.update(p.x,p.z,0,0,Math.max(0,deadline-performance.now()));}
      while(this.mainland.pendingCount&&performance.now()<deadline);
      this.callbacks.onStartupProgress?.(58+25*(1-this.mainland.pendingCount/total),'Preparando el suelo y los caminos…');
      await next();
    }
    performance.mark('auralia:terrain-ready');
    this.vegetationCenter='';this.streamMainland(p.x,p.z,0);
    this.authoredAssets.update(p.x,p.z);
    this.callbacks.onStartupProgress?.(85,'Recibiendo a los habitantes de Brisalia…');
    await Promise.all([this.avatarLoad,this.companionLoad,this.village.ready,this.brisaliaPalace?.ensureNear(p.x,p.z)]);check();
    const recovery=this.village.entryRecoveryAt(p.x,p.y,p.z);
    if(recovery!==null){this.traversal.teleport(p.x,recovery,p.z);this.player.position.y=recovery;}
    performance.mark('auralia:residents-ready');
    this.callbacks.onStartupProgress?.(94,'Encendiendo los últimos faroles…');
    this.startupActive=false;
    // Compile and render the real scene before lifting the cover. The regular
    // frame budget resumes here; controls remain blocked by LoadingScreen.
    await new Promise<void>(resolve=>this.scene.onAfterRenderObservable.addOnce(()=>resolve()));
    await this.scene.whenReadyAsync();check();
    this.scene.blockMaterialDirtyMechanism=false;
    await new Promise<void>(resolve=>this.scene.onAfterRenderObservable.addOnce(()=>resolve()));
    this.pressed.clear();this.jumpRequested=false;this.airKickRequested=false;
    performance.mark('auralia:first-world-frame');
  }

  setRenderQuality(quality:RenderQuality):void{
    this.renderQuality=quality;
    if(this.geographicWorld)this.engine.maxFPS=quality==='performance'?30:60;
    saveRenderQuality(quality);
    this.climate.configureRain((x,z)=>this.rainSurfaceAt(x,z),quality==='performance'?'low':'medium');
    this.resize();
  }

  private readonly resize = ():void => {
    const {hardwareScalingLevel}=renderResolution(this.canvas.clientWidth||window.innerWidth,
      this.canvas.clientHeight||window.innerHeight,window.devicePixelRatio,this.renderQuality);
    if(Math.abs(this.engine.getHardwareScalingLevel()-hardwareScalingLevel)>1e-6)
      this.engine.setHardwareScalingLevel(hardwareScalingLevel);
    else this.engine.resize();
  };
  private readonly onBlur = () => {
    this.climate.pauseRain(true);
    this.resetMovementEffects();
    this.abilityFocus=false;this.abilities?.interrupt();this.traversal.setAttackHold(0);
    this.pressed.clear();this.sprintTap.reset();
    this.jumpRequested=false;this.airKickRequested=false;
    this.santi?.prepareCombat(this.store.state.equippedItem??'unarmed',false);
  };
  private readonly onFocus=()=>{this.abilityFocus=true;};
  private readonly onVisibility=()=>{if(document.hidden)this.onBlur();else this.onFocus();};
  private readonly onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if(key==='f8'){e.preventDefault();if(!e.repeat)this.toggleTelemetry();return;}
    if(key==='f9'&&this.assetPlacement){
      e.preventDefault();if(!e.repeat)this.assetPlacement.toggle();return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement || e.target instanceof HTMLElement&&e.target.isContentEditable) return;
    if(['x','t'].includes(key)){
      e.preventDefault();if(!e.repeat)this.abilities.request(key==='t');return;
    }
    if(key==='escape'){this.abilities.interrupt();this.traversal.setAttackHold(0);}
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
      'shift', 'e', 'r', 'q', 'f', ' '].includes(key)) e.preventDefault();
    this.pressed.add(key);
    if (e.repeat || this.blocked() || this.assetPlacement?.capturesControls || this.abilities.manager.controlLocked) return;
    if(key==='shift')this.sprintTap.press(performance.now());
    if(this.landscapeDebug?.handleKey(key)){e.preventDefault();return;}
    if(key===' '&&!this.placement)this.jumpRequested=true;
    if(!this.placement){
      const action=combatInputForKey(key,this.traversal.mode,this.traversal.jumpCount);
      if(action==='airKick')this.airKickRequested=true;
      if(action==='attack'){
        const equipped=this.store.state.equippedItem??'unarmed';
        this.santi?.requestAttack(equipped);
      }
      if(action==='sweep'&&this.santi?.playAction(SANTI_COMBAT.sweep))
        this.beginSantiActionMotion('sweep',SANTI_COMBAT.sweep);
      if(action==='roll'&&this.santi?.playAction(SANTI_COMBAT.roll))
        this.beginSantiActionMotion('roll',SANTI_COMBAT.roll);
    }
    if (key === 'e') this.interact();
    if (key === 'r' && this.placement) this.rotatePlacement();
    if (key === 'z' && !this.placement) this.undoLastPlacement();
  };
  private beginSantiActionMotion(kind:'sweep'|'roll',action:SantiActionName):void{
    if(!this.santi)return;
    const horizontal=Number(this.pressed.has('d')||this.pressed.has('arrowright'))-
      Number(this.pressed.has('a')||this.pressed.has('arrowleft'));
    const vertical=Number(this.pressed.has('w')||this.pressed.has('arrowup'))-
      Number(this.pressed.has('s')||this.pressed.has('arrowdown'));
    const desired=cameraRelativeMovement({x:-Math.cos(this.camera.alpha),
      z:-Math.sin(this.camera.alpha)},horizontal,vertical);
    const travel=this.traversal.groundTravelVelocity;
    const moving=Math.hypot(desired.x,desired.z)>1e-5||travel.speed>.5;
    const running=this.pressed.has('shift');
    const sprinting=running&&this.sprintTap.active;
    const speed=kind==='sweep'
      ?!moving?1.5:sprinting?13:running?10:6
      :travel.speed>.5?travel.speed:!moving?4:sprinting?27:running?19:11;
    const direction=travel.speed>.5
      ?{x:travel.x/travel.speed,z:travel.z/travel.speed}
      :Math.hypot(desired.x,desired.z)>1e-5?desired
      :{x:Math.sin(this.player.rotation.y),z:Math.cos(this.player.rotation.y)};
    this.traversal.beginActionMotion(kind,direction.x,direction.z,speed,
      this.santi.actionDuration(action));
  }
  private beginDirectedMotion(kind:ActionMotionKind,speed:number,duration:number):void{
    this.traversal.beginActionMotion(kind,
      Math.sin(this.player.rotation.y),Math.cos(this.player.rotation.y),speed,duration);
  }
  private readonly onKeyUp = (e: KeyboardEvent) => {
    const key=e.key.toLowerCase();
    this.pressed.delete(key);
    if(key==='shift')this.sprintTap.release();
  };
  private readonly onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || this.blocked() || !this.traversal.canBuild) return;
    if(!this.placement){
      const hit=this.scene.pick(this.scene.pointerX,this.scene.pointerY,
        mesh=>typeof mesh.metadata?.structureId==='string');
      const id=hit?.pickedMesh?.metadata?.structureId as string|undefined;
      this.selectedStructureId=id??null;
      this.callbacks.onStructureSelected(id?
        this.store.state.structures.find(s=>s.id===id)??null:null);
      return;
    }
    this.refreshPreview();
    if (!this.preview) return;
    if (!this.preview.valid) { this.callbacks.notify(this.preview.message); return; }
    const outcome = this.store.build(this.preview.type, this.preview.localX, this.preview.localZ, this.preview.rotation);
    if (outcome.ok && outcome.structure) {
      this.drawStructure(outcome.structure);
      this.selectedStructureId=null;
      this.callbacks.onStructureSelected(null);
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
    this.ocean = new OceanWater(this.scene, { waveStrength: .85, normalStrength: 1 });
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

  private y(zone: IslandInfo, x: number, z: number): number {
    if(this.placingMainland&&zone.id==='brisalia'){x+=this.geographicWorld!.town.x;z+=this.geographicWorld!.town.z;}
    return this.terrainHeight(x, z, zone);
  }
  private host(zone: IslandInfo, name: string, x: number, z: number): TransformNode {
    const root = new TransformNode(name, this.scene);
    root.parent = zone.root;
    const offset=this.placingMainland&&zone.id==='brisalia'?this.geographicWorld!.town:{x:0,z:0};
    root.position.set(x+offset.x, this.y(zone, x, z), z+offset.z);
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

  private tree(zone: IslandInfo, x: number, z: number, scale = 1, special = false,
    harvestable=false): TransformNode {
    if(zone.id==='brisalia')this.vegetationExclusions.push({x,z,radius:3.2*scale+2});
    const root = this.host(zone, 'arbol', x, z);
    const variant=Math.abs(Math.round(x*31+z*17))+(special?2:0);
    this.treeVisualRequests.push({root,variant,height:(harvestable?10:9)*scale,harvestable});
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

  private markInteraction(zone: IslandInfo, node: Interactable): void {
    zone.nodes.push(node);
    if(zone.id==='brisalia')this.vegetationExclusions.push({
      x:node.localPosition.x,z:node.localPosition.z,
      radius:node.type==='dock'?16:node.type==='lore'?9:node.type==='resource'?5:6
    });
    // Marca flotante que destaca interacciones para niños sin sobrecargar la escena.
    if(node.resource==='wood')return;
    const markerHeight = node.resource === 'spark' ? 5.2 :
      node.type === 'npc' ? 4.3 : node.type === 'dock' ? 4.8 : 3.5;
    const mark = this.ball(`marcador-${node.id}`, node.visual, 0.57, 0, markerHeight, 0,
      this.mat(node.type === 'dock' ? 'marca-navegacion' : 'marca-interactiva', node.type === 'dock' ? '#81e7ff' : '#f8de75', 0.6));
    mark.isPickable = false;
  }

  private resource(zone: IslandInfo, id: string, label: string, resource: MaterialId, amount: number, x: number, z: number): void {
    // Keep harvest IDs, but leave both parcels and their approach roads clear.
    if(zone.id==='brisalia')while(inBrisaliaFootprint(x,z,5)||
      BRISALIA_ROADS.some(road=>distanceToRoad(x,z,road)<road.width/2+5))z+=5;
    const visual = resource === 'wood' ? this.tree(zone, x, z, 0.8,false,true) :
      resource === 'spark' ? this.crystal(zone, x, z) : this.rock(zone, x, z, resource === 'copper');
    this.markInteraction(zone, {
      id, label, verb: resource==='wood'?'Talar árbol':`Recolectar ${label.toLowerCase()}`, type: 'resource',
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
    if(this.placingMainland&&this.geographicWorld){x=this.geographicWorld.dock.x-this.geographicWorld.town.x;z=this.geographicWorld.dock.z-this.geographicWorld.town.z;}
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
    for(const b of BRISALIA_BUILDINGS)this.vegetationExclusions.push({x:b.x,z:b.z+b.footprintOffsetZ,radius:Math.hypot(b.width,b.depth)/2+2,excludeGrass:false,buildingId:b.id});
    for(const r of BRISALIA_ROADS)for(let i=1;i<r.points.length;i++){
      const [ax,az]=r.points[i-1],[bx,bz]=r.points[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/3);
      for(let j=0;j<=n;j++)this.vegetationExclusions.push({x:ax+(bx-ax)*j/n,z:az+(bz-az)*j/n,radius:r.width/2+2,excludeGrass:false});
    }
    // Plaza del pueblo.
    this.vegetationExclusions.push({x:0,z:-65*BRISALIA_SCALE,radius:15*BRISALIA_SCALE,excludeGrass:false});

    // Parcela de construcción visible, sin obstáculos.
    const plot = this.host(zone, 'claro-del-hogar', this.plot.x, this.plot.z);
    this.vegetationExclusions.push({x:this.plot.x,z:this.plot.z,radius:24});
    const border = this.mat('piedra-parcela', '#dbb875');
    for (const v of [-17, 17]) {
      this.box('limite-x', plot, 35, 0.16, 0.45, 0, 0.13, v, border);
      this.box('limite-z', plot, 0.45, 0.16, 35, v, 0.13, 0, border);
    }
    const flag = this.cyl('banderin-parcela', plot, 0.3, 4, -15, 2, -15, this.mat('poste-bandera', '#976e46'));
    flag.rotation.z = 0.05;
    this.box('bandera', plot, 2.4, 1.2, 0.1, -13.8, 3.4, -15, this.mat('bandera', '#e0bd63'));

    // Bosques, recursos y rocas. Algunas instancias decorativas, otras recolectables.
    for (let i = 0; !this.geographicWorld && i < 26; i++) {
      const a = i * 2.399;
      const x = -52 + Math.cos(a) * (11 + (i % 5) * 3.5);
      const z = -4 + Math.sin(a) * (11 + (i % 6) * 4);
      if (Math.abs(x + 29) < 19 && Math.abs(z - 18) < 20) continue;
      if ((x/103)**2+(z/87)**2 > 0.6) continue;
      if(inBrisaliaFootprint(x,z,4)||BRISALIA_ROADS.some(r=>distanceToRoad(x,z,r)<5))continue;
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
    const table = this.host(zone, 'banco-carpinteria', -18*BRISALIA_SCALE, -59*BRISALIA_SCALE);
    this.box('mesa', table, 4.5, 0.35, 2.8, 0, 1.6, 0, this.mat('madera-taller', '#a66d3c'));
    for (const dx of [-1.8, 1.8]) for (const dz of [-1, 1]) this.cyl('pata', table, 0.38, 1.8, dx, 0.82, dz, this.mat('madera-patas', '#755136'));
    this.markInteraction(zone, {
      id: 'taller', label: 'Banco de trabajo', verb: 'Abrir recetas', type: 'workbench',
      localPosition: new Vector3(-18*BRISALIA_SCALE, 0, -59*BRISALIA_SCALE), visual: table, enabled: true
    });
    this.npc(zone, 'aro', 'Arlo, el carpintero', '¡Bienvenido a Brisalia! Recogé madera y piedra, fabricá un martillo y construí tu hogar en el claro marcado.', -18*BRISALIA_SCALE, -64*BRISALIA_SCALE, '#b25c45');
    this.npc(zone, 'mira', 'Mira, la herrera', 'En Altapiedra hay talleres inmensos. Por ahora, aprendé a reconocer el cobre en las rocas del valle.', 18*BRISALIA_SCALE, -59*BRISALIA_SCALE, '#4c7a9b');
    this.npc(zone, 'nilo', 'Nilo, el cartógrafo', 'El Mapa Vivo muestra tierras que todavía no conocemos. Las islas son las mejores escuelas para un explorador curioso.', 0, -76*BRISALIA_SCALE, '#6b8e54');
    this.dock(zone, 33, 120, 'luciernagas', 'Isla de las Luciérnagas');
    this.populateRegionOutposts(zone);
    this.populatePointsOfInterest(zone);
  }

  private collectBuildObstacles():BuildObstacle[]{
    const result:BuildObstacle[]=[];
    const nearPlot=(x:number,z:number)=>Math.abs(x-this.plot.x)<this.plot.halfSize+5&&
      Math.abs(z-this.plot.z)<this.plot.halfSize+5;
    for(const node of this.zones.get('brisalia')!.nodes)
      if((node.type==='resource'||node.type==='workbench'||node.type==='npc')&&
        nearPlot(node.localPosition.x,node.localPosition.z))
        result.push({x:node.localPosition.x,z:node.localPosition.z,radius:1.1,
          kind:'resource'});
    const plotCell=chunkOf(this.plot.x,this.plot.z);
    for(const cx of [plotCell.cx-1,plotCell.cx,plotCell.cx+1])for(const cz of [plotCell.cz-1,plotCell.cz,plotCell.cz+1]){
      for(const tree of vegetationForChunk(cx,cz,this.vegetationExclusions))
        if(tree.obstacleRadius&&nearPlot(tree.x,tree.z))
          result.push({x:tree.x,z:tree.z,radius:tree.obstacleRadius,kind:'tree'});
      for(const prop of propsForChunk(cx,cz,this.vegetationExclusions))
        if(nearPlot(prop.x,prop.z))result.push({x:prop.x,z:prop.z,
          radius:prop.worldRadius??(prop.rockDiameter??1)*.5,
          kind:prop.kind==='packRocas'?'rock':'resource'});
    }
    return result;
  }

  private populatePointsOfInterest(zone:IslandInfo):void {
    for(const place of POINTS_OF_INTEREST){
      if(MOUNTAIN_PORTALS.some(p=>p.id===place.id))continue;
      if(this.geographicWorld&&(place.kind==='waterfall'||place.id.startsWith('gruta-')))continue;
      if(place.kind==='dock')continue; // El muelle jugable ya existe y conserva su viaje.
      if(this.geographicWorld){
        const destination=this.geographicWorld.destination(place.id);if(!destination)continue;
        const visual=createPlacedPointOfInterestView(this.scene,zone.root,place,destination,
          (x,z)=>bridgeSurfaceAt(this.mountainPasses.bridges,x,z)?.height??this.geographicWorld!.surface.heightAt(x,z),
          this.mountainPasses.visualFor(destination.visualId??destination.id));
        // populateMainland translates interactions once, after all local content.
        this.markInteraction(zone,{id:place.id,label:destination.name,verb:`Examinar: ${destination.name}`,type:'lore',
          localPosition:new Vector3(destination.x-this.geographicWorld.town.x,0,destination.z-this.geographicWorld.town.z),
          visual,dialogue:place.dialogue,enabled:true});
        continue;
      }
      const visual=['laguna-tres-vertientes','gruta-mirador','gruta-bosque'].includes(place.id)
        ?new TransformNode(place.id,this.scene):this.mountainPasses.visualFor(place.id)??
        createPointOfInterestView(this.scene,zone.root,place,(x,z)=>this.y(zone,x,z));
      if(['laguna-tres-vertientes','gruta-mirador','gruta-bosque'].includes(place.id)){
        visual.parent=zone.root;visual.position.set(place.x,this.y(zone,place.x,place.z),place.z);
      }
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
    // Legacy lake outpost is replaced by the real Nacar region in the playable map.
    if(!this.geographicWorld){
    // LAGO DE LAS DOS ORILLAS
    for(const [x,z,color] of [[265,-205,'#5c90a3'],[285,-194,'#b96550'],[300,-160,'#a784c2']] as const)this.home(zone,x,z,color,.72);
    const pier=this.host(zone,'mirador-lago',250,-200);
    this.vegetationExclusions.push({x:250,z:-192,radius:20});
    for(let k=0;k<6;k++)this.box('pasarela-lago',pier,4.2,.3,3.2,0,.2,k*3,wood);
    landmark('nacar','Orilla de Nácar',245,-250,'Al otro lado del lago se fundará Nácar, una ciudad dedicada a la navegación y los intercambios.');
    for(let i=0;i<7;i++)this.resource(zone,`nacar-piedra-${i}`,'Piedra','stone',2,250+(i%4)*10,-265+Math.floor(i/4)*15);
    }
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
    const santi=new SantiCharacter(this.scene,this.player,undefined,this.assetPlacement);
    this.santi=santi;
    this.avatarLoad=santi.load().then(ready=>{
      if(ready&&this.santi===santi){
        this.playerBody.setEnabled(false);this.characterShadows.add(this.player);
        santi.onAbilityPose=()=>{this.sampleAbilityGroundImpact();this.abilities.afterPose();};
      }
    }).catch(error=>{
      if(this.santi===santi)console.warn('No se pudo cargar Santi; se conserva el personaje provisional.',error);
    });
    const dogo=new DogoCompanion(this.scene);
    this.dogo=dogo;
    this.companionLoad=dogo.load().then(()=>{
      if(this.dogo===dogo)this.characterShadows.add(dogo.root);
    }).catch(error=>{
      if(this.dogo===dogo){dogo.failure=String(error);console.warn('No se pudo cargar Dogo.',error);}
    });
  }

  activateZone(id: ZoneId): void {
    this.climate.resetRain();
    this.tornadoes.reset();
    this.resetMovementEffects();
    this.abilities?.resetScene();
    if(this.volcanicCave.inside)this.leaveVolcanicCave();
    if(this.floating?.id&&(id!=='brisalia'||!this.store.state.playerPosition?.realm))this.floating.clear();
    if(this.geographicWorld&&id==='brisalia'){
      const saved=this.store.state.playerPosition;
      if(saved?.realm&&this.floating?.id!==saved.realm){void this.travelFloating(saved.realm).catch(()=>{});return;}
      const p=saved?.zone==='brisalia'?saved:this.geographicWorld.spawn;
      if(!this.geographicWorld.isReady(this.geographicWorld.windowAt(p.x,p.z))||
        !this.mainland.hasHorizonAt(p.x,p.z)){
        void this.prepareGeography(p.x,p.z).then(()=>this.activateZone(id)).catch(()=>{});return;
      }
    }
    if(this.mountainPasses.inside)this.mountainPasses.leave(this.mountainPasses.returnPortal.id);
    if(this.lagoon.inside)this.lagoon.leave(this.lagoon.returnPortal.id);
    for(const zone of this.zones.values())zone.root.setEnabled(zone.id===id);
    this.cancelPlacement();
    const zone=this.zones.get(id)!;
    const previous=this.store.state.playerPosition;
    const saved=previous?.zone===id ? previous : null;
    const start=saved&&id==='brisalia'?this.safeSavedStart(saved.x,saved.z):saved??zone.spawn;
    let terrainY=id==='brisalia'?this.walkHeightAt(start.x,start.z):this.y(zone,start.x,start.z);
    if(this.geographicWorld&&id==='brisalia'&&!this.floating?.id){
      const water=waterSurfaceAt(start.x,start.z)?.level??this.geographicWorld.seaLevel;
      terrainY=Math.max(terrainY,water-1.25);
    }
    const floorY=id==='brisalia'?buildingFloorAt(start.x,start.z,terrainY+1,
      this.store.state.structures):null;
    this.player.position.set(zone.offset.x+start.x,Math.max(terrainY,floorY??terrainY),
      zone.offset.z+start.z);
    this.resetMovementEffects();this.traversal.teleport(start.x,this.player.position.y,start.z);
    this.lastSafePosition={x:start.x,z:start.z};
    this.jumpRequested=false;
    if(id==='brisalia')this.props.setColliderFocus(start.x,start.z,null);
    else {
      this.props.setColliderFocus(start.x,start.z,null);
      this.props.setActiveChunks([],start.x,start.z);
      this.grass.deactivate();
      this.vegetationCenter='';
    }
    if(id==='brisalia')this.streamMainland(start.x,start.z);
    this.interactTarget=null;
    this.camera.setTarget(this.player.position.add(
      new Vector3(0,THIRD_PERSON_CAMERA.targetHeight,0)),false,false,true);
    this.sendLocation();
  }

  /** Old saves have only X/Z; keep a saved foot out of a newly generated rock base. */
  private safeSavedStart(x:number,z:number):{x:number;z:number}{
    const fountainSafe=this.village.fountain.safeSavedPosition(x,z,TRAVERSAL.playerRadius);
    x=fountainSafe.x;z=fountainSafe.z;
    if(this.geographicWorld)return {x,z};
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

  private async prepareGeography(x:number,z:number):Promise<void>{
    if(!this.geographicWorld)return;
    this.tornadoes.reset();
    this.geographyLoading=true;this.geographyFailure=null;
    this.callbacks.hint('Cargando la región…');
    try{
      await this.geographicWorld.prepareAround(x,z);
      await this.brisaliaPalace?.ensureNear(x,z);
      await this.mainland.prepareHorizon(x,z,undefined,this.startupActive?
        (done,total)=>this.callbacks.onStartupProgress?.(28+30*done/Math.max(1,total),'Dibujando las montañas y el horizonte…'):undefined);
    }
    catch(error){this.geographyFailure=String(error);this.callbacks.notify(`No se pudo cargar la región: ${String(error)}`);throw error;}
    finally{this.geographyLoading=false;this.previousHint='';}
  }

  async travelGeographic(x:number,z:number,name='Nueva región',place?:PlayablePlace):Promise<void>{
    if(!this.geographicWorld)return;
    if(this.geographyLoading)return;
    this.pressed.clear();
    await this.prepareGeography(x,z);
    if(place){
      this.props.setColliderFocus(x,z,null);
      const collision=this.traversalWorld(this.zones.get('brisalia')!,this.geographicWorld.surface.heightAt(x,z),true);
      const arrival=findPlaceArrival(place,{
        town:this.geographicWorld.town,
        sample:(xx,zz)=>{
          const bridge=bridgeSurfaceAt(this.mountainPasses.bridges,xx,zz);
          return bridge?{height:bridge.height,slopeX:Math.sqrt(1/(bridge.normalY*bridge.normalY)-1),slopeZ:0}:
            this.geographicWorld!.surface.surfaceAt(xx,zz);
        },
        waterLevel:(xx,zz)=>this.geographicWorld!.waterAt(xx,zz)?.level??this.geographicWorld!.oceanLevelAt(xx,zz),
        clear:(xx,y,zz)=>{
          if(!collision.headroom(xx,y,zz,TRAVERSAL.playerHeight)||blocksAuthoredMovement(xx,zz))return false;
          for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])
            if(collision.wall?.(xx,y+1.2,zz,dx,dz,1.1))return false;
          return true;
        }
      });
      if(!arrival){
        this.props.setColliderFocus(this.player.position.x,this.player.position.z,null);
        this.callbacks.notify(`No hay un punto de llegada libre cerca de ${place.name}.`);return;
      }
      x=arrival.x;z=arrival.z;
    }
    // Keep interiors and floating geometry alive until the arrival is accepted.
    this.abilities.resetScene();
    if(this.volcanicCave.inside)this.leaveVolcanicCave();
    this.cancelPlacement();this.floating?.clear();
    if(this.mountainPasses.inside)this.mountainPasses.leave(this.mountainPasses.returnPortal.id);
    if(this.lagoon.inside)this.lagoon.leave(this.lagoon.returnPortal.id);
    if(this.store.state.zone!=='brisalia')this.store.travel('brisalia');
    this.store.setPlayerPosition('brisalia',x,z);
    this.activateZone('brisalia');
    this.callbacks.notify(`Explorando: ${name}`);
  }

  async travelFloating(id:string):Promise<void>{
    if(!this.geographicWorld||this.geographyLoading)return;
    const place=this.geographicWorld.destinations.find(p=>p.floating===id);if(!place)return;
    const saved=this.store.state.playerPosition;
    await this.travelGeographic(place.x,place.z,place.name);
    this.geographyLoading=true;
    try{
      this.floating??=new FloatingKingdoms(this.scene);
      const p=await this.floating.load(id);
      if(saved?.realm===id){
        const support=this.floating.colliders.queryGround(saved.x,saved.z,5000,10000,.33);
        if(support){p.x=saved.x;p.z=saved.z;p.y=support.height;}
      }
      await this.geographicWorld.prepareAround(p.x,p.z);
      await this.mainland.prepareHorizon(p.x,p.z);
      this.store.setPlayerPosition('brisalia',p.x,p.z,id);
      this.activateZone('brisalia');
      this.resetMovementEffects();this.traversal.teleport(p.x,p.y,p.z);this.player.position.set(p.x,p.y,p.z);
      this.camera.setTarget(this.player.position.add(new Vector3(0,2.05,0)),false,false,true);
      this.camera.alpha=-Math.PI/2;this.camera.beta=1.15;this.camera.radius=THIRD_PERSON_CAMERA.distance;
      this.cameraPreferredRadius=this.cameraAppliedRadius=THIRD_PERSON_CAMERA.distance;
    }catch(error){this.geographyFailure=String(error);this.callbacks.notify(String(error));throw error;}
    finally{this.geographyLoading=false;this.previousHint='';}
  }

  get geographicStatus(){return {loading:this.geographyLoading,failure:this.geographyFailure,
    source:this.geographicWorld?.id??'legacy',ready:!this.geographyLoading&&!this.geographyFailure&&(this.insideUnderground||this.mainland.pendingCount===0),
    position:{...this.traversal.position},mode:this.traversal.mode,terrain:this.mainland.statistics,
    sourceData:this.geographicWorld?.stats,avatarReady:this.santi?.isReady,vegetation:this.vegetation.instanceCount,grass:this.grass.instanceCount,
    resources:this.props.activeCrystalCount,waterChunks:this.geography.activeCount+this.geography.farActiveCount,
    lagoonInside:this.lagoon.inside,cave:this.volcanicCave.status,realm:this.floating?.id,hydrology:this.lagoon.hydrology.intensity,
    companion:this.dogo?.status,birds:this.birds.status,tornado:this.tornadoes.status};}

  get birdStatus(){return this.birds.status;}

  /** Desplazamiento de desarrollo: recorrer los biomas antes de crear las ciudades. */
  teleportToLandmark(id:string):void {
    if(this.geographicWorld){
      const destination=this.geographicWorld.destination(id);
      if(destination){const arrival=destination.arrival??destination;
        void (destination.floating?this.travelFloating(destination.floating):
          this.travelGeographic(arrival.x,arrival.z,destination.name,destination)).catch(()=>{});}
      return;
    }
    this.abilities.resetScene();
    if(this.volcanicCave.inside)this.leaveVolcanicCave();
    if(this.mountainPasses.inside)this.mountainPasses.leave(this.mountainPasses.returnPortal.id);
    if(this.lagoon.inside)this.lagoon.leave(this.lagoon.returnPortal.id);
    const point=LANDMARKS.find(p=>p.id===id)??pointOfInterest(id);
    if(!point)return;
    if(this.store.state.zone!=='brisalia')this.store.travel('brisalia');
    this.activateZone('brisalia');
    const y=this.walkHeightAt(point.x,point.z);
    this.player.position.set(point.x,y,point.z);
    this.resetMovementEffects();this.traversal.teleport(point.x,y,point.z);
    this.lastSafePosition={x:point.x,z:point.z};
    this.streamMainland(point.x,point.z);
    void this.authoredAssets.sync(point.x,point.z);
    if((id===FOLIAGE_FOREST.id||id===FOLIAGE_FOREST.flowerMeadow.id)&&!this.landscapeDebug)
      this.landscapeDebug=new LandscapeDebug(this.scene,this.engine,this.mainland,
        this.props,this.vegetation,this.grass,this.authoredAssets);
    this.camera.setTarget(this.player.position.add(
      new Vector3(0,THIRD_PERSON_CAMERA.targetHeight,0)),false,false,true);
    this.store.setPlayerPosition('brisalia',point.x,point.z);
    this.sendLocation();
    this.callbacks.notify(`Explorando: ${point.name}`);
  }

  private sendLocation():void {
    const zone=this.zones.get(this.store.state.zone)!;
    const x=this.player.position.x-zone.offset.x,z=this.player.position.z-zone.offset.z;
    const name=this.volcanicCave.inside?'Reino \u00cdgneo':this.lagoon.inside?'Gruta de las Vertientes':this.mountainPasses.inside?'Galerías de Ferragrís':
      zone.id==='brisalia'?(this.geographicWorld?
        (this.geographicWorld.destinations.find(p=>p.floating===this.floating?.id&&p.floating)?.name??
          this.geographicWorld.locationNameAt(x,z)):
        landscapeNameAt(x,z,BIOME_NAMES[biomeAt(x,z)])):'Isla de las Luciérnagas';
    if(this.lastBiome!==name){this.lastBiome=name;}
    this.callbacks.onExplore(x,z,name,zone.id==='brisalia'?this.mainland.activeCount:1);
    const swordLevel=this.store.swordLevel;
    if(zone.id==='brisalia'&&!this.insideUnderground)for(const place of this.geographicWorld?
      this.geographicWorld.destinations:POINTS_OF_INTEREST){
      if(Math.hypot(x-place.x,z-place.z)<place.discoverRadius)this.store.discoverPlace(place.id);
    }
    this.notifySwordEvolution(swordLevel);
  }

  private notifySwordEvolution(previousLevel:number):void{
    const level=this.store.swordLevel;
    if(level>previousLevel)this.callbacks.notify(`La Espada del Bosque Encantado evolucionó al nivel ${level}.`);
  }

  private walkHeightAt(x:number,z:number):number {
    if(this.floating?.id){const hit=this.floating.colliders.queryGround(x,z,5000,10000,.33);if(hit)return hit.height;}
    if(this.placingMainland){x+=this.geographicWorld!.town.x;z+=this.geographicWorld!.town.z;}
    return bridgeSurfaceAt(this.mountainPasses.bridges,x,z)?.height??
      (this.geographicWorld?null:bridgeDeckAt(x,z))??nearTerrainHeightAt(x,z,sampleMainlandHeight);
  }

  /** Runs only on a dust step (at most 9/s), using the controller's local support query. */
  private sampleSprintDustGround(worldX:number,worldZ:number,feetY:number):DustGround|null{
    const zone=this.zones.get(this.store.state.zone);
    // These authored realms do not yet expose a reliable surface material.
    if(!zone||this.volcanicCave.inside||this.floating?.id)return null;
    const x=worldX-zone.offset.x,z=worldZ-zone.offset.z;
    const world=this.traversalWorld(zone,feetY);
    const hit=world.ground(x,z,feetY+.4,.8,0);
    if(!hit)return null;
    const water=world.waterLevel?.(x,z);
    if(water!=null&&water>=hit.height-.02)return {...hit,surface:'water'};
    const weather=this.climate.frame.weatherMix;
    const wetness=this.insideUnderground?0:Math.min(1,weather.rain/.7);
    let surface:DustSurface=hit.surface??'stone';
    if(!hit.surface&&!this.insideUnderground){
      if(zone.id==='brisalia'){
        const town=this.geographicWorld?.town??TOWN_OFFSET;
        if(brisaliaRoadEdge(x-town.x,z-town.z)<=0)surface='dirt';
        else {
          const slope=Math.sqrt(Math.max(0,1/(hit.normalY*hit.normalY)-1));
          const weights=this.geographicWorld?.weightsAt(x,z,hit.height,slope)??
            surfaceWeightsAt(x,z,terrainMaterialWeightsAt(x,z,hit.height,slope));
          const materials:readonly DustSurface[]=['grass','dirt','stone','sand','snow','lava'];
          let dominant=0;
          for(let i=1;i<weights.length;i++)if(weights[i]>weights[dominant])dominant=i;
          surface=materials[dominant];
        }
      }else surface=Math.hypot(x/zone.radiusX,z/zone.radiusZ)>.69?'sand':'grass';
    }
    if(!this.insideUnderground&&weather.snow>.05)surface='snow';
    return {height:hit.height,normalY:hit.normalY,surface,wetness};
  }

  /** Only resident, open mainland terrain can host a rare weather event. */
  private tornadoSurfaceAt(x:number,z:number):TornadoSurface|null{
    const world=this.geographicWorld;
    if(!world||this.geographyLoading||this.insideUnderground||this.floating?.id||
      !this.mainland.coverageAt(x,z)||!world.isReady([x-16,z-16,x+16,z+16]))return null;
    const ground=world.surface.surfaceAt(x,z),weights=world.biomeWeights(x,z);
    const protectedArea=inBrisaliaFootprint(x-world.town.x,z-world.town.z,80)||
      Math.hypot(x-this.plot.x,z-this.plot.z)<80||
      world.destinations.some(p=>!p.floating&&Math.hypot(x-p.x,z-p.z)<Math.max(90,p.discoverRadius+50))||
      this.store.state.structures.some(s=>Math.hypot(x-s.x,z-s.z)<60);
    const biome=tornadoBiome({height:ground.height,
      waterLevel:world.waterAt(x,z)?.level??world.seaLevel,
      desert:world.desertAt(x,z),valley:weights.valle,coast:weights.costa,
      mountain:weights.sierras+weights.cumbres,trees:world.vegetationAt(x,z).trees,
      protected:protectedArea,roadClearance:world.vegetationClearanceAt(x,z)});
    return biome?{...ground,biome}:null;
  }

  /** Topmost loaded support in world coordinates, sampled only by the rain cache. */
  private rainSurfaceAt(x:number,z:number):RainSurface|null{
    if(this.insideUnderground||this.geographyLoading)return null;
    const zone=this.zones.get(this.store.state.zone)!,o=zone.offset,lx=x-o.x,lz=z-o.z;
    if(this.floating?.id){
      const hit=this.floating.colliders.queryGround(lx,lz,768-o.y,1024,0);
      return hit?{height:hit.height+o.y,kind:'ground'}:null;
    }
    let height:number,water:number|null=null;
    if(zone.id==='brisalia'){
      if(!this.mainland.coverageAt(lx,lz)||this.geographicWorld&&!this.geographicWorld.isReady([lx,lz,lx+.01,lz+.01]))return null;
      height=nearTerrainHeightAt(lx,lz,sampleMainlandHeight);
      water=waterSurfaceAt(lx,lz)?.level??(this.geographicWorld?.seaLevel??MAINLAND.waterLevel);
      const bridge=bridgeSurfaceAt(this.mountainPasses.bridges,lx,lz,768)?.height;
      const trail=mountainTrailSurfaceAt(this.mountainPasses.trails,lx,lz,768)?.height;
      const built=buildingFloorAt(lx,lz,768,this.store.state.structures);
      const roof=Math.max(this.village.rainHeight(x,z)??-Infinity,this.brisaliaPalace?.collision.rainHeight(x,z)??-Infinity);
      height=Math.max(height,bridge??-Infinity,trail??-Infinity,built??-Infinity,(roof??-Infinity)-o.y);
    }else{
      height=this.y(zone,lx,lz);
      if((lx/zone.radiusX)**2+(lz/zone.radiusZ)**2>1)water=0;
    }
    return water!==null&&water>height?{height:water+o.y,kind:'water'}:{height:height+o.y,kind:'ground'};
  }

  private traversalWorld(zone:IslandInfo,feetY=this.traversal.position.y,exterior=false):TraversalWorld{
    if(!exterior&&this.volcanicCave.inside)return this.volcanicCave.traversalWorld();
    if(!exterior&&this.floating?.id){
      const c=this.floating.colliders;
      return {
        ground:(x,z,origin,max,radius)=>{const h=c.queryGround(x,z,origin,max,radius);return h?{height:h.height,normalY:h.normal.y,rockId:h.rockId}:null;},
        wall:(x,y,z,dx,dz,reach)=>{const h=c.queryWall(x,y,z,dx,dz,reach);return h?{pointX:h.point.x,pointY:h.point.y,pointZ:h.point.z,distance:h.distance,normalX:h.normal.x,normalY:h.normal.y,normalZ:h.normal.z,rockId:h.rockId,climbable:h.climbable}:null;},
        solidTop:(x,z,origin,max,id)=>{const h=c.querySolidTop(x,z,origin,max,id);return h?{height:h.height,normalX:h.normal.x,normalZ:h.normal.z,rockId:h.rockId,centerX:h.centerX,centerZ:h.centerZ}:null;},
        headroom:(x,y,z,h,id)=>c.hasOverheadClearance(x,y,z,h,id),
        canMove:(x,z)=>!!c.queryGround(x,z,feetY+3,12,.33),
        fallbackHeight:()=>feetY
      };
    }
    const generated=this.lagoon.rockColliders;
    const generatedWall:TraversalWorld['wall']=(x,y,z,dx,dz,reach)=>{
      const hit=generated.queryWall(x,y,z,dx,dz,reach);
      return hit?{pointX:hit.point.x,pointY:hit.point.y,pointZ:hit.point.z,distance:hit.distance,
        normalX:hit.normal.x,normalY:hit.normal.y,normalZ:hit.normal.z,
        rockId:hit.rockId,climbable:hit.climbable}:null;
    };
    const generatedTop:TraversalWorld['solidTop']=(x,z,origin,max,id)=>{
      const hit=generated.querySolidTop(x,z,origin,max,id);
      return hit?{height:hit.height,normalX:hit.normal.x,normalZ:hit.normal.z,
        rockId:hit.rockId,centerX:hit.centerX,centerZ:hit.centerZ}:null;
    };
    if(!exterior&&this.lagoon.inside)return {
      ground:(x,z,origin,max,footRadius)=>{const s=grottoSurfaceAt(x,z);
        const rock=generated.queryGround(x,z,origin,max,footRadius);
        if(rock&&(!s||rock.height>s.height))return {height:rock.height,normalY:rock.normal.y,rockId:rock.rockId};
        return s&&s.height<=origin+.001&&s.height>=origin-max-.001?{height:s.height,normalY:s.normalY}:null;},
      waterLevel:(x,z)=>grottoSurfaceAt(x,z)?.height!<GROTTO_WATER?GROTTO_WATER:null,
      wall:generatedWall,solidTop:generatedTop,
      headroom:(x,y,z,h,id)=>{const s=grottoSurfaceAt(x,z,.5);
        return !!s&&y+h<s.ceiling&&generated.hasOverheadClearance(x,y,z,h,id);},
      canMove:(x,z)=>grottoSurfaceAt(x,z,.6)!==null,
      fallbackHeight:(x,z)=>grottoSurfaceAt(x,z)?.height??feetY
    };
    if(!exterior&&this.mountainPasses.inside)return {
      ground:(x,z,origin,max)=>{const s=tunnelSurfaceAt(x,z);
        return s&&s.height<=origin+.001&&s.height>=origin-max-.001?{height:s.height,normalY:s.normalY}:null;},
      wall:()=>null,solidTop:()=>null,
      headroom:(x,y,z,room)=>{const s=tunnelSurfaceAt(x,z,.5);return !!s&&y+room<s.ceiling;},
      canMove:(x,z)=>tunnelSurfaceAt(x,z,.6)!==null,
      fallbackHeight:(x,z)=>tunnelSurfaceAt(x,z)?.height??feetY
    };
    const isMainland=zone.id==='brisalia';
    // Walk and climb against the same visible near-LOD triangles. Sampling the
    // smooth generator between vertices can disagree about a crest's slope.
    // The cache lives for one controller step, so edits cannot leave stale
    // colliders and repeated probes reuse the same few grid corners.
    const wallGrid=new Map<string,number>();
    const gridHeight=(gx:number,gz:number)=>{
      const key=`${gx}:${gz}`;
      let value=wallGrid.get(key);
      if(value===undefined){value=sampleMainlandHeight(gx,gz);wallGrid.set(key,value);}
      return value;
    };
    const wallHeight=(x:number,z:number)=>nearTerrainHeightAt(x,z,gridHeight);
    const routeDeck=(x:number,z:number)=>isMainland?
      bridgeSurfaceAt(this.mountainPasses.bridges,x,z,feetY+2):null;
    const trailDeck=(x:number,z:number)=>isMainland?
      mountainTrailSurfaceAt(this.mountainPasses.trails,x,z,feetY+2):null;
    const height=(x:number,z:number)=>isMainland?
      routeDeck(x,z)?.height??trailDeck(x,z)?.height??(this.geographicWorld?null:bridgeDeckAt(x,z))??wallHeight(x,z):this.y(zone,x,z);
    return {
      // Prefab steps use source metres, calibrated to Santi's 1.40 m height.
      stepHeightAt:(x,z)=>isMainland&&this.village.entryStepHeightAt(x,z)!==null?this.village.entryStepHeightAt(x,z)!:
        isMainland&&(inBrisaliaFootprint(x-(this.geographicWorld?.town.x??0),
        z-(this.geographicWorld?.town.z??0),2)||!!this.geographicWorld&&inNacarPalaceFootprint(x,z,2))?
        Math.max(TRAVERSAL.stepHeight,.22*BRISALIA_SCALE):TRAVERSAL.stepHeight,
      waterLevel:(x,z)=>isMainland?(this.geographicWorld?waterSurfaceAt(x,z)?.level??
        (wallHeight(x,z)<this.geographicWorld.seaLevel?this.geographicWorld.seaLevel:null):lagoonWaterAt(x,z)?.level??null):null,
      ground:(x,z,originY,maxDistance,footRadius)=>{
        const terrainY=height(x,z);
        const newDeck=routeDeck(x,z)??trailDeck(x,z);
        const deck=newDeck?.height??(isMainland&&!this.geographicWorld?bridgeDeckAt(x,z):null);
        const d=.55;
        const surface=isMainland&&deck===null?nearTerrainSurfaceAt(x,z,gridHeight):null;
        const slope=deck!==null?newDeck?.normalY??1:surface?1/Math.hypot(1,surface.slopeX,surface.slopeZ):
          1/Math.hypot(1,(height(x+d,z)-height(x-d,z))/(2*d),
            (height(x,z+d)-height(x,z-d))/(2*d));
        const terrain:GroundHit|null=terrainY<=originY+.001&&terrainY>=originY-maxDistance-.001
          ?{height:terrainY,normalY:slope,surface:deck!==null?'wood':undefined}:null;
        const rock=isMainland?this.props.queryRockGround(x,z,originY,maxDistance,footRadius):null;
        const generatedRock=isMainland?generated.queryGround(x,z,originY,maxDistance,footRadius):null;
        const root=isMainland?this.vegetation.queryTreeGround(x,z,originY,maxDistance):null;
        const builtY=isMainland?buildingFloorAt(x,z,originY,this.store.state.structures):null;
        const built=builtY!==null&&builtY>=originY-maxDistance-.001?
          {height:builtY,normalY:1,surface:'paved' as const}:null;
        const village=isMainland?this.village.ground(x,z,originY,maxDistance):null;
        const palace=isMainland?this.brisaliaPalace?.collision.ground(x,z,originY,maxDistance):null;
        const surfaces=[palace?{...palace,surface:'paved' as const}:null,terrain,root?{...root,surface:'wood' as const}:null,built,
          village?{...village,surface:'paved' as const}:null,...[rock,generatedRock].map(hit=>hit?
          {height:hit.height,normalY:hit.normal.y,rockId:hit.rockId,surface:'stone' as const}:null)]
          .filter((hit):hit is NonNullable<typeof hit>=>hit!==null);
        return surfaces.reduce<typeof terrain>((highest,hit)=>
          !highest||hit.height>highest.height?hit:
            hit.height===highest.height&&hit.surface?{...highest,surface:hit.surface}:highest,null);
      },
      solidTop:(x,z,originY,maxDistance,rockId)=>{
        if(!isMainland)return null;
        const hit=this.props.queryRockSolidTop(x,z,originY,maxDistance,rockId);
        const procedural=generatedTop(x,z,originY,maxDistance,rockId);
        if(procedural&&(!hit||procedural.height>hit.height))return procedural;
        return hit?{height:hit.height,normalX:hit.normal.x,normalZ:hit.normal.z,
          rockId:hit.rockId,centerX:hit.centerX,centerZ:hit.centerZ}:null;
      },
      wall:(x,y,z,dx,dz,reach)=>{
        if(!isMainland)return null;
        const hit=this.props.queryRockWall(x,y,z,dx,dz,reach);
        const tree=this.vegetation.queryTreeWall(x,y,z,dx,dz,reach);
        const terrain=terrainWallAt(wallHeight,x,y,z,dx,dz,reach);
        const rock=hit?{pointX:hit.point.x,pointY:hit.point.y,pointZ:hit.point.z,
          distance:hit.distance,normalX:hit.normal.x,normalY:hit.normal.y,
          normalZ:hit.normal.z,rockId:hit.rockId,climbable:hit.climbable}:null;
        const trunk=tree?{
          pointX:tree.point.x,pointY:tree.point.y,pointZ:tree.point.z,
          distance:tree.distance,normalX:tree.normal.x,normalY:tree.normal.y,
          normalZ:tree.normal.z,rockId:tree.id,climbable:false
        }:null;
        let nearest=terrain;
        for(const wall of [rock,trunk,generatedWall(x,y,z,dx,dz,reach),this.village.wall(x,y,z,dx,dz,reach),this.brisaliaPalace?.collision.wall(x,y,z,dx,dz,reach)])
          if(wall&&(!nearest||wall.distance<nearest.distance))nearest=wall;
        return nearest;
      },
      headroom:(x,y,z,room,ignoreRockId)=>!isMainland||
        height(x,z)<=y+.08&&this.volcanicCave.exteriorHeadroom(x,y,z,room)&&this.village.headroom(x,y,z,room)&&(this.brisaliaPalace?.collision.headroom(x,y,z,room)??true)&&this.props.hasRockHeadroom(x,y,z,room,ignoreRockId)&&
        generated.hasOverheadClearance(x,y,z,room,ignoreRockId)&&
        buildingHeadroom(x,y,z,room,this.store.state.structures),
      sameSupport:sameGeologyFormation,
      canMove:(nextX,nextZ,fromX,fromZ,feetY)=>{
        // Collision samples the canonical height grid, independently of visual
        // LOD. A loaded coarse surface is traversable while detail refines.
        if(this.geographicWorld&&isMainland&&!this.mainland.canTraverse(nextX,nextZ))return false;
        const oldDeck=routeDeck(fromX,fromZ),nextDeck=routeDeck(nextX,nextZ);
        if(oldDeck&&!nextDeck&&feetY<oldDeck.height+1.8&&
          bridgeRailBlocks(oldDeck.route,nextX,nextZ))return false;
        if(nextDeck&&feetY>=nextDeck.height-2)return true;
        const elevated=feetY>height(fromX,fromZ)+4;
        const coastalRock=isMainland&&elevated&&!isLand(nextX,nextZ)
          ?this.props.queryRockGround(nextX,nextZ,feetY+1.8,3,.33):null;
        const canWalk=isMainland&&this.geographicWorld?true:isMainland?(isLand(nextX,nextZ)||
          !!coastalRock&&coastalRock.height>MAINLAND.waterLevel+1)&&
          (elevated||!!lagoonWaterAt(nextX,nextZ)||!isInlandWater(nextX,nextZ,sampleMainlandHeight(nextX,nextZ))):
          Math.sqrt((nextX/zone.radiusX)**2+(nextZ/zone.radiusZ)**2)<.80;
        const travel=Math.hypot(nextX-fromX,nextZ-fromZ);
        const houses=isMainland&&travel>0&&this.village.wall(fromX,feetY+1.2,fromZ,
          nextX-fromX,nextZ-fromZ,travel+.35)!==null;
        const palaceWall=isMainland&&travel>0&&this.brisaliaPalace?.collision.wall(fromX,feetY+1.2,fromZ,nextX-fromX,nextZ-fromZ,travel+.35);
        return canWalk&&!houses&&!palaceWall&&(!isMainland||!blocksAuthoredMovement(nextX,nextZ))&&
          (!isMainland||this.volcanicCave.canMoveOutside(nextX,nextZ,fromX,fromZ,feetY))&&
          (!isMainland||this.wayfinding.canMove(nextX,nextZ,fromX,fromZ,feetY))&&
          (!isMainland||elevated||!this.props.blocksMovement(nextX,nextZ,fromX,fromZ,false))&&
          (!isMainland||!buildingBlocksMove(fromX,fromZ,nextX,nextZ,feetY,
            this.store.state.structures));
      },
      fallbackHeight:height
    };
  }

  private streamMainland(x:number,z:number,budgetMs?:number,velocityX=0,velocityZ=0):void {
    if(this.lagoonVegetation?.ensure(x,z))this.authoredAssets.markDirty();
    if(this.floating?.id){
      if(this.grass.activeSectorCount||this.grass.pendingCount)this.grass.deactivate();
    }else this.grass.setFocus(x,z);
    const view=this.camera.getTarget().subtract(this.camera.position);
    if(this.geographicWorld)this.vegetation.setViewDirection(view.x,view.z);
    const changed=this.mainland.update(x,z,velocityX,velocityZ,budgetMs);
    const cell=chunkOf(x,z);
    const center=`${cell.cx}:${cell.cz}`;
    if(this.geographicWorld&&!changed&&center===this.vegetationCenter)this.vegetation.setActiveChunks([],x,z);
    if(changed||center!==this.vegetationCenter){
      this.vegetationCenter=center;
      const cells=this.mainland.activeCells;
      this.vegetation.setActiveChunks(cells,x,z);
      this.props.setActiveChunks(cells,x,z);
      this.geography.setActiveChunks(cells,x,z);
    }
  }

  private exitEmbeddedGeology(x:number,y:number,z:number):{x:number;y:number;z:number}|null{
    if(this.geographicWorld)return null;
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

  private resetMovementEffects():void{
    this.sprintDust.reset();this.doubleJumpFX.reset();
    this.groundImpactFX.reset();
  }

  private sampleAbilityGroundImpact():void{
    if(this.sprintDustPaused||!this.abilityFocus||this.blocked()||this.traversal.mode!=='grounded'||
      this.placement||this.geographyLoading||this.igneousTransition)return;
    const execution=this.abilities.manager.execution,marker='ground-slam';
    const strikeAt=execution?.definition.animation?.groundStrikeAt;
    if(!execution?.committed||strikeAt===undefined||execution.elapsed<strikeAt||execution.markers.has(marker))return;
    execution.markers.add(marker);
    if(!this.santi?.sampleAbilityBlade(this.attackBlade))return;
    const zone=this.zones.get(this.store.state.zone)!,o=zone.offset,world=this.traversalWorld(zone);
    const probe:ImpactProbe=(x,z,y,range)=>{
      const lx=x-o.x,lz=z-o.z,hit=world.ground(lx,lz,y-o.y+range*.5,range,0);
      if(!hit||!Number.isFinite(hit.height)||hit.normalY<.55)return null;
      const water=world.waterLevel?.(lx,lz);
      if(water!=null&&hit.height<=water+.05)return null;
      return {...hit,height:hit.height+o.y};
    };
    // Animation event, sampled after the rig: anchor the burst on support
    // beneath the striking blade. Shorter sword variants share this same slam.
    let point:{x:number;y:number;z:number}|null=null,clearance=Infinity;
    for(const blade of this.attackBlade){
      const support=probe(blade.x,blade.z,blade.y,3);if(!support)continue;
      const distance=Math.abs(blade.y-support.height);
      if(distance<clearance){clearance=distance;point={x:blade.x,y:support.height,z:blade.z};}
    }
    if(!point)return;
    const ground=captureImpactGround(point,Math.min(3.4,execution.profile.radius),probe);if(!ground)return;
    const stone=ground.surface==='stone'||ground.surface==='paved'||this.insideUnderground;
    const sand=!stone&&zone.id==='luciernagas';
    this.groundImpactFX.trigger(ground.point,ground.normal,{
      radius:ground.radius,intensity:1+.15*(execution.profile.level-1),sampleHeight:ground.sampleHeight,
      dustColor:stone?[.48,.46,.42]:sand?[.66,.57,.39]:[.52,.43,.32],
      earthColor:stone?[.29,.28,.26]:sand?[.48,.37,.22]:[.34,.24,.15],
      brightness:this.insideUnderground?.35:.28+.72*this.climate.frame.dayLight
    });
  }

  private update(dt: number): void {
    // Keep equipment in sync even when local collision streaming waits.
    // Testing a power/level must not force a weapon over the HUD selection.
    if(this.store.state.inventory.sword>0)
      this.santi?.prepareSword(this.abilities.visualSwordLevel as 1|2|3|4);
    this.santi?.setSwordLevel(this.abilities.equippedSwordLevel);
    const dustPaused=!this.abilityFocus||document.hidden||this.blocked()||this.geographyLoading||
      !!this.geographyFailure||this.igneousTransition;
    if(dustPaused&&!this.sprintDustPaused)this.resetMovementEffects();
    this.sprintDustPaused=dustPaused;
    if(this.geographyLoading||this.geographyFailure)this.birds.update(0,{
      focus:this.traversal.position,threats:[],night:0,rain:0,active:false,paused:true});
    this.abilities.update(dt,!this.abilityFocus||document.hidden||this.blocked()||this.geographyLoading||this.igneousTransition);
    if(this.geographyLoading||this.geographyFailure)return;
    this.lagoon.restoreAtmosphere();
    this.volcanicCave.restoreAtmosphere();
    this.climate.setSheltered(this.insideUnderground);
    const climateFrame=this.climate.update(dt);
    this.telemetry?.mark('clima');
    this.climateSaveTimer+=dt;
    this.climateHudTimer+=dt;
    if(this.climateHudTimer>=.5){
      this.callbacks.onClimate(climateFrame);
      this.climateHudTimer=0;
    }
    if(this.climateSaveTimer>=12){
      this.store.setEnvironmentTime(this.climate.elapsedHours);
      this.climateSaveTimer=0;
    }
    this.telemetry?.mark('ui');
    const zone=this.zones.get(this.store.state.zone)!;
    const controls=!this.blocked()&&!this.placement&&!this.igneousTransition&&this.abilityFocus&&
      !this.assetPlacement?.capturesControls&&!this.abilities.manager.controlLocked;
    const horizontal=controls?Number(this.pressed.has('d')||this.pressed.has('arrowright'))-
      Number(this.pressed.has('a')||this.pressed.has('arrowleft')):0;
    const vertical=controls?Number(this.pressed.has('w')||this.pressed.has('arrowup'))-
      Number(this.pressed.has('s')||this.pressed.has('arrowdown')):0;
    const forwardX=-Math.cos(this.camera.alpha),forwardZ=-Math.sin(this.camera.alpha);
    const direction=cameraRelativeMovement({x:forwardX,z:forwardZ},horizontal,vertical);
    const running=controls&&this.pressed.has('shift');
    const sprinting=running&&this.sprintTap.active;
    const streamSpeed=sprinting?27:running?19:11;
    const velocityX=direction.x*streamSpeed,velocityZ=direction.z*streamSpeed;
    if(this.geographicWorld&&zone.id==='brisalia'&&!this.insideUnderground){
      const p=this.traversal.position;
      this.geographyPrefetch?.update(p.x,p.z,velocityX,velocityZ);
      // Only absent local collision data requires waiting. Missing distant
      // sectors no longer pause movement, animation, or the streaming queue.
      if(!this.geographicWorld.isReady([p.x-12,p.z-12,p.x+12,p.z+12]))return;
    }
    this.santi?.prepareCombat(this.store.state.equippedItem??'unarmed',controls);
    const combat=this.santi?.combatState;
    this.traversal.setAttackHold(Math.max(combat?.remainingSeconds??0,this.abilities.manager.holdSeconds));
    if(combat&&combat.serial!==this.attackSerial){
      this.attackSerial=combat.serial;
      // Aim each new strike with WASD, then keep its planted feet and heading.
      if(Math.hypot(direction.x,direction.z)>1e-5)
        this.player.rotation.y=Math.atan2(direction.x,direction.z);
    }
    if(zone.id==='brisalia'&&!this.insideUnderground){
      this.props.setColliderFocus(this.traversal.position.x,
        this.traversal.position.z,this.traversal.supportRockId);
      this.vegetation.setColliderFocus(this.traversal.position.x,this.traversal.position.z);
    }
    const jumpPressed=controls&&this.jumpRequested;
    const airKickPressed=controls&&this.airKickRequested;
    const groundedBeforeStep=this.traversal.mode==='grounded';
    const actionDriven=this.traversal.actionMotionActive;
    const jumpsBeforeStep=this.traversal.jumpCount;
    const feetBeforeStep=this.traversal.position.y;
    if(zone.id==='brisalia'&&!this.insideUnderground&&!this.floating?.id){
      const p=this.traversal.position,recovery=this.village.entryRecoveryAt(p.x,p.y,p.z);
      if(recovery!==null)this.traversal.teleport(p.x,recovery,p.z);
    }
    const walking=this.traversal.step(dt,{
      moveX:direction.x,moveZ:direction.z,forwardX,forwardZ,
      horizontal,vertical,run:running,sprint:sprinting,
      jumpPressed,airKickPressed,
      swimVertical:controls&&this.pressed.has('control')?-1:0
    },this.traversalWorld(zone));
    this.jumpRequested=false;this.airKickRequested=false;
    if(this.mountainPasses.inside){
      const p=this.traversal.position,s=tunnelSurfaceAt(p.x,p.z);
      if(s)this.traversal.constrainCeiling(s.ceiling);
    }
    if(this.lagoon.inside){const p=this.traversal.position,s=grottoSurfaceAt(p.x,p.z);if(s)this.traversal.constrainCeiling(s.ceiling);}
    if(this.volcanicCave.inside){
      const p=this.traversal.position,ceiling=this.volcanicCave.ceilingAt(new Vector3(p.x,p.y,p.z));
      if(ceiling!==null)this.traversal.constrainCeiling(ceiling);
    }
    let {x:localX,y:localY,z:localZ}=this.traversal.position;
    if(zone.id==='brisalia'&&!this.insideUnderground&&this.traversal.mode==='grounded'&&!this.traversal.supportRockId){
      const exit=this.exitEmbeddedGeology(localX,localY,localZ);
      if(exit){
        this.resetMovementEffects();this.traversal.teleport(exit.x,exit.y,exit.z);
        localX=exit.x;localY=exit.y;localZ=exit.z;
      }
    }
    this.player.position.set(zone.offset.x+localX,localY,zone.offset.z+localZ);
    this.telemetry?.mark('movimiento');
    if(!this.volcanicCave.inside)this.wayfinding.update(climateFrame.night,this.player.position,dt);
    this.brisaliaPalace?.update(dt,this.player.position,climateFrame.night);
    this.village.lanterns.update(this.volcanicCave.inside?0:climateFrame.night,this.player.position,this.player,dt);
    this.village.fountain.update(dt,this.player.position,climateFrame.dayLight,
      zone.id==='brisalia'&&!this.insideUnderground,dustPaused);
    this.telemetry?.mark('ambiente');
    if(zone.id==='brisalia'&&!this.insideUnderground){
      this.props.setColliderFocus(localX,localZ,this.traversal.supportRockId);
      this.vegetation.setColliderFocus(localX,localZ);
    }
    const slopeSlide=this.traversal.slopeSlideDirection;
    if(slopeSlide||!actionDriven&&!this.traversal.airKickActive){
      const groundTravel=this.traversal.groundTravelVelocity;
      const movementIntent=Math.hypot(direction.x,direction.z)>1e-5;
      const groundFacing=groundTravel.speed>1e-5
        ?{x:groundTravel.x/groundTravel.speed,z:groundTravel.z/groundTravel.speed}:null;
      const facing=slopeSlide??this.traversal.climbFacing??this.traversal.airTravelDirection??
        this.traversal.swimTravelDirection??
        (this.traversal.rollCarryActive?groundFacing:
          movementIntent?direction:walking?groundFacing:null);
      if(facing){
        const yaw=Math.atan2(facing.x,facing.z);
        if(this.traversal.mode==='swimming'){
          const turn=yaw-this.player.rotation.y;
          this.player.rotation.y+=Math.atan2(Math.sin(turn),Math.cos(turn))*(1-Math.exp(-dt*8));
        }else this.player.rotation.y=yaw;
      }
    }
    if(!this.insideUnderground&&this.traversal.mode==='grounded'&&!this.traversal.supportRockId&&
      (zone.id!=='brisalia'||!GEOLOGY_FORMATIONS.some(formation=>{
        const local=geologyLocal(formation,localX,localZ);
        return Math.abs(local.along)<formation.length*.5+8&&
          local.across>-34&&local.across<30;
      })))
      this.lastSafePosition={x:localX,z:localZ};
    const doubleJumpStarted=(jumpPressed||airKickPressed)&&jumpsBeforeStep===1&&
      this.traversal.jumpCount===2;
    this.telemetry?.mark('movimiento');
    this.dogo?.update(dt,{
      x:localX,y:localY,z:localZ,heading:this.player.rotation.y,
      supported:this.traversal.mode==='grounded'||this.traversal.mode==='swimming',
      context:`${zone.id}:${this.floating?.id??''}:${this.lagoon.inside}:${this.mountainPasses.inside}:${this.volcanicCave.inside}:${this.volcanicCave.inside?this.volcanicCave.realm.checkpointId:''}`
    },this.traversalWorld(zone,this.dogo.follow.visible?this.dogo.follow.position.y:localY),zone.offset);
    this.telemetry?.mark('companero');
    const dog=this.dogo?.follow;
    this.characterShadows.update(this.player.position,dog?.visible?this.dogo!.root.position:undefined,!this.insideUnderground);
    this.grass.setCompanionContact(dog?.position.x??0,dog?.position.z??0,
      !!dog?.visible&&!this.floating?.id&&!this.insideUnderground&&zone.id==='brisalia');
    if(doubleJumpStarted)this.speedMotionBlur.triggerDoubleJump();
    if(!dustPaused){
      if(doubleJumpStarted&&!airKickPressed)this.doubleJumpFX.trigger(this.player.position,direction);
      this.doubleJumpFX.update(dt);
      this.groundImpactFX.update(dt);
    }
    const sprintVisual=sprinting&&walking&&
      this.traversal.mode==='grounded'&&!actionDriven&&
      Math.hypot(direction.x,direction.z)>1e-5;
    this.speedMotionBlur.update(dt,sprintVisual);
    if(!dustPaused)this.sprintDust.update({dt,position:this.player.position,sprinting:sprintVisual,
      grounded:this.traversal.mode==='grounded'});
    const sprintDistance=sprintVisual?THIRD_PERSON_CAMERA.sprintDistance:0;
    this.sprintCameraOffset+=(sprintDistance-this.sprintCameraOffset)*
      Math.min(1,dt*(sprintVisual?4:5));
    const contactWorld=this.traversalWorld(zone);
    const descending=this.traversal.mode==='airborne'&&localY<feetBeforeStep-.001;
    const landingGround=descending?contactWorld.ground(localX,localZ,localY+.1,1.6,
      TRAVERSAL.playerRadius*.55):null;
    const landing=this.santi?.update(dt,{
      mode:this.traversal.mode,moving:walking,
      movementIntent:Math.hypot(direction.x,direction.z)>1e-5,
      run:running,sprint:sprinting,
      groundGrade:this.traversal.groundGrade,
      swimPitch:this.traversal.swimPitch,
      sliding:slopeSlide!==null,
      slideGrade:slopeSlide?.grade,
      descending,groundDistance:landingGround?localY-landingGround.height:null,
      climbVertical:this.traversal.climbMotion.vertical,
      climbSide:this.traversal.climbMotion.side,
      climbContact:this.traversal.climbContact,
      mantleProgress:this.traversal.mantleProgress,
      backward:vertical<0&&horizontal===0,
      feetY:localY,
      takeoffY:feetBeforeStep,
      jumpStarted:groundedBeforeStep&&jumpPressed&&this.traversal.mode==='airborne',
      doubleJumpStarted,airKickStarted:doubleJumpStarted&&airKickPressed
    });
    this.santi?.updateGroundContact(dt,this.traversal.mode==='grounded',contactWorld,zone.offset);
    if(landing?.kind==='standing')
      this.beginDirectedMotion('landingHold',0,landing.duration-dt);
    else if(landing?.kind==='highFallRoll')
      this.beginDirectedMotion('landingRoll',8,landing.duration-dt);
    if(!this.santi?.isReady){
      this.movementTime+=dt*(walking?10:2.3);
      this.playerBody.position.y=this.traversal.mode==='grounded'
        ?walking?Math.sin(this.movementTime)*.11:Math.sin(this.movementTime)*.025:0;
      this.playerBody.rotation.z=this.traversal.mode==='climbing'?.08:0;
    }
    const swimming=this.traversal.mode==='swimming';
    const focusHeight=swimming?1.25:THIRD_PERSON_CAMERA.targetHeight;
    const target=Vector3.Lerp(this.camera.getTarget(),
      this.player.position.add(new Vector3(0,focusHeight,0)),
      Math.min(1,(swimming?12:7.5)*dt));
    // Do not leave the pivot above the swimmer while descending.
    target.y=swimming?this.player.position.y+focusHeight:
      Math.max(target.y,this.player.position.y+focusHeight);
    this.camera.setTarget(target,false,false,true);
    this.telemetry?.mark('personaje');
    if(!this.insideUnderground)this.ocean?.update(dt,this.player.position);
    this.telemetry?.mark('oceano');
    this.mountainPasses.update(localX,localY,localZ,dt);
    this.lagoon.update(dt,localX,localY,localZ,climateFrame);
    this.volcanicCave.syncExterior(localX,localZ,zone.id==='brisalia'&&!this.insideUnderground&&!this.floating?.id);
    const caveRecovery=this.volcanicCave.update(dt,this.player.position,
      this.dogo?[this.player,this.dogo.root]:[this.player],this.traversal.mode==='grounded',climateFrame.dayLight);
    if(this.volcanicCave.inside)this.store.setIgneousCheckpoint(this.volcanicCave.realm.checkpointId);
    if(caveRecovery){
      this.resetMovementEffects();this.traversal.teleport(caveRecovery.x,caveRecovery.y,caveRecovery.z);this.player.position.copyFrom(caveRecovery);
      this.camera.setTarget(caveRecovery.add(new Vector3(0,THIRD_PERSON_CAMERA.targetHeight,0)),false,false,true);
      this.callbacks.notify('Volviste a la última cornisa segura.');
    }
    this.waterContactTimer-=dt;
    if(this.waterContactTimer<=0){
      this.waterContactTimer=.25;
      setWorldWaterContacts(this.scene,zone.id==='brisalia'&&!this.insideUnderground
        ?this.props.waterContacts(localX,localZ,(x,z)=>waterSurfaceAt(x,z)?.level??null):[]);
    }
    this.telemetry?.mark('dinamica');
    this.birds.update(dt,{
      focus:{x:localX,y:localY,z:localZ},
      threats:[{x:localX,y:localY+1,z:localZ},...(this.dogo?.follow.visible?[this.dogo.root.position]:[])],
      night:climateFrame.night,rain:climateFrame.weatherMix.rain,
      active:zone.id==='brisalia'&&!this.insideUnderground&&!this.floating?.id,
      paused:dustPaused
    });
    this.telemetry?.mark('aves');
    if(zone.id==='brisalia'&&!this.insideUnderground){
      // Terrain gets a slice EVERY frame, ahead of optional scenery. Rotating
      // it with grass/props starved ground generation during sustained sprint.
      this.props.update(dt,false);
      this.telemetry?.mark('props');
      this.authoredWater.update(dt);
      this.geography.update(dt,0);
      this.telemetry?.mark('agua');
      const streamingStart=performance.now();
      this.streamMainland(localX,localZ,3,velocityX,velocityZ);
      this.telemetry?.mark('terreno');
      const remaining=(deadline:number)=>Math.max(0,deadline-performance.now());
      this.streamingWork.run([
        deadline=>{this.vegetation.update(remaining(deadline));this.telemetry?.mark('vegetacion');},
        deadline=>{this.grass.update(remaining(deadline));this.telemetry?.mark('pasto');},
        ()=>{this.props.update(0);this.telemetry?.mark('props');},
        ()=>{this.authoredAssets.update(localX,localZ);this.telemetry?.mark('assets');},
        deadline=>{this.geography.update(0,remaining(deadline));this.telemetry?.mark('agua');}
      ],Math.max(0,4-(performance.now()-streamingStart)));
      this.landscapeDebug?.update(dt,localX,localZ);
    }
    this.exploreTimer+=dt;
    this.saveTimer+=dt;
    if(this.exploreTimer>0.26){this.sendLocation();this.exploreTimer=0;}
    if(this.saveTimer>4 && walking&&!this.insideUnderground){
      this.store.setPlayerPosition(zone.id,this.lastSafePosition.x,this.lastSafePosition.z,this.floating?.id??undefined);this.saveTimer=0;
    }
    this.findNearest();
    if(this.placement)this.refreshPreview();
    this.telemetry?.mark('ui');
  }

  private updateCameraOcclusion(dt:number,zone:IslandInfo):void{
    const zoomChange=this.camera.radius-this.cameraAppliedRadius;
    if(Math.abs(zoomChange)>.001)this.cameraPreferredRadius=Math.max(THIRD_PERSON_CAMERA.minDistance,
      Math.min(THIRD_PERSON_CAMERA.maxDistance,this.cameraPreferredRadius+zoomChange));
    if(this.volcanicCave.inside){
      const t=this.camera.getTarget(),a=this.camera.alpha,b=this.camera.beta;
      const d=new Vector3(Math.cos(a)*Math.sin(b),Math.cos(b),Math.sin(a)*Math.sin(b));
      const preferred=Math.min(18,this.cameraPreferredRadius);
      const hit=this.volcanicCave.cameraObstruction(t,t.add(d.scale(preferred)));
      const safe=hit===null?preferred:Math.max(.25,hit-.7);
      this.camera.radius=cameraRadiusAfterCollision(this.camera.radius,safe,dt);
      this.hidePlayerForCloseCamera(this.camera.radius<1.6);
      this.cameraAppliedRadius=this.camera.radius;return;
    }
    this.hidePlayerForCloseCamera(false);
    const swimming=this.traversal.mode==='swimming';
    let preferred=this.cameraPreferredRadius;
    if(swimming){
      const p=this.player.position,water=this.lagoon.inside?GROTTO_WATER:this.geographicWorld?
        waterSurfaceAt(p.x,p.z)?.level??this.geographicWorld.seaLevel:lagoonWaterAt(p.x,p.z)?.level??null;
      const orbit=swimmingCameraOrbit(this.camera.getTarget().y,water,this.camera.beta,preferred);
      preferred=orbit.radius;this.camera.beta=orbit.beta;
    }
    if(this.lagoon.inside){
      const t=this.camera.getTarget(),a=this.camera.alpha,b=this.camera.beta;
      const d=new Vector3(Math.cos(a)*Math.sin(b),Math.cos(b),Math.sin(a)*Math.sin(b));
      let radius:number=CAMERA_TERRAIN.minRadius;
      for(let r=CAMERA_TERRAIN.minRadius;r<=preferred;r+=.25){const p=t.add(d.scale(r)),s=grottoSurfaceAt(p.x,p.z,.6);
        if(!s||p.y>s.ceiling-.6||p.y<s.height+.4)break;radius=r;}
      const hit=this.lagoon.rockColliders.queryCameraObstruction(t,t.add(d.scale(radius)),.45);
      if(hit!==null)radius=Math.min(radius,Math.max(.25,hit-.65));
      this.camera.radius=cameraRadiusAfterCollision(this.camera.radius,radius,dt);
      this.cameraAppliedRadius=this.camera.radius;return;
    }
    if(this.mountainPasses.inside){
      const target=this.camera.getTarget(),a=this.camera.alpha,b=this.camera.beta;
      const direction=new Vector3(Math.cos(a)*Math.sin(b),Math.cos(b),Math.sin(a)*Math.sin(b));
      let radius:number=CAMERA_TERRAIN.minRadius;
      for(let r=CAMERA_TERRAIN.minRadius;r<=Math.min(preferred,8);r+=.25){const p=target.add(direction.scale(r)),s=tunnelSurfaceAt(p.x,p.z,.7);
        if(!s||p.y>s.ceiling-.7||p.y<s.height+.5)break;radius=r;}
      this.camera.radius=cameraRadiusAfterCollision(this.camera.radius,radius,dt);
      this.cameraAppliedRadius=this.camera.radius;return;
    }
    const {alpha,beta}=this.camera;
    const radius=Math.min(THIRD_PERSON_CAMERA.maxDistance,
      (swimming?preferred:this.cameraPreferredRadius)+this.sprintCameraOffset);
    const direction=new Vector3(Math.cos(alpha)*Math.sin(beta),Math.cos(beta),
      Math.sin(alpha)*Math.sin(beta));
    const target=this.camera.getTarget();
    const gridHeights=new Map<string,number>();
    const groundAt=(x:number,z:number):number=>{
      const localX=x-zone.offset.x,localZ=z-zone.offset.z;
      const terrain=zone.id==='brisalia'
        ?nearTerrainHeightAt(localX,localZ,(gx,gz)=>{
          const key=`${gx}:${gz}`;
          let height=gridHeights.get(key);
          if(height===undefined){height=sampleMainlandHeight(gx,gz);gridHeights.set(key,height);}
          return height;
        })
        :this.y(zone,localX,localZ);
      return Math.max(terrain,this.traversal.mode==='swimming'?-Infinity:MAINLAND.waterLevel,zone.id==='brisalia'
        ?bridgeDeckAt(localX,localZ)??-Infinity:-Infinity);
    };
    let terrainView=swimming?{targetY:target.y,maxRadius:radius}:
      cameraTerrainView(target,direction,radius,groundAt,
        this.player.position.y+THIRD_PERSON_CAMERA.targetHeight);
    const focusY=this.player.position.y+THIRD_PERSON_CAMERA.targetHeight;
    if(!swimming&&terrainView.targetY>focusY+.03){
      const focus=new Vector3(target.x,focusY,target.z);
      const raised=new Vector3(target.x,terrainView.targetY,target.z);
      const ceiling=this.cameraLiftProbe.resolve(focus,raised,dt,()=>this.outdoorCameraObstruction(focus,raised));
      if(ceiling!==null){
        const cap=Math.max(focusY,focusY+ceiling-.35);
        terrainView=cameraTerrainView({x:target.x,y:Math.min(target.y,cap),z:target.z},
          direction,radius,groundAt,focusY,cap);
      }
    }
    if(swimming){
      // Shorten the orbit at the bank/bed; raising the target would lose the diver.
      for(let r=CAMERA_TERRAIN.minRadius;r<=radius;r+=.3){
        if(target.y+direction.y*r<groundAt(target.x+direction.x*r,target.z+direction.z*r)+.5){
          terrainView.maxRadius=Math.max(CAMERA_TERRAIN.minRadius,r-.3);break;
        }
      }
    }
    if(Math.abs(terrainView.targetY-target.y)>.001){
      target.y=terrainView.targetY;
      this.camera.setTarget(target,false,false,true);
    }
    const desired=target.add(direction.scale(Math.min(radius,terrainView.maxRadius)));
    const hit=this.cameraObstructionProbe.resolve(target,desired,dt,()=>this.outdoorCameraObstruction(target,desired));
    const obstruction=hit===null?Infinity:Math.max(CAMERA_TERRAIN.minRadius,hit-.65);
    const safe=Math.min(radius,obstruction,terrainView.maxRadius);
    this.camera.radius=cameraRadiusAfterCollision(this.camera.radius,safe,dt);
    this.cameraAppliedRadius=this.camera.radius;
  }

  private outdoorCameraObstruction(from:Vector3,to:Vector3):number|null{
    let nearest:number|null=null;
    for(const hit of [this.props.queryCameraObstruction(from,to),this.village.cameraObstruction(from,to),this.brisaliaPalace?.collision.cameraObstruction(from,to)??null,
      this.lagoon.rockColliders.queryCameraObstruction(from,to,.45),this.volcanicCave.exteriorCameraObstruction(from,to)])
      if(hit!==null&&(nearest===null||hit<nearest))nearest=hit;
    return nearest;
  }

  private hidePlayerForCloseCamera(hide:boolean):void{
    if(hide){
      for(const mesh of this.player.getChildMeshes()){
        if(!this.closeCameraMeshes.has(mesh))this.closeCameraMeshes.set(mesh,mesh.isVisible);
        mesh.isVisible=false;
      }
    }else if(this.closeCameraMeshes.size){
      for(const [mesh,visible] of this.closeCameraMeshes)if(!mesh.isDisposed())mesh.isVisible=visible;
      this.closeCameraMeshes.clear();
    }
  }

  private findNearest(): void {
    const zone = this.zones.get(this.store.state.zone)!;
    const playerLocal = this.player.position.subtract(zone.offset);
    const caveAction=zone.id==='brisalia'&&!this.lagoon.inside&&!this.mountainPasses.inside?this.volcanicCave.nearestAction(playerLocal):null;
    if(caveAction||this.volcanicCave.inside){
      this.interactTarget=null;
      const label=this.traversal.mode==='hanging'?'Colgando del borde · W subir · S o Espacio soltarse':
        this.traversal.mode==='mantling'?'Subiendo al borde...':
        this.igneousTransition?'Cargando el Reino Ígneo…':caveAction?'E · '+this.volcanicCave.actionLabel(caveAction):
          this.store.hasFirePower?'Reino Ígneo · Afinidad de fuego desbloqueada':'Reino Ígneo · Descendé hacia el lago y el Bastión';
      if(label!==this.previousHint){this.previousHint=label;this.callbacks.hint(label);}return;
    }
    const aquatic=zone.id==='brisalia'?this.lagoon.nearestPortal(playerLocal.x,playerLocal.y,playerLocal.z):null;
    if(aquatic||this.lagoon.inside){
      this.interactTarget=null;
      const label=aquatic?`E · ${this.lagoon.inside?'Salir por':'Explorar'} ${aquatic.name}`:
        'Gruta de las Vertientes · Seguí las balizas · Espacio alterna inmersión / superficie';
      if(label!==this.previousHint){this.previousHint=label;this.callbacks.hint(label);}return;
    }
    const portal=zone.id==='brisalia'?this.mountainPasses.nearestPortal(playerLocal.x,playerLocal.y,playerLocal.z):null;
    if(portal||this.mountainPasses.inside){
      this.interactTarget=null;
      const label=portal?`E · ${this.mountainPasses.inside?'Salir por':'Entrar en'} ${portal.name}`:
        'Galerías de Ferragrís · Seguí las balizas · Hay tres salidas y una cámara de cristales';
      if(label!==this.previousHint){this.previousHint=label;this.callbacks.hint(label);}return;
    }
    const palaceDoor=this.brisaliaPalace?.nearestDoor(this.player.position);
    if(palaceDoor&&this.traversal.canInteract){
      const label=`E · ${palaceDoor.open?'Cerrar':'Abrir'} puerta`;this.interactTarget=null;
      if(label!==this.previousHint){this.previousHint=label;this.callbacks.hint(label);}return;
    }
    const palaceAction=zone.id==='brisalia'&&this.traversal.canInteract?this.brisaliaPalace?.nearestInteraction(this.player.position):null;
    if(palaceAction){
      const label=`E · ${palaceAction.verb}`;this.interactTarget=null;
      if(label!==this.previousHint){this.previousHint=label;this.callbacks.hint(label);}return;
    }
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
      'WASD mover · Espacio salto ×2 · Q combo / patada aérea · F barrida · R roll · V equipo · E usar';
    const palaceRoom=!nearest&&zone.id==='brisalia'?this.brisaliaPalace?.roomAt(this.player.position):null;
    if(palaceRoom)label=`Palacio · ${palaceRoom.name} · E para usar puertas cercanas`;
    if(this.traversal.mode==='swimming')label=`WASD nadar · Shift rápido · Espacio ${this.traversal.swimSubmerged?'volver a la superficie':'sumergirse'}${this.geographicWorld?' · Ctrl descender':''}`;
    else if(this.traversal.mode==='hanging')label='Colgando del borde · W subir · S o Espacio soltarse';
    else if(this.traversal.mode==='climbing')label='W/S trepar · A/D moverse · Espacio soltarse';
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

  canOpenPanel():boolean{return this.traversal.canInteract||this.abilities.manager.controlLocked;}

  /** Development access and normal portal share the same deferred load and real controller. */
  async enterIgneousRealm(checkpoint?:string,development=false):Promise<void>{
    if(this.igneousTransition)return;
    this.abilities.resetScene();
    this.igneousTransition=true;this.callbacks.notify('Cargando el Reino Ígneo…');
    try{
      // Initial activateZone may still be preparing the saved exterior region.
      while(this.geographyLoading)await new Promise(resolve=>window.setTimeout(resolve,50));
      if(development&&this.geographicWorld){
        await this.travelGeographic(this.volcanicCave.entrance.x,this.volcanicCave.entrance.z,'Volcán Ígneo');
        this.volcanicCave.syncExterior(this.volcanicCave.entrance.x,this.volcanicCave.entrance.z);
      }
      const next=await this.volcanicCave.enter(this.store.state.discoveredPlaces??[],checkpoint??this.store.state.igneousCheckpoint??'A0');
      this.zones.get('brisalia')!.root.setEnabled(false);this.climate.setSheltered(true);
      this.store.discoverPlace(VOLCANIC_CAVE.id);
      this.placeAtIgneousPortal(next,true);this.callbacks.notify('Reino Ígneo · Seguí el descenso hacia el lago.');
    }catch(error){this.callbacks.notify('No se pudo cargar el Reino Ígneo: '+String(error));throw error;}
    finally{this.igneousTransition=false;}
  }
  private placeAtIgneousPortal(next:Vector3,entering:boolean):void{
    this.lastSafePosition=entering?{x:this.volcanicCave.entrance.x,z:this.volcanicCave.entrance.z+6}:{x:next.x,z:next.z};
    this.pressed.clear();this.jumpRequested=false;this.airKickRequested=false;
    this.resetMovementEffects();this.traversal.teleport(next.x,next.y+.06,next.z);this.player.position.set(next.x,next.y+.06,next.z);
    this.camera.alpha=entering?Math.PI/2:-Math.PI/2-VOLCANIC_CAVE.entranceYaw;
    this.camera.setTarget(next.add(new Vector3(0,THIRD_PERSON_CAMERA.targetHeight,0)),false,false,true);
    this.store.setPlayerPosition('brisalia',this.lastSafePosition.x,this.lastSafePosition.z);this.sendLocation();
  }

  private leaveVolcanicCave():Vector3{
    const next=this.volcanicCave.leave();this.zones.get('brisalia')!.root.setEnabled(true);
    this.climate.setSheltered(false);return next;
  }

  interact(): void {
    if(!this.blocked()&&!this.placement&&this.traversal.canInteract&&this.brisaliaPalace?.nearestDoor(this.player.position)){
      if(!this.brisaliaPalace.toggleDoor(this.player.position))this.callbacks.notify('Alejate un paso de la hoja para cerrar la puerta.');return;
    }
    if(this.abilities.manager.controlLocked)return;
    if(this.store.state.zone==='brisalia'&&!this.blocked()&&!this.placement&&this.traversal.canInteract){
      const action=this.brisaliaPalace?.nearestInteraction(this.player.position);
      if(action){if(action.kind==='craft')this.callbacks.openCraft();else this.callbacks.dialogue(action.title,action.text!);return;}
    }
    if(this.store.state.zone==='brisalia'&&!this.blocked()&&!this.placement&&this.traversal.canInteract&&
      !this.lagoon.inside&&!this.mountainPasses.inside){
      const p=this.player.position,action=this.volcanicCave.nearestAction(p);
      if(this.igneousTransition)return;
      if(action==='enter'){void this.enterIgneousRealm().catch(()=>{});return;}
      if(action==='exit'){
        const next=this.leaveVolcanicCave();this.placeAtIgneousPortal(next,false);
        this.callbacks.notify('Regresaste a la ladera del volcán.');return;
      }
      if(action){
        const id=igneousFlag(action);
        if(action==='cristal')this.store.awakenFirePower();
        else this.store.discoverPlace(id);
        this.volcanicCave.realm.setFlags(this.store.state.discoveredPlaces??[]);
        const discovery=this.volcanicCave.realm.meta.discoveries.find(d=>d.lugar===action);
        this.callbacks.notify(action==='cristal'?'El Cristal del Reino Ígneo te reconoce. ¡Afinidad de fuego desbloqueada!':
          discovery?.recompensa??(action==='reja_abierta'?'La reja de la sima está abierta.':'El torno del Bastión está activado.'));
        return;
      }
      if(this.volcanicCave.inside)return;
    }
    if(this.store.state.zone==='brisalia'&&!this.blocked()&&!this.placement){
      const p=this.traversal.position,portal=this.lagoon.nearestPortal(p.x,p.y,p.z);
      if(portal){
        const entering=!this.lagoon.inside,next=entering?this.lagoon.enter(portal.id):this.lagoon.leave(portal.id);
        if(next){this.pressed.clear();this.jumpRequested=false;this.airKickRequested=false;
          this.resetMovementEffects();this.traversal.teleport(next.x,next.y,next.z);this.player.position.copyFrom(next);
          this.camera.setTarget(next.add(new Vector3(0,2.05,0)));
          this.callbacks.notify(entering?'Gruta de las Vertientes: atravesá el sifón y buscá las dos salidas.':portal.name);
          if(!portal.submerged){const exit=this.geographicWorld?regionPoint(this.geographicWorld.lagoon,portal.x,portal.z):portal;
            this.lastSafePosition={x:exit.x,z:exit.z};this.store.setPlayerPosition('brisalia',exit.x,exit.z);}
        }return;
      }
    }
    if(this.store.state.zone==='brisalia'&&!this.blocked()&&!this.placement&&this.traversal.canInteract){
      const p=this.traversal.position,portal=this.mountainPasses.nearestPortal(p.x,p.y,p.z);
      if(portal){
        const entering=!this.mountainPasses.inside;
        const next=entering?this.mountainPasses.enter(portal.id):this.mountainPasses.leave(portal.id);
        if(next){
          this.pressed.clear();this.jumpRequested=false;this.airKickRequested=false;
          this.resetMovementEffects();this.traversal.teleport(next.x,next.y,next.z);this.player.position.copyFrom(next);
          this.camera.setTarget(next.add(new Vector3(0,THIRD_PERSON_CAMERA.targetHeight,0)));
          this.store.discoverPlace(portal.id);
          const exit={x:portal.x+(this.geographicWorld?.town.x??0),z:portal.z+(this.geographicWorld?.town.z??0)};
          this.store.setPlayerPosition('brisalia',exit.x,exit.z);
          this.lastSafePosition=exit;this.sendLocation();
          this.callbacks.notify(entering?'Entraste en las Galerías de Ferragrís. Buscá sus otras salidas.':portal.name);
        }return;
      }
    }
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
      if(node.id==='hito-ecos'){
        const swordLevel=this.store.swordLevel;
        this.store.discoverPlace(node.id);
        this.notifySwordEvolution(swordLevel);
      }
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

  drawStructure(structure: Structure,refresh=true): void {
    if (this.built.has(structure.id)) return;
    const root = structure.legacy||!structure.anchor||structure.baseY===undefined?
      this.makeBuildMesh(structure.type,structure.x,structure.z,structure.rotation):
      this.buildVisuals.fromStructure(structure);
    root.getChildMeshes().forEach(mesh=>{
      mesh.isPickable=true;
      mesh.metadata={...mesh.metadata,structureId:structure.id};
    });
    this.built.set(structure.id, root);
    if(refresh)this.syncBuildExclusions();
  }

  private syncBuildExclusions():void{
    this.climate.invalidateRainSurfaces();
    this.grass?.refreshExclusions();
    this.vegetation?.refreshExclusions();
  }

  beginPlacement(type: BuildType): void {
    if(this.geographicWorld&&(this.geographyLoading||this.floating?.id||
      !this.geographicWorld.isReady([this.plot.x-40,this.plot.z-40,this.plot.x+40,this.plot.z+40]))){
      this.callbacks.notify('Viajá al Claro del Hogar en Brisalia para construir.');return;}
    if(this.insideUnderground){this.callbacks.notify('La parcela de construcción está en Brisalia.');return;}
    if(!this.traversal.canBuild)return;
    this.cancelPlacement();
    const x=this.plot.x,z=this.plot.z;
    const ghost=this.buildVisuals.create(type,{x,z,rotation:0,
      anchor:anchorFor(type,x,z),baseY:this.geographicWorld?nearTerrainHeightAt(x,z,sampleMainlandHeight):sampleMainlandHeight(x,z)},undefined,true);
    this.placement = { type, rotation: 0, ghost };
    this.buildVisuals.setGridVisible(true);
    this.selectedStructureId=null;
    this.callbacks.onStructureSelected(null);
    this.callbacks.notify('Hacé clic dentro del Claro del Hogar para colocar. R para girar · Esc para salir.');
  }

  rotatePlacement(): void {
    if (!this.placement) return;
    if(this.placement.type==='floor'||this.placement.type==='foundation'||
      this.placement.type==='post')return;
    this.placement.rotation = (this.placement.rotation + 1) % 4;
    this.refreshPreview();
  }

  cancelPlacement(): void {
    if (!this.placement){
      this.selectedStructureId=null;
      this.callbacks.onStructureSelected(null);
      return;
    }
    this.placement.ghost.dispose(false, false);
    this.placement = null;
    this.preview = null;
    this.buildVisuals.setGridVisible(false);
    this.buildVisuals.setAnchor(null,false);
  }

  get isPlacing(): boolean { return this.placement !== null; }

  private refreshPreview(): void {
    const placing = this.placement;
    if (!placing) return;
    const zone = this.zones.get(this.store.state.zone)!;
    if (zone.id !== 'brisalia') { placing.ghost.setEnabled(false); return; }
    const hit = this.scene.pick(this.scene.pointerX,this.scene.pointerY,
      mesh=>mesh.metadata?.terrainChunk===true||
        typeof mesh.metadata?.structureId==='string');
    if (!hit?.hit || !hit.pickedPoint) {
      placing.ghost.setEnabled(false);this.buildVisuals.setAnchor(null,false);
      this.preview = null; return;
    }
    const p = hit.pickedPoint;
    const x=p.x-zone.offset.x,z=p.z-zone.offset.z;
    const isEdge=['wall','stone-wall','metal-wall','door-wall','window-wall'].includes(placing.type);
    const rotation=isEdge?(nearestEdgeSide(x,z)+placing.rotation)%4:placing.rotation;
    const allowed = this.store.canBuild(placing.type, x, z, rotation);
    const plan=allowed.plan??{x,z,rotation,anchor:anchorFor(placing.type,x,z,rotation),
      baseY:this.geographicWorld?nearTerrainHeightAt(x,z,sampleMainlandHeight):sampleMainlandHeight(x,z)};
    placing.ghost.setEnabled(true);
    placing.ghost.position.set(plan.x,plan.baseY,plan.z);
    placing.ghost.rotation.y=plan.rotation*Math.PI/2;
    this.buildVisuals.setPreviewValid(placing.ghost,allowed.ok);
    this.buildVisuals.setAnchor(plan,allowed.ok);
    const cost=BUILD_CATALOG.find(item=>item.type===placing.type)?.requires;
    this.callbacks.hint(`${allowed.ok?'✓':'✕'} ${allowed.message}  ·  ${cost?costAsText(cost):''}  ·  R girar · Esc cancelar`);
    this.preview = { localX:x,localZ:z,type:placing.type,rotation,
      valid:allowed.ok,message:allowed.message,plan };
  }

  removeSelected():void{
    if(!this.selectedStructureId)return;
    const result=this.store.removeStructure(this.selectedStructureId);
    this.callbacks.notify(result.message);
    if(!result.ok||!result.structure)return;
    this.built.get(result.structure.id)?.dispose(false,false);
    this.built.delete(result.structure.id);
    this.selectedStructureId=null;
    this.callbacks.onStructureSelected(null);
    this.syncBuildExclusions();
  }

  replaceSelected(type:BuildType):void{
    if(!this.selectedStructureId)return;
    const result=this.store.replaceWall(this.selectedStructureId,type);
    this.callbacks.notify(result.message);
    if(!result.ok||!result.structure)return;
    this.built.get(result.structure.id)?.dispose(false,false);
    this.built.delete(result.structure.id);
    this.drawStructure(result.structure);
    this.callbacks.onStructureSelected(result.structure);
  }

  undoLastPlacement():void{
    const result=this.store.undoLastBuild();
    this.callbacks.notify(result.message);
    if(!result.ok||!result.structure)return;
    this.built.get(result.structure.id)?.dispose(false,false);
    this.built.delete(result.structure.id);
    this.selectedStructureId=null;
    this.callbacks.onStructureSelected(null);
    this.syncBuildExclusions();
  }

  /** Nueva partida y relectura del guardado sin recargar el navegador. */
  refreshFromSave(): void {
    this.abilities.reloadSave();
    this.climate.setElapsedHours(this.store.state.environment?.elapsedHours??9);
    this.callbacks.onClimate(this.climate.frame);
    this.climateSaveTimer=0;
    this.props.refreshFromSave();
    for (const zone of this.zones.values()) {
      for (const node of zone.nodes) {
        if (node.type === 'resource') { node.enabled = true; node.visual.setEnabled(true); }
      }
    }
    for (const object of this.built.values()) object.dispose(false, false);
    this.built.clear();
    for (const s of this.store.state.structures) this.drawStructure(s,false);
    this.syncBuildExclusions();
    this.selectedStructureId=null;
    this.callbacks.onStructureSelected(null);
    this.cancelPlacement();
    this.activateZone(this.store.state.zone);
  }

  private toggleTelemetry():void{
    if(this.telemetry){this.telemetry.toggleVisibility();return;}
    this.telemetry=new GameTelemetry(this.scene,this.engine,()=>({
      zone:this.store.state.zone,near:this.mainland.activeCount,mid:this.mainland.activeMidCount,
      far:this.mainland.activeFarCount,vegetation:this.vegetation.instanceCount,
      vegetationLod:this.vegetation.farInstanceCount,grass:this.grass.instanceCount,
      grassSectors:this.grass.activeSectorCount,secondaryDynamics:{...this.mountainPasses.secondaryDynamics.metrics},rain:this.climate.rainStats
    }));
  }

  private updateGrassStats(dt:number):void{
    if(!this.grassStatsOverlay)return;
    this.grassStatsTimer+=dt;
    if(this.grassStatsTimer<.5)return;
    this.grassStatsTimer=0;
    this.grassStatsOverlay.textContent=
      `FPS ${this.engine.getFps().toFixed(0)}  Draw calls ${this.grassInstrumentation?.drawCallsCounter.current??0}\n`+
      `Césped ${this.grass.instanceCount} matas  ~${this.grass.triangleCount} triángulos\n`+
      `Terreno ${this.mainland.activeCount} chunks  Césped ${this.grass.activeSectorCount} sectores`;
  }

  dispose(): void {
    this.unsubscribeAudio();
    this.tornadoes.dispose();
    this.geographyPrefetch?.dispose();
    this.birds.dispose();
    this.abilities.dispose();
    window.removeEventListener('focus',this.onFocus);
    document.removeEventListener('visibilitychange',this.onVisibility);
    this.volcanicCave.dispose();
    this.wayfinding.dispose();
    this.brisaliaPalace?.dispose();
    this.village.dispose();
    this.floating?.dispose();this.geographicWorld?.dispose();
    this.engine.stopRenderLoop();
    this.speedMotionBlur.dispose();
    this.sprintDust.dispose();
    this.doubleJumpFX.dispose();
    this.groundImpactFX.dispose();
    this.santi?.dispose();
    this.assetPlacement?.dispose();
    this.characterShadows.dispose();
    this.santi=null;
    this.dogo?.dispose();this.dogo=null;
    this.telemetry?.dispose();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.authoredAssets.dispose();
    this.authoredWater.dispose();
    this.vegetation.dispose();
    this.grass.dispose();
    this.buildVisuals.dispose();
    this.grassInstrumentation?.dispose();
    this.landscapeDebug?.dispose();
    this.grassStatsOverlay?.remove();
    this.props.dispose();
    this.geography.dispose();
    this.mountainPasses.dispose();
    this.lagoon.dispose();
    this.ocean?.dispose();
    this.climate.dispose();
    this.mainland.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
