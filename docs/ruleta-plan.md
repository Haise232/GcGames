# Plan: ruleta lista para jugar + control de la banca sobre el bote (bola dorada)

Todo vive dentro de `/juegos` (nada en el Layout global). Al terminar cada bloque: commit + push.

## 0. Hallazgo que cambia el diseño (confirmar con el usuario antes de la fase 2)

La bola dorada y el bote (la "jaula") **ya existen, pero en el Bingo, no en la ruleta**:

- `packages/web/src/juegos/bingo.js` `settle()` (l.114-141): el bote lo cobra quien canta bingo con la bola 66 o antes (`early`) **o** justo con la bola dorada (`gold`). Dos puertas al bote, y las dos hay que controlar.
- `api/_juegos/bingo.mjs`: `goldenOf()` (HMAC `bingo-oro:<ronda>`, 1 de cada 90), `pay()` (l.147-200, transacción con `select ... for update` sobre `juegos_bingo`), `feed()` (el bote crece con el 25 % de los cartones y con lo que se pierde en el resto del casino).
- La ruleta ya alimenta esa jaula: `playSolo` (game.mjs l.691) llama a `bingo.feed` con lo perdido en cualquier juego liquidado. Verificar que `settlementOf('roulette', ...)` devuelve algo, o la ruleta no aporta.
- La jaula se vacía con el reinicio semanal (domingo 23:59, `engine/week.mjs`, zona `WEEK_TZ`).

Lo que describe el usuario ("que no se lo lleven todo el lunes ni salga varias veces seguidas") encaja con esto. **Recomendación: poner el control de la banca sobre el bote/bola dorada del Bingo (fase 2A).** Una bola dorada nueva dentro de la ruleta (fase 2B) es opcional, más grande y solo si el usuario lo confirma. La ruleta de hoy no tiene bote propio.

Pregunta a resolver: "¿La bola dorada que quieres controlar es la del Bingo (que ya existe) o quieres una nueva en la ruleta?"

## 1. Ruleta: reabrir y quitar la confusión

### 1.1 Reabrir (3 sitios, hay que tocar los 3)
| Archivo | Cambio |
|---|---|
| `packages/web/src/juegos/Roulette.jsx` l.375 | quitar `const CLOSED = true`, y los usos en l.487 y l.570-573 |
| `packages/web/src/juegos/Juegos.jsx` l.58-59 | quitar `off: true` y poner un `blurb` real ("Mesa en vivo, una tirada cada 25 s") |
| `api/_juegos/game.mjs` l.804 y l.895-898 | quitar `ROULETTE_CLOSED` y el bloqueo; limpiar `OUT_OF_SERVICE` (l.65) si no lo usa nadie más |

No se sabe por qué se cerró. Preguntar si fue por un fallo o por carga: cada cliente hace `sync` cada ronda (25 s) y a los 8,4 s pide ganadores, y cada `sync` lanza varias consultas (`soloPlayers`, `soloWinners`). Antes de abrir a todos, revisar el coste en BD con unos pocos jugadores a la vez.

### 1.2 Puntos de confusión en `Roulette.jsx` y arreglo propuesto
1. **El resultado desaparece a los 2 s.** `mine` solo vale si `live.last.round === round`. Como la fase `result` dura 2 s (25-15-8), al empezar la ronda siguiente el "Perdiste X" / "Has ganado X" se borra. Las pérdidas solo se ven 2 s y sin animación.
   Arreglo: panel fijo "Tu última jugada" (número, lo apostado, ganado/perdido, tags de relámpago y racha) que se mantiene hasta la siguiente tirada. Usar `live.last` sin filtrar por ronda.
2. **Relámpago sin explicar.** Los números relámpago solo se conocen tras el "no va más" (`rouletteView` los entrega solo al revelar), así que no se pueden elegir. Hoy aparece "Relámpago en 7, 12." sin más (l.562) y la explicación está oculta en la ayuda (l.624).
   Arreglo: texto claro ("Pago sorpresa: si la bola cae en un número marcado ⚡ y tenías ficha a pleno, cobras ×50 a ×150"); animación o resalte del ⚡ al revelarse; leyenda corta bajo la mesa. No adelantar los números: cambiaría la ventaja de la casa.
3. **Racha engañosa.** El HUD dice "+5% si ganas", pero solo cuenta si ganas **al menos el doble de lo apostado** (`settle`: `profit >= stake`). Quien gana con rojo/negro cree que se le rompe una promesa.
   Arreglo: etiqueta "Racha (ganar ×2 o más)" y "+5% si ganas ×2 o más"; tooltip y ayuda coherentes.
4. **Fichas sin confirmación visible.** No hay botón de confirmar (se envían solas a los 300 ms). El único aviso es una línea pequeña en `detail`. Si el servidor rechaza, `REJECTED` revierte las fichas **sin decir nada** (l.466-468, 477).
   Arreglo: mensaje explícito cuando se revierte ("No se pudo guardar tu apuesta, vuelve a ponerla"); indicador "✓ Apuesta guardada" más visible; usar el mensaje de `juegos.error` sin pisar el resto.
5. **Quitar una apuesta concreta es imposible.** Solo hay Deshacer (la última) y Quitar todo. Las casillas muestran un número pelado (`stack`), no una ficha.
   Arreglo: pintar el montón como ficha del color de su valor y permitir quitar con clic derecho o pulsación larga o un modo "borrar". Mínimo: ficha visible.
6. **Fichas deshabilitadas sin motivo.** `disabled={available < value}` no explica nada.
   Arreglo: `title` o texto "No te llega el saldo".
7. **Fases poco claras.** El aro de cuenta atrás solo cuenta en apuestas; luego muestra `•` y `✓`. Entrar a mitad de ronda da "No va más" sin decir cuánto falta.
   Arreglo: mostrar siempre "Próxima ronda en Ns" y las tres fases como pasos (Apuestas, Bola, Resultado).
8. **Pista (racetrack) incomprensible.** Pestaña "Pista" con 37 círculos y sectores con jerga (Tercio, Huérfanos, Vecinos del cero, Juego cero). El `title` de los sectores no se ve en móvil.
   Arreglo: subtítulo fijo bajo la pestaña ("Toca un número: apuestas a él y a sus 2 vecinos en la rueda = 5 fichas") y texto visible con el coste en fichas y euros de cada sector.
9. **Mesa sin pagos a la vista.** Los pagos solo están en la ayuda. Arreglo: pagos en una línea bajo la mesa (Pleno 30:1 · Docena/columna 2:1 · Resto 1:1; ojo: pleno paga 30 a 1, no 35).
10. **Ayuda escondida.** Está dentro del grupo de botones de arriba y "Juegos" como etiqueta de salida es ambigua.
   Arreglo: mostrar la ayuda corta la primera vez (localStorage) y renombrar "Juegos" a "Salir".
11. **Estadísticas Calientes/Fríos** sin explicar, y `side` (rueda + stats) va antes que la mesa en el DOM. Verificar en `Roulette.css` el orden en móvil: la mesa debe verse sin hacer scroll.
12. **Mensajes del servidor.** Comprobar en `ERRORS` de `game.mjs` los textos de `BETS_CLOSED`, `INSUFFICIENT_FUNDS`, `BAD_MESSAGE`; la pantalla debe mostrarlos en español claro.

Archivos: `Roulette.jsx`, `Roulette.css`, `Juegos.jsx` (tile). Reglas puras (`roulette.js`) no cambian salvo exportar constantes de texto si hace falta.

## 2A. Bote y bola dorada controlados por la banca (Bingo, recomendado)

### Reglas de la banca (el master decide)
Estado por defecto: **cerrado** (nadie cobra bote hasta que el master lo abre).
- `modo`: `cerrado` | `abierto` (hasta una hora concreta). Presets de apertura: 30 min, 1 h, 2 h, 4 h.
- `dias`: días de la semana en que puede salir (por defecto todos; el master desmarca el lunes). Se calcula con `WEEK_TZ`.
- `enfriamiento_min`: mínimo entre dos premios (30, 60, 120, 240; por defecto 60). Resuelve "varias seguidas".
- `max_semana`: máximo de premios del bote por semana (1 a 3; por defecto 2).
- `una_vez`: se cierra solo tras repartir un bote (por defecto activado). Garantiza "un premio por apertura".
- (Opcional v2) `forzar_siguiente`: la bola dorada de la próxima ronda con cartones pasa a ser la bola del bingo, para que el bote salga seguro. Cambia el sorteo, así que se guarda en la fila de la ronda y se muestra en el historial.

### Equidad en el servidor
El sorteo sigue siendo HMAC por ronda (no se toca `goldenOf`/`orderOf`). Lo que decide la banca es **si esa ronda puede dar bote**, y esa decisión se **congela una vez por ronda**:
- Al revelarse la ronda (`outcomeOf`, primera vez), en una transacción: `select control from juegos_bingo for update` y `insert into juegos_bote_rondas (ronda, permitido, motivo) ... on conflict (ronda) do nothing returning`. Si no insertó, lee la fila existente.
- `outcomeOf` y `pay()` leen **la misma fila**. Así la pantalla (que anuncia `goldenHit`/`jackpot` antes del pago) y el pago nunca discrepan, aunque el master cambie el control a mitad de partida. El cambio vale desde la siguiente ronda no revelada.
- Antes de decidir la ronda r hay que haber pagado la r-1 (`await settleDue()`); si no está pagada, `permitido=false`, motivo `anterior sin pagar` (falla hacia no dar). Evita que el contador esté desfasado y salgan dos seguidas.
- Un solo premio por apertura: `pay()` ya corre bajo `for update` en `juegos_bingo` y `paid` evita pagar dos veces. En esa misma transacción, si hubo reparto de bote (`sum(prizes.pot) > 0`), se actualizan contadores (`premios_semana`, `ultimo_premio_ms`, `ultima_ronda`) y, con `una_vez`, `modo='cerrado'`.
- `bingo.settle(cards, order, pot, golden, allowJackpot = true)`: `jackpot = allowJackpot && (early || gold) && pot > 0`. Si no se permite, el bote no se reparte y sigue creciendo.
- Contador semanal: se reinicia al cambiar `semana` (mismo `rollover`), junto con la jaula.

### Modelo de datos: `supabase/migracion_juegos_bote.sql` (y el mismo SQL en `SCHEMA_SQL` de `api/_juegos/schema.mjs`)
```sql
alter table public.juegos_bingo add column if not exists control jsonb not null default '{"modo":"cerrado"}'::jsonb;
-- control: { modo, hasta, dias, enfriamiento_min, max_semana, una_vez, semana, premios_semana, ultimo_premio_ms, ultima_ronda }

create table if not exists public.juegos_bote_rondas (
  ronda     bigint primary key,
  permitido boolean not null,
  motivo    text not null,
  premio    bigint not null default 0,
  creada    timestamptz not null default now()
);
alter table public.juegos_bote_rondas enable row level security;
alter table public.juegos_bote_rondas owner to juegos_api;
revoke all on public.juegos_bote_rondas from anon, authenticated, service_role;
```
- Propietario `juegos_api`, RLS sin políticas y revoke, como `migracion_juegos_banca.sql`.
- No hay juego nuevo en `juegos_solo`, así que **no hace falta ampliar su check**. Si se añadiera uno, hay que ampliarlo en la migración y en `schema.mjs` l.50.
- Limpieza de filas antiguas en `sweep`/reinicio semanal.
- Comprobar que `juegos_bingo` ya tiene propietario `juegos_api` (migracion_juegos_bingo.sql) antes de alterarla.

### Código nuevo y tocado
- `api/_juegos/bote.mjs` (nuevo): `boteDecision(control, {now, week, round, prevPaid})` pura (devuelve `{permitido, motivo}`), `freezeRound(q, round)`, `recordHit(q, round, amount)`, validación de `control` (`cleanControl`).
- `api/_juegos/bingo.mjs`: `outcomeOf` y `pay` usan `freezeRound`; `view` añade `bote: { abierto, hasta }` público.
- `packages/web/src/juegos/bingo.js`: parámetro `allowJackpot` en `settle`.
- `api/_juegos/banca.mjs`: mensajes nuevos (ver abajo) en `MASTER_ONLY` y `status()` con `bote` público. `game.mjs` no cambia: ya enruta todo `banca*` en l.840.

### Mensajes de API
| `msg.t` | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `banca_bote` | master | `{ accion: 'set', modo, minutos?, dias?, enfriamiento_min?, max_semana?, una_vez? }` o `{ accion: 'cerrar' }` | `{ banca: { bote: control } }` |
| `banca_bote_estado` | master | `{}` | control + contadores + bote actual + últimas 10 rondas de `juegos_bote_rondas` |
| `banca` (ya existe) | todos | | añade `bote: { abierto, hasta }` (sin reglas internas) |

Errores: `BAD_MESSAGE` (valores fuera de rango o días no válidos), `NOT_MASTER` (ya existe). Tras guardar, `ping(BANK_TOPIC)` para que las pantallas actualicen la etiqueta.

### Panel de la banca
`packages/web/src/juegos/banca/BancaPanel.tsx`: nueva pestaña `'bote'` en el tipo `Tab` (l.18) y en la lista de pestañas (l.170-175), con su bloque como el de `abuso` (l.290). Tipos y llamada en `banca.ts`; estilos en `banca-panel.css`.
Contenido: estado grande (Cerrado / Abierto hasta HH:MM), bote actual, botones "Abrir 30 min / 1 h / 2 h / 4 h" y "Cerrar ya", días L M X J V S D (desmarcar lunes), enfriamiento, máximo por semana, interruptor "cerrar tras un premio", aviso "Aplica desde la ronda que empieza en mm:ss" y tabla de las últimas rondas (hora, permitido, motivo, premio, ganador).

### Pantalla del Bingo
`Bingo.jsx`: etiqueta pública "Bote abierto / cerrado por la banca" junto a "Bote en la jaula" (l.343), y en la ayuda (l.329-333) decir que la banca decide cuándo se puede cobrar. Si una ronda no puede dar bote, no animar el dorado como premio. Transparencia: los jugadores deben saber que el bote tiene ventanas, o parecerá un fallo.

## 2B. Bola dorada propia en la ruleta (solo si el usuario lo confirma)
- Idea: `drawRound` añade `golden` (HMAC `ruleta-oro:<ronda>`, probabilidad baja) y solo vale si la fila congelada de la ronda lo permite (misma tabla, con prefijo de juego o columna `juego`).
- Problema abierto: la ruleta se liquida por jugador (`rouletteLive`) sin conocer a los otros ganadores. Repartir el bote entre varios exige liquidar por ronda (como `pay()` del bingo) y repartir por fichas a pleno en el número dorado. Es bastante más trabajo y riesgo. Pagar con `juegos_bingo.bote` evita una segunda jaula.
- Además la UI tendría que enseñar que el número dorado se sabe después del "no va más".

## 3. Subtareas, dependencias y tipo de especialista
(No he leído un catálogo de agentes para esta tarea: los tipos son orientativos.)

| # | Subtarea | Archivos | Depende de | Especialista |
|---|---|---|---|---|
| S0 | Confirmar 2A vs 2B y por qué se cerró la ruleta | | | humano |
| S1 | Reabrir ruleta (3 sitios) y revisar carga/ERRORS | `Roulette.jsx`, `Juegos.jsx`, `game.mjs` | S0 (motivo del cierre) | desarrollador full-stack Node/React |
| S2 | UX de la ruleta (puntos 1-12) | `Roulette.jsx`, `Roulette.css` | | desarrollador React + diseñador UX/accesibilidad |
| S3 | Migración + `schema.mjs` + `bote.mjs` + `settle(allowJackpot)` | `supabase/migracion_juegos_bote.sql`, `schema.mjs`, `bote.mjs`, `bingo.js` | S0 | especialista Postgres/SQL y backend Node |
| S4 | Enganchar `outcomeOf`/`pay`/`view` al bote congelado | `bingo.mjs` | S3 | backend Node (concurrencia y transacciones) |
| S5 | Mensajes `banca_bote*` | `banca.mjs` | S3 | backend Node |
| S6 | Pestaña Bote del panel | `BancaPanel.tsx`, `banca.ts`, `banca-panel.css` | S5 | desarrollador React/TypeScript |
| S7 | Etiqueta y ayuda en el Bingo | `Bingo.jsx` | S5 | desarrollador React |
| S8 | Pruebas y revisión de equidad | ver abajo | S1-S7 | QA + revisor de seguridad |

Orden: S1 y S2 son independientes de S3-S7 y pueden ir en paralelo. Cadena del bote: S3, luego S4 y S5 en paralelo, luego S6 y S7 en paralelo, luego S8. Hay que aplicar la migración en Supabase antes de desplegar S4 (si no, `schema.mjs` la crea sola al arrancar; es idempotente). Usar una consulta por llamada con el MCP de Supabase.

## 4. Pruebas
No encontré archivos de test en el repo; el único script de calidad de la raíz que vi es `npm run lint` y `npm run build`. Propuesta: tests con `node --test` en `api/_juegos/bote.test.mjs`.
- `boteDecision`: cerrado, abierto vigente y expirado, día excluido (lunes), enfriamiento, `max_semana`, cambio de semana, ronda anterior sin pagar.
- `settle` con `allowJackpot=false`: nadie cobra bote, `potAfter` no baja.
- Congelación: dos llamadas a `freezeRound` de la misma ronda devuelven lo mismo aunque el control cambie entre medias.
- Un solo premio por apertura: con `una_vez`, la ronda siguiente sale `permitido=false`; dos `pay` simultáneos solo reparten una vez.
- Mensajes: un no-master recibe `NOT_MASTER`; valores raros dan `BAD_MESSAGE`.
Manual (con dos navegadores):
1. Ruleta: entrar a mitad de ronda, apostar, recargar, rechazar una apuesta (sin saldo), perder y comprobar que el resultado se mantiene; probar en móvil y con teclado.
2. Bote: panel cerrado, esperar un bingo temprano y ver que el bote no se reparte y sigue creciendo; abrir 30 min y comprobar que sale una sola vez y se cierra; desmarcar el día actual y comprobar que no sale; `npm run lint` y `npm run build`.

## 5. Riesgos y preguntas abiertas
- **Ambigüedad de alcance** (sección 0): la bola dorada existe en el Bingo, no en la ruleta.
- Poder de la banca sobre el bote es una decisión de equidad: recomiendo que sea visible para los jugadores (etiqueta y registro por ronda) y que el master no pueda dárselo a un jugador concreto; solo abrir o cerrar el bote para todos.
- "Forzar el siguiente" altera el sorteo; dejarlo fuera de la primera versión salvo petición expresa.
- Si el master abre el bote y nadie tiene cartones en la ronda, `una_vez` no debe cerrarlo (solo cierra cuando hay reparto real).
- La decisión se congela al revelar la ronda: el efecto de abrir o cerrar tarda hasta una ronda (4 min); el panel debe decirlo.
- `WEEK_TZ` por defecto es `Atlantic/Canary`: confirmar que "lunes" es el de esa zona.
- Coste de BD del `sync` de la ruleta al reabrirla (ver 1.1).
