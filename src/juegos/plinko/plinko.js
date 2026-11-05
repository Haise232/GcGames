// Reglas puras de Plinko: las usa la pantalla para pintar y el servidor (api/_juegos) para resolver la bola con el
// saldo semanal. La bola cae por ROWS filas de clavos y en cada una rebota a la izquierda o a la derecha (50 %):
// la casilla final es el número de rebotes a la derecha (0 a ROWS).
export const ROWS = 12
export const BETS = [10, 20, 50, 100, 250]

// Multiplicadores de la orilla al centro; la otra mitad es simétrica. Retorno de cada tabla (exacto, por la
// binomial): bajo 97,5 %, medio 97,8 %, alto 97,4 %. Por debajo del 100 % para que el Score no se pueda «cultivar».
const HALVES = {
  low: [8, 3, 1.5, 1.3, 1.1, 1, 0.5],
  medium: [30, 11, 4, 1.9, 1.1, 0.6, 0.3],
  high: [170, 24, 8, 2.1, 0.6, 0.2, 0.2],
}
const mirror = (half) => [...half, ...half.slice(0, -1).reverse()]
export const MULTIPLIERS = Object.fromEntries(Object.entries(HALVES).map(([risk, half]) => [risk, mirror(half)]))
export const RISKS = [
  { id: 'low', name: 'Bajo' },
  { id: 'medium', name: 'Medio' },
  { id: 'high', name: 'Alto' },
]

export const validBet = (bet) => BETS.includes(bet)
export const validRisk = (risk) => Object.hasOwn(MULTIPLIERS, risk)

// Recorrido de una bola: 0 = izquierda, 1 = derecha en cada fila. rand(n): entero de 0 a n-1 (en el servidor,
// randomInt de node:crypto).
export const dropPath = (rand) => Array.from({ length: ROWS }, () => rand(2))

export const slotOf = (path) => path.reduce((sum, step) => sum + step, 0)

// Lo que paga una bola (con la apuesta incluida). Con apuestas de 10 en 10 y multiplicadores de una cifra decimal
// sale siempre entero; el redondeo es por si acaso.
export const payoutOf = (bet, risk, slot) => Math.round(bet * MULTIPLIERS[risk][slot])
