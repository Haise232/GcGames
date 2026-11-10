// Criaturas de las Islas (Season 5): juego de rol por turnos. Eliges tu primera criatura y vas formando un equipo que
// dura toda la temporada. Antes de cada combate apuestas y eliges rival: si ganas cobras según su dificultad, tus
// criaturas ganan experiencia y quizá una del rival quiera unirse a ti. Cada turno lo decide el servidor (reglas en
// criaturas.js); aquí se enseña paso a paso lo que pasó.
import { useEffect, useRef, useState } from 'react'
import { useEffectEvent } from '../comun/useEffectEvent.js'
import {
  BIG_MOVE_LEVEL,
  MIN_BET,
  MOVES,
  PARTY,
  SPECIES,
  STARTERS,
  STEP,
  TEAM_MAX,
  TIERS,
  TIER_IDS,
  TYPES,
  alive,
  bestMove,
  clampBet,
  effText,
  effectiveness,
  fmtMult,
  maxBetFor,
  movesOf,
  payout,
  statsOf,
  xpToNext,
} from './criaturas.js'
import { eur } from '../comun/money.js'
import { buzz, playCash, playChip, playClunk, playLose, playWin } from '../comun/sound.js'
import { useCountUp } from '../comun/useCountUp.js'
import WinBurst from '../comun/WinBurst.jsx'
import { BetBox, FiestaHeader, History } from '../season4/FiestaParts.jsx'
import CriaturaArt from './CriaturaArt.jsx'
import './Criaturas.css'

const HISTORY = 14
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms))
const nameOf = (c) => SPECIES[c.sp].name

function TypeChip({ type }) {
  return (
    <span className="cr-type" style={{ '--c': TYPES[type].color }}>
      {TYPES[type].name}
    </span>
  )
}

function HpBar({ c, numbers = false }) {
  const pct = Math.max(0, (c.hp / c.max) * 100)
  return (
    <span className="cr-hp">
      <span className="cr-hp__bar">
        <i style={{ width: `${pct}%` }} className={pct < 25 ? 'is-low' : pct < 55 ? 'is-mid' : undefined} />
      </span>
      {numbers && (
        <small>
          {c.hp}/{c.max}
        </small>
      )}
    </span>
  )
}

function InfoBox({ c, side, numbers }) {
  return (
    <div className={`cr-info cr-info--${side}`}>
      <b>
        {nameOf(c)} <small>Nv. {c.lvl}</small>
      </b>
      <HpBar c={c} numbers={numbers} />
    </div>
  )
}

// Una criatura del equipo, en el campamento.
function TeamCard({ c, idx, inParty, busy, onLead }) {
  const st = statsOf(c.sp, c.lvl)
  return (
    <li className={`cr-card ${inParty ? 'is-party' : ''}`}>
      <CriaturaArt sp={c.sp} />
      <span className="cr-card__body">
        <b>
          {nameOf(c)} <small>Nv. {c.lvl}</small>
        </b>
        <TypeChip type={SPECIES[c.sp].type} />
        <span className="cr-xp" title={`${c.xp} / ${xpToNext(c.lvl)} XP`}>
          <i style={{ width: `${(c.xp / xpToNext(c.lvl)) * 100}%` }} />
        </span>
        <small className="cr-card__stats">
          ❤ {st.hp} · ⚔ {st.atk} · 🛡 {st.def} · 💨 {st.spd}
        </small>
      </span>
      {idx > 0 && (
        <button type="button" className="cr-card__lead" disabled={busy} onClick={() => onLead(idx)} title="Ponerla la primera">
          ⬆ Primera
        </button>
      )}
    </li>
  )
}

function Criaturas({ onExit, juegos }) {
  const [v, setV] = useState(null) // la última vista del servidor
  const [shown, setShown] = useState(null) // el combate tal como se ve (va por detrás del servidor mientras se anima)
  const [line, setLine] = useState('')
  const [anim, setAnim] = useState({ atk: null, hit: null, faint: null })
  const [playing, setPlaying] = useState(false)
  const [asking, setAsking] = useState(false)
  const [ready, setReady] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [result, setResult] = useState(null) // el último combate, para el cartel del final
  const [bet, setBet] = useState(50)
  const [tier, setTier] = useState('normal')
  const [history, setHistory] = useState([])
  const [burst, setBurst] = useState(null)
  const alive_ = useRef(true)
  const lock = useRef(false)
  const { request } = juegos
  const serverBalance = juegos.me?.balance ?? 0
  const [balance, setBalance] = useState(serverBalance)
  useEffect(() => {
    if (!asking && !playing) setBalance(serverBalance)
  }, [serverBalance, asking, playing])
  useEffect(() => () => (alive_.current = false), [])
  const shownBank = useCountUp(balance)

  const resync = useEffectEvent(async () => {
    const body = await request({ t: 'solo_criaturas', a: 'sync' })
    const nv = body?.solo
    if (!nv) return
    setV(nv)
    setShown(nv.battle)
    setBalance(nv.balance)
  })
  useEffect(() => {
    resync().then(() => alive_.current && setReady(true))
  }, [])

  async function act(message) {
    if (lock.current) return null
    lock.current = true
    setAsking(true)
    const body = await request({ t: 'solo_criaturas', ...message })
    lock.current = false
    setAsking(false)
    const nv = body?.solo ?? null
    if (!nv) {
      await resync()
      return null
    }
    if (body.abuse) nv.abuse = body.abuse
    return nv
  }

  // Enseña paso a paso lo que pasó en el turno (log) a partir de cómo se veía el combate.
  async function play(nv, before) {
    setPlaying(true)
    let b = before ? { ...before, mine: before.mine.map((c) => ({ ...c })), rival: before.rival.map((c) => ({ ...c })) } : null
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pause = (ms) => (reduced ? Promise.resolve() : wait(ms))
    for (const e of nv.log) {
      if (!alive_.current || !b) break
      if (e.t === 'move') {
        const me = e.side === 'me'
        const from = me ? b.mine[b.a] : b.rival[b.b]
        const to = me ? b.rival[b.b] : b.mine[b.a]
        setLine(`${me ? '' : 'El rival: '}¡${nameOf(from)} usa ${MOVES[e.move].name}!`)
        setAnim({ atk: e.side, hit: null, faint: null })
        await pause(420)
        if (e.miss) {
          setLine((l) => `${l} … pero falla.`)
          playClunk()
        } else {
          to.hp = Math.max(0, to.hp - e.dmg)
          setShown({ ...b, mine: [...b.mine], rival: [...b.rival] })
          setAnim({ atk: null, hit: me ? 'rival' : 'me', faint: null })
          playClunk()
          const extra = [e.crit ? '¡Golpe crítico!' : '', effText(e.eff)].filter(Boolean).join(' ')
          if (extra) setLine(extra)
        }
        await pause(650)
        setAnim({ atk: null, hit: null, faint: null })
      } else if (e.t === 'faint') {
        const c = e.side === 'me' ? b.mine[b.a] : b.rival[b.b]
        setLine(`¡${nameOf(c)}${e.side === 'me' ? '' : ' del rival'} se ha debilitado!`)
        setAnim({ atk: null, hit: null, faint: e.side })
        if (e.side === 'me') buzz([60])
        await pause(800)
      } else if (e.t === 'send') {
        if (e.side === 'me') b.a = e.idx
        else b.b = e.idx
        setAnim({ atk: null, hit: null, faint: null })
        setShown({ ...b })
        setLine(e.side === 'me' ? `¡Adelante, ${nameOf(b.mine[e.idx])}!` : `El rival saca a ${nameOf(b.rival[e.idx])}.`)
        await pause(650)
      } else if (e.t === 'flee') {
        setLine('Huyes del combate… y pierdes la apuesta.')
        await pause(600)
      }
    }
    if (!alive_.current) return
    setPlaying(false)
    setV(nv)
    setBalance(nv.balance)
    if (nv.battle) {
      setShown(nv.battle)
      if (nv.battle.need === 'switch') {
        setSwitching(true)
        setLine('¿A quién sacas ahora?')
      } else setLine('¿Qué hace tu criatura?')
      return
    }
    // Se acabó: el cartel del resultado.
    const last = nv.last
    setResult(last)
    setHistory((h) => [{ id: last.round, mult: last.mult }, ...h].slice(0, HISTORY))
    const extra = nv.abuse?.extra ?? 0
    if (last.win) {
      setLine('¡Has ganado el combate!')
      playCash(Math.min(10, Math.round(last.mult)))
      playWin(last.mult >= 4)
      buzz([60, 40, 80])
      setBurst({ id: last.round, amount: last.net + extra, mult: last.mult, extra })
    } else {
      setLine(extra > 0 ? `Has perdido, pero el Admin Abuse te devuelve ${eur(extra)}.` : 'Has perdido el combate.')
      playLose()
    }
  }

  const team = v?.team ?? []
  const battle = v?.battle ?? null
  const busy = asking || playing || !ready
  const maxBet = maxBetFor(balance)
  const shownBet = battle ? battle.bet : clampBet(bet, maxBet)

  async function starter(sp) {
    const nv = await act({ a: 'starter', sp })
    if (nv) setV(nv)
  }
  async function lead(idx) {
    const nv = await act({ a: 'lead', idx })
    if (nv) setV(nv)
  }
  async function decide(a) {
    const nv = await act({ a })
    if (nv) setV(nv)
  }
  async function start() {
    if (busy || battle || shownBet > balance || !team.length) return
    playChip()
    setBurst(null)
    setResult(null)
    const nv = await act({ a: 'start', bet: shownBet, tier })
    if (!nv) return
    setV(nv)
    setShown(nv.battle)
    setBalance(nv.balance)
    setLine(`¡${TIERS[tier].name} quiere combatir! Saca a ${nameOf(nv.battle.rival[0])}.`)
  }
  async function move(id) {
    if (busy || !battle || battle.need) return
    const before = shown
    const nv = await act({ a: 'move', move: id })
    if (nv) await play(nv, before)
  }
  async function swap(to) {
    if (busy || !battle) return
    setSwitching(false)
    const before = shown
    const nv = await act({ a: 'switch', to })
    if (nv) await play(nv, before)
  }
  async function flee() {
    if (busy || !battle) return
    const before = shown
    const nv = await act({ a: 'flee' })
    if (nv) await play(nv, before)
  }

  const onKeys = useEffectEvent((event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target instanceof Element ? event.target : null
    if (target?.matches('input, select, textarea')) return
    if (battle && !battle.need && shown) {
      const moves = movesOf(shown.mine[shown.a].sp, shown.mine[shown.a].lvl)
      const k = Number(event.key) - 1
      if (k >= 0 && k < moves.length) {
        event.preventDefault()
        move(moves[k])
      }
    } else if (!battle && event.code === 'Space' && !target?.matches('button:focus-visible')) {
      event.preventDefault()
      start()
    }
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeys)
    return () => window.removeEventListener('keydown', onKeys)
  }, [])

  const help = (
    <>
      <p>
        Elige tu primera criatura y forma un equipo de hasta {TEAM_MAX}. Combaten las {PARTY} primeras; con «⬆ Primera» cambias el orden. El equipo dura
        toda la temporada: no se reinicia el domingo.
      </p>
      <p>
        Antes de cada combate apuestas y eliges rival. El rival tiene tantas criaturas como tú y su nivel se cuenta desde tu criatura más fuerte. Si ganas,
        cobras lo que paga su dificultad; si pierdes (o huyes), pierdes la apuesta.
      </p>
      <p>
        Cada tipo es <b>muy eficaz</b> (×2) contra otros: el fuego contra la planta y el hielo, el agua contra el fuego, la planta contra el agua y el
        hielo contra la planta. Un ataque de su mismo tipo pega ×1,5. Al nivel {BIG_MOVE_LEVEL} aprenden un ataque fuerte (que a veces falla). Teclas{' '}
        <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> para atacar.
      </p>
      <p>
        Ganar da experiencia a las que combatieron (perder, un poco) y a veces una criatura del rival quiere unirse a tu equipo. Cada turno lo sortea el
        servidor; jugando bien se recupera alrededor del 96 % de lo apostado.
      </p>
    </>
  )

  // --- Pantallas ---
  let stage
  if (ready && !team.length) {
    stage = (
      <div className="cr-starter">
        <h2>Elige tu primera criatura</h2>
        <p>Te acompañará toda la temporada. Las demás las irás conociendo en los combates.</p>
        <ul>
          {STARTERS.map((sp) => (
            <li key={sp}>
              <button type="button" className="cr-starter__pick" disabled={busy} onClick={() => starter(sp)}>
                <CriaturaArt sp={sp} />
                <b>{SPECIES[sp].name}</b>
                <TypeChip type={SPECIES[sp].type} />
                <small>{SPECIES[sp].blurb}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  } else if (shown) {
    const mine = shown.mine[shown.a]
    const rival = shown.rival[shown.b]
    const moves = movesOf(mine.sp, mine.lvl)
    const hint = bestMove(mine, rival)
    stage = (
      <div className="cr-arena">
        <div className="cr-field" aria-hidden="true">
          <span className="cr-pad cr-pad--rival" />
          <span className="cr-pad cr-pad--me" />
        </div>
        <ol className="cr-balls cr-balls--rival" aria-label="Criaturas del rival">
          {shown.rival.map((c, i) => (
            <li key={i} className={c.hp > 0 ? 'is-up' : 'is-down'} />
          ))}
        </ol>
        <InfoBox c={rival} side="rival" />
        <div
          key={`r${shown.b}`}
          className={`cr-mon cr-mon--rival ${anim.atk === 'rival' ? 'is-atk' : ''} ${anim.hit === 'rival' ? 'is-hit' : ''} ${rival.hp <= 0 ? 'is-down' : ''}`}
        >
          <CriaturaArt sp={rival.sp} />
        </div>
        <div key={`m${shown.a}`} className={`cr-mon cr-mon--me ${anim.atk === 'me' ? 'is-atk' : ''} ${anim.hit === 'me' ? 'is-hit' : ''} ${mine.hp <= 0 ? 'is-down' : ''}`}>
          <CriaturaArt sp={mine.sp} flip />
        </div>
        <InfoBox c={mine} side="me" numbers />
        <p className="cr-line" role="status" aria-live="polite">
          {line}
        </p>
        {battle && !playing && !result && (
          <div className="cr-actions">
            {switching || battle.need === 'switch' ? (
              <div className="cr-swap">
                <b>{battle.need === 'switch' ? '¿A quién sacas?' : 'Cambiar de criatura (el rival ataca)'}</b>
                <ul>
                  {shown.mine.map((c, i) => (
                    <li key={i}>
                      <button type="button" disabled={busy || c.hp <= 0 || (i === shown.a && battle.need !== 'switch')} onClick={() => swap(i)}>
                        <CriaturaArt sp={c.sp} flip />
                        <span>
                          {nameOf(c)} <small>Nv. {c.lvl}</small>
                          <HpBar c={c} numbers />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {battle.need !== 'switch' && (
                  <button type="button" className="cr-swap__back" onClick={() => setSwitching(false)}>
                    Volver
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="cr-moves">
                  {moves.map((id, k) => {
                    const m = MOVES[id]
                    const eff = effectiveness(m.type, SPECIES[rival.sp].type)
                    return (
                      <button key={id} type="button" className={`cr-move ${id === hint ? 'is-hint' : ''}`} style={{ '--c': TYPES[m.type].color }} disabled={busy} onClick={() => move(id)}>
                        <b>
                          <kbd>{k + 1}</kbd> {m.name}
                        </b>
                        <small>
                          {TYPES[m.type].name} · {m.power} · {m.acc} %
                          {eff >= 2 ? ' · ¡muy eficaz!' : eff <= 0.5 ? ' · poco eficaz' : ''}
                        </small>
                      </button>
                    )
                  })}
                </div>
                <div className="cr-extra">
                  <button type="button" disabled={busy || alive(shown.mine).length < 2} onClick={() => setSwitching(true)}>
                    🔁 Cambiar
                  </button>
                  <button type="button" disabled={busy} onClick={flee}>
                    🏃 Huir
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {result && !playing && (
          <div className={`cr-result ${result.win ? 'is-win' : 'is-lose'}`}>
            <b>{result.win ? '¡Victoria!' : 'Derrota'}</b>
            <span>
              {result.win ? `Cobras ${eur(result.payout)} (${fmtMult(result.mult)})` : `Pierdes ${eur(result.stake)}`} · +{result.xp} XP para tu equipo
            </span>
            {result.ups?.length > 0 && <span>⬆ {result.ups.map((u) => `${team[u.idx] ? nameOf(team[u.idx]) : 'Una criatura'} sube al nivel ${u.lvl}`).join(' · ')}</span>}
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setShown(null)
                setLine('')
              }}
            >
              Volver al campamento
            </button>
          </div>
        )}
      </div>
    )
  } else {
    stage = (
      <div className="cr-camp">
        <h2>
          Tu equipo <small>{team.length}/{TEAM_MAX} · combaten las {PARTY} primeras</small>
        </h2>
        <ul className="cr-team">
          {team.map((c, i) => (
            <TeamCard key={`${c.sp}-${i}`} c={c} idx={i} inParty={i < PARTY} busy={busy} onLead={lead} />
          ))}
        </ul>
        {v?.offer && (
          <div className="cr-offer" role="dialog" aria-label="Una criatura quiere unirse">
            <CriaturaArt sp={v.offer.sp} />
            <span>
              <b>¡{SPECIES[v.offer.sp].name} quiere unirse a tu equipo!</b>
              <small>
                Nivel {v.offer.lvl} · {SPECIES[v.offer.sp].blurb}
              </small>
            </span>
            <button type="button" className="cr-offer__yes" disabled={busy} onClick={() => decide('join')}>
              ¡Bienvenida!
            </button>
            <button type="button" disabled={busy} onClick={() => decide('skip')}>
              Ahora no
            </button>
          </div>
        )}
      </div>
    )
  }

  const partyTop = team.length ? Math.max(...team.slice(0, PARTY).map((c) => c.lvl)) : 0

  return (
    <main className="app fi-app cr-app">
      <FiestaHeader title="Criaturas de las Islas" balance={shownBank} betLabel={battle ? 'En juego' : 'Apuesta'} bet={shownBet} onExit={onExit} help={help} helpTitle="Cómo se juega a Criaturas" />

      <div className="fi fill">
        <section className="fi-stage cr-stage" aria-label="Criaturas de las Islas">
          {stage}
        </section>

        <aside className="fi-panel">
          <div className="fi-prize">
            <small>{battle ? 'Si ganas el combate' : 'Gana y cobra'}</small>
            <b>{eur(payout(shownBet, battle ? battle.tier : tier))}</b>
            <span className="fi-prize__tag">{fmtMult(TIERS[battle ? battle.tier : tier].mult)}</span>
          </div>

          {!battle && (
            <>
              <div className="fi-group">
                <h2>Rival</h2>
                <div className="fi-options" style={{ '--cols': 1 }} role="radiogroup" aria-label="Rival">
                  {TIER_IDS.map((id) => (
                    <button key={id} type="button" role="radio" aria-checked={tier === id} className="fi-option" disabled={busy} onClick={() => setTier(id)}>
                      <span className="fi-option__ico" aria-hidden="true">
                        {fmtMult(TIERS[id].mult)}
                      </span>
                      <b>{TIERS[id].name}</b>
                      <small>
                        {TIERS[id].blurb}
                        {partyTop ? ` Nivel ${Math.max(2, partyTop + TIERS[id].offset)} aprox.` : ''}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
              <BetBox bet={shownBet} setBet={setBet} min={MIN_BET} max={maxBet} step={STEP} disabled={busy || maxBet < MIN_BET} clamp={clampBet} />
              <button type="button" className="fi-go" disabled={busy || !team.length || shownBet > balance || balance < MIN_BET || Boolean(shown)} onClick={start}>
                {asking ? 'Buscando rival…' : '¡Al combate!'}
                <kbd>Espacio</kbd>
              </button>
            </>
          )}

          {battle && (
            <div className="fi-group">
              <h2>Combate</h2>
              <p className="fi-hint">
                Contra <b>{TIERS[battle.tier].name}</b>. Le quedan {alive(battle.rival).length} de {battle.rival.length} criaturas; a ti, {alive(battle.mine).length}{' '}
                de {battle.mine.length}.
              </p>
              <p className="fi-hint">La pista dorada marca el ataque que más daño hace de media.</p>
            </div>
          )}

          {v?.ranking?.length > 0 && (
            <div className="fi-group">
              <h2>Récord del día</h2>
              <ol className="fi-table">
                {v.ranking.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={r.me ? 'is-on' : undefined}>
                    <span>{i + 1}</span>
                    <span>{r.name}</span>
                    <b>{fmtMult(r.mult)}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <History list={history} label="Tus últimos combates" />
        </aside>
      </div>

      {burst && (
        <WinBurst
          key={burst.id}
          amount={burst.amount}
          caption={`Victoria ${fmtMult(burst.mult)}`}
          coins={Math.min(70, 20 + Math.round(burst.mult) * 4)}
          big={burst.mult >= 4}
          who={juegos.me?.name}
          tags={burst.extra > 0 ? [`Admin Abuse: +${eur(burst.extra)}`] : []}
        />
      )}
    </main>
  )
}

export default Criaturas
