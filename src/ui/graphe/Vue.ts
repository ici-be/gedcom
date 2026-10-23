// Dessin du graphe sur un canvas : zoom, déplacement, étiquettes sans chevauchement.
// Un canvas plutôt que du SVG, et la simulation de forces dans un worker : des milliers de personnes restent fluides.

import type { Arete, Noeud, TypeLien } from '../../lib/graphe'
import Simulateur from './simulation.worker?worker'
import type { Message, Reponse } from './simulation.worker'

export interface Point {
  id: string
  i: number
  x?: number
  y?: number
  n: Noeud
  r: number
  etiquette: string
  couleur: string
  /** Ajouté comme famille proche : disque creux */
  creux: boolean
  voisins: Set<string>
}

interface Trait { source: Point; target: Point; ar: Arete }

export interface Style { fond: string; texte: string; discret: string; accent: string; liens: Record<TypeLien, string> }

const TIRETS: Record<TypeLien, number[]> = { famille: [], parrain: [], temoin: [5, 3], cotemoin: [1.5, 3] }

interface Transfo { k: number; x: number; y: number }

export class Vue {
  private ctx: CanvasRenderingContext2D
  private points: Point[] = []
  private parId = new Map<string, Point>()
  private traits: Trait[] = []
  private sim = new Simulateur()
  /** La vue a été déplacée à la main depuis le dernier graphe : on ne recadre plus tout seul */
  private touche = false
  private tous = false
  private t: Transfo = { k: 1, x: 0, y: 0 }
  private l = 0
  private h = 0
  private dpr = 1
  private demande = 0
  private survole: Point | null = null
  private choisi: string | null = null
  private trouves: Set<string> | null = null
  private style: Style
  private gestes = new Map<number, { x: number; y: number }>()
  private prise: { point: Point | null; x: number; y: number; bouge: boolean; pinceau?: { d: number; k: number } } | null = null
  private animation = 0
  private obs: ResizeObserver

  constructor(private canvas: HTMLCanvasElement, style: Style, private rappels: { choisir: (id: string | null) => void; calcul: (enCours: boolean) => void }) {
    this.ctx = canvas.getContext('2d')!
    this.sim.onmessage = (ev: MessageEvent<Reponse>) => this.positions(ev.data)
    this.style = style
    this.obs = new ResizeObserver(() => this.taille())
    this.obs.observe(canvas)
    this.taille()
    canvas.addEventListener('pointerdown', this.bas)
    canvas.addEventListener('pointermove', this.mouvement)
    canvas.addEventListener('pointerup', this.haut)
    canvas.addEventListener('pointercancel', this.haut)
    canvas.addEventListener('pointerleave', this.sortie)
    canvas.addEventListener('wheel', this.molette, { passive: false })
  }

  detruire() {
    this.sim.terminate()
    this.obs.disconnect()
    cancelAnimationFrame(this.demande)
    cancelAnimationFrame(this.animation)
    const c = this.canvas
    c.removeEventListener('pointerdown', this.bas)
    c.removeEventListener('pointermove', this.mouvement)
    c.removeEventListener('pointerup', this.haut)
    c.removeEventListener('pointercancel', this.haut)
    c.removeEventListener('pointerleave', this.sortie)
    c.removeEventListener('wheel', this.molette)
  }

  setStyle(s: Style) { this.style = s; this.dessiner() }

  /** Nouveau graphe : les personnes déjà là gardent leur place, les nouvelles arrivent près d'un voisin */
  charger(noeuds: Noeud[], aretes: Arete[], apparence: (n: Noeud) => { couleur: string; etiquette: string; creux: boolean }) {
    const ancien = this.parId
    this.parId = new Map()
    this.points = noeuds.map((n, i) => {
      const a = apparence(n)
      const p: Point = { id: n.id, i, n, r: 3.5 + Math.sqrt(n.poids) * 1.1, etiquette: a.etiquette, couleur: a.couleur, creux: a.creux, voisins: new Set() }
      const vieux = ancien.get(n.id)
      if (vieux) { p.x = vieux.x; p.y = vieux.y }
      this.parId.set(n.id, p)
      return p
    })
    this.traits = []
    for (const ar of aretes) {
      const s = this.parId.get(ar.a)
      const t = this.parId.get(ar.b)
      if (!s || !t) continue
      s.voisins.add(t.id)
      t.voisins.add(s.id)
      this.traits.push({ source: s, target: t, ar })
    }
    // même graphe, autres couleurs : rien à recalculer
    const memes = this.points.length === ancien.size && this.points.every((p) => ancien.has(p.id)) &&
      this.traits.length === this.nbTraits
    this.nbTraits = this.traits.length
    if (this.survole && !this.parId.has(this.survole.id)) this.survole = null
    if (memes && this.points.every((p) => p.x !== undefined)) { this.dessiner(); return }
    let nouveaux = 0
    for (const p of this.points) {
      if (p.x !== undefined) continue
      nouveaux++
      const v = [...p.voisins].map((id) => this.parId.get(id)!).find((q) => q.x !== undefined)
      const ang = Math.random() * 2 * Math.PI
      if (v) { p.x = v.x! + Math.cos(ang) * 20; p.y = v.y! + Math.sin(ang) * 20 }
    }
    this.tous = nouveaux === this.points.length
    if (this.tous) this.touche = false
    const m: Message = {
      type: 'charger',
      points: this.points.map((p) => ({ x: p.x, y: p.y, r: p.r, degre: p.n.degre })),
      liens: this.traits.map((t) => ({ source: t.source.i, target: t.target.i, poids: t.ar.poids, r: 18 + 34 / Math.sqrt(t.ar.poids) + t.source.r + t.target.r })),
      reprise: !this.tous,
    }
    this.rappels.calcul(this.points.length > 0)
    this.sim.postMessage(m)
    this.dessiner()
  }

  private nbTraits = 0

  private positions(r: Reponse) {
    if (r.xy.length !== this.points.length * 2) return
    for (const p of this.points) { p.x = r.xy[2 * p.i]; p.y = r.xy[2 * p.i + 1] }
    if (this.tous && !this.touche && (r.premier || r.fin)) this.cadrer(!r.premier)
    if (r.fin) this.rappels.calcul(false)
    this.dessiner()
  }

  setChoisi(id: string | null) { this.choisi = id; this.dessiner() }
  setTrouves(ids: Set<string> | null) { this.trouves = ids; this.dessiner() }

  /** Montrer tout le graphe */
  cadrer(anime = true) {
    if (!this.points.length || this.points[0].x === undefined) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of this.points) {
      x0 = Math.min(x0, p.x! - p.r); y0 = Math.min(y0, p.y! - p.r); x1 = Math.max(x1, p.x! + p.r); y1 = Math.max(y1, p.y! + p.r)
    }
    const k = Math.min(2.2, (this.l - 60) / Math.max(x1 - x0, 1), (this.h - 60) / Math.max(y1 - y0, 1))
    this.aller({ k, x: this.l / 2 - k * (x0 + x1) / 2, y: this.h / 2 - k * (y0 + y1) / 2 }, anime)
  }

  centrer(id: string) {
    const p = this.parId.get(id)
    if (!p || p.x === undefined) return
    this.touche = true
    const k = Math.max(this.t.k, 1.4)
    this.aller({ k, x: this.l / 2 - k * p.x!, y: this.h / 2 - k * p.y! }, true)
  }

  zoomer(f: number) { this.touche = true; this.zoomAutour(this.l / 2, this.h / 2, f, true) }

  private aller(but: Transfo, anime: boolean) {
    cancelAnimationFrame(this.animation)
    if (!anime || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.t = but; this.dessiner(); return }
    const de = { ...this.t }
    const debut = performance.now()
    const pas = (now: number) => {
      const u = Math.min(1, (now - debut) / 350)
      const e = 1 - Math.pow(1 - u, 3)
      this.t = { k: de.k + (but.k - de.k) * e, x: de.x + (but.x - de.x) * e, y: de.y + (but.y - de.y) * e }
      this.dessiner()
      if (u < 1) this.animation = requestAnimationFrame(pas)
    }
    this.animation = requestAnimationFrame(pas)
  }

  private zoomAutour(sx: number, sy: number, f: number, anime = false) {
    const k = Math.min(8, Math.max(0.05, this.t.k * f))
    const r = k / this.t.k
    this.aller({ k, x: sx - (sx - this.t.x) * r, y: sy - (sy - this.t.y) * r }, anime)
  }

  private taille() {
    const r = this.canvas.getBoundingClientRect()
    this.dpr = window.devicePixelRatio || 1
    const premier = !this.l
    this.l = r.width
    this.h = r.height
    this.canvas.width = Math.round(r.width * this.dpr)
    this.canvas.height = Math.round(r.height * this.dpr)
    if (premier) this.t = { k: 1, x: this.l / 2, y: this.h / 2 }
    this.dessiner()
  }

  private monde(sx: number, sy: number) { return { x: (sx - this.t.x) / this.t.k, y: (sy - this.t.y) / this.t.k } }

  private sous(sx: number, sy: number): Point | null {
    const m = this.monde(sx, sy)
    let meilleur: Point | null = null
    let dmin = Infinity
    for (const p of this.points) {
      if (p.x === undefined) continue
      const d = Math.hypot(p.x - m.x, p.y! - m.y) - p.r
      if (d < dmin) { dmin = d; meilleur = p }
    }
    return meilleur && dmin <= 6 / this.t.k ? meilleur : null
  }

  private position(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private bas = (e: PointerEvent) => {
    const pos = this.position(e)
    this.gestes.set(e.pointerId, pos)
    this.canvas.setPointerCapture(e.pointerId)
    if (this.gestes.size === 2) {
      const [a, b] = [...this.gestes.values()]
      this.prise = { point: null, x: 0, y: 0, bouge: true, pinceau: { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.t.k } }
      return
    }
    const p = this.sous(pos.x, pos.y)
    this.prise = { point: p, x: pos.x, y: pos.y, bouge: false }
    cancelAnimationFrame(this.animation)
  }

  private mouvement = (e: PointerEvent) => {
    const pos = this.position(e)
    if (this.gestes.has(e.pointerId)) this.gestes.set(e.pointerId, pos)
    const pr = this.prise
    if (!pr) {
      const p = this.sous(pos.x, pos.y)
      if (p !== this.survole) {
        this.survole = p
        this.canvas.style.cursor = p ? 'pointer' : 'grab'
        this.canvas.title = p ? p.etiquette : ''
        this.dessiner()
      }
      return
    }
    if (pr.pinceau && this.gestes.size === 2) {
      const [a, b] = [...this.gestes.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const k = Math.min(8, Math.max(0.05, pr.pinceau.k * d / pr.pinceau.d))
      this.touche = true
      this.zoomAutour((a.x + b.x) / 2, (a.y + b.y) / 2, k / this.t.k)
      return
    }
    const dx = pos.x - pr.x
    const dy = pos.y - pr.y
    if (!pr.bouge && Math.hypot(dx, dy) < 4) return
    pr.bouge = true
    this.touche = true
    this.canvas.style.cursor = 'grabbing'
    if (pr.point) {
      const m = this.monde(pos.x, pos.y)
      pr.point.x = m.x
      pr.point.y = m.y
      this.sim.postMessage({ type: 'fixer', i: pr.point.i, x: m.x, y: m.y } satisfies Message)
      this.dessiner()
    } else {
      this.t = { ...this.t, x: this.t.x + dx, y: this.t.y + dy }
      pr.x = pos.x
      pr.y = pos.y
      this.dessiner()
    }
  }

  private haut = (e: PointerEvent) => {
    this.gestes.delete(e.pointerId)
    const pr = this.prise
    if (this.gestes.size) return
    this.prise = null
    this.canvas.style.cursor = 'grab'
    if (!pr) return
    if (pr.point && pr.bouge) this.sim.postMessage({ type: 'lacher', i: pr.point.i } satisfies Message)
    if (!pr.bouge) this.rappels.choisir(pr.point?.id ?? null)
  }

  private sortie = () => {
    if (this.survole && !this.prise) { this.survole = null; this.dessiner() }
  }

  private molette = (e: WheelEvent) => {
    e.preventDefault()
    const pos = this.position(e as unknown as PointerEvent)
    this.touche = true
    this.zoomAutour(pos.x, pos.y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)))
  }

  dessiner() {
    if (this.demande) return
    this.demande = requestAnimationFrame(() => { this.demande = 0; this.peindre() })
  }

  private peindre() {
    const { ctx, t, style } = this
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.l, this.h)
    // rien à montrer avant les premières positions
    if (this.tous && this.points[0]?.x === undefined) return
    const focus = this.survole ?? (this.choisi ? this.parId.get(this.choisi) ?? null : null)
    const proche = (p: Point) => !focus || p === focus || focus.voisins.has(p.id)
    const lumineux = (p: Point) => (this.trouves ? this.trouves.has(p.id) : true) && proche(p)

    ctx.save()
    ctx.translate(t.x, t.y)
    ctx.scale(t.k, t.k)
    // liens : par type, ceux du focus par-dessus
    const types: TypeLien[] = ['famille', 'cotemoin', 'temoin', 'parrain']
    for (const passe of [0, 1]) {
      for (const type of types) {
        ctx.beginPath()
        let rien = true
        for (const tr of this.traits) {
          if (tr.ar.type !== type) continue
          const actif = focus ? tr.source === focus || tr.target === focus : !this.trouves || this.trouves.has(tr.source.id) || this.trouves.has(tr.target.id)
          if ((passe === 1) !== (actif && !!(focus || this.trouves))) continue
          ctx.moveTo(tr.source.x!, tr.source.y!)
          ctx.lineTo(tr.target.x!, tr.target.y!)
          rien = false
        }
        if (rien) continue
        const estompe = passe === 0 && !!(focus || this.trouves)
        ctx.globalAlpha = estompe ? 0.12 : passe === 1 ? 0.95 : 0.55
        ctx.strokeStyle = style.liens[type]
        ctx.lineWidth = Math.max((type === 'famille' ? 1.2 : 1) * (passe ? 1.6 : 1), 0.7 / t.k)
        // les pointillés coûtent cher : sur un grand graphe vu de loin, des traits pleins (la couleur suffit)
        const tirets = this.traits.length < 2500 || t.k > 1.2
        ctx.setLineDash(tirets ? TIRETS[type].map((x) => x * Math.max(1, 1 / t.k)) : [])
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
    // personnes : un seul tracé par couleur, éclat et forme
    const lots = new Map<string, { couleur: string; alpha: number; creux: boolean; points: Point[] }>()
    for (const p of this.points) {
      const alpha = lumineux(p) ? 1 : 0.18
      const cle = `${p.couleur}|${alpha}|${p.creux}`
      const lot = lots.get(cle)
      if (lot) lot.points.push(p)
      else lots.set(cle, { couleur: p.couleur, alpha, creux: p.creux, points: [p] })
    }
    // les estompés d'abord, les autres par-dessus
    for (const lot of [...lots.values()].sort((a, b) => a.alpha - b.alpha)) {
      ctx.globalAlpha = lot.alpha
      ctx.beginPath()
      for (const p of lot.points) {
        ctx.moveTo(p.x! + p.r, p.y!)
        ctx.arc(p.x!, p.y!, p.r, 0, 2 * Math.PI)
      }
      ctx.fillStyle = lot.creux ? style.fond : lot.couleur
      ctx.fill()
      // un liseré du fond sépare les disques qui se touchent ; inutile vu de très loin
      if (lot.creux || t.k > 0.35) {
        ctx.lineWidth = lot.creux ? Math.max(1.6, 1 / t.k) : 1.5 / t.k
        ctx.strokeStyle = lot.creux ? lot.couleur : style.fond
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    for (const p of [this.choisi ? this.parId.get(this.choisi) : undefined, this.survole]) {
      if (!p) continue
      ctx.beginPath()
      ctx.arc(p.x!, p.y!, p.r + 3.5 / t.k, 0, 2 * Math.PI)
      ctx.lineWidth = 2 / t.k
      ctx.strokeStyle = style.accent
      ctx.stroke()
    }
    if (this.trouves) {
      for (const id of this.trouves) {
        const p = this.parId.get(id)
        if (!p || p === focus) continue
        ctx.beginPath()
        ctx.arc(p.x!, p.y!, p.r + 3 / t.k, 0, 2 * Math.PI)
        ctx.lineWidth = 1.5 / t.k
        ctx.strokeStyle = style.accent
        ctx.stroke()
      }
    }
    ctx.restore()
    this.etiquettes(focus)
  }

  /** Les noms, à taille fixe à l'écran : d'abord le focus et ses voisins, puis les plus reliés, sans chevauchement */
  private etiquettes(focus: Point | null) {
    const { ctx, t, style } = this
    const candidats: Point[] = []
    const vus = new Set<Point>()
    const ajouter = (p?: Point | null) => { if (p && !vus.has(p)) { vus.add(p); candidats.push(p) } }
    ajouter(focus)
    if (focus) for (const id of focus.voisins) ajouter(this.parId.get(id))
    if (this.trouves) for (const id of this.trouves) ajouter(this.parId.get(id))
    const lisibles = [...this.points].sort((a, b) => b.n.poids - a.n.poids)
    // sans focus, tout le monde est candidat (les plus reliés d'abord) ; sinon seulement le voisinage
    if (!focus && !this.trouves) for (const p of lisibles) ajouter(p)
    ctx.font = '500 12px Inter Variable, Inter, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    const pris: [number, number, number, number][] = []
    let n = 0
    for (const p of candidats) {
      if (n >= 220) break
      if (p.x === undefined) continue
      const sx = p.x * t.k + t.x
      const sy = p.y! * t.k + t.y
      if (sx < -100 || sy < -20 || sx > this.l + 20 || sy > this.h + 20) continue
      // loin du focus, seulement si la place le permet à ce zoom
      if (!focus && !this.trouves && p.r * t.k < 3.2 && n > 12) continue
      const fort = p === focus
      ctx.font = `${fort ? 700 : 500} 12px Inter Variable, Inter, system-ui, sans-serif`
      const w = ctx.measureText(p.etiquette).width
      const ecart = p.r * t.k + 4
      // à droite, sinon à gauche, au-dessus ou en dessous
      const places: [number, number][] = [[sx + ecart, sy], [sx - ecart - w, sy], [sx - w / 2, sy - ecart - 6], [sx - w / 2, sy + ecart + 6]]
      const place = places.find(([x, y]) => !pris.some((b) => x - 2 < b[2] && x + w + 2 > b[0] && y - 8 < b[3] && y + 8 > b[1]))
      if (!place) continue
      const [x, y] = place
      pris.push([x - 2, y - 8, x + w + 2, y + 8])
      n++
      ctx.lineWidth = 3.5
      ctx.strokeStyle = style.fond
      ctx.strokeText(p.etiquette, x, y)
      ctx.fillStyle = fort || !focus ? style.texte : style.discret
      ctx.fillText(p.etiquette, x, y)
    }
  }
}
