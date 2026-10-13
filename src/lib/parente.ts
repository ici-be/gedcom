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

/** Chaque parent : présent dans l'arbre, inconnu ou introuvable (mot-clé de la note), sinon à chercher */
export function etatParents(arbre: Arbre, ind: Individu): { pere: EtatParent; mere: EtatParent } {
  const { pere, mere } = parents(arbre, ind)
  return {
    pere: pere ? 'connu' : ind.filiation?.pere ?? 'a-chercher',
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
