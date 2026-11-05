import GachaCard from './GachaCard.jsx'
import { RARITY, useGacha, useServerNow, wait } from './gacha.js'

const SHOWN = 5

// El gacha en el selector de juegos: las cartas de la mesa (gratis, para coger) en directo y tu estado.
function GachaShowcase({ juegos, online, onOpen }) {
  const { state, offset } = useGacha(juegos.request)
  const t = useServerNow(offset)
  const table = state?.table ?? []
  const best = ['unica', 'mitica', 'epica'].map((r) => table.find((e) => e.card.rarity === r)).find(Boolean)

  let headline = 'Personajes y mods de juegos: cada hora sale una carta gratis en la mesa. Cógela antes que nadie.'
  if (best) headline = `¡En la mesa hay una ${RARITY[best.card.rarity].toLowerCase()}: ${best.card.name}!`
  else if (table.length > 0) headline = `${table.length === 1 ? 'Hay una carta' : `Hay ${table.length} cartas`} en la mesa para coger gratis.`

  return (
    <article className={`hub-gacha ${table.length ? 'is-hot' : ''}`} aria-labelledby="gacha-title">
      <div className="hub-gacha__head">
        <h3 id="gacha-title">Gacha</h3>
        <span className={`hub-chip hub-chip--${table.length ? 'on' : 'free'}`}>
          <i aria-hidden="true" />
          {table.length ? `${table.length} en la mesa` : 'Mesa vacía'}
        </span>
      </div>
      <p className="hub-gacha__line">{headline}</p>

      <ul className="hub-gacha__strip" aria-label="Cartas en la mesa">
        {Array.from({ length: SHOWN }, (_, i) => {
          const entry = table[i]
          if (!entry) return <li key={`vacia-${i}`} className="hub-gacha__slot" aria-hidden="true" />
          return (
            <li key={entry.id} className="is-open" title={`${entry.card.name} · ${RARITY[entry.card.rarity]}`}>
              <GachaCard card={entry.card} mini />
              <span className="hub-gacha__who">{RARITY[entry.card.rarity]}</span>
            </li>
          )
        })}
      </ul>

      <div className="hub-gacha__foot">
        <dl className="hub-gacha__facts">
          <div>
            <dt>Próxima</dt>
            <dd>{state ? (state.nextDropAt ? wait(state.nextDropAt - t) : 'llena') : '–'}</dd>
          </div>
          <div>
            <dt>Biblioteca</dt>
            <dd>{state ? state.owned : '–'}</dd>
          </div>
        </dl>
        <div className="hub-gacha__actions">
          <button type="button" className="hub-btn hub-btn--primary" disabled={!online} onClick={() => onOpen('tirar')}>
            {table.length ? 'Ir a la mesa' : 'Abrir el gacha'}
          </button>
          <button type="button" className="hub-btn" disabled={!online} onClick={() => onOpen('colecciones')}>
            Bibliotecas
          </button>
        </div>
      </div>
    </article>
  )
}

export default GachaShowcase
