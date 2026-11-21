"use strict";

// Reusable Babylon PBR plugin. Crust rafts move more slowly than the liquid;
// heat, erosion and detached chips have independent motion.
const LavaRocosa = (() => {
  const defaults = Object.freeze({speed: .32, erosion: .88, width: 12, length: 44,
    scale: 1, heat: 1.3, edges: true, normalY: -1, rockDarkness: .8, crustSpeed: .52,
    falling: false, worldScale: 1, worldOriginY: 0});

  function apply(B, scene, material, settings = {}) {
    const options = {...defaults, ...settings};
    const maps = [settings.rockTexture ?? material.albedoTexture, material.emissiveTexture,
      material.bumpTexture, material.metallicTexture];
    if (maps.some(map => !map)) throw Error("La lava necesita roca, control, normales/altura y rugosidad.");
    maps[2].hasAlpha=true; // Height is packed in the normal atlas alpha channel.
    const decode = maps[1].gammaSpace;
    const clock = {time: 0, paused: false};
    const control = {
      options,
      setTime(seconds) { clock.time = Number(seconds); },
      pause(value = true) { clock.paused = Boolean(value); },
      status() { const {rockTexture,...values}=options;return {version: 3, time: clock.time, paused: clock.paused, ...values}; }
    };
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!clock.paused) clock.time += Math.min(scene.getEngine().getDeltaTime(), 100) / 1000;
    });
    const vertex = {
      CUSTOM_VERTEX_DEFINITIONS: "varying vec2 vLavaUV;",
      CUSTOM_VERTEX_MAIN_END: "vLavaUV = uv;"
    };
    const fragment = {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        varying vec2 vLavaUV;
        uniform sampler2D lavaRock;
        uniform sampler2D lavaField;
        uniform sampler2D lavaRelief;
        uniform sampler2D lavaRough;
        float lavaHash(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float lavaNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(lavaHash(i),lavaHash(i+vec2(1.0,0.0)),f.x),
            mix(lavaHash(i+vec2(0.0,1.0)),lavaHash(i+vec2(1.0)),f.x),f.y);
        }
        float lavaFbm(vec2 p) {
          return .57*lavaNoise(p) + .28*lavaNoise(p*2.03+vec2(9.7,3.1))
            + .15*lavaNoise(p*4.07+vec2(-4.3,8.4));
        }
        vec3 lavaControl(vec2 uv) {
          vec3 data = texture2D(lavaField, uv).rgb;
          return ${decode ? "toLinearSpace(data)" : "data"};
        }
        mat3 lavaTangentFrame(vec3 n, vec3 position, vec2 uv) {
          vec3 p1=dFdx(position), p2=dFdy(position);
          vec2 a=dFdx(uv), b=dFdy(uv);
          vec3 q=cross(p2,n), r=cross(n,p1);
          vec3 t=q*a.x+r*b.x, s=q*a.y+r*b.y;
          float inv=inversesqrt(max(1e-12,max(dot(t,t),dot(s,s))));
          return mat3(t*inv,s*inv,n);
        }
        vec3 lavaTemperature(float temperature) {
          vec3 red=vec3(.26,.006,.0005), orange=vec3(1.0,.13,.002);
          vec3 yellow=vec3(1.0,.62,.065);
          return mix(mix(red,orange,smoothstep(.20,.57,temperature)),yellow,
            smoothstep(.60,.95,temperature));
        }
      `,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        // Some exported falls have an entire vertical strip clamped to V=.001.
        // A metric height coordinate keeps the same texel density along every fall.
        vec2 lavaLocal=vec2(vLavaUV.x,1.0-vLavaUV.y);
        if(lavaMapping.x>.5) lavaLocal.y=-(vPositionW.y-lavaMapping.z)/lavaMapping.y/lavaDimensions.y;
        vec2 lavaPosition=lavaLocal*lavaDimensions.xy;
        float lavaShoreCenter=.5+.047*sin(lavaPosition.y*.73)
          +.043*(lavaFbm(vec2(lavaPosition.y*.39,2.7))-.5);
        float lavaShoreWidth=.355+.10*lavaFbm(vec2(lavaPosition.y*.24,9.2))
          +.024*sin(lavaPosition.y*1.43);
        float lavaSide=1.0-smoothstep(lavaShoreWidth-.035,lavaShoreWidth,
          abs(lavaLocal.x-lavaShoreCenter));
        if(lavaSettings.w>.5 && lavaSide<.32) discard;

        float lavaRaftLane=.45+.55*pow(max(0.0,1.0-abs(lavaLocal.x-.5)*2.0),.7);
        float lavaRaftV=lavaLocal.y-lavaTime*lavaSettings.x*lavaRafts.y*lavaRaftLane/lavaDimensions.y;
        float lavaRaftU=lavaLocal.x+.016*(sin(lavaLocal.y*8.4+lavaTime*.14)-sin(lavaLocal.y*8.4));
        vec2 lavaUV=vec2(.5+(lavaRaftU-.5)*lavaDimensions.x/12.0,1.0-lavaRaftV)*lavaSettings.z;
        vec3 lavaData=lavaControl(lavaUV);
        float lavaCycle=fract(lavaTime*.024+lavaData.g);
        float lavaMelting=smoothstep(.29,.64,lavaCycle)
          *(1.0-smoothstep(.76,.98,lavaCycle));
        float lavaSelected=smoothstep(.53,.82,lavaData.g);
        float lavaErosion=lavaMelting*lavaSettings.y*(.07+.82*lavaSelected);
        float lavaThreshold=.10+.12*lavaData.b+lavaErosion;
        float lavaSolid=smoothstep(lavaThreshold-.045,lavaThreshold+.055,lavaData.r);
        // Parallax follows surviving crust; melted plates no longer displace the liquid.
        mat3 lavaBasis=lavaTangentFrame(geometricNormalW,vPositionW,lavaUV);
        vec3 lavaView=vec3(dot(lavaBasis[0],viewDirectionW),dot(lavaBasis[1],viewDirectionW),
          dot(lavaBasis[2],viewDirectionW));
        vec2 lavaSlope=clamp(lavaView.xy/max(.42,abs(lavaView.z)),vec2(-1.3),vec2(1.3));
        float lavaHeight=texture2D(lavaRelief,lavaUV).a*lavaSolid;
        lavaUV+=lavaSlope*(lavaHeight-.40)*.014;
        lavaData=lavaControl(lavaUV);
        lavaCycle=fract(lavaTime*.024+lavaData.g);
        lavaMelting=smoothstep(.29,.64,lavaCycle)*(1.0-smoothstep(.76,.98,lavaCycle));
        lavaSelected=smoothstep(.53,.82,lavaData.g);
        lavaErosion=lavaMelting*lavaSettings.y*(.07+.82*lavaSelected);
        lavaThreshold=.10+.12*lavaData.b+lavaErosion;
        lavaSolid=smoothstep(lavaThreshold-.045,lavaThreshold+.055,lavaData.r);

        float lavaCenterSpeed=.25+.75*pow(max(0.0,1.0-abs(lavaLocal.x-.5)*2.0),.7);
        vec2 lavaFlow=lavaPosition;
        lavaFlow.y-=lavaTime*lavaSettings.x*lavaCenterSpeed;
        lavaFlow.x+=.27*sin(lavaPosition.y*.41+lavaTime*.13)
          +.36*(lavaFbm(lavaPosition*.24+vec2(0.0,lavaTime*.035))-.5);
        float lavaFlowNoise=lavaFbm(lavaFlow*1.1);
        float lavaStreak=pow(lavaFbm(lavaFlow*vec2(2.7,.57)),2.0);
        float lavaChips=smoothstep(.65,.78,lavaFbm(lavaFlow*3.9+vec2(5.1,9.4)))
          *lavaMelting*lavaSelected*(1.0-lavaSolid);
        lavaSolid=max(lavaSolid,lavaChips*.94);
        float lavaLiquid=1.0-lavaSolid;
        float lavaHeat=.17+.67*lavaFlowNoise+.26*lavaStreak;
        vec3 lavaEmission=lavaTemperature(lavaHeat)*lavaDimensions.z*lavaLiquid;
        // The crust uses the cavern's basalt, not the packed palace-ceiling atlas.
        vec3 lavaStone=texture2D(lavaRock,lavaUV*vec2(3.0,5.5)).rgb;
        ${maps[0].gammaSpace ? "lavaStone=toLinearSpace(lavaStone);" : ""}
        lavaStone*=lavaRafts.x;
        surfaceAlbedo=mix(vec3(.075,.008,.001),lavaStone,lavaSolid);
        vec3 lavaNormal=texture2D(lavaRelief,lavaUV).rgb*2.0-1.0;
        lavaNormal.y*=lavaDimensions.w;
        vec3 lavaCrustNormal=normalize(lavaBasis*lavaNormal);
        vec3 lavaRipple=vec3(sin(lavaFlow.y*1.8),cos(lavaFlow.x*1.2+lavaTime*.18),
          sin(lavaFlow.x+lavaFlow.y*.35))*.075;
        lavaRipple-=geometricNormalW*dot(lavaRipple,geometricNormalW);
        normalW=normalize(mix(geometricNormalW+lavaRipple,lavaCrustNormal,lavaSolid));
      `,
      "!float roughness=reflectivityOut\\.roughness;": `
        float roughness=mix(.36+.15*lavaFlowNoise,.90+.07*texture2D(lavaRough,lavaUV).g,lavaSolid);
        microSurface=1.0-roughness;
      `,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        finalEmissive=lavaEmission;
        finalDiffuse+=lavaStone*lavaSolid*.18;
      `
    };
    class LavaPlugin extends B.MaterialPluginBase {
      constructor() {
        super(material,"Lava rocosa animada",140,{ANIMATED_ROCK_LAVA:true},true,false);
        this.registerForExtraEvents=true;this._enable(true);
      }
      getClassName() { return "AnimatedRockLava"; }
      getSamplers(list) { list.push("lavaRock","lavaField","lavaRelief","lavaRough"); }
      getActiveTextures(list) { list.push(...maps); }
      hasTexture(texture) { return maps.includes(texture); }
      isReadyForSubMesh() { return maps.every(map=>map.isReady()); }
      getUniforms() {
        return {ubo:[{name:"lavaTime",size:1,type:"float"},{name:"lavaSettings",size:4,type:"vec4"},
          {name:"lavaDimensions",size:4,type:"vec4"},{name:"lavaRafts",size:4,type:"vec4"},
          {name:"lavaMapping",size:4,type:"vec4"}],
          fragment:"uniform float lavaTime;\nuniform vec4 lavaSettings;\nuniform vec4 lavaDimensions;\nuniform vec4 lavaRafts;\nuniform vec4 lavaMapping;"};
      }
      hardBindForSubMesh(buffer) { buffer.updateFloat("lavaTime",clock.time); }
      bindForSubMesh(buffer) {
        buffer.updateFloat("lavaTime",clock.time);
        buffer.updateFloat4("lavaSettings",options.speed,options.erosion,options.scale,Number(options.edges));
        buffer.updateFloat4("lavaDimensions",options.width,options.length,options.heat,options.normalY);
        buffer.updateFloat4("lavaRafts",options.rockDarkness,options.crustSpeed,0,0);
        buffer.updateFloat4("lavaMapping",Number(options.falling),options.worldScale,options.worldOriginY,0);
        ["lavaRock","lavaField","lavaRelief","lavaRough"].forEach((name,i)=>buffer.setTexture(name,maps[i]));
      }
      getCustomCode(type) { return type==="vertex" ? vertex : type==="fragment" ? fragment : null; }
      dispose() { scene.onBeforeRenderObservable.remove(observer); }
    }
    new LavaPlugin();
    material.bumpTexture=material.metallicTexture=material.emissiveTexture=null;
    material.emissiveColor.set(0,0,0);material.metallic=0;material.roughness=.86;
    material.useParallax=material.useParallaxOcclusion=false;
    material.metadata={...material.metadata,animatedLava:true,lavaMaps:maps};
    return control;
  }

  function create(B, scene, name, textures, options = {}) {
    const material=new B.PBRMaterial(name,scene);
    [material.albedoTexture,material.emissiveTexture,material.bumpTexture,material.metallicTexture]=textures;
    return {material,animation:apply(B,scene,material,options)};
  }
  return {version:2,defaults,apply,create};
})();

export { LavaRocosa };
