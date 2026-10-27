# Plan: Máquina de gancho (Juegos)

Juego en solitario nuevo para la sección Juegos: una máquina de gancho con premios en euros, algunos muy grandes. Sigue el estilo del Laberinto de las Puertas (commit 362622c), pero es de una sola jugada, como el Plinko.

Este documento es solo un plan. No contiene código del juego.

## 1. Resumen y decisiones de diseño

Clave interna: `claw` (mensaje `solo_claw`). Nombre en pantalla: «Máquina de gancho» (por confirmar, ver preguntas).

### 1.1 Una jugada, sin estado guardado (como `plinkoDrop`)

- El jugador elige la apuesta, mueve el gancho y lo suelta. El servidor sortea el premio en esa misma petición y la apuesta se liquida entera. No hay partida en curso.
- Consecuencias, comprobadas en el código:
  - No hace falta migrar el check de `juegos_solo`, porque no se guarda nada en esa tabla. `schema.mjs` y `migracion_juegos_laberinto.sql` no se tocan.
  - No se crean tablas, así que no hay que hacer nada con el dueño `juegos_api`.
  - Probablemente no haga falta ningún SQL. El único candidato es gacha (ver 1.4): las columnas `juego` de `juegos_gacha_efectos` y `poderes_usados` no tienen check por juego, así que `claw` entra sin migrar. Hay que confirmarlo leyendo el esquema real al implementar.
  - En `game.mjs`, `settlementOf` trata a `plinko` como caso especial (`stake: msg.bet, net: out.delta`) y `playSolo` pone `saved = null` solo para plinko. Hay que añadir `claw` a esas dos condiciones. Sin eso, el seguro y el premio del gacha no se aplicarían, o se intentaría leer `juegos_solo` para este juego.
  - También hay que añadir `case 'solo_claw':` junto a `solo_dungeon`, `solo_plinko` y `solo_frog` en el switch de `game.mjs` (hoy en la línea ~751).
- Si el jugador cierra la pestaña durante la animación, el saldo ya está liquidado. Al volver ve el saldo correcto. Se puede enseñar el último resultado si el cliente lo guarda en `sessionStorage`, pero es opcional.

### 1.2 ¿Importa la puntería? Recomendación: no, y se dice en pantalla

- Si la posición del gancho influyera en el resultado, habría estrategias con más de 96 % de retorno (o menos), y el RTP dejaría de estar garantizado «con cualquier estrategia».
- Recomendación: el servidor sortea el premio con `randomInt` sin mirar dónde se soltó el gancho. El mensaje solo lleva `bet`, y como mucho una `x` cosmética que el servidor valida (entero de 0 a N) y ignora para el sorteo.
- Para que mover el gancho no parezca inútil, la pantalla anima hacia el resultado así:
  - El montón de premios del cristal es decorativo y se genera en el cliente.
  - Al llegar la respuesta, el gancho baja donde lo soltó el jugador. La escena coloca debajo de las pinzas la cápsula del premio sorteado (o nada si es ×0) y la anima.
  - Si el premio es ×0, el gancho agarra y suelta a medio camino («se escapa»), con un casi-premio visual.
- El texto de ayuda debe ser honesto: «El azar decide, mueve el gancho a tu gusto. Dónde lo sueltes no cambia las probabilidades.»

### 1.3 Tabla de premios y retorno (RTP)

Se sortea `rand(10000)` y se busca el tramo. Las probabilidades son enteras sobre 10 000 para que la aritmética sea exacta. Todos los premios salen enteros con apuesta múltiplo de 10 (el ×0,5 de 10 € son 5 €).

| Premio (× apuesta) | Probabilidad | Contribución al retorno |
|---|---|---|
| ×200 (premio gordo) | 5 / 10 000 = 0,05 % (1 de cada 2000) | 0,1000 |
| ×50 | 20 / 10 000 = 0,20 % | 0,1000 |
| ×25 | 40 / 10 000 = 0,40 % | 0,1000 |
| ×10 | 150 / 10 000 = 1,50 % | 0,1500 |
| ×5 | 400 / 10 000 = 4,00 % | 0,2000 |
| ×2 | 800 / 10 000 = 8,00 % | 0,1600 |
| ×1 (recuperas la apuesta) | 1000 / 10 000 = 10,00 % | 0,1000 |
| ×0,5 (premio de consolación) | 1000 / 10 000 = 10,00 % | 0,0500 |
| ×0 (se escapa) | 6585 / 10 000 = 65,85 % | 0 |
| **Total** | **10 000 / 10 000** | **0,9600 (96,00 %)** |

Comprobación aritmética (hecha al redactar el plan):

- Suma de probabilidades: 5 + 20 + 40 + 150 + 400 + 800 + 1000 + 1000 + 6585 = 10 000.
- Suma de multiplicador × probabilidad: 1000 + 1000 + 1000 + 1500 + 2000 + 1600 + 1000 + 500 = 9600. Eso es 9600 / 10 000 = 96,00 % exacto.
- Probabilidad de cobrar algo: 34,15 %. Probabilidad de ganar de verdad (más de ×1): 14,15 %.
- Varianza por unidad apostada: E[X²] = 30,445, así que la varianza es 30,445 − 0,9216 ≈ 29,52 y la desviación típica ≈ 5,43. Es un juego de varianza alta, a propósito.
- Como cada jugada es independiente y el resultado no depende del jugador, el retorno es 96 % con cualquier estrategia, apuesta o patrón de movimientos. El Score no se puede cultivar (< 100 %).

Los multiplicadores y probabilidades son una propuesta. Si el usuario quiere otro premio gordo (por ejemplo ×100 o ×500), el agente de la tarea 1 reajusta las probabilidades para mantener 9600 / 10 000. Regla práctica: cada tramo alto aporta unos 0,10 al retorno.

### 1.4 Gacha: no alterar los poderes de las cartas existentes

Hallazgo en `api/_juegos/gacha.mjs`:

- `SOLO_GAMES = Object.keys(SOLO_IN)` y `POWER_GAMES = ['poker', 'blackjack', ...SOLO_GAMES]`.
- `powersFor(card)` usa un generador sembrado con el id de la carta. Orden de las llamadas: `choose(POWER_GAMES)` para el «punto fuerte», luego póker, luego blackjack y luego, por cada juego solo en el orden de `SOLO_IN`, un `rnd() < 0.5` y un `choose(SOLO_SHAPES…)`.
- `powersOf` se calcula una vez al arrancar el módulo a partir del catálogo.

Riesgos y solución:

1. **Orden.** Añadir `claw` al **final** de `SOLO_IN` y `SOLO_TITLE`. Los poderes de los juegos existentes salen de las mismas llamadas al generador, así que no cambian. El de `claw` es la última llamada.
2. **Punto fuerte.** `choose(POWER_GAMES)` hace `Math.floor(rnd() * POWER_GAMES.length)`. Pasar de 8 a 9 elementos **cambia el juego fuerte de muchas cartas existentes**, y con él su nivel (`tierOf`). Hay que evitarlo: sortear el punto fuerte sobre la lista antigua de 8 juegos (una constante `STRONG_POOL` con los 8 actuales) y dejar `claw` fuera de ese sorteo. Es simple y no altera nada. El coste es que ninguna carta existente tiene `claw` como punto fuerte.
3. **Alternativa a decidir con el usuario** (pregunta 6): ampliar el sorteo a 9 y aceptar que algunas cartas cambien de punto fuerte. No se recomienda.
4. Verificación obligatoria: un script de Node que importe `gacha.mjs` antes y después del cambio (por ejemplo, con `git stash` o una copia del módulo antiguo) y compare `powersOf` de todas las cartas del catálogo para los 8 juegos antiguos. Debe dar 0 diferencias. Además, `POWER_GAMES` se recorre en `gacha.mjs` (~línea 466) para el uso de poderes. Hay que confirmar que `claw` entra bien ahí.
5. Textos: `SOLO_IN.claw = 'la máquina de gancho'`, `SOLO_TITLE.claw = 'gancho'` y `GAME_NAME.claw` en `packages/web/src/juegos/gacha.js`.
6. Nota económica: el seguro y el premio del gacha elevan el retorno real de quien los usa por encima del 96 %. Pasa igual en todos los juegos y está acotado por `BONUS_CAP`. Con premios de ×200, el tope del «premio» importa. Conviene comprobar `BONUS_CAP` y comentarlo en la revisión.

### 1.5 Apuesta

Propuesta: `MIN_BET = 10`, `MAX_BET = 1000`, `STEP = 10`. El mayor premio posible es 1000 × 200 = 200 000 €, del orden del máximo del laberinto (5000 × 54 = 270 000 €). Es una propuesta que depende del saldo semanal típico (pregunta 3).

## 2. Archivos afectados (comprobados con búsqueda)

| Archivo | Cambio |
|---|---|
| `packages/web/src/juegos/claw.js` (nuevo) | Módulo de reglas puro, compartido por pantalla y servidor |
| `packages/web/src/juegos/Claw.jsx`, `ClawArt.jsx`, `ClawScene.jsx`, `Claw.css` (nuevos) | Pantalla |
| `packages/web/src/juegos/sound.js` | Sonidos nuevos si hacen falta (motor del gancho, agarre, premio) o reutilizar `playClank`, `playWin`, `playCash` |
| `packages/web/src/juegos/Juegos.jsx` | Entrada en la lista `SOLO` (~línea 69), `import`, ruta `if (screen === 'claw')`, comentario de pantallas (~línea 496) |
| `packages/web/src/juegos/hub.css` | Arte de la tarjeta del lobby (`game__claw…`) |
| `packages/web/src/juegos/gacha.js` | `GAME_NAME.claw` |
| `api/_juegos/solo.mjs` | `import * as claw`, `SOLO_GAMES.solo_claw = 'claw'`, `clawDrop`, `SOLO_PLAY.claw` |
| `api/_juegos/game.mjs` | `case 'solo_claw'`, `settlementOf` y `playSolo` (como plinko) |
| `api/_juegos/gacha.mjs` | `SOLO_IN`, `SOLO_TITLE` (al final), `STRONG_POOL` |
| `README.md` | Línea ~150: añadir la máquina de gancho a los juegos solo |
| `supabase/` | Ninguna migración prevista (ver 1.1). Solo si el esquema real de gacha lo exigiera |

## 3. Subtareas

### T1. Reglas puras y matemática del retorno
- **Agente:** `javascript-pro`, con `quant-analyst` como revisor de la tabla. Si el equipo prefiere uno solo, `javascript-pro` basta.
- **Objetivo:** crear `claw.js` con:
  - Constantes `MIN_BET`, `MAX_BET`, `STEP`.
  - `PRIZES`: lista `{ mult, weight }` sobre un `TOTAL = 10000`.
  - `drawPrize(rand)` con `rand(10000)`.
  - `payoutOf(bet, mult)`, `validBet`, `maxBetFor`, `clampBet`, `toneOf` (para el historial).
  - Una comprobación de que `TOTAL === 10000` y de que `Σ mult·weight === 9600`.
- **Estilo:** sin punto y coma, comillas simples, paréntesis siempre en las flechas, comas finales, comentarios en español en el tono de `dungeon.js` (cabecera que explica las reglas y por qué el retorno queda en el 96 %).
- **Hecho cuando:** el módulo no importa nada del navegador (lo usa Node) y el RTP exacto es 0,96.
- **Depende de:** nada.
- **Entrega:** `claw.js` y un script de simulación fuera del producto (ver T2).

### T2. Servidor autoritativo y simulación del retorno
- **Agente:** `backend-developer`. La simulación puede hacerla `data-scientist` o `quant-analyst`.
- **Objetivo:**
  - `clawDrop(msg, balance, _saved, rand)` en `solo.mjs`: valida `bet` (y `x` opcional), comprueba `INSUFFICIENT_FUNDS`, sortea con `claw.drawPrize(rand)` y devuelve `{ delta: payout - bet, played: true, saved: null, result: { prize, x, payout, balance } }`. Errores: `BAD_MESSAGE` e `INSUFFICIENT_FUNDS`.
  - Registrar `solo_claw`, `SOLO_PLAY.claw`, el `case` en el switch, y `settlementOf` y `playSolo` como plinko (1.1).
  - Cambios de gacha de 1.4.
  - Script de simulación (Node) que llama a `clawDrop` con el `randomInt` real de `node:crypto`: al menos 10⁷ jugadas con apuestas distintas. Debe imprimir el RTP medido, la frecuencia de cada tramo, y comparar con la tabla teórica. Con σ ≈ 5,43 por unidad apostada, 10⁷ jugadas dan un error típico de ≈ 0,0017 (0,17 puntos). Aceptar retorno entre 95,5 % y 96,5 %. Además debe confirmar que el resultado no cambia con `x` (mismo `rand` fijo, distintas `x`) y que el saldo nunca queda negativo.
  - Script de comparación de poderes del gacha (0 diferencias en los 8 juegos antiguos).
- **Hecho cuando:** los dos scripts pasan y se pegan sus salidas en el informe final. Si no se ejecutan, no se afirma que pasaron.
- **Depende de:** T1.
- **Entrega:** cambios en `api/_juegos/*`, y los scripts en el directorio temporal de la sesión (no se commitean, salvo que el usuario lo pida).

### T3. Arte y escena (SVG, animaciones)
- **Agente:** `ui-designer` para el diseño visual y `react-specialist` o `frontend-developer` para `ClawArt.jsx` y `ClawScene.jsx`. Si hay que elegir uno por coste, `frontend-developer`.
- **Objetivo, a la altura del laberinto y la rana:**
  - Máquina con cristal, raíl superior, cable, pinzas que se abren y cierran, montón de cápsulas y peluches de colores, bandeja de premios y luces.
  - Cápsulas de premio con el valor visible (×200 dorada, etc.).
  - Animaciones: moverse, bajar, cerrar, subir, llevar a la bandeja y soltar. Escapada en ×0. Efecto especial en el premio gordo.
  - `prefers-reduced-motion`: sin movimiento largo, se muestra el resultado directamente.
  - Disposición móvil (la máquina cabe en 360 px de ancho, controles al alcance del pulgar).
- **Hecho cuando:** hay una escena que recibe el `prize` y la `x` y anima hacia ellos, sin lógica de azar dentro.
- **Depende de:** T1 (nombres y premios). Puede avanzar en paralelo con T2 usando un resultado simulado.
- **Entrega:** `ClawArt.jsx`, `ClawScene.jsx`, parte de `Claw.css`.

### T4. Pantalla, interacción y lobby
- **Agente:** `react-specialist`.
- **Objetivo:** `Claw.jsx` con:
  - Selector de apuesta (con `clampBet`, `maxBetFor`) y botones de mover izquierda y derecha, y de soltar.
  - Atajos de teclado (flechas, espacio o Enter) como en el laberinto.
  - Sonidos de `sound.js`, `WinBurst` en las ganancias, `useCountUp` para el saldo y el premio.
  - Historial con chips y `toneOf`.
  - Bloqueo de doble envío mientras anima, y gestión de errores (`INSUFFICIENT_FUNDS`, red).
  - El saldo en pantalla solo se actualiza al terminar la animación, pero el valor viene del servidor.
  - Aviso del poder del gacha (`reply.power`), como en los demás juegos.
  - Texto de ayuda sobre la puntería (1.2) y tabla de premios visible.
  - Entrada del lobby en `Juegos.jsx` y arte en `hub.css`. README.
- **Hecho cuando:** se juega de punta a punta contra el servidor local o el desplegado, y `npm run build` pasa.
- **Depende de:** T2 (contrato del mensaje) y T3 (escena).
- **Entrega:** `Claw.jsx`, `Claw.css`, cambios en `Juegos.jsx` y `hub.css`.

### T5. Revisión de código y de la economía
- **Agente:** `code-reviewer` (con `quant-analyst` si se usó otro agente en T1).
- **Objetivo:** revisar que:
  - El cliente no puede influir en el resultado.
  - El servidor valida todo.
  - No hay condiciones de carrera (la cuenta se bloquea con `for update` en `playSolo`).
  - El estilo coincide (sin reformatear código ajeno de `solo.mjs`).
  - Los poderes del gacha no cambiaron.
  - Los cambios en `game.mjs` no rompen plinko, rana ni laberinto.
- **Depende de:** T2 y T4.

### T6. Pruebas visuales, móvil y accesibilidad
- **Agente:** `qa-expert` y `ui-ux-tester`, con `accessibility-tester` para teclado, foco, contraste, `aria-live` del resultado y `prefers-reduced-motion`.
- **Objetivo:**
  - Ejecutar `npm run build`.
  - Capturas de escritorio y móvil: reposo, animación, premio pequeño, premio gordo (forzado en una build local o con datos simulados), sin saldo y fallo de red.
  - Revisar que no hay desbordes y que el lobby muestra bien la tarjeta nueva.
- **Depende de:** T4 y T5.

### T7. Despliegue (pasos manuales o con confirmación)
- **Agente:** ninguno específico; lo hace el orquestador o el usuario.
- Pasos:
  1. Si el esquema real obligara a una migración, escribirla en `supabase/migracion_juegos_gancho.sql` (plantilla: `migracion_juegos_laberinto.sql`, idempotente). **Aplicarla solo con confirmación del usuario**, en el proyecto Supabase `rcczscyjsnlutopvzuqu` (no el de `.env.local`). Si no hace falta migración, se omite.
  2. Con el visto bueno del usuario, `git commit` y `git push` a `main`, que despliega en Vercel. Los mensajes de commit llevan las líneas de atribución que pide el entorno.
  3. Comprobar el despliegue (estado de Vercel) y jugar una partida real con una apuesta pequeña.

## 4. Orden de ejecución

```
T1 (reglas + tabla) ──┬─> T2 (servidor + simulaciones) ──┐
                      └─> T3 (arte/escena) ──────────────┴─> T4 (pantalla) ─> T5 (revisión) ─> T6 (QA/capturas) ─> T7 (despliegue)
```

- T2 y T3 son independientes y van en paralelo cuando T1 está lista.
- T4 necesita el contrato de T2 (forma del mensaje y de la respuesta) y la escena de T3.
- T5 y T6 son secuenciales: primero se corrige lo de la revisión, luego se hacen las capturas finales.

## 5. Contratos entre agentes (ficheros compartidos)

- **Mensaje:** `{ t: 'solo_claw', bet: <entero>, x: <entero opcional> }`.
- **Respuesta (`reply.solo`):** `{ mult, payout, x, balance }`. Si hay poder del gacha, `reply.power`, como en los demás.
- `claw.js` es la única fuente de la tabla y de las constantes: la importan `solo.mjs` y la pantalla.
- Quien termine una tarea deja anotadas en su informe las rutas tocadas, para que la siguiente las lea.

## 6. Criterios de aceptación globales

- RTP teórico exacto de 96,00 %, y simulación de ≥ 10⁷ jugadas entre 95,5 % y 96,5 %.
- El resultado no depende de la posición del gancho, y el servidor es el único que sortea.
- Cero diferencias en los poderes del gacha de los 8 juegos existentes (script T2).
- `npm run build` pasa.
- Capturas de escritorio y móvil sin desbordes, y con animación reducida funcionando.
- Estilo de código del repositorio respetado y comentarios en español.
- Ninguna migración aplicada sin confirmación del usuario, y con el proyecto correcto.

## 7. Preguntas abiertas (con recomendación)

1. **Nombre.** Recomendado: «Máquina de gancho» (clave `claw`).
2. **Se añade o sustituye a otro juego.** Recomendado: se añade, sin quitar nada. Sustituir obligaría a migrar datos del gacha, como pasó con la tragamonedas.
3. **Apuesta mínima y máxima.** Recomendado: 10 a 1000 €, de 10 en 10. Depende del saldo semanal típico.
4. **Premio máximo.** Recomendado: ×200 con probabilidad 1 entre 2000 (200 000 € con la apuesta máxima). Si se quiere ×100 o ×500, se reajusta la tabla manteniendo el 96 %.
5. **Puntería.** Recomendado: cosmética (no cambia las probabilidades) y avisarlo en pantalla. Si el usuario prefiere un juego de habilidad, el retorno ya no se puede garantizar y haría falta otro diseño.
6. **Punto fuerte en gacha.** Recomendado: que `claw` no pueda ser el «punto fuerte» de las cartas existentes, para no tocar los poderes actuales. Alternativa: ampliar el sorteo y aceptar cambios.
7. **Probabilidad de no ganar nada (65,85 %).** Recomendado: dejarla, es lo que da los premios grandes. Si parece demasiado dura, se puede subir el ×0,5 y bajar el ×1 y el ×2 (hay que rehacer la suma).
8. **Scripts de simulación.** Recomendado: no commitearlos, para igualar al laberinto, cuyo script no está en el repositorio. Si se quiere dejar uno, `scripts/sim-gancho.mjs`.
9. **Migración.** Recomendado: ninguna, por ser de una jugada. Se confirma al leer el esquema real de gacha en T2.

## 8. Riesgos

- **Punto fuerte del gacha** (1.4): es el riesgo más fácil de pasar por alto. La verificación de T2 lo cubre.
- **Premio gordo y gacha:** el «premio +%» está limitado por `BONUS_CAP`. Hay que comprobar su valor antes de fijar el premio máximo.
- **Percepción de juego trucado.** Si la pantalla sugiere que la puntería importa y no es así, el jugador puede sentirse engañado. Por eso el texto de ayuda es obligatorio.
- **Animación y saldo.** Si el saldo se actualizara antes de acabar la animación, se revelaría el resultado. Hay que retrasarlo en la interfaz.
