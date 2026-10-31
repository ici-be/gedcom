// Doublons potentiels : des personnes de même nom et prénom, aux dates et lieux qui ne se contredisent pas.
// Sans date ni lieu en commun, deux homonymes ne sont pas signalés : rien ne dit que c'est la même personne.

import type { Arbre, Individu } from './gedcom/arbre'
import { annee, type Qualif } from './gedcom/dates'
import { decouper } from './geo'
import { cleGeneWeb, parents } from './parente'

export interface Doublon {
  a: string
  b: string
  /** Ce qui rapproche les deux fiches */
  indices: string[]
  score: number
}

/** Au plus autant de personnes sous le même nom, pour borner le calcul des paires */
const MAX_GROUPE = 300
/** Écart d'années toléré entre deux dates du même fait (une date vers, un baptême plutôt qu'une naissance) */
const ECART = 2
const SCORE_MINI = 2

const premier = (ind: Individu, tags: string[]) => {
  for (const t of tags) {
    const e = ind.evenements.find((x) => x.tag === t && (x.date || x.lieu))
    if (e) return e
  }
  return undefined
}

interface Fiche {
  ind: Individu
  naissance?: number
  deces?: number
  /** Qualificatif des dates (« avant », « après »…), pour ne pas les prendre pour des dates exactes */
  qNaissance?: Qualif
  qDeces?: Qualif
  lieuNaissance?: string
  lieuDeces?: string
  prenoms: string[]
  pere: string
  mere: string
  conjoints: Set<string>
}

const cleLieu = (l?: string) => (l ? cleGeneWeb(decouper(l).commune) : undefined) || undefined

function fiche(arbre: Arbre, ind: Individu): Fiche {
  const n = premier(ind, ['BIRT', 'BAPM', 'CHR'])
  const d = premier(ind, ['DEAT', 'BURI', 'CREM'])
  const { pere, mere } = parents(arbre, ind)
  const conjoints = new Set<string>()
  for (const f of ind.fams) {
    const fam = arbre.familles.get(f)
    const c = arbre.individus.get((fam?.mari === ind.id ? fam.femme : fam?.mari) ?? '')
    if (c) conjoints.add(cleGeneWeb(c.prenom.split(/\s+/)[0] ?? '') + '|' + cleGeneWeb(c.nom))
  }
  return {
    ind,
    naissance: annee(n?.date), deces: annee(d?.date), qNaissance: n?.date?.qualif, qDeces: d?.date?.qualif, lieuNaissance: cleLieu(n?.lieu), lieuDeces: cleLieu(d?.lieu),
    prenoms: cleGeneWeb(ind.prenom).split(' ').filter(Boolean),
    pere: pere ? cleGeneWeb(pere.prenom.split(/\s+/)[0] ?? '') + '|' + cleGeneWeb(pere.nom) : '',
    mere: mere ? cleGeneWeb(mere.prenom.split(/\s+/)[0] ?? '') + '|' + cleGeneWeb(mere.nom) : '',
    conjoints,
  }
}

/** Mêmes prénoms, ou les prénoms de l'un au début de ceux de l'autre (« Jean » et « Jean Baptiste ») */
function prenomsCompatibles(x: string[], y: string[]): boolean {
  const [court, long] = x.length <= y.length ? [x, y] : [y, x]
  return court.length > 0 && court.every((p, i) => long[i] === p)
}

function apparentes(arbre: Arbre, a: Individu, b: Individu): boolean {
  if (a.famc.some((f) => arbre.familles.get(f)?.enfants.includes(b.id))) return true
  if (b.famc.some((f) => arbre.familles.get(f)?.enfants.includes(a.id))) return true
  if (a.fams.some((f) => b.fams.includes(f))) return true
  // parent et enfant, frère et sœur
  for (const f of a.famc) {
    const fam = arbre.familles.get(f)
    if (fam && (fam.mari === b.id || fam.femme === b.id)) return true
  }
  for (const f of b.famc) {
    const fam = arbre.familles.get(f)
    if (fam && (fam.mari === a.id || fam.femme === a.id)) return true
  }
  return false
}

function comparer(arbre: Arbre, x: Fiche, y: Fiche): Doublon | undefined {
  const a = x.ind
  const b = y.ind
  if (a.sexe !== '?' && b.sexe !== '?' && a.sexe !== b.sexe) return undefined
  if (apparentes(arbre, a, b)) return undefined
  const indices: string[] = []
  let score = 0
  for (const [u, v, quoi, qu, qv] of [[x.naissance, y.naissance, 'né', x.qNaissance, y.qNaissance], [x.deces, y.deces, 'mort', x.qDeces, y.qDeces]] as const) {
    if (u === undefined || v === undefined) continue
    const ecart = Math.abs(u - v)
    if (ecart > ECART) return undefined
    // « avant 1948 » et le 16 avril 1948 : compatibles, mais ce n'est pas la même année
    const borne = (q?: Qualif) => q === 'avant' || q === 'après'
    if (borne(qu) || borne(qv)) {
      const [bq, bu, eu] = borne(qu) ? [qu, u, v] : [qv, v, u]
      if ((bq === 'avant' && eu > bu) || (bq === 'après' && eu < bu)) return undefined
      score += 1
      indices.push(`${quoi} dans des dates compatibles (${u}, ${v})`)
      continue
    }
    score += ecart <= 1 ? 2 : 1
    indices.push(ecart === 0 ? `${quoi} la même année (${u})` : `${quoi} à ${ecart} an${ecart > 1 ? 's' : ''} d’écart (${u}, ${v})`)
  }
  if (x.lieuNaissance && x.lieuNaissance === y.lieuNaissance) { score++; indices.push('même lieu de naissance') }
  if (x.lieuDeces && x.lieuDeces === y.lieuDeces) { score++; indices.push('même lieu de décès') }
  if (x.pere && x.pere === y.pere) { score += 2; indices.push('même père') }
  if (x.mere && x.mere === y.mere) { score += 2; indices.push('même mère') }
  if ([...x.conjoints].some((c) => y.conjoints.has(c))) { score += 2; indices.push('même conjoint') }
  // des parents ou des lieux qui se contredisent, sans date pour trancher : c'est probablement un homonyme
  if (x.lieuNaissance && y.lieuNaissance && x.lieuNaissance !== y.lieuNaissance && score < 4) return undefined
  if (x.pere && y.pere && x.pere !== y.pere && x.mere && y.mere && x.mere !== y.mere) return undefined
  return score >= SCORE_MINI ? { a: a.id, b: b.id, indices, score } : undefined
}

/** Les paires de personnes qui pourraient n'en faire qu'une, les plus probables d'abord */
export function doublons(arbre: Arbre): Doublon[] {
  const groupes = new Map<string, Fiche[]>()
  for (const ind of arbre.individus.values()) {
    const f = fiche(arbre, ind)
    const nom = cleGeneWeb(ind.nom)
    if (!nom || !f.prenoms.length) continue
    const k = nom + '|' + f.prenoms[0]
    const l = groupes.get(k)
    if (l) l.push(f)
    else groupes.set(k, [f])
  }
  const resultat: Doublon[] = []
  for (const l of groupes.values()) {
    if (l.length < 2 || l.length > MAX_GROUPE) continue
    for (let i = 0; i < l.length; i++) {
      for (let j = i + 1; j < l.length; j++) {
        if (!prenomsCompatibles(l[i].prenoms, l[j].prenoms)) continue
        const d = comparer(arbre, l[i], l[j])
        if (d) resultat.push(d)
      }
    }
  }
  return resultat.sort((p, q) => q.score - p.score || p.a.localeCompare(q.a))
}
