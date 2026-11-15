// El sorteo de la Lotería de Navidad en 3D (three.js): un teatro con telón de terciopelo, embocadura dorada con
// bombillas, tablado de madera y focos; en el escenario, los dos bombos dorados con sus bolas dando vueltas. Cada vez que
// se canta un premio sale una bola de número del bombo grande y una de premio del pequeño, ruedan por su rampa y se
// quedan en la bandeja. Para el Gordo se apagan las luces y la cámara se acerca; si sale tu número, confeti.
// Se carga aparte (import dinámico desde Loteria.jsx); sin WebGL se ven los dibujos SVG de siempre. Solo dibuja: el
// premio y el sorteo los decide el servidor.
//
// frame: { spinning, fast, sung, current: { prize, number } | null, hit, done, win, lost }
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { fmtNumber } from './loteria.js'

const TAU = Math.PI * 2
const BIG = { pos: new Vector3(-5.8, 7.4, -2), r: 3.1, balls: 70 }
const SMALL = { pos: new Vector3(5.6, 6.6, -2), r: 1.9, balls: 22 }
const TRAY = new Vector3(0, 3.7, 2.2)
const BALL_R = 0.42
const PRIZE_SHORT = { gordo: 'GORDO', segundo: '2.º', tercero: '3.º', cuarto: '4.º', quinto: '5.º' }
const BULBS = ['#ffd34a', '#fff3c4', '#ff3b4a', '#3ddc84']

const clamp01 = (k) => Math.min(1, Math.max(0, k))
const smooth = (a, b, x) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}
// Terciopelo: pliegues verticales.
const velvetTexture = () =>
  canvasTex(512, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0)
    for (let i = 0; i <= 12; i++) {
      grad.addColorStop(i / 12, i % 2 ? '#5a0711' : '#a8142a')
    }
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
  })
const planksTexture = () =>
  canvasTex(512, 512, (g, w, h) => {
    const R = rng(5)
    for (let i = 0; i < 8; i++) {
      const tone = 90 + Math.floor(R() * 40)
      g.fillStyle = `rgb(${tone + 40}, ${tone - 10}, ${tone - 50})`
      g.fillRect(i * 64, 0, 64, h)
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(i * 64, 0, 2, h)
      for (let k = 0; k < 30; k++) {
        g.fillStyle = `rgba(40, 18, 6, ${0.05 + R() * 0.08})`
        g.fillRect(i * 64 + R() * 60, R() * h, 2 + R() * 3, 20 + R() * 80)
      }
    }
  })
const marqueeTexture = () =>
  canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#1a0408'
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#f0c04e'
    g.lineWidth = 6
    g.strokeRect(6, 6, w - 12, h - 12)
    g.fillStyle = '#ffd77a'
    g.font = '700 54px Georgia, serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('Sorteo Extraordinario de Navidad', w / 2, h / 2 + 4)
  })
// La bola del número (madera clara, el número dos veces alrededor) o la del premio (dorada).
function ballTexture(text, gold) {
  return canvasTex(512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, gold ? '#fff0b0' : '#fffaf0')
    grad.addColorStop(0.5, gold ? '#f0c04e' : '#f3e6c8')
    grad.addColorStop(1, gold ? '#a86f12' : '#d9c08a')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    g.fillStyle = gold ? '#3a1a02' : '#3a1a08'
    g.font = `800 ${text.length > 4 ? 46 : 66}px Georgia, serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const x of [0.25, 0.75]) g.fillText(text, w * x, h / 2 + 4)
  })
}

export function createLoteria3D(host, { reduced = false, onFail } = {}) {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  const canvas = renderer.domElement
  canvas.className = 'lt3d__gl'
  const onLost = (event) => {
    event.preventDefault()
    onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  host.prepend(canvas)

  const scene = new Scene()
  scene.background = new Color('#12040a')
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 200)
  const disposables = []
  const keep = (x) => {
    disposables.push(x)
    return x
  }

  // Luces: dos focos cálidos sobre los bombos, uno sobre la bandeja, ambiente rojizo de sala.
  const hemi = new HemisphereLight('#ffd8b0', '#2a0610', 0.3)
  const amb = new AmbientLight('#ffffff', 0.06)
  scene.add(hemi, amb)
  const spots = [
    [BIG.pos, '#ffe1a8', 900],
    [SMALL.pos, '#ffe1a8', 600],
    [TRAY, '#fff1d0', 500],
  ].map(([target, color, power]) => {
    const s = new SpotLight(color, power, 60, 0.42, 0.6, 2)
    s.position.set(target.x * 0.6, 18, 10)
    s.target.position.copy(target)
    s.castShadow = true
    s.shadow.mapSize.set(1024, 1024)
    scene.add(s, s.target)
    return s
  })
  const front = new PointLight('#ffcf9a', 18, 40, 2)
  front.position.set(0, 6, 12)
  scene.add(front)

  // El teatro: tablado, pared del fondo de terciopelo, embocadura dorada, telón y cenefa con bombillas.
  const planks = keep(planksTexture())
  planks.wrapS = planks.wrapT = RepeatWrapping
  planks.repeat.set(4, 2)
  const floor = new Mesh(keep(new PlaneGeometry(60, 30).rotateX(-Math.PI / 2)), keep(new MeshStandardMaterial({ map: planks, roughness: 0.35, metalness: 0.05 })))
  floor.position.set(0, 0, 2)
  floor.receiveShadow = true
  scene.add(floor)
  const velvet = keep(velvetTexture())
  velvet.wrapS = RepeatWrapping
  const backMat = keep(new MeshPhysicalMaterial({ map: velvet, roughness: 0.8, sheen: 0.5, sheenColor: new Color('#ff5060'), sheenRoughness: 0.5 }))
  velvet.repeat.set(6, 1)
  const back = new Mesh(keep(new PlaneGeometry(60, 26)), backMat)
  back.position.set(0, 12, -9)
  scene.add(back)
  const gold = keep(new MeshStandardMaterial({ color: '#e0b54e', metalness: 1, roughness: 0.28 }))
  const marquee = new Mesh(keep(new PlaneGeometry(14, 2.2)), keep(new MeshBasicMaterial({ map: keep(marqueeTexture()), color: new Color(1.4, 1.3, 1.2) })))
  marquee.position.set(0, 11.6, -8.9)
  scene.add(marquee)
  for (const [w, h, x, y] of [[1.2, 16, -15.5, 8], [1.2, 16, 15.5, 8], [32.2, 1.4, 0, 16]]) {
    const m = new Mesh(keep(new BoxGeometry(w, h, 1.2)), gold)
    m.position.set(x, y, 6)
    scene.add(m)
  }
  // Telón a los lados, con pliegues.
  const drapeGeo = new PlaneGeometry(6, 16, 40, 1)
  {
    const p = drapeGeo.attributes.position
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3.2) * 0.35)
    drapeGeo.computeVertexNormals()
  }
  keep(drapeGeo)
  const drapeMat = keep(new MeshPhysicalMaterial({ color: '#b5182a', roughness: 0.75, sheen: 0.5, sheenColor: new Color('#ff5a6a'), sheenRoughness: 0.5, side: DoubleSide }))
  for (const side of [-1, 1]) {
    const d = new Mesh(drapeGeo, drapeMat)
    d.position.set(side * 12.2, 8, 5.2)
    d.rotation.y = side * 0.12
    scene.add(d)
  }
  const valance = new Mesh(keep(new PlaneGeometry(31, 2.4, 60, 1)), drapeMat)
  valance.position.set(0, 14.6, 5.4)
  scene.add(valance)
  const bulbPos = []
  for (let x = -15; x <= 15; x += 0.9) bulbPos.push([x, 15.95, 6.65])
  for (let y = 1; y <= 15.5; y += 0.9) bulbPos.push([-15.5, y, 6.65], [15.5, y, 6.65])
  const bulbs = new InstancedMesh(keep(new SphereGeometry(0.15, 8, 6)), keep(new MeshBasicMaterial({ color: '#ffffff' })), bulbPos.length)
  const bulbBase = bulbPos.map((_, i) => new Color(BULBS[i % 2 ? 0 : 1]).multiplyScalar(3))
  bulbPos.forEach(([x, y, z], i) => {
    bulbs.setMatrixAt(i, new Matrix4().setPosition(x, y, z))
    bulbs.setColorAt(i, bulbBase[i])
  })
  scene.add(bulbs)
  const bulbTmp = new Color()
  // Árboles de Navidad a los lados del escenario.
  for (const side of [-1, 1]) {
    const tree = new Group()
    const green = keep(new MeshStandardMaterial({ color: '#1d5a32', roughness: 0.8 }))
    for (let i = 0; i < 3; i++) {
      const c = new Mesh(keep(new ConeGeometry(1.7 - i * 0.4, 1.8, 14)), green)
      c.position.y = 1.1 + i * 1.0
      tree.add(c)
    }
    const star = new Mesh(keep(new IcosahedronGeometry(0.3, 0)), keep(new MeshBasicMaterial({ color: new Color('#ffd34a').multiplyScalar(4) })))
    star.position.y = 4.1
    tree.add(star)
    tree.position.set(side * 10.6, 0, 1)
    scene.add(tree)
  }

  // Haces de los focos (conos aditivos).
  const beamMat = keep(new MeshBasicMaterial({ color: new Color(1, 0.85, 0.6), transparent: true, opacity: 0.03, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
  const beams = spots.map((s) => {
    const len = s.position.distanceTo(s.target.position)
    const geo = new ConeGeometry(Math.tan(0.42) * len, len, 32, 1, true)
    geo.translate(0, -len / 2, 0)
    const m = new Mesh(keep(geo), beamMat)
    m.position.copy(s.position)
    m.lookAt(s.target.position)
    m.rotateX(-Math.PI / 2)
    scene.add(m)
    return m
  })

  // Los bombos: jaula de aros dorados, cristal, bolas dentro, soporte de madera y manivela.
  const wood = keep(new MeshStandardMaterial({ color: '#6a2a12', roughness: 0.45 }))
  const glass = keep(new MeshPhysicalMaterial({ color: '#fff4dc', transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1, depthWrite: false }))
  const ballMat = keep(new MeshStandardMaterial({ color: '#f6ead0', roughness: 0.35 }))
  const goldBallMat = keep(new MeshStandardMaterial({ color: '#f0c04e', metalness: 0.7, roughness: 0.3 }))
  function buildBombo(def, ballMaterial) {
    const g = new Group()
    g.position.copy(def.pos)
    const cage = new Group()
    for (let i = 0; i < 6; i++) {
      const ring = new Mesh(keep(new TorusGeometry(def.r, 0.05, 6, 64)), gold)
      ring.rotation.y = (i / 6) * Math.PI
      cage.add(ring)
    }
    for (const y of [-0.5, 0, 0.5]) {
      const rr = def.r * Math.sqrt(1 - y * y)
      const ring = new Mesh(keep(new TorusGeometry(rr, 0.045, 6, 64)), gold)
      ring.rotation.x = Math.PI / 2
      ring.position.y = y * def.r
      cage.add(ring)
    }
    const shell = new Mesh(keep(new SphereGeometry(def.r, 32, 16)), glass)
    cage.add(shell)
    g.add(cage)
    // Soporte: dos patas y un eje dorado.
    for (const side of [-1, 1]) {
      const leg = new Mesh(keep(new BoxGeometry(0.35, def.pos.y + 0.2, 0.5)), wood)
      leg.position.set(side * (def.r + 0.35), -(def.pos.y + 0.2) / 2 + 0.1, 0)
      leg.rotation.z = side * 0.08
      leg.castShadow = true
      g.add(leg)
    }
    const axle = new Mesh(keep(new CylinderGeometry(0.14, 0.14, def.r * 2 + 1.2, 16).rotateZ(Math.PI / 2)), gold)
    g.add(axle)
    const crank = new Group()
    const arm = new Mesh(keep(new BoxGeometry(0.14, 1.2, 0.14)), gold)
    arm.position.y = 0.6
    const knob = new Mesh(keep(new SphereGeometry(0.2, 12, 8)), keep(new MeshStandardMaterial({ color: '#d42a35', roughness: 0.4 })))
    knob.position.y = 1.2
    crank.add(arm, knob)
    crank.position.x = def.r + 0.7
    g.add(crank)
    const base = new Mesh(keep(new CylinderGeometry(def.r + 0.9, def.r + 1.1, 0.3, 40)), gold)
    base.position.y = -def.pos.y + 0.15
    base.receiveShadow = true
    g.add(base)
    // Bolas: cada una con su sitio en el montón (quieto) y su órbita (girando).
    const balls = new InstancedMesh(keep(new SphereGeometry(def.r * 0.12, 14, 10)), ballMaterial, def.balls)
    balls.castShadow = true
    const R = rng(def.balls)
    const params = Array.from({ length: def.balls }, (_, i) => {
      const a = R() * TAU
      const d = Math.sqrt(R()) * def.r * 0.72
      const layer = Math.floor(i / 12)
      return {
        pile: new Vector3(Math.cos(a) * d, -def.r * 0.78 + layer * def.r * 0.2 + R() * 0.1, Math.sin(a) * d * 0.7),
        ph: R() * TAU,
        sp: 0.6 + R() * 0.9,
        rad: def.r * (0.3 + R() * 0.45),
        tilt: R() * TAU,
      }
    })
    g.add(balls)
    scene.add(g)
    return { def, g, cage, crank, balls, params, spin: 0, angle: 0 }
  }
  const big = buildBombo(BIG, ballMat)
  const small = buildBombo(SMALL, goldBallMat)
  const dummy = new Object3D()
  function updateBombo(b, dt, speed) {
    b.spin += (speed - b.spin) * (1 - Math.exp(-dt * 3))
    b.angle += b.spin * dt
    b.cage.rotation.z = b.angle
    b.crank.rotation.x = b.angle * 1.3
    const mix = clamp01(b.spin / 2)
    b.params.forEach((p, i) => {
      const a = p.ph + b.angle * p.sp
      // En marcha, las bolas vuelan por dentro (más abajo que arriba, como con la gravedad); paradas, se amontonan.
      const tx = Math.cos(a) * p.rad
      const ty = Math.sin(a) * p.rad * 0.8 - b.def.r * 0.15
      const tz = Math.sin(a * 0.7 + p.tilt) * p.rad * 0.6
      dummy.position.set(p.pile.x + (tx - p.pile.x) * mix, p.pile.y + (ty - p.pile.y) * mix, p.pile.z + (tz - p.pile.z) * mix)
      dummy.updateMatrix()
      b.balls.setMatrixAt(i, dummy.matrix)
    })
    b.balls.instanceMatrix.needsUpdate = true
  }

  // Rampas de los bombos a la bandeja, y la bandeja.
  const chutes = [big, small].map((b, k) => {
    const from = b.def.pos.clone().add(new Vector3(k ? -0.3 : 0.4, -b.def.r - 0.05, 0.4))
    const to = TRAY.clone().add(new Vector3(k ? 0.95 : -0.95, BALL_R + 0.05, 0))
    const mid = from.clone().lerp(to, 0.5)
    mid.y = Math.min(from.y, to.y) - 0.1
    const curve = new CatmullRomCurve3([from, from.clone().add(new Vector3(0, -0.6, 0.3)), mid, to])
    const tube = new Mesh(keep(new TubeGeometry(curve, 40, 0.5, 12, false)), keep(new MeshPhysicalMaterial({ color: '#ffe6a8', transparent: true, opacity: 0.18, roughness: 0.05, side: DoubleSide, depthWrite: false })))
    scene.add(tube)
    const rim = new Mesh(keep(new TubeGeometry(curve, 40, 0.06, 6, false)), gold)
    rim.position.y = -0.48
    scene.add(rim)
    return curve
  })
  const tray = new Mesh(keep(new CylinderGeometry(2.2, 1.6, 0.4, 48)), gold)
  tray.position.copy(TRAY).add(new Vector3(0, -0.2, 0))
  tray.receiveShadow = true
  scene.add(tray)
  const pedestal = new Mesh(keep(new CylinderGeometry(0.7, 1.1, TRAY.y - 0.4, 24)), wood)
  pedestal.position.set(TRAY.x, (TRAY.y - 0.4) / 2, TRAY.z)
  scene.add(pedestal)

  // Las dos bolas cantadas (número y premio): ruedan por su rampa y se quedan en la bandeja.
  const ballGeo = keep(new SphereGeometry(BALL_R, 40, 20))
  const sungBalls = [0, 1].map((k) => {
    const m = new Mesh(ballGeo, new MeshStandardMaterial({ roughness: 0.3, metalness: k ? 0.5 : 0 }))
    m.castShadow = true
    m.visible = false
    scene.add(m)
    return { mesh: m, t: 1, curve: chutes[k] }
  })
  const halo = new Mesh(keep(new SphereGeometry(BALL_R * 1.6, 24, 12)), keep(new MeshBasicMaterial({ color: new Color(2, 1.6, 0.5), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false })))
  scene.add(halo)

  // Confeti.
  const CONF = reduced ? 0 : 400
  const confetti = new InstancedMesh(keep(new PlaneGeometry(0.18, 0.28)), keep(new MeshBasicMaterial({ side: DoubleSide, color: '#ffffff' })), Math.max(1, CONF))
  confetti.frustumCulled = false
  confetti.count = 0
  const conf = Array.from({ length: CONF }, () => ({ p: new Vector3(), v: new Vector3(), r: new Vector3(), w: new Vector3(), life: 0 }))
  const confColors = ['#ffd34a', '#ff3b4a', '#ffffff', '#3ddc84', '#f0c04e']
  conf.forEach((_, i) => confetti.setColorAt(i, new Color(confColors[i % confColors.length]).multiplyScalar(1.3)))
  scene.add(confetti)
  let confOn = false
  function throwConfetti() {
    if (!CONF) return
    confOn = true
    const R = Math.random
    conf.forEach((c) => {
      c.p.set((R() - 0.5) * 26, 15 + R() * 6, (R() - 0.5) * 10)
      c.v.set((R() - 0.5) * 2, -2 - R() * 3, (R() - 0.5) * 2)
      c.r.set(R() * TAU, R() * TAU, R() * TAU)
      c.w.set((R() - 0.5) * 8, (R() - 0.5) * 8, (R() - 0.5) * 8)
      c.life = 0
    })
  }

  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(prCap)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.55, 0.5, 0.88)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  function resize() {
    const rect = host.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.fov = w / h < 1 ? 58 : 40
    camera.updateProjectionMatrix()
  }
  resize()

  // ---------- animación ----------
  let lastReal = performance.now()
  let elapsed = 0
  let lastSung = 0
  let cantoAt = -10
  let dim = 0
  let wasHit = false
  let wasWin = false
  const camPos = new Vector3()
  const camLook = new Vector3()
  const wantPos = new Vector3()
  const wantLook = new Vector3()
  let first = true
  const tmp = new Vector3()
  const mat4 = new Matrix4()
  const textures = []

  function setBall(k, text) {
    const b = sungBalls[k]
    const tex = ballTexture(text, k === 1)
    textures.push(tex)
    if (textures.length > 8) textures.shift().dispose()
    b.mesh.material.map = tex
    b.mesh.material.needsUpdate = true
    b.mesh.visible = true
    b.t = reduced ? 1 : 0
  }

  function draw(fr) {
    const { spinning, fast, sung, current, hit, done, win } = fr
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastReal) / 1000))
    lastReal = now
    elapsed += dt

    // Bombos.
    const speed = spinning ? (fast ? 9 : 4.5) : 0.25
    updateBombo(big, dt, reduced ? 0 : speed)
    updateBombo(small, dt, reduced ? 0 : -speed * 1.3)

    // Bolas cantadas.
    if (sung !== lastSung) {
      if (sung === 0 || !current) {
        for (const b of sungBalls) b.mesh.visible = false
      } else {
        setBall(0, fmtNumber(current.number))
        setBall(1, PRIZE_SHORT[current.prize] ?? '')
        cantoAt = elapsed
      }
      lastSung = sung
    }
    for (const b of sungBalls) {
      if (!b.mesh.visible) continue
      b.t = Math.min(1, b.t + dt / 0.55)
      const k = b.t * b.t
      b.curve.getPointAt(k, tmp)
      b.mesh.position.copy(tmp)
      if (b.t >= 1) b.mesh.position.y += Math.abs(Math.sin((elapsed - cantoAt) * 9)) * 0.12 * Math.max(0, 1 - (elapsed - cantoAt - 0.55) * 2)
      // Al llegar, la bola se gira para enseñar el número.
      b.mesh.rotation.set(0, (1 - b.t) * 6, (1 - b.t) * 4)
      b.mesh.scale.setScalar(1 + smooth(0.85, 1, b.t) * 0.9) // en la bandeja, más grande para que se lea
      if (b.t >= 1) b.mesh.position.y += BALL_R * 0.9
    }
    halo.position.copy(sungBalls[0].mesh.position)
    halo.material.opacity = hit ? 0.12 + 0.08 * Math.sin(elapsed * 8) : 0
    halo.scale.setScalar(sungBalls[0].mesh.scale.x)

    // Luces: para el Gordo (último canto) se apaga la sala y solo queda el foco del bombo grande.
    const suspense = spinning && fast
    dim += ((suspense ? 1 : 0) - dim) * (1 - Math.exp(-dt * 2.5))
    hemi.intensity = 0.3 * (1 - dim * 0.75)
    front.intensity = 18 * (1 - dim * 0.8)
    spots[1].intensity = 600 * (1 - dim * 0.85)
    spots[2].intensity = 500 * (1 - dim * 0.6)
    spots[0].intensity = 900 * (1 + dim * 0.5)
    beamMat.opacity = 0.03 + dim * 0.03
    beams[1].visible = dim < 0.8

    // Confeti: si sale tu número y al acabar con premio.
    if (hit && !wasHit) throwConfetti()
    if (done && win && !wasWin) throwConfetti()
    wasHit = hit
    wasWin = done && win
    if (confOn) {
      let alive = 0
      conf.forEach((c, i) => {
        c.life += dt
        c.v.y = Math.max(-3.5, c.v.y - dt * 2)
        c.p.addScaledVector(c.v, dt)
        c.p.x += Math.sin(elapsed * 2 + i) * dt * 0.8
        c.r.addScaledVector(c.w, dt)
        if (c.p.y > -0.5) alive++
        tmp.set(c.r.x, c.r.y, c.r.z)
        dummy.position.copy(c.p)
        dummy.rotation.set(c.r.x, c.r.y, c.r.z)
        dummy.updateMatrix()
        confetti.setMatrixAt(i, dummy.matrix)
      })
      confetti.count = CONF
      confetti.instanceMatrix.needsUpdate = true
      if (!alive) {
        confOn = false
        confetti.count = 0
      }
    }
    void mat4

    // Bombillas de la embocadura.
    for (let i = 0; i < bulbPos.length; i++) {
      const on = reduced ? 1 : Math.sin(elapsed * 3 + i * 0.9) > 0 ? 1 : 0.35
      bulbs.setColorAt(i, bulbTmp.copy(bulbBase[i]).multiplyScalar(on * (1 - dim * 0.6)))
    }
    bulbs.instanceColor.needsUpdate = true

    // Cámara: el escenario entero; para el Gordo se acerca al bombo grande; en cada canto, un poco a la bandeja.
    const portrait = camera.aspect < 1
    // El escenario va en la mitad de arriba: abajo quedan el décimo y la lista (HTML).
    wantPos.set(0, portrait ? 9 : 8, portrait ? 34 : 27)
    wantLook.set(0, portrait ? 4.4 : 4.6, 0)
    if (suspense) {
      wantPos.lerp(tmp.set(BIG.pos.x * 0.6, BIG.pos.y + 0.5, 12), 0.7)
      wantLook.lerp(BIG.pos, 0.7)
    } else if (elapsed - cantoAt < 1.4 && sung > 0) {
      const k = smooth(0, 0.3, elapsed - cantoAt) * (1 - smooth(1.0, 1.4, elapsed - cantoAt))
      wantPos.lerp(tmp.set(TRAY.x, TRAY.y + 3.5, TRAY.z + 10), k * 0.35)
      wantLook.lerp(TRAY, k * 0.35)
    }
    if (!reduced) {
      wantPos.x += Math.sin(elapsed * 0.2) * 0.8
      wantPos.y += Math.sin(elapsed * 0.27) * 0.2
    }
    if (first) {
      camPos.copy(wantPos)
      camLook.copy(wantLook)
      first = false
    }
    const k = 1 - Math.exp(-dt * 2.2)
    camPos.lerp(wantPos, k)
    camLook.lerp(wantLook, k)
    camera.position.copy(camPos)
    camera.lookAt(camLook)

    composer.render(dt)
  }

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost)
    textures.forEach((t) => t.dispose())
    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else m?.dispose?.()
    })
    disposables.forEach((x) => x.dispose?.())
    composer.dispose?.()
    bloom.dispose?.()
    renderer.dispose()
    canvas.remove()
  }

  return { draw, resize, destroy }
}
