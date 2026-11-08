# Roadmap de Auralia hasta el regalo de Navidad · 2026

**Inicio:** 28/10/2026. **Fecha objetivo de entrega:** 25/12/2026. **Congelamiento de mecánicas:** 16/12/2026.

## Rediseño geográfico del 8 de noviembre

El [mapa maestro geográfico](MAPA_MAESTRO_GEOGRAFICO.md) amplía el diseño a doce regiones y archipiélagos. El tamaño total queda abierto hasta completar y medir una región piloto en Brisalia y el Valle de los Faroles. Primero se define el relieve y el agua; después, biomas, asentamientos y caminos, conservando el núcleo existente y las partidas.

La entrega navideña sigue centrada en una primera aventura terminada. Las doce regiones no pasan a ser un requisito de diciembre; el piloto y su acabado visual se coordinan con los hitos siguientes, posponiendo la expansión que comprometa la estabilidad de la entrega.

## Hito 0: POC funcional (este paquete)

- Atlas inicial de una isla central y cinco regiones + archipiélagos, anterior al nuevo mapa maestro.
- Mapa interactivo offline e integrado en el POC.
- Reglas de inventario / recetas / construcción / guardado probadas con tests.
- Escena Babylon.js procedural, personaje, dos zonas, HUD, crafting, estructuras.

## Hito 1: validar la ejecución real en el equipo objetivo

- Ejecutar `npm install`, `npm run check`, `npm run build`.
- Verificar WebGL, desplazamiento, interacción, viaje y construcción en Chrome/Edge.
- Ajustar cámara y navegación para que un niño pueda usarlo sin ayuda.
- Reemplazar el terreno provisional por una primera geografía editable del valle.

## Hito 2: evolución técnica (noviembre)

- Extraer `WorldView` en módulos por sistema.
- Registro de `RegionScene` y carga/descarga de sectores.
- Incorporar personaje personalizado mediante GLB, animaciones y colisiones básicas.
- Implementar objetos reutilizables y estados persistentes.
- Definir piezas de edificio con pivotes, materiales y reglas de encastre reales.

## Hito 3: contenido narrativo (final de noviembre e inicio de diciembre)

- Casa y parcela personal como lugar central.
- Tres misiones guiadas y alternativas no violentas.
- Diálogos, objetivos y recompensas de misiones en datos.
- Bioma costero del sur y primera isla con contenido propio.
- Efectos de magia y primeras animaciones de NPC.

## Hito 4: edición navideña (7 al 16 de diciembre)

- Primera aventura de 30-60 minutos.
- Personalización del protagonista.
- Sorpresa de Navidad y mensaje familiar (texto a escribir por la familia).
- Guardado robusto, exportación/importación y pruebas de regresión.
- Preparación para distribuir como instalable si el equipo de destino lo requiere.

## Hito 5: estabilización (17 al 23 de diciembre)

- Pruebas reales con un niño o familiar en hardware objetivo.
- Cerrar errores importantes y optimizar el render.
- Paquete instalable o versión web offline, según el dispositivo elegido.
- Copia de seguridad y prueba desde una instalación limpia.

## Lo que NO entra para esta Navidad

MMORPG público, servidores, chat, docenas de ciudades, true world streaming total, PvP, economía global, físicas complejas, transporte avanzado y múltiples dungeons. El avance de diciembre debe priorizar **calidad y alegría del regalo**, no cantidad de características.
