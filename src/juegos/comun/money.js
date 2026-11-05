// Dinero de juegos en euros, con separador de miles español: 10.000 € (espacio irrompible: el € no salta de línea).
export const eur = (n) => `${Math.round(n).toLocaleString('es-ES', { useGrouping: 'always' })}\u00a0€`

// Variación con signo y flecha: el color nunca va solo (hay quien no distingue verde y rojo).
export function delta(n) {
  if (n > 0) return `▲ +${eur(n)}`
  if (n < 0) return `▼ −${eur(-n)}`
  return '= 0\u00a0€'
}

// «2 d 5 h», «3 h 20 min», «45 min» hasta el reinicio del domingo.
export function until(at, now = Date.now()) {
  const min = Math.max(0, Math.round((at - now) / 60000))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}
