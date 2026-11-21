"use strict";

function materialContinuoDeCaverna(B, material, field) {
  const maps = [material.albedoTexture, material.bumpTexture, material.metallicTexture];
  maps[1].hasAlpha = true; // The shared atlas packs the measured height in alpha.
  const albedoSample = "cavernTexture(cavernColor, projected).rgb";
  const vec3 = values => `vec3(${values.map(value => Number(value).toFixed(7)).join(",")})`;
  const fragment = {
    CUSTOM_FRAGMENT_DEFINITIONS: `
      uniform sampler2D cavernColor;
      uniform sampler2D cavernRelief;
      uniform sampler2D cavernRoughness;
      const vec3 cavernOrigin = ${vec3(field.origen)};
      const vec3 cavernAcross = ${vec3(field.transversal)};
      const vec3 cavernForward = ${vec3(field.longitudinal)};
      const vec3 cavernUp = vec3(0.0, 1.0, 0.0);
      const float cavernTexel = 1.0 / ${Number(field.resolucion).toFixed(1)};

      vec4 cavernTexture(sampler2D atlas, vec2 uv) {
        return texture2D(atlas, vec2(uv.x, 1.0 - uv.y));
      }

      void cavernPlane(vec2 uv, vec3 alongU, vec3 alongV, vec3 view,
                       out vec3 color, out vec3 gradient, out float roughness) {
        vec3 planeNormal = normalize(cross(alongU, alongV));
        vec2 slope = vec2(dot(view, alongU), dot(view, alongV));
        slope /= max(0.48, abs(dot(view, planeNormal)));
        slope = clamp(slope, vec2(-1.7), vec2(1.7)) * ${Number(field.paralaje).toFixed(5)};
        float height = cavernTexture(cavernRelief, uv).a;
        vec2 inset = slope * (height - 0.54);
        height = cavernTexture(cavernRelief, uv + inset).a;
        vec2 projected = uv + slope * (height - 0.54);
        vec4 relief = cavernTexture(cavernRelief, projected);
        vec3 tangentNormal = relief.rgb * 2.0 - 1.0;
        vec2 normalSlope = -tangentNormal.xy / max(0.35, tangentNormal.z);
        // Height and the measured normals describe the same fracture network.
        vec2 heights = vec2(
          cavernTexture(cavernRelief, projected + vec2(cavernTexel, 0.0)).a,
          cavernTexture(cavernRelief, projected + vec2(0.0, cavernTexel)).a);
        vec2 bump = (heights - relief.a) / cavernTexel;
        vec2 surfaceSlope = normalSlope * ${Number(field.normales).toFixed(4)}
          + bump * ${Number(field.bump).toFixed(5)};
        gradient = alongU * surfaceSlope.x + alongV * surfaceSlope.y;
        float occlusion = mix(0.67, 1.0, smoothstep(0.22, 0.54, relief.a));
        color = ${maps[0].gammaSpace ? `toLinearSpace(${albedoSample})` : albedoSample} * occlusion;
        roughness = cavernTexture(cavernRoughness, projected).g;
      }`,
    CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
      vec3 cavernOffset = (vPositionW - cavernOrigin) / ${Number(field.worldScale ?? 1).toFixed(7)};
      vec3 cavernU = normalize(cavernAcross * 0.91 + cavernForward * 0.40);
      vec3 cavernV = normalize(cavernForward * 0.92 - cavernAcross * 0.36);
      vec3 cavernPoint = vec3(
        dot(cavernOffset, cavernAcross * 0.91 + cavernForward * 0.40) / 18.0,
        dot(cavernOffset, cavernForward * 0.92 - cavernAcross * 0.36) / 19.0,
        dot(cavernOffset, cavernUp) / 18.0);
      cavernPoint.xy += cavernOffset.y * vec2(0.038, 0.019);
      vec3 cavernWeights = pow(abs(vec3(dot(geometricNormalW, cavernU),
        dot(geometricNormalW, cavernV), dot(geometricNormalW, cavernUp))), vec3(3.0));
      cavernWeights /= max(0.0001, dot(cavernWeights, vec3(1.0)));
      float cavernStation = dot(cavernOffset, cavernForward) + 31.9;
      float cavernFloor = 1.26 * smoothstep(56.0, 58.1, cavernStation)
        - 2.78 * smoothstep(68.7, 75.9, cavernStation);
      float cavernFoot = ${field.mezclarPie === false ? '0.0' : '1.0 - smoothstep(0.035, 0.84, cavernOffset.y - cavernFloor)'};
      cavernWeights = mix(cavernWeights, vec3(0.0, 0.0, 1.0), cavernFoot);
      cavernU = normalize(cavernU + cavernUp * 0.684);
      cavernV = normalize(cavernV + cavernUp * 0.361);
      vec3 colorX, colorY, colorZ, gradientX, gradientY, gradientZ;
      float roughX, roughY, roughZ;
      cavernPlane(cavernPoint.zy + vec2(0.53, 0.51), cavernUp, cavernV, viewDirectionW,
        colorX, gradientX, roughX);
      cavernPlane(cavernPoint.xz + vec2(0.53, 0.51), cavernU, cavernUp, viewDirectionW,
        colorY, gradientY, roughY);
      cavernPlane(cavernPoint.xy + vec2(0.53, 0.51), cavernU, cavernV, viewDirectionW,
        colorZ, gradientZ, roughZ);
      vec3 cavernGradient = gradientX * cavernWeights.x + gradientY * cavernWeights.y
        + gradientZ * cavernWeights.z;
      cavernGradient -= geometricNormalW * dot(cavernGradient, geometricNormalW);
      normalW = normalize(geometricNormalW - cavernGradient);
      surfaceAlbedo *= colorX * cavernWeights.x + colorY * cavernWeights.y + colorZ * cavernWeights.z;
    `,
    "!float roughness=reflectivityOut\\.roughness;": `
      float roughness = dot(vec3(roughX, roughY, roughZ), cavernWeights);
      microSurface = 1.0 - roughness;
    `
  };

  class ContinuousCavern extends B.MaterialPluginBase {
    constructor() {
      super(material, "Fracturas continuas de la caverna", 130, {CONTINUOUS_CAVERN: true}, true, true);
    }
    getClassName() { return "ContinuousCavern"; }
    prepareDefines(defines) { defines.CONTINUOUS_CAVERN = true; }
    getSamplers(samplers) { samplers.push("cavernColor", "cavernRelief", "cavernRoughness"); }
    getActiveTextures(textures) { textures.push(...maps); }
    hasTexture(texture) { return maps.includes(texture); }
    isReadyForSubMesh() { return maps.every(texture => texture?.isReady()); }
    bindForSubMesh(uniforms) {
      uniforms.setTexture("cavernColor", maps[0]);
      uniforms.setTexture("cavernRelief", maps[1]);
      uniforms.setTexture("cavernRoughness", maps[2]);
    }
    getCustomCode(shaderType) { return shaderType === "fragment" ? fragment : null; }
  }

  const plugin = new ContinuousCavern();
  material.albedoTexture = material.bumpTexture = material.metallicTexture = null;
  material.metallic = 0;
  material.metadata = {...material.metadata, cavernMaps: maps};
  return plugin;
}

export { materialContinuoDeCaverna };
