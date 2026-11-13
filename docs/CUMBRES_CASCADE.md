# Cauce continuo de la cascada de Cumbres

Revisión del 13 de noviembre de 2026, sobre el continente principal.

Las vistas en X 2129 / Z −2538 y X 2165 / Z −2704 mostraban repisas de terreno que ocultaban partes de la caída. Había dos causas en `StudioRivers`: el perfil transversal terminaba en una cresta plana y la mezcla de segmentos utilizaba proyecciones longitudinales truncadas en sus extremos. Incluso un río con pendiente uniforme adquiría ondulaciones artificiales alrededor de cada punto de control.

## Corrección

- Los tramos con pendiente alta usan una sección cóncava que conecta el fondo con las paredes del valle sin una repisa plana. La transición entre perfiles es gradual entre pendientes de 0,15 y 0,45 m/m.
- El perfil longitudinal de esos tramos utiliza interpolación cúbica Hermite con tangentes monótonas y prolongación tangencial durante la mezcla entre segmentos. Así se elimina el aplanamiento repetido en los puntos de control.
- Terreno, colisiones y agua siguen consultando el mismo perfil. El terreno conserva como límite superior la altura del scaffold original. No se agregó otra superficie acuática ni un desplazamiento vertical global del agua.
- No cambian los ejes XZ, los datos R16, los niveles hidráulicos precalculados, los lagos ni las plataformas de asentamientos. El perfil anterior se conserva en los ríos de poca pendiente.
- Se mantiene la malla canónica de 6 m en los corredores fluviales para todos los LOD. No se agregaron vértices ni sectores residentes.

También se normalizan los finales de línea de texto en la comprobación del bake hidráulico: un checkout CRLF de Windows ya no se confunde con niveles desactualizados. Los R16 se siguen comparando como bytes originales.

## Verificación

- `npm run test:cascade`: 168 secciones reales de Cumbres, 1.512 intersecciones con las mallas near/mid/far, profundidad mínima de 3,89 m dentro del 90 % del semiancho nominal. Error máximo entre LOD y colisión: 1,14 × 10⁻¹³ m. El perfil comprobado nunca asciende aguas abajo.
- Regresión sintética de pendiente uniforme: la versión anterior introducía un error de altura de hasta 3,324 m; la nueva mantiene la pendiente con error inferior a 10⁻⁹ m. Se comprueba además que las orillas empinadas ascienden sin repisa y que los perfiles suaves siguen siendo idénticos.
- `npm run test:studio-rivers`: 78 comprobaciones adicionales de LOD, topología sin grietas, coincidencia de las mallas de agua y cancelación de trabajos al cambiar de región.
- `npm run test:hydrology-integration`: 1.504 muestras en los ejes, 7.382 verificaciones de excavación, 14 regresiones de malla, sin incidencias detectadas. Máximo de 9 sectores R16 residentes.
- `node scripts/check-worldstudio-game.mjs --run --cascade`: tres vistas repetibles en Chrome con perfil descartable, sin acceder a los guardados del usuario. `--before` separa las evidencias al ejecutarlo sobre la revisión anterior; no activa una implementación antigua.
- `npm run build`: compilación de producción.

## Coste observado

Capturas a 1600 × 900, calidad de rendimiento y límite de 30 FPS. Mismos puntos y parámetros de cámara; la cámara mantiene su ajuste de colisión con el relieve. Los FPS son muestras con límite, no una medición de capacidad máxima. La memoria indicada corresponde a buffers de terreno, no a memoria total de GPU.

| Vista | Triángulos de terreno residentes antes/después | Buffers de terreno antes/después | Triángulos activos de escena antes → después | FPS antes → después |
|---|---:|---:|---:|---:|
| Lateral | 118.846 / 118.846 | 4,419 / 4,419 MiB | 508.108 → 507.296 | 29,99 → 30,00 |
| Superior | 117.514 / 117.514 | 4,371 / 4,371 MiB | 421.332 → 409.436 | 30,00 → 30,00 |
| Frontal | 120.808 / 120.808 | 4,479 / 4,479 MiB | 1.105.824 → 1.061.548 | 30,00 → 30,00 |

Las muestras de heap JS sin recolección forzada están en los JSON: varían con el momento del GC y no se usan para afirmar una reducción de memoria. No se midió memoria total de GPU en esta revisión.

## Evidencias

| Vista | Antes | Después |
|---|---|---|
| Lateral | [Captura](../artifacts/geographic-source/cascade/before/lateral.png) | [Captura](../artifacts/geographic-source/cascade/after/lateral.png) |
| Superior | [Captura](../artifacts/geographic-source/cascade/before/superior.png) | [Captura](../artifacts/geographic-source/cascade/after/superior.png) |
| Frontal | [Captura](../artifacts/geographic-source/cascade/before/frente.png) | [Captura](../artifacts/geographic-source/cascade/after/frente.png) |

Resultados numéricos: `artifacts/geographic-source/cascade/geometry.json`, JSON junto a las capturas y auditoría actualizada en `artifacts/geographic-source/water-union/`.
