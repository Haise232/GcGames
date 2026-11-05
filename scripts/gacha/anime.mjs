// Season 4: el gacha pasa a personajes de anime. Cambia el nombre, la serie y la imagen de cada carta del catálogo
// (api/_juegos/gacha-catalogo.json) sin tocar lo demás: cada carta conserva id, rareza, puesto, valor y fusión, así que
// sus dueños, poderes y precios siguen igual. La imagen es la principal del artículo del personaje en la Wikipedia
// inglesa (el arte oficial; se enlaza, no se descarga, y la página del gacha cita la fuente).
// Se ejecuta a mano: node scripts/gacha/anime.mjs
// (importar.mjs genera la temática anterior, de videojuegos.)
import { readFile, writeFile } from 'node:fs/promises'

const UA = 'GcGames-gacha/1.0 (https://github.com/Haise232/GcGames; proyecto sin fines comerciales)'

// Por puesto (rank 1 = la de más valor), en el orden del catálogo: [nombre en la carta, serie, artículo de la Wikipedia
// inglesa]. 1 única, 7 míticas, 22 épicas, 25 raras y 36 comunes. Los puestos 2 + 56 y 45 + 91 forman las fusiones.
const ANIME = [
  // Única
  ['Son Goku', 'Dragon Ball', 'Goku'],
  // Míticas
  ['Monkey D. Luffy', 'One Piece', 'Monkey D. Luffy'],
  ['Naruto Uzumaki', 'Naruto', 'Naruto Uzumaki'],
  ['Satoru Gojo', 'Jujutsu Kaisen', 'Satoru Gojo'],
  ['Vegeta', 'Dragon Ball', 'Vegeta'],
  ['Light Yagami', 'Death Note', 'Light Yagami'],
  ['Saitama', 'One-Punch Man', 'Saitama (One-Punch Man)'],
  ['Tanjiro Kamado', 'Kimetsu no Yaiba', 'Tanjiro Kamado'],
  // Épicas
  ['Mikasa Ackerman', 'Ataque a los titanes', 'Mikasa Ackerman'],
  ['Nezuko Kamado', 'Kimetsu no Yaiba', 'Nezuko Kamado'],
  ['Sasuke Uchiha', 'Naruto', 'Sasuke Uchiha'],
  ['Kakashi Hatake', 'Naruto', 'Kakashi Hatake'],
  ['Itachi Uchiha', 'Naruto', 'Itachi Uchiha'],
  ['Roronoa Zoro', 'One Piece', 'Roronoa Zoro'],
  ['Edward Elric', 'Fullmetal Alchemist', 'Edward Elric'],
  ['Ichigo Kurosaki', 'Bleach', 'Ichigo Kurosaki'],
  ['Spike Spiegel', 'Cowboy Bebop', 'Spike Spiegel'],
  ['Lelouch Lamperouge', 'Code Geass', 'Lelouch Lamperouge'],
  ['L', 'Death Note', 'L (Death Note)'],
  ['Gon Freecss', 'Hunter × Hunter', 'Gon Freecss'],
  ['Killua Zoldyck', 'Hunter × Hunter', 'Killua Zoldyck'],
  ['Yuji Itadori', 'Jujutsu Kaisen', 'Yuji Itadori'],
  ['Ryomen Sukuna', 'Jujutsu Kaisen', 'Ryomen Sukuna'],
  ['Denji', 'Chainsaw Man', 'Denji (Chainsaw Man)'],
  ['Makima', 'Chainsaw Man', 'Makima'],
  ['Anya Forger', 'Spy × Family', 'Anya Forger'],
  ['Sailor Moon', 'Sailor Moon', 'Sailor Moon (character)'],
  ['Guts', 'Berserk', 'Guts (Berserk)'],
  ['Dio Brando', 'JoJo’s Bizarre Adventure', 'Dio Brando'],
  ['Freezer', 'Dragon Ball', 'Frieza'],
  // Raras
  ['Power', 'Chainsaw Man', 'Power (Chainsaw Man)'],
  ['Hinata Hyuga', 'Naruto', 'Hinata Hyuga'],
  ['Sakura Haruno', 'Naruto', 'Sakura Haruno'],
  ['Gaara', 'Naruto', 'Gaara'],
  ['Piccolo', 'Dragon Ball', 'Piccolo (Dragon Ball)'],
  ['Gohan', 'Dragon Ball', 'Gohan'],
  ['Nami', 'One Piece', 'Nami (One Piece)'],
  ['Sanji', 'One Piece', 'Sanji (One Piece)'],
  ['Shoto Todoroki', 'My Hero Academia', 'Shoto Todoroki'],
  ['Asuka Langley Soryu', 'Neon Genesis Evangelion', 'Asuka Langley Soryu'],
  ['Rei Ayanami', 'Neon Genesis Evangelion', 'Rei Ayanami'],
  ['Shinji Ikari', 'Neon Genesis Evangelion', 'Shinji Ikari'],
  ['Alphonse Elric', 'Fullmetal Alchemist', 'Alphonse Elric'],
  ['Roy Mustang', 'Fullmetal Alchemist', 'Roy Mustang'],
  ['Pikachu', 'Pokémon', 'Pikachu'],
  ['Ryuk', 'Death Note', 'Ryuk (Death Note)'],
  ['Kenshin Himura', 'Rurouni Kenshin', 'Himura Kenshin'],
  ['Inuyasha', 'Inuyasha', 'Inuyasha (character)'],
  ['Jotaro Kujo', 'JoJo’s Bizarre Adventure', 'Jotaro Kujo'],
  ['Trunks', 'Dragon Ball', 'Trunks (Dragon Ball)'],
  ['Rem', 'Re:Zero', 'Rem (Re:Zero)'],
  ['Zero Two', 'Darling in the Franxx', 'Zero Two'],
  ['Jonathan Joestar', 'JoJo’s Bizarre Adventure', 'Jonathan Joestar'],
  ['Giorno Giovanna', 'JoJo’s Bizarre Adventure', 'Giorno Giovanna'],
  ['Vash the Stampede', 'Trigun', 'Vash the Stampede'],
  // Comunes
  ['Usopp', 'One Piece', 'Usopp'],
  ['Tony Tony Chopper', 'One Piece', 'Tony Tony Chopper'],
  ['Nico Robin', 'One Piece', 'Nico Robin'],
  ['Rock Lee', 'Naruto', 'Rock Lee'],
  ['Shikamaru Nara', 'Naruto', 'Shikamaru Nara'],
  ['Jiraiya', 'Naruto', 'Jiraiya (Naruto)'],
  ['Krilin', 'Dragon Ball', 'Krillin'],
  ['Bulma', 'Dragon Ball', 'Bulma'],
  ['Maestro Roshi', 'Dragon Ball', 'Master Roshi'],
  ['Majin Buu', 'Dragon Ball', 'Majin Buu'],
  ['Cell', 'Dragon Ball', 'Cell (Dragon Ball)'],
  ['Broly', 'Dragon Ball', 'Broly'],
  ['Bills', 'Dragon Ball', 'Beerus'],
  ['Doraemon', 'Doraemon', 'Doraemon (character)'],
  ['Astro Boy', 'Astro Boy', 'Astro Boy (character)'],
  ['Lupin III', 'Lupin III', 'Lupin III (character)'],
  ['Shin-chan', 'Shin-chan', 'Shin-chan'],
  ['Natsu Dragneel', 'Fairy Tail', 'Natsu Dragneel'],
  ['Lucy Heartfilia', 'Fairy Tail', 'Lucy Heartfilia'],
  ['Yugi Muto', 'Yu-Gi-Oh!', 'Yugi Mutou'],
  ['Seto Kaiba', 'Yu-Gi-Oh!', 'Seto Kaiba'],
  ['Rukia Kuchiki', 'Bleach', 'Rukia Kuchiki'],
  ['Mob', 'Mob Psycho 100', 'Shigeo Kageyama'],
  ['Violet Evergarden', 'Violet Evergarden', 'Violet Evergarden'],
  ['Haruhi Suzumiya', 'La melancolía de Haruhi Suzumiya', 'Haruhi Suzumiya (character)'],
  ['Misty', 'Pokémon', 'Misty (Pokémon)'],
  ['Brock', 'Pokémon', 'Brock (Pokémon)'],
  ['Gintoki Sakata', 'Gintama', 'Gintoki Sakata'],
  ['Yusuke Urameshi', 'Yu Yu Hakusho', 'Yusuke Urameshi'],
  ['Kamina', 'Gurren Lagann', 'Kamina'],
  ['Megumi Fushiguro', 'Jujutsu Kaisen', 'Megumi Fushiguro'],
  ['Nobara Kugisaki', 'Jujutsu Kaisen', 'Nobara Kugisaki'],
  ['Loid Forger', 'Spy × Family', 'Loid Forger'],
  ['Yor Forger', 'Spy × Family', 'Yor Forger'],
  ['Marin Kitagawa', 'My Dress-Up Darling', 'Marin Kitagawa'],
  ['Ash Ketchum', 'Pokémon', 'Ash Ketchum'],
]

// Las dos fusiones, por id (no cambian): [nombre, serie, artículo].
const FUSIONES = {
  'fusion:vergil-silla': ['Los Sombrero de Paja', 'One Piece', 'Straw Hats'],
  'fusion:dimitrescu-crema': ['Ash y Pikachu', 'Pokémon', 'Pokémon the Movie: I Choose You!'],
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Imagen principal (también las no libres) de cada artículo. Devuelve un Map título pedido → { title, img }.
async function pages(titles) {
  const found = new Map()
  for (let i = 0; i < titles.length; i += 40) {
    const group = titles.slice(i, i + 40)
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages' +
      `&piprop=thumbnail&pithumbsize=400&pilicense=any&titles=${encodeURIComponent(group.join('|'))}`
    const body = await (await fetch(url, { headers: { 'user-agent': UA } })).json()
    const back = new Map()
    for (const n of [...(body.query.normalized ?? []), ...(body.query.redirects ?? [])]) back.set(n.to, back.get(n.from) ?? n.from)
    for (const p of Object.values(body.query.pages)) {
      if (p.missing !== undefined) continue
      found.set(back.get(p.title) ?? p.title, { title: p.title, img: p.thumbnail?.source?.replace(/\?.*$/, '') ?? null })
    }
    await sleep(1000)
  }
  return found
}

const file = new URL('../../api/_juegos/gacha-catalogo.json', import.meta.url)
const catalogo = JSON.parse(await readFile(file, 'utf8'))
const drawable = catalogo.cartas.filter((c) => !c.fusion).sort((a, b) => a.rank - b.rank)
if (drawable.length !== ANIME.length) throw new Error(`Hay ${drawable.length} cartas y ${ANIME.length} personajes`)

const found = await pages([...ANIME.map(([, , a]) => a), ...Object.values(FUSIONES).map(([, , a]) => a)])
const apply = (c, [name, series, article]) => {
  const page = found.get(article)
  if (!page?.img) throw new Error(`Sin imagen: ${name} (${article})`)
  const { img: _img, src: _src, pos: _pos, pop: _pop, look: _look, quote: _quote, ...rest } = c
  return { ...rest, name, series, img: page.img, src: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}`, cat: c.fusion ? 'fusion' : 'anime' }
}
const byId = new Map(drawable.map((c, i) => [c.id, apply(c, ANIME[i])]))
for (const c of catalogo.cartas.filter((c) => c.fusion)) {
  if (!FUSIONES[c.id]) throw new Error(`Falta la fusión ${c.id}`)
  byId.set(c.id, apply(c, FUSIONES[c.id]))
}
const cartas = catalogo.cartas.map((c) => byId.get(c.id))
await writeFile(file, JSON.stringify({ generado: new Date().toISOString(), tema: 'anime', cartas }))
console.log(`${cartas.length} cartas de anime`)
