// État des trois faits principaux de chaque personne : naissance, mariage(s), décès.

import type { Arbre, Evenement, Famille, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import type { Introuvable } from './introuvable'

/**
 * sourcé · renseigné sans source · manquant · introuvable (« Source: introuvable » dans la note : recherche close)
 * · sans objet (pas de conjoint, personne vivante)
 */
export type Etat = 'source' | 'sans-source' | 'manquant' | 'introuvable' | 'sans-objet'

export interface Fait {
  etat: Etat
  /** L'événement affiché (le plus précis), s'il existe */
  evenement?: Evenement
  /** Pour un mariage : la famille et le conjoint */
  famille?: string
  conjoint?: string
  /** Source notée introuvable (sur l'événement affiché ou un autre du même fait) */
  introuvable?: Introuvable
}

export interface Suivi {
  naissance: Fait
  mariages: Fait[]
  deces: Fait
  /** État résumé des mariages (le pire) */
  mariage: Etat
}

export const ORDRE_ETATS: Etat[] = ['manquant', 'sans-source', 'introuvable', 'source', 'sans-objet']

/** Il reste une source à chercher : ni sourcé, ni introuvable, ni sans objet */
export function aChercher(e: Etat): boolean {
  return e === 'sans-source' || e === 'manquant'
}

export function renseigne(e: Evenement): boolean {
  return !!(e.date?.brute || e.lieu)
}

/** Choisit l'événement le plus utile parmi les tags acceptés (dans l'ordre de préférence). */
function fait(evenements: Evenement[], tags: string[]): Fait {
  const candidats = tags.flatMap((t) => evenements.filter((e) => e.tag === t))
  const remplis = candidats.filter((e) => renseigne(e) || e.sources.length)
  const avecSource = remplis.find((e) => e.sources.length)
  // une source trouvée l'emporte sur la note
  if (avecSource) return { etat: 'source', evenement: renseigne(avecSource) ? avecSource : remplis.find(renseigne) ?? avecSource }
  const introuvable = candidats.find((e) => e.introuvable)
  if (introuvable) return { etat: 'introuvable', evenement: remplis[0] ?? introuvable, introuvable: introuvable.introuvable }
  if (!remplis.length) return { etat: 'manquant', evenement: candidats[0] }
  return { etat: 'sans-source', evenement: remplis[0] }
}

/** État d'un événement seul : sourcé, introuvable, sans objet (union hors mariage) ou sans source */
export function etatEvenement(e: Evenement): Etat {
  return e.sources.length ? 'source' : e.introuvable ? 'introuvable' : unionLibre(e) ? 'sans-objet' : 'sans-source'
}

const UNION_LIBRE = /unmarried|union libre|concubin|non mari/i

/** Union hors mariage : aucun acte à chercher, donc rien à sourcer */
export function unionLibre(e: Evenement): boolean {
  return UNION_LIBRE.test(e.type ?? '')
}

/** Un vrai mariage : un acte noté (mariage, bans, contrat…), ni union libre ni simples fiançailles */
export function marie(f?: Fait): boolean {
  const e = f?.evenement
  return !!e && e.tag !== 'ENGA' && !unionLibre(e)
}

function faitMariage(fam: Famille, ind: Individu): Fait {
  const f = fait(fam.evenements, ['MARR', 'MARB', 'MARC', 'MARL', 'ENGA'])
  const conjoint = fam.mari === ind.id ? fam.femme : fam.mari
  const base = { famille: fam.id, conjoint }
  const libre = fam.evenements.find(unionLibre)
  if (f.etat === 'manquant' && !f.evenement && libre) {
    return { etat: 'sans-objet', evenement: libre, ...base }
  }
  return { ...f, ...base }
}

/** Pire état d'une liste (manquant > sans source > introuvable > sourcé) */
export function pire(etats: Etat[]): Etat {
  for (const e of ORDRE_ETATS) if (etats.includes(e)) return e
  return 'sans-objet'
}

/** Année de naissance, ou à défaut estimée d'après le mariage (−25 ans) ou le premier enfant (−30 ans) */
export function anneeNaissanceEstimee(arbre: Arbre, ind: Individu, naissance: Fait): number | undefined {
  const n = annee(naissance.evenement?.date)
  if (n !== undefined) return n
  const annees: number[] = []
  for (const f of ind.fams) {
    const fam = arbre.familles.get(f)
    if (!fam) continue
    for (const e of fam.evenements) {
      const a = annee(e.date)
      if (a !== undefined) annees.push(a - 25)
    }
    for (const c of fam.enfants) {
      for (const e of arbre.individus.get(c)?.evenements ?? []) {
        const a = annee(e.date)
        if (a !== undefined) annees.push(a - 30)
      }
    }
  }
  return annees.length ? Math.min(...annees) : undefined
}

export function suivi(arbre: Arbre, ind: Individu, anneeCourante = new Date().getFullYear()): Suivi {
  const naissance = fait(ind.evenements, ['BIRT', 'BAPM', 'CHR'])
  let deces = fait(ind.evenements, ['DEAT', 'BURI', 'CREM'])
  if (deces.etat === 'manquant' && !deces.evenement) {
    // Aucun décès indiqué : probablement vivant si né il y a moins de 100 ans
    const n = anneeNaissanceEstimee(arbre, ind, naissance)
    if (n === undefined || n > anneeCourante - 100) deces = { etat: 'sans-objet' }
  }
  const mariages = ind.fams
    .map((f) => arbre.familles.get(f))
    .filter((f): f is Famille => !!f)
    .map((f) => faitMariage(f, ind))
  return {
    naissance,
    deces,
    mariages,
    mariage: mariages.length ? pire(mariages.map((m) => m.etat)) : 'sans-objet',
  }
}

/** Nombre de faits attendus et sourcés (un fait introuvable reste attendu : il n'est pas sourcé) */
export function score(s: Suivi): { attendus: number; sources: number } {
  const etats = [s.naissance.etat, s.deces.etat, ...s.mariages.map((m) => m.etat)].filter((e) => e !== 'sans-objet')
  return { attendus: etats.length, sources: etats.filter((e) => e === 'source').length }
}
