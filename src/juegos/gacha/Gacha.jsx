import { useEffect, useState } from 'react'
import Avatar from '../comun/Avatar.jsx'
import GachaCard from './GachaCard.jsx'
import Help from '../comun/Help.jsx'
import { eur } from '../comun/money.js'
import { playBoom, playCard, playGrowl, playHeartbeat, playOvation, playSiren, playSpin, playWin, playZap } from '../comun/sound.js'
import { ODDS, RARITIES, RARITY, pct, useGacha, useServerNow, wait } from './gacha.js'
import './Gacha.css'

// Gacha de personajes de Black Clover al estilo de Mudae (las reglas están en api/_juegos/gacha.mjs): tiradas que ve todo el
// mundo, el primero que reclama se queda la carta, vender cartas por saldo de la semana y ver la colección de cualquiera.

// Probabilidad de una carta concreta: «0,48 %», «0,0029 %».

// Nombre de alguien que lleva a su biblioteca.
function Who({ person, onOpen }) {
  return (
    <button type="button" className="gacha-who" onClick={() => onOpen(person.id)} title={`Ver la biblioteca de ${person.name}`}>
      {person.name}
    </button>
  )
}

// «hace 5 min», «hace 2 h», «hace 3 d».
function ago(ms) {
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`
}

// Un movimiento del canal: salió en la mesa, alguien la cogió o alguien la sacó pagando y se la quedó.
function Move({ move, t, onOpen }) {
  const who = move.by && (move.by.me ? 'Tú' : <Who person={move.by} onOpen={onOpen} />)
  let text = 'Salió en la mesa'
  if (move.type === 'cogida') text = <>{who} la {move.by?.me ? 'cogiste' : 'cogió'} de la mesa</>
  if (move.type === 'guardada') {
    text = (
      <>
        {who} la {move.by?.me ? 'sacaste' : 'sacó'} {move.premium ? 'con una premium' : 'pagando'} y {move.by?.me ? 'te la quedaste' : 'se la quedó'}
      </>
    )
  }
  if (move.type === 'tirada') text = <>{who} la sacó</>
  if (move.type === 'usada') text = <>{who} {move.by?.me ? 'gastaste' : 'gastó'} su poder: vuelve a estar libre</>
  if (move.type === 'empenada') text = <>{who} la {move.by?.me ? 'empeñaste' : 'empeñó'} al banco</>
  if (move.type === 'recuperada') text = <>{who} la {move.by?.me ? 'recuperaste' : 'recuperó'} del banco</>
  if (move.type === 'embargada') text = <>El banco se la quedó: {move.by?.me ? 'no pagaste' : 'no pagó'} el empeño a tiempo. Vuelve a estar libre</>
  if (move.type === 'fusion') {
    text = (
      <>
        {who} {move.by?.me ? 'juntaste' : 'juntó'} {move.card.fusion?.join(' y ') ?? 'las dos cartas'} y {move.by?.me ? 'las fusionaste' : 'las fusionó'}
      </>
    )
  }
  return (
    <li className={`gacha-roll gacha-move--${move.type} ${move.by?.me ? 'is-mine' : ''}`}>
      <GachaCard card={move.card} mini />
      <div className="gacha-roll__info">
        <span className={`gacha-roll__name gacha-roll__name--${move.card.rarity}`}>
          <b>{move.card.name}</b>
          <small>
            <em>{RARITY[move.card.rarity]}</em>
            {move.card.series ? ` · ${move.card.series}` : ''}
          </small>
        </span>
        <span className="gacha-roll__status">
          {move.by && <Avatar name={move.by.name} src={move.by.avatar} size={18} />}
          {text}
        </span>
      </div>
      <span className="gacha-roll__value">{ago(t - move.at)}</span>
    </li>
  )
}

// El canal enseña los últimos movimientos; el resto, al pulsar «Ver más».
const FEED_SHOWN = 8
const CHARGE_MS = 1300
// Cuanto más rara, más larga y más bestia: la carga de color (build) y el estallido (burst) duran más.
const BUILD_MS = { comun: 0, rara: 600, epica: 1600, mitica: 3400, unica: 4600 }
const BURST_MS = { comun: 650, rara: 750, epica: 950, mitica: 1300, unica: 1700 }
const SPARKS = { rara: 12, epica: 32, mitica: 64, unica: 110 }
const WAVES = { rara: 1, epica: 2, mitica: 3, unica: 5 }
// La mítica tiene dos actos más: un presagio antes de la carga (pantalla negra, latido y grietas) y un apagón antes del
// estallido.
const OMEN_MS = 3000
const BLACKOUT_MS = 900
const EMBERS = 40
const STARS = { rara: 12, epica: 18 }
const COINS = 26
const DUST = 12
const IMPLODE = 26
const BOLTS = 7
const CONFETTI = 46
const range = (n) => Array.from({ length: n }, (_, i) => i)

// La invocación: la carta llega boca abajo y se carga de energía (charge, esperando al servidor). Si es rara o mejor,
// se va tiñendo del color de su rareza (build): las épicas vibran y absorben partículas; las legendarias pasan por
// todos los colores hasta el dorado, les caen rayos y se agrietan. Luego estalla con ondas expansivas (burst) y se da
// la vuelta (show); la legendaria, con explosión dorada, temblor, «¡LEGENDARIA!» letra a letra y lluvia de confeti. La
// mítica hace lo mismo que la legendaria, más larga y en rojo, con «¡MÍTICA!».
function Summon({ summon, busy, onDecide, onClose }) {
  const { stage, result } = summon
  const rarity = result?.card.rarity ?? 'comun'
  const fused = Boolean(result?.fused)
  const legend = rarity === 'mitica' || rarity === 'unica'
  const sparks = SPARKS[rarity] ?? 0
  const waves = WAVES[rarity] ?? 0
  const title = fused ? '¡FUSIÓN!' : rarity === 'unica' ? '¡MÍTICA!' : legend ? '¡LEGENDARIA!' : rarity === 'epica' ? '¡ÉPICA!' : RARITY[rarity]
  const mythic = rarity === 'unica'
  const epic = rarity === 'epica'
  const stars = STARS[rarity] ?? 0
  const lettered = legend || epic
  if (stage === 'omen' || stage === 'blackout') return <MythicOmen stage={stage} />
  return (
    <div
      className={`gacha-summon is-${stage} gacha-summon--${stage === 'charge' ? 'unknown' : rarity}`}
      role="dialog"
      aria-modal="true"
      aria-label="Tirada del gacha"
    >
      <span className="gacha-summon__rays" aria-hidden="true" />
      {/* Foco de luz del color de la rareza bajo la carta. */}
      {stage !== 'charge' && <span className="gacha-summon__floor" aria-hidden="true" />}
      {/* Rara: anillos que se expanden mientras se carga. */}
      {stage === 'build' && rarity === 'rara' && (
        <span className="gacha-summon__rings" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {/* Épica: círculo mágico de runas detrás de la carta. */}
      {(stage === 'build' || stage === 'show') && epic && (
        <svg className="gacha-summon__runes" viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <path id="gacha-rune-path" d="M100 100 m-78 0 a78 78 0 1 1 156 0 a78 78 0 1 1 -156 0" />
          </defs>
          <circle cx="100" cy="100" r="92" />
          <circle cx="100" cy="100" r="64" className="gacha-summon__runes-inner" />
          <path d="M100 8 L180 146 L20 146 Z M100 192 L20 54 L180 54 Z" className="gacha-summon__runes-star" />
          <text>
            <textPath href="#gacha-rune-path">ΑΒΓΔΕΖ ✦ ΗΘΙΚΛΜ ✦ ΝΞΟΠΡΣ ✦ ΤΥΦΧΨΩ ✦</textPath>
          </text>
        </svg>
      )}
      {/* Legendaria: columna de luz dorada que cae sobre la carta. */}
      {stage === 'build' && rarity === 'mitica' && <span className="gacha-summon__pillar" aria-hidden="true" />}
      {legend && stage === 'show' && <span className="gacha-summon__rays gacha-summon__rays--back" aria-hidden="true" />}
      <span className="gacha-summon__flash" aria-hidden="true" />
      {stage === 'build' && (rarity === 'epica' || legend) && (
        <span className="gacha-summon__implode" aria-hidden="true">
          {range(IMPLODE).map((i) => (
            <i key={i} style={{ '--a': `${(360 / IMPLODE) * i + (i % 3) * 7}deg`, '--d': `${220 + ((i * 53) % 220)}px`, '--t': `${(i % 7) * 0.13}s` }} />
          ))}
        </span>
      )}
      {stage === 'build' && legend && (
        <span className="gacha-summon__bolts" aria-hidden="true">
          {range(BOLTS).map((i) => (
            <i key={i} style={{ '--a': `${-70 + i * 23 + (i % 2) * 9}deg`, '--t': `${1.2 + ((i * 0.37) % 1.8)}s` }} />
          ))}
        </span>
      )}
      {(stage === 'burst' || stage === 'show') &&
        range(waves).map((i) => <span key={i} className="gacha-summon__wave" style={{ '--t': `${i * 0.18}s` }} aria-hidden="true" />)}
      {sparks > 0 && stage !== 'charge' && stage !== 'build' && (
        <span className="gacha-summon__sparks" aria-hidden="true">
          {range(sparks).map((i) => (
            <i
              key={i}
              style={{
                '--a': `${(360 / sparks) * i}deg`,
                '--d': `${(legend ? 160 : 110) + ((i * 37) % (legend ? 260 : 160))}px`,
                '--t': `${(i % 5) * 0.05}s`,
              }}
            />
          ))}
        </span>
      )}
      {legend && stage === 'show' && (
        <span className="gacha-summon__confetti" aria-hidden="true">
          {range(CONFETTI).map((i) => (
            <i
              key={i}
              style={{
                '--x': `${(i * 61) % 100}vw`,
                '--t': `${((i * 0.29) % 3.2).toFixed(2)}s`,
                '--s': `${2.6 + ((i * 0.41) % 2.2)}s`,
                '--r': `${(i % 2 ? 1 : -1) * (180 + ((i * 47) % 540))}deg`,
                '--c': ['#f2c14e', '#fff4c7', '#e8a33a', '#ffffff'][i % 4],
              }}
            />
          ))}
        </span>
      )}
      {stage === 'show' && rarity === 'comun' && (
        <span className="gacha-summon__dust" aria-hidden="true">
          {range(DUST).map((i) => (
            <i key={i} style={{ '--a': `${(360 / DUST) * i}deg`, '--d': `${70 + ((i * 29) % 60)}px` }} />
          ))}
        </span>
      )}
      {stage === 'show' && stars > 0 && (
        <span className="gacha-summon__stars" aria-hidden="true">
          {range(stars).map((i) => (
            <i
              key={i}
              style={{
                '--x': `${50 + Math.cos((i / stars) * 6.283) * (24 + (i % 3) * 7)}%`,
                '--y': `${48 + Math.sin((i / stars) * 6.283) * (30 + (i % 2) * 8)}%`,
                '--t': `${((i * 0.37) % 1.6).toFixed(2)}s`,
                '--z': `${12 + (i % 3) * 6}px`,
              }}
            >
              ✦
            </i>
          ))}
        </span>
      )}
      {stage === 'show' && rarity === 'mitica' && (
        <span className="gacha-summon__coins" aria-hidden="true">
          {range(COINS).map((i) => (
            <i key={i} style={{ '--x': `${(i * 41) % 100}vw`, '--t': `${((i * 0.27) % 2.6).toFixed(2)}s`, '--s': `${1.8 + ((i * 0.31) % 1.4)}s` }} />
          ))}
        </span>
      )}
      {mythic && stage === 'show' && (
        <span className="gacha-summon__embers" aria-hidden="true">
          {range(EMBERS).map((i) => (
            <i
              key={i}
              style={{ '--x': `${(i * 37) % 100}vw`, '--t': `${((i * 0.23) % 4).toFixed(2)}s`, '--s': `${3 + ((i * 0.37) % 3)}s`, '--z': `${3 + (i % 4) * 2}px` }}
            />
          ))}
        </span>
      )}
      <div className="gacha-summon__stage">
        {stage === 'show' ? (
          <>
            {mythic && (
              <span className="gacha-summon__crown" aria-hidden="true">
                ♛
              </span>
            )}
            <span className={`gacha-summon__title ${legend ? 'gacha-summon__title--legend' : epic ? 'gacha-summon__title--legend gacha-summon__title--epic' : ''}`} aria-label={title}>
              {lettered
                ? [...title].map((ch, i) => (
                    <span key={i} style={{ '--t': `${0.5 + i * 0.07}s` }} aria-hidden="true">
                      {ch}
                    </span>
                  ))
                : title}
            </span>
            <div className="gacha-summon__card">
              {legend && <span className="gacha-summon__aura" aria-hidden="true" />}
              {rarity === 'mitica' && <span className="gacha-summon__glory" aria-hidden="true" />}
              <GachaCard card={result.card} big />
            </div>
            <p className="gacha-summon__name">{result.card.name}</p>
            {mythic && <p className="gacha-summon__one">{fused ? `${result.card.fusion.join(' + ')} · ` : ''}1 de 1 · única en GcGames</p>}
            {fused ? (
              <div className="gacha-decide">
                <button type="button" className="hub-btn hub-btn--primary" onClick={onClose} autoFocus>
                  ¡A mi biblioteca!
                </button>
              </div>
            ) : (
              <>
                <div className="gacha-decide">
                  <button type="button" className="hub-btn hub-btn--primary" disabled={busy} onClick={() => onDecide(true)} autoFocus>
                    Guardar en mi biblioteca
                  </button>
                  <button type="button" className="hub-btn" disabled={busy} onClick={() => onDecide(false)}>
                    Descartar
                  </button>
                </div>
                <small className="gacha-decide__note">Si la descartas, queda libre para que le toque a otro. Se vende por {eur(result.card.price)}.</small>
              </>
            )}
          </>
        ) : stage === 'charge' ? (
          <Capsule premium={Boolean(summon.premium)} />
        ) : (
          <div className="gacha-summon__card">
            <span className="gacha-summon__back" />
            {stage === 'build' && legend && (
              <svg className="gacha-summon__cracks" viewBox="0 0 100 150" aria-hidden="true">
                <path d="M50 75 L38 52 L44 40 L30 18" />
                <path d="M50 75 L66 60 L62 44 L78 26" />
                <path d="M50 75 L34 90 L40 104 L22 128" />
                <path d="M50 75 L64 96 L58 112 L74 136" />
                <path d="M50 75 L80 78 L92 70" />
                <path d="M50 75 L20 72 L8 80" />
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// La cápsula de la carga: dos mitades que vibran cada vez más fuerte mientras por la juntura se escapa la luz. La premium
// es violeta y dorada; la normal, dorada y crema.
function Capsule({ premium }) {
  return (
    <div className={`gacha-capsule ${premium ? 'gacha-capsule--premium' : ''}`} aria-hidden="true">
      <span className="gacha-capsule__halo" />
      <span className="gacha-capsule__body">
        <i className="gacha-capsule__top" />
        <i className="gacha-capsule__bottom" />
        <i className="gacha-capsule__seam" />
        <i className="gacha-capsule__shine" />
      </span>
      <span className="gacha-capsule__motes">
        {range(10).map((i) => (
          <i key={i} style={{ '--a': `${i * 36}deg`, '--t': `${(i % 5) * 0.12}s` }} />
        ))}
      </span>
    </div>
  )
}

// Los actos previos de la mítica: presagio (latido rojo, grietas por toda la pantalla, «anomalía» parpadeando y la carta
// boca abajo temblando) y apagón (negro total con un punto de luz justo antes de estallar).
function MythicOmen({ stage }) {
  return (
    <div className={`gacha-omen is-${stage}`} role="dialog" aria-modal="true" aria-label="Tirada del gacha">
      {stage === 'omen' ? (
        <>
          <span className="gacha-omen__pulse" aria-hidden="true" />
          <span className="gacha-omen__static" aria-hidden="true" />
          <svg className="gacha-omen__cracks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M50 50 L42 38 L46 26 L34 10 L30 0" />
            <path d="M50 50 L61 41 L58 28 L72 14 L80 0" />
            <path d="M50 50 L66 54 L80 48 L100 52" />
            <path d="M50 50 L34 56 L20 50 L0 58" />
            <path d="M50 50 L44 64 L52 78 L46 100" />
            <path d="M50 50 L60 66 L74 74 L86 100" />
            <path d="M50 50 L36 70 L18 82 L8 100" />
          </svg>
          <p className="gacha-omen__text" data-text="⚠ ANOMALÍA DETECTADA ⚠">
            ⚠ ANOMALÍA DETECTADA ⚠
          </p>
          <div className="gacha-summon__card gacha-omen__card">
            <span className="gacha-summon__back" />
          </div>
        </>
      ) : (
        <span className="gacha-omen__dot" aria-hidden="true" />
      )}
    </div>
  )
}

// Lo que puede salir en cada tipo de tirada, de lo mejor a lo peor (sin la común, que es lo que sobra).
function Odds({ kind }) {
  return (
    <span className="gacha-chances">
      {RARITIES.filter((r) => ODDS[kind][r] && r !== 'comun').map((r) => (
        <span key={r} className={`gacha-chances__item gacha-chances__item--${r}`}>
          <i aria-hidden="true" />
          {RARITY[r]} <b>{ODDS[kind][r].toLocaleString('es-ES')} %</b>
        </span>
      ))}
    </span>
  )
}

// Escena decorativa del portal: círculo de runas que gira, orbe central, cápsulas en órbita y chispas que suben.
function Altar() {
  return (
    <div className="gacha-altar" aria-hidden="true">
      <span className="gacha-altar__beam" />
      <svg className="gacha-altar__rings" viewBox="0 0 200 200">
        <defs>
          <path id="gacha-altar-path" d="M100 100 m-84 0 a84 84 0 1 1 168 0 a84 84 0 1 1 -168 0" />
        </defs>
        <g className="gacha-altar__outer">
          <circle cx="100" cy="100" r="96" />
          <circle cx="100" cy="100" r="72" className="gacha-altar__dash" />
          <text>
            <textPath href="#gacha-altar-path">ΑΒΓΔΕΖ ✦ ΗΘΙΚΛΜ ✦ ΝΞΟΠΡΣ ✦ ΤΥΦΧΨΩ ✦ </textPath>
          </text>
        </g>
        <g className="gacha-altar__inner">
          <path d="M100 38 L153.7 131 L46.3 131 Z M100 162 L46.3 69 L153.7 69 Z" />
          <circle cx="100" cy="100" r="46" />
        </g>
      </svg>
      <span className="gacha-altar__orbit">
        <i />
        <i />
        <i />
      </span>
      <span className="gacha-altar__orb" />
      <span className="gacha-altar__sparks">
        {range(9).map((i) => (
          <i key={i} style={{ '--x': `${14 + ((i * 37) % 72)}%`, '--t': `${(i * 0.43) % 3}s`, '--s': `${2.6 + (i % 4) * 0.5}s` }} />
        ))}
      </span>
    </div>
  )
}

// La carta que sacaste pagando y aún no has decidido si guardar (por ejemplo, si recargaste la página).
function Pending({ pending, busy, onDecide }) {
  return (
    <div className={`gacha-reveal gacha-reveal--${pending.card.rarity}`}>
      <span className="gacha-reveal__burst" aria-hidden="true" />
      <GachaCard card={pending.card} big />
      <div className="gacha-reveal__text">
        <span className="gacha-reveal__rarity">{RARITY[pending.card.rarity]}</span>
        <p>¿Te la quedas?</p>
        <div className="gacha-decide">
          <button type="button" className="hub-btn hub-btn--primary" disabled={busy} onClick={() => onDecide(true)}>
            Guardar
          </button>
          <button type="button" className="hub-btn" disabled={busy} onClick={() => onDecide(false)}>
            Descartar
          </button>
        </div>
        <small>Si la descartas, queda libre. Se vende por {eur(pending.card.price)}.</small>
      </div>
    </div>
  )
}

// Nombre de una rareza en plural o singular: «2 legendarias», «1 común».
const WORDS = { unica: ['mítica', 'míticas'], mitica: ['legendaria', 'legendarias'], epica: ['épica', 'épicas'], rara: ['rara', 'raras'], comun: ['común', 'comunes'] }
const SHELF = { unica: 'Mítica', mitica: 'Legendarias', epica: 'Épicas', rara: 'Raras', comun: 'Comunes' }

// «2 legendarias, 3 épicas y 1 rara».
function summary(counts) {
  const parts = RARITIES.filter((r) => counts[r] > 0).map((r) => `${counts[r]} ${WORDS[r][counts[r] === 1 ? 0 : 1]}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : (parts[0] ?? '')
}

// Gema de una rareza (la forma y el color los pone el CSS).
function Gem({ rarity }) {
  return <i className={`gacha-gem gacha-gem--${rarity}`} aria-hidden="true" />
}

// Cómo se ordena el álbum: por rareza (en estantes) o en una sola rejilla.
const SORTS = [
  ['rareza', 'Por rareza'],
  ['valor', 'Mayor valor'],
  ['nombre', 'Nombre A-Z'],
]

// Las fusiones del juego: las dos cartas que se juntan, la mítica que sale y cuánto llevas.
function Fusions({ catalog, owned, me, name }) {
  const fusions = catalog.filter((c) => c.fusion)
  if (fusions.length === 0) return null
  return (
    <section className="gacha-fusions" aria-labelledby="fusions-title">
      <h3 id="fusions-title">
        Fusiones <small>junta las dos cartas y se convierten en una mítica única</small>
      </h3>
      <ul>
        {fusions.map((f) => {
          const parts = f.fusion.map((n) => catalog.find((c) => c.name === n)).filter(Boolean)
          const done = owned.has(f.id)
          const have = parts.filter((p) => owned.has(p.id)).length
          return (
            <li key={f.id} className={done ? 'is-done' : have > 0 ? 'is-half' : ''}>
              <span className="gacha-fusions__parts">
                {parts.map((p, i) => (
                  <span key={p.id} className="gacha-fusions__part-wrap">
                    {i > 0 && <b className="gacha-fusions__plus">+</b>}
                    <span className={`gacha-fusions__part ${done || owned.has(p.id) ? 'is-have' : ''}`}>
                      <GachaCard card={p} mini />
                      <small>{p.name}</small>
                    </span>
                  </span>
                ))}
              </span>
              <b className="gacha-fusions__arrow" aria-hidden="true">
                →
              </b>
              <span className={`gacha-fusions__result ${done ? 'is-have' : ''}`}>
                <GachaCard card={f} mini />
                <span>
                  <b>{f.name}</b>
                  <small>{done ? (me ? '¡La tienes!' : `La tiene ${name}`) : `${have} de ${parts.length} cartas juntas`}</small>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// La biblioteca de alguien como un álbum: portada con lo que vale, avance por rareza, fusiones, filtros y las cartas en
// estantes por rareza (con los huecos de las que faltan si se piden).
// Lo que presta el banco por una carta y lo que hay que devolver (igual que en api/_juegos/gacha.mjs).
const loanOf = (card, rules) => Math.floor(card.price * rules.rate)
const debtOf = (card, rules) => Math.ceil(loanOf(card, rules) * (1 + rules.fee))

function Library({ data, catalog, onSell, onPawn, onRedeem, pawnRules, balance, t, busy }) {
  const [confirm, setConfirm] = useState(null)
  const [copied, setCopied] = useState(false)
  const [filter, setFilter] = useState('todas')
  const [sort, setSort] = useState('rareza')
  const [gaps, setGaps] = useState(false)
  if (!data) return <p className="gacha-empty">Cargando…</p>
  const { user, cards, worth } = data
  const counts = Object.fromEntries(RARITIES.map((r) => [r, cards.filter((c) => c.rarity === r).length]))
  const owned = new Set(cards.map((c) => c.id))
  // Con el catálogo cargado sabemos cuántas hay de cada rareza y cuáles faltan (las de fusión salen aparte).
  const total = catalog && Object.fromEntries(RARITIES.map((r) => [r, catalog.filter((c) => c.rarity === r).length]))
  const missing = catalog ? catalog.filter((c) => !owned.has(c.id) && !c.fusion) : []
  const done = catalog ? Math.min(100, Math.round((cards.length / catalog.length) * 100)) : null
  const line = cards.length ? `${user.me ? 'Tengo' : 'Tiene'} ${summary(counts)}.` : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Mi biblioteca del gacha de GcGames: ${summary(counts)} (${cards.length} ${cards.length === 1 ? 'carta' : 'cartas'}, valen ${eur(worth)}).`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function sellButton(card) {
    return (
      <button
        type="button"
        className={`gacha-sell ${confirm === card.id ? 'is-confirm' : ''}`}
        disabled={busy}
        onBlur={() => setConfirm(null)}
        onClick={() => {
          if (confirm !== card.id) return setConfirm(card.id)
          setConfirm(null)
          onSell(card.id)
        }}
      >
        {confirm === card.id ? `¿Vender por ${eur(card.price)}?` : `Vender · ${eur(card.price)}`}
      </button>
    )
  }

  // Empeñar pide confirmación como vender; solo se puede con poco saldo (lo vuelve a comprobar el servidor).
  function pawnButton(card) {
    const loan = loanOf(card, pawnRules)
    const key = `empeno:${card.id}`
    return (
      <button
        type="button"
        className={`gacha-pawn ${confirm === key ? 'is-confirm' : ''}`}
        disabled={busy}
        onBlur={() => setConfirm(null)}
        onClick={() => {
          if (confirm !== key) return setConfirm(key)
          setConfirm(null)
          onPawn(card.id)
        }}
      >
        {confirm === key ? `¿Empeñar? Devuelves ${eur(debtOf(card, pawnRules))}` : `Empeñar · te prestan ${eur(loan)}`}
      </button>
    )
  }

  function cell(card) {
    const pawned = card.pawn
    return (
      <li key={card.id} className={`${card.fusion ? 'is-fusion' : ''} ${pawned ? 'is-pawned' : ''}`}>
        <GachaCard card={card} />
        {card.free && !pawned && <small className="gacha-free-tag">Cogida gratis de la mesa: vale la mitad</small>}
        {pawned && (
          <span className="gacha-pawned">
            <b>Empeñada</b>
            <small>{pawned.vence > t ? `el banco se la queda en ${wait(pawned.vence - t)}` : 'el plazo ha acabado'}</small>
          </span>
        )}
        {user.me && pawned && (
          <button type="button" className="gacha-pawn is-redeem" disabled={busy || balance < pawned.devolver} onClick={() => onRedeem(card.id)}>
            Recuperar · {eur(pawned.devolver)}
          </button>
        )}
        {user.me && !pawned && sellButton(card)}
        {user.me && !pawned && pawnRules && balance < pawnRules.limit && pawnButton(card)}
      </li>
    )
  }

  const shown = cards.filter((c) => filter === 'todas' || c.rarity === filter)
  const flat = sort === 'nombre' ? [...shown].sort((a, b) => a.name.localeCompare(b.name, 'es')) : shown
  const shelves = RARITIES.filter((r) => (filter === 'todas' || filter === r) && (counts[r] > 0 || (gaps && missing.some((c) => c.rarity === r))))

  return (
    <section className="gacha-library" aria-labelledby="lib-title">
      <header className="gacha-lib-head">
        <span className="gacha-lib-head__who">
          <Avatar name={user.name} src={user.avatar} size={64} />
        </span>
        <div className="gacha-lib-head__text">
          <span className="gacha-lib-head__eyebrow">Álbum de colección</span>
          <h2 id="lib-title">{user.me ? 'Mi biblioteca' : `Biblioteca de ${user.name}`}</h2>
          {line && <p className="gacha-lib-line">{line}</p>}
        </div>
        <dl className="gacha-lib-stats">
          <div>
            <dt>Cartas</dt>
            <dd>
              {cards.length}
              {catalog && <small> / {catalog.length}</small>}
            </dd>
          </div>
          <div className="is-worth">
            <dt>{cards.length === 1 ? 'Vale' : 'Valen'}</dt>
            <dd>{eur(worth)}</dd>
          </div>
          {done !== null && (
            <div>
              <dt>Completado</dt>
              <dd>{done} %</dd>
            </div>
          )}
        </dl>
        {user.me && cards.length > 0 && (
          <button type="button" className="hub-btn hub-btn--ghost gacha-lib-copy" onClick={copy}>
            {copied ? 'Copiado' : 'Compartir resumen'}
          </button>
        )}
      </header>

      {user.me && pawnRules && balance < pawnRules.limit && cards.some((c) => !c.pawn) && (
        <p className="gacha-broke" role="status">
          <b>¿Te has quedado sin saldo?</b> Empeña una carta: el banco te presta al momento el {Math.round(pawnRules.rate * 100)} % de lo
          que vale. La recuperas devolviendo un {Math.round(pawnRules.fee * 100)} % más en {Math.round(pawnRules.ms / 3600000 / 24)} días;
          si no, el banco se la queda.
        </p>
      )}

      {/* Avance por rareza: cuántas tienes frente al total que existe. */}
      <ul className="gacha-progress" aria-label="Avance por rareza">
        {RARITIES.map((r) => (
          <li key={r} className={`gacha-progress__item gacha-progress__item--${r} ${counts[r] > 0 ? '' : 'is-none'}`}>
            <Gem rarity={r} />
            <span className="gacha-progress__name">{RARITY[r]}</span>
            <b>
              {counts[r]}
              {total && <small> / {total[r]}</small>}
            </b>
            <span className="gacha-progress__bar" role="progressbar" aria-label={RARITY[r]} aria-valuemin={0} aria-valuemax={total?.[r] ?? counts[r]} aria-valuenow={counts[r]}>
              <i style={{ width: `${total?.[r] ? Math.min(100, (counts[r] / total[r]) * 100) : counts[r] > 0 ? 100 : 0}%` }} />
            </span>
          </li>
        ))}
      </ul>

      {catalog && <Fusions catalog={catalog} owned={owned} me={user.me} name={user.name} />}

      {cards.length === 0 && !gaps ? (
        <p className="gacha-empty">{user.me ? 'Aún no tienes cartas: tira y reclama la que te guste.' : `${user.name} aún no tiene cartas.`}</p>
      ) : null}

      <div className="gacha-toolbar">
        <div className="gacha-chips" role="group" aria-label="Filtrar por rareza">
          <button type="button" className="gacha-chip" aria-pressed={filter === 'todas'} onClick={() => setFilter('todas')}>
            Todas <small>{cards.length}</small>
          </button>
          {RARITIES.map((r) => (
            <button key={r} type="button" className={`gacha-chip gacha-chip--${r}`} aria-pressed={filter === r} onClick={() => setFilter(r)} disabled={counts[r] === 0 && !gaps}>
              <Gem rarity={r} />
              {RARITY[r]} <small>{counts[r]}</small>
            </button>
          ))}
        </div>
        <label className="gacha-select">
          <span>Orden</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {catalog && (
          <button type="button" className="gacha-chip gacha-chip--gaps" aria-pressed={gaps} onClick={() => setGaps((v) => !v)}>
            Huecos <small>{missing.length}</small>
          </button>
        )}
      </div>

      {sort === 'rareza' ? (
        shelves.map((r) => (
          <section key={r} className={`gacha-shelf gacha-shelf--${r}`} aria-label={SHELF[r]}>
            <h3>
              <Gem rarity={r} />
              {SHELF[r]} <small>{total ? `${counts[r]} de ${total[r]}` : counts[r]}</small>
            </h3>
            {counts[r] > 0 && <ul className="gacha-grid">{shown.filter((c) => c.rarity === r).map(cell)}</ul>}
            {gaps && (
              <ul className="gacha-grid gacha-grid--gaps" aria-label={`${SHELF[r]} que faltan`}>
                {missing
                  .filter((c) => c.rarity === r)
                  .map((c) => (
                    <li key={c.id} className="gacha-gap" title={c.owner ? `La tiene ${c.owner.me ? 'otra persona' : c.owner.name}` : 'Libre: puede tocarte'}>
                      <GachaCard card={c} mini />
                      <b>{c.name}</b>
                      <small>{c.owner ? `De ${c.owner.me ? 'ti' : c.owner.name}` : 'Libre'}</small>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        ))
      ) : (
        <ul className="gacha-grid">{flat.map(cell)}</ul>
      )}
    </section>
  )
}

// Barras pequeñas con las cartas que tiene alguien de cada rareza (de la común a la mítica); max: la barra más alta.
function MiniBars({ rarities = {}, max }) {
  return (
    <span className="gacha-bars" role="img" aria-label={summary(rarities) || 'Sin cartas'}>
      {[...RARITIES].reverse().map((r) => (
        <span key={r} className={`gacha-bars__col gacha-bars__col--${r}`} title={`${RARITY[r]}: ${rarities[r] ?? 0}`}>
          <span className="gacha-bars__track">
            <i style={{ height: `${rarities[r] ? Math.max(14, (rarities[r] / max) * 100) : 0}%` }} />
          </span>
          <b>{rarities[r] ?? 0}</b>
        </span>
      ))}
    </span>
  )
}

// Todos los que tienen cartas, de la biblioteca que más vale a la que menos: podio para los tres primeros y una tabla con
// el resto; cada uno abre su biblioteca.
function Collectors({ list, onOpen }) {
  if (!list) return <p className="gacha-empty">Cargando…</p>
  if (list.length === 0) return <p className="gacha-empty">Nadie tiene cartas todavía. ¡Sé el primero!</p>
  const max = Math.max(1, ...list.flatMap((p) => RARITIES.map((r) => p.rarities?.[r] ?? 0)))
  const label = (p) => (p.rarities ? summary(p.rarities) : `${p.count} ${p.count === 1 ? 'carta' : 'cartas'}`)
  return (
    <section className="gacha-ranking" aria-label="Bibliotecas de todos">
      <ol className={`gacha-podium gacha-podium--${Math.min(3, list.length)}`}>
        {list.slice(0, 3).map((p, i) => (
          <li key={p.id} className={`gacha-podium__place gacha-podium__place--${i + 1} ${p.me ? 'is-me' : ''}`}>
            <button type="button" onClick={() => onOpen(p.id)} title={`Ver la biblioteca de ${p.name}`}>
              {i === 0 && (
                <span className="gacha-podium__crown" aria-hidden="true">
                  ♛
                </span>
              )}
              <span className="gacha-podium__avatar">
                <Avatar name={p.name} src={p.avatar} size={i === 0 ? 76 : 60} />
              </span>
              <span className="gacha-podium__name">{p.name}</span>
              <span className="gacha-podium__count">{p.count} {p.count === 1 ? 'carta' : 'cartas'}</span>
              {p.best && (
                <span className="gacha-podium__best">
                  <GachaCard card={p.best} mini />
                </span>
              )}
              <MiniBars rarities={p.rarities} max={max} />
              <b className="gacha-podium__worth">{eur(p.worth)}</b>
              <span className="gacha-podium__step" aria-hidden="true">
                {i + 1}
              </span>
              <span className="gacha-sr">{label(p)}</span>
            </button>
          </li>
        ))}
      </ol>
      {list.length > 3 && (
        <ol className="gacha-rank" aria-label="El resto de bibliotecas" start={4}>
          {list.slice(3).map((p, i) => (
            <li key={p.id}>
              <button type="button" className={p.me ? 'is-me' : ''} onClick={() => onOpen(p.id)}>
                <b className="gacha-rank__pos">{i + 4}</b>
                <Avatar name={p.name} src={p.avatar} size={40} />
                <span className="gacha-rank__name">
                  {p.name}
                  <small>{label(p)}</small>
                </span>
                <MiniBars rarities={p.rarities} max={max} />
                {p.best && (
                  <span className="gacha-rank__best">
                    <GachaCard card={p.best} mini />
                  </span>
                )}
                <span className="gacha-rank__worth">{eur(p.worth)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Cómo se ordena la tabla de cartas (la lista llega ya de mayor a menor valor).
const CARD_SORTS = {
  valor: ['Mejores primero', null],
  dificil: ['Más difíciles de sacar', (a, b) => Number(Boolean(a.fusion)) - Number(Boolean(b.fusion)) || a.normal - b.normal],
  nombre: ['Nombre A-Z', (a, b) => a.name.localeCompare(b.name, 'es')],
  libres: ['Libres primero', (a, b) => Number(Boolean(a.owner)) - Number(Boolean(b.owner))],
}

// Todas las cartas que pueden salir: rareza, probabilidad de que te toque cada una, precio de venta y dueño.
function CardTable({ list, onOpen }) {
  const [rarity, setRarity] = useState('todas')
  const [owner, setOwner] = useState('todas')
  const [sort, setSort] = useState('valor')
  const [query, setQuery] = useState('')
  if (!list) return <p className="gacha-empty">Cargando…</p>
  const q = query.trim().toLowerCase()
  const byOwner = { todas: () => true, con: (c) => c.owner, libres: (c) => !c.owner, mias: (c) => c.owner?.me }
  const sorter = CARD_SORTS[sort][1]
  const found = list.filter(
    (c) =>
      (rarity === 'todas' || c.rarity === rarity) &&
      byOwner[owner](c) &&
      (!q || `${c.name} ${c.series} ${c.owner?.name ?? ''}`.toLowerCase().includes(q)),
  )
  const shown = sorter ? [...found].sort(sorter) : found
  const taken = list.filter((c) => c.owner).length
  const top = Math.max(...list.map((c) => c.normal ?? 0), 1)
  return (
    <section className="gacha-cards" aria-labelledby="cards-title">
      <header className="gacha-cards__head">
        <h2 id="cards-title" className="hub-title">
          Cartas <small>{`${list.length} cartas · ${taken} con dueño · ${list.length - taken} libres`}</small>
        </h2>
        <label className="gacha-select gacha-select--search">
          <span>Buscar</span>
          <input type="search" value={query} placeholder="Nombre, origen o dueño" onChange={(e) => setQuery(e.target.value)} />
        </label>
      </header>
      <div className="gacha-toolbar">
        <div className="gacha-chips" role="group" aria-label="Filtrar por rareza">
          <button type="button" className="gacha-chip" aria-pressed={rarity === 'todas'} onClick={() => setRarity('todas')}>
            Todas
          </button>
          {RARITIES.map((r) => (
            <button key={r} type="button" className={`gacha-chip gacha-chip--${r}`} aria-pressed={rarity === r} onClick={() => setRarity(r)}>
              <Gem rarity={r} />
              {RARITY[r]}
            </button>
          ))}
        </div>
        <div className="gacha-chips" role="group" aria-label="Filtrar por dueño">
          {[
            ['todas', 'Todas'],
            ['con', 'Con dueño'],
            ['libres', 'Libres'],
            ['mias', 'Mías'],
          ].map(([id, name]) => (
            <button key={id} type="button" className="gacha-chip gacha-chip--owner" aria-pressed={owner === id} onClick={() => setOwner(id)}>
              {name}
            </button>
          ))}
        </div>
        <label className="gacha-select">
          <span>Orden</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(CARD_SORTS).map(([id, [name]]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="gacha-table-wrap">
        <table className="gacha-table">
          <thead>
            <tr>
              <th scope="col">Carta y dueño</th>
              <th scope="col">Rareza</th>
              <th scope="col" className="is-num" title="Probabilidad de que te toque esta carta en una tirada normal">
                Prob. tirada
              </th>
              <th scope="col" className="is-num" title="Probabilidad de que te toque esta carta en una tirada premium">
                Prob. premium
              </th>
              <th scope="col" className="is-num">
                Venta
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className={`gacha-table__row--${c.rarity} ${c.owner?.me ? 'is-mine' : ''}`}>
                <td className="gacha-table__main">
                  <span className="gacha-table__card">
                    <GachaCard card={c} mini />
                    <span>
                      <b>{c.name}</b>
                      {c.series && <small>{c.series}</small>}
                      {c.owner ? (
                        <span className="gacha-owner">
                          <Avatar name={c.owner.name} src={c.owner.avatar} size={18} />
                          {c.owner.me ? <b>Es tuya</b> : <>Es de <Who person={c.owner} onOpen={onOpen} /></>}
                        </span>
                      ) : c.fusion ? (
                        <span className="gacha-owner gacha-free">Solo por fusión: junta {c.fusion.join(' y ')}</span>
                      ) : (
                        <span className="gacha-owner gacha-free">Libre: puede tocarle a cualquiera</span>
                      )}
                      {c.fusesWith && (
                        <span className="gacha-owner gacha-fuse">
                          Fusión: júntala con {(c.fusions ?? [c.fusesWith]).map((f) => f.with).join(' o con ')}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td data-label="Rareza">
                  <span className={`gacha-tag gacha-tag--${c.rarity}`}>
                    <Gem rarity={c.rarity} />
                    {RARITY[c.rarity]}
                  </span>
                </td>
                <td className="is-num" data-label="Prob. tirada">
                  {c.fusion ? (
                    '—'
                  ) : (
                    <span className="gacha-prob">
                      <b>{pct(c.normal)}</b>
                      <i style={{ width: `${Math.max(6, Math.sqrt(c.normal / top) * 100)}%` }} />
                    </span>
                  )}
                </td>
                <td className="is-num" data-label="Prob. premium">
                  {c.premium ? pct(c.premium) : '—'}
                </td>
                <td className="is-num gacha-table__price" data-label="Venta">
                  {eur(c.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="gacha-empty">Ninguna carta con esos filtros.</p>}
      </div>
    </section>
  )
}

function Rules({ prices }) {
  return (
    <Help className="tg tg--help" label="Cómo funciona" title="Cómo funciona el gacha" wide>
      <p>
        <b>La mesa:</b> cada hora sale sola una carta, hasta 5 a la vista de todos. Cualquiera puede <b>cogerla</b> gratis y
        se la queda el primero que pulse, <b>sin límite</b>: puedes coger todas las que quieras. Cada carta tiene un solo
        dueño.
      </p>
      <p>
        <b>Tirar pagando</b> con tu saldo de la semana: una tirada cuesta {eur(prices?.roll ?? 2000)} y una{' '}
        <b>premium</b>, {eur(prices?.premium ?? 20000)} (siempre épica o legendaria). Sale una carta sin dueño y decides si la{' '}
        <b>guardas</b> o la <b>descartas</b>; hasta decidirlo no puedes volver a tirar.
      </p>
      <p>
        <b>Las cartas son bienes, no efectivo: Hacienda no las ve.</b> Solo mira tu saldo, así que lo que guardes en cartas no
        cuenta para sus tramos ni sus inspecciones. Una carta sacada pagando se vende de media por casi lo que costó (se pierde
        alrededor de un 12 %), así que puedes guardar ahí el dinero y venderlas cuando lo necesites.
      </p>
      <p>
        <b>Las cartas son tu garantía:</b> si te quedas con menos de {eur(prices?.pawn?.limit ?? 2000)} en el saldo, puedes{' '}
        <b>empeñar</b> una carta desde tu biblioteca y el banco te presta al momento el {Math.round((prices?.pawn?.rate ?? 0.7) * 100)} % de
        lo que vale. La carta sigue siendo tuya, pero no la puedes vender ni fusionar hasta que la <b>recuperes</b>, devolviendo
        el préstamo y un {Math.round((prices?.pawn?.fee ?? 0.2) * 100)} % más en {Math.round((prices?.pawn?.ms ?? 259200000) / 86400000)} días
        como mucho. Si no la recuperas a tiempo, <b>el banco se la queda</b> y vuelve a estar libre para cualquiera.
      </p>
      <p>
        <b>Fusiones (uniones):</b> si juntas en tu biblioteca las dos cartas de una unión, al momento se convierten en su carta
        mítica: <b>Asta + Liebe</b> = Asta: Unión Demoníaca; <b>Yuno + Sylph</b> = Yuno: Unión con el espíritu del viento;{' '}
        <b>Magna Swing + Dante</b> = Magna God; <b>Lucifero + Dante</b> = Dante al 100 %; <b>Megicula + Vanica</b>,{' '}
        <b>Beelzebub + Zenon</b>, <b>Walgner + Nacht</b> y <b>Salamander + Fuegoleon</b>. Las dos cartas vuelven a quedar libres.
        Las de fusión no salen nunca en la mesa ni en las tiradas: hay una de cada y solo se consiguen así.
      </p>
      <p>
        Puedes <b>vender</b> cualquier carta tuya desde tu biblioteca: el dinero va a tu saldo de la semana (una común, unos
        1.750 €; una legendaria, unos 34.000 €; las que cogiste gratis de la mesa, la mitad) y la carta vuelve a poder salir. En «Bibliotecas» ves las cartas de todo el mundo y
        en «Cartas», todas las que pueden tocar y con qué probabilidad.
      </p>
      <table className="gacha-odds">
        <thead>
          <tr>
            <th>Rareza</th>
            <th>Mesa y tirada</th>
            <th>Premium</th>
          </tr>
        </thead>
        <tbody>
          {RARITIES.map((r) => (
            <tr key={r} className={`gacha-roll__name--${r}`}>
              <td>
                <em>{RARITY[r]}</em>
              </td>
              <td>{(ODDS.normal[r] ?? 0).toLocaleString('es-ES')} %</td>
              <td>{(ODDS.premium[r] ?? 0).toLocaleString('es-ES')} %</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="gacha-note">
        Las cartas son de Black Clover: los Toros Negros, los capitanes de los Caballeros Mágicos, la Triada Oscura, los
        demonios, los espíritus, los elfos… En lo más alto, Asta. La rareza sale de lo famoso que es cada uno. Tu biblioteca no se reinicia el domingo; tu saldo, sí.
      </p>
    </Help>
  )
}

const TABS = [
  ['tirar', 'Tirar'],
  ['coleccion', 'Mi biblioteca'],
  ['colecciones', 'Bibliotecas'],
  ['cartas', 'Cartas'],
]

export default function Gacha({ onExit, juegos, initialTab = 'tirar' }) {
  const { state, feed, offset, collection, setCollection, ranking, cards, load } = useGacha(juegos.request)
  const [tab, setTab] = useState(initialTab)
  const [busy, setBusy] = useState(false)
  const [summon, setSummon] = useState(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const t = useServerNow(offset)
  const balance = juegos.me?.balance ?? 0

  async function act(a, extra) {
    setBusy(true)
    const body = await load(a, extra)
    setBusy(false)
    return body
  }

  async function roll(premium) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const started = Date.now()
    if (!reduced) {
      setSummon({ stage: 'charge', premium })
      playSpin(CHARGE_MS)
    }
    const body = await act('tirar', { pago: true, premium })
    const result = body?.gacha?.result
    if (!result) return setSummon(null)
    if (reduced) return setSummon({ stage: 'show', result })
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, CHARGE_MS - (Date.now() - started))))
    await reveal(result)
  }

  // Presagio, carga, estallido y la carta: lo que dura y lo que suena depende de la rareza.
  async function reveal(result) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setSummon({ stage: 'show', result })
    const rarity = result.card.rarity
    if (rarity === 'unica') {
      setSummon({ stage: 'omen', result })
      playGrowl()
      for (let k = 0; k < 4; k++) setTimeout(playHeartbeat, 300 + k * 650)
      setTimeout(playSiren, OMEN_MS - 700)
      await new Promise((resolve) => setTimeout(resolve, OMEN_MS))
    }
    if (BUILD_MS[rarity]) {
      setSummon({ stage: 'build', result })
      playSpin(BUILD_MS[rarity])
      await new Promise((resolve) => setTimeout(resolve, BUILD_MS[rarity]))
    }
    if (rarity === 'unica') {
      setSummon({ stage: 'blackout', result })
      await new Promise((resolve) => setTimeout(resolve, BLACKOUT_MS))
    }
    setSummon({ stage: 'burst', result })
    playZap()
    if (rarity === 'mitica' || rarity === 'unica') playBoom()
    if (rarity === 'unica') setTimeout(playBoom, 260)
    await new Promise((resolve) => setTimeout(resolve, BURST_MS[rarity]))
    setSummon({ stage: 'show', result })
    if (rarity === 'unica' || rarity === 'mitica' || rarity === 'epica') playWin(rarity !== 'epica')
    else playCard()
    if (rarity === 'unica') setTimeout(playOvation, 700)
  }

  async function decide(keep) {
    const body = await act('decidir', { keep })
    setSummon(null)
    await revealFusion(body)
  }

  async function take(id) {
    await revealFusion(await act('coger', { id }))
  }

  // Si con la carta que acabas de conseguir juntas una fusión, el servidor ya te la ha dado: se enseña como una mítica.
  async function revealFusion(body) {
    const fused = body?.gacha?.result?.fused
    if (fused) await reveal({ card: fused, fused: true })
  }

  function openCollection(user) {
    setCollection(null)
    setTab('coleccion')
    load('coleccion', user ? { user } : {})
  }

  function openTab(id) {
    if (id === 'coleccion') return openCollection()
    setTab(id)
    if (id === 'colecciones') load('ranking')
    if (id === 'cartas') load('cartas')
  }

  // Si se entra desde el escaparate con una pestaña concreta, se cargan sus datos.
  useEffect(() => {
    if (initialTab === 'coleccion') load('coleccion')
    if (initialTab === 'colecciones') load('ranking')
    if (initialTab === 'cartas') load('cartas')
  }, [initialTab, load])

  // El álbum necesita el catálogo entero (totales por rareza, huecos y fusiones): se pide una vez al abrirlo.
  useEffect(() => {
    if (tab === 'coleccion' && !cards) load('cartas')
  }, [tab, cards, load])

  const prices = state?.prices
  const premiumPrice = prices?.premium ?? 20000
  const rollPrice = prices?.roll ?? 2000
  const table = state?.table ?? []

  return (
    <main className="app gacha-app">
      <header className="top">
        <h1>Gacha</h1>
        <div className="toggles">
          <button type="button" className="tg tg--back" onClick={onExit}>
            Juegos
          </button>
          <Rules prices={state ? { ...prices, pawn: state.pawn } : null} />
        </div>
      </header>

      <dl className="gacha-hud">
        <div>
          <dt>La mesa</dt>
          <dd>
            {state ? `${table.length}/${state.tableMax}` : '–'}
            {state && <small>{state.nextDropAt ? `otra carta en ${wait(state.nextDropAt - t)}` : 'llena: cógelas'}</small>}
          </dd>
        </div>
        <div>
          <dt>Biblioteca</dt>
          <dd>
            {state ? state.owned : '–'}
            <small>{state?.owned === 1 ? 'carta tuya' : 'cartas tuyas'}</small>
          </dd>
        </div>
        <div>
          <dt>Saldo de la semana</dt>
          <dd>
            {eur(balance)}
            <small>{balance >= premiumPrice ? 'te llega para una premium' : `la premium cuesta ${eur(premiumPrice)}`}</small>
          </dd>
        </div>
      </dl>

      <nav className="hub-segs gacha-tabs" aria-label="Secciones del gacha">
        {TABS.map(([id, name]) => (
          <button key={id} type="button" className="hub-seg" aria-pressed={tab === id} onClick={() => openTab(id)}>
            <span>{name}</span>
          </button>
        ))}
      </nav>

      {(juegos.error || !state) && (
        <p className="status gacha-status" role="status">
          {juegos.error || 'Conectando…'}
        </p>
      )}

      {tab === 'tirar' && (
        <div className="gacha-home">
          {/* Portal de invocación: la escena, y a su lado los dos botones de tirar pagando con lo que puede salir en cada uno. */}
          <section className={`gacha-portal ${busy ? 'is-busy' : ''} ${state?.pending && !summon ? 'has-pending' : ''}`} aria-labelledby="roll-title">
            <Altar />
            <div className="gacha-portal__body">
              <h2 id="roll-title" className="hub-title">
                Invocar <small>tú decides si te la quedas</small>
              </h2>
              {state?.pending && !summon ? (
                <Pending pending={state.pending} busy={busy} onDecide={decide} />
              ) : (
                <div className="gacha-portal__btns">
                  <button type="button" className="gacha-roll-btn" disabled={busy || !state || balance < rollPrice} onClick={() => roll(false)}>
                    <span className="gacha-roll-btn__pack" aria-hidden="true" />
                    <span className="gacha-roll-btn__txt">
                      <b>Tirar</b>
                      <small>cualquier rareza</small>
                    </span>
                    <span className="gacha-roll-btn__price">{eur(rollPrice)}</span>
                    <Odds kind="normal" />
                  </button>
                  <button
                    type="button"
                    className="gacha-roll-btn gacha-roll-btn--premium"
                    disabled={busy || !state || balance < premiumPrice}
                    onClick={() => roll(true)}
                  >
                    <span className="gacha-roll-btn__pack" aria-hidden="true" />
                    <span className="gacha-roll-btn__txt">
                      <b>✦ Premium</b>
                      <small>épica o mejor</small>
                    </span>
                    <span className="gacha-roll-btn__price">{eur(premiumPrice)}</span>
                    <Odds kind="premium" />
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* La mesa, como un escaparate: cada carta bajo su foco, del color de su rareza. */}
          <section className="gacha-mesa" aria-labelledby="mesa-title">
            <h2 id="mesa-title" className="hub-title">
              La mesa <small>gratis y sin límite · {state?.nextDropAt ? `otra carta en ${wait(state.nextDropAt - t)}` : 'llena'}</small>
            </h2>
            {/* key: con el imán del carrusel (móvil), al llegar una carta el navegador seguía enganchado al hueco que
                ocupaba el primer puesto y la lista salía desplazada; con otra lista vuelve al principio. */}
            <ul className="gacha-mesa__cards" key={table.map((entry) => entry.id).join()}>
              {table.map((entry) => (
                <li key={entry.id} className={`gacha-mesa__item gacha-mesa__item--${entry.card.rarity}`}>
                  <GachaCard card={entry.card} />
                  <button type="button" className="hub-btn hub-btn--primary" disabled={busy} onClick={() => take(entry.id)}>
                    Coger
                  </button>
                </li>
              ))}
              {/* Huecos libres: el primero dice cuándo sale la siguiente. */}
              {range(Math.max(0, (state?.tableMax ?? 5) - table.length)).map((i) => (
                <li key={`hueco-${i}`} className="gacha-mesa__slot" aria-hidden="true">
                  <span>{i === 0 && state?.nextDropAt ? `Sale en ${wait(state.nextDropAt - t)}` : 'Hueco libre'}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="gacha-feed" aria-labelledby="feed-title">
            <h2 id="feed-title" className="hub-title">
              Canal <small>lo último que ha pasado</small>
            </h2>
            {feed.length === 0 ? (
              <p className="gacha-empty">{state ? 'Todavía no ha pasado nada.' : 'Cargando…'}</p>
            ) : (
              <>
                <ul className="gacha-rolls">
                  {(feedOpen ? feed : feed.slice(0, FEED_SHOWN)).map((move) => (
                    <Move key={move.id} move={move} t={t} onOpen={openCollection} />
                  ))}
                </ul>
                {feed.length > FEED_SHOWN && (
                  <button type="button" className="hub-btn gacha-feed__more" onClick={() => setFeedOpen((v) => !v)}>
                    {feedOpen ? 'Ver menos' : `Ver más (${feed.length - FEED_SHOWN})`}
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'coleccion' && (
        <Library
          data={collection}
          catalog={cards}
          busy={busy}
          balance={balance}
          t={t}
          pawnRules={state?.pawn ?? null}
          onSell={(card) => act('vender', { card }).then(() => load('coleccion'))}
          onPawn={(card) => act('empenar', { card }).then(() => load('coleccion'))}
          onRedeem={(card) => act('recuperar', { card }).then(() => load('coleccion'))}
        />
      )}
      {tab === 'colecciones' && <Collectors list={ranking} onOpen={openCollection} />}
      {tab === 'cartas' && <CardTable list={cards} onOpen={openCollection} />}

      {summon && <Summon summon={summon} busy={busy} onDecide={decide} onClose={() => setSummon(null)} />}

      <footer className="gacha-foot">Imágenes enlazadas desde la wiki de Black Clover (Fandom); Black Clover es de Yūki Tabata y sus estudios. Solo para GcGames, sin fines comerciales.</footer>
    </main>
  )
}
