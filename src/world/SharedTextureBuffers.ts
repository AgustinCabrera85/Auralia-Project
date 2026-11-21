import { Texture, type BaseTexture } from '@babylonjs/core';

/** Babylon shares GPU images by URL, but each glTF Texture can retain another
 * encoded source. Point wrappers at the internal image's existing source too.
 * Keep that source alive for context restoration, cloning and serialization.
 * Babylon 9.32 exposes both buffer fields; no pixels or sampler settings change.
 */
export function shareTextureSourceBuffers(textures:readonly BaseTexture[]):void {
  for(const texture of textures){
    if(!(texture instanceof Texture))continue;
    const source=texture.getInternalTexture()?._buffer;
    if(source&&ArrayBuffer.isView(source)&&ArrayBuffer.isView(texture._buffer))
      texture._buffer=source;
  }
}
