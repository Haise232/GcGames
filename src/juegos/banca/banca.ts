// La banca de Juegos (api/_juegos/banca.mjs): avisos de dinero y mensajes del master, y el Admin Abuse.
import { supabase } from '../../lib/supabase'

export type AbuseMode = 'x2' | 'x3' | 'gratis'
export type AbuseScope = 'todo' | 'poker'

export interface Abuse {
  modo: AbuseMode
  ambito: AbuseScope
  desde: number
  hasta: number
}

// Hacienda (api/_juegos/hacienda.mjs): qué cobró y por qué.
export type HaciendaKind = 'tramo' | 'auto' | 'pillado' | 'escapado' | 'sobornado' | 'cazado' | 'inspeccion' | 'redada'
export interface HaciendaDatos {
  kind: HaciendaKind
  rate: number // % del saldo
  tramo?: number // 1 = 100.000 €
  base?: number // saldo sobre el que se calculó
  amount?: number // lo que pedía la declaración (pillado paga el doble)
  fraude?: boolean // inspección a quien se libró declarando de menos
  floor?: number // redada: desde qué saldo
  bribe?: number // soborno: lo que había en el sobre
  carcel?: number | null // soborno que salió mal: preso hasta entonces
}

// La declaración pendiente: se paga el rate % (amount) o se declara de menos, antes de «hasta».
export interface Declaracion {
  tramo: number
  rate: number
  base: number
  amount: number
  bribe: number // el sobre para sobornar al inspector
  hasta: number
}

export interface Aviso {
  id: number
  tipo: 'dinero' | 'mensaje' | 'hacienda' | 'hacienda_todos'
  importe: number | null
  texto: string | null // hacienda_todos: a quién se cobró (o cuántos en una redada)
  datos: HaciendaDatos | null
  todos: boolean
}

export interface Jugador {
  id: string
  name: string
  avatar: string | null
  balance: number | null
}

export interface Movimiento {
  id: number
  tipo: 'dinero' | 'mensaje' | 'hacienda_todos'
  importe: number | null
  texto: string | null
  at: number
  para: string | null // null: para todos
}

// El bote del bingo: si ahora se lo puede llevar alguien (lo decide la banca) y hasta cuándo.
export interface Bote {
  abierto: boolean
  hasta: number | null // null: sin límite (o cerrado)
  una: boolean // se cierra en cuanto alguien se lo lleve
  pot: number
  botes: { round: number; bingo: string[]; jackpot: number; golden: boolean }[]
  ahora: number
}

// Lo que se anuncia a todos mientras el bote está abierto (null: cerrado).
export interface BoteAbierto {
  desde: number
  hasta: number | null // null: sin límite
  una: boolean
  pot: number
}

export interface BancaReply {
  banca?: {
    avisos?: Aviso[]
    abuso?: Abuse | null
    boteAbierto?: BoteAbierto | null
    master?: boolean
    ahora?: number
    gente?: Jugador[]
    historial?: Movimiento[]
    hecho?: 'dinero' | 'mensaje'
    personas?: number
    bote?: Bote
    hacienda?: Declaracion | null
    carcel?: number | null // preso (soborno que salió mal) hasta entonces
    declaracion?: HaciendaDatos & { paid: number; balance: number }
    redada?: { personas: number; total: number }
    pendientes?: Pendiente[]
    usuarios?: UsuarioAdmin[]
    temporal?: string
    para?: string
    ocultos?: string[]
  }
}

// Banca → Juegos: lo que se puede quitar del selector (los mismos ids que api/_juegos/banca.mjs HIDEABLE), por grupos.
export const GAME_GROUPS: { name: string; games: { id: string; name: string }[] }[] = [
  {
    name: 'Todos a la vez',
    games: [
      { id: 'elevator', name: 'Ascensor' },
      { id: 'auction', name: 'La Subasta' },
      { id: 'roulette', name: 'Ruleta' },
      { id: 'crash', name: 'Cohete' },
      { id: 'race', name: 'Carrera' },
      { id: 'regatta', name: 'Regata' },
    ],
  },
  {
    name: 'A tu ritmo',
    games: [
      { id: 'fish', name: 'Pez Gordo' },
      { id: 'dig', name: 'Tesoro en la Arena' },
      { id: 'dive', name: 'Apnea' },
      { id: 'tower', name: 'La Torre' },
      { id: 'heist', name: 'El Atraco' },
      { id: 'plinko', name: 'Plinko' },
      { id: 'frog', name: 'Rana' },
      { id: 'hilo', name: 'Mayor o Menor' },
      { id: 'bola', name: 'Bola Canaria' },
    ],
  },
  {
    name: 'Mesas en vivo',
    games: [
      { id: 'blackjack', name: 'Blackjack' },
      { id: 'poker', name: 'Póker' },
      { id: 'chess', name: 'Ajedrez' },
    ],
  },
  {
    name: 'Destacados y dinero a salvo',
    games: [
      { id: 'bingo', name: 'Bingo' },
      { id: 'gacha', name: 'Gacha' },
      { id: 'inmo', name: 'Inmobiliaria' },
      { id: 'suiza', name: 'Suiza' },
    ],
  },
]

// Una cuenta en Banca → Usuarios.
export interface UsuarioAdmin {
  id: string
  name: string
  email: string
  avatar: string | null
  estado: 'aprobado' | 'pendiente' | 'rechazado'
  master: boolean
  temporal: boolean // entró (o entrará) con una contraseña temporal y aún no ha elegido la suya
  creado: number | null
  acceso: number | null // último inicio de sesión
}

// Cuenta nueva que espera a que el master la acepte.
export interface Pendiente {
  id: string
  name: string
  email: string
  at: number
}

export const BANK_TOPIC = 'juegos-banca'
export const ABUSE_MINUTES = [5, 10, 30, 60] as const
export const POT_MINUTES = [30, 60, 120, 240, null] as const // como bingo.POT_OPEN_MINUTES
export const RAID_PCTS = [10, 20, 30] as const // como hacienda.RAID_PCTS
export const RAID_FLOORS = [50_000, 100_000, 200_000] as const

// Una llamada a la banca. Lanza un Error con el mensaje del servidor si algo falla.
export async function bancaCall(msg: Record<string, unknown>): Promise<BancaReply> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch('/api/juegos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(msg),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body) throw new Error(body?.error?.message ?? 'La banca no responde. Inténtalo de nuevo.')
  return body as BancaReply
}

// 1.000 € con punto de miles también en las cifras de 4 dígitos (como money.js de Juegos).
export const eur = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}\u00a0€`

// Lo que ofrece cada Admin Abuse, punto por punto (para la presentación a pantalla completa).
export function abusePerks(a: Pick<Abuse, 'modo' | 'ambito'>): string[] {
  const m = a.modo === 'x3' ? '×3' : '×2'
  if (a.modo === 'gratis') {
    return a.ambito === 'poker'
      ? ['Si pierdes una mano de póker, la banca te devuelve lo apostado', 'Lo que ganes, para ti']
      : [
          'Si pierdes en cualquier juego, la banca te lo devuelve',
          'Lo que pierdas sigue sumando al bote del bingo',
          'Cartones del bingo sin premio: te devuelven lo que costaron',
          'Lo que ganes, para ti',
          'Tiradas del gacha gratis',
        ]
  }
  if (a.ambito === 'poker') return [`Todo lo que ganes en el póker, ${m}`, 'La banca pone la diferencia']
  return [
    `Premios ${m} en ruleta, cohete, carrera, regata, plinko, rana, mayor o menor, bola canaria, bingo, torre, atraco, subasta y ascensor`,
    `Blackjack y póker: lo que ganes, ${m}`,
    `Suerte ${m} en el gacha, el plinko, la torre, el atraco, la arena, la apnea y la bola canaria`,
    `Bingo: ${a.modo === 'x3' ? 'dos cartones' : 'un cartón'} de regalo por cada uno que compres`,
  ]
}

// Título grande y explicación de cada Admin Abuse.
export function abuseText(a: Pick<Abuse, 'modo' | 'ambito'>): { big: string; small: string } {
  const where = a.ambito === 'poker' ? 'SOLO EN PÓKER' : 'EN TODOS LOS JUEGOS'
  if (a.modo === 'gratis') {
    return { big: `TODO GRATIS ${where}`, small: 'Perder no cuesta: la banca te devuelve lo que pierdas.' }
  }
  const m = a.modo === 'x3' ? '×3' : '×2'
  return {
    big: `PROBABILIDAD ${m} ${where}`,
    small: a.ambito === 'poker' ? `Lo que ganes en el póker, ${m}.` : `Lo que ganes, ${m}, y suerte ${m} en el plinko, la torre, el atraco, la arena, la apnea, la bola canaria y el bingo.`,
  }
}
