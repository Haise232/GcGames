import { useState } from 'react'
import { eur } from './money.js'
import { RARITY, pct } from './gacha.js'
import './Gacha.css'

// Estrellas del sello de cada rareza (las que se pintan en la carta).
const STARS = { comun: 1, rara: 2, epica: 3, mitica: 4, unica: 5 }

// Mientras el ratón se mueve por una carta grande, inclina la carta y desplaza el brillo holográfico (variables CSS, sin
// volver a pintar React). Con dedo o lápiz no se hace nada.
function tilt(e) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const box = el.getBoundingClientRect()
  const x = (e.clientX - box.left) / box.width
  const y = (e.clientY - box.top) / box.height
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
  el.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(2)}deg`)
  el.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`)
}
function untilt(e) {
  for (const v of ['--mx', '--my', '--rx', '--ry']) e.currentTarget.style.removeProperty(v)
}

// Una carta coleccionable del gacha: marco por rareza, arte, nombre, serie, sello de rareza y precio. Las épicas y
// mejores llevan foil holográfico que sigue al ratón. mini: solo la imagen con el marco (sin texto ni inclinación).
// Si la imagen no carga, las iniciales.
function GachaCard({ card, big = false, mini = false }) {
  const [broken, setBroken] = useState(false)
  const initials = card.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
  return (
    <figure
      className={`gacha-card gacha-card--${card.rarity} ${big ? 'gacha-card--big' : ''} ${mini ? 'gacha-card--mini' : ''}`}
      onPointerMove={mini ? undefined : tilt}
      onPointerLeave={mini ? undefined : untilt}
    >
      <span className="gacha-card__img">
        {broken ? (
          <span className="gacha-card__fallback" aria-hidden="true">
            {initials}
          </span>
        ) : (
          <img
            src={card.img}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            // pos: encuadre horizontal cuando lo importante de la imagen no está en el centro.
            style={card.pos ? { objectPosition: `${card.pos} 20%` } : undefined}
            onError={() => setBroken(true)}
          />
        )}
        {/* Sello de rareza: gema con tantas estrellas como nivel. */}
        {!mini && (
          <span className="gacha-card__seal" aria-hidden="true">
            {'★'.repeat(STARS[card.rarity] ?? 1)}
          </span>
        )}
      </span>
      {!mini && (
        <figcaption>
          <b>{card.name}</b>
          {card.series && <small>{card.series}</small>}
          <span className="gacha-card__tags">
            <em>{RARITY[card.rarity]}</em>
            <span className="gacha-card__price" title="Precio de venta">
              {eur(card.price)}
            </span>
          </span>
          {card.fusion ? (
            <span className="gacha-card__odds gacha-card__fuse">Solo por fusión: {card.fusion.join(' + ')}</span>
          ) : (
            card.odds && <span className="gacha-card__odds">{pct(card.odds.normal)} por tirada</span>
          )}
          {card.fusesWith && <span className="gacha-card__odds gacha-card__fuse">Júntala con {card.fusesWith.with}: fusión mítica</span>}
        </figcaption>
      )}
    </figure>
  )
}

export default GachaCard
