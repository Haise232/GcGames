// El pase en el selector: tu nivel y título, la barra de XP, las tres misiones del día, el regalo diario y los premios
// por reclamar. El pase completo se abre con «Ver el pase».
import { useEffect, useState } from 'react'
import { eur } from '../comun/money.js'
import { Chest, LevelRing, Mission, XpBar, unclaimed } from './PaseParts.jsx'

export default function PaseStrip({ juegos, online, onOpen }) {
  const { pase, send } = juegos
  const [opening, setOpening] = useState(false)
  // Se pide al entrar en el selector y cada vez que una jugada lo dejó viejo (misión, bonus o nivel nuevo).
  const stale = !pase || pase.stale
  useEffect(() => {
    if (online && stale) send({ t: 'pase', a: 'estado' })
  }, [online, stale, send])

  const chestReady = Boolean(pase && !pase.streak.claimed)
  const owed = unclaimed(pase)
  const doneCount = pase?.missions.filter((m) => m.done).length ?? 0

  const openChest = () => {
    setOpening(true)
    send({ t: 'pase', a: 'racha' })
    setTimeout(() => setOpening(false), 1400)
  }

  return (
    <div className="s4-strip">
      <button type="button" className="s4-strip__level" onClick={onOpen} disabled={!pase}>
        <LevelRing pase={pase} size={92} />
        <span className="s4-strip__who">
          <small>Pase de Navidad</small>
          <b>{pase ? pase.title : 'Cargando…'}</b>
          <XpBar pase={pase} />
          <span className="s4-strip__go">Ver el pase →</span>
        </span>
      </button>

      <div className="s4-strip__missions">
        <h3>
          Misiones de hoy <span>{pase ? `${doneCount}/3` : ''}</span>
        </h3>
        {pase ? (
          <ul>
            {pase.missions.map((m) => (
              <Mission key={m.id} mission={m} compact />
            ))}
          </ul>
        ) : (
          <ul aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="hub-skel hub-skel--line" />
            ))}
          </ul>
        )}
        {pase && (
          <p className={`s4-strip__bonus ${pase.bonus.done ? 'is-done' : ''}`}>
            {pase.bonus.done ? '✓ Bonus del día cobrado' : `Completa las 3: +${eur(pase.bonus.eur)} y +${pase.bonus.xp} XP`}
          </p>
        )}
      </div>

      <div className="s4-strip__side">
        <button type="button" className={`s4-chestbtn ${chestReady ? 'is-ready' : ''} ${opening ? 'is-opening' : ''}`} disabled={!online || !chestReady || opening} onClick={openChest}>
          <Chest open={!chestReady || opening} />
          <span>
            <b>{chestReady ? '¡Regalo diario!' : 'Regalo abierto'}</b>
            <small>
              {!pase
                ? '…'
                : chestReady
                  ? `Día ${pase.streak.next.day} de racha · ${eur(pase.streak.next.eur)}`
                  : `Racha de ${pase.streak.days} ${pase.streak.days === 1 ? 'día' : 'días'} · vuelve mañana`}
            </small>
          </span>
        </button>
        {owed.count > 0 && (
          <button type="button" className="s4-claimbtn" onClick={onOpen}>
            <span aria-hidden="true">🎁</span>
            <span>
              <b>
                {owed.count} {owed.count === 1 ? 'premio' : 'premios'} por reclamar
              </b>
              <small>{eur(owed.eur)}</small>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
