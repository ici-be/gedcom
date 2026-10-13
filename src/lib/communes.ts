// Les faits regroupés par lieu, pour compléter les sources commune par commune.

import type { Arbre, Evenement } from './gedcom/arbre'
import { unionLibre } from './suivi'

export type Groupe = 'naissances' | 'mariages' | 'deces' | 'autres'

export const GROUPES: { id: Groupe; titre: string }[] = [
  { id: 'naissances', titre: 'Naissances et baptêmes' },
  { id: 'mariages', titre: 'Mariages' },
  { id: 'deces', titre: 'Décès et inhumations' },
  { id: 'autres', titre: 'Autres événements' },
]

const TAGS_GROUPES: Record<string, Groupe> = {
  BIRT: 'naissances', BAPM: 'naissances', CHR: 'naissances',
  MARR: 'mariages', MARB: 'mariages', MARC: 'mariages', MARL: 'mariages', ENGA: 'mariages',
  DEAT: 'deces', BURI: 'deces', CREM: 'deces',
}

export interface Acte {
  /** Identifiant stable, pour retenir ce qui a été coché */
  cle: string
  groupe: Groupe
  evenement: Evenement
  /** La personne, ou les deux conjoints */
  personnes: string[]
}

export interface Commune {
  lieu: string
  nom: string
  contexte: string
  actes: Acte[]
  sansSource: number
}

/** « Bruxelles, Bruxelles-Capitale, Belgique » → Bruxelles + « Bruxelles-Capitale, Belgique » */
export function decouperLieu(lieu: string): { nom: string; contexte: string } {
  const sansDetail = lieu.replace(/^\[[^\]]*\]\s*-\s*/, '')
  const [nom, ...reste] = sansDetail.split(',').map((s) => s.trim())
  return { nom: nom || lieu, contexte: reste.filter(Boolean).join(', ') }
}

export function cleActe(proprietaire: string, e: Evenement): string {
  return [proprietaire, e.tag, e.type ?? '', e.date?.brute ?? '', e.lieu ?? ''].join('|')
}

/**
 * Tous les faits qui ont un lieu, regroupés par lieu.
 * `perimetre` limite aux personnes données (un mariage compte si l'un des conjoints en fait partie).
 */
export function communes(arbre: Arbre, perimetre: Set<string> | null, avecAutres: boolean): Commune[] {
  const parLieu = new Map<string, Commune>()
  const ajouter = (e: Evenement, proprietaire: string, personnes: string[]) => {
    // une union hors mariage n'a pas d'acte à chercher
    if (!e.lieu || unionLibre(e)) return
    const groupe = TAGS_GROUPES[e.tag] ?? 'autres'
    if (groupe === 'autres' && !avecAutres) return
    let c = parLieu.get(e.lieu)
    if (!c) {
      c = { lieu: e.lieu, ...decouperLieu(e.lieu), actes: [], sansSource: 0 }
      parLieu.set(e.lieu, c)
    }
    c.actes.push({ cle: cleActe(proprietaire, e), groupe, evenement: e, personnes })
    if (!e.sources.length) c.sansSource++
  }
  for (const ind of arbre.individus.values()) {
    if (perimetre && !perimetre.has(ind.id)) continue
    for (const e of ind.evenements) ajouter(e, ind.id, [ind.id])
  }
  for (const fam of arbre.familles.values()) {
    const conjoints = [fam.mari, fam.femme].filter((x): x is string => !!x)
    if (perimetre && !conjoints.some((c) => perimetre.has(c))) continue
    for (const e of fam.evenements) ajouter(e, fam.id, conjoints)
  }
  return [...parLieu.values()]
}

const ROMAINS: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]

/** 18 → « XVIII » */
export function romain(n: number): string {
  let r = ''
  for (const [v, l] of ROMAINS) while (n >= v) { r += l; n -= v }
  return r
}

/** 18 → « XVIIIe siècle » (années 1700 à 1799) */
export function nomSiecle(n: number): string {
  return n > 0 ? `${romain(n)}${n === 1 ? 'er' : 'e'} siècle` : 'Avant notre ère'
}

/** Numéro du siècle d'une année, à la manière des généalogistes : 1700 → 18 */
export function numeroSiecle(annee: number): number {
  return Math.floor(annee / 100) + 1
}

/** Siècle d'un fait : « XVIIIe siècle », ou « Date inconnue » */
export function siecle(e: Evenement): string {
  const a = e.date?.debut?.annee
  return a === undefined ? 'Date inconnue' : nomSiecle(numeroSiecle(a))
}
