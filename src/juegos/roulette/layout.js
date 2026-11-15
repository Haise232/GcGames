// Las casillas del paño, compartidas por la mesa HTML (Roulette.jsx) y la 3D (roulette3d.js).
import { WHEEL, colorOf } from './roulette.js'

// Cada casilla lleva su posición en la mesa horizontal (c, r) y la columna
// que ocupa cuando la mesa se gira a vertical en pantallas estrechas (mc).
export const CELLS = [
  { id: 'n:0', n: 0, label: '0', tone: 'green', c: 1, r: 1, cs: 1, rs: 3, mc: 1 },
  ...Array.from({ length: 36 }, (_, i) => {
    const n = i + 1
    const r = 3 - ((n - 1) % 3)
    return { id: `n:${n}`, n, label: `${n}`, tone: colorOf(n), c: Math.ceil(n / 3) + 1, r, mc: 4 - r }
  }),
  ...[1, 2, 3].map((k) => ({
    id: `col:${k}`,
    label: '2 a 1',
    name: `Columna ${k}`,
    c: 14,
    r: 4 - k,
    mc: k,
  })),
  ...[1, 2, 3].map((k) => ({
    id: `dozen:${k}`,
    label: `${k}ª docena`,
    c: 2 + (k - 1) * 4,
    r: 4,
    cs: 4,
    mc: 4,
  })),
  ...[
    { id: 'low', label: '1 a 18' },
    { id: 'even', label: 'Par' },
    { id: 'red', label: 'Rojo', diamond: 'red' },
    { id: 'black', label: 'Negro', diamond: 'black' },
    { id: 'odd', label: 'Impar' },
    { id: 'high', label: '19 a 36' },
  ].map((cell, i) => ({ ...cell, c: 2 + i * 2, r: 5, cs: 2, mc: 5 })),
]

// Pista (racetrack): los números en el orden de la rueda, empezando por el 19 para que el cero quede en el centro de la
// curva de la izquierda, como en las mesas reales.
export const TRACK_ORDER = WHEEL.map((_, k) => WHEEL[(k + 3) % WHEEL.length])
