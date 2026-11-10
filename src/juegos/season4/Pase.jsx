// Pantalla del pase de temporada (Season 5: Pase de Navidad): tu nivel, el regalo diario con su racha, las misiones del día y el camino de 30
// niveles con sus premios. Los datos los da el servidor ({ t: 'pase' }, api/_juegos/pase.mjs).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Help from '../comun/Help.jsx'
import { eur, until } from '../comun/money.js'
import { useCountUp } from '../comun/useCountUp.js'
import NavidadScene from '../season5/NavidadScene.jsx'
import { Chest, LevelRing, Mission, XpBar, unclaimed } from './PaseParts.jsx'

const STREAK_DAYS = 7

export default function Pase({ juegos, onExit, onGo }) {
  const { pase, send, me, conn } = juegos
  const online = conn === 'open'
  const balance = useCountUp(me?.balance ?? 0, 700)
  const [opening, setOpening] = useState(false)
  const track = useRef(null)
  const scrolled = useRef(false)

  useEffect(() => {
    if (online) send({ t: 'pase', a: 'estado' })
  }, [online, send])

  // El camino se abre centrado en tu nivel (solo la primera vez que llega el pase).
  useLayoutEffect(() => {
    if (!pase || scrolled.current || !track.current) return
    const node = track.current.querySelector(`[data-level="${Math.max(1, Math.min(pase.maxLevel, pase.level + 1))}"]`)
    if (node) track.current.scrollLeft = node.offsetLeft - track.current.clientWidth / 2 + node.clientWidth / 2
    scrolled.current = true
  }, [pase])

  const owed = unclaimed(pase)
  const chestReady = Boolean(pase && !pase.streak.claimed)
  const openChest = () => {
    setOpening(true)
    send({ t: 'pase', a: 'racha' })
    setTimeout(() => setOpening(false), 1400)
  }
  // Día de la racha que se ilumina: el de hoy (abierto) o el que toca abrir.
  const streakDay = pase ? (pase.streak.claimed ? pase.streak.days : (pase.streak.next?.day ?? 1)) : 0
  const ends = pase && pase.season.ends > Date.now() ? until(pase.season.ends) : null

  return (
    <main className="app s4-pase">
      <header className="top">
        <h1>Pase de Navidad</h1>
        <div className="hud">
          <dl className="money">
            <div>
              <dt>Saldo de la semana</dt>
              <dd>{eur(balance)}</dd>
            </div>
            <div>
              <dt>Experiencia</dt>
              <dd>{pase ? `${pase.xp.toLocaleString('es-ES')} XP` : '…'}</dd>
            </div>
          </dl>
          <div className="toggles">
            <button type="button" className="tg tg--back" onClick={onExit}>
              Juegos
            </button>
            <Help className="tg tg--help" title="Cómo funciona el pase">
              <p>
                El pase dura toda la <b>Season 5</b> (no se reinicia el domingo). Subes de nivel con experiencia (XP): cada {pase?.perLevel ?? 400} XP, un
                nivel, hasta el {pase?.maxLevel ?? 30}.
              </p>
              <p>
                <b>Cada jugada da {pase?.plays.xp ?? 10} XP</b> (hasta {pase?.plays.cap ?? 30} jugadas al día). Las <b>misiones del día</b> dan mucho más, y
                si completas las tres te llevas un bonus en euros. Cambian cada día a las 23:59, como el reinicio de la semana.
              </p>
              <p>
                El <b>regalo diario</b> es gratis. Si lo abres días seguidos la racha sube y el regalo da más, hasta el día {STREAK_DAYS}. Si te saltas un
                día, vuelve a empezar.
              </p>
              <p>
                Cada nivel tiene un <b>premio en euros</b> que va a tu saldo de la semana al reclamarlo. Los niveles 5, 10, 15, 20, 25 y 30 dan más y un
                título nuevo, que se ve en la clasificación.
              </p>
            </Help>
          </div>
        </div>
      </header>

      <section className="s4-pase__hero">
        <NavidadScene className="s4-pase__scene" />
        <div className="s4-pase__me">
          <LevelRing pase={pase} size={128} />
          <div>
            <small>{pase?.season.name ?? 'Season 5 · Navidad'}</small>
            <h2>{pase?.title ?? '…'}</h2>
            <XpBar pase={pase} />
            <p>
              {pase && pase.level < pase.maxLevel ? `Te faltan ${pase.perLevel - pase.levelXp} XP para el nivel ${pase.level + 1}.` : pase ? 'Has completado el pase. ¡Eres un Rey Mago!' : ''}
              {ends && ` La temporada acaba en ${ends}.`}
            </p>
          </div>
        </div>
      </section>

      <div className="s4-pase__grid">
        <section className="s4-panel s4-daily" aria-labelledby="s4-chest-title">
          <h2 id="s4-chest-title">Regalo diario</h2>
          <div className="s4-daily__row">
            <button type="button" className={`s4-chestbtn s4-chestbtn--big ${chestReady ? 'is-ready' : ''} ${opening ? 'is-opening' : ''}`} disabled={!online || !chestReady || opening} onClick={openChest}>
              <Chest open={!chestReady || opening} />
              <span>
                <b>{chestReady ? 'Abrir el regalo' : 'Ya lo has abierto hoy'}</b>
                <small>{chestReady ? `${eur(pase.streak.next.eur)} y ${pase.streak.next.xp} XP` : 'Vuelve mañana para seguir la racha'}</small>
              </span>
            </button>
          </div>
          <ol className="s4-streak" aria-label="Racha de días seguidos">
            {Array.from({ length: STREAK_DAYS }, (_, i) => {
              const day = i + 1
              const state = day < streakDay || (day === streakDay && pase?.streak.claimed) ? 'done' : day === streakDay ? 'now' : 'next'
              return (
                <li key={day} className={`s4-streak__day is-${state}`}>
                  <small>Día {day}</small>
                  <b>{eur(300 * day)}</b>
                  {state === 'done' && <i aria-label="abierto">✓</i>}
                </li>
              )
            })}
          </ol>
        </section>

        <section className="s4-panel s4-today" aria-labelledby="s4-missions-title">
          <h2 id="s4-missions-title">
            Misiones de hoy <span>cambian a las 23:59</span>
          </h2>
          {pase ? (
            <>
              <ul className="s4-missions">
                {pase.missions.map((m) => (
                  <Mission key={m.id} mission={m} onGo={onGo} />
                ))}
              </ul>
              <p className={`s4-bonus ${pase.bonus.done ? 'is-done' : ''}`}>
                <span aria-hidden="true">{pase.bonus.done ? '✓' : '★'}</span>
                {pase.bonus.done ? `Bonus cobrado: +${eur(pase.bonus.eur)} y +${pase.bonus.xp} XP` : `Completa las tres y te llevas ${eur(pase.bonus.eur)} y ${pase.bonus.xp} XP más`}
              </p>
              <p className="s4-plays">
                Jugadas de hoy: <b>{pase.plays.today}</b> · {pase.plays.today < pase.plays.cap ? `cada una da ${pase.plays.xp} XP (quedan ${pase.plays.cap - pase.plays.today})` : 'ya no dan XP, pero siguen contando para las misiones'}
              </p>
            </>
          ) : (
            <p className="s4-loading">Cargando misiones…</p>
          )}
        </section>
      </div>

      <section className="s4-panel s4-road" aria-labelledby="s4-road-title">
        <div className="s4-road__head">
          <h2 id="s4-road-title">Camino de premios</h2>
          {owed.count > 0 && (
            <button type="button" className="s4-btn s4-btn--hot" disabled={!online} onClick={() => send({ t: 'pase', a: 'reclamar' })}>
              Reclamar {owed.count === 1 ? 'premio' : `los ${owed.count}`} · {eur(owed.eur)}
            </button>
          )}
        </div>
        <ol className="s4-road__track" ref={track}>
          {(pase?.rewards ?? []).map((r) => {
            const state = r.claimed ? 'claimed' : r.unlocked ? 'ready' : r.level === pase.level + 1 ? 'next' : 'locked'
            return (
              <li key={r.level} data-level={r.level} className={`s4-node is-${state} ${r.title ? 's4-node--big' : ''}`}>
                <span className="s4-node__lv">Nivel {r.level}</span>
                <span className="s4-node__orb" aria-hidden="true">
                  {r.claimed ? '✓' : r.title ? '★' : r.unlocked ? '€' : '🔒'}
                </span>
                <b className="s4-node__eur">{eur(r.eur)}</b>
                {r.title && <small className="s4-node__title">«{r.title}»</small>}
                {state === 'ready' && (
                  <button type="button" className="s4-btn s4-btn--sm" disabled={!online} onClick={() => send({ t: 'pase', a: 'reclamar', nivel: r.level })}>
                    Reclamar
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      </section>
    </main>
  )
}
