// Season 5 · Navidad: de qué color pasa a ser cada color de la Season 4 (Islas). Es una función pura y la usan
// scripts/season5-tinte.mjs (genera s5-tinte.css a partir de las hojas de la S4) y las escenas en <canvas>.
//
// La isla al atardecer era coral, rosa, mango, sol, laguna, palmera y cielo violeta. En Navidad queda en rojo, oro,
// verde pino, hielo y noche azul:
//   - rojos, corales y rosas → rojo Navidad
//   - naranjas → cobre; mangos y amarillos → oro (los muy claros, crema)
//   - verdes y lagunas → verde pino (los claros, verde menta apagado)
//   - azules y cianes claros → hielo; los oscuros → pino de noche o azul noche
//   - violetas → azul noche
// Los grises, blancos y negros (poca saturación) no cambian, y la transparencia se respeta.

function hexToRgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  const n = (i) => parseInt(h.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : null }
}

function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [r, g, b].map((v) => Math.round((v + m) * 255))
}

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

// [h, s, l] de la isla → [h, s, l] de Navidad.
export function navidadHsl(h, s, l) {
  if (s < 0.12) return [h, s, l] // grises, blancos y negros
  if (h >= 290 || h < 22) {
    // rojos, corales, rosas y magentas: rojo Navidad (algo más hondo)
    return [h >= 290 && h < 335 ? 352 : 356, clamp(s, 0.55, 0.72), l > 0.35 ? clamp(l * 0.8, 0.3, 0.8) : l * 0.95]
  }
  if (h < 36) return [28, clamp(s * 0.85), clamp(l * 0.95)] // naranjas: cobre (distinto del oro)
  if (h < 55) return [42, clamp(s * 0.92), l] // mangos: oro
  if (h < 75) return [47, clamp(s * 0.82), clamp(l * 1.02)] // amarillos: oro claro
  if (h < 185) {
    // verdes, palmeras y lagunas: verde pino (los muy claros, menta apagada)
    if (l > 0.72) return [150, clamp(s * 0.4), l]
    return [150, clamp(s * 0.72), clamp(l * 0.86)]
  }
  if (h < 255) {
    // azules y cianes: el mar oscuro pasa a pino de noche; el cielo de noche, a azul noche; lo claro, a hielo
    if (l < 0.4 && h < 205) return [162, clamp(s * 0.62), l]
    if (l < 0.4) return [218, clamp(s * 0.75), l]
    return [204, clamp(s * 0.5), clamp(l * 1.03)]
  }
  return [224, clamp(s * 0.6), clamp(l * 0.92)] // violetas: azul noche
}

const hex2 = (v) => v.toString(16).padStart(2, '0')

// '#ff6b5a' | '#f6a' | '#ff6b5a80' → el mismo formato con el color de Navidad.
export function navidadHex(hex) {
  const { r, g, b, a } = hexToRgb(hex)
  const [nr, ng, nb] = hslToRgb(...navidadHsl(...rgbToHsl(r, g, b)))
  return `#${hex2(nr)}${hex2(ng)}${hex2(nb)}${a === null ? '' : hex2(Math.round(a * 255))}`
}

// [r, g, b] → [r, g, b].
export function navidadRgb([r, g, b]) {
  return hslToRgb(...navidadHsl(...rgbToHsl(r, g, b)))
}

// Cielos (degradados de las escenas): el atardecer pasa a noche de invierno, azul noche arriba y un azul hielo
// apagado en el horizonte. Conserva el orden de claridad de cada parada para que el degradado siga teniendo forma.
export function nocheHex(hex) {
  const { r, g, b, a } = hexToRgb(hex)
  const [, , l] = rgbToHsl(r, g, b)
  const [nr, ng, nb] = hslToRgb(220, 0.5, 0.1 + l * 0.38)
  return `#${hex2(nr)}${hex2(ng)}${hex2(nb)}${a === null ? '' : hex2(Math.round(a * 255))}`
}

// Cambia todos los colores de un texto de CSS: #hex, rgb()/rgba() (con comas o espacios) y %23hex (dentro de url()).
export function navidadCss(text) {
  return text
    .replace(/%23([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (_, h) => '%23' + navidadHex('#' + h).slice(1))
    .replace(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g, (m) => navidadHex(m))
    .replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)/g, (_, r, g, b, a) => {
      const [nr, ng, nb] = navidadRgb([+r, +g, +b])
      return a === undefined ? `rgb(${nr}, ${ng}, ${nb})` : `rgba(${nr}, ${ng}, ${nb}, ${a})`
    })
}
