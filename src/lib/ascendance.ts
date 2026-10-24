// Page Ascendance : les ancêtres place par place (numéros Sosa), leurs branches, leurs lignées,
// les pistes de recherche, l'implexe, et ce que chaque génération raconte.

import type { Donnees } from './donnees'
import type { Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import type { EtatParent } from './filiation'
import { decouper } from './geo'
import { numeroSiecle } from './communes'
import { comparerSosa, etatParents, parents } from './parente'
import { generations, resumer, type Generation, type Resume } from './statistiques'
import { anneeNaissanceEstimee } from './suivi'

/** Au-delà, l'implexe ferait exploser le nombre de places à parcourir */
const MAX_PLACES = 300_000
/** Profondeur de l'éventail de complétude */
export const GENERATIONS_EVENTAIL = 10

export interface Branche {
  sosa: number
  id?: string
  /** Ancêtres différents de la branche (la tête comprise) */
  distincts: number
  /** Génération la plus lointaine atteinte */
  profondeur: number
  /** Part des places occupées, de la génération de la tête à la 14e */
  completude: number[]
}

export interface Quartier extends Branche { sous: Branche[] }

export interface Piste { id: string; generation: number; sosa: string; pere: EtatParent; mere: EtatParent }

export interface Implexe { ids: string[]; generation: number; sosas: string[][] }

export type Etape =
  | { type: 'etranger'; id: string; pays: string; principal: string }
  | { type: 'complete'; places: number }
  | { type: 'mur'; piste: Piste }
  | { type: 'sans-issue'; pistes: Piste[]; total: number }
  | { type: 'implexe'; implexe: Implexe }
  | { type: 'plus-fournie'; distincts: number }
  | { type: 'sources'; sourcees: number; total: number }

export interface GenerationDetaillee extends Generation {
  reste: number
  /** Années de naissance (estimées au besoin) : la plus ancienne et la plus récente */
  debut?: number
  fin?: number
  /** Naissances sourcées parmi les ancêtres différents de la génération */
  sourcees: number
  /** Pays de naissance, du plus fréquent au moins fréquent */
  pays: [string, number][]
  /** Part des places occupées de chaque côté (à partir de la 2e génération) */
  pere?: number
  mere?: number
  etapes: Etape[]
}

export interface Ascendance {
  generations: GenerationDetaillee[]
  places: number
  distincts: number
  completes: number
  /** Part des places occupées par un ancêtre déjà rencontré */
  implexe: number
  /** Places de l'éventail (Sosa < 2^10) : occupées, et fermées (au-dessus d'un parent inconnu ou introuvable) */
  connues: Set<number>
  closes: Set<number>
  quartiers: Quartier[]
  paternelle: string[]
  maternelle: string[]
  /** Du Sosa 1 au plus lointain ancêtre */
  plusLongue: string[]
  pistes: Piste[]
  implexes: Implexe[]
  nbImplexes: number
  siecles: [number, number][]
  duree: { pere?: Resume; mere?: Resume }
  noms: [string, number][]
  nbNoms: number
}

const estClos = (e: EtatParent) => e === 'inconnu' || e === 'introuvable'

export function ascendance(d: Donnees): Ascendance {
  const { arbre } = d
  const ind = (id: string) => arbre.individus.get(id)!
  const naissance = (id: string) => annee(d.suivis.get(id)?.naissance.evenement?.date)

  // Toutes les places occupées, génération par génération
  const parSosa = new Map<bigint, string>()
  const occurrences: { id: string; sosa: bigint; g: number }[] = []
  let courante = arbre.individus.has(d.racine) ? [{ id: d.racine, sosa: 1n }] : []
  for (let g = 1; courante.length && occurrences.length < MAX_PLACES; g++) {
    const suivante: typeof courante = []
    for (const o of courante) {
      occurrences.push({ ...o, g })
      parSosa.set(o.sosa, o.id)
      const { pere, mere } = parents(arbre, ind(o.id))
      if (pere) suivante.push({ id: pere.id, sosa: o.sosa * 2n })
      if (mere) suivante.push({ id: mere.id, sosa: o.sosa * 2n + 1n })
    }
    courante = suivante
  }
  const ancetres = [...d.ancetres.values()]
  const etats = new Map(ancetres.map((a) => [a.id, etatParents(arbre, ind(a.id))]))

  // ——— Branches ———
  // une seule passe : chaque place est rangée sous ses ancêtres de rang 4 à 15 (Sosa 4..7 et 8..15)
  const parBranche = new Map<number, typeof occurrences>()
  for (const o of occurrences) {
    for (let k = 2; k <= 3 && k < o.g; k++) {
      const sosa = Number(o.sosa >> BigInt(o.g - 1 - k))
      const l = parBranche.get(sosa)
      if (l) l.push(o)
      else parBranche.set(sosa, [o])
    }
  }
  const branche = (sosa: number): Branche => {
    const k = Math.floor(Math.log2(sosa))
    const s = BigInt(sosa)
    const dedans = parBranche.get(sosa) ?? []
    const parG = new Array<number>(15).fill(0)
    for (const o of dedans) if (o.g <= 14) parG[o.g]++
    const completude: number[] = []
    for (let g = k + 1; g <= 14; g++) completude.push(parG[g] / 2 ** (g - 1 - k))
    return {
      sosa, id: parSosa.get(s), distincts: new Set(dedans.map((o) => o.id)).size,
      profondeur: dedans.reduce((m, o) => Math.max(m, o.g), 0), completude,
    }
  }
  const quartiers = [4, 5, 6, 7].map((q) => ({ ...branche(q), sous: [branche(2 * q), branche(2 * q + 1)] }))

  // ——— Lignées ———
  const lignee = (cote: 'pere' | 'mere') => {
    const l: string[] = []
    for (let i: Individu | undefined = ind(d.racine); i && l.length < 200; i = parents(arbre, i)[cote]) l.push(i.id)
    return l
  }
  const loin = occurrences.reduce((a, b) => (b.g > a.g || (b.g === a.g && b.sosa < a.sosa) ? b : a), occurrences[0])
  const plusLongue: string[] = []
  if (loin) for (let s = loin.sosa; s >= 1n; s >>= 1n) plusLongue.unshift(parSosa.get(s)!)

  // ——— Pistes et places sans issue ———
  const pistes: Piste[] = ancetres
    .map((a) => ({ id: a.id, generation: a.generation, sosa: a.sosa, ...etats.get(a.id)! }))
    .filter((p) => p.pere !== 'connu' || p.mere !== 'connu')
    .sort((a, b) => a.generation - b.generation || comparerSosa(a.sosa, b.sosa))
  const aChercher = pistes.filter((p) => p.pere === 'a-chercher' || p.mere === 'a-chercher')
  const fermees = pistes.filter((p) => estClos(p.pere) || estClos(p.mere))

  // ——— Implexe ———
  const parId = new Map<string, { sosa: bigint; g: number }[]>()
  for (const o of occurrences) parId.set(o.id, [...(parId.get(o.id) ?? []), o])
  const repetes = [...parId.entries()].filter(([, l]) => l.length > 1)
    .map(([id, l]) => ({ id, g: l[0].g, sosas: l.map((x) => x.sosa) }))
    .sort((a, b) => a.g - b.g || (a.sosas[0] < b.sosas[0] ? -1 : 1))
  const implexes: Implexe[] = []
  for (let i = 0; i < repetes.length && implexes.length < 30; i++) {
    const a = repetes[i]
    const b = repetes[i + 1]
    // un couple : le père (Sosa pair) suivi de la mère
    const couple = b && a.sosas[0] % 2n === 0n && b.sosas[0] === a.sosas[0] + 1n
    const membres = couple ? [a, b] : [a]
    implexes.push({ ids: membres.map((m) => m.id), generation: a.g, sosas: membres.map((m) => m.sosas.slice(0, 4).map(String)) })
    if (couple) i++
  }

  // ——— Places de l'éventail ———
  const limite = 2n ** BigInt(GENERATIONS_EVENTAIL)
  const connues = new Set(occurrences.filter((o) => o.sosa < limite).map((o) => Number(o.sosa)))
  const closes = new Set<number>()
  for (const p of fermees) for (const o of parId.get(p.id) ?? []) {
    if (2n * o.sosa >= limite) continue
    if (estClos(p.pere)) closes.add(Number(2n * o.sosa))
    if (estClos(p.mere)) closes.add(Number(2n * o.sosa + 1n))
  }

  // ——— Génération par génération ———
  const comptes = new Map<string, number>()
  for (const a of ancetres) {
    const l = d.suivis.get(a.id)?.naissance.evenement?.lieu
    const p = l ? decouper(l).pays : undefined
    if (p) comptes.set(p, (comptes.get(p) ?? 0) + 1)
  }
  const paysPrincipal = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  const estimee = (id: string) => naissance(id) ?? anneeNaissanceEstimee(arbre, ind(id), d.suivis.get(id)!.naissance)
  const gens = generations(d)
  const detail: GenerationDetaillee[] = gens.map((x) => {
    const g = x.generation
    const ici = ancetres.filter((a) => a.generation === g)
    const annees = ici.map((a) => estimee(a.id)).filter((v): v is number => v !== undefined)
    const pays = new Map<string, number>()
    for (const a of ici) {
      const l = d.suivis.get(a.id)?.naissance.evenement?.lieu
      const p = l ? decouper(l).pays : undefined
      if (p) pays.set(p, (pays.get(p) ?? 0) + 1)
    }
    let pere: number | undefined
    let mere: number | undefined
    if (g >= 2) {
      const moitie = 2 ** (g - 2)
      const lieu = occurrences.filter((o) => o.g === g)
      pere = lieu.filter((o) => o.sosa >> BigInt(g - 2) === 2n).length / moitie
      mere = lieu.filter((o) => o.sosa >> BigInt(g - 2) === 3n).length / moitie
    }
    return {
      ...x, reste: x.theoriques - x.closes - x.connus,
      debut: annees.length ? Math.min(...annees) : undefined, fin: annees.length ? Math.max(...annees) : undefined,
      sourcees: ici.filter((a) => d.suivis.get(a.id)?.naissance.etat === 'source').length,
      pays: [...pays.entries()].sort((a, b) => b[1] - a[1]), pere, mere, etapes: [],
    }
  })
  const completes = gens.filter((g) => g.connus === g.theoriques - g.closes).length

  // Ce qu'on rencontre en chemin
  const etape = (g: number, e: Etape) => { if (detail[g - 1]) detail[g - 1].etapes.push(e) }
  if (paysPrincipal) {
    const premier = ancetres.filter((a) => {
      const l = d.suivis.get(a.id)?.naissance.evenement?.lieu
      const p = l ? decouper(l).pays : undefined
      return p && p !== paysPrincipal
    }).sort((a, b) => a.generation - b.generation || comparerSosa(a.sosa, b.sosa))[0]
    if (premier && premier.generation > 1) etape(premier.generation, { type: 'etranger', id: premier.id, pays: decouper(d.suivis.get(premier.id)!.naissance.evenement!.lieu!).pays!, principal: paysPrincipal })
  }
  if (completes > 1) etape(completes, { type: 'complete', places: gens[completes - 1].theoriques })
  // les places fermées apparaissent à la génération au-dessus de l'enfant
  for (let g = 2; g <= 12; g++) {
    const l = fermees.filter((p) => p.generation === g - 1)
    if (l.length) etape(g, { type: 'sans-issue', pistes: l.slice(0, 3), total: l.length })
  }
  if (aChercher[0]) etape(aChercher[0].generation, { type: 'mur', piste: aChercher[0] })
  if (implexes[0]) etape(implexes[0].generation, { type: 'implexe', implexe: implexes[0] })
  const plusFournie = detail.reduce((a, b) => (b.distincts > a.distincts ? b : a), detail[0])
  if (plusFournie && plusFournie.generation > completes) etape(plusFournie.generation, { type: 'plus-fournie', distincts: plusFournie.distincts })
  const peuSourcee = detail.find((x) => x.distincts >= 10 && x.sourcees / x.distincts < 0.1)
  if (peuSourcee) etape(peuSourcee.generation, { type: 'sources', sourcees: peuSourcee.sourcees, total: peuSourcee.distincts })

  // ——— Temps et noms ———
  const siecles = new Map<number, number>()
  for (const a of ancetres) {
    const y = estimee(a.id)
    if (y !== undefined) { const s = numeroSiecle(y); siecles.set(s, (siecles.get(s) ?? 0) + 1) }
  }
  const ecarts = { pere: [] as number[], mere: [] as number[] }
  for (const a of ancetres) {
    const n = naissance(a.id)
    if (n === undefined) continue
    const { pere, mere } = parents(arbre, ind(a.id))
    const np = pere && naissance(pere.id)
    const nm = mere && naissance(mere.id)
    if (np) ecarts.pere.push(n - np)
    if (nm) ecarts.mere.push(n - nm)
  }
  const noms = new Map<string, number>()
  for (const a of ancetres) {
    const n = ind(a.id).nom.trim()
    if (n && !/^\?+$/.test(n)) noms.set(n, (noms.get(n) ?? 0) + 1)
  }

  return {
    generations: detail, places: occurrences.length, distincts: ancetres.length, completes,
    implexe: occurrences.length ? (occurrences.length - ancetres.length) / occurrences.length : 0,
    connues, closes, quartiers, paternelle: lignee('pere'), maternelle: lignee('mere'), plusLongue,
    pistes: aChercher, implexes, nbImplexes: repetes.length,
    siecles: [...siecles.entries()].sort((a, b) => a[0] - b[0]),
    duree: { pere: resumer(ecarts.pere.filter((x) => x > 12 && x < 80)), mere: resumer(ecarts.mere.filter((x) => x > 12 && x < 60)) },
    noms: [...noms.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, 30), nbNoms: noms.size,
  }
}
