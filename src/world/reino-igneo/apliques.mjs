function sconceBounces(B, fixtures, worldScale=1) {
  // Stable pools on the gallery masonry, independent of the two active bifocal fixtures.
  const glslVec = values => `vec3(${values.map(value => value.toFixed(4)).join(",")})`;
  const calls = fixtures.map(([position, inward]) =>
    `calderaSconce((vPositionW - ${glslVec(position)}) / ${Number(worldScale).toFixed(7)}, ${glslVec(inward)}, geometricNormalW)`);
  const fragment = {
    CUSTOM_FRAGMENT_DEFINITIONS: `
      float calderaSconce(vec3 offset, vec3 inward, vec3 normal) {
        float height = abs(offset.y);
        float depth = -dot(offset, inward);
        float width = length(offset.xz + depth * inward.xz);
        float cone = 1.0 - smoothstep(0.055, 0.19 + 0.34 * height, width);
        float vertical = smoothstep(0.18, 0.49, height)
          * (1.0 - smoothstep(0.49, offset.y > 0.0 ? 1.82 : 1.30, height));
        float contact = smoothstep(0.01, 0.14, depth) * (1.0 - smoothstep(0.58, 1.04, depth));
        return cone * vertical * contact * max(0.0, dot(normal, inward));
      }`,
    CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
      #ifndef UNLIT
        finalDiffuse += surfaceAlbedo * vec3(0.95, 0.43, 0.16) * (${calls.join(" + ")});
      #endif`
  };
  return class SconceBounce extends B.MaterialPluginBase {
    constructor(material) {
      super(material,"Rebote de los apliques",155,{},true,true);
    }
    getClassName() { return "CalderaSconceBounce"; }
    getCustomCode(shaderType) { return shaderType === "fragment" ? fragment : null; }
  };
}


export { sconceBounces };
