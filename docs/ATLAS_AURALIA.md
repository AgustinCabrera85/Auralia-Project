# Atlas geográfico de Auralia · v0.1

## Decisión fundacional

**Auralia es una gran isla principal, rodeada por archipiélagos y pequeños islotes.** Los caminos y ríos articulan las regiones continentales; los faros y puertos conectan las islas. Cada nueva ciudad se ubica dentro de una zona definida sin alterar las coordenadas narrativas de los asentamientos anteriores.

El mapa ilustrado es conceptual y **no** sirve como heightmap ni como una medición geodésica. Sus puntos normalizados se almacenan en `src/data/world.ts`. Al comenzar el terreno definitivo, establecer un sistema de coordenadas local por región y anclas estables para caminos/rutas.

## Distribución de la isla principal

| Sector | Región / Pueblo | Bioma / geografía | Identidad jugable |
| --- | --- | --- | --- |
| Sur central | Valle de los Faroles / Brisalia | Praderas, bosques, arroyo, costa y huertas | Hogar, recolección, crafting, primeras misiones |
| Norte-oeste | Sierras de los Engranajes / Altapiedra | Montañas, minas, cascadas y pasos elevados | Cobre, metalurgia, poleas, puentes, máquinas |
| Este central | Lago de las Dos Orillas / Nácar | Lago interior, ríos navegables, islas lacustres | Pesca, navegación, comercio, cooperación |
| Oeste | Bosque de los Ecos / Lindebrumas | Bosque antiguo, niebla y ruinas | Observación, acertijos y magia |
| Norte-este | Cumbres del Primer Amanecer / Altaluz | Grandes cimas, nieve y faro | Exploración avanzada y conclusión narrativa |

### Rutas de tierra previstas

- Brisalia ↔ Altapiedra: camino de colinas que asciende hacia las minas.
- Brisalia ↔ Nácar: camino de comerciantes junto a la cuenca del río.
- Brisalia ↔ Lindebrumas: sendero del bosque con ruinas y bifurcaciones.
- Altapiedra ↔ Altaluz: ruta de altura y mecanismos.
- Nácar ↔ Altaluz: recorrido del valle elevado y la torre de vigilancia.
- Lindebrumas ↔ Altapiedra: antiguo sendero de canteros.

No todos los caminos deben estar abiertos en la versión inicial; podrán aparecer puentes incompletos, derrumbes y portones, sin crear restricciones artificiales de nivel.

## Archipiélago satélite

| Isla | Posición conceptual | Recurso / habilidad | Estado |
| --- | --- | --- | --- |
| **Isla de las Luciérnagas** | Suroeste próximo a Brisalia | Cristales de chispa, linterna mágica | POC v0.1 |
| Peñasco del Herrero | Sureste | Minerales raros, metal encantado | Futuro |
| Isla del Cristal Sonoro | Este | Resonancia y magia sonora | Futuro |
| Faro Dormido | Noreste | Viajes largos, orientación marítima | Futuro |
| Isla de la Bruma Serena | Oeste | Hierbas alquímicas y exploración | Futuro |

**Reservas geográficas:** suroeste fuera del atlas, costa este lejana, mares australes, archipiélago norte y cuevas bajo el continente. No se detallan todavía para evitar que un diseño cerrado condicione futuras ideas.

## Primera región: Brisalia (layout del POC)

El terreno 3D es un microescenario de prueba con un recorte costero provisional; la geografía definitiva del valle puede crecer hacia el norte sin desplazar el atlas principal.

| Punto local (x,z) | Lugar | Propósito |
| --- | --- | --- |
| (1,10) | Llegada del personaje | Comienzo y guía |
| (1,-19) | Plaza de Brisalia | Centro social y fuente |
| (-10,7) | Banco de carpintería | Fabricación de herramientas |
| (-29,18) | Claro del Hogar | Parcela 34 × 34, construcción modular |
| (-54,24) | Bosque de recolección | Madera renovable |
| (40,8) | Cantera | Piedra y cobre |
| (12,56) | Muelle sur | Navegación a Luciérnagas |

La Isla de las Luciérnagas tiene una zona local independiente, un pequeño santuario, árboles extraños, cristales y muelle de retorno. **Las coordenadas locales no equivalen a los píxeles del mapa conceptual**.

## Guía geográfica al sumar nuevas ciudades

1. Definir si pertenece a una región ya existente o si exige una región nueva.
2. Registrar posición conceptual, bioma, propósito y accesos en el atlas.
3. Decidir por qué se desarrolló históricamente ahí: río, cantera, puerto, cultivos, paso comercial.
4. Definir necesidades de materiales, habilidades y trama.
5. Asignar ancla local y sectores de streaming, conservando los identificadores persistentes.
6. Revisar vistas desde pueblos existentes para garantizar continuidad visual.
7. Recién entonces producir el terreno final y sus assets.
