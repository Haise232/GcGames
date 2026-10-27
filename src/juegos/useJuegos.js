import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Conexión de juegos: cada acción es una petición a /api/juegos (función de Vercel) con la sesión de
// Supabase, y Supabase Realtime avisa cuando cambia tu mesa para pedir tu vista (cada uno ve solo sus cartas).
// Los temporizadores de la mesa (turnos, crupier) los hace avanzar el propio navegador con «tick» cuando vencen.
// conn: connecting | open | closed (sin red; reintenta) | denied (cuenta no aprobada o sesión caducada)
const HEARTBEAT_MS = 20000
const LOBBY_POLL_MS = 30000
const RETRY_MS = 3000
const RETRY_MAX_MS = 30000
const ERROR_MS = 3500
const BUBBLE_MS = 5000
const BUBBLE_CHAR_MS = 40
const BUBBLE_MAX_MS = 9000
// Peticiones que no son acciones de mesa: ni se reintentan con BUSY ni marcan «pendiente».
const NOT_ACTION = new Set(['view', 'tick', 'chat', 'chat_poll', 'lobby', 'hello'])

// Quién se ha sentado o se ha ido entre dos vistas de la mesa (sin contarte a ti).
function seatNotes(before, after, myId) {
  if (!before) return []
  const names = (seats) => new Map(seats.filter((s) => s && s.id && s.id !== myId).map((s) => [s.id, s.name]))
  const was = names(before)
  const now = names(after)
  const notes = []
  for (const [id, name] of now) if (!was.has(id)) notes.push(`${name} se ha sentado.`)
  for (const [id, name] of was) if (!now.has(id)) notes.push(`${name} ha dejado la mesa.`)
  return notes
}

export function useJuegos() {
  const [conn, setConn] = useState('connecting')
  const [me, setMe] = useState(null)
  const [room, setRoom] = useState(null)
  const [lobby, setLobby] = useState(null)
  const [chat, setChat] = useState([])
  const [scores, setScores] = useState(null)
  const [error, setError] = useState('')
  const [denied, setDenied] = useState('')
  const [attempt, setAttempt] = useState(0)
  const chatAfter = useRef(0)
  const roomCode = useRef(null)
  const seq = useRef(0)
  const appliedSeq = useRef(0)
  const errorTimer = useRef(null)
  const alive = useRef(true)
  const lastSeats = useRef(null)
  const sysCount = useRef(0)
  const [bubbles, setBubbles] = useState({})
  const [pending, setPending] = useState(false)
  // Último seguro o premio del gacha que se aplicó a una jugada: { name, kind, extra, left, at }.
  const inflight = useRef(0)
  const chatReady = useRef(false)
  const bubbleTimers = useRef(new Map())

  // Quita todos los globos y sus temporizadores (cambio de mesa, salir, desmontar).
  const clearBubbles = useCallback(() => {
    for (const timer of bubbleTimers.current.values()) clearTimeout(timer)
    bubbleTimers.current.clear()
    setBubbles((current) => (Object.keys(current).length ? {} : current))
  }, [])

  // Un globo por autor: el mensaje nuevo sustituye al anterior y reinicia su cuenta atrás.
  const showBubble = useCallback((message) => {
    const user = message.from
    clearTimeout(bubbleTimers.current.get(user))
    setBubbles((current) => ({ ...current, [user]: { id: message.id, text: message.text } }))
    const ms = Math.min(BUBBLE_MAX_MS, BUBBLE_MS + BUBBLE_CHAR_MS * String(message.text ?? '').length)
    bubbleTimers.current.set(
      user,
      setTimeout(() => {
        bubbleTimers.current.delete(user)
        setBubbles((current) => {
          if (current[user]?.id !== message.id) return current
          const { [user]: _gone, ...rest } = current
          return rest
        })
      }, ms),
    )
  }, [])

  useEffect(() => clearBubbles, [clearBubbles])

  const showError = useCallback((message) => {
    setError(message)
    clearTimeout(errorTimer.current)
    errorTimer.current = setTimeout(() => setError(''), ERROR_MS)
  }, [])

  const apply = useCallback(
    (body, n) => {
      if (body.me) setMe(body.me)
      if (body.lobby) setLobby(body.lobby)
      if (body.scores) setScores({ ...body.scores, at: Date.now() })
      if (body.error) showError(body.error.message)
      // Una respuesta vieja que llega tarde no pisa una mesa más nueva.
      if ('state' in body && n > appliedSeq.current) {
        appliedSeq.current = n
        const code = body.state?.code ?? null
        if (code !== roomCode.current) {
          roomCode.current = code
          chatAfter.current = 0
          lastSeats.current = null
          setChat([])
          chatReady.current = false
          clearBubbles()
        }
        if (body.state) {
          const notes = seatNotes(lastSeats.current, body.state.seats, body.me?.id)
          lastSeats.current = body.state.seats
          if (notes.length) {
            // Avisos de la mesa en el chat, solo en este navegador (no se guardan). Llevan un id decimal tras el
            // último mensaje para quedar en orden sin chocar con los del servidor.
            const at = Date.now()
            const lines = notes.map((text) => ({ id: chatAfter.current + ++sysCount.current / 1e6, from: null, text, at }))
            setChat((list) => [...list, ...lines].slice(-50))
          }
        }
        setRoom(body.state ? { state: body.state, at: Date.now() } : null)
      }
      if (Array.isArray(body.chat) && roomCode.current) {
        const fresh = body.chat.filter((m) => m.id > chatAfter.current)
        // La primera respuesta con chat de una mesa (aunque venga vacía) es historial: no genera globos.
        const history = !chatReady.current
        chatReady.current = true
        if (fresh.length) {
          chatAfter.current = fresh.at(-1).id
          setChat((list) => [...list, ...fresh].slice(-50))
          if (!history && document.visibilityState !== 'hidden') {
            const last = new Map()
            for (const m of fresh) if (m.from !== null && m.from !== undefined) last.set(m.from, m)
            for (const m of last.values()) showBubble(m)
          }
        }
      }
    },
    [showError, clearBubbles, showBubble],
  )

  const call = useCallback(
    async (msg) => {
      const n = ++seq.current
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const post = () =>
        fetch('/api/juegos', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ ...msg, chatAfter: chatAfter.current }),
        })
      let res
      try {
        res = await post()
        // Mesa ocupada (la transacción hizo rollback): una acción se repite una vez tras una pausa con azar.
        if (res.status === 409 && !NOT_ACTION.has(msg.t)) {
          const busy = await res
            .clone()
            .json()
            .catch(() => null)
          if (busy?.error?.code === 'BUSY') {
            await new Promise((resolve) => setTimeout(resolve, 150 + Math.random() * 150))
            if (!alive.current) return
            res = await post()
          }
        }
      } catch {
        if (alive.current) setConn('closed')
        return
      }
      const body = await res.json().catch(() => null)
      if (!alive.current) return
      if (res.status === 401 || res.status === 403) {
        setDenied(body?.error?.message ?? 'No se pudo comprobar tu cuenta.')
        setConn('denied')
        return
      }
      if (res.status >= 500 || !body) {
        setConn('closed')
        if (body?.error) showError(body.error.message)
        return
      }
      setConn('open')
      apply(body, n)
      return body
    },
    [apply, showError],
  )

  // Al entrar (y tras un fallo de red): saludo, que además devuelve la mesa si ya estabas sentado.
  useEffect(() => {
    alive.current = true
    call({ t: 'hello' })
    return () => {
      alive.current = false
      clearTimeout(errorTimer.current)
    }
  }, [call, attempt])

  // Reintento cada vez más espaciado (3 s, 6 s, 12 s… hasta 30 s) y con azar: si el servidor va lento, que no le lleguen
  // todos los navegadores a la vez cada pocos segundos.
  const failures = useRef(0)
  useEffect(() => {
    if (conn === 'open') failures.current = 0
    if (conn !== 'closed') return
    const wait = Math.min(RETRY_MAX_MS, RETRY_MS * 2 ** failures.current++) * (0.75 + Math.random() * 0.5)
    const timer = setTimeout(() => setAttempt((a) => a + 1), wait)
    return () => clearTimeout(timer)
  }, [conn, attempt])

  const code = room?.state.code ?? null

  // Avisos de Realtime: de tu mesa si estás en una, o del selector si no.
  useEffect(() => {
    let debounce = null
    const refresh = (msg, ms) => () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => call(msg), ms)
    }
    let chatDebounce = null
    let channel = supabase
      .channel(code ? `juegos-mesa-${code}` : 'juegos-lobby')
      .on('broadcast', { event: 'cambio' }, refresh(code ? { t: 'view', noChat: true } : { t: 'lobby' }, code ? 60 : 400))
    // Un mensaje nuevo solo trae el chat, no la mesa entera.
    if (code) {
      channel = channel.on('broadcast', { event: 'chat' }, () => {
        clearTimeout(chatDebounce)
        chatDebounce = setTimeout(() => call({ t: 'chat_poll' }), 60)
      })
    }
    channel.subscribe()
    // Latido: te mantiene presente en la mesa y recupera cualquier aviso perdido.
    const beat = setInterval(() => call(code ? { t: 'view' } : { t: 'lobby' }), code ? HEARTBEAT_MS : LOBBY_POLL_MS)
    // Al volver a la pestaña (el navegador espacia los temporizadores de las pestañas ocultas) se pone al día al momento.
    const onVisible = () => {
      if (document.visibilityState === 'visible') call(code ? { t: 'view' } : { t: 'lobby' })
    }
    document.addEventListener('visibilitychange', onVisible)
    // Pagaste a Hacienda (banca/BancaAvisos.tsx): el saldo cambió fuera de una jugada.
    const onBalance = () => call(code ? { t: 'view', noChat: true } : { t: 'lobby' })
    window.addEventListener('juegos:saldo', onBalance)
    return () => {
      clearTimeout(debounce)
      clearTimeout(chatDebounce)
      clearInterval(beat)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('juegos:saldo', onBalance)
      supabase.removeChannel(channel)
    }
  }, [code, call])

  // Temporizador de la mesa: cuando vence, este navegador lo hace avanzar. Lo manda primero quien tiene el turno; los
  // demás esperan un poco más (y con margen aleatorio) por si esa pestaña está dormida, así no llegan todos a la vez.
  const wakeIn = room?.state.wakeIn ?? null
  const at = room?.at
  const myId = me?.id
  const myTurn = Boolean(room && myId && room.state.turn !== null && room.state.seats[room.state.turn]?.id === myId)
  useEffect(() => {
    if (wakeIn === null || at === undefined) return
    const margin = myTurn ? 150 : 600 + Math.random() * 600
    const wait = Math.max(0, wakeIn - (Date.now() - at)) + margin
    const timer = setTimeout(() => call({ t: 'tick' }), wait)
    return () => clearTimeout(timer)
  }, [wakeIn, at, myTurn, call])

  // Devuelve true como el WebSocket de juegos original: el envío ya está en marcha.
  const send = useCallback(
    (message) => {
      const tracked = !NOT_ACTION.has(message.t)
      if (tracked) {
        inflight.current++
        setPending(true)
      }
      const done = () => {
        if (!tracked) return
        inflight.current = Math.max(0, inflight.current - 1)
        setPending(inflight.current > 0)
      }
      call(message).then(done, done)
      return true
    },
    [call],
  )

  const leave = useCallback(() => {
    appliedSeq.current = ++seq.current
    roomCode.current = null
    chatAfter.current = 0
    setRoom(null)
    setChat([])
    chatReady.current = false
    clearBubbles()
    call({ t: 'leave_room' })
  }, [call, clearBubbles])

  const reconnect = useCallback(() => {
    setDenied('')
    setConn('connecting')
    setAttempt((a) => a + 1)
  }, [])

  // Para los juegos en solitario: devuelve la respuesta del servidor (o undefined si no hubo conexión).
  const request = useCallback((message) => call(message), [call])

  return { conn, me, room, lobby, chat, scores, error, denied, send, request, leave, reconnect, bubbles, pending }
}
