// Carte des origines (bas de l'éventail imprimé) : contours des provinces et départements, cadrage sur
// les régions où sont nés des ancêtres, et légende groupée par pays.

/** Contenu de public/geo/contours.json (scripts/contours.py) : anneaux en [lon×100, lat×100, …] par code de région */
export interface Contours { r: Record<string, number[][]> }

/** Pays dessinés sur la carte */
export const PAYS_CARTE = ['BE', 'FR', 'NL', 'LU', 'DE', 'GB', 'IE']

// ——— Terres séparées par la mer : une carte chacune ———

/** Le continent, les îles Britanniques, chaque département d'outre-mer */
export function zone(code: string): string {
  if (code.startsWith('FR.97')) return code
  if (code.startsWith('GB.') || code.startsWith('IE.')) return 'IB'
  return 'C'
}

const NOMS_DOM: Record<string, string> = { 'FR.971': 'Guadeloupe', 'FR.972': 'Martinique', 'FR.973': 'Guyane', 'FR.974': 'La Réunion', 'FR.976': 'Mayotte' }

export interface Zone {
  zone: string
  /** Régions colorées */
  codes: string[]
  /** Ancêtres nés dans la zone */
  n: number
  titre: string
}

/** Les zones des régions colorées, la plus fournie d'abord : la première fait la carte principale */
export function zones(poids: Map<string, number>): Zone[] {
  const parZone = new Map<string, Zone>()
  for (const [code, n] of poids) {
    const z = zone(code)
    const e = parZone.get(z) ?? { zone: z, codes: [], n: 0, titre: '' }
    e.codes.push(code)
    e.n += n
    parZone.set(z, e)
  }
  for (const z of parZone.values()) {
    z.titre = z.zone === 'C' ? 'Europe' : z.zone === 'IB' ? (z.codes.some((c) => c.startsWith('IE.')) ? 'Îles Britanniques' : 'Royaume-Uni') : NOMS_DOM[z.zone] ?? z.zone
  }
  return [...parZone.values()].sort((a, b) => b.n - a.n)
}

/**
 * Les régions à cadrer : celles des ancêtres pour la carte principale ; pour une carte secondaire,
 * le territoire entier, qu'on le reconnaisse (la Grande-Bretagne, l'île, l'archipel)
 */
export function aCadrer(contours: Contours, z: Zone, principale: boolean): string[] {
  if (principale || z.zone === 'C') return z.codes
  if (z.zone === 'IB') {
    const irlande = z.codes.some((c) => c.startsWith('IE.') || c.startsWith('GB.N0'))
    const gb = z.codes.some((c) => c.startsWith('GB.') && !c.startsWith('GB.N0'))
    return Object.keys(contours.r).filter((c) => (gb && c.startsWith('GB.') && !c.startsWith('GB.N0')) || (irlande && (c.startsWith('IE.') || c.startsWith('GB.N0'))))
  }
  return [z.zone]
}

let enCache: Promise<Contours> | undefined

export function chargerContours(): Promise<Contours> {
  enCache ??= fetch('geo/contours.json').then((r) => {
    if (!r.ok) throw new Error('contours')
    return r.json() as Promise<Contours>
  })
  enCache.catch(() => { enCache = undefined })
  return enCache
}

/** Fenêtre géographique en degrés : [lon min, lat min, lon max, lat max] */
export type Fenetre = [number, number, number, number]

function etendue(anneaux: number[][]): Fenetre {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const a of anneaux) for (let i = 0; i < a.length; i += 2) {
    x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i])
    y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1])
  }
  return [x0 / 100, y0 / 100, x1 / 100, y1 / 100]
}

/** La fenêtre qui englobe les régions données, avec une marge ; undefined si aucune n'a de contour */
export function cadrer(contours: Contours, codes: Iterable<string>, marge = 0.25): Fenetre | undefined {
  let f: Fenetre | undefined
  for (const c of codes) {
    const a = contours.r[c]
    if (!a) continue
    const e = etendue(a)
    f = f ? [Math.min(f[0], e[0]), Math.min(f[1], e[1]), Math.max(f[2], e[2]), Math.max(f[3], e[3])] : e
  }
  return f && [f[0] - marge, f[1] - marge, f[2] + marge, f[3] + marge]
}

/** Largeur / hauteur de la fenêtre une fois projetée (équirectangulaire, corrigée à la latitude moyenne) */
export function proportions(f: Fenetre): number {
  return ((f[2] - f[0]) * Math.cos((((f[1] + f[3]) / 2) * Math.PI) / 180)) / (f[3] - f[1])
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Les chemins SVG des régions visibles dans la fenêtre, projetée dans le rectangle `r` */
export function projeter(contours: Contours, f: Fenetre, r: Rect): { code: string; d: string }[] {
  const cos = Math.cos((((f[1] + f[3]) / 2) * Math.PI) / 180)
  const k = r.w / ((f[2] - f[0]) * cos)
  const res: { code: string; d: string }[] = []
  for (const [code, anneaux] of Object.entries(contours.r)) {
    const e = etendue(anneaux)
    if (e[2] < f[0] || e[0] > f[2] || e[3] < f[1] || e[1] > f[3]) continue
    let d = ''
    for (const a of anneaux) {
      let precedent = ''
      let n = 0
      let morceau = ''
      for (let i = 0; i < a.length; i += 2) {
        const x = (r.x + (a[i] / 100 - f[0]) * cos * k).toFixed(1)
        const y = (r.y + (f[3] - a[i + 1] / 100) * k).toFixed(1)
        const p = x + ',' + y
        if (p === precedent) continue
        morceau += (n ? 'L' : 'M') + p
        precedent = p
        n++
      }
      if (n > 2) d += morceau + 'Z'
    }
    if (d) res.push({ code, d })
  }
  return res
}

// ——— Légende par pays ———

export interface Entree {
  /** Nom de la région sans le pays (« Cher »), ou rien si le lieu ne précise que le pays */
  nom?: string
  pays?: string
  couleur: string
  n: number
}

export interface Groupe { titre: string; lignes: { nom: string; couleur: string; n: number }[] }

/**
 * Une ligne par région colorée ; les régions sans couleur propre d'un même pays sont réunies
 * (« Namur, Liège »). Les pays hors carte vont dans « Autres pays ». Les groupes les plus fournis d'abord.
 */
export function grouper(entrees: Entree[], nomPays: (code: string) => string | undefined, autres: string): Groupe[] {
  const parPays = new Map<string, Entree[]>()
  for (const e of entrees) {
    const k = e.pays && PAYS_CARTE.includes(e.pays) ? e.pays : '*'
    parPays.set(k, [...(parPays.get(k) ?? []), e])
  }
  const groupes: (Groupe & { total: number })[] = []
  for (const [pays, liste] of parPays) {
    const horsCarte = pays === '*'
    const nom = (e: Entree) => horsCarte ? [e.nom, nomPays(e.pays ?? '')].filter(Boolean).join(', ') || '?' : e.nom ?? 'sans précision'
    const tri = [...liste].sort((a, b) => b.n - a.n)
    const lignes = tri.filter((e) => e.couleur !== autres).map((e) => ({ nom: nom(e), couleur: e.couleur, n: e.n }))
    // « sans précision » en fin de liste
    const reste = tri.filter((e) => e.couleur === autres).sort((a, b) => (a.nom ? 0 : 1) - (b.nom ? 0 : 1))
    if (reste.length) lignes.push({ nom: reste.map(nom).join(', '), couleur: autres, n: reste.reduce((s, e) => s + e.n, 0) })
    groupes.push({ titre: horsCarte ? 'Autres pays' : nomPays(pays) ?? pays, lignes, total: liste.reduce((s, e) => s + e.n, 0) })
  }
  // « Autres pays » toujours en dernier
  return groupes.sort((a, b) => (a.titre === 'Autres pays' ? 1 : 0) - (b.titre === 'Autres pays' ? 1 : 0) || b.total - a.total)
    .map(({ titre, lignes }) => ({ titre, lignes }))
}

/** Répartit les groupes en deux colonnes : le premier à gauche, chacun des suivants dans la colonne la plus courte */
export function colonnes<T extends { lignes: unknown[] }>(groupes: T[]): [T[], T[]] {
  const res: [T[], T[]] = [[], []]
  const hauteur = [0, 0]
  groupes.forEach((g, i) => {
    const c = i === 0 ? 0 : hauteur[1] <= hauteur[0] ? 1 : 0
    res[c].push(g)
    hauteur[c] += g.lignes.length + 1.5
  })
  return res
}
