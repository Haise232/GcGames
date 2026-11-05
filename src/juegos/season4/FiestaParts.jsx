// Piezas comunes de los juegos de las Fiestas (Season 4): el Rasca, Mayor o Menor y la Bola Canaria. La cabecera con el
// saldo y los botones, el panel de la apuesta y el historial. Los estilos, en fiestas.css (clases fi-*).
import { useState } from 'react'
import { eur } from '../comun/money.js'
import { isMuted, setMuted } from '../comun/sound.js'
import Help from '../comun/Help.jsx'
import './fiestas.css'

export function FiestaHeader({ title, balance, betLabel, bet, onExit, help, helpTitle }) {
  const [sound, setSound] = useState(() => !isMuted())
  return (
    <header className="top">
      <h1>{title}</h1>
      <div className="hud">
        <dl className="money">
          <div>
            <dt>Saldo de la semana</dt>
            <dd>{eur(balance)}</dd>
          </div>
          <div>
            <dt>{betLabel}</dt>
            <dd>{eur(bet)}</dd>
          </div>
        </dl>
        <div className="toggles">
          <button type="button" className="tg tg--back" onClick={onExit}>
            Juegos
          </button>
          <button
            type="button"
            className="tg tg--sound"
            aria-pressed={sound}
            onClick={() => {
              setMuted(sound)
              setSound(!sound)
            }}
          >
            Sonido
          </button>
          <Help className="tg tg--help" title={helpTitle}>
            {help}
          </Help>
        </div>
      </div>
    </header>
  )
}

// Apuesta libre (de min a max, de step en step) con −/+, barra y atajos.
export function BetBox({ bet, setBet, min, max, step, disabled, clamp }) {
  return (
    <div className="fi-group">
      <h2>Apuesta</h2>
      <div className="fi-bet">
        <button type="button" disabled={disabled} onClick={() => setBet(clamp(bet - step * 5, max))} aria-label="Bajar la apuesta">
          −
        </button>
        <span>{eur(bet)}</span>
        <button type="button" disabled={disabled} onClick={() => setBet(clamp(bet + step * 5, max))} aria-label="Subir la apuesta">
          +
        </button>
      </div>
      <input
        className="fi-slider"
        type="range"
        min={min}
        max={Math.max(max, min)}
        step={step}
        value={bet}
        disabled={disabled}
        aria-label="Apuesta"
        onChange={(e) => setBet(Number(e.target.value))}
      />
      <div className="fi-quick">
        <button type="button" disabled={disabled} onClick={() => setBet(min)}>
          Mín
        </button>
        <button type="button" disabled={disabled} onClick={() => setBet(clamp(bet / 2, max))}>
          ½
        </button>
        <button type="button" disabled={disabled} onClick={() => setBet(clamp(bet * 2, max))}>
          ×2
        </button>
        <button type="button" disabled={disabled} onClick={() => setBet(max)}>
          Máx
        </button>
      </div>
    </div>
  )
}

// Las últimas jugadas: ×N en dorado si se ganó, la marca de pérdida si no.
export function History({ list, lose = '✕', label = 'Últimas jugadas' }) {
  if (!list.length) return null
  return (
    <div className="fi-group">
      <h2>{label}</h2>
      <ol className="fi-history">
        {list.map((h) => (
          <li key={h.id} className={h.mult >= 1 ? 'is-win' : h.mult > 0 ? 'is-part' : 'is-lose'}>
            {h.mult > 0 ? `×${h.mult.toLocaleString('es-ES', { maximumFractionDigits: 2 })}` : lose}
          </li>
        ))}
      </ol>
    </div>
  )
}
