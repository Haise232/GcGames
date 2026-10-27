// Reglas puras de la Inmobiliaria: las usan la pantalla y el servidor (api/_juegos/inmobiliaria.mjs).
// Un tablero de 40 casillas como el de los juegos de propiedades de toda la vida, con calles y sitios de Canarias. Cada
// propiedad tiene como mucho un dueño y es la misma para todos: entre todos se va montando la ciudad.
//   - Comprar: al banco, por su precio. Las calles se pueden mejorar con casas (1 a 4) y un hotel (nivel 5).
//   - Alquiler: lo paga el banco cada hora, un RENT_RATE de lo invertido en la propiedad (compra y mejoras). Tener todas
//     las de un color lo dobla; las estaciones y las compañías suben con cuántas tengas. Se acumula hasta RENT_CAP_MS y se
//     cobra en efectivo (ese sí lo ve Hacienda; las propiedades, no).
//   - Vender: el banco te devuelve SELL_NOW de lo invertido esta semana y SELL_OLD de lo de semanas anteriores. Así
//     esconder dinero de Hacienda vale dentro de la semana, pero pasarlo a la siguiente (el saldo se reinicia el domingo)
//     apenas compensa. Las propiedades se quedan entre semanas y siguen dando alquiler.
export const HOUR = 3600000
export const RENT_RATE = 0.0015 // por hora: un 3,6 % al día de lo invertido
export const RENT_CAP_MS = 24 * HOUR
export const SELL_NOW = 0.85
export const SELL_OLD = 0.25
export const MAX_LEVEL = 5 // 4 casas y el hotel

// Colores (house: lo que cuesta cada casa y el hotel).
export const GROUPS = {
  marron: { name: 'Marrón', color: '#8a5a33', house: 5000 },
  celeste: { name: 'Celeste', color: '#8fd3f0', house: 5000 },
  rosa: { name: 'Rosa', color: '#d9479a', house: 10000 },
  naranja: { name: 'Naranja', color: '#f08a24', house: 10000 },
  rojo: { name: 'Rojo', color: '#e0322b', house: 15000 },
  amarillo: { name: 'Amarillo', color: '#f5d020', house: 15000 },
  verde: { name: 'Verde', color: '#22a35a', house: 20000 },
  azul: { name: 'Azul', color: '#1f4fb5', house: 20000 },
  estacion: { name: 'Transporte', color: '#2b2f36', house: 0 },
  compania: { name: 'Compañías', color: '#7a8796', house: 0 },
  europa: { name: 'Europa', color: '#2f6fd8', house: 0 },
  america: { name: 'América', color: '#e0322b', house: 0 },
  asia: { name: 'Asia', color: '#f2a516', house: 0 },
  africa: { name: 'África', color: '#22a35a', house: 0 },
  oceania: { name: 'Oceanía', color: '#1fb5b0', house: 0 },
  planeta: { name: 'Sistema Solar', color: '#3b5bdb', house: 0 },
  estrella: { name: 'Estrellas', color: '#f2a516', house: 0 },
  galaxia: { name: 'Galaxias', color: '#8e44ec', house: 0 },
}

const calle = (group, name, price) => ({ kind: 'calle', group, name, price })
const estacion = (name) => ({ kind: 'estacion', group: 'estacion', name, price: 20000 })
const compania = (name, icon) => ({ kind: 'compania', group: 'compania', name, price: 15000, icon })
const deco = (kind, name) => ({ kind, name })

// Las 40 casillas, empezando por la Salida y en el sentido de la marcha. Las que no son propiedades son decoración.
export const BOARD = [
  deco('salida', 'Salida'),
  calle('marron', 'Calle Real de La Isleta', 6000),
  deco('caja', 'Caja de comunidad'),
  calle('marron', 'Barrio de San Cristóbal', 6000),
  deco('impuesto', 'Hacienda'),
  estacion('Estación de guaguas San Telmo'),
  calle('celeste', 'Calle Triana', 10000),
  deco('suerte', 'Suerte'),
  calle('celeste', 'Plaza de Santa Ana', 10000),
  calle('celeste', 'Barrio de Vegueta', 12000),
  deco('carcel', 'Cárcel'),
  calle('rosa', 'Paseo de Las Canteras', 14000),
  compania('Desaladora', '💧'),
  calle('rosa', 'Calle Mesa y López', 14000),
  calle('rosa', 'Parque Santa Catalina', 16000),
  estacion('Puerto de La Luz'),
  calle('naranja', 'Calle del Castillo', 18000),
  deco('caja', 'Caja de comunidad'),
  calle('naranja', 'Casco de La Laguna', 18000),
  calle('naranja', 'Plaza del Charco', 20000),
  deco('parking', 'Parking gratuito'),
  calle('rojo', 'Rambla de Santa Cruz', 22000),
  deco('suerte', 'Suerte'),
  calle('rojo', 'Playa de Las Teresitas', 22000),
  calle('rojo', 'Los Cristianos', 24000),
  estacion('Aeropuerto de Gando'),
  calle('amarillo', 'Puerto de Mogán', 26000),
  calle('amarillo', 'Playa del Inglés', 26000),
  compania('Parque eólico', '🌬️'),
  calle('amarillo', 'Meloneras', 28000),
  deco('a-carcel', 'Vete a la cárcel'),
  calle('verde', 'Corralejo', 30000),
  calle('verde', 'Puerto del Carmen', 30000),
  deco('caja', 'Caja de comunidad'),
  calle('verde', 'Teguise', 32000),
  estacion('Aeropuerto Tenerife Sur'),
  deco('suerte', 'Suerte'),
  calle('azul', 'Costa Adeje', 35000),
  deco('impuesto', 'Impuesto de lujo'),
  calle('azul', 'Dunas de Maspalomas', 40000),
].map((cell, i) => ({ i, ...cell }))

export const PROPERTIES = BOARD.filter((c) => c.price)

// El mundo, entre la ciudad y el espacio: países (desde la casilla 60), más caros cuanto más ricos, y siempre por debajo
// del planeta más barato. Como las demás propiedades pero sin casas; tener todos los de un continente dobla el
// alquiler. lon y lat: dónde van en el mapa.
const pais = (i, group, name, flag, price, lon, lat, fact) => ({ i, kind: 'pais', group, name, flag, price, lon, lat, fact })
export const WORLD = [
  pais(60, 'europa', 'Portugal', '🇵🇹', 60000, -8.2, 39.6, 'El país de los descubridores. Y de los pasteles de nata.'),
  pais(61, 'europa', 'España', '🇪🇸', 90000, -3.7, 40.3, 'Viene con las Canarias de regalo. Bueno, no: esas ya son tuyas en la ciudad.'),
  pais(62, 'europa', 'Italia', '🇮🇹', 95000, 12.5, 42.8, 'Pizza, pasta y el Coliseo, que ya venía en ruinas.'),
  pais(63, 'europa', 'Francia', '🇫🇷', 110000, 2.3, 46.6, 'La Torre Eiffel incluida. Los franceses, no.'),
  pais(64, 'europa', 'Reino Unido', '🇬🇧', 115000, -1.8, 52.8, 'Llueve, pero hay té a las cinco.'),
  pais(65, 'europa', 'Alemania', '🇩🇪', 125000, 10.4, 51.2, 'La economía más grande de Europa: un buen sitio para cobrar alquiler.'),
  pais(66, 'america', 'Cuba', '🇨🇺', 45000, -79.5, 21.8, 'Medio Canarias tiene un abuelo que se fue allí.'),
  pais(67, 'america', 'Venezuela', '🇻🇪', 50000, -66.6, 7.1, 'La octava isla, dicen en Canarias.'),
  pais(68, 'america', 'Argentina', '🇦🇷', 60000, -64.5, -34.5, 'Asado, Messi y el fin del mundo en Ushuaia.'),
  pais(69, 'america', 'México', '🇲🇽', 75000, -102.5, 23.6, 'Tacos, pirámides y Cancún.'),
  pais(70, 'america', 'Brasil', '🇧🇷', 85000, -51.9, -10.3, 'La mitad de Sudamérica y el Amazonas entero.'),
  pais(71, 'america', 'Canadá', '🇨🇦', 105000, -106, 57, 'El segundo país más grande del mundo, casi todo nieve.'),
  pais(72, 'america', 'Estados Unidos', '🇺🇸', 140000, -98.5, 39.5, 'El país más rico del mundo. Y el más caro del tablero.'),
  pais(73, 'asia', 'India', '🇮🇳', 80000, 78.9, 21.5, 'El país con más gente del mundo: mucho inquilino.'),
  pais(74, 'asia', 'Corea del Sur', '🇰🇷', 100000, 127.8, 36.4, 'K-pop, móviles y kimchi.'),
  pais(75, 'asia', 'Japón', '🇯🇵', 120000, 138.3, 36.2, 'Sushi, anime y trenes que nunca llegan tarde.'),
  pais(76, 'asia', 'China', '🇨🇳', 135000, 103.8, 35.8, 'Con la Gran Muralla ya tienes la valla puesta.'),
  pais(77, 'africa', 'Marruecos', '🇲🇦', 45000, -7, 31.8, 'El vecino de enfrente de Canarias.'),
  pais(78, 'africa', 'Egipto', '🇪🇬', 55000, 30.8, 26.8, 'Las pirámides llevan 4.500 años sin pagar alquiler.'),
  pais(79, 'africa', 'Sudáfrica', '🇿🇦', 65000, 24, -30.5, 'Leones, diamantes y el cabo de Buena Esperanza.'),
  pais(80, 'oceania', 'Nueva Zelanda', '🇳🇿', 70000, 172.5, -41.5, 'Aquí se rodó El Señor de los Anillos.'),
  pais(81, 'oceania', 'Australia', '🇦🇺', 110000, 134, -25.5, 'Canguros, koalas y arañas del tamaño de tu mano.'),
]

// El espacio, para los que ya no saben dónde meter el dinero: planetas del Sistema Solar (desde la casilla 100),
// estrellas (desde la 120) y galaxias (desde la 140). Se compran y se venden como las demás propiedades (alquiler,
// el doble con todo el grupo, venta al 85 % / 25 %), pero sin casas. Para una estrella hace falta tener un planeta, y
// para una galaxia, una estrella. La Tierra no está en venta: sus países están en el mundo.
const planeta = (i, name, price, fact) => ({ i, kind: 'planeta', group: 'planeta', name, price, fact })
const estrella = (i, name, price, fact) => ({ i, kind: 'estrella', group: 'estrella', name, price, fact })
const galaxia = (i, name, price, fact) => ({ i, kind: 'galaxia', group: 'galaxia', name, price, fact })
export const SPACE = [
  planeta(100, 'Mercurio', 250000, 'Un año dura 88 días: el alquiler no entiende de calendarios.'),
  planeta(101, 'Venus', 450000, 'Hace 460 °C. Ideal para quien echa de menos el verano en Maspalomas.'),
  planeta(103, 'Marte', 600000, 'Tiene el volcán más alto del Sistema Solar: el Teide, a su lado, es una duna.'),
  planeta(104, 'Júpiter', 2000000, 'Cabrían 1.300 Tierras dentro. Mucho solar para construir.'),
  planeta(105, 'Saturno', 1500000, 'Sus anillos son de hielo: el mejor sitio para un chiringuito.'),
  planeta(106, 'Urano', 900000, 'Gira tumbado. Como tú los domingos.'),
  planeta(107, 'Neptuno', 1000000, 'Vientos de 2.000 km/h: mejor que el Parque eólico.'),
  planeta(108, 'Plutón', 150000, 'Ya no es planeta, pero sigue en venta. Una ganga.'),
  estrella(120, 'El Sol', 6000000, 'Todos los planetas le dan vueltas a tu propiedad.'),
  estrella(121, 'Sirio', 3000000, 'La estrella más brillante del cielo de noche.'),
  estrella(122, 'Vega', 3500000, 'Dentro de 12.000 años será la estrella polar.'),
  estrella(123, 'Betelgeuse', 4500000, 'Una supergigante roja que explotará algún día. Inversión de riesgo.'),
  estrella(124, 'Estrella Polar', 5000000, 'Siempre señala el norte. Como tu patrimonio.'),
  galaxia(140, 'Galaxia del Triángulo', 10000000, 'Cuarenta mil millones de estrellas, todas para ti.'),
  galaxia(141, 'Galaxia del Sombrero', 12000000, 'Con su sombrero, la más elegante del universo.'),
  galaxia(142, 'Galaxia del Remolino', 15000000, 'Una espiral perfecta: así se ve el dinero cuando da vueltas.'),
  galaxia(143, 'Andrómeda', 25000000, 'Chocará con la Vía Láctea dentro de 4.500 millones de años. Ve pensando en la mudanza.'),
]
const BY_ID = new Map([...BOARD, ...WORLD, ...SPACE].map((c) => [c.i, c]))
// Cualquier propiedad, del tablero o del espacio.
export const cellOf = (i) => BY_ID.get(i)
export const isSpace = (i) => i >= 100
export const isWorld = (i) => i >= 60 && i < 100
// Lo que hace falta tener antes de comprar en el espacio.
export const REQUIRES = { estrella: 'planeta', galaxia: 'estrella' }

export const isProperty = (i) => Number.isInteger(i) && Boolean(cellOf(i)?.price)
const groupSize = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, [...PROPERTIES, ...WORLD, ...SPACE].filter((c) => c.group === g).length]))

// Lo que cuesta subir un nivel (casa u hotel); null si no se puede.
export const upgradeCost = (i, level) => (cellOf(i).kind === 'calle' && level < MAX_LEVEL ? GROUPS[cellOf(i).group].house : null)

// Cuánto multiplica el alquiler lo que tiene el dueño de ese color: owned es cuántas tiene de ese grupo.
export function groupMult(group, owned) {
  if (group === 'estacion') return [1, 1, 1.5, 2, 3][owned] ?? 3
  return owned >= groupSize[group] ? 2 : 1
}

// Alquiler por hora de una propiedad con lo invertido y cuántas tiene su dueño de ese color.
export const rentPerHour = (invested, group, owned) => Math.floor(invested * RENT_RATE * groupMult(group, owned))

// Alquiler acumulado desde que se cobró por última vez (hasta RENT_CAP_MS).
export const accrued = (perHour, since, t) => Math.floor((perHour * Math.max(0, Math.min(t - since, RENT_CAP_MS))) / HOUR)

// Lo que da el banco al venderla: lo invertido esta semana (si la semana guardada es la actual) y lo de antes.
export function saleValue({ invested, investedWeek, week }, currentWeek) {
  const now = week === currentWeek ? investedWeek : 0
  return Math.floor(now * SELL_NOW + (invested - now) * SELL_OLD)
}

// «4 casas», «Hotel», «Solar».
export const levelName = (level) => (level >= MAX_LEVEL ? 'Hotel' : level === 0 ? 'Solar' : level === 1 ? '1 casa' : `${level} casas`)

// Las casillas que no son propiedades, cada una con su uso (una vez al día por jugador, día de Canarias):
//   - Salida: cobras SALIDA_BONUS.
//   - Suerte y Caja de comunidad: una carta de cada mazo. Lo que se paga va al bote del Parking.
//   - Parking gratuito: el bote (las multas de las cartas y un PARKING_CUT de lo que se queda el banco en cada venta).
//     Se lo lleva entero el primero que lo pide cuando llega a PARKING_MIN.
//   - Vete a la cárcel: tentar a la suerte; a cara o cruz, TRAP_WIN o a la cárcel.
//   - Cárcel: JAIL_MS sin que tus propiedades den alquiler (lo que llevabas acumulado se cobra antes de entrar).
//   - Hacienda e Impuesto de lujo: lo que te falta para la próxima declaración (solo información).
export const SALIDA_BONUS = 2000
export const TRAP_WIN = 5000
export const JAIL_MS = HOUR
export const PARKING_MIN = 5000
export const PARKING_CUT = 0.1
export const CARDS = {
  suerte: [
    { id: 's1', text: 'Avanza hasta la Salida: cobra 3.000 €.', effect: 'cobra', amount: 3000 },
    { id: 's2', text: 'El banco te paga un dividendo de 1.500 €.', effect: 'cobra', amount: 1500 },
    { id: 's3', text: 'Tus inquilinos pagan por adelantado: cobras ya 2 horas de alquiler de todas tus propiedades.', effect: 'alquiler', hours: 2 },
    { id: 's4', text: 'Multa por exceso de velocidad en la GC-1: paga 500 €.', effect: 'paga', amount: 500 },
    { id: 's5', text: 'Reparaciones en tus propiedades: paga 250 € por cada casa y 1.000 € por cada hotel.', effect: 'reparaciones', house: 250, hotel: 1000 },
    { id: 's6', text: 'Ganaste el concurso de crucigramas: cobra 1.000 €.', effect: 'cobra', amount: 1000 },
    { id: 's7', text: 'Vete a la cárcel: una hora sin cobrar alquiler.', effect: 'carcel' },
    { id: 's8', text: 'Te regalan una casa en tu calle más barata. Si no tienes calles con sitio, cobras 2.000 €.', effect: 'casa', amount: 2000 },
  ],
  caja: [
    { id: 'c1', text: 'Error de la banca a tu favor: cobra 2.000 €.', effect: 'cobra', amount: 2000 },
    { id: 'c2', text: 'Herencia de un tío de Venezuela: cobra 1.000 €.', effect: 'cobra', amount: 1000 },
    { id: 'c3', text: 'Hacienda te devuelve la renta: cobra 750 €.', effect: 'cobra', amount: 750 },
    { id: 'c4', text: 'Honorarios del médico: paga 500 €.', effect: 'paga', amount: 500 },
    { id: 'c5', text: 'Cobra 100 € por cada propiedad que tengas (300 € como mínimo).', effect: 'porpropiedad', amount: 100, min: 300 },
    { id: 'c6', text: 'Seguro del coche: paga 300 €.', effect: 'paga', amount: 300 },
    { id: 'c7', text: 'Segundo premio en un concurso de belleza: cobra 500 €.', effect: 'cobra', amount: 500 },
    { id: 'c8', text: 'Tus inquilinos pagan por adelantado: cobras ya 1 hora de alquiler de todas tus propiedades.', effect: 'alquiler', hours: 1 },
  ],
}
export const cardById = (id) => [...CARDS.suerte, ...CARDS.caja].find((c) => c.id === id)
