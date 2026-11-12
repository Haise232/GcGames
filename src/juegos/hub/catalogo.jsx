// Catálogo del selector: cada juego con su mini escena, su color (--tint, en r, g, b), de qué va en dos palabras (kind) y
// una frase (blurb, que sale al pasar el ratón y la leen los lectores de pantalla). El id es el de su pantalla en
// Juegos.jsx y el que usa la banca para ocultarlo (api/_juegos/banca.mjs).
import { AuctionScene, CrashScene, ElevatorScene, FrogScene, HeistScene, PlinkoScene, RaceScene, RouletteScene, TowerScene } from './HubArt.jsx'
import { PescaScene } from '../season4/PescaArt.jsx'
import { FishScene } from '../season4/FishArt.jsx'
import { HiloScene } from '../season4/FiestasArt.jsx'
import { LoteriaScene, TallerScene, TrineoScene } from '../season5/NavidadArt.jsx'
import { FeriaScene, SogaScene } from '../feria/FeriaArt.jsx'

const GAMES = [
  { id: 'feria', name: 'Feria de las Islas', kind: 'Hasta 10 jugadores', blurb: 'Una partida de tablero para diez: todos tiráis los dados a la vez, compráis puestos por las siete islas y os los disputáis al Tira y Afloja. El bote, para los tres primeros.', live: true, isNew: true, tint: '70, 224, 200', art: <FeriaScene /> },
  { id: 'soga', name: 'Tira y Afloja', kind: 'Cada 45 s', blurb: 'Rojo contra azul: elige equipo y pulsa sin parar. El equipo que más tira se reparte las entradas.', live: true, isNew: true, tint: '255, 122, 92', art: <SogaScene /> },
  { id: 'pesca', name: 'Campeonato de Pesca', kind: 'Cada 2 minutos', blurb: 'Todos pescáis en el mismo mar de La Restinga: lee las sombras, lanza por delante y aguanta la pelea. Los más pescadores se llevan el bote, y quien saque el marlín azul, el Bote del Marlín.', live: true, tint: '70, 224, 200', art: <PescaScene /> },
  { id: 'elevator', name: 'Ascensor', kind: 'Cada minuto', blurb: 'Todos suben a la vez y el premio crece en cada planta. Bájate antes de que se rompa el cable: el último en bajar se lleva el bonus.', live: true, tint: '255, 196, 80', art: <ElevatorScene /> },
  { id: 'auction', name: 'La Subasta', kind: 'Cada minuto', blurb: 'Siete cajas misteriosas, pujas a la vista y prórroga en los últimos segundos. Puede ser el jackpot… o una piedra.', live: true, tint: '177, 132, 255', art: <AuctionScene /> },
  { id: 'roulette', name: 'Ruleta', kind: 'Cada 25 s', blurb: 'Una tirada para todos cada 25 s. Apuesta y mira caer la bola.', live: true, tint: '226, 70, 60', art: <RouletteScene /> },
  { id: 'crash', name: 'Cohete', kind: 'Cada 30 s', blurb: 'Sube para todos cada 30 s. Retira a tiempo.', live: true, tint: '95, 170, 255', art: <CrashScene /> },
  { id: 'race', name: 'Carrera', kind: 'Cada 55 s', blurb: 'Una carrera cada 55 s. Apuesta a un coche y cobra si acaba en el podio.', live: true, tint: '255, 138, 60', art: <RaceScene /> },
  { id: 'taller', name: 'Taller de Papá Noel', kind: 'Idle tycoon', blurb: 'Fabrica juguetes, contrata encargados que trabajan solos y mejora el taller. Ganas galletas incluso sin estar y las canjeas por euros.', tint: '248, 197, 78', art: <TallerScene /> },
  { id: 'loteria', name: 'Lotería de Navidad', kind: 'Sorteo extraordinario', blurb: 'Compra un décimo con tu número y escucha cantar el sorteo: quintos, cuartos, tercero, segundo… y el Gordo, que paga ×400.', tint: '248, 197, 78', art: <LoteriaScene /> },
  { id: 'trineo', name: 'El Trineo de Papá Noel', kind: 'Reparte y cobra', blurb: 'Nochebuena: elige casita, bloque o rascacielos en cada parada. Cada regalo entregado sube el premio; si te pillan, lo pierdes.', tint: '224, 48, 60', art: <TrineoScene /> },
  { id: 'hilo', name: 'Mayor o Menor', kind: 'Baraja española', blurb: 'En la mesa del guachinche: ¿la siguiente carta será mayor o menor? Cada acierto sube el premio. Cobra antes de fallar.', tint: '232, 68, 58', art: <HiloScene /> },
  { id: 'fish', name: 'Pez Gordo', kind: 'Come y crece', blurb: 'Come plancton y peces más pequeños, hazte enorme y que no te coma un tiburón. Cuanto más pesas, más cobras al salir del agua.', tint: '46, 230, 208', art: <FishScene /> },
  { id: 'tower', name: 'La Torre', kind: 'Escalada', blurb: 'Sube piso a piso sin pisar una baldosa rota. Récord del día para el mejor golpe.', tint: '110, 123, 240', art: <TowerScene /> },
  { id: 'heist', name: 'El Atraco', kind: 'En banda', blurb: 'Monta tu banda con tus cartas del gacha y baja a la cámara acorazada. Huye antes de que os pillen.', tint: '255, 210, 94', art: <HeistScene /> },
  { id: 'plinko', name: 'Plinko', kind: 'Suerte', blurb: 'Suelta bolas y que caigan en las orillas.', tint: '176, 108, 255', art: <PlinkoScene /> },
  { id: 'frog', name: 'Rana', kind: 'Riesgo', blurb: 'Salta de nenúfar en nenúfar y cobra cuando quieras.', tint: '124, 207, 74', art: <FrogScene /> },
]

// Los de ronda común (todos a la vez, con la gente) y los de a tu ritmo, en el orden en que salen.
export const ROUND_GAMES = GAMES.filter((g) => g.live)
export const PACE_GAMES = GAMES.filter((g) => !g.live)

// Mesas en vivo (las lleva el servidor de mesas: se entra con join_public).
export const LIVE = {
  blackjack: { name: 'Blackjack', caption: 'Contra el crupier', seats: 7 },
  poker: { name: 'Póker', caption: 'Ciegas de 50 y 100 €', seats: 6 },
  chess: { name: 'Ajedrez', caption: 'Uno contra uno, con apuesta', seats: 2 },
}
