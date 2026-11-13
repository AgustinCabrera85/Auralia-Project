import type { TraversalWorld } from '../../game/CharacterTraversalController';
import { terrainWallAt } from '../../game/TerrainTraversal';
import type { GeographicSurface } from './GeographicSource';

/** Adapter for the game's existing kinematic controller; never creates terrain. */
export function geographicTraversal(surface:GeographicSurface,canMove:(x:number,z:number)=>boolean):TraversalWorld{
  const height=(x:number,z:number)=>surface.heightAt(x,z);
  return {
    ground:(x,z,origin,max)=>{const s=surface.surfaceAt(x,z);
      return s.height<=origin+.001&&s.height>=origin-max-.001?
        {height:s.height,normalY:1/Math.hypot(1,s.slopeX,s.slopeZ)}:null;},
    wall:(x,y,z,dx,dz,reach)=>terrainWallAt(height,x,y,z,dx,dz,reach),
    solidTop:()=>null,headroom:()=>true,canMove,
    fallbackHeight:height
  };
}
