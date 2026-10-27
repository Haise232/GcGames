import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Lo que comparten la pantalla del gacha y su escaparate en el selector de juegos.
export const RARITY = { comun: 'Común', rara: 'Rara', epica: 'Épica', mitica: 'Legendaria', unica: 'Mítica' }
export const RARITIES = ['unica', 'mitica', 'epica', 'rara', 'comun']
// Probabilidad de una carta concreta: «0,11 %», «2,8 %».
export const pct = (n) => `${n.toLocaleString('es-ES', { maximumSignificantDigits: 2 })} %`
// Igual que WEIGHTS en api/_juegos/gacha.mjs, para la ayuda.
export const ODDS = {
  normal: { comun: 69.9, rara: 23, epica: 6, mitica: 1, unica: 0.1 },
  premium: { epica: 75, mitica: 24.5, unica: 0.5 },
}

// «45 s», «12 min», «2 h 5 min».
export function wait(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.ceil(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
}

// Reloj del servidor (las cuentas atrás de reclamar se miden con él), avanzando cada segundo.
export function useServerNow(offset) {
  const [t, setT] = useState(() => Date.now() + offset)
  useEffect(() => {
    setT(Date.now() + offset)
    const timer = setInterval(() => setT(Date.now() + offset), 1000)
    return () => clearInterval(timer)
  }, [offset])
  return t
}

const REFRESH_MS = 60000 // respaldo de Realtime (cada tirada avisa), solo con la pestaña visible

// Estado del gacha y su canal. Se cargan al entrar, cada vez que alguien tira o reclama (aviso de Realtime
// «juegos-gacha», sin datos) y cada REFRESH_MS por si se pierde un aviso. load(a, extra) manda una acción y devuelve
// la respuesta entera del servidor.
export function useGacha(request) {
  const [state, setState] = useState(null)
  const [feed, setFeed] = useState([])
  const [offset, setOffset] = useState(0)
  const [collection, setCollection] = useState(null)
  const [ranking, setRanking] = useState(null)
  const [cards, setCards] = useState(null)

  const load = useCallback(
    async (a, extra = {}) => {
      const body = await request({ t: 'gacha', a, ...extra })
      const g = body?.gacha
      if (!g) return null
      setState(g.state)
      setFeed(g.feed)
      setOffset(g.state.now - Date.now())
      if (g.collection) setCollection(g.collection)
      if (g.ranking) setRanking(g.ranking)
      if (g.cards) setCards(g.cards)
      return body
    },
    [request],
  )

  const debounce = useRef(null)
  useEffect(() => {
    load('estado')
    const channel = supabase
      .channel('juegos-gacha')
      .on('broadcast', { event: 'tirada' }, () => {
        clearTimeout(debounce.current)
        debounce.current = setTimeout(() => load('estado'), 250)
      })
      .subscribe()
    const timer = setInterval(() => document.visibilityState === 'visible' && load('estado'), REFRESH_MS)
    return () => {
      clearTimeout(debounce.current)
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [load])

  return { state, feed, offset, collection, setCollection, ranking, cards, load }
}
