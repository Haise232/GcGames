import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

const COALESCE_MS = 250

// Conexión de un juego en vivo: pide el estado al servidor (ask), lleva el reloj del servidor (clock) y escucha su canal
// de Realtime. «cambio» (lo manda el servidor) vuelve a pedir el estado, juntando los avisos seguidos; «soga» son los
// tirones que se cuentan los navegadores entre ellos mientras tiran de la cuerda (onPeer los recibe, shout los manda):
// solo sirven para pintar la cuerda en directo, lo que vale es lo que cada uno manda al servidor.
export function useEnVivo(request, type, topic, onPeer) {
  const [live, setLive] = useState(null)
  const skew = useRef(null)
  const applied = useRef(0)
  const channel = useRef(null)
  const peer = useRef(onPeer)
  peer.current = onPeer

  const clock = useCallback(() => Date.now() + (skew.current ?? 0), [])
  const ask = useCallback(
    async (message) => {
      const sent = Date.now()
      const body = await request({ t: type, ...message })
      const got = Date.now()
      const data = body?.[type]
      if (data) {
        if (skew.current === null || got - sent < 1500) skew.current = data.now - (sent + got) / 2
        if (data.now >= applied.current) {
          applied.current = data.now
          setLive(data)
        }
      }
      return body
    },
    [request, type],
  )

  useEffect(() => {
    ask({ a: 'sync' })
  }, [ask])

  useEffect(() => {
    let timer = null
    const ch = supabase
      .channel(topic)
      .on('broadcast', { event: 'cambio' }, () => {
        if (timer) return
        timer = setTimeout(() => {
          timer = null
          if (document.visibilityState === 'visible') ask({ a: 'sync' })
        }, COALESCE_MS)
      })
      .on('broadcast', { event: 'soga' }, (message) => peer.current?.(message.payload))
      .subscribe()
    channel.current = ch
    const onVisible = () => document.visibilityState === 'visible' && ask({ a: 'sync' })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      channel.current = null
      supabase.removeChannel(ch)
    }
  }, [ask, topic])

  const shout = useCallback((payload) => {
    channel.current?.send({ type: 'broadcast', event: 'soga', payload })?.catch?.(() => {})
  }, [])

  return { live, ready: skew.current !== null && live !== null, ask, clock, shout }
}

// Repinta la pantalla cada ms (los juegos en vivo se dibujan con el reloj).
export function useTick(ms = 100) {
  const [, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setFrame((n) => (n + 1) % 1000000), ms)
    return () => clearInterval(timer)
  }, [ms])
}
