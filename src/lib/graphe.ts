// Graphe des relations : qui est lié à qui dans l'arbre, par la famille et par les actes (témoins, parrains et marraines).
//
// Ce que fait l'ancien modèle (projet Symfony) et qui est corrigé ici :
// - les témoins sont lus événement par événement (« 2 ASSO » sous BIRT, BAPM, DEAT, MARR), sans en perdre ni en
//   prêter à l'événement suivant ; les « 1 ASSO @F…@ » de Geneanet, qui répètent ceux du mariage, sont ignorés ;
// - parrains et marraines (RELA GODP) sont distingués des témoins ;
// - le lien avec les parents ne vaut que pour la naissance ou le baptême (ce sont eux qui choisissent témoins,
//   parrain et marraine), pas pour le mariage ou le décès de l'enfant ;
// - un lien de famille compte une fois, pas une fois dans chaque sens ; frères et sœurs ne sont reliés directement
//   que si aucun de leurs parents n'est dans le graphe (sinon les parents les relient déjà).

import type { Arbre, Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import type { IndexMetiers } from './metiers'
import { sansAccents } from './metiers'
import { lienDeParente } from './parente'

/** famille : conjoints, parent et enfant, frères et sœurs · temoin, parrain : dans un acte · cotemoin : témoins du même acte */
export type TypeLien = 'famille' | 'temoin' | 'parrain' | 'cotemoin'
export const TYPES_LIENS: TypeLien[] = ['famille', 'parrain', 'temoin', 'cotemoin']

/** Un lien attesté entre deux personnes */
export interface Fait {
  type: TypeLien
  a: string
  b: string
  /** L'acte qui l'atteste (pas pour la famille) */
  acte?: Acte
  /** a est témoin ou parrain de l'acte d'un enfant de b (choisi par les parents) */
  parEnfant?: string
  /** Frères et sœurs, relié faute de parents dans le graphe */
  fratrie?: boolean
}

export interface Acte { tag: string; date?: number; sujets: string[] }

const POIDS: Record<TypeLien, number> = { famille: 3, parrain: 2, temoin: 2, cotemoin: 1 }

/** Tous les liens de l'arbre, calculés une fois par arbre */
const cache = new WeakMap<Arbre, { faits: Fait[]; parPersonne: Map<string, Fait[]> }>()

function estParrain(rela: string): boolean {
  return /god|parrain|marraine|peter|meter/i.test(rela)
}

const NAISSANCE = new Set(['BIRT', 'BAPM', 'CHR'])

export function liensDeLArbre(arbre: Arbre): { faits: Fait[]; parPersonne: Map<string, Fait[]> } {
  const deja = cache.get(arbre)
  if (deja) return deja
  const faits: Fait[] = []
  const actes: { e: Evenement; sujets: string[] }[] = []
  for (const fam of arbre.familles.values()) {
    const conj = [fam.mari, fam.femme].filter((x): x is string => !!x && arbre.individus.has(x))
    if (conj.length === 2) faits.push({ type: 'famille', a: conj[0], b: conj[1] })
    for (const e of fam.enfants) {
      if (!arbre.individus.has(e)) continue
      for (const p of conj) faits.push({ type: 'famille', a: p, b: e })
    }
    for (const e of fam.evenements) if (e.temoins?.length && conj.length) actes.push({ e, sujets: conj })
  }
  for (const ind of arbre.individus.values()) {
    for (const e of ind.evenements) if (e.temoins?.length) actes.push({ e, sujets: [ind.id] })
  }
  for (const { e, sujets } of actes) {
    const acte: Acte = { tag: e.tag, date: annee(e.date), sujets }
    const temoins = [...new Map(e.temoins!.filter((t) => arbre.individus.has(t.id) && !sujets.includes(t.id)).map((t) => [t.id, t])).values()]
    for (const t of temoins) {
      const type: TypeLien = estParrain(t.rela) ? 'parrain' : 'temoin'
      for (const s of sujets) faits.push({ type, a: t.id, b: s, acte })
      // à la naissance ou au baptême, témoins et parrains sont choisis par les parents
      if (NAISSANCE.has(e.tag) && sujets.length === 1) {
        for (const fid of arbre.individus.get(sujets[0])!.famc) {
          const fam = arbre.familles.get(fid)
          for (const p of [fam?.mari, fam?.femme]) {
            if (p && p !== t.id && arbre.individus.has(p)) faits.push({ type, a: t.id, b: p, acte, parEnfant: sujets[0] })
          }
        }
      }
    }
    for (let i = 0; i < temoins.length; i++) {
      for (let j = i + 1; j < temoins.length; j++) faits.push({ type: 'cotemoin', a: temoins[i].id, b: temoins[j].id, acte })
    }
  }
  const parPersonne = new Map<string, Fait[]>()
  for (const f of faits) {
    for (const id of [f.a, f.b]) {
      const l = parPersonne.get(id)
      if (l) l.push(f)
      else parPersonne.set(id, [f])
    }
  }
  const r = { faits, parPersonne }
  cache.set(arbre, r)
  return r
}

export type Mode = 'entourage' | 'metiers' | 'nom' | 'lieu'

export interface Critere {
  mode: Mode
  /** Clés des métiers choisis, dans l'ordre du choix (il fixe les couleurs) */
  metiers: string[]
  /** Nom ou lieu, avec * et ? */
  texte: string
  /** Personne au centre de l'entourage, et nombre de pas autour d'elle */
  personne: string
  pas: number
  /** Ajouter parents, conjoints et enfants des personnes trouvées */
  famille: boolean
  types: TypeLien[]
}

export interface Noeud {
  id: string
  /** Trouvé par le critère (et non ajouté comme famille proche) */
  trouve: boolean
  /** Index du premier métier choisi qu'il exerce, pour la couleur */
  metier?: number
  /** Nombre de personnes auxquelles il est relié dans le graphe */
  degre: number
  poids: number
}

export interface Arete {
  a: string
  b: string
  /** Le type le plus fort (famille > parrain > témoin > co-témoin) */
  type: TypeLien
  poids: number
  faits: Fait[]
}

export interface Graphe { noeuds: Noeud[]; aretes: Arete[]; isoles: number }

/** « v*k*man? » → expression qui cherche ce motif n'importe où, sans accents ni majuscules */
export function motif(texte: string): RegExp | undefined {
  const t = sansAccents(texte)
  if (!t) return undefined
  return new RegExp(t.split('').map((c) => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&'))).join(''))
}

function trouver(arbre: Arbre, metiers: IndexMetiers, c: Critere): Set<string> {
  const ids = new Set<string>()
  if (c.mode === 'metiers') {
    for (const cle of c.metiers) for (const id of metiers.metiers.get(cle)?.personnes.keys() ?? []) ids.add(id)
  } else if (c.mode === 'nom' || c.mode === 'lieu') {
    const re = motif(c.texte)
    if (!re) return ids
    for (const ind of arbre.individus.values()) {
      if (c.mode === 'nom') {
        if (re.test(sansAccents(ind.prenom + ' ' + ind.nom)) || re.test(sansAccents(ind.nom + ' ' + ind.prenom))) ids.add(ind.id)
      } else {
        const evs = [...ind.evenements, ...ind.fams.flatMap((f) => arbre.familles.get(f)?.evenements ?? [])]
        if (evs.some((e) => e.lieu && re.test(sansAccents(e.lieu)))) ids.add(ind.id)
      }
    }
  } else if (arbre.individus.has(c.personne)) {
    // entourage : de proche en proche, par les liens retenus
    const { parPersonne } = liensDeLArbre(arbre)
    ids.add(c.personne)
    let front = [c.personne]
    for (let n = 0; n < c.pas && front.length; n++) {
      const suivant: string[] = []
      for (const id of front) {
        for (const f of parPersonne.get(id) ?? []) {
          if (!c.types.includes(f.type)) continue
          const autre = f.a === id ? f.b : f.a
          if (!ids.has(autre)) { ids.add(autre); suivant.push(autre) }
        }
      }
      front = suivant
    }
  }
  return ids
}

/** Parents, conjoints et enfants */
function prochesFamille(arbre: Arbre, ind: Individu): string[] {
  const r: string[] = []
  for (const f of ind.famc) { const fam = arbre.familles.get(f); if (fam?.mari) r.push(fam.mari); if (fam?.femme) r.push(fam.femme) }
  for (const f of ind.fams) {
    const fam = arbre.familles.get(f)
    if (!fam) continue
    for (const x of [fam.mari, fam.femme, ...fam.enfants]) if (x && x !== ind.id) r.push(x)
  }
  return r.filter((x) => arbre.individus.has(x))
}

export function construireGraphe(arbre: Arbre, metiers: IndexMetiers, c: Critere, masquerIsoles: boolean): Graphe {
  const trouves = trouver(arbre, metiers, c)
  const ids = new Set(trouves)
  if (c.famille && c.mode !== 'entourage') {
    for (const id of trouves) for (const p of prochesFamille(arbre, arbre.individus.get(id)!)) ids.add(p)
  }
  const { faits } = liensDeLArbre(arbre)
  const aretes = new Map<string, Arete>()
  const ajouter = (f: Fait) => {
    const [a, b] = f.a < f.b ? [f.a, f.b] : [f.b, f.a]
    const cle = a + ' ' + b
    const x = aretes.get(cle)
    if (!x) aretes.set(cle, { a, b, type: f.type, poids: POIDS[f.type], faits: [f] })
    else {
      x.faits.push(f)
      x.poids += POIDS[f.type]
      if (TYPES_LIENS.indexOf(f.type) < TYPES_LIENS.indexOf(x.type)) x.type = f.type
    }
  }
  for (const f of faits) if (c.types.includes(f.type) && ids.has(f.a) && ids.has(f.b)) ajouter(f)
  // frères et sœurs dont aucun parent n'est dans le graphe
  if (c.types.includes('famille')) {
    for (const fam of arbre.familles.values()) {
      if ((fam.mari && ids.has(fam.mari)) || (fam.femme && ids.has(fam.femme))) continue
      const enf = fam.enfants.filter((e) => ids.has(e))
      for (let i = 0; i < enf.length; i++) for (let j = i + 1; j < enf.length; j++) ajouter({ type: 'famille', a: enf[i], b: enf[j], fratrie: true })
    }
  }
  const degre = new Map<string, number>()
  const poids = new Map<string, number>()
  for (const ar of aretes.values()) {
    for (const id of [ar.a, ar.b]) { degre.set(id, (degre.get(id) ?? 0) + 1); poids.set(id, (poids.get(id) ?? 0) + ar.poids) }
  }
  const noeuds: Noeud[] = []
  let isoles = 0
  for (const id of ids) {
    const d = degre.get(id) ?? 0
    // la personne au centre de l'entourage reste, même seule
    if (!d && id !== c.personne) isoles++
    if (!d && masquerIsoles && !(c.mode === 'entourage' && id === c.personne)) continue
    const n: Noeud = { id, trouve: trouves.has(id), degre: d, poids: poids.get(id) ?? 0 }
    if (c.mode === 'metiers') {
      const i = c.metiers.findIndex((cle) => metiers.metiers.get(cle)?.personnes.has(id))
      if (i >= 0) n.metier = i
    }
    noeuds.push(n)
  }
  return { noeuds, aretes: [...aretes.values()], isoles }
}

const ACTE: Record<string, [string, string]> = {
  // [de quelqu'un, de la personne vue]
  BIRT: ['à la naissance de', 'à sa naissance'], BAPM: ['au baptême de', 'à son baptême'], CHR: ['au baptême de', 'à son baptême'],
  MARR: ['au mariage de', 'à son mariage'], DEAT: ['au décès de', 'à son décès'], BURI: ['à l’inhumation de', 'à son inhumation'],
}

function prenomNom(arbre: Arbre, id: string): string {
  const i = arbre.individus.get(id)
  return i ? `${i.prenom.split(/\s+/)[0] || '?'} ${i.nom}`.trim() : '?'
}

const prenom = (arbre: Arbre, id: string) => arbre.individus.get(id)?.prenom.split(/\s+/)[0] || '?'
const quand = (a: Acte) => (a.date ? ` (${a.date})` : '')
/** « au mariage de Jean Dupont et Marie Lambert » */
const acteDe = (arbre: Arbre, a: Acte) => `${(ACTE[a.tag] ?? ['à l’acte de'])[0]} ${a.sujets.map((s) => prenomNom(arbre, s)).join(' et ')}`
/** « à son mariage » */
const sonActe = (a: Acte) => (ACTE[a.tag] ?? ['', 'à un acte le concernant'])[1]

/**
 * Ce qu'est `autre` pour `vu`, d'après un fait : « père », « témoin à son mariage (1820) »,
 * « sa marraine (1823) », « Paul témoin à son décès (1850) »…
 */
export function decrire(arbre: Arbre, f: Fait, vu: string): string {
  const autre = f.a === vu ? f.b : f.a
  const iv = arbre.individus.get(vu)
  const ia = arbre.individus.get(autre)
  const femA = ia?.sexe === 'F'
  if (f.type === 'famille') {
    if (f.fratrie) return femA ? 'sœur' : ia?.sexe === 'M' ? 'frère' : 'frère ou sœur'
    return (iv && ia && lienDeParente(arbre, iv, ia)?.terme) || 'famille'
  }
  const a = f.acte!
  if (f.type === 'cotemoin') return `témoins ensemble ${acteDe(arbre, a)}${quand(a)}`
  const parrain = f.type === 'parrain'
  // f.a : le témoin ou le parrain · f.b : la personne de l'acte, ou l'un de ses parents (parEnfant)
  if (f.parEnfant) {
    const enfant = prenomNom(arbre, f.parEnfant)
    const qui = f.a === autre ? '' : prenom(arbre, vu) + ' '
    const fem = arbre.individus.get(f.a)?.sexe === 'F'
    return `${qui}${parrain ? (fem ? 'marraine' : 'parrain') : 'témoin'} ${(ACTE[a.tag] ?? ['à l’acte de'])[0]} son enfant ${enfant}${quand(a)}`
  }
  if (f.a === autre) return parrain ? `${femA ? 'sa marraine' : 'son parrain'}${quand(a)}` : `témoin ${sonActe(a)}${quand(a)}`
  return parrain ? `${femA ? 'filleule' : 'filleul'}${quand(a)}` : `${prenom(arbre, vu)} témoin ${sonActe(a)}${quand(a)}`
}

