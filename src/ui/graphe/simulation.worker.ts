// La simulation de forces du graphe, en arrière-plan : la page reste fluide (zoom, déplacement) pendant la mise en place.
// Reçoit les personnes et les liens, renvoie les positions par paquets d'environ 16 ms de calcul.

import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force'

export interface PointSim extends SimulationNodeDatum { r: number; degre: number }
export interface LienSim { source: number; target: number; poids: number; r: number }

export type Message =
  | { type: 'charger'; points: PointSim[]; liens: LienSim[]; reprise: boolean }
  | { type: 'fixer'; i: number; x: number; y: number }
  | { type: 'lacher'; i: number }

export type Reponse = { type: 'positions'; xy: Float32Array; fin: boolean; premier: boolean }

let sim: Simulation<PointSim, LienSim> | null = null
let points: PointSim[] = []
let minuterie = 0
let premier = true
let saisis = 0

function envoyer(fin: boolean) {
  const xy = new Float32Array(points.length * 2)
  for (let i = 0; i < points.length; i++) { xy[2 * i] = points[i].x!; xy[2 * i + 1] = points[i].y! }
  ;(self as unknown as Worker).postMessage({ type: 'positions', xy, fin, premier } satisfies Reponse, [xy.buffer])
  premier = false
}

/** Calcule pendant `budget` ms, envoie, recommence tant que ce n'est pas stable */
function tourner(budget: number) {
  clearTimeout(minuterie)
  if (!sim) return
  const debut = performance.now()
  do sim.tick()
  while (performance.now() - debut < budget && sim.alpha() > sim.alphaMin())
  const fin = sim.alpha() <= sim.alphaMin() && !saisis
  envoyer(fin)
  if (!fin) minuterie = setTimeout(() => tourner(16), 0) as unknown as number
}

self.onmessage = (ev: MessageEvent<Message>) => {
  const m = ev.data
  if (m.type === 'charger') {
    sim?.stop()
    points = m.points
    premier = true
    saisis = 0
    const n = points.length
    sim = forceSimulation<PointSim, LienSim>(points)
      .force('lien', forceLink<PointSim, LienSim>(m.liens).distance((d) => d.r))
      .force('charge', forceManyBody<PointSim>().strength((d) => -30 - 8 * Math.sqrt(d.degre)).distanceMax(500).theta(n > 1500 ? 1.1 : 0.9))
      .force('collision', forceCollide<PointSim>((d) => d.r + 2).iterations(1))
      // tient ensemble les groupes sans lien entre eux
      .force('x', forceX<PointSim>(0).strength(0.035))
      .force('y', forceY<PointSim>(0).strength(0.035))
      .alphaDecay(n > 1500 ? 0.04 : 0.03)
      .stop()
    if (m.reprise) sim.alpha(0.5)
    // un premier jet plus long, pour ne pas montrer le désordre du départ
    tourner(m.reprise ? 16 : Math.min(400, 40 + n / 10))
  } else if (sim) {
    const p = points[m.i]
    if (!p) return
    if (m.type === 'fixer') {
      if (p.fx == null) saisis++
      p.fx = m.x
      p.fy = m.y
      sim.alphaTarget(0.25)
      if (sim.alpha() < 0.25) sim.alpha(0.25)
    } else {
      if (p.fx != null) saisis = Math.max(0, saisis - 1)
      p.fx = null
      p.fy = null
      if (!saisis) sim.alphaTarget(0)
    }
    tourner(16)
  }
}
