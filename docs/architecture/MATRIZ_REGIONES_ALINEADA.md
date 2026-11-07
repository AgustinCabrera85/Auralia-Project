# Auralia — matriz cultural alineada al repositorio actual (v1.1)

**Estado:** propuesta de dirección artística y generación arquitectónica. **No modifica el juego ni su geografía.**

**Referencia de revisión:** `AgustinCabrera85/Auralia-Project`, rama `main`, commit `804fe332d20b` (7 de noviembre de 2026). Las fuentes canónicas de nombres y geografía son `src/data/world.ts`, `src/world/terrainData.ts` y `docs/ATLAS_AURALIA.md`. El GDD preliminar y las ideas culturales son propuestas, no canon automáticamente implementado.

## Correcciones respecto de la matriz anterior

1. Se conserva **Valle de los Faroles / Brisalia** como región y aldea inicial.
2. **Bosque de las Raíces Cantoras** deja de ser una región nueva: su lenguaje arquitectónico orgánico pasa a ser una variante cultural del **Bosque de los Ecos / Lindebrumas**, donde ya existe un punto de interés canónico.
3. **Marcas de la Bruma** no se registra como séptimo bioma ni reemplaza a Lindebrumas: se propone como **distrito o asentamiento lúgubre** dentro del Bosque de los Ecos. Su posición queda sin fijar hasta validar terreno, rutas y misiones.
4. Se incorpora **Sierras de los Engranajes / Altapiedra** como tercera línea arquitectónica prioritaria, vinculada a minería, herrería y mecanismos.
5. Las otras zonas preexistentes —**Nácar**, **costa** y **Cumbres del Primer Amanecer / Altaluz**— mantienen sus identidades y se reservan para siguientes iteraciones.

## Identidades y necesidades de juego

| ID del bioma (código) | Región asentamiento | Identidad cultural (propuesta) | Lenguaje arquitectónico | Contenido narrativo sugerido |
|---|---|---|---|---|
| `valle` | Valle de los Faroles / **Brisalia** | Comunidades de productores, artesanos y exploradores | Revoque crema, madera cálida, piedra ocre, teja roja, plazas abiertas, puentes y faroles | Aprendizaje, reparar molino/puente, crear herramientas y restaurar luz |
| `ecos` | Bosque de los Ecos / **Lindebrumas** | Guardianes de senderos, recolectores, observadores y aldeas defensivas en zonas peligrosas | Madera curvada, cubiertas orgánicas, puentes elevados, raíces; en enclaves de bruma: pizarra oscura, campanas y puertas protegidas | Misterio, senderos cambiantes, acertijos, purificar focos locales, criaturas nocturnas |
| `sierras` | Sierras de los Engranajes / **Altapiedra** | Canteros, mineros e ingenieros | Piedra estructural, metal, poleas, terrazas, muros de contención, puentes, tejados inclinados | Reparar mecanismos, recuperar minerales, abrir caminos, especies cavernarias |
| `nacar` | Lago de las Dos Orillas / **Nácar** | Pescadores, navegantes y comerciantes | Piedra clara, madera lacustre, muelles, terrazas y pilotes | Navegación, comercio y recursos de humedal |
| `costa` | Costa de Auralia / pueblos futuros | Marineros, carpinteros de ribera, fareros | Madera lavada, almacenes, pasarelas, aparejos y faros | Rutas marítimas, expediciones, embarcaciones |
| `cumbres` | Cumbres del Primer Amanecer / **Altaluz** | Guardianes de los pasos altos, custodios de grandes construcciones | Ciudadelas verticales, piedra clara, grandes arcos, escaleras y faros | Expediciones avanzadas, síntesis de herramientas y habilidades |

### Estados transversales de asentamiento

La cultura no es lo mismo que el estado. Cualquier aldea puede encontrarse **próspera**, **amenazada**, **abandonada** o **restaurada**. El estado modifica la decoración, el desgaste, los puntos de misión y algunas partes estructurales; **no cambia el ID del bioma**.

### Zona lúgubre: tratamiento compatible con el mapa

El aspecto lúgubre es una capa local del bioma `ecos`. No tiñe todo Lindebrumas de negro ni anula su identidad de bosque antiguo. Su arquitectura utiliza espacios compactos, faroles a corta distancia, marcas rituales discretas, campanas de aviso, cubiertas reparadas y barreras ligeras. La dificultad puede crecer por especies y encuentros específicos sin convertir el juego entero en horror. **Nombre provisional:** Marcas de la Bruma; **ubicación no fijada**.

## Reglas para integrar los assets arquitectónicos en el juego

- **Diseñar y editar en Blender; exportar GLB** con texturas **1K** compartidas, pivotes predecibles, metadatos y LOD.
- **Registrar los GLB en `src/world/assetCatalog.ts`** y reutilizar el pipeline de carga/instanciación actual. Los edificios visitables y los objetos interactivos requieren instancias individuales y colisiones específicas; no tratarlos como follaje `thin`.
- **Respetar `src/world/terrainData.ts`**: IDs `valle`, `ecos`, `sierras`, `nacar`, `costa`, `cumbres`, alturas mediante `sampleMainlandHeight(x,z)`, caminos y reservas existentes. Los perfiles culturales no deberán alterar la geografía canónica.
- **Integrar distribución con las exclusiones** de rutas, agua, recursos, puntos de interés y estructuras persistidas. Usar semillas deterministas; no redistribuir aldeas cada frame.
- **Mantener los saves:** no cambiar coordenadas ni IDs históricos de Brisalia y sus estructuras. La generación de poblados predefinidos debe tener su propio registro con IDs estables.
- **No confundir edificios del mundo con la construcción del jugador:** el modo de construcción usa grilla 4x4 m, nivel 0, y un esquema `BuildType` propio. Una casa arquitectónica importada es inicialmente una estructura del mundo, no una nueva pieza colocable por el jugador.
- **Importación visual:** el World Editor se menciona en la documentación y se referencia desde `WorldView.ts`, pero la carpeta `src/world/editor/` no figura en el árbol `main` revisado. Antes de automatizar la importación hay que verificar que su código esté efectivamente subido.

## Prioridad de producción v0.3

**P1 — Brisalia:** una vivienda, un taller y una taberna, con interiores transitables, texturas estilizadas y 3 variantes de tejado. Validar color, escala, accesos y coste de draw calls contra la vegetación V4/V3 actual.

**P2 — Lindebrumas:** derivar vivienda de guardabosques y refugio de vigilancia de los mismos módulos. Implementar como *variante cultural*, no bioma nuevo. El ambiente lúgubre será un preset de asentamiento, no un cambio global del shader del bosque.

**P3 — Altapiedra:** adaptar cimientos, muros, pendientes, terrazas, herrería y mecanismos. Evitar reconstruir el terreno para colocar casas.

**P4 — Pequeño asentamiento por región:** parcelas, camino de acceso, edificio central, luces y recursos. Con pruebas de colisiones, pathfinding posterior y límites de rendimiento.

**Criterio de salida:** el edificio se reconoce a distancia, puede recorrerse sin atravesar colisiones, tiene estética compatible con Auralia, y su exportación GLB se mantiene separada de los datos persistidos del jugador.

## Fuentes de código revisadas

- `https://github.com/AgustinCabrera85/Auralia-Project/blob/main/src/world/terrainData.ts`
- `https://github.com/AgustinCabrera85/Auralia-Project/blob/main/src/data/world.ts`
- `https://github.com/AgustinCabrera85/Auralia-Project/blob/main/docs/ATLAS_AURALIA.md`
- `https://github.com/AgustinCabrera85/Auralia-Project/blob/main/docs/BUILDING_SYSTEM.md`
- `https://github.com/AgustinCabrera85/Auralia-Project/blob/main/src/world/assetCatalog.ts`
- `https://github.com/AgustinCabrera85/Auralia-Project/blob/main/docs/ROADMAP_VISUAL.md`
