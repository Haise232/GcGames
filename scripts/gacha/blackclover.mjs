// Season 4: el gacha entero es de Black Clover. Cambia el nombre, el grupo y la imagen de cada carta del catálogo
// (api/_juegos/gacha-catalogo.json) sin tocar lo demás: cada carta conserva id, rareza, puesto y valor, así que sus
// dueños, precios y empeños siguen igual. Las imágenes salen de la wiki de Black Clover (Fandom): se enlazan, no se
// descargan, y la página del gacha cita la fuente.
// Se ejecuta a mano: node scripts/gacha/blackclover.mjs
// (anime.mjs e importar.mjs generan las temáticas anteriores.)
import { readFile, writeFile } from 'node:fs/promises'

const UA = 'GcGames-gacha/1.0 (https://github.com/Haise232/GcGames; proyecto sin fines comerciales)'

// Por puesto (rank 1 = la de más valor), en el orden del catálogo: [nombre en la carta, grupo, página de la wiki].
// 1 única, 10 legendarias, 27 épicas, 28 raras y 37 comunes.
const BLACK_CLOVER = [
  // Única
  ['Asta', 'Toros Negros', 'Asta'],
  // Legendarias
  ['Yuno', 'Amanecer Dorado', 'Yuno Grinberryall'],
  ['Yami Sukehiro', 'Toros Negros', 'Yami Sukehiro'],
  ['Julius Novachrono', 'Rey Mago', 'Julius Novachrono'],
  ['Lucifero', 'Demonio', 'Lucifero'],
  ['Noelle Silva', 'Toros Negros', 'Noelle Silva'],
  ['Liebe', 'Demonio', 'Liebe'],
  ['Lucius Zogratis', 'Reino de Picas', 'Lucius Zogratis'],
  ['Mereoleona Vermillion', 'Leones Carmesí', 'Mereoleona Vermillion'],
  ['Dante Zogratis', 'Triada Oscura', 'Dante Zogratis'],
  ['Licht', 'Elfos', 'Licht'],
  // Épicas
  ['Zagred', 'Demonio', 'Zagred'],
  ['Megicula', 'Demonio', 'Megicula'],
  ['Vanica Zogratis', 'Triada Oscura', 'Vanica Zogratis'],
  ['Zenon Zogratis', 'Triada Oscura', 'Zenon Zogratis'],
  ['Nozel Silva', 'Águilas Plateadas', 'Nozel Silva'],
  ['Fuegoleon Vermillion', 'Leones Carmesí', 'Fuegoleon Vermillion'],
  ['Luck Voltia', 'Toros Negros', 'Luck Voltia'],
  ['Secre Swallowtail', 'Toros Negros', 'Secre Swallowtail'],
  ['William Vangeance', 'Amanecer Dorado', 'William Vangeance'],
  ['Patolli', 'Elfos', 'Patolli'],
  ['Charlotte Roselei', 'Rosas Azules', 'Charlotte Roselei'],
  ['Mimosa Vermillion', 'Amanecer Dorado', 'Mimosa Vermillion'],
  ['Leopold Vermillion', 'Leones Carmesí', 'Leopold Vermillion'],
  ['Finral Roulacase', 'Toros Negros', 'Finral Roulacase'],
  ['Vanessa Enoteca', 'Toros Negros', 'Vanessa Enoteca'],
  ['Gauche Adlai', 'Toros Negros', 'Gauche Adlai'],
  ['Nacht Faust', 'Toros Negros', 'Nacht Faust'],
  ['Beelzebub', 'Demonio', 'Beelzebub'],
  ['Sylph', 'Espíritu del viento', 'Sylph'],
  ['Langris Vaude', 'Amanecer Dorado', 'Langris Vaude'],
  ['Fana', 'Ojo del Sol de Medianoche', 'Fana'],
  ['Vetto', 'Ojo del Sol de Medianoche', 'Vetto'],
  ['Charmy Pappitson', 'Toros Negros', 'Charmy Pappitson'],
  ['Zora Ideale', 'Toros Negros', 'Zora Ideale'],
  ['Morgen Faust', 'Ciervos Púrpura', 'Morgen Faust'],
  ['Rill Boismortier', 'Mantis Verdes', 'Rill Boismortier'],
  ['Jack el Destripador', 'Mantis Verdes', 'Jack the Ripper'],
  // Raras
  ['Dorothy Unsworth', 'Pavos Reales Coral', 'Dorothy Unsworth'],
  ['Kaiser Granvorka', 'Ciervos Púrpura', 'Kaiser Granvorka'],
  ['Fanzell Kruger', 'Reino del Diamante', 'Fanzell Kruger'],
  ['Gordon Agrippa', 'Toros Negros', 'Gordon Agrippa'],
  ['Grey', 'Toros Negros', 'Grey'],
  ['Henry Legolant', 'Toros Negros', 'Henry Legolant'],
  ['Klaus Lunettes', 'Amanecer Dorado', 'Klaus Lunettes'],
  ['Sol Marron', 'Rosas Azules', 'Sol Marron'],
  ['Solid Silva', 'Águilas Plateadas', 'Solid Silva'],
  ['Nebra Silva', 'Águilas Plateadas', 'Nebra Silva'],
  ['Rades Spirito', 'Ojo del Sol de Medianoche', 'Rades Spirito'],
  ['La Reina Bruja', 'Bosque de las Brujas', 'Witch Queen'],
  ['Lolopechka', 'Reino de Corazones', 'Lolopechka'],
  ['Gadjah', 'Reino de Corazones', 'Gadjah'],
  ['Mars', 'Reino del Diamante', 'Mars'],
  ['Rhya', 'Ojo del Sol de Medianoche', 'Rhya'],
  ['Valtos', 'Ojo del Sol de Medianoche', 'Valtos'],
  ['Sally', 'Ojo del Sol de Medianoche', 'Sally'],
  ['Damnatio Kira', 'Reino del Trébol', 'Damnatio Kira'],
  ['Marx Francois', 'Reino del Trébol', 'Marx Francois'],
  ['Lilith', 'Demonio', 'Lilith'],
  ['Nahamah', 'Demonio', 'Nahamah'],
  ['Salamander', 'Espíritu del fuego', 'Salamander'],
  ['Undine', 'Espíritu del agua', 'Undine'],
  ['Walgner', 'Demonio', 'Walgner'],
  ['Adramelech', 'Demonio', 'Adramelech'],
  ['Ichika Yami', 'Reino de Hino', 'Ichika Yami'],
  ['Lemiel Silvamillion Clover', 'Primer Rey Mago', 'Lumiere'],
  // Comunes
  ['Magna Swing', 'Toros Negros', 'Magna Swing'],
  ['Augustus Kira Clover XIII', 'Reino del Trébol', 'Augustus Kira Clover XIII'],
  ['Acier Silva', 'Reino del Trébol', 'Acier Silva'],
  ['Tetia', 'Elfos', 'Tetia'],
  ['Sor Lily', 'Iglesia de Hage', 'Sister Lily'],
  ['Padre Orsi', 'Iglesia de Hage', 'Father Orsi'],
  ['Recca', 'Iglesia de Hage', 'Rekka'],
  ['Rebecca Scarlet', 'Reino del Trébol', 'Rebecca Scarlet'],
  ['Kirsch Vermillion', 'Pavos Reales Coral', 'Kirsch Vermillion'],
  ['Heath Graice', 'Ojo del Sol de Medianoche', 'Heath Grice'],
  ['Alecdora Sandler', 'Amanecer Dorado', 'Alecdora Sandler'],
  ['Hamon Caseus', 'Amanecer Dorado', 'Hamon Caseus'],
  ['Gueldre Poizot', 'Toros Negros', 'Gueldre Poizot'],
  ['Fragil Tormenta', 'Reino del Trébol', 'Fragil Tormenta'],
  ['Ladros', 'Reino del Diamante', 'Ladros'],
  ['Catherine', 'Bosque de las Brujas', 'Catherine'],
  ['Mariella', 'Reino del Diamante', 'Mariella'],
  ['Dominante Code', 'Reino de Picas', 'Dominante Code'],
  ['Sekke Bronzazza', 'Toros Negros', 'Sekke Bronzazza'],
  ['Puli Angel', 'Ciervos Púrpura', 'Puli Angel'],
  ['Kahono', 'Reino del Trébol', 'Kahono'],
  ['Kiato', 'Reino del Trébol', 'Kiato'],
  ['Lotus Whomalt', 'Ojo del Sol de Medianoche', 'Lotus Whomalt'],
  ['Revchi Salik', 'Ciervos Púrpura', 'Revchi Salik'],
  ['Zara Ideale', 'Reino del Trébol', 'Zara Ideale'],
  ['Owen', 'Reino del Trébol', 'Owen'],
  ['Nils Ragus', 'Mantis Verdes', 'Nils Ragus'],
  ['Gimodelo', 'Reino de Picas', 'Gimodelo'],
  ['Drowa', 'Elfos', 'Drowa'],
  ['Yrul', 'Elfos', 'Yrul'],
  ['Theresa Rapual', 'Reino del Trébol', 'Sister Theresa'],
  ['Baro', 'Reino del Trébol', 'Baro'],
  ['Edward Avalaché', 'Reino del Trébol', 'Edward Avalaché'],
  ['Moris Libardirt', 'Reino de Picas', 'Moris Libardirt'],
  ['Lucifugus', 'Demonio', 'Lucifugus'],
  ['Leviathan', 'Demonio', 'Leviathan'],
  ['Marie Adlai', 'Reino del Trébol', 'Marie Adlai'],
]

// Las fusiones: [nombre, grupo, [nombres de las dos cartas], página de la wiki o «File:…» (una imagen suelta)]. Las tres
// primeras ya existían (su id no cambia); las demás son nuevas. Una carta puede formar parte de varias fusiones.
const FUSIONES = {
  'fusion:vergil-silla': ['Asta: Unión Demoníaca', 'Fusión', ['Asta', 'Liebe'], 'Unite'],
  'fusion:dimitrescu-crema': ['Yuno: Unión con el espíritu del viento', 'Fusión', ['Yuno', 'Sylph'], 'Spirit Dive'],
  'fusion:magna-dante': ['Magna God: el que derrotó a Dante', 'Fusión', ['Magna Swing', 'Dante Zogratis'], 'Magna Swing vs. Dante Zogratis'],
  'fusion:dante-100': ['Dante: Unión Demoníaca al 100 %', 'Fusión', ['Lucifero', 'Dante Zogratis'], 'File:Dante at 100%.png'],
  'fusion:vanica-megicula': ['Vanica: Unión con Megicula', 'Fusión', ['Megicula', 'Vanica Zogratis'], 'File:Vanica at 70%.png'],
  'fusion:zenon-beelzebub': ['Zenon: Unión con Beelzebub', 'Fusión', ['Beelzebub', 'Zenon Zogratis'], 'File:Zenon at 100%.png'],
  'fusion:nacht-walgner': ['Nacht: Unión con sus cuatro demonios', 'Fusión', ['Walgner', 'Nacht Faust'], 'File:Nacht in Gallus × Felis × Canis × Equus Mode.png'],
  'fusion:fuegoleon-salamander': ['Fuegoleon: el espíritu de Salamander', 'Fusión', ['Salamander', 'Fuegoleon Vermillion'], 'File:Fuegoleon emerges with Salamander.png'],
}
const FUSION_VALUE = 3000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Imagen principal de cada página de la wiki. Devuelve un Map título pedido → { title, img }.
async function pages(titles) {
  const found = new Map()
  for (let i = 0; i < titles.length; i += 45) {
    const group = titles.slice(i, i + 45)
    const url =
      'https://blackclover.fandom.com/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=400' +
      `&titles=${encodeURIComponent(group.join('|'))}`
    const body = await (await fetch(url, { headers: { 'user-agent': UA } })).json()
    const back = new Map()
    for (const n of [...(body.query.normalized ?? []), ...(body.query.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from)
    for (const p of Object.values(body.query.pages)) {
      if (p.missing !== undefined || !p.thumbnail) continue
      found.set(back.get(p.title) ?? p.title, { title: p.title, img: p.thumbnail.source })
    }
    await sleep(800)
  }
  return found
}

// URL (a 400 px de ancho) de imágenes sueltas de la wiki («File:…»).
async function files(titles) {
  const found = new Map()
  if (!titles.length) return found
  const url =
    'https://blackclover.fandom.com/api.php?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=400' +
    `&titles=${encodeURIComponent(titles.join('|'))}`
  const body = await (await fetch(url, { headers: { 'user-agent': UA } })).json()
  const back = new Map((body.query.normalized ?? []).map((n) => [n.to, n.from]))
  for (const p of Object.values(body.query.pages)) {
    const info = p.imageinfo?.[0]
    if (info) found.set(back.get(p.title) ?? p.title, { title: p.title, img: info.thumburl ?? info.url, page: info.descriptionurl })
  }
  return found
}

const file = new URL('../../api/_juegos/gacha-catalogo.json', import.meta.url)
const catalogo = JSON.parse(await readFile(file, 'utf8'))
const drawable = catalogo.cartas.filter((c) => !c.fusion).sort((a, b) => a.rank - b.rank)
if (drawable.length !== BLACK_CLOVER.length) throw new Error(`Hay ${drawable.length} cartas y ${BLACK_CLOVER.length} personajes`)
for (const rarity of ['unica', 'mitica', 'epica', 'rara', 'comun']) {
  console.log(rarity, drawable.filter((c) => c.rarity === rarity).length)
}

const isFile = (p) => p.startsWith('File:')
const sources = [...BLACK_CLOVER.map(([, , p]) => p), ...Object.values(FUSIONES).map(([, , , p]) => p)]
const found = await pages(sources.filter((p) => !isFile(p)))
const loose = await files(sources.filter(isFile))
const imageOf = (page, name) => {
  if (isFile(page)) {
    const hit = loose.get(page)
    if (!hit?.img) throw new Error(`Sin imagen: ${name} (${page})`)
    return { img: hit.img, src: hit.page }
  }
  const hit = found.get(page)
  if (!hit?.img) throw new Error(`Sin imagen: ${name} (${page})`)
  return { img: hit.img, src: `https://blackclover.fandom.com/wiki/${encodeURIComponent(hit.title.replaceAll(' ', '_'))}` }
}
const strip = ({ img: _img, src: _src, pos: _pos, pop: _pop, look: _look, quote: _quote, ...rest }) => rest
const cards = drawable.map((c, i) => {
  const [name, series, page] = BLACK_CLOVER[i]
  return { ...strip(c), name, series, ...imageOf(page, name), cat: 'blackclover' }
})
const idByName = new Map(cards.map((c) => [c.name, c.id]))
const known = new Map(catalogo.cartas.filter((c) => c.fusion).map((c) => [c.id, c]))
for (const id of known.keys()) if (!FUSIONES[id]) throw new Error(`Falta la fusión ${id}`)
const fusions = Object.entries(FUSIONES).map(([id, [name, series, parts, page]], i) => {
  const fusion = parts.map((n) => {
    const part = idByName.get(n)
    if (!part) throw new Error(`Fusión ${name}: no existe ${n}`)
    return part
  })
  const base = known.has(id) ? strip(known.get(id)) : { id, rarity: 'unica', value: FUSION_VALUE }
  return { ...base, name, series, ...imageOf(page, name), cat: 'fusion', fusion, rank: drawable.length + i + 1 }
})
const cartas = [...cards, ...fusions].sort((a, b) => a.rank - b.rank)
if (new Set(cartas.map((c) => c.img)).size !== cartas.length) console.log('Aviso: hay imágenes repetidas')
await writeFile(file, JSON.stringify({ generado: new Date().toISOString(), tema: 'black-clover', cartas }))
console.log(`${cartas.length} cartas de Black Clover (${fusions.length} fusiones)`)
