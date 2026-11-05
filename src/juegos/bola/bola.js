// Reglas puras de la Bola Canaria (Season 4): las usan la pantalla (Bola.jsx) y el servidor (api/_juegos/solo.mjs).
// En la cancha de tierra hay un mingue (la bolita blanca) al fondo. Eliges cómo tirar y tiras tu bola: cuanto más
// cerca del mingue se quede, más cobras. Tres tiros: arrimar (seguro), el tiro medio y el bochazo (a lo grande).
//
// El servidor sortea primero dónde acaba (BANDS: arrimada, cerca, a media distancia, lejos o fuera de la cancha) con
// las probabilidades de cada tiro, y después el punto exacto dentro de esa franja. En cada tiro, la suma de
// probabilidad × premio es HOUSE (el 96 %).

export const MIN_BET = 10
export const MAX_BET = 2000
export const STEP = 10
export const HOUSE = 0.96

// Franjas de distancia al mingue (en palmos de la cancha): [desde, hasta).
export const BANDS = {
  arrime: { name: '¡Arrimada!', from: 0.35, to: 0.75 },
  cerca: { name: 'Cerca', from: 0.75, to: 1.8 },
  medio: { name: 'A media distancia', from: 1.8, to: 3.2 },
  lejos: { name: 'Lejos', from: 3.2, to: 5.5 },
  fuera: { name: 'Fuera de la cancha', from: 0, to: 0 },
}
export const BAND_IDS = Object.keys(BANDS)
// La cancha: el mingue en (0, 0); se tira desde abajo (y = 13). Ancho de −5 a 5 y fondo en y = −4.
export const COURT = { left: -5, right: 5, back: -4, throwY: 13 }

// Cada tiro: probabilidad (por millón) y premio de cada franja.
export const STYLES = {
  arrimar: {
    name: 'Arrimar',
    blurb: 'Rodando suave: casi siempre queda cerca, pero paga poco.',
    bands: { arrime: [80000, 3], cerca: [320000, 1.5], medio: [400000, 0.6], lejos: [150000, 0], fuera: [50000, 0] },
  },
  medio: {
    name: 'Tiro medio',
    blurb: 'Con algo de fuerza: más premio, más riesgo.',
    bands: { arrime: [60000, 6], cerca: [220000, 2], medio: [200000, 0.8], lejos: [320000, 0], fuera: [200000, 0] },
  },
  bochazo: {
    name: 'Bochazo',
    blurb: 'Por el aire y a lo loco: la mitad acaba fuera, pero una arrimada paga ×25.',
    bands: { arrime: [20000, 25], cerca: [100000, 3], medio: [200000, 0.8], lejos: [300000, 0], fuera: [380000, 0] },
  },
}
const MILLION = 1_000_000

export const validBet = (bet) => Number.isInteger(bet) && bet >= MIN_BET && bet <= MAX_BET && bet % STEP === 0
export const validStyle = (style) => typeof style === 'string' && Object.hasOwn(STYLES, style)
export const multOf = (style, band) => STYLES[style].bands[band][1]
export const payout = (bet, mult) => Math.floor(bet * mult + 1e-6)

// La franja donde acaba la bola. rand(n): entero de 0 a n−1.
export function drawBand(style, rand) {
  let u = rand(MILLION)
  for (const id of BAND_IDS) {
    const p = STYLES[style].bands[id][0]
    if (u < p) return id
    u -= p
  }
  return 'fuera'
}

const r2 = (n) => Math.round(n * 100) / 100
// El punto exacto donde se para la bola dentro de su franja ({ x, y } en palmos, el mingue en 0, 0).
export function placeBall(band, rand) {
  const f = (n) => rand(n * 1000) / 1000 // decimal de 0 a n
  if (band === 'fuera') {
    // Por un lado o por el fondo, pasado el borde.
    const side = rand(3)
    if (side === 2) return { x: r2(f(8) - 4), y: r2(COURT.back - 0.4 - f(1)) }
    const x = side === 0 ? COURT.left - 0.4 - f(0.8) : COURT.right + 0.4 + f(0.8)
    return { x: r2(x), y: r2(f(9) - 3) }
  }
  const { from, to } = BANDS[band]
  const d = from + f(to - from)
  // Casi siempre por delante o a los lados del mingue (se tira desde abajo); a veces se pasa un poco.
  const a = ((f(250) - 125) * Math.PI) / 180 + Math.PI / 2
  return { x: r2(Math.cos(a) * d), y: r2(Math.sin(a) * d) }
}

// --- Ayudas de la pantalla ---
export const maxBetFor = (balance) => Math.min(MAX_BET, Math.floor(balance / STEP) * STEP)
export const clampBet = (bet, max) => Math.max(MIN_BET, Math.min(Math.max(max, MIN_BET), Math.round(bet / STEP) * STEP))
export const fmtMult = (m) => `×${m.toLocaleString('es-ES', { maximumFractionDigits: 2 })}`
