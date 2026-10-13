// Statistiques de l'arbre : relevés bruts par personne, famille ou génération.
// Les écrans les regroupent ensuite à la demande (par siècle, par sexe, moyenne ou médiane…).

import type { Evenement, Individu } from './gedcom/arbre'
import type { Jour } from './gedcom/dates'
import type { Donnees } from './donnees'
import { decouperLieu, numeroSiecle } from './communes'
import { anneeNaissanceEstimee } from './suivi'
import { parents } from './parente'
import { decouperMetiers, sansAccents } from './metiers'
import { codePays } from './geo'

export type Sexe = 'M' | 'F' | '?'

/** Un âge (ou un écart) mesuré pour une personne */
export interface Age { id: string; sexe: Sexe; siecle: number; age: number }

export interface Statistiques {
  personnes: { id: string; sexe: Sexe; siecle?: number }[]
  /** Âge au décès */
  vies: Age[]
  /** Âge au premier mariage */
  mariages: Age[]
  /** Écart d'âge mari − femme, par couple */
  ecarts: { famille: string; siecle: number; ecart: number }[]
  /** Âge du père ou de la mère à chaque naissance */
  parents: Age[]
  /** Nombre d'enfants par couple (couples qui ont au moins un enfant connu) */
  fratries: { famille: string; siecle?: number; enfants: number }[]
  /** Mois des naissances, mariages et décès datés au mois près */
  mois: { type: 'naissances' | 'mariages' | 'deces'; mois: number; siecle: number }[]
  prenoms: { prenom: string; sexe: Sexe; siecle?: number }[]
  noms: { nom: string; siecle?: number }[]
  metiers: { cle: string; sexe: Sexe; siecle?: number }[]
  /** Lieu de naissance : commune et pays */
  naissances: { lieu: string; commune: string; pays?: string; siecle?: number }[]
  /** Né dans la même commune que son père ? */
  sedentaires: { siecle: number; meme: boolean }[]
  /** État des faits (sourcé ou non) par type et par siècle */
  sources: { type: 'naissance' | 'mariage' | 'deces'; siecle?: number; source: boolean }[]
}

// ——— Dates ———

/** Date assez sûre pour calculer un âge (exacte, « vers », estimée ou calculée ; pas « avant », « après », « entre ») */
function jour(e?: Evenement): Jour | undefined {
  const d = e?.date
  if (!d?.debut || !['', 'vers', 'estimé', 'calculé'].includes(d.qualif)) return undefined
  return d.debut
}

/** Date exacte au mois près, pour les calendriers */
function moisExact(e?: Evenement): Jour | undefined {
  const d = e?.date
  return d?.debut?.mois && d.qualif === '' ? d.debut : undefined
}

/** Âge en années (fraction comprise quand les mois et jours sont connus) */
export function ecartAnnees(a: Jour, b: Jour): number {
  if (a.mois && b.mois) {
    const ja = a.jour ?? 15
    const jb = b.jour ?? 15
    return b.annee - a.annee + (b.mois - a.mois) / 12 + (jb - ja) / 365.25
  }
  return b.annee - a.annee
}

function premier(ind: Individu, tags: string[]): Evenement | undefined {
  for (const t of tags) {
    const e = ind.evenements.find((x) => x.tag === t && x.date?.debut)
    if (e) return e
  }
  return undefined
}

const NAISSANCE = ['BIRT', 'BAPM', 'CHR']
const DECES = ['DEAT', 'BURI', 'CREM']
const MARIAGE = ['MARR', 'MARB', 'MARC', 'MARL']
const AGE_MAX = 110

function mariage(evenements: Evenement[]): Evenement | undefined {
  for (const t of MARIAGE) {
    const e = evenements.find((x) => x.tag === t && x.date?.debut)
    if (e) return e
  }
  return undefined
}

// ——— Calcul ———

export function statistiques(d: Donnees, perimetre: Set<string> | null): Statistiques {
  const { arbre } = d
  const dans = (id?: string) => !!id && (!perimetre || perimetre.has(id))
  const s: Statistiques = {
    personnes: [], vies: [], mariages: [], ecarts: [], parents: [], fratries: [], mois: [],
    prenoms: [], noms: [], metiers: [], naissances: [], sedentaires: [], sources: [],
  }

  // Siècle de naissance de chacun (estimé au besoin), utile aussi pour les parents et les conjoints
  const siecles = new Map<string, number>()
  const naissances = new Map<string, Jour>()
  for (const ind of arbre.individus.values()) {
    const suivi = d.suivis.get(ind.id)
    const a = suivi ? anneeNaissanceEstimee(arbre, ind, suivi.naissance) : undefined
    if (a !== undefined) siecles.set(ind.id, numeroSiecle(a))
    const j = jour(premier(ind, NAISSANCE))
    if (j) naissances.set(ind.id, j)
  }

  for (const ind of arbre.individus.values()) {
    if (!dans(ind.id)) continue
    const siecle = siecles.get(ind.id)
    s.personnes.push({ id: ind.id, sexe: ind.sexe, siecle })

    const n = premier(ind, NAISSANCE)
    const dc = premier(ind, DECES)
    const jn = naissances.get(ind.id)
    const jd = jour(dc)
    if (jn && jd && siecle !== undefined) {
      const age = ecartAnnees(jn, jd)
      if (age >= 0 && age <= AGE_MAX) s.vies.push({ id: ind.id, sexe: ind.sexe, siecle, age })
    }

    // Âge au premier mariage
    if (jn && siecle !== undefined) {
      const dates = ind.fams.map((f) => jour(mariage(arbre.familles.get(f)?.evenements ?? []))).filter((x): x is Jour => !!x)
      if (dates.length) {
        const age = Math.min(...dates.map((x) => ecartAnnees(jn, x)))
        if (age >= 10 && age <= 90) s.mariages.push({ id: ind.id, sexe: ind.sexe, siecle, age })
      }
    }

    // Âge à la naissance de chaque enfant
    if (jn && siecle !== undefined) {
      for (const f of ind.fams) {
        for (const c of arbre.familles.get(f)?.enfants ?? []) {
          const jc = naissances.get(c)
          if (!jc) continue
          const age = ecartAnnees(jn, jc)
          if (age >= 10 && age <= 80) s.parents.push({ id: ind.id, sexe: ind.sexe, siecle, age })
        }
      }
    }

    // Calendrier
    const mn = moisExact(ind.evenements.find((e) => e.tag === 'BIRT')) ?? moisExact(n)
    if (mn) s.mois.push({ type: 'naissances', mois: mn.mois!, siecle: numeroSiecle(mn.annee) })
    const md = moisExact(ind.evenements.find((e) => e.tag === 'DEAT')) ?? moisExact(dc)
    if (md) s.mois.push({ type: 'deces', mois: md.mois!, siecle: numeroSiecle(md.annee) })

    // Prénoms (le premier), noms
    const prenom = ind.prenom.split(/[\s,]+/)[0]
    if (/\p{L}{2}/u.test(prenom)) s.prenoms.push({ prenom: prenom.charAt(0).toUpperCase() + prenom.slice(1), sexe: ind.sexe, siecle })
    if (ind.nom) s.noms.push({ nom: ind.nom.toUpperCase(), siecle })

    // Métiers (chaque métier une fois par personne)
    const cles = new Set<string>()
    for (const e of ind.evenements) {
      if (e.tag !== 'OCCU' || !e.type) continue
      for (const m of decouperMetiers(e.type)) {
        const k = d.metiers.cleDe(m)
        if (k) cles.add(k)
      }
    }
    for (const cle of cles) s.metiers.push({ cle, sexe: ind.sexe, siecle })

    // Lieu de naissance, et celui du père
    if (n?.lieu) {
      const { nom } = decouperLieu(n.lieu)
      const parties = n.lieu.split(',').map((x) => x.trim()).filter(Boolean)
      s.naissances.push({ lieu: n.lieu, commune: nom, pays: parties.length > 1 ? codePays(parties[parties.length - 1]) : undefined, siecle })
      const { pere } = parents(arbre, ind)
      const lp = pere && premier(pere, NAISSANCE)?.lieu
      if (lp && siecle !== undefined) s.sedentaires.push({ siecle, meme: sansAccents(decouperLieu(lp).nom) === sansAccents(nom) })
    }

    // Sources
    const suivi = d.suivis.get(ind.id)
    if (suivi) {
      const ajouter = (type: 'naissance' | 'mariage' | 'deces', etat: string) => {
        if (etat === 'source' || etat === 'sans-source') s.sources.push({ type, siecle, source: etat === 'source' })
      }
      ajouter('naissance', suivi.naissance.etat)
      ajouter('deces', suivi.deces.etat)
      for (const m of suivi.mariages) ajouter('mariage', m.etat)
    }
  }

  // Couples : écart d'âge, enfants, mois du mariage (un couple compte si l'un des deux est dans le périmètre)
  for (const fam of arbre.familles.values()) {
    if (!dans(fam.mari) && !dans(fam.femme)) continue
    const m = mariage(fam.evenements)
    const siecleCouple = m?.date?.debut ? numeroSiecle(m.date.debut.annee) : siecles.get(fam.mari ?? '') ?? siecles.get(fam.femme ?? '')
    const jm = naissances.get(fam.mari ?? '')
    const jf = naissances.get(fam.femme ?? '')
    if (jm && jf && siecleCouple !== undefined) {
      const ecart = ecartAnnees(jm, jf)
      if (Math.abs(ecart) <= 50) s.ecarts.push({ famille: fam.id, siecle: siecleCouple, ecart })
    }
    if (fam.enfants.length) s.fratries.push({ famille: fam.id, siecle: siecleCouple, enfants: fam.enfants.length })
    const mm = moisExact(m)
    if (mm) s.mois.push({ type: 'mariages', mois: mm.mois!, siecle: numeroSiecle(mm.annee) })
  }
  return s
}

// ——— Ancêtres par génération ———

export interface Generation {
  generation: number
  /** 2^(n−1) */
  theoriques: number
  /** Places de la génération occupées (un ancêtre peut en occuper plusieurs : implexe) */
  connus: number
  /** Personnes différentes */
  distincts: number
  /** Places qui resteront vides : au-dessus d'un parent inconnu ou introuvable (#pere-inconnu…) */
  closes: number
}

/** Complétude de l'ascendance, génération par génération (implexe compris) */
export function generations(d: Donnees): Generation[] {
  const res: Generation[] = []
  let courante = new Map<string, number>([[d.racine, 1]])
  let closes = 0
  for (let g = 1; courante.size && g <= 60; g++) {
    let connus = 0
    for (const c of courante.values()) connus += c
    res.push({ generation: g, theoriques: 2 ** (g - 1), connus, distincts: courante.size, closes })
    const suivante = new Map<string, number>()
    // Une place close l'est aussi pour ses deux parents, à la génération suivante
    closes *= 2
    for (const [id, c] of courante) {
      const ind = d.arbre.individus.get(id)
      if (!ind) continue
      const { pere, mere } = parents(d.arbre, ind)
      for (const p of [pere, mere]) if (p) suivante.set(p.id, (suivante.get(p.id) ?? 0) + c)
      if (!pere && ind.filiation?.pere) closes += c
      if (!mere && ind.filiation?.mere) closes += c
    }
    courante = suivante
  }
  return res
}

// ——— Outils de résumé ———

export interface Resume { n: number; moyenne: number; mediane: number; min: number; max: number }

export function resumer(valeurs: number[]): Resume | undefined {
  if (!valeurs.length) return undefined
  const v = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(v.length / 2)
  return {
    n: v.length,
    moyenne: v.reduce((a, b) => a + b, 0) / v.length,
    mediane: v.length % 2 ? v[milieu] : (v[milieu - 1] + v[milieu]) / 2,
    min: v[0],
    max: v[v.length - 1],
  }
}

/** Compte les occurrences d'une clé, du plus fréquent au moins fréquent */
export function compter<T>(liste: T[], cle: (x: T) => string | undefined): [string, number][] {
  const c = new Map<string, number>()
  for (const x of liste) {
    const k = cle(x)
    if (k) c.set(k, (c.get(k) ?? 0) + 1)
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
}
