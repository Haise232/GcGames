// Reglas puras de la Cuenta en Suiza: las usan la pantalla y el servidor (api/_juegos/suiza.mjs).
// Una cuenta numerada donde guardar el efectivo lejos de Hacienda, que solo mira el saldo.
//   - Ingresar: desde MIN_DEPOSIT. No se puede con una declaración de Hacienda pendiente (sería escaparse de pagarla).
//   - Retirar: lo ingresado esta semana sale con una comisión de FEE_NOW; lo de semanas anteriores, solo KEEP_OLD (el
//     saldo se reinicia el domingo y pasar dinero de una semana a otra apenas compensa, como en la Inmobiliaria). Se
//     saca primero lo de esta semana. Lo que se queda el banco va a la jaula del bingo.
export const MIN_DEPOSIT = 1000
export const FEE_NOW = 0.1
export const KEEP_OLD = 0.25

// Lo de esta semana y lo de antes. account: { balance, weekBalance, week } tal y como se guarda.
export function split({ balance, weekBalance, week }, currentWeek) {
  const now = week === currentWeek ? Math.min(weekBalance, balance) : 0
  return { now, old: balance - now }
}

// Lo que te dan al sacar «amount» de la cuenta.
export function withdrawal(account, amount, currentWeek) {
  const { now } = split(account, currentWeek)
  const fromNow = Math.min(amount, now)
  const fromOld = amount - fromNow
  const got = Math.floor(fromNow * (1 - FEE_NOW) + fromOld * KEEP_OLD)
  return { fromNow, fromOld, got, fee: amount - got }
}

// Número de cuenta suizo de adorno, siempre el mismo para cada jugador: «CH93 0076 2011 6238 5295 7».
export function accountNumber(userId = '') {
  const digits = [...userId.replace(/-/g, '')].map((c) => parseInt(c, 16) % 10).join('')
  const raw = `CH${digits.slice(0, 2)}0076${digits.slice(2, 15)}`
  return raw.replace(/(.{4})/g, '$1 ').trim()
}
