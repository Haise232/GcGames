/*
 * FrogArt: dibujo SVG de la Rana (estanque, nenúfares, rana y efectos). Solo presentación: sin lógica de juego.
 * Los estilos están en Frog.css (clases frog__*). Todo va dentro del MISMO <svg> que crea <Pond>, porque los
 * degradados (<defs>) se declaran allí y el resto los referencia por id (frog-*).
 *
 * COMPONENTES Y PROPS
 *   <Pond w={1000} h={540} label="..." tone="won"|"lost"|"" ambient={true}>   (hijos: pads, sprite, efectos)
 *       Crea el <svg viewBox> con agua, ondas, rayos de luz, peces, juncos, libélula y luciérnagas.
 *       tone: "won" baña el agua de oro un instante al cobrar; "lost" la oscurece al caer. Pónganse al liquidar y
 *       quítense (o déjense: la animación solo se dispara al cambiar el valor; para repetir, cambiar `key`).
 *       ambient={false} apaga libélula, luciérnagas y peces (el agua y las ondas se quedan).
 *   <Pad m={n} x y r={40} state="" flower="auto"|"none"|"pink"|"gold">
 *       Un nenúfar centrado en (x, y) del viewBox, con su etiqueta ×m. state = UNA de estas clases (o ''):
 *         is-here    la rana está encima (el nenúfar se hunde un poco y suelta ondas al ponerse la clase)
 *         is-past    ya superado (apagado)
 *         is-next    el siguiente salto (brillo dorado que respira + etiqueta dorada)
 *         is-splash  aquí cayó la rana: salpicadura con gotas, burbujas y ondas (Pad dibuja <Splash/> solo)
 *       flower "auto": rosa desde ×5, dorada (gran premio) desde ×9.
 *   <FrogShape sunk mood pose look puffed />
 *       Va DENTRO del <g ref className="frog__sprite"> que se anima con Web Animations (igual que hoy).
 *         sunk    boolean: se hunde y se desvanece (clase is-sunk). Si no hay mood, implica mood="scared".
 *         mood    "idle" | "scared" (ojos enormes, boca en O, gota de sudor) | "happy" (ojos ^ ^, sonrisa, mejillas)
 *         pose    "sit" | "crouch" (agachada: pásala mientras se espera al servidor o antes de saltar)
 *                 | "air" (estirada: pásala mientras dura hop). Por defecto "sit".
 *         look    {dx, dy}: vector hacia donde miran las pupilas; p. ej. pos del siguiente nenúfar menos pos
 *                 actual. Si es null mira al frente. No hace falta normalizarlo.
 *         puffed  boolean: infla el cuello (saco vocal) más que el latido normal; úsalo mientras hay partida en curso.
 *       Parpadea y respira sola. mood="happy" hace además un saltito de alegría.
 *   <Splash />   salpicadura suelta (se coloca en (0,0) de su <g>); <Pad state="is-splash"> ya la incluye.
 *   <Cheer x y />  destello dorado de victoria (anillo, rayos y estrellas) centrado en (x, y) del viewBox.
 *                  Renderízalo con `key={burst.id}` al cobrar, en la posición de padPos(at), y quítalo ~1.4 s después.
 *   Constantes exportadas: PAD_R (40).
 *
 * CLASES QUE FROG.JSX DEBE PONER (resumen)
 *   Pad:        state is-here | is-past | is-next | is-splash     (como ya hace hoy)
 *   FrogShape:  props pose/mood/look/puffed/sunk                   (NUEVO: lo que antes eran solo `sunk`)
 *   Pond:       tone="won"|"lost"                                  (NUEVO)
 *   <Cheer/>:   al cobrar con éxito                                (NUEVO)
 *   Opcional en el panel: <span className="frog__odds-bar" style={{ '--p': chance(mult) / 100 }} /> dentro de
 *   .frog__odds (medidor de probabilidad ya estilado). Y .frog__cash recibe `is-ready` cuando hay partida en curso.
 *
 * COMPATIBILIDAD CON LO QUE YA HAY
 *   - El <g ref className="frog__sprite"> sigue siendo del que anima Frog.jsx (transform: translate(px,px) en
 *     unidades del viewBox, 520 ms). El dibujo de la rana está centrado en (0,0) y los pies a ~+16, igual que antes.
 *   - Se quitan de Frog.jsx: la FrogShape local (importar la de aquí), el <ellipse frog__ripple/frog__leaf/notch> y
 *     el <text frog__mult> de cada nenúfar (los dibuja <Pad>) y el <circle frog__splash> (lo dibuja <Pad>).
 *   - Clases que ya existían y se mantienen: frog__pad, frog__leaf, frog__ripple, frog__mult, frog__splash,
 *     frog__sprite, frog__frog (+is-sunk), frog__body, frog__belly, frog__leg, frog__eye, frog__pupil, frog__mouth.
 */

export const PAD_R = 40

const TAU = Math.PI * 2

// Ondas: una senoide de periodo 160 que se repite; CSS la desplaza 160 px y vuelve a empezar sin salto.
const wavePath = (y, amp) => `M-160 ${y} q40 ${-amp} 80 0${' t80 0'.repeat(17)}`

const FIREFLIES = [
  { x: 120, y: 60, dx: 40, dy: -22, d: 0, t: 7 },
  { x: 290, y: 105, dx: -34, dy: 20, d: 2, t: 9 },
  { x: 470, y: 48, dx: 30, dy: 26, d: 4, t: 8 },
  { x: 640, y: 92, dx: -42, dy: -18, d: 1, t: 10 },
  { x: 790, y: 56, dx: 36, dy: 24, d: 3, t: 8.5 },
  { x: 915, y: 112, dx: -28, dy: -24, d: 5, t: 9.5 },
  { x: 40, y: 140, dx: 24, dy: -30, d: 6, t: 11 },
  { x: 210, y: 400, dx: 30, dy: -20, d: 2.5, t: 9 },
  { x: 560, y: 450, dx: -36, dy: 18, d: 4.5, t: 10 },
  { x: 880, y: 380, dx: 26, dy: 22, d: 1.5, t: 8 },
]

const SPARKS = [
  [60, 22, 3, 0],
  [180, 150, 2.4, 1.3],
  [340, 290, 2.8, 0.6],
  [520, 120, 2.2, 2.1],
  [700, 305, 3, 1.7],
  [860, 140, 2.4, 0.3],
  [960, 270, 2.6, 2.6],
  [430, 310, 2, 1],
  [110, 420, 2.6, 0.9],
  [300, 500, 2.2, 2.3],
  [620, 440, 2.8, 1.1],
  [780, 510, 2.4, 0.2],
  [930, 400, 2.2, 1.9],
]

function Water({ w, h, ambient }) {
  return (
    <g className="frog__water" aria-hidden="true">
      <rect className="frog__depth" x="-40" y="-40" width={w + 80} height={h + 80} fill="url(#frog-water)" />
      <g className="frog__rays">
        <polygon points={`120,-40 210,-40 90,${h + 30} -20,${h + 30}`} fill="url(#frog-ray)" />
        <polygon points={`420,-40 540,-40 400,${h + 30} 270,${h + 30}`} fill="url(#frog-ray)" />
        <polygon points={`760,-40 850,-40 760,${h + 30} 650,${h + 30}`} fill="url(#frog-ray)" />
      </g>
      {ambient && (
        <g className="frog__fish">
          <g transform={`translate(0 ${h - 38})`}>
            <g className="frog__fish-swim" style={{ '--from': '-80px', '--to': '1080px', animationDuration: '46s' }}>
              <g className="frog__fish-body">
                <path d="M0 0 C10 -7 26 -7 38 0 C26 7 10 7 0 0Z" />
                <path className="frog__fish-tail" d="M2 0 L-11 -6 L-8 0 L-11 6Z" />
              </g>
            </g>
          </g>
          <g transform={`translate(0 ${h - 68})`}>
            <g className="frog__fish-swim" style={{ '--from': '1080px', '--to': '-80px', animationDuration: '62s', animationDelay: '-24s' }}>
              <g transform="scale(-1 1) scale(.75)" className="frog__fish-body">
                <path d="M0 0 C10 -7 26 -7 38 0 C26 7 10 7 0 0Z" />
                <path className="frog__fish-tail" d="M2 0 L-11 -6 L-8 0 L-11 6Z" />
              </g>
            </g>
          </g>
        </g>
      )}
      <g className="frog__reeds">
        {[
          [14, 106, 6],
          [26, 90, -4],
          [986, 100, -6],
          [972, 84, 5],
        ].map(([x, up, lean]) => (
          <g key={x} transform={`translate(${x} ${h + 6})`}>
            <g className="frog__reed" style={{ animationDelay: `${(x % 7) * -0.6}s` }}>
              <path d={`M0 0 Q${lean * 0.5} ${-up / 2} ${lean} ${-up}`} />
              <ellipse cx={lean} cy={-up - 8} rx="3.4" ry="10" />
            </g>
          </g>
        ))}
      </g>
      {SPARKS.map(([x, y, r, d]) => (
        <circle key={x} className="frog__spark" cx={x} cy={y} r={r} style={{ animationDelay: `${d}s` }} />
      ))}
      {[
        [h * 0.3, 0.34, 11, 0, "24s"],
        [h * 0.55, 0.28, 8, 0, "17s"],
        [h * 0.8, 0.22, 6, 0, "12s"],
      ].map(([y, op, amp, , dur], i) => (
        <path
          key={y}
          className="frog__wave"
          d={wavePath(y, amp)}
          style={{ '--op': op, animationDuration: dur, animationDirection: i === 1 ? 'reverse' : 'normal' }}
        />
      ))}
      {ambient && (
        <>
          <g className="frog__dragonfly-fly">
            <g className="frog__dragonfly" transform="translate(0 72)">
              <path className="frog__dragonfly-body" d="M-14 0 L16 0" />
              <circle className="frog__dragonfly-head" cx="17" cy="0" r="2.6" />
              <g className="frog__wings">
                <ellipse cx="6" cy="-6" rx="9" ry="2.6" transform="rotate(-18 6 -6)" />
                <ellipse cx="-2" cy="-5" rx="9" ry="2.4" transform="rotate(-8 -2 -5)" />
                <ellipse cx="6" cy="6" rx="9" ry="2.6" transform="rotate(18 6 6)" />
                <ellipse cx="-2" cy="5" rx="9" ry="2.4" transform="rotate(8 -2 5)" />
              </g>
            </g>
          </g>
          {FIREFLIES.map((f) => (
            <g key={f.x} transform={`translate(${f.x} ${f.y})`}>
              <g
                className="frog__firefly"
                style={{ '--dx': `${f.dx}px`, '--dy': `${f.dy}px`, animationDuration: `${f.t}s`, animationDelay: `${-f.d}s` }}
              >
                <circle className="frog__firefly-glow" r="7" />
                <circle className="frog__firefly-dot" r="1.9" />
              </g>
            </g>
          ))}
        </>
      )}
    </g>
  )
}

export function Pond({ w = 1000, h = 540, label, tone = '', ambient = true, children }) {
  return (
    <svg className={`frog__svg ${tone ? `is-${tone}` : ''}`} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <defs>
        <linearGradient id="frog-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b8f96" />
          <stop offset="0.45" stopColor="#176575" />
          <stop offset="1" stopColor="#0a3347" />
        </linearGradient>
        <linearGradient id="frog-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9fbff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#d9fbff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="frog-leaf" cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#7fd685" />
          <stop offset="0.55" stopColor="#3f9d55" />
          <stop offset="1" stopColor="#2b7a42" />
        </radialGradient>
        <radialGradient id="frog-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.45" stopColor="#ffe27a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffe27a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="frog-firefly" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f8ffa8" stopOpacity="0.85" />
          <stop offset="1" stopColor="#f8ffa8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="frog-petal" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff2f4" />
          <stop offset="1" stopColor="#f07aa6" />
        </linearGradient>
        <linearGradient id="frog-petal-gold" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="1" stopColor="#f0b429" />
        </linearGradient>
        <radialGradient id="frog-body" cx="0.4" cy="0.25" r="0.85">
          <stop offset="0" stopColor="#a8e56a" />
          <stop offset="0.6" stopColor="#74c63f" />
          <stop offset="1" stopColor="#4f9f2c" />
        </radialGradient>
        <linearGradient id="frog-belly" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2fbc4" />
          <stop offset="1" stopColor="#cbeb92" />
        </linearGradient>
      </defs>
      <Water w={w} h={h} ambient={ambient} />
      <rect className="frog__wash" x="-40" y="-40" width={w + 80} height={h + 80} />
      {children}
    </svg>
  )
}

const pt = (r, ry, a) => [r * Math.cos(a), ry * Math.sin(a)]

function leafPath(r) {
  const ry = r * 0.42
  const [ax, ay] = pt(r, ry, -0.1)
  const [bx, by] = pt(r, ry, 0.34)
  const f = (n) => n.toFixed(1)
  return `M0 0 L${f(ax)} ${f(ay)} A${r} ${f(ry)} 0 1 0 ${f(bx)} ${f(by)}Z`
}

function veinsPath(r) {
  const ry = r * 0.42
  let d = ''
  for (let a = 0.7; a < TAU - 0.5; a += 0.62) {
    const [x, y] = pt(r * 0.9, ry * 0.9, a)
    const [cx, cy] = pt(r * 0.5, ry * 0.5, a + 0.12)
    d += `M0 0 Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
  }
  return d
}

const PETAL = 'M0 0 C-7 -8 -6 -20 0 -27 C6 -20 7 -8 0 0Z'

function Lotus({ gold }) {
  const fill = gold ? 'url(#frog-petal-gold)' : 'url(#frog-petal)'
  return (
    <g className={`frog__lotus ${gold ? 'frog__lotus--gold' : ''}`} transform={`translate(25 -9) scale(${gold ? 0.95 : 0.7})`}>
      {gold && <circle className="frog__lotus-halo" r="30" cy="-12" fill="url(#frog-glow)" />}
      <g className="frog__lotus-bloom">
        {[-64, -32, 0, 32, 64].map((a) => (
          <path key={a} className="frog__petal" d={PETAL} fill={fill} transform={`rotate(${a})`} />
        ))}
        {[-46, -15, 15, 46].map((a) => (
          <path key={a} className="frog__petal frog__petal--front" d={PETAL} fill={fill} transform={`rotate(${a}) scale(.8)`} />
        ))}
        <circle className="frog__lotus-heart" cy="-5" r="3.4" />
      </g>
    </g>
  )
}

export function Splash() {
  const drops = [
    [-46, -52, 0],
    [-34, -72, 0.03],
    [-20, -88, 0.01],
    [-6, -96, 0.05],
    [8, -92, 0.02],
    [22, -84, 0.04],
    [36, -68, 0],
    [50, -50, 0.06],
  ]
  return (
    <g className="frog__splash" aria-hidden="true">
      {[0, 0.12, 0.26].map((d) => (
        <ellipse key={d} className="frog__splash-ring" rx="12" ry="5" style={{ animationDelay: `${d}s` }} />
      ))}
      <path className="frog__splash-column" d="M-9 4 C-8 -22 -4 -40 0 -52 C4 -40 8 -22 9 4Z" />
      {drops.map(([dx, up, d]) => (
        <circle
          key={dx}
          className="frog__drop"
          r={dx % 3 === 0 ? 3.4 : 2.6}
          style={{ '--dx': `${dx}px`, '--up': `${up}px`, animationDelay: `${d}s` }}
        />
      ))}
      {[-14, -4, 9, 18].map((x, i) => (
        <circle key={x} className="frog__bubble" cx={x} cy="6" r={2 + (i % 2)} style={{ animationDelay: `${0.15 + i * 0.16}s` }} />
      ))}
    </g>
  )
}

// value: lo que cobrarías al llegar (texto corto, «150 €»), o null.
export function Pad({ m, x, y, r = PAD_R, state = '', flower = 'auto', value = null }) {
  const kind = flower === 'auto' ? (m >= 9 ? 'gold' : m >= 5 ? 'pink' : 'none') : flower
  const d = leafPath(r)
  const ry = r * 0.42
  return (
    <g className={`frog__pad ${state}`} transform={`translate(${x} ${y})`}>
      <ellipse className="frog__shade" rx={r + 6} ry={ry + 4} cy="9" />
      <ellipse className="frog__ripple" rx={r + 12} ry={(r + 12) * 0.42} cy="6" />
      <ellipse className="frog__ripple frog__ripple--2" rx={r + 12} ry={(r + 12) * 0.42} cy="6" />
      <ellipse className="frog__halo" rx={r + 24} ry={ry + 14} cy="2" fill="url(#frog-glow)" />
      <g className="frog__pad-body">
        <path className="frog__leaf-edge" d={d} transform="translate(0 4.5)" />
        <path className="frog__leaf" d={d} fill="url(#frog-leaf)" />
        <path className="frog__veins" d={veinsPath(r)} />
        <ellipse className="frog__leaf-shine" cx={-r * 0.28} cy={-ry * 0.38} rx={r * 0.3} ry={ry * 0.2} />
        {kind !== 'none' && <Lotus gold={kind === 'gold'} />}
      </g>
      <g className={`frog__tag ${value ? 'frog__tag--value' : ''}`}>
        <rect className="frog__tag-bg" x={value ? -36 : -26} y="17" width={value ? 72 : 52} height={value ? 40 : 24} rx="12" />
        <text className="frog__mult" y={value ? 28 : 29.5}>
          ×{m}
        </text>
        {value && (
          <text className="frog__value" y="46">
            {value}
          </text>
        )}
      </g>
      {state.includes('is-splash') && <Splash />}
    </g>
  )
}

const star = 'M0 -9 Q1.4 -1.4 9 0 Q1.4 1.4 0 9 Q-1.4 1.4 -9 0 Q-1.4 -1.4 0 -9Z'

export function Cheer({ x, y }) {
  const stars = [-90, -50, -10, 30, 70, 110, 150, 190]
  return (
    <g className="frog__cheer" transform={`translate(${x} ${y - 14})`} aria-hidden="true">
      <circle className="frog__cheer-flash" r="26" fill="url(#frog-glow)" />
      <circle className="frog__cheer-ring" r="14" />
      <circle className="frog__cheer-ring frog__cheer-ring--2" r="14" />
      {stars.map((a, i) => (
        <g key={a} transform={`rotate(${a})`}>
          <path
            className="frog__cheer-star"
            d={star}
            style={{ '--far': `${58 + (i % 3) * 16}px`, animationDelay: `${(i % 4) * 0.04}s`, scale: i % 2 ? 0.75 : 1 }}
          />
        </g>
      ))}
    </g>
  )
}

export function FrogShape({ sunk = false, mood, pose = 'sit', look = null, puffed = false }) {
  const m = mood ?? (sunk ? 'scared' : 'idle')
  let px = 0
  let py = 0
  if (look && (look.dx || look.dy)) {
    const len = Math.hypot(look.dx, look.dy)
    px = (look.dx / len) * 3
    py = (look.dy / len) * 2.4
  }
  const eyes = m !== 'happy'
  return (
    <g
      className={`frog__frog is-${pose} is-${m} ${sunk ? 'is-sunk' : ''} ${puffed ? 'is-puffed' : ''}`}
    >
      <g className="frog__cheer-hop">
        {/* patas traseras y pies palmeados */}
        {[-1, 1].map((s) => (
          <g key={s} className={`frog__haunch ${s < 0 ? 'frog__haunch--l' : 'frog__haunch--r'}`}>
            <ellipse className="frog__leg" cx={17 * s} cy="7" rx="11" ry="8" transform={`rotate(${-22 * s} ${17 * s} 7)`} />
            <g className="frog__foot">
              <ellipse className="frog__leg" cx={25 * s} cy="15.5" rx="10" ry="3.8" />
              {[-6, 0, 6].map((o) => (
                <circle key={o} className="frog__toe" cx={25 * s + o * s + 3 * s} cy="16.5" r="2.1" />
              ))}
            </g>
          </g>
        ))}
        <g className="frog__torso">
          <ellipse className="frog__body" cx="0" cy="0" rx="22" ry="16" fill="url(#frog-body)" />
          <circle className="frog__spot" cx="-8" cy="-5" r="2.6" />
          <circle className="frog__spot" cx="8" cy="-7" r="2.1" />
          <circle className="frog__spot" cx="14" cy="-1" r="1.7" />
          <circle className="frog__spot" cx="-15" cy="0" r="1.6" />
          <ellipse className="frog__belly" cx="0" cy="7" rx="13" ry="8" fill="url(#frog-belly)" />
          <ellipse className="frog__sac" cx="0" cy="3.5" rx="8" ry="4.6" />
          {/* ojos */}
          {[-1, 1].map((s) => (
            <g key={s}>
              <circle className="frog__rim" cx={10 * s} cy="-14" r="9.6" />
              {eyes ? (
                <g className="frog__eyeball">
                  <circle className="frog__eye" cx={10 * s} cy="-14" r="7.6" />
                  <g className="frog__look" style={{ transform: `translate(${px}px, ${py}px)` }}>
                    <g className="frog__pupil-wrap">
                      <circle className="frog__pupil" cx={10 * s} cy="-14" r="3.9" />
                      <circle className="frog__glint" cx={10 * s + 1.4} cy="-15.6" r="1.3" />
                    </g>
                  </g>
                </g>
              ) : (
                <path className="frog__joy" d={`M${10 * s - 6} -13 Q${10 * s} -22 ${10 * s + 6} -13`} />
              )}
            </g>
          ))}
          {m === 'idle' && <path className="frog__mouth" d="M-10 -0.5 Q0 5.5 10 -0.5" />}
          {m === 'scared' && <ellipse className="frog__mouth frog__mouth--o" cx="0" cy="3" rx="3.6" ry="4.6" />}
          {m === 'happy' && (
            <>
              <path className="frog__mouth frog__mouth--open" d="M-11 -1.5 Q0 13 11 -1.5Z" />
              <path className="frog__tongue" d="M-4 6 Q0 10 4 6 Q0 4.6 -4 6Z" />
              <circle className="frog__blush" cx="-17" cy="-3" r="3.6" />
              <circle className="frog__blush" cx="17" cy="-3" r="3.6" />
            </>
          )}
          {m === 'scared' && <path className="frog__sweat" d="M21 -22 C25 -16 26 -13 21 -11 C16 -13 17 -16 21 -22Z" />}
        </g>
        {/* bracitos delanteros */}
        {[-1, 1].map((s) => (
          <g key={s} className="frog__arm">
            <ellipse className="frog__leg" cx={9 * s} cy="13" rx="4" ry="5" />
            <ellipse className="frog__leg" cx={10 * s} cy="17" rx="5.6" ry="2.5" />
          </g>
        ))}
      </g>
    </g>
  )
}
