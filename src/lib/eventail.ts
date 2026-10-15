// Arbres imprimables : l'ascendance place par place (numéros Sosa) et la géométrie des éventails.

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import type { DateGed } from './gedcom/dates'
import { etatParents } from './parente'
import type { Fait, Suivi } from './suivi'
import { decouper } from './geo'

/** connu · parent inconnu ou introuvable (note Filiation) · à chercher · vide (au-dessus d'une place sans personne) */
export type EtatPlace = 'connu' | 'inconnu' | 'introuvable' | 'a-chercher' | 'vide'

export interface Place {
  sosa: number
  /** 0 pour la personne de départ */
  generation: number
  etat: EtatPlace
  ind?: Individu
  /** Implexe : plus petit Sosa de la même personne, quand ce n'est pas celui-ci */
  dejaVu?: number
  /** Place vide au-dessus d'un père ou d'une mère inconnus : la lignée s'arrête là pour de bon */
  sousInconnu?: boolean
}

/** Les places Sosa 1 à 2^generations − 1 ; l'indice du tableau est le numéro Sosa */
export function places(arbre: Arbre, racine: string, generations: number): Place[] {
  const res: Place[] = []
  const vus = new Map<string, number>()
  const depart = arbre.individus.get(racine)
  res[1] = depart ? { sosa: 1, generation: 0, etat: 'connu', ind: depart } : { sosa: 1, generation: 0, etat: 'vide' }
  for (let s = 1; s < 2 ** generations; s++) {
    const p = res[s]
    if (p.ind) {
      const deja = vus.get(p.ind.id)
      if (deja) p.dejaVu = deja
      else vus.set(p.ind.id, s)
    }
    if (2 * s >= 2 ** generations) continue
    const g = p.generation + 1
    if (!p.ind) {
      const sousInconnu = p.etat === 'inconnu' || p.sousInconnu || undefined
      res[2 * s] = { sosa: 2 * s, generation: g, etat: 'vide', sousInconnu }
      res[2 * s + 1] = { sosa: 2 * s + 1, generation: g, etat: 'vide', sousInconnu }
      continue
    }
    const etats = etatParents(arbre, p.ind)
    const fam = p.ind.famc.map((f) => arbre.familles.get(f)).find(Boolean)
    const pere = fam?.mari ? arbre.individus.get(fam.mari) : undefined
    const mere = fam?.femme ? arbre.individus.get(fam.femme) : undefined
    res[2 * s] = pere ? { sosa: 2 * s, generation: g, etat: 'connu', ind: pere } : { sosa: 2 * s, generation: g, etat: etats.pere === 'connu' ? 'a-chercher' : etats.pere }
    res[2 * s + 1] = mere ? { sosa: 2 * s + 1, generation: g, etat: 'connu', ind: mere } : { sosa: 2 * s + 1, generation: g, etat: etats.mere === 'connu' ? 'a-chercher' : etats.mere }
  }
  return res
}

/** Ce qu'une case affiche d'une personne */
export interface Resume {
  prenom: string
  nom: string
  /** « 1774 », « v. 1702 », « ? » */
  naissance?: string
  deces?: string
  /** Faits sourcés : les autres s'impriment en italique */
  naissanceSourcee: boolean
  decesSourcee: boolean
  vivant: boolean
  /** Commune de naissance (ou de baptême) */
  commune?: string
  /** Lieu complet, pour situer la province */
  lieu?: string
  metier?: string
}

const QUALIFS: Partial<Record<DateGed['qualif'], string>> = { vers: 'v. ', estimé: 'v. ', calculé: 'v. ', entre: 'v. ', avant: 'av. ', après: 'ap. ' }

export function anneeCourte(e?: Evenement): string | undefined {
  const a = e?.date?.debut?.annee
  if (a === undefined) return e && (e.avere || e.lieu) ? '?' : undefined
  return (QUALIFS[e!.date!.qualif] ?? '') + a
}

const connue = (a?: string) => (a && a !== '?' ? a : undefined)

/** « 1774 – 1842 », « 1774 », « † 1842 » ou rien, jamais de « ? » ; `nd` : date sans source (en italique si l'option est cochée) */
export function morceauxAnnees(r: Resume): [string, string?][] {
  const n: [string, string?] | undefined = r.naissance ? [r.naissance, r.naissanceSourcee ? undefined : 'nd'] : undefined
  const d: [string, string?] | undefined = r.deces ? [r.deces, r.decesSourcee ? undefined : 'nd'] : undefined
  if (n && d) return [n, [' – '], d]
  if (n) return [n]
  return d ? [['† '], d] : []
}

export function resumer(ind: Individu, s: Suivi): Resume {
  const n = s.naissance.evenement
  const d = s.deces.evenement
  const vivant = s.deces.etat === 'sans-objet'
  return {
    prenom: ind.prenom,
    nom: ind.nom,
    // une date inconnue (« 1 DEAT Y », lieu sans date) ne s'écrit pas : pas de « ? » sur les arbres
    naissance: connue(anneeCourte(n)),
    deces: vivant ? undefined : connue(anneeCourte(d)),
    naissanceSourcee: s.naissance.etat === 'source',
    decesSourcee: s.deces.etat === 'source',
    vivant,
    commune: n?.lieu ? decouper(n.lieu).commune || undefined : undefined,
    lieu: n?.lieu,
    metier: ind.metiers[0]?.split(/\s*,\s*/)[0],
  }
}

/** Les `n` premiers prénoms (« Marie-Catherine Josèphe Ghislaine », 1 → « Marie-Catherine ») */
export function prenoms(p: string, n: number): string {
  return p.split(/\s+/).filter(Boolean).slice(0, n).join(' ')
}

/** « Saint-Ghislain » → « St-Ghislain », « Sainte-Ode » → « Ste-Ode » */
export function abregerCommune(c: string): string {
  return c.replace(/(^|[\s'’(-])Saint(e?)(?=[\s-])/gi, (_, avant, e) => `${avant}St${e}`)
}

// ——— Géométrie : angles en degrés, 0 vers le haut, sens des aiguilles d'une montre ———

export interface Centre { cx: number; cy: number }

const r2 = (n: number) => Math.round(n * 100) / 100
const rad = (d: number) => (d * Math.PI) / 180

export function point(o: Centre, r: number, a: number): [number, number] {
  return [r2(o.cx + r * Math.sin(rad(a))), r2(o.cy - r * Math.cos(rad(a)))]
}

/** Secteur d'anneau entre les rayons r1 et r2 et les angles a1 et a2 (r1 = 0 : part de disque) */
export function secteur(o: Centre, r1: number, r2: number, a1: number, a2: number): string {
  const grand = a2 - a1 > 180 ? 1 : 0
  const [x1, y1] = point(o, r2, a1)
  const [x2, y2] = point(o, r2, a2)
  if (r1 <= 0) return `M${o.cx},${o.cy}L${x1},${y1}A${r2},${r2} 0 ${grand} 1 ${x2},${y2}Z`
  const [x3, y3] = point(o, r1, a2)
  const [x4, y4] = point(o, r1, a1)
  return `M${x1},${y1}A${r2},${r2} 0 ${grand} 1 ${x2},${y2}L${x3},${y3}A${r1},${r1} 0 ${grand} 0 ${x4},${y4}Z`
}

/** Arc pour un texte courbe ; `retourne` le parcourt à l'envers, pour le bas de l'éventail */
export function arc(o: Centre, r: number, a1: number, a2: number, retourne = false): string {
  const grand = a2 - a1 > 180 ? 1 : 0
  const [x1, y1] = point(o, r, a1)
  const [x2, y2] = point(o, r, a2)
  return retourne ? `M${x2},${y2}A${r},${r} 0 ${grand} 0 ${x1},${y1}` : `M${x1},${y1}A${r},${r} 0 ${grand} 1 ${x2},${y2}`
}

/** Angles de la place Sosa `s` dans un éventail d'ouverture `ouverture` : les pères à gauche, les mères à droite */
export function angles(sosa: number, ouverture: number): { a1: number; a2: number; generation: number } {
  const generation = Math.floor(Math.log2(sosa))
  const n = 2 ** generation
  const a1 = -ouverture / 2 + ((sosa - n) * ouverture) / n
  return { a1, a2: a1 + ouverture / n, generation }
}

/** Angles de la place `sosa` dans un éventail qui part de son ascendant `racine` (profondeur 1 : ses parents) */
export function anglesDepuis(racine: number, sosa: number, ouverture: number): { a1: number; a2: number; profondeur: number } {
  const profondeur = Math.floor(Math.log2(sosa)) - Math.floor(Math.log2(racine))
  const n = 2 ** profondeur
  const a1 = -ouverture / 2 + ((sosa - racine * n) * ouverture) / n
  return { a1, a2: a1 + ouverture / n, profondeur }
}

// ——— Régions de naissance ———

let nomsPays: Intl.DisplayNames | undefined

export function nomPays(code?: string): string | undefined {
  if (!code) return undefined
  try {
    nomsPays ??= new Intl.DisplayNames(['fr'], { type: 'region' })
    return nomsPays.of(code)
  } catch {
    return code
  }
}

export const LIEU_INCONNU = 'Lieu inconnu'
export const LIEU_NON_SITUE = 'Lieu non situé'

/** Région (sans le pays) et pays d'un lieu : ceux de la localité reconnue, sinon ceux que mentionne le lieu */
export function situerRegion(lieu: string, position: { region?: string; pays?: string } | undefined): { region?: string; pays?: string } {
  const d = decouper(lieu)
  return { region: position?.region ?? d.contexte.find((c) => !/\d/.test(c)), pays: position?.pays ?? d.pays }
}

/**
 * Province ou région d'un lieu : celle de la localité reconnue, sinon la mention du lieu (« Hainaut »),
 * sinon le pays. Hors du pays principal de l'arbre, le pays suit entre parenthèses.
 */
export function regionDuLieu(lieu: string | undefined, position: { region?: string; pays?: string } | undefined, paysPrincipal?: string): string {
  if (!lieu) return LIEU_INCONNU
  const { region, pays } = situerRegion(lieu, position)
  if (!region) return nomPays(pays) ?? LIEU_NON_SITUE
  return pays && paysPrincipal && pays !== paysPrincipal ? `${region} (${nomPays(pays)})` : region
}

/** Générations de l'éventail au recto ; le verso prend la suite */
export const GENERATIONS_RECTO = 8

/**
 * Région de naissance de chaque place connue. Le pays principal est le plus fréquent parmi les naissances du recto :
 * le recto et le verso précisent donc les mêmes pays.
 */
export function regionsDesPlaces(resumes: Map<number, Resume>, positions?: Map<string, { region?: string; pays?: string }>): Map<number, string> {
  const pp = paysPrincipal(resumes, positions)
  const regions = new Map<number, string>()
  for (const [s, r] of resumes) regions.set(s, regionDuLieu(r.lieu, r.lieu ? positions?.get(r.lieu) : undefined, pp))
  return regions
}

/** Le pays le plus fréquent parmi les naissances du recto */
export function paysPrincipal(resumes: Map<number, Resume>, positions?: Map<string, { region?: string; pays?: string }>): string | undefined {
  const freqPays = new Map<string, number>()
  for (const [s, r] of resumes) {
    const pays = s < 2 ** GENERATIONS_RECTO && r.lieu ? positions?.get(r.lieu)?.pays : undefined
    if (pays) freqPays.set(pays, (freqPays.get(pays) ?? 0) + 1)
  }
  return [...freqPays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/**
 * Le mariage des parents d'une place (dans la famille où elle est enfant), s'il a une date ou un lieu ;
 * rien pour une union hors mariage
 */
export function mariageDesParents(pl: Place[], sosa: number, suivis: Map<string, Suivi>): Fait | undefined {
  const enfant = pl[sosa]?.ind
  const parent = pl[2 * sosa]?.ind ?? pl[2 * sosa + 1]?.ind
  if (!enfant || !parent) return undefined
  const fam = enfant.famc.find((f) => parent.fams.includes(f))
  const m = fam ? suivis.get(parent.id)?.mariages.find((x) => x.famille === fam) : undefined
  if (!m?.evenement || m.etat === 'sans-objet') return undefined
  return anneeCourte(m.evenement)?.replace(/^\?$/, '') || m.evenement.lieu ? m : undefined
}

/**
 * Les régions par fréquence (une personne vue deux fois compte une fois, la personne de départ pas du tout) :
 * celles du recto d'abord, puis celles qui n'apparaissent qu'au-delà. Les teintes suivent cet ordre,
 * si bien qu'une région garde sa couleur des deux côtés de la feuille.
 */
export function ordreRegions(pl: Place[], regions: Map<number, string>): string[] {
  const parFrequence = (de: number, a: number) => {
    const freq = new Map<string, number>()
    for (let s = de; s < Math.min(a, pl.length); s++) {
      const r = pl[s]?.ind && !pl[s].dejaVu ? regions.get(s) : undefined
      if (r && r !== LIEU_INCONNU && r !== LIEU_NON_SITUE) freq.set(r, (freq.get(r) ?? 0) + 1)
    }
    return [...freq.entries()].sort((x, y) => y[1] - x[1]).map(([r]) => r)
  }
  const recto = parFrequence(2, 2 ** GENERATIONS_RECTO)
  return [...recto, ...parFrequence(2 ** GENERATIONS_RECTO, pl.length).filter((r) => !recto.includes(r))]
}

// ——— Fratrie et titre ———

/**
 * La personne et ses frères et sœurs de mêmes père et mère (les demi-frères et sœurs n'ont pas
 * tous les mêmes ancêtres), dans l'ordre des naissances ; ceux sans date de naissance à la fin.
 */
export function fratrie(arbre: Arbre, racine: string, naissance: (ind: Individu) => Evenement | undefined): Individu[] {
  const ind = arbre.individus.get(racine)
  if (!ind) return []
  const fam = ind.famc.map((f) => arbre.familles.get(f)).find(Boolean)
  const enfants = (fam?.enfants ?? []).map((id) => arbre.individus.get(id)).filter((e): e is Individu => !!e)
  if (!enfants.includes(ind)) return [ind]
  const cle = (e: Individu) => naissance(e)?.date?.tri || Infinity
  return enfants.map((e, i) => ({ e, i })).sort((a, b) => cle(a.e) - cle(b.e) || a.i - b.i).map(({ e }) => e)
}

/** « Pierre », « Pierre et Paul », « Pierre, Paul et Jacques » */
export function enumerer(l: string[]): string {
  return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1]
}

/** Les enfants regroupés par nom de famille, dans l'ordre de la première naissance */
export function parNom<T extends { nom: string }>(enfants: T[]): { nom: string; enfants: T[] }[] {
  const g = new Map<string, T[]>()
  for (const e of enfants) g.set(e.nom, [...(g.get(e.nom) ?? []), e])
  return [...g.entries()].map(([nom, enfants]) => ({ nom, enfants }))
}

const NOMBRES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze']

/**
 * Le titre de la feuille, en morceaux entre lesquels couper de préférence :
 * [prénoms, nom] ; [« Pierre, Paul et Jacques », « Dupont »] ; [« Les huit enfants de », « Jean Dupont », « et Marie Lambert »]
 */
export function morceauxTitre(enfants: { prenom: string; nom: string }[], parents: string[]): string[] {
  if (enfants.length === 1) return [enfants[0].prenom, enfants[0].nom].filter(Boolean)
  if (enfants.length <= 3) {
    const gs = parNom(enfants)
    if (gs.length === 1) return [enumerer(enfants.map((e) => e.prenom)), gs[0].nom].filter(Boolean)
    return gs.map((g, i) => enumerer(g.enfants.map((e) => e.prenom)) + (g.nom ? ' ' + g.nom : '') + (i < gs.length - 1 ? ',' : ''))
  }
  const n = NOMBRES[enfants.length] ?? String(enfants.length)
  return [`Les ${n} enfants de`, ...parents.map((p, i) => (i ? 'et ' : '') + p)]
}

/** `tient` : faux si rien ne tenait, même à la plus petite taille */
export interface Coupe { lignes: string[]; fs: number; tient: boolean }

/**
 * Coupe un texte en lignes qui tiennent chacune dans leur place, de la plus grande taille à la plus petite :
 * sur une ligne ou entre les morceaux (sans trop rapetisser), puis entre les mots. `place(i, fs)` : largeur permise à la ligne i.
 */
export function couperLignes(morceaux: string[], tailles: number[], maxLignes: number,
  mesurer: (t: string, fs: number) => number, place: (i: number, fs: number) => number): Coupe {
  /** `depart` : rang de la première ligne, pour sa largeur */
  const remplir = (unites: string[], fs: number, depart = 0) => {
    const lignes: string[] = []
    for (const u of unites) {
      const n = lignes.length
      if (n && mesurer(lignes[n - 1] + ' ' + u, fs) <= place(depart + n - 1, fs)) lignes[n - 1] += ' ' + u
      else lignes.push(u)
    }
    return lignes
  }
  const tient = (lignes: string[], fs: number) => lignes.length <= maxLignes && lignes.every((l, i) => mesurer(l, fs) <= place(i, fs))
  const mots = morceaux.flatMap((m) => m.split(/\s+/)).filter(Boolean)
  // Couper entre les morceaux vaut bien un texte un peu plus petit ; entre les mots, en dernier recours
  for (const fs of tailles.filter((t) => t >= tailles[0] * 0.75)) {
    for (const lignes of [[morceaux.join(' ')], remplir(morceaux, fs)]) if (tient(lignes, fs)) return { lignes, fs, tient: true }
  }
  // chaque morceau coupé entre ses mots, mais toujours à la ligne entre deux morceaux ; sinon n'importe où
  const parMorceau = (fs: number) => morceaux.reduce<string[]>((lignes, m) => {
    const suite = remplir(m.split(/\s+/).filter(Boolean), fs, lignes.length)
    return [...lignes, ...suite]
  }, [])
  for (const fs of tailles) {
    for (const lignes of [parMorceau(fs), remplir(mots, fs)]) if (tient(lignes, fs)) return { lignes, fs, tient: true }
  }
  const fs = tailles[tailles.length - 1]
  return { lignes: remplir(mots, fs), fs, tient: false }
}
