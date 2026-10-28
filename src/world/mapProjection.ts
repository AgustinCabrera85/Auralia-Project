/** Proyección ortográfica para mapas jugables: norte arriba (Z decrece). */
import { MAINLAND } from './terrainData';

export const MAP_VIEW={
  minX:MAINLAND.centerX-MAINLAND.radiusX-400,
  maxX:MAINLAND.centerX+MAINLAND.radiusX+400,
  minZ:MAINLAND.centerZ-MAINLAND.radiusZ-350,
  maxZ:MAINLAND.centerZ+MAINLAND.radiusZ+450
} as const;
export function mapPercent(x:number,z:number):{left:number;top:number}{
  return {
    left:100*(x-MAP_VIEW.minX)/(MAP_VIEW.maxX-MAP_VIEW.minX),
    top:100*(z-MAP_VIEW.minZ)/(MAP_VIEW.maxZ-MAP_VIEW.minZ)
  };
}
