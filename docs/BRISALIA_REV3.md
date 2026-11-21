# Brisalia: Rev3 final y faroles de entrada

Integración del 20 de noviembre de 2026. La revisión visual de los edificios fue aprobada por el usuario antes de añadir los faroles.

## Assets y ubicación

- B01–B27 cargan por ID desde `public/assets/buildings/brisalia-rev3-final/`.
- Se conservaron los archivos originales del ZIP, incluyendo `prefab_manifest.json`, `shared_gltf` y `shared_textures`, con sus rutas relativas.
- 27 glTF, 27 buffers y 62 imágenes compartidas: unos 33,34 MB. Los GLB individuales alternativos ocupan 342,30 MB; no fue necesario utilizarlos.
- Babylon 9.32 y el navegador cargan `EXT_texture_webp`: 51 imágenes WebP verificadas y 62 imágenes internas GPU para las 62 fuentes compartidas.
- Se conservaron mapas PBR, transparencia de hojas/flores y desgaste final. No se regeneraron texturas.
- Se conservaron posiciones, orientación, escala, IDs y accesos. B27 ya estaba ubicado en (-110, -82) metros relativos al pueblo, con giro de 180 grados; se mantuvo allí. B28 conserva su castillo Rev5.

## Pivotes, referencias y colisiones

`artifacts/brisalia-rev3/source-audit.json` compara los límites y las puertas de cada fuente anterior y final. `placements-before.json` registra las ubicaciones anteriores.

Los centros horizontales coinciden; se midieron los límites nuevos antes de actualizar el catálogo. B02 cambia de 15,96 a 16,02 metros de ancho y su puerta final es arqueada, ligeramente desplazada en profundidad. Las hojas de entrada de B19 mantienen su posición, salvo 1,5 mm de profundidad. La escala sigue siendo 3,8 / 1,4 unidades por metro.

Las referencias originales a puertas, ventanas y jardineras quedan en `root.metadata.authoredAnchors`, antes de agrupar las mallas. El desgaste y las plantas se agrupan como elementos visuales y no bloquean las consultas de colisión. Las mallas físicas conservan las consultas de suelo, pared, techo y cámara.

La resolución de URLs permite normalizar `../shared_textures` sólo dentro del paquete y rechaza escapes de ruta u otros servidores. La agrupación respeta los atributos de vértices distintos presentes en B02.

## Faroles

Un farol de hierro y vidrio ámbar por entrada: 27 en total. El montaje se calcula a partir de las hojas reales y un rayo contra la superficie sólida de la fachada, evitando ventanas y contraventanas. B01 usa su fachada orientada hacia +Z; los demás accesos usan -Z antes de aplicar el giro del edificio.

Dos geometrías y dos materiales compartidos; no se añaden texturas. Las luces cálidas siguen el ciclo ambiental, se apagan de día y fuera de distancia, con un máximo de seis luces locales activas. Cada luz afecta a su edificio y la más próxima puede iluminar a Santi. Los faroles no añaden colisiones ni obstruyen el paso.

## Archivos principales

- `src/world/brisaliaRev3Assets.ts`: catálogo final por ID y dimensiones medidas.
- `src/world/BrisaliaAssetUrls.ts`: resolución segura de recursos compartidos.
- `src/world/BrisaliaVillage.ts`: carga, agrupación, referencias y montaje.
- `src/world/brisaliaLayout.ts`: selección del catálogo manteniendo ubicaciones.
- `src/world/BrisaliaEntranceLanterns.ts`: geometría, anclaje y luz de los faroles.
- `src/game/WorldView.ts`: actualización de luz según el reloj ambiental.
- `tests/brisalia-rev3.test.mjs`, `scripts/brisalia-rev3.browser.js` y `scripts/brisalia-lanterns.browser.js`: comprobaciones.

## Resultados

- `npm run build`: correcto; permanece la advertencia de tamaño de algunos paquetes JavaScript.
- `npm run test:brisalia-rev3`: correcto; IDs, buffers, rutas, PBR y plantas transparentes.
- Escena real: 28 edificios únicos, transformaciones conservadas, texturas listas, sin errores de carga.
- Navegación: recorrido del castillo completo en 282 pasos de simulación; 2.250 muestras de suelos, 453 de escalones y 693 del pasaje. Siete caminos conectados y patio sobre el terreno del mapa.
- Faroles: 27 montajes, separación de puertas, cero colisiones nuevas, apagado diurno, encendido nocturno y límite de seis luces correctos.
- En QA la simulación se pausa para las capturas: se avanza explícitamente el streaming antes de mover la cámara. Una prueba inicial sin ese avance se detuvo por sectores pendientes; el recorrido completo pasó con los sectores cargados.

## Capturas de la escena real

- [Conjunto](../artifacts/brisalia-rev3/conjunto.png), con la bruma ambiental existente.
- B19: [fachada](../artifacts/brisalia-rev3/b19-fachada.png), [puerta](../artifacts/brisalia-rev3/b19-puerta.png), [jardinera](../artifacts/brisalia-rev3/b19-jardinera.png), [esquina superior](../artifacts/brisalia-rev3/b19-esquina-superior.png).
- B25: [fachada](../artifacts/brisalia-rev3/b25-fachada.png), [puerta](../artifacts/brisalia-rev3/b25-puerta.png), [jardinera](../artifacts/brisalia-rev3/b25-jardinera.png).
- Faroles: [B19 noche](../artifacts/brisalia-lanterns/b19-noche.png), [B25 noche](../artifacts/brisalia-lanterns/b25-noche.png), [B25 día](../artifacts/brisalia-lanterns/b25-dia.png).

Informes: `artifacts/brisalia-rev3/integration.json`, `navigation.json` y `artifacts/brisalia-lanterns/lanterns.json`. No quedan fallos visibles identificados en los edificios revisados. Los archivos Rev4 históricos permanecen disponibles, pero no se instancian en la escena.

La reducción posterior de memoria se documenta en [MEMORY_OPTIMIZATION.md](MEMORY_OPTIMIZATION.md).
