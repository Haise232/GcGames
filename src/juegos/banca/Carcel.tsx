import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { isMuted, playClank, playLose, playWin } from '../sound.js'
import './hacienda.css'

const JAIL_MS = 5 * 60_000 // como hacienda.JAIL_MS: la condena entera

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// La cárcel (soborno a Hacienda que salió mal): la celda ocupa toda la pantalla y no se puede cerrar mientras dure la
// condena; solo se ve la cuenta atrás. Al acabar se levantan los barrotes y aparece el botón para salir.
export function CarcelScreen({ left, onExit }: { left: number; onExit: () => void }) {
  const [number] = useState(() => `${Math.floor(Math.random() * 9000) + 1000}`)
  const free = left <= 0
  const freedOnce = useRef(false)

  useEffect(() => {
    if (isMuted()) return
    const timers = [setTimeout(playClank, 450), setTimeout(playClank, 650), setTimeout(playLose, 1100)]
    return () => timers.forEach(clearTimeout)
  }, [])
  useEffect(() => {
    if (!free || freedOnce.current) return
    freedOnce.current = true
    if (!isMuted()) {
      playClank()
      setTimeout(() => playWin(false), 400)
    }
  }, [free])

  const served = Math.min(1, Math.max(0, 1 - left / JAIL_MS))
  return (
    <div
      className={`jail ${free ? 'jail--free' : ''}`}
      role="alertdialog"
      aria-modal="true"
      aria-label={free ? 'Has cumplido la condena: ya puedes salir de la cárcel.' : `Estás en la cárcel. Sales en ${clock(left)}.`}
    >
      <div className="jail__wall" aria-hidden="true">
        <span className="jail__tally">卌 卌 |||</span>
        <span className="jail__graffiti">Hacienda somos todos 💔</span>
      </div>
      <div className="jail__lamp" aria-hidden="true">
        <i />
        <span />
      </div>

      <div className="jail__card">
        <div className="jail__prisoner" aria-hidden="true">
          <span className="jail__face">{free ? '😮‍💨' : '😩'}</span>
          <span className="jail__body" />
          <span className="jail__plate">PRESO Nº {number}</span>
        </div>
        <p className="jail__kicker">Intento de soborno a Hacienda</p>
        <h2 className="jail__title">{free ? '¡ERES LIBRE!' : 'EN LA CÁRCEL'}</h2>
        {free ? (
          <>
            <p className="jail__text">Has cumplido tu condena. Y la próxima vez, a Hacienda se le paga 😇</p>
            <button type="button" className="jail__ok" onClick={onExit} autoFocus>
              Salir de la cárcel
            </button>
          </>
        ) : (
          <>
            <div className="jail__clock" role="timer" aria-live="off">
              <small>Sales en</small>
              <b>{clock(left)}</b>
            </div>
            <div className="jail__sentence" aria-hidden="true">
              <i style={{ '--k': served } as CSSProperties} />
            </div>
            <p className="jail__text">
              El inspector era honrado. No puedes salir de aquí ni jugar a nada hasta que acabe la condena.
            </p>
          </>
        )}
      </div>

      <div className="jail__bars" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
    </div>
  )
}
