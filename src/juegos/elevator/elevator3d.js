// El Ascensor en 3D (three.js): un ascensor panorámico de cristal en la fachada de un rascacielos, de noche en Navidad.
// Se carga aparte (import dinámico desde Elevator.jsx); sin WebGL, la pantalla usa la escena CSS de siempre
// (ElevatorView.jsx). Solo dibuja: lo que pasa lo dice el servidor y Elevator.jsx lo pasa en cada frame.
//
// - La cabina sube por su hueco con los pasajeros dentro; en cada planta abre las puertas junto a su balcón, donde se
//   quedan los que se bajan (con el número y el multiplicador pintados en la pared).
// - Nunca llega a una planta que el servidor no ha confirmado: como mucho avanza un poco hacia ella (el cable se rompe
//   «yendo hacia» esa planta, así que la caída sale de ahí).
// - Si se rompe el cable: chispas, luz de emergencia, la cabina cae y levanta polvo. Si llega a la azotea: fuegos.
//
// frame: { t, round, pov, here, confirmed, done, crash, roof, waiting, doorsOpen, tense, inside, outAt }
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { FLOORS, MULTS, fmtMult, phaseAt, rideEnd } from './elevator.js'

const TAU = Math.PI * 2
const FLOOR_H = 4.4
const TOWER_W = 30
const TOWER_D = 20
const TOWER_H = (FLOORS + 1) * FLOOR_H + 1
const FACE_Z = TOWER_D / 2 // la fachada donde va el ascensor
const SHAFT_X = 3
const CAB_W = 3.6
const CAB_H = 3.5
const CAB_D = 3.0
const CAB_Z = FACE_Z + CAB_D / 2 + 0.5
// Rellanos: delante de las puertas de la cabina en cada planta (al abrir, se sale a ellos).
const PLAT_W = 6.4
const PLAT_D = 3.6
const PLAT_Z = CAB_Z + CAB_D / 2 + 0.12 + PLAT_D / 2
const EYE = 1.65 // altura de los ojos dentro de la cabina
const GRAVITY = 46
const BULBS = ['#ff3b4a', '#ffd34a', '#3ddc84', '#4aa8ff', '#ffffff', '#ff7ad1']

const clamp01 = (k) => Math.min(1, Math.max(0, k))
const mix = (a, b, k) => a + (b - a) * k
const smooth = (a, b, x) => {
  const k = clamp01((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}
const hueOf = (name = '') => [...name].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) % 360, 17)
const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w][0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
function rng(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}
const floorY = (f) => f * FLOOR_H

function canvasTex(w, h, paint, repeat) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d'), w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(...repeat)
  }
  return t
}
// Ventanas de oficina: la mayoría encendidas en cálido, algunas apagadas o en azul de pantalla.
function windowsTexture(seed, lit = 0.62) {
  const R = rng(seed)
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0b0f18'
    g.fillRect(0, 0, w, h)
    const cols = 8
    const rows = 8
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const on = R() < lit
        g.fillStyle = on ? (R() < 0.15 ? '#9fd0ff' : R() < 0.5 ? '#ffd9a0' : '#ffeccb') : '#161c28'
        g.globalAlpha = on ? 0.75 + R() * 0.25 : 1
        g.fillRect(x * 32 + 5, y * 32 + 6, 22, 20)
      }
    }
    g.globalAlpha = 1
  })
}
const glowTexture = () =>
  canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.3, 'rgba(255,255,255,0.4)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 128, 128)
  })
// Mancha oscura y suave: la sombra de un pasajero sobre el suelo (sin sombras de verdad, que en móvil cuestan).
const blobTexture = () =>
  canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(0,0,0,0.65)')
    r.addColorStop(0.6, 'rgba(0,0,0,0.25)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  })
// Reflejos del cristal: dos bandas diagonales muy tenues sobre transparente (no vela la vista, solo da sensación de vidrio).
const glassTexture = () =>
  canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = 'rgba(170,205,255,0.05)'
    g.fillRect(0, 0, w, h)
    for (const [x, wd, a] of [[0.22, 0.1, 0.1], [0.4, 0.035, 0.07], [0.78, 0.06, 0.06]]) {
      const gr = g.createLinearGradient((x - wd) * w, 0, (x + wd) * w, 0)
      gr.addColorStop(0, 'rgba(210,230,255,0)')
      gr.addColorStop(0.5, `rgba(225,240,255,${a})`)
      gr.addColorStop(1, 'rgba(210,230,255,0)')
      g.save()
      g.translate(w / 2, h / 2)
      g.rotate(-0.35)
      g.translate(-w / 2, -h / 2)
      g.fillStyle = gr
      g.fillRect(-w, -h, w * 3, h * 3)
      g.restore()
    }
  })
// Suelo de mármol: damero crema y grafito con una cenefa dorada.
const marbleTexture = () =>
  canvasTex(512, 448, (g, w, h) => {
    const R = rng(3)
    const n = 8
    const cw = w / n
    const ch = h / 7
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < n; x++) {
        const l = (x + y) % 2 ? 34 : 66
        g.fillStyle = `hsl(32 7% ${l + R() * 6}%)`
        g.fillRect(x * cw, y * ch, cw, ch)
      }
    }
    g.strokeStyle = '#d4ab52'
    g.lineWidth = 8
    g.strokeRect(14, 14, w - 28, h - 28)
  })
// El cartel de cada planta: número grande y multiplicador.
function floorSign(f) {
  return canvasTex(256, 160, (g) => {
    g.fillStyle = 'rgba(10, 14, 22, 0.92)'
    g.beginPath()
    g.roundRect(6, 6, 244, 148, 18)
    g.fill()
    g.strokeStyle = f >= FLOORS ? '#5fd38d' : '#ffd25e'
    g.lineWidth = 6
    g.stroke()
    g.fillStyle = '#fff6e0'
    g.font = '800 84px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(f === 0 ? 'PB' : f >= FLOORS ? 'AZ' : String(f), 128, 66)
    g.fillStyle = f >= FLOORS ? '#5fd38d' : '#ffd25e'
    g.font = '700 34px system-ui, sans-serif'
    g.fillText(fmtMult(MULTS[f]), 128, 126)
  })
}

// Un pasajero como recorte: cabeza (foto o iniciales) y cuerpo de su color.
function personTexture(p, onReady) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 192
  const g = c.getContext('2d')
  const hue = hueOf(p.name)
  const paint = (img) => {
    g.clearRect(0, 0, 128, 192)
    // Cuerpo.
    const body = g.createLinearGradient(26, 0, 102, 0)
    body.addColorStop(0, `hsl(${hue} 32% 22%)`)
    body.addColorStop(0.4, `hsl(${hue} 34% 36%)`)
    body.addColorStop(1, `hsl(${hue} 30% 20%)`)
    g.fillStyle = body
    g.beginPath()
    g.roundRect(26, 92, 76, 96, [34, 34, 10, 10])
    g.fill()
    g.fillStyle = `hsl(${hue} 30% 16%)`
    g.fillRect(42, 150, 16, 42)
    g.fillRect(70, 150, 16, 42)
    // Cabeza.
    g.save()
    g.beginPath()
    g.arc(64, 52, 40, 0, TAU)
    g.closePath()
    if (p.me) {
      g.lineWidth = 10
      g.strokeStyle = '#ffd25e'
      g.stroke()
    }
    g.clip()
    if (img) g.drawImage(img, 24, 12, 80, 80)
    else {
      g.fillStyle = `hsl(${hue} 38% 40%)`
      g.fillRect(24, 12, 80, 80)
      g.fillStyle = '#e9e6ef'
      g.font = '800 34px system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(initials(p.name), 64, 54)
    }
    g.restore()
    // Sombreado de arriba abajo: la cabeza y el cuerpo reciben la luz del techo, no son un pegatina plana.
    g.globalCompositeOperation = 'source-atop'
    const sh = g.createLinearGradient(0, 0, 0, 192)
    sh.addColorStop(0, 'rgba(255,240,215,0.1)')
    sh.addColorStop(1, 'rgba(0,0,10,0.4)')
    g.fillStyle = sh
    g.fillRect(0, 0, 128, 192)
    g.globalCompositeOperation = 'source-over'
  }
  paint(null)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  if (p.avatar) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => {
      try {
        paint(img)
        tex.needsUpdate = true
        onReady?.()
      } catch {
        paint(null) // la foto no deja leerse (CORS): se quedan las iniciales
      }
    }
    img.src = p.avatar
  }
  return tex
}

// Partículas sencillas (chispas, polvo, fuegos): puntos con color, tamaño y vida.
function makeParticles(cap, additive) {
  const S = 13 // x y z vx vy vz life max size r g b grav
  const data = new Float32Array(cap * S)
  const pos = new Float32Array(cap * 3)
  const col = new Float32Array(cap * 3)
  const size = new Float32Array(cap)
  const alpha = new Float32Array(cap)
  const geo = new BufferGeometry()
  for (const [name, arr, n] of [['position', pos, 3], ['aColor', col, 3], ['aSize', size, 1], ['aAlpha', alpha, 1]]) {
    geo.setAttribute(name, new BufferAttribute(arr, n).setUsage(DynamicDrawUsage))
  }
  geo.setDrawRange(0, 0)
  const material = new ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uScale / -mv.z); vC = aColor; vA = aAlpha; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
      gl_FragColor = vec4(vC, ${additive ? '(1.0 - d) * (1.0 - d)' : 'smoothstep(1.0, 0.2, d) * 0.8'} * vA); }`,
    transparent: true,
    depthWrite: false,
    ...(additive ? { blending: AdditiveBlending } : {}),
  })
  const points = new Points(geo, material)
  points.frustumCulled = false
  let n = 0
  return {
    points,
    spawn(x, y, z, vx, vy, vz, life, s, c, grav = 0) {
      if (n >= cap) return
      data.set([x, y, z, vx, vy, vz, 0, life, s, c[0], c[1], c[2], grav], n * S)
      n++
    },
    update(dt) {
      let i = 0
      while (i < n) {
        const o = i * S
        data[o + 6] += dt
        if (data[o + 6] >= data[o + 7]) {
          n--
          if (i !== n) data.copyWithin(o, n * S, n * S + S)
          continue
        }
        data[o + 4] += data[o + 12] * dt
        data[o] += data[o + 3] * dt
        data[o + 1] += data[o + 4] * dt
        data[o + 2] += data[o + 5] * dt
        const k = data[o + 6] / data[o + 7]
        pos.set([data[o], data[o + 1], data[o + 2]], i * 3)
        col.set([data[o + 9], data[o + 10], data[o + 11]], i * 3)
        size[i] = data[o + 8] * (additive ? 1 - k * 0.5 : 0.6 + k)
        alpha[i] = 1 - k
        i++
      }
      geo.setDrawRange(0, n)
      for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) geo.attributes[name].needsUpdate = true
    },
    clear() {
      n = 0
      geo.setDrawRange(0, 0)
    },
  }
}

export function createElevator3D(host, { reduced = false, onFail } = {}) {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const prCap = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
  const renderer = new WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' })
  renderer.setPixelRatio(prCap)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  const canvas = renderer.domElement
  canvas.className = 'el3d__gl'
  const onLost = (event) => {
    event.preventDefault()
    onFail?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)
  const root = document.createElement('div')
  root.className = 'el3d'
  root.innerHTML = '<div class="el3d__vig"></div><div class="el3d__alarm"></div>'
  root.prepend(canvas)
  host.appendChild(root)
  const elAlarm = root.querySelector('.el3d__alarm')

  const scene = new Scene()
  scene.background = new Color('#05070f')
  scene.fog = new Fog('#0a1024', 60, 260)
  const camera = new PerspectiveCamera(46, 16 / 10, 0.3, 900)
  const disposables = []
  const keep = (x) => {
    disposables.push(x)
    return x
  }

  // Luces de noche: luna fría, ambiente azul y el brillo cálido de la ciudad desde abajo.
  const moon = new DirectionalLight('#b9c8ff', 0.9)
  moon.position.set(-40, 90, 60)
  scene.add(moon, new HemisphereLight('#4a5b9a', '#3a2414', 0.55), new AmbientLight('#ffffff', 0.08))

  // Cielo con estrellas.
  const sky = new Mesh(
    keep(new SphereGeometry(500, 32, 16)),
    keep(
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `varying vec3 vP;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main(){ float h = vP.y;
            vec3 c = mix(vec3(0.05, 0.05, 0.12), vec3(0.008, 0.012, 0.05), smoothstep(0.0, 0.6, h));
            c += vec3(0.35, 0.18, 0.12) * exp(-abs(h) * 9.0) * 0.5;
            vec3 g = floor(vP * 420.0); float s = step(0.9975, hash(g)) * smoothstep(0.05, 0.3, h);
            c += vec3(s);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    ),
  )
  scene.add(sky)
  const moonDisc = new Sprite(keep(new SpriteMaterial({ map: keep(glowTexture()), color: new Color(1.4, 1.45, 1.7), fog: false, depthWrite: false })))
  moonDisc.position.set(-160, 190, -320)
  moonDisc.scale.setScalar(70)
  scene.add(moonDisc)

  // Suelo nevado y la ciudad alrededor.
  const ground = new Mesh(keep(new PlaneGeometry(900, 900).rotateX(-Math.PI / 2)), keep(new MeshStandardMaterial({ color: '#c7d2e6', roughness: 0.95 })))
  ground.position.y = -0.05
  scene.add(ground)
  const street = new Mesh(keep(new PlaneGeometry(900, 14).rotateX(-Math.PI / 2)), keep(new MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.8 })))
  street.position.set(0, 0, FACE_Z + 22)
  scene.add(street)
  {
    const R = rng(4)
    const tex = keep(windowsTexture(11, 0.45))
    const mat = keep(new MeshStandardMaterial({ color: '#1a2132', emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.9, map: tex, roughness: 0.8 }))
    const geo = keep(new BoxGeometry(1, 1, 1))
    geo.translate(0, 0.5, 0)
    const N = 90
    const city = new InstancedMesh(geo, mat, N)
    const m = new Matrix4()
    let k = 0
    while (k < N) {
      const a = R() * TAU
      const r = 70 + R() * 220
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (z > FACE_Z && Math.abs(x) < 70 && z < FACE_Z + 60) continue
      const w = 14 + R() * 22
      const h = 12 + R() ** 2 * 110
      m.makeScale(w, h, 14 + R() * 20)
      m.setPosition(x, 0, z)
      city.setMatrixAt(k++, m)
    }
    scene.add(city)
  }

  // Luces de las calles a lo lejos (farolas y tráfico sobre una cuadrícula): dan profundidad al mirar hacia abajo desde arriba.
  const streetMat = keep(
    new ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize; uniform float uScale; varying vec3 vC;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 9.0); vC = aColor * (0.45 + 0.55 * smoothstep(520.0, 120.0, -mv.z)); }`,
      fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vC, (1.0 - d) * (1.0 - d)); }',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  )
  {
    const R = rng(21)
    const N = reduced ? 900 : 2200
    const pos = new Float32Array(N * 3)
    const col = new Float32Array(N * 3)
    const size = new Float32Array(N)
    const c = new Color()
    for (let i = 0; i < N; i++) {
      const a = R() * TAU
      const r = 55 + R() ** 0.7 * 380
      let x = Math.cos(a) * r
      let z = Math.sin(a) * r
      // Pegadas a las calles de una cuadrícula de 28 m.
      if (R() < 0.5) x = Math.round(x / 28) * 28 + (R() - 0.5) * 2
      else z = Math.round(z / 28) * 28 + (R() - 0.5) * 2
      if (Math.abs(x) < 24 && z > -16 && z < FACE_Z + 30) z = -z - 40
      pos.set([x, 0.5 + R() * R() * 14, z], i * 3)
      c.setHSL(R() < 0.7 ? 0.09 + R() * 0.04 : 0.55 + R() * 0.1, 0.7, 0.5).multiplyScalar(0.55 + R() * 0.6)
      col.set([c.r, c.g, c.b], i * 3)
      size[i] = 0.7 + R() * 1.1
    }
    const g = keep(new BufferGeometry())
    g.setAttribute('position', new BufferAttribute(pos, 3))
    g.setAttribute('aColor', new BufferAttribute(col, 3))
    g.setAttribute('aSize', new BufferAttribute(size, 1))
    const lights = new Points(g, streetMat)
    lights.frustumCulled = false
    scene.add(lights)
  }

  // La torre: fachada con ventanas, cornisa en cada planta, luces de Navidad en las esquinas y árbol en la azotea.
  const towerTex = keep(windowsTexture(7, 0.7))
  towerTex.wrapS = towerTex.wrapT = RepeatWrapping
  towerTex.repeat.set(4, FLOORS + 1)
  const towerMat = keep(new MeshStandardMaterial({ color: '#1c2335', map: towerTex, emissive: '#ffffff', emissiveMap: towerTex, emissiveIntensity: 0.32, roughness: 0.6, metalness: 0.2 }))
  const tower = new Mesh(keep(new BoxGeometry(TOWER_W, TOWER_H, TOWER_D)), towerMat)
  tower.position.set(0, TOWER_H / 2, 0)
  scene.add(tower)
  const slabMat = keep(new MeshStandardMaterial({ color: '#7e8596', roughness: 0.55, metalness: 0.3 }))
  const slabGeo = keep(new BoxGeometry(TOWER_W + 0.6, 0.35, TOWER_D + 0.6))
  for (let f = 1; f <= FLOORS + 1; f++) {
    const s = new Mesh(slabGeo, slabMat)
    s.position.y = floorY(f) - 0.1
    scene.add(s)
  }
  // Luces de Navidad por las aristas de la fachada.
  const bulbPos = []
  for (let y = 1; y < TOWER_H; y += 1.1) {
    bulbPos.push([-TOWER_W / 2 - 0.35, y, FACE_Z + 0.35], [TOWER_W / 2 + 0.35, y, FACE_Z + 0.35])
  }
  for (let x = -TOWER_W / 2; x <= TOWER_W / 2; x += 1.1) bulbPos.push([x, TOWER_H + 0.2, FACE_Z + 0.35])
  const bulbs = new InstancedMesh(keep(new SphereGeometry(0.17, 8, 6)), keep(new MeshBasicMaterial({ color: '#ffffff' })), bulbPos.length)
  const bulbBase = bulbPos.map((_, i) => new Color(BULBS[i % BULBS.length]).multiplyScalar(3))
  bulbPos.forEach(([x, y, z], i) => {
    bulbs.setMatrixAt(i, new Matrix4().setPosition(x, y, z))
    bulbs.setColorAt(i, bulbBase[i])
  })
  scene.add(bulbs)
  const bulbTmp = new Color()
  {
    const tree = new Group()
    const green = keep(new MeshStandardMaterial({ color: '#1d5a32', roughness: 0.8 }))
    for (let i = 0; i < 4; i++) {
      const c = new Mesh(keep(new ConeGeometry(4.2 - i * 0.9, 3.6, 16)), green)
      c.position.y = 2 + i * 2
      tree.add(c)
    }
    const star = new Mesh(keep(new IcosahedronGeometry(0.7, 0)), keep(new MeshBasicMaterial({ color: new Color('#ffd34a').multiplyScalar(4) })))
    star.position.y = 9.6
    tree.add(star)
    tree.position.set(7, TOWER_H, 0)
    scene.add(tree)
  }

  // El hueco: dos guías de acero y vigas en cada planta. El cable baja desde la polea de la azotea.
  const steel = keep(new MeshStandardMaterial({ color: '#9aa6b5', metalness: 0.9, roughness: 0.35 }))
  for (const dx of [-CAB_W / 2 - 0.35, CAB_W / 2 + 0.35]) {
    const rail = new Mesh(keep(new BoxGeometry(0.28, TOWER_H + 3, 0.28)), steel)
    rail.position.set(SHAFT_X + dx, (TOWER_H + 3) / 2, CAB_Z - CAB_D / 2 - 0.1)
    scene.add(rail)
  }
  const beamGeo = keep(new BoxGeometry(CAB_W + 1, 0.18, 0.18))
  for (let f = 0; f <= FLOORS + 1; f++) {
    const b = new Mesh(beamGeo, steel)
    b.position.set(SHAFT_X, floorY(f) + CAB_H + 0.35, CAB_Z - CAB_D / 2 - 0.1)
    scene.add(b)
  }
  const recess = new Mesh(keep(new BoxGeometry(CAB_W + 2.2, TOWER_H, 0.3)), keep(new MeshStandardMaterial({ color: '#0c0f16', roughness: 0.4, metalness: 0.6 })))
  recess.position.set(SHAFT_X, TOWER_H / 2, FACE_Z + 0.1)
  scene.add(recess)
  const pulley = new Mesh(keep(new CylinderGeometry(0.9, 0.9, 0.5, 24).rotateX(Math.PI / 2)), steel)
  pulley.position.set(SHAFT_X, TOWER_H + 2.4, CAB_Z)
  scene.add(pulley)
  const cableMat = keep(new MeshStandardMaterial({ color: '#2b2f36', metalness: 0.8, roughness: 0.4 }))
  const cable = new Mesh(keep(new CylinderGeometry(0.06, 0.06, 1, 6)), cableMat)
  scene.add(cable)

  // Rellanos delante de las puertas: losa, barandilla de cristal con pasamanos dorado, dos faroles y el cartel de la planta.
  const landingGeo = keep(new BoxGeometry(PLAT_W, 0.3, PLAT_D))
  const glassRail = keep(new MeshBasicMaterial({ color: '#8fb8e8', transparent: true, opacity: 0.12, depthWrite: false, fog: false }))
  const railFront = keep(new BoxGeometry(PLAT_W, 1.05, 0.05))
  const railSide = keep(new BoxGeometry(0.05, 1.05, PLAT_D))
  const barFront = keep(new BoxGeometry(PLAT_W + 0.1, 0.07, 0.09))
  const barSide = keep(new BoxGeometry(0.09, 0.07, PLAT_D))
  const handGold = keep(new MeshStandardMaterial({ color: '#d4ab52', metalness: 0.9, roughness: 0.3 }))
  const lampGeo = keep(new SphereGeometry(0.13, 10, 8))
  const lampMat = keep(new MeshBasicMaterial({ color: new Color('#ffe2a8').multiplyScalar(3) }))
  for (let f = 0; f <= FLOORS; f++) {
    const y = floorY(f)
    if (f > 0) {
      const slab = new Mesh(landingGeo, slabMat)
      slab.position.set(SHAFT_X, y - 0.15, PLAT_Z)
      scene.add(slab)
      const front = new Mesh(railFront, glassRail)
      front.position.set(SHAFT_X, y + 0.52, PLAT_Z + PLAT_D / 2)
      const bar = new Mesh(barFront, handGold)
      bar.position.set(SHAFT_X, y + 1.06, PLAT_Z + PLAT_D / 2)
      scene.add(front, bar)
      for (const side of [-1, 1]) {
        const r = new Mesh(railSide, glassRail)
        r.position.set(SHAFT_X + (side * PLAT_W) / 2, y + 0.52, PLAT_Z)
        const b = new Mesh(barSide, handGold)
        b.position.set(SHAFT_X + (side * PLAT_W) / 2, y + 1.06, PLAT_Z)
        const lamp = new Mesh(lampGeo, lampMat)
        lamp.position.set(SHAFT_X + (side * PLAT_W) / 2, y + 1.2, PLAT_Z + PLAT_D / 2)
        scene.add(r, b, lamp)
      }
    }
    const sign = new Sprite(new SpriteMaterial({ map: floorSign(f), depthWrite: false }))
    sign.position.set(SHAFT_X - PLAT_W / 2 + 1.05, y + 1.75, PLAT_Z + PLAT_D / 2 - 0.15)
    sign.scale.set(1.6, 1.0, 1)
    scene.add(sign)
  }

  // La cabina: suelo, techo con luz, marco de acero, paredes de cristal y dos puertas que se abren.
  const cab = new Group()
  scene.add(cab)
  // Cristal sin brillo especular ni clearcoat (con la luz de la cabina y el bloom velaba la ciudad): un tinte casi invisible
  // y unas bandas de reflejo diagonales muy suaves.
  const glassMap = keep(glassTexture())
  const glass = keep(new MeshBasicMaterial({ color: '#9fc4f0', map: glassMap, transparent: true, opacity: 0.55, depthWrite: false, fog: false }))
  const doorGlass = keep(new MeshBasicMaterial({ color: '#b4d6ff', map: glassMap, transparent: true, opacity: 0.5, depthWrite: false, fog: false }))
  const gold = keep(new MeshStandardMaterial({ color: '#d4ab52', metalness: 0.9, roughness: 0.3 }))
  {
    const floor = new Mesh(keep(new BoxGeometry(CAB_W, 0.25, CAB_D)), keep(new MeshStandardMaterial({ color: '#d8d2c8', map: keep(marbleTexture()), roughness: 0.28, metalness: 0.1 })))
    floor.position.y = 0.12
    const roof = new Mesh(keep(new BoxGeometry(CAB_W, 0.3, CAB_D)), steel)
    roof.position.y = CAB_H
    cab.add(floor, roof)
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new Mesh(keep(new BoxGeometry(0.2, CAB_H, 0.2)), gold)
      post.position.set((x * CAB_W) / 2, CAB_H / 2, (z * CAB_D) / 2)
      cab.add(post)
    }
    const backWall = new Mesh(keep(new BoxGeometry(CAB_W, CAB_H, 0.08)), keep(new MeshStandardMaterial({ color: '#6b3d22', roughness: 0.45, metalness: 0.1 })))
    backWall.position.set(0, CAB_H / 2, -CAB_D / 2)
    const mirror = new Mesh(keep(new PlaneGeometry(CAB_W - 0.8, 1.6)), keep(new MeshStandardMaterial({ color: '#c8d4e2', metalness: 1, roughness: 0.1 })))
    mirror.position.set(0, 2.2, -CAB_D / 2 + 0.05)
    cab.add(backWall, mirror)
    for (const [w, h, d, x, z] of [[0.04, CAB_H, CAB_D, -CAB_W / 2, 0], [0.04, CAB_H, CAB_D, CAB_W / 2, 0]]) {
      const pane = new Mesh(keep(new BoxGeometry(w, h, d)), glass)
      pane.position.set(x, CAB_H / 2, z)
      cab.add(pane)
    }
    const rail = new Mesh(keep(new BoxGeometry(CAB_W - 0.3, 0.06, 0.06)), gold)
    rail.position.set(0, 1.05, -CAB_D / 2 + 0.15)
    cab.add(rail)
    // Lujo visto desde dentro: zócalo de madera y pasamanos dorado en las paredes laterales, montantes de latón entre los
    // paneles de cristal, dintel y umbral en la entrada y focos en el techo.
    const wood = keep(new MeshStandardMaterial({ color: '#4a2a18', roughness: 0.4, metalness: 0.1 }))
    const kickGeo = keep(new BoxGeometry(0.06, 0.72, CAB_D - 0.1))
    const sideRailGeo = keep(new BoxGeometry(0.08, 0.07, CAB_D - 0.3))
    const mullionGeo = keep(new BoxGeometry(0.09, CAB_H - 0.3, 0.09))
    const transomGeo = keep(new BoxGeometry(0.07, 0.07, CAB_D))
    for (const sx of [-1, 1]) {
      const x = sx * (CAB_W / 2 - 0.02)
      const kick = new Mesh(kickGeo, wood)
      kick.position.set(x, 0.61, 0)
      const hand = new Mesh(sideRailGeo, gold)
      hand.position.set(sx * (CAB_W / 2 - 0.14), 1.05, 0)
      cab.add(kick, hand)
      for (const z of [-0.5, 0.5]) {
        const m = new Mesh(mullionGeo, gold)
        m.position.set(x, CAB_H / 2, z)
        cab.add(m)
      }
      const tr = new Mesh(transomGeo, gold)
      tr.position.set(x, 2.1, 0)
      cab.add(tr)
    }
    const lintel = new Mesh(keep(new BoxGeometry(CAB_W, 0.2, 0.16)), gold)
    lintel.position.set(0, CAB_H - 0.2, CAB_D / 2 - 0.02)
    const sill = new Mesh(keep(new BoxGeometry(CAB_W, 0.05, 0.22)), gold)
    sill.position.set(0, 0.27, CAB_D / 2 - 0.08)
    cab.add(lintel, sill)
    const spotGeo = keep(new CylinderGeometry(0.1, 0.1, 0.02, 12))
    const spotMat = keep(new MeshBasicMaterial({ color: new Color('#fff4d8').multiplyScalar(1.6) }))
    for (const [x, z] of [[-1, -0.8], [1, -0.8], [-1, 0.5], [1, 0.5], [0, -0.15]]) {
      const sp = new Mesh(spotGeo, spotMat)
      sp.position.set(x * 0.9, CAB_H - 0.2, z)
      cab.add(sp)
    }
  }
  // Contorno de luz de la cabina: se distingue de la fachada desde lejos.
  const ledMat = keep(new MeshBasicMaterial({ color: new Color('#ffd27a').multiplyScalar(2.4) }))
  for (const [w, h, d, x, yy, z] of [
    [CAB_W + 0.1, 0.07, 0.07, 0, CAB_H + 0.16, CAB_D / 2],
    [CAB_W + 0.1, 0.07, 0.07, 0, 0.02, CAB_D / 2],
    [0.07, CAB_H, 0.07, -CAB_W / 2 - 0.05, CAB_H / 2, CAB_D / 2],
    [0.07, CAB_H, 0.07, CAB_W / 2 + 0.05, CAB_H / 2, CAB_D / 2],
  ]) {
    const led = new Mesh(keep(new BoxGeometry(w, h, d)), ledMat)
    led.position.set(x, yy, z + 0.05)
    cab.add(led)
  }
  const lightPanel = new Mesh(keep(new PlaneGeometry(CAB_W - 0.6, CAB_D - 0.6).rotateX(Math.PI / 2)), keep(new MeshBasicMaterial({ color: new Color('#fff1d0').multiplyScalar(0.8) })))
  lightPanel.position.y = CAB_H - 0.17
  cab.add(lightPanel)
  const cabLight = new PointLight('#ffe7c2', 14, 12, 2)
  cabLight.position.y = CAB_H - 0.6
  cab.add(cabLight)
  const doors = [-1, 1].map((side) => {
    const d = new Mesh(keep(new BoxGeometry(CAB_W / 2, CAB_H - 0.3, 0.06)), doorGlass)
    d.position.set((side * CAB_W) / 4, CAB_H / 2, CAB_D / 2)
    const frame = new Mesh(keep(new BoxGeometry(0.06, CAB_H - 0.3, 0.1)), gold)
    frame.position.x = -side * (CAB_W / 4)
    d.add(frame)
    cab.add(d)
    return { mesh: d, side }
  })
  const people = new Group()
  cab.add(people)
  // El display de dentro, encima de las puertas (lo que se ve en primera persona).
  const dispCanvas = document.createElement('canvas')
  dispCanvas.width = 512
  dispCanvas.height = 192
  const dispTex = keep(new CanvasTexture(dispCanvas))
  dispTex.colorSpace = SRGBColorSpace
  const dispMat = keep(new MeshBasicMaterial({ map: dispTex, color: new Color(1.0, 1.0, 1.0) }))
  const disp = new Mesh(keep(new PlaneGeometry(1.7, 0.64)), dispMat)
  disp.rotation.y = Math.PI
  disp.scale.setScalar(0.82)
  disp.position.set(0, CAB_H - 1.0, CAB_D / 2 - 0.09)
  cab.add(disp)
  const dispFrame = new Mesh(keep(new BoxGeometry(1.86, 0.8, 0.05)), steel)
  dispFrame.scale.setScalar(0.82)
  dispFrame.position.set(0, CAB_H - 1.0, CAB_D / 2 - 0.05)
  cab.add(dispFrame)
  let dispKey = ''
  function paintDisplay(d) {
    const blink = Math.floor(elapsed * 2) % 2
    const key = d ? `${d.floor}|${d.moving}|${d.alarm}|${d.roof}|${Math.round((d.chance ?? 1) * 20)}|${blink}` : ''
    if (key === dispKey) return
    dispKey = key
    const g = dispCanvas.getContext('2d')
    g.fillStyle = '#0b0c0f'
    g.fillRect(0, 0, 512, 192)
    if (d) {
      const color = d.alarm ? '#ff4040' : d.roof ? '#7dffb2' : '#ffc24a'
      g.shadowColor = color
      g.shadowBlur = 18
      g.fillStyle = color
      g.textBaseline = 'middle'
      g.font = '700 46px ui-monospace, Menlo, Consolas, monospace'
      g.globalAlpha = d.moving ? (blink ? 1 : 0.45) : 0.15
      g.textAlign = 'left'
      g.fillText('▲', 30, 70)
      g.globalAlpha = d.alarm && blink ? 0.35 : 1
      g.textAlign = 'center'
      g.font = '800 104px ui-monospace, Menlo, Consolas, monospace'
      // Con la alarma, solo el aviso (el «!!» grande y el texto se pisaban).
      if (!d.alarm) g.fillText(d.floor === 0 ? 'PB' : d.floor >= FLOORS ? 'AZ' : String(d.floor), 230, 72)
      g.font = '700 34px ui-monospace, Menlo, Consolas, monospace'
      g.textAlign = 'right'
      if (d.alarm) {
        g.textAlign = 'center'
        g.font = '800 44px ui-monospace, Menlo, Consolas, monospace'
        g.fillText('FUERA DE SERVICIO', 256, 96)
      } else g.fillText(d.roof ? '¡AZOTEA!' : fmtMult(MULTS[Math.min(d.floor, FLOORS)]), 490, 72)
      g.globalAlpha = 1
      g.shadowBlur = 0
      if (d.chance != null && !d.alarm && !d.roof) {
        g.fillStyle = '#222'
        g.fillRect(30, 150, 452, 14)
        g.fillStyle = `hsl(${Math.round(d.chance * 120)} 80% 50%)`
        g.fillRect(30, 150, 452 * d.chance, 14)
      }
    }
    dispTex.needsUpdate = true
  }

  // Quien se bajó, en el rellano de su planta.
  const ledge = new Group()
  scene.add(ledge)

  // Pasajeros: un recorte por persona (se reaprovecha la textura mientras siga el mismo nombre).
  const texCache = new Map()
  const textureFor = (p) => {
    const key = `${p.name}|${p.avatar ?? ''}|${p.me ? 1 : 0}`
    if (!texCache.has(key)) texCache.set(key, personTexture(p))
    return texCache.get(key)
  }
  let insideKey = ''
  let ledgeKey = ''
  // Cada pasajero lleva un tinte propio (más apagado que el color puro) y, dentro de la cabina, una mancha de sombra en el suelo.
  const blobGeo = keep(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2))
  const blobMat = keep(new MeshBasicMaterial({ map: keep(blobTexture()), transparent: true, depthWrite: false, fog: false }))
  const PERSON_TINT = new Color('#bdb8c8')
  function setPeople(group, list, place, blobs = false) {
    for (const s of group.children) s.material?.dispose?.()
    group.clear()
    list.forEach((p, i) => {
      const s = new Sprite(new SpriteMaterial({ map: textureFor(p), transparent: true, color: PERSON_TINT.clone() }))
      s.scale.set(1.2, 1.8, 1)
      place(s, i, p)
      group.add(s)
      if (blobs) {
        const b = new Mesh(blobGeo, blobMat)
        b.position.set(s.position.x, 0.255, s.position.z)
        b.scale.set(s.scale.x * 1.1, 1, s.scale.x * 0.8)
        b.renderOrder = -1
        group.add(b)
      }
    })
  }
  // En primera persona, los demás van a tus lados (los de detrás no se ven).
  const FP_SLOTS = [
    [-1.3, 0.55],
    [1.3, 0.6],
    [-1.35, -0.25],
    [1.35, -0.3],
    [-0.95, -1.1],
    [0.95, -1.1],
  ]
  const SLOTS = [
    [-0.9, -0.6],
    [0.9, -0.6],
    [0, -0.85],
    [-1.25, 0.1],
    [1.25, 0.1],
    [-0.45, 0.25],
    [0.45, 0.25],
    [-1.3, -1.0],
    [1.3, -1.0],
  ]

  // Partículas: nieve (siempre), chispas y polvo (la caída) y fuegos (la azotea).
  const sparks = makeParticles(reduced ? 300 : 1400, true)
  const dust = makeParticles(reduced ? 120 : 500, false)
  scene.add(sparks.points, dust.points)
  const snowN = reduced ? 0 : 900
  const snowPos = new Float32Array(Math.max(1, snowN) * 3)
  {
    const R = rng(9)
    for (let i = 0; i < snowN; i++) snowPos.set([(R() - 0.5) * 70, R() * 50, (R() - 0.5) * 50], i * 3)
  }
  const snowGeo = keep(new BufferGeometry())
  snowGeo.setAttribute('position', new BufferAttribute(snowPos, 3).setUsage(DynamicDrawUsage))
  const snowMat = keep(
    new ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: 'uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, 0.16 * uScale / -mv.z); }',
      fragmentShader: 'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, (1.0 - d) * 0.8); }',
      transparent: true,
      depthWrite: false,
    }),
  )
  const snow = new Points(snowGeo, snowMat)
  snow.frustumCulled = false
  if (snowN) scene.add(snow)

  // Estelas de viento: rayitas verticales fijas en el mundo alrededor de la cabina; al subir o caer rápido se estiran y pasan
  // volando (da la velocidad que la nieve sola no da).
  const STREAKS = reduced ? 0 : 110
  const streakBase = []
  {
    const R2 = rng(33)
    for (let i = 0; i < STREAKS; i++) {
      const side = R2() < 0.5 ? -1 : 1
      streakBase.push([SHAFT_X + side * (2.4 + R2() * 7), R2() * 44, PLAT_Z + 2.5 + R2() * 12])
    }
  }
  const streakPos = new Float32Array(Math.max(1, STREAKS) * 6)
  const streakGeo = keep(new BufferGeometry())
  streakGeo.setAttribute('position', new BufferAttribute(streakPos, 3).setUsage(DynamicDrawUsage))
  const streakMat = keep(new LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, fog: false }))
  const streaks = new LineSegments(streakGeo, streakMat)
  streaks.frustumCulled = false
  streaks.visible = STREAKS > 0
  scene.add(streaks)

  // Postproceso: brillo para las luces de la ciudad, de Navidad y de la cabina.
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(prCap)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.45, 0.92)
  composer.addPass(bloom)
  // Efectos de pantalla de la caída: viñeta roja de emergencia, destello del golpe y oscurecimiento.
  const fx = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uRed: { value: 0 }, uDark: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uRed; uniform float uDark; uniform float uFlash; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); float v = smoothstep(0.2, 0.85, length(vUv - 0.5) * 1.5);
        c.rgb = mix(c.rgb, c.rgb * vec3(1.25, 0.55, 0.5), uRed * 0.35);
        c.rgb += vec3(0.7, 0.03, 0.02) * v * uRed;
        c.rgb *= 1.0 - v * uDark * 0.6;
        c.rgb = c.rgb * (1.0 - uDark) + vec3(uFlash); gl_FragColor = c; }`,
  })
  fx.enabled = false
  composer.addPass(fx)
  composer.addPass(new OutputPass())
  const buf = new Vector2()
  function resize() {
    const rect = host.getBoundingClientRect()
    const w = Math.max(1, Math.round(rect.width))
    const h = Math.max(1, Math.round(rect.height))
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()

  // ---------- animación ----------
  let lastReal = performance.now()
  let elapsed = 0
  let lastRound = null
  let cabY = 0
  let fallStart = null // instante real en que empezó la caída que se ve
  let fallFrom = 0
  let landed = false
  let shake = 0
  let landedAt = 0
  let prevY = 0
  let speed = 0 // velocidad vertical suavizada de la cabina (m/s)
  let fireworksAt = 0
  let shownRoof = false
  let first = true
  let aimYaw = 0
  let aimPitch = 0
  let lookYaw = 0
  let lookPitch = 0
  // Con el ratón se mira un poco alrededor.
  const onLook = (event) => {
    if (event.pointerType !== 'mouse') return
    const r = host.getBoundingClientRect()
    aimYaw = -((event.clientX - r.left) / r.width - 0.5) * 0.9
    aimPitch = -((event.clientY - r.top) / r.height - 0.5) * 0.45
  }
  const onLookOut = () => {
    aimYaw = 0
    aimPitch = 0
  }
  host.addEventListener('pointermove', onLook)
  host.addEventListener('pointerleave', onLookOut)
  const camPos = new Vector3()
  const camLook = new Vector3()
  const wantPos = new Vector3()
  const wantLook = new Vector3()
  const tmp = new Vector3()
  const R = Math.random

  function burst(x, y, z) {
    const hue = R()
    const c = new Color().setHSL(hue, 0.9, 0.6)
    for (let i = 0; i < 90; i++) {
      tmp.set(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(6 + R() * 6)
      sparks.spawn(x, y, z, tmp.x, tmp.y, tmp.z, 1.2 + R() * 0.8, 0.35, [c.r * 3, c.g * 3, c.b * 3], -6)
    }
  }

  function draw(fr) {
    const { t, round, pov, here, confirmed, done, crash, roof, waiting, doorsOpen, tense, inside, outAt } = fr
    const now = performance.now()
    const dt = Math.min(0.1, Math.max(0, (now - lastReal) / 1000))
    lastReal = now
    elapsed += dt
    if (round !== lastRound) {
      lastRound = round
      fallStart = null
      landed = false
      landedAt = 0
      shownRoof = false
      sparks.clear()
      dust.clear()
      cab.rotation.set(0, 0, 0)
      cab.scale.set(1, 1, 1)
    }

    // Altura de la cabina.
    const ph = phaseAt(t)
    const fallen = done && crash <= FLOORS
    let pos = 0
    if (waiting) pos = 0
    else if (roof) pos = FLOORS
    else if (ph.phase !== 'join') pos = Math.min(ph.pos, (confirmed ?? 0) + 0.55)
    let y = floorY(pos)
    if (fallen && !waiting) {
      const fellAt = rideEnd(round, crash)
      if (fallStart === null) {
        // Si ya hacía rato que cayó (entras tarde), la cabina está abajo sin animación.
        fallStart = t - fellAt > 4000 ? -Infinity : elapsed
        fallFrom = Math.max(cabY, floorY(crash - 1))
        if (fallStart !== -Infinity && !reduced) {
          elAlarm.classList.remove('el3d__alarm--on')
          void elAlarm.offsetWidth
          elAlarm.classList.add('el3d__alarm--on')
        }
      }
      const s = fallStart === -Infinity ? 99 : elapsed - fallStart
      const hang = 0.35 // un instante colgando: crujido y chispas antes de caer
      const fall = Math.max(0, s - hang)
      y = Math.max(0.05, fallFrom - 0.5 * GRAVITY * fall * fall)
      if (s < hang) y = fallFrom + Math.sin(s * 80) * 0.05
      if (!reduced && fallStart !== -Infinity && y > 0.1 && s < 6) {
        for (let i = 0; i < 6; i++) {
          const sx = SHAFT_X + (i % 2 ? 1 : -1) * (CAB_W / 2 + 0.35)
          sparks.spawn(sx, y + 0.3, CAB_Z - CAB_D / 2, (R() - 0.5) * 6, 2 + R() * 6, 2 + R() * 4, 0.4 + R() * 0.5, 0.18, [3, 1.8 + R(), 0.6], -20)
        }
      }
      // Chispas que se ven por el cristal: saltan de las guías y los lados y, como la cabina cae, parecen subir a toda velocidad.
      if (!reduced && fallStart !== -Infinity && y > 0.1 && s < 6) {
        for (let i = 0; i < 5; i++) {
          const sx = SHAFT_X + (i % 2 ? 1 : -1) * (CAB_W / 2 + 0.15 + R() * 0.8)
          sparks.spawn(sx, y + 0.4 + R() * 2.6, CAB_Z - 0.6 + R() * 2.2, (i % 2 ? 1 : -1) * R() * 2, 2 + R() * 5, R() * 3, 0.35 + R() * 0.45, 0.14 + R() * 0.12, [3, 1.6 + R() * 1.2, 0.5], -18)
        }
      }
      if (y <= 0.05 && !landed) {
        landed = true
        landedAt = fallStart === -Infinity ? -Infinity : elapsed
        if (fallStart !== -Infinity) {
          shake = 1
          for (let i = 0; i < 120; i++) {
            dust.spawn(SHAFT_X + (R() - 0.5) * 4, 0.4, CAB_Z + (R() - 0.5) * 3, (R() - 0.5) * 14, R() * 4, (R() - 0.5) * 14, 2 + R() * 2, 1.4 + R() * 1.6, [0.3, 0.26, 0.25], -0.5)
          }
        }
      }
      // La cabina cae un poco ladeada y queda abollada.
      cab.rotation.z = smooth(0, 1.2, fall) * 0.06
      if (landed) cab.scale.y = 0.88
    }
    cabY = y
    cab.position.set(SHAFT_X, y, CAB_Z)
    if (tense && !reduced && !fallen) cab.position.x += Math.sin(elapsed * 47) * 0.025

    // Cable (se ve roto cuando cae).
    const top = TOWER_H + 2.4
    const cabTop = y + CAB_H + 0.2
    cable.visible = !fallen || waiting
    cable.scale.y = top - cabTop
    cable.position.set(SHAFT_X, (top + cabTop) / 2, CAB_Z)

    // Puertas y luz de la cabina (roja si cae, parpadea si el cable va justo).
    const open = doorsOpen ? 1 : 0
    for (const d of doors) {
      const target = (d.side * CAB_W) / 4 + d.side * open * (CAB_W / 2 - 0.15)
      d.mesh.position.x += (target - d.mesh.position.x) * (1 - Math.exp(-dt * 10))
    }
    if (fallen && !waiting) {
      const blink = Math.sin(elapsed * 14) > 0 ? 1 : 0.2
      cabLight.color.set('#ff2a2a')
      cabLight.intensity = 18 * blink
      lightPanel.material.color.setRGB(3 * blink, 0.2, 0.2)
      ledMat.color.setRGB(3 * blink, 0.15, 0.1)
    } else {
      const flicker = tense && !reduced && Math.random() < 0.06 ? 0.3 : 1
      cabLight.color.set('#ffe7c2')
      cabLight.intensity = 14 * flicker
      lightPanel.material.color.setRGB(0.8 * flicker, 0.76 * flicker, 0.66 * flicker)
      ledMat.color.setRGB(2.4 * flicker, 1.9 * flicker, 1.1 * flicker)
    }

    // Pasajeros en la cabina y en los balcones.
    const fp = pov === 'inside'
    const shown = fp ? inside.filter((p) => !p.me) : inside
    const inKey = `${fp}|${shown.map((p) => `${p.name}${p.me ? '*' : ''}`).join(',')}`
    if (inKey !== insideKey) {
      insideKey = inKey
      const slots = fp ? FP_SLOTS : SLOTS
      setPeople(people, shown.slice(0, slots.length), (s, i) => {
        if (fp) s.scale.set(0.82, 1.24, 1)
        s.position.set(slots[i][0], fp ? 0.25 + s.scale.y / 2 : 1.15, slots[i][1])
      }, fp)
    }
    paintDisplay(fr.disp)
    {
      const red = fallen && !waiting ? 1 : 0
      for (const c of people.children) if (c.isSprite) c.material.color.setRGB(mix(PERSON_TINT.r, 0.9, red * 0.5), mix(PERSON_TINT.g, 0.2, red * 0.7), mix(PERSON_TINT.b, 0.2, red * 0.7))
    }
    const out = []
    for (const [f, list] of outAt) list.forEach((p, i) => out.push({ p, f, i }))
    const outKey = out.map(({ p, f }) => `${p.name}@${f}`).join(',')
    if (outKey !== ledgeKey) {
      ledgeKey = outKey
      setPeople(
        ledge,
        out.map((o) => o.p),
        (s, k) => {
          const { f, i } = out[k]
          s.position.set(SHAFT_X + 2.2 - (i % 5) * 1.1, floorY(Math.min(f, FLOORS)) + 0.9, PLAT_Z + 0.5 + Math.floor(i / 5) * 0.8)
        },
      )
    }

    // Azotea: fuegos artificiales.
    if (roof && !shownRoof) {
      shownRoof = true
      fireworksAt = elapsed
    }
    if (roof && !reduced && elapsed - fireworksAt < 6 && R() < dt * 3) burst(SHAFT_X + (R() - 0.5) * 30, TOWER_H + 10 + R() * 18, CAB_Z - 4 + (R() - 0.5) * 10)

    // Luces de Navidad que titilan.
    for (let i = 0; i < bulbPos.length; i++) {
      const k = reduced ? 1 : 0.5 + 0.5 * Math.max(0, Math.sin(elapsed * 2.4 + i * 1.3))
      bulbs.setColorAt(i, bulbTmp.copy(bulbBase[i]).multiplyScalar(k))
    }
    bulbs.instanceColor.needsUpdate = true

    // Nieve alrededor de la cámara.
    if (snowN) {
      for (let i = 0; i < snowN; i++) {
        let sy = snowPos[i * 3 + 1] - dt * (2 + (i % 4))
        if (sy < camPos.y - 25) sy += 50
        if (sy > camPos.y + 25) sy -= 50
        snowPos[i * 3 + 1] = sy
        snowPos[i * 3] += Math.sin(elapsed + i) * dt * 0.6
      }
      snow.position.set(camPos.x, 0, camPos.z - 12)
      snowGeo.attributes.position.needsUpdate = true
    }
    sparks.update(dt)
    dust.update(dt)

    // Cámara. Dentro: en primera persona, a la altura de los ojos y pegada a la cabina, mirando por las puertas de cristal
    // a la ciudad (cuanto más alto, más hacia abajo); con el ratón se mira alrededor. Si te bajaste: desde tu rellano,
    // mirando cómo sigue. Si no vas en el viaje: desde la calle.
    const portrait = camera.aspect < 0.9
    lookYaw += (aimYaw - lookYaw) * (1 - Math.exp(-dt * 5))
    lookPitch += (aimPitch - lookPitch) * (1 - Math.exp(-dt * 5))
    let fov = portrait ? 58 : 46
    let snap = false
    if (pov === 'inside') {
      const bob = fr.disp?.moving && !reduced ? Math.sin(elapsed * 8) * 0.012 : 0
      wantPos.set(cab.position.x, y + EYE + bob, CAB_Z - 0.95)
      const pitch = -0.02 - smooth(4, 50, y) * 0.3 + lookPitch
      wantLook.set(wantPos.x + Math.sin(lookYaw) * 10, wantPos.y + Math.tan(pitch) * 10, wantPos.z + Math.cos(lookYaw) * 10)
      fov = (portrait ? 84 : 70) + (fallen && !waiting && !landed && !reduced ? 9 : 0)
      snap = true
    } else if (pov === 'landing') {
      const hy = floorY(here)
      // A tu altura, a un lado del hueco (los rellanos de encima no tapan), mirando cómo sube la cabina.
      wantPos.set(SHAFT_X + 5.8, hy + EYE, CAB_Z + 0.9)
      wantLook.set(SHAFT_X - 0.4 + Math.sin(lookYaw) * 4, Math.max(hy + 1.4, mix(hy + 1.6, y + 1.8, 0.75)) + lookPitch * 6, CAB_Z - 0.5)
      fov = portrait ? 80 : 66
    } else {
      wantPos.set(SHAFT_X + (portrait ? 8 : 16), 2.8, CAB_Z + (portrait ? 24 : 20))
      wantLook.set(SHAFT_X + (portrait ? 0.5 : 2.5), Math.max(2.2, y * 0.85 + 1.8), CAB_Z)
      if (!reduced) {
        wantPos.x += Math.sin(elapsed * 0.25) * 0.6
        wantPos.y += Math.sin(elapsed * 0.31) * 0.25
      }
    }
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 6))
      camera.updateProjectionMatrix()
    }
    if (snap && !first) camPos.copy(wantPos)
    if (first) {
      camPos.copy(wantPos)
      camLook.copy(wantLook)
      first = false
    }
    const k = 1 - Math.exp(-dt * (fallen ? 6 : 3.5))
    camPos.lerp(wantPos, k)
    if (snap) camLook.copy(wantLook)
    else camLook.lerp(wantLook, k)
    camera.position.copy(camPos)
    // Cayendo dentro de la cabina, todo tiembla.
    const falling = fallen && !waiting && !landed && fallStart !== null && fallStart !== -Infinity
    if (falling && pov === 'inside' && !reduced) shake = Math.max(shake, 0.16)
    if (shake > 0 && !reduced) {
      camera.position.add(tmp.set((R() - 0.5) * shake, (R() - 0.5) * shake, (R() - 0.5) * shake))
      shake = Math.max(0, shake - dt * 1.5)
    }
    camera.lookAt(camLook)
    if (falling && pov === 'inside' && !reduced) camera.rotateZ(Math.sin(elapsed * 11) * 0.035 + Math.sin(elapsed * 3) * 0.04)

    // Estelas de viento según la velocidad vertical de la cabina.
    if (dt > 0.001) speed += ((y - prevY) / dt - speed) * (1 - Math.exp(-dt * 12))
    prevY = y
    if (STREAKS) {
      const av = Math.abs(speed)
      const len = Math.min(9, av * 0.1)
      streakMat.opacity = smooth(2, 9, av) * (pov === 'inside' ? 0.5 : 0.25)
      streaks.visible = streakMat.opacity > 0.01
      if (streaks.visible) {
        const dir = speed >= 0 ? 1 : -1
        for (let i = 0; i < STREAKS; i++) {
          const [bx, by, bz] = streakBase[i]
          const wy = camPos.y + ((((by - camPos.y + 22) % 44) + 44) % 44) - 22
          streakPos.set([bx, wy, bz, bx, wy + len * dir * (0.5 + (i % 5) * 0.2), bz], i * 6)
        }
        streakGeo.attributes.position.needsUpdate = true
      }
    }

    // Efectos de pantalla: luz roja, golpe y oscuridad al caer.
    {
      const bad = fallen && !waiting
      const fpScale = pov === 'inside' ? 1 : 0.4
      const pulse = reduced ? 0.7 : 0.75 + 0.25 * Math.sin(elapsed * 12)
      const since = landed ? (landedAt === -Infinity ? 99 : elapsed - landedAt) : -1
      fx.uniforms.uRed.value = bad ? pulse * fpScale : 0
      fx.uniforms.uDark.value = landed ? smooth(0, 0.9, since) * 0.6 * fpScale : 0
      fx.uniforms.uFlash.value = landed && !reduced && since < 0.18 ? (1 - since / 0.18) * 0.7 * fpScale : 0
      fx.enabled = bad
    }

    const scale = renderer.getDrawingBufferSize(buf).y / 2 / Math.tan(((camera.fov / 2) * Math.PI) / 180)
    sparks.points.material.uniforms.uScale.value = scale
    dust.points.material.uniforms.uScale.value = scale
    snowMat.uniforms.uScale.value = scale

    composer.render(dt)
  }

  function destroy() {
    canvas.removeEventListener('webglcontextlost', onLost)
    host.removeEventListener('pointermove', onLook)
    host.removeEventListener('pointerleave', onLookOut)
    for (const tex of texCache.values()) tex.dispose()
    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      const m = obj.material
      if (Array.isArray(m)) m.forEach((x) => x.dispose())
      else {
        m?.map?.dispose?.()
        m?.dispose?.()
      }
    })
    disposables.forEach((x) => x.dispose?.())
    composer.dispose?.()
    bloom.dispose?.()
    renderer.dispose()
    root.remove()
  }

  return { draw, resize, destroy }
}
