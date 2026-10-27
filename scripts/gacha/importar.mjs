// Genera el catálogo del gacha (api/_juegos/gacha-catalogo.json): personajes de juegos para adultos y, en las cartas
// más altas, mods famosos y graciosos. La lista y la rareza de cada una están a mano en PERSONAJES. La foto de un
// personaje es la imagen principal de su artículo en la Wikipedia inglesa (el arte oficial, que allí es imagen no libre)
// salvo que se fije a mano; la de un mod, una captura fijada a mano de la noticia o la página que lo cuenta.
// Se ejecuta a mano cuando se quiera renovar el catálogo (si una imagen cambia de sitio, su enlace se rompe y la carta
// enseña sus iniciales hasta volver a ejecutarlo):
//   node scripts/gacha/importar.mjs
// Las imágenes no se descargan: se enlazan (la página del gacha cita la fuente).
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const UA = 'TopCode-gacha/1.0 (https://github.com/Haise232/TopCode; proyecto de clase sin fines comerciales)'
const EN = 'https://upload.wikimedia.org/wikipedia/en'

// [id, nombre en la carta, serie, rareza, fuente, imagen fijada (opcional), encuadre (opcional)]. La fuente es el
// artículo de la Wikipedia inglesa o, si empieza por https://, la página del mod (entonces la imagen va fijada). El
// encuadre es la posición horizontal de la imagen en la carta («80%»: lo de la derecha) cuando lo importante no está en
// el centro. El orden dentro de cada rareza es el de fama: el primero vale más.
// El id es el de la carta que había antes en ese puesto: los poderes salen del id (gacha.mjs, powersFor) y las
// bibliotecas de los jugadores lo guardan, así que al cambiar de temática cada carta conserva dueño, rareza, valor y
// poderes y solo cambian el nombre y la foto. Una carta nueva puede llevar cualquier id que no exista.
const PERSONAJES = [
  ['meme:el-xokas', 'Macho Man dragón', 'Mod de Skyrim', 'unica', 'https://www.gamesradar.com/randy-dragon', 'https://www.neozone.org/blog/wp-content/uploads/2012/01/macho-man-skyrim.jpg'],
  ['meme:ibai-llanos', 'Vergil', 'Devil May Cry', 'mitica', 'Vergil (Devil May Cry)'],
  ['meme:zona-gemelos', "Mr. X Gon' Give It To Ya", 'Mod de Resident Evil 2', 'mitica', 'https://www.pcgamesn.com/resident-evil-2/resident-evil-2-mr-x-gon-give-it-to-ya-mod', 'https://www.pcgamesn.com/wp-content/sites/pcgamesn/2019/01/resident-evil-2-mr-x.jpg'],
  ['meme:el-dandy-de-barcelona', 'Shrek y Asno', 'Mod de Elden Ring', 'mitica', 'https://www.creativebloq.com/news/elden-ring-mods', 'https://cdn.mos.cms.futurecdn.net/DgDC66z4vyvH629Ng3fNv-1920-80.png'],
  ['meme:fernando-alonso', 'Machoclaw', 'Mod de Fallout 4', 'mitica', 'https://gameinformer.com/b/news/archive/2016/01/04/mod-gives-deathclaws-the-voice-and-likeness-of-39-macho-man-39-randy-savage-in-fallout-4', 'https://gameinformer.com/sites/default/files/styles/og_image/public/legacy-images/Mod%20Gives%20Fallout%204%20Deathclaws%20The%20Voice%20And%20Likeness%20Of%20%27Macho%20Man%27%20Randy%20Savage/MachoManClaw610.jpg.webp'],
  ['meme:torrente', 'One Punch Man cazador', 'Mod de Monster Hunter: World', 'mitica', 'https://www.pcgamer.com/uk/you-can-be-iron-man-or-one-punch-man-in-monster-hunter-world-now', 'https://cdn.mos.cms.futurecdn.net/GhJU4PADd9XjaGYrQgzKqA-1506-80.jpg', '80%'],
  ['meme:el-fary', 'El sombrero de Lady Dimitrescu', 'Mod de Resident Evil Village', 'mitica', 'https://www.pcgamer.com/resident-evil-village-mod-makes-lady-ds-big-honkin-hat-keep-getting-bigger', 'https://cdn.mos.cms.futurecdn.net/TgyuF7wRTScHiHpFvU5arQ-1545-80.jpg'],
  ['meme:pimpamlacasitos', 'Patches y Miyazaki, jefes finales', 'Mod de Elden Ring', 'mitica', 'https://automaton-media.com/en/news/elden-ring-mod-replaces-shadow-of-the-erdtrees-final-bosses-with-patches-and-hidetaka-miyazaki/', 'https://automaton-media.com/en/wp-content/uploads/2024/07/20240716-33984-headerJPG.jpg', '65%'],
  ['meme:antonio-recio', 'Nicolas Cage en Sekiro', 'Mod de Sekiro', 'epica', 'https://www.pcgamer.com/sekiro-mod-adds-nic-cage-death-screen', 'https://cdn.mos.cms.futurecdn.net/TvxqNX4AibzWiURzwEbxnC-1920-80.jpeg'],
  ['meme:el-risitas', 'Elden Ring arruinado por mods', 'Mod de Elden Ring', 'epica', 'https://www.ggrecon.com/articles/elden-ring-has-been-ruined-by-modding/', 'https://www.ggrecon.com/media/stpfrsub/elden-ring-mods.jpg'],
  ['meme:julio-iglesias', 'Dante', 'Devil May Cry', 'epica', 'Dante (Devil May Cry)'],
  ['meme:illojuan', 'Kratos', 'God of War', 'epica', 'Kratos (God of War)'],
  ['meme:auronplay', 'Geralt de Rivia', 'The Witcher', 'epica', 'Geralt of Rivia'],
  ['meme:el-rubius', 'Cazador legendario', 'Monster Hunter: World', 'epica', 'Monster Hunter: World'],
  ['meme:david-broncano', 'Arthur Morgan', 'Red Dead Redemption 2', 'epica', 'Arthur Morgan', 'https://upload.wikimedia.org/wikipedia/en/a/ac/Arthur_Morgan_-_Red_Dead_Redemption_2.png'],
  ['meme:josep-pedrerol', 'Master Chief', 'Halo', 'epica', 'Master Chief (Halo)'],
  ['meme:thegrefg', 'Solid Snake', 'Metal Gear', 'epica', 'Solid Snake'],
  ['meme:jordi-wild', 'Lara Croft', 'Tomb Raider', 'epica', 'Lara Croft'],
  ['meme:amador-rivas', 'Doom Slayer', 'Doom', 'epica', 'Doomguy'],
  ['meme:chiquito-de-la-calzada', 'Ezio Auditore', 'Assassin\'s Creed', 'epica', 'Ezio Auditore da Firenze'],
  ['meme:ecce-homo-de-borja', 'Joel', 'The Last of Us', 'epica', 'Joel Miller (The Last of Us)'],
  ['meme:paquita-salas', 'Ellie', 'The Last of Us', 'epica', 'Ellie (The Last of Us)'],
  ['meme:aitana', 'Leon S. Kennedy', 'Resident Evil', 'epica', 'Leon S. Kennedy', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Resident_Evil_4_Remake_-_Leon_S._Kennedy.jpg/500px-Resident_Evil_4_Remake_-_Leon_S._Kennedy.jpg'],
  ['meme:kiko-rivera', 'Nero', 'Devil May Cry', 'epica', 'Nero (Devil May Cry)'],
  ['meme:mente-fria', 'Bayonetta', 'Bayonetta', 'epica', 'Bayonetta (character)'],
  ['meme:simon', 'Marcus Fenix', 'Gears of War', 'epica', 'Marcus Fenix'],
  ['meme:cubarsi', 'Agente 47', 'Hitman', 'epica', 'Agent 47'],
  ['meme:jordi-enp', 'Comandante Shepard', 'Mass Effect', 'epica', 'Commander Shepard'],
  ['meme:cucurella', 'Malenia', 'Elden Ring', 'epica', 'Malenia, Blade of Miquella'],
  ['meme:el-paellas', 'Trevor Philips', 'GTA V', 'epica', 'Trevor Philips'],
  ['meme:mangel', 'Isaac Clarke', 'Dead Space', 'rara', 'Isaac Clarke'],
  ['meme:lolito-fernandez', 'Solaire de Astora', 'Dark Souls', 'rara', 'Solaire of Astora'],
  ['meme:alexby11', 'Jill Valentine', 'Resident Evil', 'rara', 'Jill Valentine', 'https://upload.wikimedia.org/wikipedia/en/3/34/JillValentineRemake.png'],
  ['meme:djmariio', 'Albert Wesker', 'Resident Evil', 'rara', 'Albert Wesker', 'https://upload.wikimedia.org/wikipedia/en/5/51/Albert_Wesker.png'],
  ['meme:cristinini', 'Raiden', 'Metal Gear', 'rara', 'Raiden (Metal Gear)'],
  ['meme:knekro', 'Gordon Freeman', 'Half-Life', 'rara', 'Gordon Freeman'],
  ['meme:perxitaa', 'Scorpion', 'Mortal Kombat', 'rara', 'Scorpion (Mortal Kombat)'],
  ['meme:dalas-review', 'Sub-Zero', 'Mortal Kombat', 'rara', 'Sub-Zero (Mortal Kombat)'],
  ['meme:wismichu', 'CJ', 'GTA: San Andreas', 'rara', 'Carl Johnson (Grand Theft Auto)'],
  ['meme:mikecrack', 'Niko Bellic', 'GTA IV', 'rara', 'Niko Bellic'],
  ['meme:willyrex', 'Max Payne', 'Max Payne', 'rara', 'Max Payne (character)'],
  ['meme:vegetta777', 'John Marston', 'Red Dead Redemption', 'rara', 'John Marston'],
  ['meme:gerard-pique', 'Ada Wong', 'Resident Evil', 'rara', 'Ada Wong'],
  ['meme:luis-rubiales', 'Chris Redfield', 'Resident Evil', 'rara', 'Chris Redfield'],
  ['meme:omar-montes', 'Lady Dimitrescu', 'Resident Evil Village', 'rara', 'Lady Dimitrescu'],
  ['meme:quevedo', 'Pyramid Head', 'Silent Hill', 'rara', 'Pyramid Head'],
  ['meme:frank-cuesta', 'Némesis', 'Resident Evil', 'rara', 'Nemesis (Resident Evil)'],
  ['meme:isabel-pantoja', 'Liu Kang', 'Mortal Kombat', 'rara', 'Liu Kang'],
  ['meme:leticia-sabater', 'Vaas Montenegro', 'Far Cry 3', 'rara', 'Vaas Montenegro'],
  ['meme:jordi-hurtado', 'B.J. Blazkowicz', 'Wolfenstein', 'rara', 'B. J. Blazkowicz'],
  ['meme:iker-jimenez', 'Abby', 'The Last of Us Parte II', 'rara', 'Abby (The Last of Us)'],
  ['meme:alberto-chicote', 'Revolver Ocelot', 'Metal Gear', 'rara', 'Revolver Ocelot'],
  ['meme:mauricio-colmenero', 'Ranni la Bruja', 'Elden Ring', 'rara', 'Ranni the Witch'],
  ['meme:ignatius-farray', 'Radahn', 'Elden Ring', 'rara', 'Starscourge Radahn'],
  ['meme:juan-cuesta', 'Kazuma Kiryu', 'Yakuza', 'rara', 'Kazuma Kiryu'],
  ['meme:plex', 'Silla de plástico', 'Devil May Cry 5', 'comun', 'Monobloc (chair)'],
  ['meme:carreraaa', 'Mr. X', 'Resident Evil 2', 'comun', 'Mr. X (Resident Evil)'],
  ['meme:gerard-romero', 'Raiden', 'Mortal Kombat', 'comun', 'Raiden (Mortal Kombat)'],
  ['meme:nil-ojeda', 'Big Daddy', 'BioShock', 'comun', 'Big Daddy (BioShock)'],
  ['meme:zorman', 'Psycho Mantis', 'Metal Gear Solid', 'comun', 'Psycho Mantis'],
  ['meme:byviruzz', 'Edward Kenway', 'Assassin\'s Creed IV', 'comun', 'Edward Kenway'],
  ['meme:outconsumer', 'Bayek', 'Assassin\'s Creed Origins', 'comun', 'Bayek of Siwa'],
  ['meme:spursito', 'Alucard', 'Castlevania', 'comun', 'Alucard (Castlevania)'],
  ['meme:kidd-keo', 'Ryu Hayabusa', 'Ninja Gaiden', 'comun', 'Ryu Hayabusa'],
  ['meme:c-tangana', 'Kain', 'Legacy of Kain', 'comun', 'Kain (Legacy of Kain)'],
  ['meme:chanel', 'Rathalos', 'Monster Hunter', 'comun', 'Rathalos'],
  ['meme:bad-gyal', 'Felyne', 'Monster Hunter', 'comun', 'Felyne'],
  ['meme:grison', 'Andrew Ryan', 'BioShock', 'comun', 'Andrew Ryan (BioShock)'],
  ['meme:jorge-ponce', 'Vault Boy', 'Fallout', 'comun', 'Vault Boy'],
  ['meme:pablo-motos', 'Claptrap', 'Borderlands', 'comun', 'Claptrap'],
  ['meme:tamara-falco', 'Rebecca Chambers', 'Resident Evil', 'comun', 'Rebecca Chambers'],
  ['meme:tomas-roncero', 'Barry Burton', 'Resident Evil', 'comun', 'Barry Burton'],
  ['meme:joaquin-sanchez', 'Mileena', 'Mortal Kombat', 'comun', 'Mileena'],
  ['meme:sergio-ramos', 'Kitana', 'Mortal Kombat', 'comun', 'Kitana'],
  ['meme:roberto-brasero', 'Johnny Cage', 'Mortal Kombat', 'comun', 'Johnny Cage'],
  ['meme:matias-prats', 'Sonya Blade', 'Mortal Kombat', 'comun', 'Sonya Blade'],
  ['meme:joaquin-reyes', 'Shao Kahn', 'Mortal Kombat', 'comun', 'Shao Kahn'],
  ['meme:ernesto-sevilla', 'Kano', 'Mortal Kombat', 'comun', 'Kano (Mortal Kombat)'],
  ['meme:carlos-areces', 'Corvo Attano', 'Dishonored', 'comun', 'Corvo Attano'],
  ['meme:raul-cimas', 'Aiden Pearce', 'Watch Dogs', 'comun', 'Aiden Pearce'],
  ['meme:miguel-noguera', 'Alan Wake', 'Alan Wake', 'comun', 'Alan Wake (character)'],
  ['meme:berto-romero', 'Simon Belmont', 'Castlevania', 'comun', 'Simon Belmont'],
  ['meme:karlos-arguinano', 'Spawn', 'Mortal Kombat 11', 'comun', 'Spawn (character)'],
  ['meme:ana-obregon', 'Jason Voorhees', 'Friday the 13th', 'comun', 'Jason Voorhees'],
  ['meme:emilio-delgado', 'Joker', 'Persona 5', 'comun', 'Joker (Persona)'],
  ['meme:coque', 'Sephiroth', 'Final Fantasy VII', 'comun', 'Sephiroth (Final Fantasy)'],
  ['meme:machupichu', 'Cortana', 'Halo', 'comun', 'Cortana (Halo)'],
  ['meme:manolo-el-del-bombo', 'El Inquisidor', 'Halo', 'comun', 'Arbiter (Halo)'],
  ['meme:rodolfo-chikilicuatre', 'Garrus', 'Mass Effect', 'comun', 'Garrus'],
  ['meme:ramon-garcia', 'Liara', 'Mass Effect', 'comun', 'Liara T\'Soni'],
  ['meme:antonio-lobato', 'Crema solar', 'Resident Evil Village', 'comun', 'Sunscreen', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d0/Sunbum_sunscreen_spf_30.jpg/500px-Sunbum_sunscreen_spf_30.jpg'],
]

// Cartas de fusión: no salen en la mesa ni en las tiradas. Quien junta las dos cartas de «de» las pierde (vuelven a
// quedar libres) y se lleva esta. [id, nombre, serie, [ids de las dos cartas], página, imagen, valor, encuadre].
const FUSIONES = [
  [
    'fusion:vergil-silla',
    'Vergil en la silla de plástico',
    'Mod de Devil May Cry 5',
    ['meme:ibai-llanos', 'meme:plex'],
    'https://knowyourmeme.com/memes/vergils-chair',
    'https://i.kym-cdn.com/entries/icons/original/000/042/547/vergil_chair.jpg',
    3000,
  ],
  [
    'fusion:dimitrescu-crema',
    'Lady Dimitrescu en bikini',
    'Mod de Resident Evil Village',
    ['meme:omar-montes', 'meme:antonio-lobato'],
    'https://www.youtube.com/watch?v=4m6aQNsOuvs',
    'https://i.ytimg.com/vi/4m6aQNsOuvs/maxresdefault.jpg',
    3000,
    '20%',
  ],
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const here = (path) => new URL(path, import.meta.url)

// Wikimedia limita las peticiones por minuto: ante un 429 se espera lo que digan (Retry-After) y se repite.
async function json(url, init = {}, tries = 8) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers ?? {}) } })
    if (res.ok) return res.json()
    if (i >= tries) throw new Error(`${res.status} ${url.slice(0, 120)}`)
    const wait = Number(res.headers.get('retry-after')) || 5 * i
    process.stdout.write(`\n(${res.status}, espero ${wait} s)\n`)
    await sleep(wait * 1000)
  }
}

// Cada fuente se guarda en scripts/gacha/.cache: si algo falla a medias, volver a ejecutar no repite lo ya descargado.
async function cached(name, fn) {
  const file = here(`./.cache/${name}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    const data = await fn()
    await mkdir(here('./.cache/'), { recursive: true })
    await writeFile(file, JSON.stringify(data))
    return data
  }
}

const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n))

// Imagen principal (también las no libres) y número de idiomas de cada artículo de la Wikipedia inglesa. Devuelve un
// Map título pedido → { title, img, langs }.
async function pages(titles) {
  const found = new Map()
  for (const group of chunks(titles, 40)) {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages|langlinks&lllimit=500' +
      `&piprop=thumbnail&pithumbsize=400&pilicense=any&titles=${encodeURIComponent(group.join('|'))}`
    const body = await json(url)
    const back = new Map()
    for (const n of [...(body.query.normalized ?? []), ...(body.query.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from)
    for (const p of Object.values(body.query.pages)) {
      if (p.missing !== undefined) continue
      found.set(back.get(p.title) ?? p.title, {
        title: p.title,
        img: p.thumbnail?.source?.replace(/\?.*$/, '') ?? null,
        langs: (p.langlinks?.length ?? 0) + 1,
      })
    }
    await sleep(1000)
  }
  return found
}

async function personajes() {
  const isPage = (source) => source.startsWith('https://')
  const en = await pages(PERSONAJES.filter(([, , , , source]) => !isPage(source)).map(([, , , , source]) => source))
  const out = []
  for (const [id, name, series, rarity, source, fixed, pos] of PERSONAJES) {
    if (isPage(source)) {
      out.push({ id, name, series, rarity, img: fixed, pop: 0, src: source, ...(pos && { pos }) })
      continue
    }
    const page = en.get(source)
    if (!page) {
      console.log(`sin artículo: ${source}`)
      continue
    }
    const img = fixed ?? page.img
    if (!img) {
      console.log(`sin imagen: ${name}`)
      continue
    }
    const src = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`
    out.push({ id, name, series, rarity, img, pop: page.langs, src })
  }
  console.log(`personajes: ${out.length} de ${PERSONAJES.length}`)
  return out
}

// Valor base de cada rareza. Dentro de su rareza, el primero de la lista vale un 60 % más que el último.
const BASE = { unica: 2500, mitica: 600, epica: 200, rara: 80, comun: 30 }
const ORDER = ['unica', 'mitica', 'epica', 'rara', 'comun']

function rank(cat, list) {
  const out = []
  for (const rarity of ORDER) {
    const group = list.filter((c) => c.rarity === rarity)
    group.forEach((c, i) => {
      const pct = (i + 1) / group.length
      out.push({ ...c, cat, rank: out.length + 1, value: Math.round(BASE[rarity] * (1.6 - pct * 0.6)) })
    })
  }
  return out
}

const cartas = rank('videojuego', await cached('personajes', personajes))
const ids = new Set(cartas.map((c) => c.id))
const fusiones = FUSIONES.map(([id, name, series, from, src, img, value, pos], i) => {
  for (const part of from) if (!ids.has(part)) throw new Error(`fusión ${id}: no existe ${part}`)
  return { id, name, series, rarity: 'unica', img, pop: 0, src, cat: 'fusion', rank: cartas.length + i + 1, value, fusion: from, ...(pos && { pos }) }
})
const catalogo = [...cartas, ...fusiones]
const resumen = {}
for (const c of catalogo) resumen[c.rarity] = (resumen[c.rarity] ?? 0) + 1
console.log(resumen)
await writeFile(here('../../api/_juegos/gacha-catalogo.json'), JSON.stringify({ generado: new Date().toISOString(), cartas: catalogo }))
console.log(`api/_juegos/gacha-catalogo.json: ${catalogo.length} cartas`)
