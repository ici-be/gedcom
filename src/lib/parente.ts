// Ancêtres (numérotation Sosa) et frères et sœurs des ancêtres.

import type { Arbre, Individu } from './gedcom/arbre'
import type { EtatParent } from './filiation'

export interface Ancetre {
  id: string
  /** Plus petit numéro Sosa (en texte : il dépasse vite les entiers JavaScript) */
  sosa: string
  generation: number
  /** Nombre de fois où il apparaît parmi les ancêtres (implexe) */
  occurrences: number
}

export function parents(arbre: Arbre, ind: Individu): { pere?: Individu; mere?: Individu } {
  for (const f of ind.famc) {
    const fam = arbre.familles.get(f)
    if (!fam) continue
    return {
      pere: fam.mari ? arbre.individus.get(fam.mari) : undefined,
      mere: fam.femme ? arbre.individus.get(fam.femme) : undefined,
    }
  }
  return {}
}

const clePatronyme = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')

/** Enfant naturel : sans père dans l'arbre, il porte le nom de sa mère (le père n'est pas à chercher) */
export function enfantNaturel(ind: Individu, pere: Individu | undefined, mere: Individu | undefined): boolean {
  return !pere && !!mere && !!clePatronyme(ind.nom) && clePatronyme(ind.nom) === clePatronyme(mere.nom)
}

/**
 * Chaque parent : présent dans l'arbre, inconnu ou introuvable (« Filiation: … » dans la note, ou père
 * d'un enfant qui porte le nom de sa mère), sinon à chercher
 */
export function etatParents(arbre: Arbre, ind: Individu): { pere: EtatParent; mere: EtatParent } {
  const { pere, mere } = parents(arbre, ind)
  return {
    pere: pere ? 'connu' : ind.filiation?.pere ?? (enfantNaturel(ind, pere, mere) ? 'inconnu' : 'a-chercher'),
    mere: mere ? 'connu' : ind.filiation?.mere ?? 'a-chercher',
  }
}

/** Mot-clé contredit par l'arbre : un parent est dit inconnu ou introuvable, mais il y figure */
export function filiationContredite(arbre: Arbre, ind: Individu): ('pere' | 'mere')[] {
  if (!ind.filiation) return []
  const p = parents(arbre, ind)
  return (['pere', 'mere'] as const).filter((c) => ind.filiation![c] && p[c])
}

/** Parcours génération par génération : chaque ancêtre garde son plus petit Sosa. */
export function ancetres(arbre: Arbre, racine: string): Map<string, Ancetre> {
  const resultat = new Map<string, Ancetre>()
  const depart = arbre.individus.get(racine)
  if (!depart) return resultat
  let generation: { ind: Individu; sosa: bigint }[] = [{ ind: depart, sosa: 1n }]
  let numero = 1
  while (generation.length) {
    const suivante: typeof generation = []
    for (const { ind, sosa } of generation) {
      const deja = resultat.get(ind.id)
      if (deja) { deja.occurrences++; continue }
      resultat.set(ind.id, { id: ind.id, sosa: sosa.toString(), generation: numero, occurrences: 1 })
      const { pere, mere } = parents(arbre, ind)
      if (pere) suivante.push({ ind: pere, sosa: sosa * 2n })
      if (mere) suivante.push({ ind: mere, sosa: sosa * 2n + 1n })
    }
    generation = suivante
    numero++
  }
  return resultat
}

/** Frères et sœurs (et demi-) des ancêtres qui ne sont pas eux-mêmes ancêtres → Sosa de l'ancêtre. */
export function fratries(arbre: Arbre, anc: Map<string, Ancetre>): Map<string, Ancetre> {
  const resultat = new Map<string, Ancetre>()
  for (const a of anc.values()) {
    if (a.sosa === '1') continue
    const ind = arbre.individus.get(a.id)!
    for (const f of ind.famc) {
      for (const e of arbre.familles.get(f)?.enfants ?? []) {
        if (anc.has(e) || resultat.has(e)) continue
        resultat.set(e, { ...a, id: e, occurrences: 1 })
      }
    }
  }
  return resultat
}

/** Compare deux numéros Sosa écrits en texte */
export function comparerSosa(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
}

/** Vrai si le Sosa `s` est un ancêtre (ou lui-même) du Sosa `branche` */
export function dansBranche(s: string, branche: string): boolean {
  const bs = BigInt(s).toString(2)
  const bb = BigInt(branche).toString(2)
  return bs.startsWith(bb)
}

/** Nom affiché : « VEYCKEMANS Bruno » */
export function nomComplet(ind: Individu): string {
  return [ind.nom ? ind.nom.toUpperCase() : '?', ind.prenom || '?'].join(' ')
}

function cleNom(ind: Individu): string {
  return (ind.prenom + '|' + ind.nom).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Individus qui partagent exactement leurs prénom et nom avec quelqu'un d'autre */
export function homonymes(arbre: Arbre): Set<string> {
  const compte = new Map<string, string[]>()
  for (const ind of arbre.individus.values()) {
    const c = cleNom(ind)
    const l = compte.get(c)
    if (l) l.push(ind.id)
    else compte.set(c, [ind.id])
  }
  const resultat = new Set<string>()
  for (const l of compte.values()) if (l.length > 1) l.forEach((id) => resultat.add(id))
  return resultat
}

export interface Lien {
  /** « oncle », « grand-mère », « beau-frère »… */
  terme: string
  fem: boolean
  /** Côté de la parenté, pour les grands-parents, oncles et cousins */
  cote?: 'paternel' | 'maternel'
}

/** Ascendants jusqu'à trois générations : distance et côté (celui du premier pas : père ou mère) */
function montees(arbre: Arbre, ind: Individu): Map<string, { n: number; cote?: 'paternel' | 'maternel' }> {
  const res = new Map<string, { n: number; cote?: 'paternel' | 'maternel' }>([[ind.id, { n: 0 }]])
  let rang: { ind: Individu; cote?: 'paternel' | 'maternel' }[] = [{ ind }]
  for (let n = 1; n <= 3; n++) {
    const suivant: typeof rang = []
    for (const x of rang) {
      const { pere, mere } = parents(arbre, x.ind)
      for (const [p, c] of [[pere, 'paternel'], [mere, 'maternel']] as const) {
        if (!p || res.has(p.id)) continue
        const cote = x.cote ?? c
        res.set(p.id, { n, cote })
        suivant.push({ ind: p, cote })
      }
    }
    rang = suivant
  }
  return res
}

const TERMES: Record<string, [string, string]> = {
  '0-1': ['fils', 'fille'], '0-2': ['petit-fils', 'petite-fille'], '0-3': ['arrière-petit-fils', 'arrière-petite-fille'],
  '1-0': ['père', 'mère'], '2-0': ['grand-père', 'grand-mère'], '3-0': ['arrière-grand-père', 'arrière-grand-mère'],
  '1-1': ['frère', 'sœur'], '1-2': ['neveu', 'nièce'], '1-3': ['petit-neveu', 'petite-nièce'],
  '2-1': ['oncle', 'tante'], '3-1': ['grand-oncle', 'grand-tante'], '2-2': ['cousin germain', 'cousine germaine'],
}

/** Parenté de sang : ce qu'est `autre` pour `sujet` (jusqu'aux cousins germains) */
function lienDeSang(arbre: Arbre, sujet: Individu, autre: Individu): Lien | undefined {
  if (sujet.id === autre.id) return undefined
  const a = montees(arbre, sujet), b = montees(arbre, autre)
  let meilleur: { na: number; nb: number; cote?: 'paternel' | 'maternel' } | undefined
  for (const [id, x] of a) {
    const y = b.get(id)
    if (y && (!meilleur || x.n + y.n < meilleur.na + meilleur.nb)) meilleur = { na: x.n, nb: y.n, cote: x.cote }
  }
  if (!meilleur) return undefined
  const t = TERMES[`${meilleur.na}-${meilleur.nb}`]
  if (!t) return undefined
  const fem = autre.sexe === 'F'
  let terme = fem ? t[1] : t[0]
  if (meilleur.na === 1 && meilleur.nb === 1) {
    const p1 = parents(arbre, sujet), p2 = parents(arbre, autre)
    if (p1.pere?.id !== p2.pere?.id || p1.mere?.id !== p2.mere?.id) terme = 'demi-' + terme
  }
  return meilleur.na >= 2 ? { terme, fem, cote: meilleur.cote } : { terme, fem }
}

function conjoints(arbre: Arbre, ind: Individu): Individu[] {
  return ind.fams.flatMap((f) => {
    const fam = arbre.familles.get(f)
    const c = fam ? (fam.mari === ind.id ? fam.femme : fam.mari) : undefined
    const x = c ? arbre.individus.get(c) : undefined
    return x ? [x] : []
  })
}

const ALLIANCE_PAR_LE_CONJOINT: Record<string, [string, string]> = {
  père: ['beau-père', 'belle-mère'], mère: ['beau-père', 'belle-mère'],
  frère: ['beau-frère', 'belle-sœur'], sœur: ['beau-frère', 'belle-sœur'],
  fils: ['beau-fils', 'belle-fille'], fille: ['beau-fils', 'belle-fille'],
}
const ALLIANCE_PAR_LE_PARENT: Record<string, [string, string]> = {
  père: ['beau-père', 'belle-mère'], mère: ['beau-père', 'belle-mère'],
  frère: ['beau-frère', 'belle-sœur'], sœur: ['beau-frère', 'belle-sœur'],
  fils: ['gendre', 'belle-fille'], fille: ['gendre', 'belle-fille'],
  oncle: ['oncle par alliance', 'tante par alliance'], tante: ['oncle par alliance', 'tante par alliance'],
}

/** Ce qu'est `autre` pour `sujet` : conjoint, parent de sang, ou allié (beau-père, oncle par alliance…) */
export function lienDeParente(arbre: Arbre, sujet: Individu, autre: Individu, alliance = true): Lien | undefined {
  if (sujet.id === autre.id) return undefined
  const fem = autre.sexe === 'F'
  const sang = lienDeSang(arbre, sujet, autre)
  if (sang || !alliance) return sang
  if (conjoints(arbre, sujet).some((c) => c.id === autre.id)) return { terme: fem ? 'épouse' : 'mari', fem }
  // Parent du conjoint (beau-père, beau-frère…)
  for (const c of conjoints(arbre, sujet)) {
    const l = lienDeSang(arbre, c, autre)
    const t = l && ALLIANCE_PAR_LE_CONJOINT[l.terme]
    if (t) return { terme: fem ? t[1] : t[0], fem }
  }
  // Conjoint d'un parent (oncle par alliance, gendre…)
  for (const c of conjoints(arbre, autre)) {
    const l = lienDeSang(arbre, sujet, c)
    const t = l && ALLIANCE_PAR_LE_PARENT[l.terme]
    if (t) return { terme: fem ? t[1] : t[0], fem, cote: l.terme === 'oncle' || l.terme === 'tante' ? l.cote : undefined }
  }
  return undefined
}
