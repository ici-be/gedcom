// Situer les lieux de l'arbre sur une carte, sans rien envoyer sur Internet :
// les noms sont cherchés dans des listes de localités (GeoNames) livrées avec le site.

/** Une localité : [nom, lat, lon, région, province, population, autres noms ?] */
export type Localite = [string, number, number, string, string, number, string[]?]
/** Contenu d'un fichier public/geo/XX.json */
export interface Repertoire { a: Record<string, string[]>; l: Localite[] }

/** Pays qui ont leur propre fichier ; les autres sont cherchés dans monde.json (villes de plus de 5 000 habitants) */
export const PAYS_DETAILLES = ['BE', 'FR', 'NL', 'LU', 'CH', 'DE', 'IT', 'ES', 'GB', 'CA', 'US']

export interface Position {
  lat: number
  lon: number
  /** trouve : nom reconnu ; incertain : plusieurs localités possibles ; manuel : placé à la main */
  qualite: 'trouve' | 'incertain' | 'manuel'
  /** La localité retenue, pour vérifier (« Cuesmes, Province du Hainaut ») */
  libelle?: string
}

/** Forme de comparaison : minuscules, sans accents ni ponctuation */
export function cleGeo(s: string): string {
  return s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[-'’.()]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ——— Pays ———

const ALIAS_PAYS: Record<string, string> = {
  usa: 'US', 'u s a': 'US', 'etats unis': 'US', 'etats unis d amerique': 'US', 'united states of america': 'US', amerique: 'US',
  uk: 'GB', angleterre: 'GB', england: 'GB', ecosse: 'GB', scotland: 'GB', 'pays de galles': 'GB', wales: 'GB', 'grande bretagne': 'GB',
  hollande: 'NL', holland: 'NL', nederland: 'NL', belgie: 'BE', belgien: 'BE', deutschland: 'DE', prusse: 'DE', 'congo belge': 'CD',
  'republique democratique du congo': 'CD', zaire: 'CD', congo: 'CD', 'congo kinshasa': 'CD', suisse: 'CH', 'grand duche de luxembourg': 'LU',
  'republique tcheque': 'CZ', 'czech republic': 'CZ', tchecoslovaquie: 'CZ', boheme: 'CZ', 'urss': 'RU', 'birmanie': 'MM',
}

// Codes disparus (RDA, Yougoslavie, URSS…) : leurs noms masqueraient les pays actuels
const CODES_ANCIENS = new Set(['DD', 'YU', 'CS', 'SU', 'ZR', 'BU', 'TP', 'FX', 'NT', 'YD', 'DY', 'HV', 'RH', 'VD', 'AN', 'QO', 'EU', 'EZ', 'UN', 'XA', 'XB', 'XK'])

let nomsPays: Map<string, string> | undefined

/** Noms des pays en français, anglais, néerlandais, allemand, espagnol et italien → code ISO */
function tablePays(): Map<string, string> {
  if (nomsPays) return nomsPays
  nomsPays = new Map(Object.entries(ALIAS_PAYS))
  const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (const langue of ['fr', 'en', 'nl', 'de', 'es', 'it']) {
    let noms: Intl.DisplayNames
    try { noms = new Intl.DisplayNames([langue], { type: 'region', fallback: 'none' }) } catch { continue }
    for (const a of lettres) for (const b of lettres) {
      const code = a + b
      if (CODES_ANCIENS.has(code)) continue
      const nom = noms.of(code)
      if (nom && nom !== code && !nomsPays.has(cleGeo(nom))) nomsPays.set(cleGeo(nom), code)
    }
  }
  return nomsPays
}

function distance1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i)
}

/** « Belgique », « Begique », « USA » → code ISO */
export function codePays(nom: string): string | undefined {
  const k = cleGeo(nom)
  const t = tablePays()
  const exact = t.get(k)
  if (exact || k.length < 5) return exact
  for (const [n, code] of t) if (n.length >= 5 && distance1(k, n)) return code // faute de frappe
  return undefined
}

// ——— Lieux ———

export interface LieuDecoupe {
  commune: string
  /** Province, département, région… (du plus précis au plus large) */
  contexte: string[]
  pays?: string
}

/** « [Hameau] - Cuesmes, Hainaut, Belgique » → Cuesmes / [Hainaut] / BE */
export function decouper(lieu: string): LieuDecoupe {
  const parties = lieu.replace(/^\[[^\]]*\]\s*-\s*/, '').split(',').map((s) => s.trim()).filter(Boolean)
  const pays = parties.length ? codePays(parties[parties.length - 1]) : undefined
  if (pays) parties.pop()
  // « Rue Blaes 247, Bruxelles » : l'adresse est laissée de côté, la commune suit
  if (parties.length > 1 && ADRESSE.test(parties[0])) parties.shift()
  return { commune: parties[0] ?? '', contexte: parties.slice(1), pays }
}

const ADRESSE = /^(rue|avenue|chauss[ée]e|place|boulevard|chemin|impasse|quai|all[ée]e|square|[ée]glise|cimeti[èe]re|h[ôo]pital)\b|\d/i

/** Formes à essayer pour une commune : telle quelle, sans parenthèses, sans arrondissement, première partie d'un nom double */
function variantes(commune: string): string[] {
  const v = [commune, commune.replace(/\s*\(.*\)\s*$/, ''), commune.replace(/\s+\d+(e|er|ème)?(\s+arrondissement)?$/i, ''), commune.split(/\s+-\s+|\//)[0]]
  return [...new Set(v.filter(Boolean))]
}

/** Le fichier qui contient les localités d'un pays */
export function fichierPays(code: string): string {
  return PAYS_DETAILLES.includes(code) ? code : 'monde'
}

interface Index {
  pays: string
  rep: Repertoire
  noms: Map<string, Localite[]>
  /** Région ou province → ses noms (forme de comparaison) */
  admin: Map<string, string[]>
}

function indexer(pays: string, rep: Repertoire): Index {
  const noms = new Map<string, Localite[]>()
  const ajouter = (n: string, l: Localite) => {
    const k = cleGeo(n)
    const liste = noms.get(k)
    if (!liste) noms.set(k, [l])
    else if (!liste.includes(l)) liste.push(l)
  }
  for (const l of rep.l) {
    ajouter(l[0], l)
    for (const n of l[6] ?? []) ajouter(n, l)
  }
  const admin = new Map(Object.entries(rep.a).map(([k, v]) => [k, v.map(cleGeo)]))
  return { pays, rep, noms, admin }
}

/** Le contexte (« Hainaut », « Somme ») correspond-il à la région ou à la province de la localité ? */
function accordContexte(idx: Index, l: Localite, contexte: string[]): number {
  let score = 0
  const region = idx.admin.get(l[3]) ?? []
  const province = idx.admin.get(l[3] + '.' + l[4]) ?? []
  for (const c of contexte.map(cleGeo)) {
    if (!c) continue
    const dans = (noms: string[]) => noms.some((n) => n === c || n.endsWith(' ' + c) || n.startsWith(c + ' '))
    if (dans(province)) score += 2
    else if (dans(region)) score += 1
  }
  return score
}

function libelleLocalite(idx: Index, l: Localite): string {
  const province = idx.rep.a[l[3] + '.' + l[4]]?.[0] ?? idx.rep.a[l[3]]?.[0]
  return l[0] + (province ? ', ' + province : '')
}

const RAPPROCHER = 0.6 // degrés : au-delà, deux homonymes sont vraiment deux endroits différents

/**
 * Situe chaque lieu. `charger` lit un fichier de public/geo ; `paysParDefaut` sert aux lieux
 * sans pays reconnu (on essaie les pays les plus fréquents de l'arbre).
 */
export async function situer(lieux: string[], charger: (fichier: string) => Promise<Repertoire>): Promise<Map<string, Position>> {
  const decoupes = new Map(lieux.map((l) => [l, decouper(l)]))

  // Pays les plus fréquents, pour les lieux qui n'en indiquent pas
  const frequence = new Map<string, number>()
  for (const d of decoupes.values()) if (d.pays) frequence.set(d.pays, (frequence.get(d.pays) ?? 0) + 1)
  const parDefaut = [...frequence.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p).filter((p) => PAYS_DETAILLES.includes(p))

  const fichiers = new Set<string>()
  for (const d of decoupes.values()) fichiers.add(d.pays ? fichierPays(d.pays) : '')
  fichiers.delete('')
  for (const p of parDefaut) fichiers.add(p)

  const index = new Map<string, Index>()
  await Promise.all([...fichiers].map(async (f) => {
    try { index.set(f, indexer(f, await charger(f))) } catch { /* fichier introuvable : ces lieux resteront à placer */ }
  }))

  const candidats = (d: LieuDecoupe): { idx: Index; l: Localite; score: number }[] => {
    const pays = d.pays ? [d.pays] : parDefaut
    const res: { idx: Index; l: Localite; score: number }[] = []
    for (const p of pays) {
      const idx = index.get(fichierPays(p))
      if (!idx) continue
      for (const essai of variantes(d.commune)) {
        const trouves = idx.noms.get(cleGeo(essai))?.filter((l) => idx.pays !== 'monde' || l[3] === p)
        if (trouves?.length) {
          // le nom principal compte un peu plus qu'un nom alternatif (Paris plutôt que « Les Paris »)
          for (const l of trouves) res.push({ idx, l, score: accordContexte(idx, l, d.contexte) + (cleGeo(l[0]) === cleGeo(essai) ? 0.5 : 0) })
          break
        }
      }
    }
    return res
  }

  const positions = new Map<string, Position>()
  const enAttente: { lieu: string; d: LieuDecoupe; c: { idx: Index; l: Localite; score: number }[] }[] = []
  for (const [lieu, d] of decoupes) {
    if (!d.commune) continue
    const c = candidats(d)
    if (!c.length) continue
    const meilleur = Math.max(...c.map((x) => x.score))
    const retenus = c.filter((x) => x.score === meilleur).sort((a, b) => b.l[5] - a.l[5])
    const loin = retenus.some((x) => Math.abs(x.l[1] - retenus[0].l[1]) > RAPPROCHER || Math.abs(x.l[2] - retenus[0].l[2]) > RAPPROCHER)
    // une ville face à des hameaux du même nom : c'est la ville
    const evident = retenus[0].l[5] >= 1000 && retenus.slice(1).every((x) => x.l[5] * 20 <= retenus[0].l[5])
    if (!loin || evident) {
      const l = retenus[0].l
      positions.set(lieu, { lat: l[1], lon: l[2], qualite: 'trouve', libelle: libelleLocalite(retenus[0].idx, l) })
    } else enAttente.push({ lieu, d, c: retenus })
  }

  // Homonymes : on prend celui qui est le plus proche des autres lieux de la même province (ou du même pays)
  const centres = new Map<string, { lat: number; lon: number; n: number }>()
  for (const [lieu, p] of positions) {
    const d = decoupes.get(lieu)!
    for (const k of [d.contexte.join('|') + '|' + d.pays, '|' + d.pays]) {
      const c = centres.get(k) ?? { lat: 0, lon: 0, n: 0 }
      c.lat += p.lat; c.lon += p.lon; c.n++
      centres.set(k, c)
    }
  }
  for (const { lieu, d, c } of enAttente) {
    const centre = centres.get(d.contexte.join('|') + '|' + d.pays) ?? centres.get('|' + d.pays)
    let choix = c[0]
    if (centre) {
      const [cl, cn] = [centre.lat / centre.n, centre.lon / centre.n]
      const dist = (l: Localite) => (l[1] - cl) ** 2 + ((l[2] - cn) * Math.cos((cl * Math.PI) / 180)) ** 2
      choix = [...c].sort((a, b) => dist(a.l) - dist(b.l))[0]
    }
    positions.set(lieu, { lat: choix.l[1], lon: choix.l[2], qualite: 'incertain', libelle: libelleLocalite(choix.idx, choix.l) })
  }
  return positions
}
