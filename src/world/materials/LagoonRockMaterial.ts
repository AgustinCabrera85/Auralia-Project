import { MaterialPluginBase, ShaderLanguage, type StandardMaterial } from '@babylonjs/core';

/** World-space rock projection, retaining Babylon's lights, fog and shared maps.
 * Cylindrical UVs collapse at the top of the procedural columns; sampling three
 * planes keeps both the colour and the normal map at the same scale there. */
export class LagoonRockMaterial extends MaterialPluginBase {
  constructor(material:StandardMaterial){
    super(material,'LagoonRockProjection',210,undefined,true,true);
  }
  override isCompatible(language:ShaderLanguage):boolean{return language===ShaderLanguage.GLSL;}
  override getCustomCode(shaderType:string):Record<string,string>|null{
    if(shaderType!=='fragment')return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:`
        #if defined(BUMP) && defined(NORMAL)
        vec3 lagoonRockNormal(vec2 uv,vec3 geometric,vec3 dx,vec3 dy,float strength){
          vec3 n=texture2D(bumpSampler,uv).xyz*2.0-1.0;
          n.xy*=strength;
          vec2 du=dFdx(uv),dv=dFdy(uv);
          vec3 p2=cross(dy,geometric),p1=cross(geometric,dx);
          vec3 T=p2*du.x+p1*dv.x,B=p2*du.y+p1*dv.y;
          float scale=inversesqrt(max(max(dot(T,T),dot(B,B)),0.00000001));
          return normalize((T*n.x+B*n.y)*scale+geometric*n.z);
        }
        #endif
      `,
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE:`
        #if defined(DIFFUSE) && defined(NORMAL)
          vec3 rockGeometric=normalize(vNormalW);
          if(!gl_FrontFacing)rockGeometric=-rockGeometric;
          // Smoothed vertex normals lean sideways at a cap/rim. Using them for
          // projection would stretch a side texture across the almost flat top.
          // Project from the actual face; keep smooth normals for the lighting.
          vec3 rockDx=dFdx(vPositionW),rockDy=dFdy(vPositionW);
          vec3 rockFace=normalize(cross(rockDx,rockDy));
          vec3 rockWeights=pow(max(abs(rockFace)-vec3(0.2),vec3(0.0)),vec3(4.0));
          rockWeights/=max(dot(rockWeights,vec3(1.0)),0.00001);
          vec3 rockUV=vPositionW*0.18;
          baseColor.rgb=(texture2D(diffuseSampler,rockUV.zy).rgb*rockWeights.x+
            texture2D(diffuseSampler,rockUV.xz).rgb*rockWeights.y+
            texture2D(diffuseSampler,rockUV.xy).rgb*rockWeights.z)*vDiffuseInfos.y;
          #ifdef BUMP
            float rockBump=0.32*(1.0-smoothstep(70.0,220.0,length(vEyePosition.xyz-vPositionW)));
            normalW=normalize(
              lagoonRockNormal(rockUV.zy,rockGeometric,rockDx,rockDy,rockBump)*rockWeights.x+
              lagoonRockNormal(rockUV.xz,rockGeometric,rockDx,rockDy,rockBump)*rockWeights.y+
              lagoonRockNormal(rockUV.xy,rockGeometric,rockDx,rockDy,rockBump)*rockWeights.z);
          #else
            normalW=rockGeometric;
          #endif
        #endif
      `
    };
  }
}
