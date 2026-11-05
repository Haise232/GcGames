// La Torre en la Season 4: un faro canario junto a la playa. Aquí el arte que se añade a la escena de Tower.jsx (la
// costa con el mar, la arena, palmeras y sombrillas al pie, y la linterna del faro con su haz en la cima); los colores
// de la torre (franjas rojas y blancas, pisos de tablones…) están en tower-beach.css. Todo se ve solo con .juegos-root.s4
// y sin Halloween; si no, se esconde y la torre sigue como siempre.
import './tower-beach.css'

// La costa al pie del faro: mar con el reflejo del sol, la isla de enfrente, la arena con palmeras, sombrillas, una
// silla de socorrista y las olas que llegan a la orilla. Se hunde al subir (como .tw-city).
export function TowerShore() {
  return (
    <svg className="tw-shore" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="tws-sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a6a" />
          <stop offset="0.18" stopColor="#3aa6b8" />
          <stop offset="1" stopColor="#0d5a74" />
        </linearGradient>
        <linearGradient id="tws-sand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d79a" />
          <stop offset="1" stopColor="#dcae68" />
        </linearGradient>
      </defs>
      {/* La isla de enfrente, con su volcán. */}
      <path className="tw-shore__isle" d="M232 52 Q262 44 280 30 L288 26 L296 31 Q318 44 352 52 Z" />
      <path d="M284 28 L288 26 L292 28 L288 29 Z" fill="#fff" opacity="0.8" />
      {/* El mar y el reflejo del sol. */}
      <rect x="0" y="52" width="400" height="68" fill="url(#tws-sea)" />
      <g className="tw-shore__glint">
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={k} x={186 - k * 6} y={56 + k * 5} width={28 + k * 12} height="1.6" rx="0.8" fill="#ffe6a8" opacity={0.75 - k * 0.1} />
        ))}
      </g>
      <g className="tw-shore__boat">
        <path d="M60 64 h18 l-3 4 h-12 z" fill="#f4f4f4" />
        <path d="M69 64 V50 L79 63 Z" fill="#fff" />
        <path d="M69 52 V63 L61 63 Z" fill="#ff7a5a" />
      </g>
      {/* La arena, con la espuma de la orilla. */}
      <path d="M0 120 V92 Q60 84 120 88 T240 86 T400 90 V120 Z" fill="url(#tws-sand)" />
      <path className="tw-shore__foam" d="M0 92 Q30 86 60 90 T120 88 T180 89 T240 86 T300 88 T360 87 T420 90" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.85" />
      {/* Sombrillas, toalla y la silla del socorrista. */}
      <g transform="translate(96 98)">
        <path d="M0 0 V-18" stroke="#6a4a2a" strokeWidth="1.4" />
        <path d="M-14 -16 Q0 -28 14 -16 Z" fill="#ff5a4a" />
        <path d="M-14 -16 Q-7 -24 0 -26 Q-3 -20 -4 -16 Z M4 -16 Q3 -21 0 -26 Q7 -24 14 -16 Z" fill="#fff" />
        <rect x="-10" y="4" width="20" height="7" rx="1.5" fill="#2ec4c0" transform="rotate(-8)" />
      </g>
      <g transform="translate(300 100)">
        <path d="M0 0 V-16" stroke="#6a4a2a" strokeWidth="1.4" />
        <path d="M-13 -14 Q0 -25 13 -14 Z" fill="#ffd25e" />
        <path d="M-13 -14 Q-6 -22 0 -23 Q-3 -18 -4 -14 Z M4 -14 Q3 -19 0 -23 Q6 -22 13 -14 Z" fill="#ff8a4c" />
      </g>
      <g transform="translate(338 104)" stroke="#f2efe6" strokeWidth="1.6" fill="none">
        <path d="M-6 0 L-3 -20 M6 0 L3 -20 M-4 -12 H4 M-3 -20 H3" />
        <rect x="-5" y="-26" width="10" height="6" fill="#ff5a4a" stroke="none" />
      </g>
      {/* Palmeras a los lados. */}
      {[
        [22, 1],
        [378, -1],
      ].map(([x, dir]) => (
        <g key={x} className="tw-shore__palm" transform={`translate(${x} 112) scale(${dir} 1)`}>
          <path d="M0 0 Q4 -26 12 -48" stroke="#5a3a1e" strokeWidth="4" fill="none" strokeLinecap="round" />
          <g className="tw-shore__fronds">
            <path d="M12 -48 Q30 -54 40 -42 Q26 -48 12 -46 Z" />
            <path d="M12 -48 Q18 -66 6 -72 Q14 -60 11 -48 Z" />
            <path d="M12 -48 Q-4 -60 -14 -50 Q-2 -54 11 -47 Z" />
            <path d="M12 -48 Q30 -40 32 -26 Q24 -40 12 -46 Z" />
          </g>
          <circle cx="11" cy="-46" r="2.6" fill="#7a4a1a" />
        </g>
      ))}
    </svg>
  )
}

// La linterna del faro en la cima: la galería con su barandilla, la cabina de cristal con la luz y la cúpula roja. El
// haz que barre el cielo es aparte (.tw-beam), detrás.
export function Lantern() {
  return (
    <>
      <span className="tw-beam" aria-hidden="true">
        <i />
      </span>
      <svg className="tw-lantern" viewBox="0 0 160 64" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
        <defs>
          <radialGradient id="tw-lamp" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fffbe0" />
            <stop offset="0.45" stopColor="#ffe27a" />
            <stop offset="1" stopColor="#ffb547" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="tw-dome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff6a5a" />
            <stop offset="1" stopColor="#b8261c" />
          </linearGradient>
        </defs>
        {/* Cúpula con su veleta. */}
        <path d="M80 2 V8" stroke="#3a1a12" strokeWidth="1.6" />
        <circle cx="80" cy="9" r="2.4" fill="#3a1a12" />
        <path d="M58 24 Q58 10 80 10 Q102 10 102 24 Z" fill="url(#tw-dome)" stroke="#5a120c" strokeWidth="1.4" />
        <path d="M54 24 H106 V27 H54 Z" fill="#5a120c" />
        {/* Cabina de cristal con la lámpara. */}
        <rect x="60" y="27" width="40" height="21" fill="#1a3a52" />
        <circle className="tw-lantern__lamp" cx="80" cy="37" r="14" fill="url(#tw-lamp)" />
        <circle cx="80" cy="37" r="4.5" fill="#fffbe0" />
        <path d="M60 27 V48 M70 27 V48 M80 27 V48 M90 27 V48 M100 27 V48" stroke="#2a1a14" strokeWidth="1.6" />
        <path d="M63 29 L67 46" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.4" />
        {/* Galería con barandilla. */}
        <path d="M44 48 H116 V52 H44 Z" fill="#3a1a14" />
        <path d="M46 48 V40 H114 V48 M52 40 V48 M60 40 V48 M100 40 V48 M108 40 V48" stroke="#3a1a14" strokeWidth="1.4" fill="none" />
        <path d="M54 52 H106 L102 64 H58 Z" fill="#f4efe6" />
        <path d="M58 58 H102" stroke="#d8352a" strokeWidth="3" />
      </svg>
    </>
  )
}
