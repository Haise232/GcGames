// Tema de Halloween de Juegos: solo cambia el aspecto (la clase .halloween en .juegos-root), nunca reglas ni saldos.
// Se enciende solo del 27/10 al 1/11 en hora de Canarias, la misma zona que el reinicio semanal, para que todos lo vean
// a la vez aunque el navegador esté en otra zona. Va por día y mes, así que vuelve solo cada año sin tocar nada.
// Para verlo antes o apagarlo: ?halloween=1 / ?halloween=0 en la dirección, o el selector del panel de la banca, que
// lo guarda en este navegador (solo lo ve quien lo elige; a los demás les sigue mandando la fecha).
import { useEffect, useState } from 'react'

const ZONA = 'Atlantic/Canary'
const DESDE = '10-27'
const HASTA = '11-01'
const KEY = 'juegos-halloween' // 'on' | 'off'; sin valor, por fechas
const EVENT = 'juegos:halloween'

// «MM-DD» de ese instante en Canarias.
function diaCanarias(ahora) {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, month: '2-digit', day: '2-digit' }).formatToParts(ahora)
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value
  return `${valor('month')}-${valor('day')}`
}

export function enFechas(ahora = new Date()) {
  const dia = diaCanarias(ahora)
  return dia >= DESDE && dia <= HASTA
}

// 'auto' | 'on' | 'off': lo elegido en el panel de la banca para este navegador.
export function preferencia() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'on' || v === 'off' ? v : 'auto'
  } catch {
    return 'auto' // sin almacenamiento: por fechas
  }
}

export function setPreferencia(valor) {
  try {
    if (valor === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, valor)
  } catch {
    // sin almacenamiento: solo dura hasta recargar (el aviso de abajo lo aplica igual)
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: valor }))
}

export function halloweenActivo(ahora = new Date(), search = typeof window === 'undefined' ? '' : window.location.search, pref = preferencia()) {
  const forzado = new URLSearchParams(search).get('halloween')
  if (forzado === '1') return true
  if (forzado === '0') return false
  if (pref !== 'auto') return pref === 'on'
  return enFechas(ahora)
}

// Si el tema está activo ahora; cambia al momento cuando se elige otra cosa en el panel (sin recargar).
export function useHalloween() {
  const [activo, setActivo] = useState(() => halloweenActivo())
  useEffect(() => {
    // detail: lo recién elegido, por si el navegador no deja guardarlo.
    const onCambio = (e) => setActivo(halloweenActivo(new Date(), window.location.search, e.detail ?? preferencia()))
    window.addEventListener(EVENT, onCambio)
    return () => window.removeEventListener(EVENT, onCambio)
  }, [])
  return activo
}
