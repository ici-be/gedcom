// Arbres imprimables : l'ascendance place par place (numéros Sosa) et la géométrie des éventails.

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import type { DateGed } from './gedcom/dates'
import { etatParents } from './parente'
import type { Suivi } from './suivi'
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
      res[2 * s] = { sosa: 2 * s, generation: g, etat: 'vide' }
      res[2 * s + 1] = { sosa: 2 * s + 1, generation: g, etat: 'vide' }
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

export function resumer(ind: Individu, s: Suivi): Resume {
  const n = s.naissance.evenement
  const d = s.deces.evenement
  const vivant = s.deces.etat === 'sans-objet'
  return {
    prenom: ind.prenom,
    nom: ind.nom,
    naissance: anneeCourte(n),
    deces: vivant ? undefined : anneeCourte(d) ?? '?',
    naissanceSourcee: s.naissance.etat === 'source',
    decesSourcee: s.deces.etat === 'source',
    vivant,
    commune: n?.lieu ? decouper(n.lieu).commune || undefined : undefined,
    lieu: n?.lieu,
    metier: ind.metiers[0]?.split(/\s*,\s*/)[0],
  }
}

/** Premier prénom seulement (« Marie-Catherine Josèphe » → « Marie-Catherine ») */
export function premierPrenom(p: string): string {
  return p.split(/\s+/)[0] ?? ''
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

/**
 * Province ou région d'un lieu : celle de la localité reconnue, sinon la mention du lieu (« Hainaut »),
 * sinon le pays. Hors du pays principal de l'arbre, le pays suit entre parenthèses.
 */
export function regionDuLieu(lieu: string | undefined, position: { region?: string; pays?: string } | undefined, paysPrincipal?: string): string {
  if (!lieu) return LIEU_INCONNU
  const d = decouper(lieu)
  const pays = position?.pays ?? d.pays
  const region = position?.region ?? d.contexte.find((c) => !/\d/.test(c))
  if (!region) return nomPays(pays) ?? LIEU_NON_SITUE
  return pays && paysPrincipal && pays !== paysPrincipal ? `${region} (${nomPays(pays)})` : region
}
