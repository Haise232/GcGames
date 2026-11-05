// Reglas puras de la Inmobiliaria: las usan la pantalla y el servidor (api/_juegos/inmobiliaria.mjs).
// La ciudad (un tablero de 40 casillas) y las 7 islas (ISLANDS). Un tablero de 40 casillas como el de los juegos de propiedades de toda la vida, con calles y sitios de Canarias. Cada
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
  // Las 7 islas (ISLANDS).
  grancanaria: { name: 'Gran Canaria', color: '#2f8fd8', house: 0 },
  tenerife: { name: 'Tenerife', color: '#e0563a', house: 0 },
  lanzarote: { name: 'Lanzarote', color: '#b8432a', house: 0 },
  fuerteventura: { name: 'Fuerteventura', color: '#e8b04a', house: 0 },
  lapalma: { name: 'La Palma', color: '#2fa05a', house: 0 },
  lagomera: { name: 'La Gomera', color: '#1f7a4a', house: 0 },
  elhierro: { name: 'El Hierro', color: '#6a5acd', house: 0 },
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

// Las 7 islas (desde la casilla 200): en cada isla, 24 cosas que comprar, de una casa cueva a una isla entera. No van en
// el tablero de la ciudad: cada isla tiene el suyo, que se abre desde el mapa del archipiélago. No llevan casas: se mejoran hasta MAX_ISLA_LEVEL veces, cada mejora
// por ISLA_UPGRADE de su precio, y cada una con su nombre según lo que es (una piscina, una estrella Michelin…). Cuantas
// más tengas de una isla, más rinden todas las de esa isla (islaMult). ups: las mejoras; fact: lo que se cuenta en la ficha.
export const MAX_ISLA_LEVEL = 3
export const ISLA_UPGRADE = 0.4
// Las mejoras de cada tipo de propiedad, en orden.
export const UPGRADES = {
  casa: ['Reforma completa', 'Piscina', 'Ático con vistas al mar'],
  hotel: ['Spa', 'Piscina infinita', 'Cinco estrellas'],
  comida: ['Terraza', 'Cocinero de renombre', 'Estrella Michelin'],
  campo: ['Riego por goteo', 'Almacén propio', 'Exportación a Europa'],
  negocio: ['Segundo local', 'Marca propia', 'Franquicia'],
  ocio: ['Ampliación', 'Espectáculo nocturno', 'Fama mundial'],
  barco: ['Segundo barco', 'Ruta nueva', 'Flota entera'],
}
const isla = (i, group, name, icon, type, price, fact) => ({ i, kind: 'isla', group, name, icon, type, price, fact })
export const ISLANDS = [
  // Gran Canaria
  isla(200, 'grancanaria', 'Casa cueva en Artenara', '🪨', 'casa', 12000, 'Fresca en verano y calentita en invierno: el aire acondicionado de los aborígenes.'),
  isla(201, 'grancanaria', 'Apartamento en Las Canteras', '🏢', 'casa', 26000, 'Con la barra de Las Canteras delante: playa urbana y paseo al atardecer.'),
  isla(202, 'grancanaria', 'Bodega en el Monte Lentiscal', '🍷', 'campo', 32000, 'Vino del Monte, para acompañar unas papas arrugadas.'),
  isla(203, 'grancanaria', 'Plataneras de Arucas', '🍌', 'campo', 45000, 'Plátanos con motitas, como deben ser.'),
  isla(204, 'grancanaria', 'Chiringuito en Maspalomas', '🍹', 'comida', 36000, 'Al lado de las dunas: aquí no hay quien se vaya sin pedir otra.'),
  isla(205, 'grancanaria', 'Destilería de ron en Arucas', '🥃', 'negocio', 90000, 'Ron y ron miel para todo el archipiélago.'),
  isla(206, 'grancanaria', 'Mirador del Roque Nublo', '🗻', 'ocio', 70000, 'La roca más famosa de la isla, con las nubes por debajo.'),
  isla(207, 'grancanaria', 'Faro de Maspalomas', '🗼', 'ocio', 120000, 'Más de cien años alumbrando el sur.'),
  isla(208, 'grancanaria', 'Hotel en Playa del Inglés', '🏨', 'hotel', 150000, 'Turistas todo el año: aquí no existe la temporada baja.'),
  isla(209, 'grancanaria', 'Ferry Agaete–Tenerife', '⛴️', 'barco', 180000, 'Una hora y poco de travesía entre las dos islas capitalinas.'),
  isla(210, 'grancanaria', 'Puerto deportivo de Pasito Blanco', '⛵', 'ocio', 220000, 'Amarres de lujo y yates que no son tuyos. Todavía.'),
  isla(211, 'grancanaria', 'Villa de lujo en Tauro', '🏰', 'casa', 450000, 'Piscina, vistas y una puesta de sol que no cabe en el móvil.'),
  // Tenerife
  isla(220, 'tenerife', 'Guachinche en La Orotava', '🍖', 'comida', 15000, 'Vino de la casa, carne fiesta y papas: la fórmula perfecta.'),
  isla(221, 'tenerife', 'Piso en La Laguna', '🏘️', 'casa', 22000, 'En la ciudad de los estudiantes: siempre hay quien lo alquile.'),
  isla(222, 'tenerife', 'Bar del barraquito en Santa Cruz', '☕', 'comida', 18000, 'Leche condensada, licor 43, café, leche, canela y limón. Y en vaso de cristal.'),
  isla(223, 'tenerife', 'Viñedo en Tacoronte', '🍇', 'campo', 40000, 'La comarca con más vino de la isla.'),
  isla(224, 'tenerife', 'Plataneras de Garachico', '🍌', 'campo', 50000, 'Junto a las piscinas de lava que dejó el volcán.'),
  isla(225, 'tenerife', 'Apartamento en Los Cristianos', '🏖️', 'casa', 60000, 'Sol asegurado los 365 días del año.'),
  isla(226, 'tenerife', 'Barco de ballenas en Los Gigantes', '🐋', 'barco', 90000, 'Calderones y delfines debajo de los acantilados.'),
  isla(227, 'tenerife', 'Hotel en Puerto de la Cruz', '🏨', 'hotel', 170000, 'El primer destino turístico de Canarias.'),
  isla(228, 'tenerife', 'Parque acuático en Costa Adeje', '🌊', 'ocio', 250000, 'Toboganes, olas y colas en verano.'),
  isla(229, 'tenerife', 'Observatorio del Teide', '🔭', 'ocio', 300000, 'Uno de los mejores cielos del mundo para mirar el Sol.'),
  isla(230, 'tenerife', 'Teleférico del Teide', '🚡', 'barco', 400000, 'Subes a 3.555 metros sin sudar ni una gota.'),
  isla(231, 'tenerife', 'Mansión en La Caleta', '🏰', 'casa', 550000, 'La zona más exclusiva del sur, con el mar en la puerta.'),
  // Lanzarote
  isla(240, 'lanzarote', 'Casa blanca en Haría', '🏠', 'casa', 20000, 'En el valle de las mil palmeras, encalada como manda César Manrique.'),
  isla(241, 'lanzarote', 'Chiringuito en Famara', '🍹', 'comida', 25000, 'Viento, surf y risco. Y un mojo que quita el sentío.'),
  isla(242, 'lanzarote', 'Escuela de surf en Famara', '🏄', 'negocio', 30000, 'Olas para aprender y para presumir.'),
  isla(243, 'lanzarote', 'Bodega en La Geria', '🍷', 'campo', 45000, 'Cada parra en su hoyo de picón, protegida del viento.'),
  isla(244, 'lanzarote', 'Camellos de Timanfaya', '🐪', 'barco', 55000, 'El paseo por el volcán más famoso de la isla.'),
  isla(245, 'lanzarote', 'Salinas de Janubio', '🧂', 'campo', 60000, 'Sal marina de la buena, con colores de atardecer.'),
  isla(246, 'lanzarote', 'Ferry a La Graciosa', '⛴️', 'barco', 120000, 'Desde Órzola a la octava isla, sin carreteras asfaltadas.'),
  isla(247, 'lanzarote', 'Restaurante del Islote de Hilario', '🌋', 'comida', 140000, 'Pollo asado con el calor del volcán. Literalmente.'),
  isla(248, 'lanzarote', 'Hotel en Puerto del Carmen', '🏨', 'hotel', 160000, 'La avenida de las Playas, llena todo el año.'),
  isla(249, 'lanzarote', 'Mirador del Río', '🌅', 'ocio', 180000, 'La Graciosa a tus pies, obra de César Manrique.'),
  isla(250, 'lanzarote', 'Jameos del Agua', '🦀', 'ocio', 260000, 'Un tubo volcánico con lago y cangrejitos ciegos.'),
  isla(251, 'lanzarote', 'Villa con piscina en Playa Blanca', '🏰', 'casa', 380000, 'Con Fuerteventura de fondo y el Papagayo al lado.'),
  // Fuerteventura
  isla(260, 'fuerteventura', 'Casa majorera en Betancuria', '🏠', 'casa', 14000, 'En la antigua capital de la isla, entre montañas peladas.'),
  isla(261, 'fuerteventura', 'Molino de Tefía', '🌬️', 'ocio', 20000, 'Viento hay de sobra: aquí el molino nunca para.'),
  isla(262, 'fuerteventura', 'Granja de cabras majoreras', '🐐', 'campo', 28000, 'Más cabras que personas, dicen en la isla.'),
  isla(263, 'fuerteventura', 'Chiringuito en Corralejo', '🍹', 'comida', 30000, 'Arena blanca, agua turquesa y una caña bien fría.'),
  isla(264, 'fuerteventura', 'Quesería de queso majorero', '🧀', 'negocio', 35000, 'El primer queso de cabra de España con denominación de origen.'),
  isla(265, 'fuerteventura', 'Escuela de kitesurf en Sotavento', '🪁', 'negocio', 45000, 'Campeonatos del mundo en la playa de al lado.'),
  isla(266, 'fuerteventura', 'Apartamento en Corralejo', '🏖️', 'casa', 65000, 'Con las dunas a un paseo y Lobos enfrente.'),
  isla(267, 'fuerteventura', 'Barco a la Isla de Lobos', '⛵', 'barco', 80000, 'Quince minutos de travesía hasta el islote.'),
  isla(268, 'fuerteventura', 'Faro de Jandía', '🗼', 'ocio', 110000, 'En la punta del sur, donde se acaba la isla.'),
  isla(269, 'fuerteventura', 'Hotel en Morro Jable', '🏨', 'hotel', 150000, 'Kilómetros de playa delante de la puerta.'),
  isla(270, 'fuerteventura', 'Dunas de Corralejo', '🏜️', 'ocio', 300000, 'Un desierto entero junto al mar.'),
  isla(271, 'fuerteventura', 'Isla de Lobos', '🏝️', 'ocio', 900000, 'Una isla para ti solo. Las focas monje se fueron, pero tú no.'),
  // La Palma
  isla(280, 'lapalma', 'Casa rural en Garafía', '🏡', 'casa', 12000, 'Entre pinares y dragos, en el norte más tranquilo.'),
  isla(281, 'lapalma', 'Dulcería de bienmesabe', '🍯', 'negocio', 18000, 'Almendra, huevo y azúcar: el nombre lo dice todo.'),
  isla(282, 'lapalma', 'Bar en la plaza de Los Llanos', '🍻', 'comida', 22000, 'Bajo los laureles de Indias, el mejor sitio para ver pasar la vida.'),
  isla(283, 'lapalma', 'Fábrica de puros palmeros', '🚬', 'negocio', 30000, 'Torcidos a mano, como en Cuba. O mejor.'),
  isla(284, 'lapalma', 'Viñedo de malvasía en Fuencaliente', '🍇', 'campo', 40000, 'Vino dulce que se cría entre volcanes.'),
  isla(285, 'lapalma', 'Plataneras de Tazacorte', '🍌', 'campo', 55000, 'El valle con más horas de sol de la isla.'),
  isla(286, 'lapalma', 'Casa de balcones en Santa Cruz', '🏛️', 'casa', 70000, 'Balcones de madera colgados sobre la avenida marítima.'),
  isla(287, 'lapalma', 'Ruta de los volcanes', '🌋', 'ocio', 90000, 'De volcán en volcán, del Teneguía al Tajogaite.'),
  isla(288, 'lapalma', 'Hotel en Los Cancajos', '🏨', 'hotel', 130000, 'Piscinas naturales y arena negra.'),
  isla(289, 'lapalma', 'Mirador de la Caldera de Taburiente', '⛰️', 'ocio', 150000, 'Un cráter enorme lleno de pinos y barrancos.'),
  isla(290, 'lapalma', 'Mansión en Tazacorte', '🏰', 'casa', 300000, 'Con la mejor puesta de sol de Canarias, dicen los palmeros.'),
  isla(291, 'lapalma', 'Observatorio del Roque de los Muchachos', '🔭', 'ocio', 350000, 'Telescopios gigantes y un cielo sin contaminación lumínica.'),
  // La Gomera
  isla(300, 'lagomera', 'Casa en Hermigua', '🏠', 'casa', 11000, 'El valle más verde de la isla, entre plataneras.'),
  isla(301, 'lagomera', 'Restaurante del almogrote', '🧀', 'comida', 16000, 'Queso, pimienta y ajo para untar en pan. Pica, avisamos.'),
  isla(302, 'lagomera', 'Escuela de silbo gomero', '🗣️', 'negocio', 20000, 'Patrimonio de la Humanidad: se habla silbando de barranco a barranco.'),
  isla(303, 'lagomera', 'Palmeral de miel de palma en Alojera', '🌴', 'campo', 25000, 'Guarapo de palmera hervido hasta hacerse miel.'),
  isla(304, 'lagomera', 'Chiringuito en Valle Gran Rey', '🍹', 'comida', 28000, 'Atardeceres con tambores y mucho hippie.'),
  isla(305, 'lagomera', 'Bancales de Valle Gran Rey', '🌾', 'campo', 30000, 'Terrazas de cultivo colgadas de la montaña.'),
  isla(306, 'lagomera', 'Barco a Los Órganos', '⛵', 'barco', 75000, 'Columnas de basalto que parecen un órgano de iglesia.'),
  isla(307, 'lagomera', 'Mirador de Abrante', '🌉', 'ocio', 95000, 'Un mirador de cristal colgado sobre el vacío.'),
  isla(308, 'lagomera', 'Parador de San Sebastián', '🏨', 'hotel', 180000, 'Con vistas al puerto y al Teide enfrente.'),
  isla(309, 'lagomera', 'Ferry Los Cristianos–La Gomera', '⛴️', 'barco', 200000, 'La línea que une La Gomera con el mundo.'),
  isla(310, 'lagomera', 'Bosque de Garajonay', '🌳', 'ocio', 260000, 'Laurisilva de cuando los dinosaurios, envuelta en niebla.'),
  isla(311, 'lagomera', 'Finca de lujo en Playa Santiago', '🏰', 'casa', 280000, 'Campo de golf, acantilados y nadie más.'),
  // El Hierro
  isla(320, 'elhierro', 'Casa en Valverde', '🏠', 'casa', 10000, 'La única capital de Canarias que no está en la costa.'),
  isla(321, 'elhierro', 'Bar en La Restinga', '🐟', 'comida', 20000, 'Pescado fresco del día en el pueblo más al sur de España.'),
  isla(322, 'elhierro', 'Quesería herreña', '🧀', 'negocio', 22000, 'Queso ahumado, y las quesadillas herreñas de postre.'),
  isla(323, 'elhierro', 'Bodega de Frontera', '🍷', 'campo', 26000, 'Vino de El Golfo, con más de un siglo de historia.'),
  isla(324, 'elhierro', 'Piñas tropicales de El Golfo', '🍍', 'campo', 30000, 'Las piñas más dulces de Canarias.'),
  isla(325, 'elhierro', 'Piscinas naturales de La Maceta', '🏊', 'ocio', 50000, 'Bañarse en el Atlántico sin miedo a las olas.'),
  isla(326, 'elhierro', 'Centro de buceo en La Restinga', '🤿', 'negocio', 60000, 'Uno de los mejores fondos marinos del mundo.'),
  isla(327, 'elhierro', 'Lagartario del lagarto gigante', '🦎', 'ocio', 70000, 'El lagarto gigante de El Hierro, que se creía extinguido.'),
  isla(328, 'elhierro', 'Faro de Orchilla', '🗼', 'ocio', 90000, 'Por aquí pasaba el meridiano cero antes que por Greenwich.'),
  isla(329, 'elhierro', 'Hotel en el Pozo de la Salud', '🏨', 'hotel', 110000, 'Aguas que, según la tradición, lo curan todo.'),
  isla(330, 'elhierro', 'Árbol Garoé', '🌳', 'ocio', 140000, 'El árbol sagrado que daba agua a los bimbaches.'),
  isla(331, 'elhierro', 'Central de Gorona del Viento', '🌀', 'negocio', 400000, 'Viento y agua para que toda la isla funcione con renovables.'),
  // Segunda tanda: doce más por isla (desde la casilla 400, en bloques de 20 como las primeras), para que cada isla
  // tenga su tablero de 24.
  // Gran Canaria
  isla(400, 'grancanaria', 'Puesto de papas en el mercado de Vegueta', '🥔', 'comida', 10000, 'En el mercado más antiguo de la ciudad: papas arrugadas y mojo para llevar.'),
  isla(401, 'grancanaria', 'Casa terrera en Teror', '🏡', 'casa', 16000, 'Balcones de madera y la basílica del Pino a la vuelta de la esquina.'),
  isla(402, 'grancanaria', 'Dulcería de Moya', '🍪', 'negocio', 20000, 'Bizcochos y suspiros de Moya, de toda la vida.'),
  isla(403, 'grancanaria', 'Guagua turística de Las Palmas', '🚌', 'barco', 38000, 'Vuelta por Vegueta, Triana y Las Canteras en el piso de arriba.'),
  isla(404, 'grancanaria', 'Finca de café en Agaete', '☕', 'campo', 42000, 'Café cultivado en Europa: en el valle de Agaete se da.'),
  isla(405, 'grancanaria', 'Quesería de flor de Guía', '🧀', 'negocio', 48000, 'Queso cuajado con flor de cardo, suave y con su punto amargo.'),
  isla(406, 'grancanaria', 'Restaurante de pescado en Puerto de Mogán', '🐟', 'comida', 65000, 'La pequeña Venecia de Canarias, con sus canales y buganvillas.'),
  isla(407, 'grancanaria', 'Apartamento en Puerto de Mogán', '🏖️', 'casa', 85000, 'Casitas blancas con los marcos de colores, al lado del puerto.'),
  isla(408, 'grancanaria', 'Parque de aves en Maspalomas', '🦜', 'ocio', 130000, 'Loros, flamencos y mariposas en pleno barranco.'),
  isla(409, 'grancanaria', 'Catamarán por la costa sur', '⛵', 'barco', 160000, 'Delfines, bocadillos y música de verano.'),
  isla(410, 'grancanaria', 'Centro comercial en Las Arenas', '🛍️', 'negocio', 260000, 'Con Las Canteras a un paso y el aparcamiento lleno los sábados.'),
  isla(411, 'grancanaria', 'Estadio de Gran Canaria', '🏟️', 'ocio', 600000, 'Los domingos de partido, toda la isla de amarillo.'),
  // Tenerife
  isla(420, 'tenerife', 'Arepera en Santa Cruz', '🫓', 'comida', 12000, 'Herencia de la octava isla: Venezuela.'),
  isla(421, 'tenerife', 'Casita en Anaga', '🏡', 'casa', 17000, 'En el monte de laurisilva, con niebla de regalo.'),
  isla(422, 'tenerife', 'Tienda de disfraces de carnaval', '🎭', 'negocio', 24000, 'Plumas y lentejuelas para el Carnaval de Santa Cruz.'),
  isla(423, 'tenerife', 'Papas antiguas en Tegueste', '🥔', 'campo', 32000, 'Papa bonita, papa negra, papa colorada: cada una con su arrugado.'),
  isla(424, 'tenerife', 'Tasca de pescado en San Andrés', '🐟', 'comida', 36000, 'Al lado de Las Teresitas, la playa de arena traída del Sáhara.'),
  isla(425, 'tenerife', 'Casa de los Balcones en La Orotava', '🏛️', 'casa', 70000, 'Madera tallada del siglo XVII y un patio lleno de flores.'),
  isla(426, 'tenerife', 'Taxi acuático en Puerto Colón', '🚤', 'barco', 75000, 'Del puerto deportivo a las calas de Adeje en un momento.'),
  isla(427, 'tenerife', 'Tienda de surf en El Médano', '🏄', 'negocio', 80000, 'El viento que no para y la Montaña Roja de fondo.'),
  isla(428, 'tenerife', 'Pirámides de Güímar', '🗿', 'ocio', 120000, 'Escalonadas, misteriosas y con un jardín botánico alrededor.'),
  isla(429, 'tenerife', 'Hotel de lujo en Costa Adeje', '🏨', 'hotel', 350000, 'Mayordomo, piscina con cascada y suites con vistas a La Gomera.'),
  isla(430, 'tenerife', 'Auditorio de Tenerife', '🎼', 'ocio', 450000, 'La ola blanca de Calatrava junto al mar.'),
  isla(431, 'tenerife', 'Puerto de Santa Cruz', '⚓', 'barco', 700000, 'Cruceros, contenedores y el muelle de enlace.'),
  // Lanzarote
  isla(440, 'lanzarote', 'Puesto en el mercadillo de Teguise', '🧺', 'negocio', 10000, 'El domingo, toda la isla pasa por aquí.'),
  isla(441, 'lanzarote', 'Casa en El Golfo', '🏠', 'casa', 18000, 'Al lado del Charco de los Clicos, el lago verde.'),
  isla(442, 'lanzarote', 'Tasca de lapas en Arrieta', '🐚', 'comida', 22000, 'Lapas con mojo verde y el Atlántico en la mesa.'),
  isla(443, 'lanzarote', 'Cochinilla de Mala', '🌵', 'campo', 26000, 'Tuneras llenas del bichito que tiñe de rojo.'),
  isla(444, 'lanzarote', 'Taller de timples en Teguise', '🎸', 'negocio', 34000, 'El timple: la guitarrita canaria de cinco cuerdas.'),
  isla(445, 'lanzarote', 'Bar en el Charco de San Ginés', '🍻', 'comida', 48000, 'En el corazón de Arrecife, con los barquitos flotando delante.'),
  isla(446, 'lanzarote', 'Apartamento en Costa Teguise', '🏖️', 'casa', 70000, 'Sol, piscina y la playa de Las Cucharas.'),
  isla(447, 'lanzarote', 'Barco a las playas de Papagayo', '⛵', 'barco', 95000, 'Las calas más bonitas de la isla, vistas desde el mar.'),
  isla(448, 'lanzarote', 'Cueva de los Verdes', '🕳️', 'ocio', 140000, 'Un kilómetro de tubo volcánico con una sorpresa al final.'),
  isla(449, 'lanzarote', 'Jardín de Cactus', '🌵', 'ocio', 200000, 'Miles de cactus en una antigua cantera, la última obra de Manrique.'),
  isla(450, 'lanzarote', 'Gran Hotel de Arrecife', '🏨', 'hotel', 320000, 'El único rascacielos de la isla. Después de él, nunca más.'),
  isla(451, 'lanzarote', 'Marina Rubicón', '⚓', 'ocio', 500000, 'Yates, terrazas y mercadillo los miércoles.'),
  // Fuerteventura
  isla(460, 'fuerteventura', 'Heladería en Gran Tarajal', '🍦', 'comida', 10000, 'Para el calor majorero, un helado de gofio.'),
  isla(461, 'fuerteventura', 'Casa de pescadores en El Cotillo', '🏠', 'casa', 16000, 'Puesta de sol, lagunas de agua clara y viento del norte.'),
  isla(462, 'fuerteventura', 'Finca de aloe vera en Tiscamanita', '🪴', 'campo', 22000, 'Filas y filas de aloe al sol majorero.'),
  isla(463, 'fuerteventura', 'Restaurante de cabrito en Pájara', '🍖', 'comida', 30000, 'Cabrito en salsa, como lo hacían las abuelas.'),
  isla(464, 'fuerteventura', 'Salinas del Carmen', '🧂', 'campo', 38000, 'Sal a la vieja usanza y un esqueleto de ballena de recuerdo.'),
  isla(465, 'fuerteventura', 'Bungalows en Costa Calma', '🏖️', 'casa', 55000, 'Pinos junto al mar, cosa rara en la isla.'),
  isla(466, 'fuerteventura', 'Tienda de surf en Lajares', '🏄', 'negocio', 60000, 'El pueblo surfero por excelencia, con mercadillo los sábados.'),
  isla(467, 'fuerteventura', 'Excursión en 4x4 a Cofete', '🚙', 'barco', 95000, 'Pista de tierra hasta la playa más salvaje de Canarias.'),
  isla(468, 'fuerteventura', 'Faro del Tostón', '🗼', 'ocio', 120000, 'Junto a El Cotillo, con su museo de la pesca.'),
  isla(469, 'fuerteventura', 'Parque de animales en La Lajita', '🦒', 'ocio', 170000, 'Jirafas y camellos en mitad del desierto majorero.'),
  isla(470, 'fuerteventura', 'Hotel de lujo en Corralejo', '🏨', 'hotel', 380000, 'Con las dunas de un lado y Lobos del otro.'),
  isla(471, 'fuerteventura', 'Ferry Corralejo–Lanzarote', '⛴️', 'barco', 450000, 'Media hora entre dos islas, todos los días.'),
  // La Palma
  isla(480, 'lapalma', 'Puesto de mojo en el mercado de Santa Cruz', '🌶️', 'comida', 10000, 'Mojo rojo, mojo verde y mojo de queso palmero.'),
  isla(481, 'lapalma', 'Cabaña en El Paso', '🛖', 'casa', 15000, 'Entre almendros, al pie de la Cumbre Vieja.'),
  isla(482, 'lapalma', 'Taller de seda en El Paso', '🧵', 'negocio', 20000, 'Seda hecha a mano, con gusanos de verdad, como hace siglos.'),
  isla(483, 'lapalma', 'Almendros de Puntagorda', '🌸', 'campo', 24000, 'En febrero, todo el pueblo se pinta de blanco y rosa.'),
  isla(484, 'lapalma', 'Quesería de queso palmero ahumado', '🧀', 'negocio', 28000, 'Ahumado con cáscara de almendra y tunera.'),
  isla(485, 'lapalma', 'Pescadería del puerto de Tazacorte', '🐟', 'comida', 36000, 'Vieja, cherne y la puesta de sol de propina.'),
  isla(486, 'lapalma', 'Barco a la Cueva Bonita', '⛵', 'barco', 60000, 'Una cueva marina con el agua de mil colores.'),
  isla(487, 'lapalma', 'Casa rural en Los Sauces', '🏡', 'casa', 80000, 'Junto al bosque de Los Tilos y sus cascadas.'),
  isla(488, 'lapalma', 'Piscinas del Charco Azul', '🏊', 'ocio', 100000, 'Bañarse en roca volcánica sin miedo a las olas.'),
  isla(489, 'lapalma', 'Mirador del Time', '🌄', 'ocio', 140000, 'El valle de Aridane entero a tus pies.'),
  isla(490, 'lapalma', 'Parador de La Palma', '🏨', 'hotel', 220000, 'En Breña Baja, con jardines y vistas al Atlántico.'),
  isla(491, 'lapalma', 'Puerto de Santa Cruz de La Palma', '⚓', 'barco', 420000, 'Por aquí entra y sale todo lo que llega a la isla.'),
  // La Gomera
  isla(500, 'lagomera', 'Panadería de Agulo', '🥖', 'negocio', 10000, 'Pan de leña de los de antes, para mojar en almogrote.'),
  isla(501, 'lagomera', 'Casa en Agulo', '🏠', 'casa', 14000, 'Uno de los pueblos más bonitos de Canarias, con el Teide enfrente.'),
  isla(502, 'lagomera', 'Bar de potaje de berros en Chipude', '🍲', 'comida', 18000, 'Berros, millo y gofio escaldado para el frío de la cumbre.'),
  isla(503, 'lagomera', 'Viñedo de forastera en Vallehermoso', '🍇', 'campo', 22000, 'La uva forastera gomera, que casi solo se da aquí.'),
  isla(504, 'lagomera', 'Alfarería de El Cercado', '🏺', 'negocio', 26000, 'Loza hecha a mano, sin torno, como los antiguos gomeros.'),
  isla(505, 'lagomera', 'Casa colonial en San Sebastián', '🏛️', 'casa', 40000, 'En la calle Real, por donde pasó Colón camino de América.'),
  isla(506, 'lagomera', 'Restaurante de pescado en Playa Santiago', '🐟', 'comida', 50000, 'Pescado a la plancha y papas con mojo frente al puerto.'),
  isla(507, 'lagomera', 'Barco de delfines', '🐬', 'barco', 65000, 'Calderones y delfines entre La Gomera y Tenerife.'),
  isla(508, 'lagomera', 'Torre del Conde', '🏰', 'ocio', 110000, 'La torre más antigua de Canarias, en pie desde el siglo XV.'),
  isla(509, 'lagomera', 'Roque de Agando', '🗻', 'ocio', 150000, 'Un pitón de roca que se ve desde media isla.'),
  isla(510, 'lagomera', 'Hotel rural en Hermigua', '🏨', 'hotel', 190000, 'Plataneras, barranco y silencio.'),
  isla(511, 'lagomera', 'Aeropuerto de La Gomera', '✈️', 'barco', 320000, 'Pequeñito, sí, pero une la isla con el resto del mundo.'),
  // El Hierro
  isla(520, 'elhierro', 'Pastelería de quesadillas herreñas', '🥧', 'negocio', 10000, 'La quesadilla en forma de flor, el dulce de la isla.'),
  isla(521, 'elhierro', 'Casa de piedra en Isora', '🏠', 'casa', 13000, 'Muros de piedra seca y un huerto de higueras.'),
  isla(522, 'elhierro', 'Higueras de El Golfo', '🌿', 'campo', 16000, 'Higos pasados al sol, para el invierno.'),
  isla(523, 'elhierro', 'Bar del Charco Manso', '🍺', 'comida', 20000, 'Al lado de una piscina natural con arcos de lava.'),
  isla(524, 'elhierro', 'Cabras en la meseta de Nisdafe', '🐐', 'campo', 24000, 'Muros de piedra, niebla y queso para toda la isla.'),
  isla(525, 'elhierro', 'Casa rural en Sabinosa', '🏡', 'casa', 32000, 'En la punta oeste de la isla, junto al Pozo de la Salud.'),
  isla(526, 'elhierro', 'Mirador de La Peña', '🌄', 'ocio', 45000, 'El mirador de César Manrique colgado sobre El Golfo.'),
  isla(527, 'elhierro', 'Barco de pesca en La Restinga', '🎣', 'barco', 55000, 'Pesca de altura en el mar de las Calmas.'),
  isla(528, 'elhierro', 'Sabinar de La Dehesa', '🌲', 'ocio', 80000, 'Sabinas retorcidas por el viento: el símbolo de la isla.'),
  isla(529, 'elhierro', 'Parador de El Hierro', '🏨', 'hotel', 160000, 'Al final de la carretera, entre el mar y el risco.'),
  isla(530, 'elhierro', 'Puerto de La Estaca', '⚓', 'barco', 220000, 'Por donde llega el ferry, y con él, casi todo lo demás.'),
  isla(531, 'elhierro', 'Volcán submarino Tagoro', '🌋', 'ocio', 600000, 'El volcán más joven de Canarias, bajo el mar de La Restinga.'),
]

const BY_ID = new Map([...BOARD, ...ISLANDS].map((c) => [c.i, c]))
// Cualquier propiedad, del tablero o de las islas.
export const cellOf = (i) => BY_ID.get(i)
export const isIsland = (i) => i >= 200
// Casillas del mundo (60-99) y del espacio (100-199), retirados: el servidor devuelve lo invertido a sus dueños.
export const isRetired = (i) => i >= 60 && i < 200

export const isProperty = (i) => Number.isInteger(i) && Boolean(cellOf(i)?.price)
export const groupSize = Object.fromEntries(Object.keys(GROUPS).map((g) => [g, [...PROPERTIES, ...ISLANDS].filter((c) => c.group === g).length]))

// Lo que cuesta subir un nivel (casa u hotel en las calles; una mejora en las islas); null si no se puede.
export function upgradeCost(i, level) {
  const cell = cellOf(i)
  if (cell.kind === 'calle') return level < MAX_LEVEL ? GROUPS[cell.group].house : null
  if (cell.kind === 'isla') return level < MAX_ISLA_LEVEL ? Math.round((cell.price * ISLA_UPGRADE) / 500) * 500 : null
  return null
}

// En las islas, cuantas más tengas de la misma isla, más rinden todas: 4 o más ×1,25; 8 o más ×1,5; 16 o más ×1,75; la
// isla entera (las 24) ×2.
export const ISLA_TIERS = [
  [4, 1.25],
  [8, 1.5],
  [16, 1.75],
]

// Cuánto multiplica el alquiler lo que tiene el dueño de ese color: owned es cuántas tiene de ese grupo.
export function groupMult(group, owned) {
  if (group === 'estacion') return [1, 1, 1.5, 2, 3][owned] ?? 3
  if (owned >= groupSize[group]) return 2
  if (ISLANDS.some((c) => c.group === group)) return ISLA_TIERS.reduce((m, [n, k]) => (owned >= n ? k : m), 1)
  return 1
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

// «4 casas», «Hotel», «Solar» en las calles; en las islas, el nombre de la última mejora («Piscina») o «Sin mejoras».
export function levelName(level, i = null) {
  const cell = i === null ? null : cellOf(i)
  if (cell?.kind === 'isla') return level === 0 ? 'Sin mejoras' : UPGRADES[cell.type][level - 1]
  return level >= MAX_LEVEL ? 'Hotel' : level === 0 ? 'Solar' : level === 1 ? '1 casa' : `${level} casas`
}

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
