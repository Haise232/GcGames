import Avatar from './Avatar.jsx'
import { BOARD, JAIL_MS, PARKING_MIN, SALIDA_BONUS, TRAP_WIN, cardById } from './inmo.js'
import { eur } from './money.js'

// Las casillas que no son propiedades (reglas en inmo.js): qué hace cada una, en el panel de al lado del tablero.
// board: lo que manda el servidor (bote del Parking, lo usado hoy, quién está preso y lo de Hacienda).

const hhmm = (t) => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
const left = (until, now) => `${Math.max(1, Math.ceil((until - now) / 60000))} min`

// La carta que acaba de salir, que se da la vuelta.
export function DrawnCard({ drawn }) {
  const card = cardById(drawn.card)
  if (!card) return null
  const amount = drawn.amount
  return (
    <div className={`sq-card sq-card--${drawn.mazo}`} key={drawn.key}>
      <div className="sq-card__inner">
        <div className="sq-card__back">{drawn.mazo === 'suerte' ? '?' : '📦'}</div>
        <div className="sq-card__front">
          <small>{drawn.mazo === 'suerte' ? 'Suerte' : 'Caja de comunidad'}</small>
          <p>{card.text}</p>
          {amount !== 0 && <b className={amount > 0 ? 'is-plus' : 'is-minus'}>{amount > 0 ? `+${eur(amount)}` : `−${eur(-amount)}`}</b>}
          {drawn.until && <b className="is-minus">En la cárcel hasta las {hhmm(drawn.until)}</b>}
          {drawn.casa !== undefined && drawn.casa !== null && <b className="is-plus">Casa nueva en {BOARD[drawn.casa].name}</b>}
        </div>
      </div>
    </div>
  )
}

export default function Squares({ i, board, now, busy, balance, drawn, onAct }) {
  const cell = BOARD[i]
  const used = board?.used ?? {}
  const head = (title, sub) => (
    <header className="sq-head">
      <small>{sub}</small>
      <h2 id="deed-title">{title}</h2>
    </header>
  )
  let body = null

  if (cell.kind === 'salida') {
    body = (
      <>
        <p>Cada vez que pasas por la Salida, el banco te paga. Aquí, una vez al día.</p>
        <button type="button" className="hub-btn hub-btn--primary" disabled={busy || used.salida} onClick={() => onAct('salida')}>
          {used.salida ? 'Ya la cobraste hoy: vuelve mañana' : `Cobrar ${eur(SALIDA_BONUS)}`}
        </button>
      </>
    )
  } else if (cell.kind === 'suerte' || cell.kind === 'caja') {
    const mazo = cell.kind
    const done = used[mazo]
    body = (
      <>
        <p>
          {mazo === 'suerte'
            ? 'Cartas de todo un poco: dinero, alquiler por adelantado, una casa regalada… o la cárcel.'
            : 'Cartas de la comunidad: casi siempre algo de dinero, a veces alguna factura.'}{' '}
          Una carta al día. Lo que pagues va al bote del Parking.
        </p>
        {drawn?.mazo === mazo && <DrawnCard drawn={drawn} />}
        <button type="button" className="hub-btn hub-btn--primary" disabled={busy || done} onClick={() => onAct('carta', { mazo })}>
          {done ? 'Ya cogiste carta hoy: vuelve mañana' : 'Coger una carta'}
        </button>
      </>
    )
  } else if (cell.kind === 'parking') {
    const bote = board?.bote ?? 0
    body = (
      <>
        <div className="sq-pot">
          <small>Bote del Parking</small>
          <b>{eur(bote)}</b>
          <i style={{ '--fill': `${Math.min(100, (bote / PARKING_MIN) * 100)}%` }} />
        </div>
        <p>
          Se llena con lo que se paga en las cartas y con un poco de lo que se queda el banco en cada venta. Cuando pasa de {eur(PARKING_MIN)}, se lo
          lleva entero el primero que lo pida (una vez al día).
        </p>
        <button type="button" className="hub-btn hub-btn--primary" disabled={busy || used.parking || bote < PARKING_MIN} onClick={() => onAct('parking')}>
          {used.parking ? 'Ya lo intentaste hoy' : bote < PARKING_MIN ? `Faltan ${eur(PARKING_MIN - bote)}` : `¡Llevarme ${eur(bote)}!`}
        </button>
      </>
    )
  } else if (cell.kind === 'a-carcel') {
    body = (
      <>
        <p>
          Tienta a la suerte: a cara o cruz, o te libras y cobras <b>{eur(TRAP_WIN)}</b>, o vas a la cárcel {JAIL_MS / 60000} min sin cobrar
          alquiler (lo acumulado se cobra antes). Una vez al día.
        </p>
        <button type="button" className="hub-btn hub-btn--primary sq-danger" disabled={busy || used.trampa || Boolean(board?.carcel)} onClick={() => onAct('trampa')}>
          {used.trampa ? 'Ya tentaste a la suerte hoy' : board?.carcel ? 'Ya estás en la cárcel' : 'Tentar a la suerte'}
        </button>
      </>
    )
  } else if (cell.kind === 'carcel') {
    const jailed = board?.jailed ?? []
    body = (
      <>
        {board?.carcel && <p className="sq-alert">Estás en la cárcel: tus propiedades no dan alquiler hasta las {hhmm(board.carcel)}.</p>}
        <p>Aquí acaba quien saca la carta de la cárcel, quien pierde en «Vete a la cárcel» y quien intenta sobornar a Hacienda y le pillan.</p>
        {jailed.length ? (
          <ul className="sq-jail">
            {jailed.map((j, k) => (
              <li key={k}>
                <Avatar name={j.name} src={j.avatar} size={26} />
                <span>
                  {j.name}
                  <small>{j.why === 'hacienda' ? 'por sobornar a Hacienda' : 'en la Inmobiliaria'}</small>
                </span>
                <b>{left(j.until, now)}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sq-empty">Ahora mismo no hay nadie entre rejas.</p>
        )}
      </>
    )
  } else if (cell.kind === 'impuesto') {
    const h = board?.hacienda
    const missing = h ? Math.max(0, h.nextAt - balance) : 0
    body = (
      <>
        {h?.pending && <p className="sq-alert">Tienes una declaración de Hacienda pendiente: contéstala en la Banca.</p>}
        <p>Hacienda solo mira tu saldo de la semana: las propiedades, los países, los planetas, las cartas y Suiza no los ve.</p>
        {h && (
          <div className="sq-tax">
            <small>Próxima declaración</small>
            <b>al pasar de {eur(h.nextAt)}</b>
            <span>
              Te pedirá un {h.nextRate} % · {missing > 0 ? `te faltan ${eur(missing)}` : 'ya estás ahí'}
            </span>
            <i style={{ '--fill': `${Math.min(100, (balance / h.nextAt) * 100)}%` }} />
          </div>
        )}
      </>
    )
  } else {
    body = <p>Una casilla de adorno.</p>
  }

  const SUB = { salida: 'Una vez al día', suerte: 'Una carta al día', caja: 'Una carta al día', parking: 'El bote de todos', 'a-carcel': 'A cara o cruz', carcel: 'Entre rejas', impuesto: 'Hacienda' }
  return (
    <section className={`im-deed sq sq--${cell.kind}`} aria-labelledby="deed-title">
      {head(cell.name, SUB[cell.kind] ?? '')}
      <div className="sq-body">{body}</div>
    </section>
  )
}
