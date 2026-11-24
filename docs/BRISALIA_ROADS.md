# Adoquines incrustados en los caminos de Brisalia

Paquete suministrado: `Auralia_Brisalia_Adoquines_PBR_1K_v1.zip`, SHA-256 `b441816e70b85645b5746617126f160a66f5c0e3ea93aaa2380ef8739c092be5`.

Se conservan el trazado, las posiciones, los triángulos y las UV de `BrisaliaVillage.createRoads`, calculados con `brisaliaRoadEdge`. El canal verde de los colores de vértice delimita las incrustaciones hacia el interior; el alfa original mantiene el borde de tierra. El material se usa únicamente en `brisalia:connected-streets`.

`createVillageRoadMaterial` mezcla la tierra y grava existentes con parches estables de adoquines. El mapa de altura determina qué caras afloran y qué juntas siguen cubiertas por tierra; no desplaza vértices ni añade colisiones. Una repetición de 1,8 × `BRISALIA_SCALE` unidades conserva piedras de unos 20–25 cm respecto de la escala del pueblo. El normal GL aporta relieve suave, ORM aporta oclusión y rugosidad seca, y se conservan la iluminación, la niebla y la sombra del personaje.

Los cuatro mapas 1024 × 1024 se copian sin modificar a `public/assets/terrain/brisalia/`. Se cargan una sola vez por material, con repetición, mipmaps y filtrado anisotrópico; color en sRGB y los mapas de datos en lineal. Son siete texturas del suelo más la sombra, en la misma malla y una sola llamada de dibujo. Se liberan junto con el material.

| Archivo | SHA-256 |
| --- | --- |
| `Brisalia_Adoquines_BaseColor_1K.jpg` | `b90007cf8bc1a4dc5a5b2958b85b78389641449b89ea8854db360336168354a7` |
| `Brisalia_Adoquines_NormalGL_1K.png` | `d6fe9683728d939946e192814f984695237507d3ff5989cc30e5378fab3f8310` |
| `Brisalia_Adoquines_ORM_1K.png` | `ebc3e119194d1e6663bee11033040475052959022c8dc8bc158ba42f3d0807b9` |
| `Brisalia_Adoquines_Height16_1K.png` | `8c5627f3a57ee7cca27dbf2d206a60470444859dade3a6642a9e3ecdfc19f324` |

Validación: `npm run check`; decodificación y resolución de los mapas; revisión visual del juego en Chrome (`localhost:5173`, Brisalia, aproximadamente X −1279 / Z 1839). Se observaron los parches de adoquines, la tierra entre juntas, los bordes originales y la sombra del personaje. No se ejecutó el módulo JavaScript de ejemplo incluido en el ZIP.
