# Accidentes geográficos y lugares · Update 3

## Terreno y agua

`src/world/geographicFeatures.ts` contiene las definiciones estables del río principal, el Arroyo del Prado, el Lago de Nácar, la cuenca de humedales, dos lagunas, dos islas interiores, formaciones de montaña y accidentes costeros. Los perfiles del río descienden hacia el sur. `terrainData.ts` aplica las depresiones al muestreo compartido por terreno, colisiones, mapa y vegetación; conserva las alturas de Brisalia, la parcela y los hitos existentes.

`GeographyStream.ts` genera superficies de agua solo para chunks activos. Cada superficie usa una retícula de 3 m y toma su cota del mismo perfil que talla el cauce. Las mallas de agua no se pueden seleccionar ni tienen colisión física; el movimiento del jugador usa el muestreo de agua y el tablero del puente para impedir pasos por agua profunda. El mar existente y la Isla de las Luciérnagas permanecen operativos.

El río nace en las montañas del norte, pasa por el borde oriental del valle, entra en el Lago de Nácar y sale hacia la costa sur. El Arroyo del Prado cruza la ruta de Nácar por un puente. Las cumbres tienen una cresta, una meseta, un acantilado y un paso local; la costa conserva playas, una caleta y un acantilado rocoso. Las lagunas y el barranco fluvial usan relieve y agua procedural, sin edificios definitivos.

## Lugares y descubrimiento

`src/world/pointsOfInterest.ts` registra los seis lugares con `id`, nombre, coordenadas, radio de descubrimiento y diálogo. `PointOfInterestView.ts` crea sus placeholders reutilizables; el embarcadero reutiliza el muelle interactivo existente. Acercarse a un lugar lo guarda en `discoveredPlaces` y muestra un marcador en el mapa regional. Los guardados anteriores migran a una lista vacía de descubrimientos sin perder inventario, construcciones ni posición.

| Lugar | ID | X | Z |
| --- | --- | ---: | ---: |
| Cascada del Valle | `cascada-valle` | 470 | -1005 |
| Ruina de los Caminos | `ruina-caminos` | -120 | -210 |
| Mirador de Altapiedra | `mirador-altapiedra` | -340 | -565 |
| Entrada de Cueva Antigua | `cueva-antigua` | -300 | -640 |
| Puente del Arroyo | `puente-arroyo` | 155 | -133 |
| Embarcadero de Brisalia | `embarcadero-brisalia` | 33 | 120 |

Para agregar otro lugar, incorporá un registro en `POINTS_OF_INTEREST` con un ID nuevo y coordenadas secas y transitables. Si necesita una forma visual nueva, añadí una variante a `createPointOfInterestView`; `WorldView` registrará la interacción y el descubrimiento sin otra lista paralela. Si necesita un cauce o relieve nuevo, definilo en `geographicFeatures.ts`; el streaming, el mapa y las reglas de movimiento deben compartir su muestreo.

El mapa técnico se regenera con `npm run map:terrain`. El nombre `mapa-geografico-v0.2.svg` se conserva para no romper referencias existentes, pero el contenido ya indica Update 3.

## Límites

El agua es estática y no tiene corriente, física de flotación ni navegación lacustre. La cascada, ruina, mirador, cueva y puente son geometría temporal; el interior de la cueva y las futuras ciudades todavía no existen. Las mallas de terreno y agua se generan por proximidad; los placeholders de los seis lugares son objetos ligeros permanentes de la escena.
