# Habilidades especiales de Auralia

Implementación del 20 de noviembre de 2026, sobre `main`. Conserva la progresión de la espada y la recompensa local del Reino Ígneo. No cambia Q, F ni R.

## Qué funciona

`forest_roots` tiene el circuito completo: aprender al fabricar la espada → seleccionar → preparar a Santi → comprometer → brotes sobre superficies válidas → impacto único por blanco → retracción → recuperación → enfriamiento. Utiliza los GLB entregados, no geometría provisional. Funciona en cualquier zona cuya superficie admita el ataque; el origen de una habilidad no restringe su uso.

El checkout todavía no tiene enemigos, puntos de vida ni daño del combate normal. `AbilityTargets` es el contrato mínimo para integrarlos. Por eso `PROVISIONAL_SWORD_DAMAGE = 10` es una base editable y provisional del adaptador, no un valor heredado de un sistema de daño inexistente. En desarrollo hay blancos registrados en ese mismo contrato. No se añadieron enemigos a la partida normal.

## Separación de responsabilidades

| Módulo | Responsabilidad |
| --- | --- |
| `src/domain/abilities/types.ts` | Definiciones, estados, contratos de presentación, comportamiento y vuelo |
| `catalog.ts` | Catálogo editable, balance, origen, requisitos y cronología |
| `conditions.ts` | Árboles `all`/`any` y evaluadores registrados; nunca `eval` |
| `progress.ts` | Normalización y migración de poderes aprendidos |
| `AbilityManager.ts` | Validación, tiempo de simulación, compromiso, costes opcionales, enfriamiento y cancelación |
| `forestRoots.ts` / `rootLean.ts` | Distribución, inclinación de puntas, objetivos e impactos; sin Babylon |
| `src/game/abilities/AbilitySystem.ts` | Unión con el store, escena, HUD y laboratorio |
| `RootsSurfaceAdapter.ts` | Consulta real al controlador de superficies; coordenadas locales/globales |
| `AbilityPresentation.ts` | Registro de FX, carga de animación y enlace con Santi |
| `RootsFx.ts` | Tres variantes GLB, grupos de animación y pool de hasta 48 brotes |
| `RootsCameraShake.ts` | Temblor de cámara por anillo, reloj de simulación y restauración sin deriva |
| `src/ui/AbilitiesHud.ts` | Selección, motivos de bloqueo y herramientas de prueba |

`WorldView` solamente proporciona el estado actual, las consultas de movimiento y los eventos del ciclo de vida. Los comportamientos no se programan dentro de su bucle. Las partículas, materiales y sonidos pertenecen al adaptador de FX; su finalización no decide daño, desbloqueos ni devolución del control.

Cada estado informa por separado `design`, `implementation`, `unlocked`, `available`, `activable`, `reason`, `phase`, nivel y enfriamiento. `available` exige implementación, comportamiento registrado, animación y FX listos. `unlocked` expresa conocimiento permanente. Un recurso ausente bloquea una solicitud con un motivo controlado; un fallo visual ocurrido después del compromiso no suprime el impacto jugable.

## Controles

| Acción | Control |
| --- | --- |
| Abrir/cerrar poderes, selección y requisitos | H / botón Poderes |
| Activar especial seleccionado | X / botón del HUD |
| Solicitar definitivo independiente | T / botón del HUD |
| Cancelar habilidad | Esc |
| Equipo / espada | V / 2 |
| Ataque normal, barrida, roll y giro de construcción | Q, F y R existentes |

Se auditaron WorldView, Hud, SantiCatalog y LandscapeDebug: G ya tenía una función de diagnóstico; se eligieron X, T y H. Repetición automática, campos input/textarea/select, contenteditable, paneles, editor F9, construcción, viajes, deslizamiento y estados incompatibles no pueden iniciar raíces. El especial bloquea las acciones de Santi y el movimiento mediante el bloqueo existente de ataque. Al cerrar o cancelar, no deja controles retenidos.

El HUD compacto actualiza textos a 10 Hz y mantiene sus nodos. La lista de selección solo se reconstruye cuando cambia el conjunto de habilidades aprendidas e implementadas. No se guarda por actualizar el temporizador.

## Balance inicial editable

La intensidad proviene exclusivamente de `brisaliaSwordLevel(state)`: tener la espada y completar los objetivos existentes de descubrimiento. No hay un contador alternativo para ella.

| Nivel | Anillos | Radio | Brotes máximos | Daño × | Escala interior → exterior | Intensidad FX |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 4 m | 6 | 1 | 0,55 | 0,65 |
| 2 | 2 | 6 m | 16 (6 + 10) | 1,3 | 0,65 → 0,75 | 0,8 |
| 3 | 3 | 8 m | 30 (6 + 10 + 14) | 1,6 | 0,75 → 0,95 | 1 |
| 4 | 4 | 10 m | 48 (6 + 10 + 14 + 18) | 2 | 0,85 → 1,15 | 1,2 |

Cada nivel conserva las posiciones de los anillos anteriores y añade uno exterior. Sus centros están a 3,4 / 5,4 / 7,4 / 9,4 m del lanzamiento, con 2 m de separación radial; la zona de impacto alcanza 4 / 6 / 8 / 10 m. El tamaño aumenta por nivel y por anillo exterior. `ROOT_RING_DELAY = 0.24` retrasa cada anillo respecto del anterior. Durante la emergencia, las puntas se inclinan suavemente 22° en dirección tangencial, alternando el sentido por anillo (+/−/+/−); `rings[].lean` configura el ángulo. Las bases permanecen fijas en sus apoyos, también en pendientes; la dirección de inclinación se proyecta sobre el plano local del suelo. `sampleRootLean` aumenta la inclinación al emerger, la mantiene y la relaja al retraerse. Los brotes futuros permanecen deshabilitados hasta su instante de salida y la retirada sigue la misma secuencia.

Cada tanda produce un temblor breve de cámara al comenzar a emerger, también en la parte alta de una pendiente. `cameraShake` configura amplitud base 0,035 / 0,05 / 0,065 / 0,08 por nivel, duración de 0,20 s y frecuencia de 24 Hz. Cada anillo exterior suma un 15 % de intensidad; la envolvente decae hasta cero y el desplazamiento total se limita a 0,16. Se aplica a `ArcRotateCamera.targetScreenOffset`, sin modificar órbita, movimiento, colisiones ni centro del ataque. El offset anterior se retira antes de cada muestra y se restaura al cancelar, perder foco, cambiar cámara/escena o destruir el adaptador. No hay temporizadores ni sacudidas encoladas tras un salto de tiempo; los anillos sin emplazamientos válidos no disparan temblor.

Todos son valores iniciales de balance. `push` e `immobilize` están en cero y viajan en el contrato de impacto, preparados para receptores que implementen esos estados. La intensidad FX modula la flexión decorativa `Curvar`; no modifica daño ni radio.

Cronología del primer anillo en segundos de simulación desde la solicitud:

| Instante / intervalo | Evento |
| --- | --- |
| 0–0,4 | Preparación, Casting de Santi |
| 0,4 | Revalidar, fijar nivel/centro/superficies, consumir coste opcional una vez y comenzar 12 s de enfriamiento |
| 0,4–0,75 | Emergencia (0,35 s) |
| 0,75 | Impacto único por objetivo |
| 0,75–1,45 | Permanencia (0,7 s) |
| 1,45–2,05 | Retracción (0,6 s) |
| 2,05–2,25 | Recuperación de Santi y devolución del control |

Los anillos 2–4 desplazan su emergencia, impacto, permanencia y retirada en 0,24 / 0,48 / 0,72 s. Sus impactos ocurren a 0,99 / 1,23 / 1,47 s, únicamente en la franja radial correspondiente. Todos comparten la deduplicación por ejecución: un blanco en dos franjas no recibe daño dos veces. La recuperación espera la retirada del último anillo; el control vuelve a 2,25 / 2,49 / 2,73 / 2,97 s según nivel. `profile.timeline` puede ajustar impactos, recuperación y finalización; el manager fija `execution.timeline`, los anillos y las escalas al comprometer. Los adaptadores deben muestrear esa cronología resuelta.

Las raíces solo usan enfriamiento: no se introdujo una barra global ni un gasto de cristales. El manager acepta `cost: {resource, amount}` y un `AbilityWallet` atómico para futuras habilidades. Si se configura un coste sin proporcionar wallet, falla cerrado. Puede comenzar el enfriamiento en `commit` o en `end`.

Antes del compromiso, interrumpir no gasta recursos ni enfriamiento. Después, cancela impactos futuros y FX, conserva el coste gastado y el enfriamiento. No reembolsa daños ya aplicados. La validación vuelve a correr en el compromiso; un cambio de equipo durante la preparación la invalida. Un cambio de nivel antes del compromiso usa el nuevo nivel; después no cambia esa ejecución. Cada ejecución tiene ID y un conjunto de marcadores emitidos e impactos por índice/objetivo. El contrato permite impactos múltiples explícitos; las raíces usan un grupo común para garantizar daño único entre anillos.

Pausa/panel y pérdida de foco interrumpen la acción, liberan animación y congelan el enfriamiento mientras dura la pausa. Cambiar de zona/interior o recargar partida cancela antes de trasladar al personaje; los efectos no siguen a Santi. Recargar una partida no restaura ejecuciones ni cooldowns transitorios. Destruir la escena aborta descargas y destruye cachés; si el parser termina después, descarta y libera su resultado.

## Recursos inspeccionados e integración real

Origen conservado: `F:\PROYECTO AURALIA\PARA ASSETS\Para FXs\Auralia_Raices_Bosque_v1`.
Se revisaron `LEEME.md`, `INTEGRAR_EN_AURALIA.md`, el manifiesto, los scripts de generación, los canales/tiempos binarios de los GLB y el catálogo/modelo de Santi. Solo se copiaron al proyecto estos archivos, todos con sus texturas PBR 1024×1024 WebP embebidas:

| Ruta relativa a `public/assets/abilities/forest-roots/` | Bytes | SHA-256 original |
| --- | --- | --- |
| `Raiz_Astillada.glb` | 1459184 | `97250a66b928a263ff239126c40f85a440b3aaece0d239e8e4c6c54ed4fe2b68` |
| `Raiz_Serpentina.glb` | 1432504 | `24691fe58b5b157cea983c2535265bb77e4396d6baa28c6313059c95eaca7734` |
| `Raiz_Corona.glb` | 1459260 | `f908da1019ee25e51ef8200c05930e963e9959338ab6638ad6c9231da136eb2f` |

No se necesita el `.blend`, las previews, las texturas externas ni el conjunto circular de 16 brotes. Los originales individuales permiten apoyar cada brote sobre la superficie real y escalar de 6 a 48 sin cuatro paquetes. Cada modelo tiene un grupo `01_Ataque_Circular`, duración 3,1667 s, y morph targets `Emerger`/`Curvar`. No contiene armature. El origen está en el suelo, Y vertical. Se registra explícitamente `EXT_texture_webp` en Babylon.

La cronología visual se remapea por tramos al clip original: emergencia hasta 0,85 s del clip, permanencia hasta 1,8 s y retirada hasta 2,75 s. Se usa `AnimationGroup.goToFrame`, con el grupo pausado, según tiempo de simulación menos el retraso de cada brote. Así el daño de cada anillo coincide con sus raíces extendidas aunque el clip original sea más largo. No se espera a callbacks de finalización del GLB.

Santi ya carga los 35 clips NLA de `Santi_NLA_SK_Opt.glb`, incluidos Casting (2,5 s), Power Up (2,0667 s) y Flying (2,2 s). Las raíces usan **Sword And Shield Casting**, velocidad 1,2 y mezcla 0,12 s. Se elimina su desplazamiento planar de pelvis en el espacio Z-up interno del modelo; las colisiones y el movimiento siguen siendo del controlador. Power Up no se asigna al definitivo por suposición. Flying permanece preparado para vuelo real pendiente.

El muestreo de suelo usa `TraversalWorld.ground`, agua, espacio libre, obstáculos y consultas próximas a la misma superficie. Convierte offset local/global, orienta cada brote a la normal, rechaza pendientes excesivas, agua, vacío y construcciones. Puede reducir el número de brotes si no hay emplazamientos seguros; nunca cambia el radio ni el multiplicador de daño. No usa las colisiones del mesh visual ni deforma terreno. El trazado de impactos consulta paredes y movimientos a lo largo del segmento; no atraviesa edificios ni agua.

En pendientes, la búsqueda vertical de cada raíz crece con su distancia horizontal y con la inclinación admitida (normal Y ≥ 0,7). El trazado sigue el suelo en segmentos de hasta 0,35 m: una cuesta válida ya no se confunde con una pared a la altura del lanzador. Los cambios abruptos, huecos y agua siguen bloqueando el recorrido; el apoyo final de una raíz debe corresponder a la misma capa recorrida, evitando plataformas superiores desconectadas. Los reintentos angulares se limitan a cada posición del anillo, sin trasladar todas las raíces de la parte alta hacia abajo.

Los tres contenedores se cargan una vez por escena, solo al preparar una habilidad aprendida/seleccionada. Las copias comparten geometría y materiales, con morph managers independientes. Hay un máximo de una habilidad activa y 48 brotes; se reutilizan. `MAX_ROOT_INSTANCES` se deriva del máximo del catálogo. Ningún nivel descarga otro paquete. La calidad gráfica no cambia gameplay. No se suministraron sonido, partículas, sello o terrones exportados: el acabado disponible son las raíces PBR animadas. Los adaptadores admiten incorporar esos recursos después.

Si falta un GLB, el HUD muestra el error y no permite lanzar. Solo con Vite DEV y `?abilityDiagnostic=1`, un fallo de carga admite conos magenta wireframe, rotulados **DIAGNÓSTICO**. No es el acabado visual final y queda fuera de producción.

## Registrar una habilidad y conectar un FX

1. Añadir el ID estable a `ABILITY_IDS` y una definición en `ABILITIES`. Configurar diseño, implementación, origen, desbloqueo, condiciones, perfiles, activación, cronología, animación y referencia FX. No marcar como disponible un comportamiento pendiente.
2. Implementar `AbilityBehavior`: `plan` prepara el contexto espacial, `impact` aplica gameplay, y opcionalmente `commit`, `update`, `end` gestionan efectos temporales o continuos. Registrarlo con `manager.register(id, behavior)` en la composición de `AbilitySystem`.
3. Implementar `AbilityFxAdapter` y registrarlo con `presentation.registerFx(id, adapter)`. `prepare/ready` controlan recursos; `start/update/clear/dispose` gestionan modelos, uniforms, partículas y audio. Las referencias en la definición eligen el adaptador. No hay que modificar `AbilityManager`.
4. Registrar objetivos reales mediante `system.targets.register({id, position, radius, valid, receive})`; conservar la función de desregistro para su destrucción. `receive` debe aplicar daño y los estados que soporte. El ID de objetivo debe ser estable y único.
5. Conectar una fuente real de recompensa. `GameStore.unlockAbility(id)` es idempotente y persiste una vez. `selectAbility` rechaza poderes pendientes. `advanceAbility` permite progresión monotónica dentro de perfiles registrados para habilidades disponibles con `levelSource:'ability'`; rechaza la espada porque evoluciona por sus objetivos existentes.

Los adaptadores de presentación están limitados a ocho entradas por escena. Para audio opcional sin archivo, `ready()` debe reflejar solo los recursos exigidos por ese efecto; nunca bloquear el daño esperando una cola de audio. Los adaptadores son responsables de pausar/cerrar sonidos y reciclar partículas en `clear/dispose`.

## Incorporar la animación del definitivo

`forest_ultimate` es otra entrada y otro botón. No se convierte en raíces N4. Actualmente tiene `conditions:null`, sin comportamiento, FX, animación ni fuente de desbloqueo: permanece bloqueado incluso si se aprende manualmente en el laboratorio.

Cuando se entregue el clip identificado, editar su definición:

```ts
animation: {
  file: '/assets/characters/santi/archivo-confirmado.glb',
  clip: 'nombre-exacto-confirmado',
  speed: 1,
  blendSeconds: 0.18
},
// Usar los tiempos aprobados de esa animación, en segundos de simulación:
timeline: {commit: compromiso, fx: disparosFX, impacts: impactos,
  recovery: inicioRecuperacion, release: devolucionControl}
```

No existe todavía ese archivo ni se presume su nombre. La carga externa acepta rutas `/assets/`, busca el clip exacto y exige rig completo compatible: nombres, padres, escala y matrices de reposo de los huesos de Santi. Retargetea las pistas a los nodos cargados y elimina traslado planar de pelvis. Rechaza rigs distintos y archivos de raíces sin skeleton; no sustituye automáticamente otra animación. Se mantiene una caché acotada de ocho clips externos y se cancelan sus descargas al destruir. Para `file:'santi'`, el nombre debe existir en el catálogo cargado.

Agregar la animación no habilita el definitivo: aún deben definirse desbloqueo, condiciones combinadas, comportamiento, coste opcional, cooldown y efectos. El manager no requiere cambios por añadir o cambiar el clip. Para sincronizar impacto con un frame, convertir el desplazamiento temporal del clip por `speed` y colocar ese segundo en `timeline.impacts`. Los eventos no dependen del framerate; varios marcadores atravesados en un paso se ejecutan una vez cada uno. `fx` e `impacts` deben ser iguales o posteriores al compromiso.

## Condiciones personalizadas y recompensas

```ts
manager.conditions.register('meterFull', context => context.facts.ultimateMeter === 100);
const requirements = {all: [
  {rule:'equipment', value:'sword', reason:'Equipá la espada.'},
  {any: [
    {rule:'fact', value:'mission-complete', reason:'Completá la misión.'},
    {rule:'meterFull', reason:'Completá el medidor.'}
  ]}
]};
// En la entrega real de una misión, después de comprobar su recompensa:
store.unlockAbility('forest_ultimate');
```

Este ejemplo ilustra la API, **no define las condiciones del definitivo**. `null`, grupos vacíos y reglas no registradas bloquean. La evaluación ocurre al solicitar y al comprometer. Los hechos del mundo se inyectan en el contexto; hoy se aportan los descubrimientos existentes. No se ejecuta código almacenado en guardados ni en configuración.

`forest_roots` se aprende al obtener la espada mediante la fabricación existente. `igneo_fire` se aprende por `reino-igneo-cristal`, la recompensa ya existente del cristal sagrado; recolectar fragmentos no lo concede. Ambos se reconocen al migrar saves anteriores. Gastar un cristal en crafting no quita el poder. No hay fuentes inventadas para Albor, definitivo ni propuestas.

El estado opcional `abilities` de SaveGameV1 persiste `unlocked`, `selected` y `levels`. Se filtran IDs desconocidos, duplicados, niveles inválidos y selecciones pendientes; las partidas viejas conservan inventario, posición, construcciones y descubrimientos. No se serializan meshes, partículas, callbacks, ejecuciones ni enfriamientos.

## Vuelo y catálogo pendiente

El manager soporta `instant`, `timed` y `toggle`. Un toggle comprometido pasa a `active`, mantiene `behavior.update` y se desactiva con la segunda solicitud; siempre ejecuta `end`. `FlightMovementPort` prepara `canStart/start/update/stop` para un controlador que implemente vuelo con colisiones. Flying admite reproducción cíclica con tiempo de simulación. No se añadió un modo noclip ni se habilitó vuelo sin movimiento real y recompensa.

| Poder | Diseño | Implementación / fuente |
| --- | --- | --- |
| forest_roots | Confirmado | Disponible; fabricación de espada |
| forest_ultimate | Confirmado | Pendiente: clip corporal identificado, comportamiento, condiciones y fuente |
| igneo_fire | Confirmado | Aprendizaje permanente conectado al cristal sagrado; ataque y FX pendientes |
| albor_flight | Confirmado | Flying existente; locomoción aérea con colisiones y fuente pendientes |
| valdoria_light | Propuesto | Pendiente |
| valdemonte_stone | Propuesto | Pendiente |
| sylvarin_resonance | Propuesto | Pendiente |
| ferragris_magnetism | Propuesto | Pendiente |
| solhar_sand | Propuesto | Pendiente |
| umbrael_shadow | Propuesto | Pendiente |
| nacar_water | Propuesto | Pendiente |
| viridara_vines | Propuesto | Pendiente |
| doravena_beasts | Propuesto | Pendiente |
| thalamar_lightning | Propuesto | Pendiente |

## Laboratorio y validación

En DEV, abrir H → Laboratorio → **Entrar a prueba temporal** → aprender `forest_roots` → elegir N1–N4, reiniciar enfriamientos y crear blancos. Cerrar H y usar X. La simulación de hechos acepta `evento=true` o `evento=false`. Desbloquear una propuesta no implementa su comportamiento. El HUD rotula PRUEBA; el nivel/equipo simulado y los desbloqueos temporales nunca se escriben al store. Salir restaura la selección normal y elimina los blancos.

Validación automatizada:

- `npm run test:abilities`: 29 casos, incluyendo condiciones, cuatro perfiles, anillos concéntricos, inclinación alternada de puntas y transición suave, temblor por tanda y restauración sin acumulación, secuencia de daño sin duplicados, pasos largos, cancelación de anillos futuros, pendientes en siete orientaciones/inclinaciones, obstáculos, capas de apoyo, instantáneo/toggle, revalidación, consumo único, pausa, escena, ausencia de recursos y guardados.
- `npm run test:santi`: asset real, bloqueo entre combate y especial, reloj de animación, devolución de control, importación de clip sobre el rig y rechazo de un recurso sin skeleton; además de las pruebas anteriores de locomoción.
- `npm run test:domain`, `npm run test:sword`, `npm run test:traversal`: regresiones del store, evolución de espada y movimiento.
- `npm run check` y `npm run build`.

Recorrido real reproducible, con Vite limitado a localhost:

```powershell
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
node scripts/check-abilities.mjs --start
# Esperar que el mundo termine de cargar:
node scripts/check-abilities.mjs --eval=scripts/abilities.browser.js --report=integration --capture
node scripts/check-abilities.mjs --eval=scripts/abilities-lifecycle.browser.js --report=lifecycle
node scripts/check-abilities.mjs --eval=scripts/abilities-slope.browser.js --report=slope --capture=slope
node scripts/check-abilities.mjs --close
```

El script utiliza Chrome headless, puerto 9228 y perfil propio en `.test-build/abilities-chrome`. Nunca usa el perfil del usuario. `artifacts/abilities/integration.json` registra cuatro niveles con 6/16/30/48 raíces reales, aparición progresiva de los anillos, un pulso de cámara por tanda y restauración final, Casting, morphs independientes, daño único 10/13/16/20 sobre tres blancos, recuperación/cooldown, bloqueo de autorepeat/escritura, pérdida de foco, limpieza, pool estable en 48 y progreso sin cambios. `roots.png` muestra el efecto real en la escena de Brisalia. Los tiempos se avanzan por el bucle real `WorldView.update` y se renderiza con Babylon; no se sustituye la presentación por mocks.

`artifacts/abilities/lifecycle.json` verifica aborto de una descarga pendiente, ausencia de brotes tardíos y liberación de los 48 morph managers clonados (58 → 10 en la escena, además de mallas y materiales). Es importante liberar esos managers explícitamente: Babylon no los destruye al eliminar las mallas clonadas.

`abilities-slope.browser.js` construye una escena de prueba determinista con un collider inclinado de pendiente 0,7, rayos reales contra sus triángulos, `terrainWallAt`, el planner y los GLB de producción. `slope.json` verifica 48 brotes en secuencia (6 → 16 → 30 → 48), bases fijas sobre el collider e inclinación alternada de puntas, incluidos 22 brotes en la mitad alta; sus alturas de apoyo van de −4,48 a 8,48 m. Recorre los vértices deformados por los morphs para comprobar que cada modelo emerge. `slope.png` documenta esa escena de prueba, no una ubicación del mapa.

La medición local acotada con 48 brotes obtuvo 0,23 ms por actualización de FX N4 (100 muestras) y aproximadamente 18,37 ms CPU de `scene.render` sin raíces frente a 19,19 ms con ellas (30 muestras). La variabilidad del mundo y el calentamiento no permiten estimar el coste GPU a partir de esa diferencia. El pool permanece estable tras varios ataques. El build sigue avisando de bundles grandes del mundo existente; no se añadió una dependencia externa. Estas cifras no garantizan FPS en todo el continente ni en todas las GPUs.
