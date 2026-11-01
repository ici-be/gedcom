// Calculateur de parenté : le lien entre deux personnes quelconques de l'arbre, à n'importe quelle distance.
// Parenté de sang : les plus proches ancêtres communs, le chemin de chacun jusqu'à eux, le terme (cousin germain, grand-oncle…),
// le degré civil et la part de gènes partagée. Sinon, parenté par alliance : le plus court chemin par les unions.

import type { Arbre, Individu } from './gedcom/arbre'
import { lienDeParente, parents } from './parente'

/** Générations remontées au plus */
const PROFONDEUR = 40
/** Chemins gardés au plus (une personne peut avoir cent routes vers un même ancêtre éloigné) */
const CHEMINS_MAX = 8

type Sexe = Individu['sexe']
const fem = (s: Sexe) => s === 'F'
const accord = (s: Sexe, m: string, f: string) => (fem(s) ? f : m)

const rang = (n: number) => (n === 1 ? '1ᵉʳ' : `${n}ᵉ`)

/** Ce qu'est un ascendant à `n` générations : père, grand-père, arrière-grand-père… */
export function termeAscendant(n: number, s: Sexe): string {
  if (n === 1) return accord(s, 'père', 'mère')
  if (n === 2) return accord(s, 'grand-père', 'grand-mère')
  if (n === 3) return accord(s, 'arrière-grand-père', 'arrière-grand-mère')
  if (n === 4) return accord(s, 'arrière-arrière-grand-père', 'arrière-arrière-grand-mère')
  return `${accord(s, 'ancêtre', 'ancêtre')} à la ${rang(n)} génération`
}

/** Ce qu'est un descendant à `n` générations : fils, petit-fils, arrière-petit-fils… */
export function termeDescendant(n: number, s: Sexe): string {
  if (n === 1) return accord(s, 'fils', 'fille')
  if (n === 2) return accord(s, 'petit-fils', 'petite-fille')
  if (n === 3) return accord(s, 'arrière-petit-fils', 'arrière-petite-fille')
  if (n === 4) return accord(s, 'arrière-arrière-petit-fils', 'arrière-arrière-petite-fille')
  return `descendant${fem(s) ? 'e' : ''} à la ${rang(n)} génération`
}

/** Oncle ou tante à `n` générations de l'ancêtre commun : oncle (2), grand-oncle (3)… */
function termeOncle(na: number, s: Sexe): string {
  const base = accord(s, 'oncle', 'tante')
  if (na === 2) return base
  if (na === 3) return `grand-${base}`
  if (na === 4) return `arrière-grand-${base}`
  return `${base} à la ${rang(na)} génération`
}

function termeNeveu(nb: number, s: Sexe): string {
  const base = accord(s, 'neveu', 'nièce')
  if (nb === 2) return base
  if (nb === 3) return accord(s, 'petit-neveu', 'petite-nièce')
  if (nb === 4) return accord(s, 'arrière-petit-neveu', 'arrière-petite-nièce')
  return `${base} à la ${rang(nb)} génération`
}

/** Cousinage : germain (2,2), issu de germain (3,3), puis « du Ne degré » */
export function termeCousin(m: number, s: Sexe): string {
  const c = accord(s, 'cousin', 'cousine')
  if (m === 2) return `${c} ${accord(s, 'germain', 'germaine')}`
  if (m === 3) return `${c} ${accord(s, 'issu', 'issue')} de ${accord(s, 'germain', 'germaine')}`
  return `${c} du ${rang(m - 1)} degré`
}

export interface Terme {
  /** « cousine germaine » */
  terme: string
  /** Autre nom d'usage : « oncle à la mode de Bretagne » */
  alias?: string
  /**
   * Quand le lien passe par un ascendant ou un descendant (« cousin germain du grand-père de… ») :
   * `terme` s'applique alors à lui, et la personne cherchée est son `role`
   */
  pivot?: { sur: 'sujet' | 'autre'; role: string; /** Générations entre la personne cherchée (ou le sujet) et le pivot */ distance: number; /** Le pivot est une femme */ f?: boolean }
  /** Distance de chacun à l'ancêtre commun, en générations */
  na: number
  nb: number
}

/**
 * Ce qu'est `autre` (à `nb` générations de l'ancêtre commun) pour `sujet` (à `na` générations).
 * `demi` : un seul parent en commun (demi-frère, demi-sœur).
 */
export function terme(na: number, nb: number, autre: Sexe, sujet: Sexe, demi = false): Terme {
  const base = { na, nb }
  const demiT = (t: string) => (demi ? `demi-${t}` : t)
  if (na === 0 && nb === 0) return { ...base, terme: 'la même personne' }
  if (nb === 0) return { ...base, terme: termeAscendant(na, autre) }
  if (na === 0) return { ...base, terme: termeDescendant(nb, autre) }
  if (na === 1 && nb === 1) return { ...base, terme: demiT(accord(autre, 'frère', 'sœur')) }
  if (na === 1) return { ...base, terme: termeNeveu(nb, autre) }
  if (nb === 1) return { ...base, terme: termeOncle(na, autre) }
  const m = Math.min(na, nb)
  const d = na - nb
  const cousin = termeCousin(m, autre)
  if (d === 0) return { ...base, terme: demiT(cousin) }
  if (d === 1 && m === 2) return { ...base, terme: accord(autre, 'oncle à la mode de Bretagne', 'tante à la mode de Bretagne'), alias: `${cousin} de l’un de ses parents` }
  if (d === -1 && m === 2) return { ...base, terme: accord(autre, 'neveu à la mode de Bretagne', 'nièce à la mode de Bretagne'), alias: `${termeDescendant(1, autre)} d’un cousin germain` }
  // plus d'une génération d'écart, ou cousinage éloigné : par rapport à un ascendant (ou un descendant) de l'autre
  if (d > 0) return { ...base, terme: termeCousin(m, autre), pivot: { sur: 'sujet', role: termeAscendant(d, sujet), distance: d } }
  return { ...base, terme: termeDescendant(-d, autre), pivot: { sur: 'autre', role: termeCousin(m, sujet), distance: -d } }
}

export interface Noeud {
  id: string
  /** Distance au sujet (ou à l'autre) : 0 pour lui-même */
  rang: number
}

export interface Chemin {
  /** L'ancêtre commun, ou le couple d'ancêtres communs */
  communs: string[]
  na: number
  nb: number
  /** Du sujet jusqu'à l'enfant des ancêtres communs, puis de l'autre */
  montee: string[]
  descente: string[]
  demi: boolean
  terme: Terme
  /** Part de gènes partagée par ce chemin */
  part: number
}

export interface Etape {
  de: string
  /** « fils de », « époux de »… */
  lien: string
  vers: string
}

export type Parente =
  | { type: 'identique' }
  | { type: 'sang'; chemins: Chemin[]; terme: Terme; inverse: Terme; degre: number; part: number; implexe: boolean }
  | { type: 'alliance'; etapes: Etape[]; terme: string; inverse: string }
  | { type: 'aucun' }

interface Montee {
  /** distance minimale */
  n: Map<string, number>
  /** l'enfant par lequel on est arrivé à cet ancêtre (pour retracer le chemin) */
  par: Map<string, string>
}

function ancetres(arbre: Arbre, id: string): Montee {
  const n = new Map<string, number>([[id, 0]])
  const par = new Map<string, string>()
  let rangee = [id]
  for (let g = 1; g <= PROFONDEUR && rangee.length; g++) {
    const suivante: string[] = []
    for (const x of rangee) {
      const ind = arbre.individus.get(x)
      if (!ind) continue
      const p = parents(arbre, ind)
      for (const q of [p.pere, p.mere]) {
        if (!q || n.has(q.id)) continue
        n.set(q.id, g)
        par.set(q.id, x)
        suivante.push(q.id)
      }
    }
    rangee = suivante
  }
  return { n, par }
}

/** D'un ancêtre jusqu'à la personne dont on est parti, sans l'ancêtre : [enfant de l'ancêtre, …, personne] */
function retracer(m: Montee, ancetre: string, origine: string): string[] {
  const chemin: string[] = []
  for (let x = m.par.get(ancetre); x !== undefined; x = x === origine ? undefined : m.par.get(x)) {
    chemin.push(x)
    if (x === origine) break
  }
  return chemin
}

/** Tous les ancêtres (et la personne) de ceux qu'on donne : sert à écarter les ancêtres communs « dominés » */
function ascendance(arbre: Arbre, depart: Iterable<string>, vus: Set<string>) {
  const pile = [...depart]
  for (const x of pile) vus.add(x)
  while (pile.length) {
    const ind = arbre.individus.get(pile.pop()!)
    if (!ind) continue
    const p = parents(arbre, ind)
    for (const q of [p.pere, p.mere]) if (q && !vus.has(q.id)) { vus.add(q.id); pile.push(q.id) }
  }
}

function parenteSang(arbre: Arbre, a: Individu, b: Individu): Parente | undefined {
  const ma = ancetres(arbre, a.id), mb = ancetres(arbre, b.id)
  const communs = [...ma.n.keys()].filter((id) => mb.n.has(id))
  if (!communs.length) return undefined
  // les plus proches : un ancêtre commun dont un descendant est lui aussi ancêtre commun ne compte pas
  const domines = new Set<string>()
  for (const id of communs) {
    const ind = arbre.individus.get(id)
    if (!ind) continue
    const p = parents(arbre, ind)
    ascendance(arbre, [p.pere?.id, p.mere?.id].filter((x): x is string => !!x), domines)
  }
  const proches = communs.filter((id) => !domines.has(id))

  // un couple d'ancêtres communs ne fait qu'un chemin
  const faits = new Set<string>()
  const chemins: Chemin[] = []
  for (const id of proches) {
    if (faits.has(id)) continue
    const na = ma.n.get(id)!, nb = mb.n.get(id)!
    const ind = arbre.individus.get(id)!
    let conjoint: string | undefined
    for (const f of ind.fams) {
      const fam = arbre.familles.get(f)
      const c = fam ? (fam.mari === id ? fam.femme : fam.mari) : undefined
      if (c && proches.includes(c) && !faits.has(c) && ma.n.get(c) === na && mb.n.get(c) === nb) { conjoint = c; break }
    }
    faits.add(id)
    if (conjoint) faits.add(conjoint)
    // le chemin passe par le même enfant des deux côtés ? alors ce sont bien les deux parents (sinon, demi-parenté)
    const montee = retracer(ma, id, a.id).reverse()
    const descente = retracer(mb, id, b.id).reverse()
    // frère ou sœur : un seul parent en commun, et un autre parent connu de chaque côté, différent
    let demi = false
    if (na === 1 && nb === 1 && !conjoint) {
      const autreParent = (x: Individu) => [parents(arbre, x).pere, parents(arbre, x).mere].find((p) => p && p.id !== id)
      const oa = autreParent(a), ob = autreParent(b)
      demi = !!oa && !!ob && oa.id !== ob.id
    }
    const t = terme(na, nb, b.sexe, a.sexe, demi)
    // le pivot est une vraie personne : son sexe accorde le mot (grand-mère, cousine germaine)
    if (t.pivot) {
      const z = arbre.individus.get(t.pivot.sur === 'sujet' ? montee[t.pivot.distance] : descente[t.pivot.distance])
      const sexe = z?.sexe ?? '?'
      t.pivot.f = fem(sexe)
      t.pivot.role = t.pivot.sur === 'sujet' ? termeAscendant(t.pivot.distance, sexe) : termeCousin(Math.min(na, nb), sexe)
    }
    chemins.push({
      communs: conjoint ? [id, conjoint] : [id], na, nb, montee, descente, demi,
      terme: t,
      part: (conjoint ? 2 : 1) * Math.pow(0.5, na + nb),
    })
  }
  chemins.sort((x, y) => x.na + x.nb - (y.na + y.nb) || y.part - x.part)
  const premier = chemins[0]
  const part = Math.min(1, chemins.reduce((s, c) => s + c.part, 0))
  return {
    type: 'sang',
    chemins: chemins.slice(0, CHEMINS_MAX),
    terme: premier.terme,
    inverse: terme(premier.nb, premier.na, a.sexe, b.sexe, premier.terme.terme.startsWith('demi-')),
    degre: premier.na + premier.nb,
    part,
    implexe: chemins.length > 1,
  }
}

/** Le plus court chemin par les filiations et les unions */
function parAlliance(arbre: Arbre, a: Individu, b: Individu): Parente | undefined {
  const voisins = (id: string): [string, 'parent' | 'enfant' | 'conjoint'][] => {
    const ind = arbre.individus.get(id)
    if (!ind) return []
    const res: [string, 'parent' | 'enfant' | 'conjoint'][] = []
    for (const f of ind.famc) {
      const fam = arbre.familles.get(f)
      for (const p of [fam?.mari, fam?.femme]) if (p) res.push([p, 'parent'])
    }
    for (const f of ind.fams) {
      const fam = arbre.familles.get(f)
      if (!fam) continue
      const c = fam.mari === id ? fam.femme : fam.mari
      if (c) res.push([c, 'conjoint'])
      for (const e of fam.enfants) res.push([e, 'enfant'])
    }
    return res
  }
  const prec = new Map<string, [string, 'parent' | 'enfant' | 'conjoint']>()
  const vus = new Set([a.id])
  let rangee = [a.id]
  while (rangee.length && !vus.has(b.id)) {
    const suivante: string[] = []
    for (const x of rangee) {
      for (const [y, t] of voisins(x)) {
        if (vus.has(y)) continue
        vus.add(y)
        prec.set(y, [x, t])
        suivante.push(y)
      }
    }
    rangee = suivante
  }
  if (!vus.has(b.id)) return undefined
  const etapes: Etape[] = []
  for (let x = b.id; x !== a.id;) {
    const [avant, t] = prec.get(x)!
    const de = arbre.individus.get(avant)!
    // `t` : ce qu'est x pour `avant` ; on écrit ce qu'est `avant` pour x
    const lien = t === 'parent' ? accord(de.sexe, 'fils', 'fille') + ' de'
      : t === 'enfant' ? accord(de.sexe, 'père', 'mère') + ' de'
        : accord(de.sexe, 'époux', 'épouse') + ' de'
    etapes.unshift({ de: avant, lien, vers: x })
    x = avant
  }
  return {
    type: 'alliance', etapes,
    terme: lienDeParente(arbre, a, b)?.terme ?? `parent${fem(b.sexe) ? 'e' : ''} par alliance`,
    inverse: lienDeParente(arbre, b, a)?.terme ?? `parent${fem(a.sexe) ? 'e' : ''} par alliance`,
  }
}

/** Le lien de `b` avec `a` : ce que `b` est pour `a` */
export function parente(arbre: Arbre, a: Individu, b: Individu): Parente {
  if (a.id === b.id) return { type: 'identique' }
  return parenteSang(arbre, a, b) ?? parAlliance(arbre, a, b) ?? { type: 'aucun' }
}

/** « 12,5 % », « 0,2 % » */
export function pourcentPart(p: number): string {
  const v = p * 100
  const txt = v >= 10 ? String(Math.round(v * 10) / 10) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3)
  return txt.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',') + ' %'
}
