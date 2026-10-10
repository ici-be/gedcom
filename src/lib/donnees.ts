// Tout ce que les écrans calculent à partir de l'arbre et des réglages.

import type { Arbre, Individu } from './gedcom/arbre'
import { ancetres, fratries, homonymes, type Ancetre } from './parente'
import { score, suivi, type Suivi } from './suivi'
import { lienGeneWeb } from './geneanet'

export type Perimetre = 'ancetres' | 'ancetres-fratries' | 'tous'

export interface Donnees {
  arbre: Arbre
  racine: string
  adresse: string
  ancetres: Map<string, Ancetre>
  fratries: Map<string, Ancetre>
  homonymes: Set<string>
  suivis: Map<string, Suivi>
  lien: (ind: Individu) => string | undefined
}

export function calculer(arbre: Arbre, racine: string, adresse: string): Donnees {
  const anc = ancetres(arbre, racine)
  const hom = homonymes(arbre)
  const suivis = new Map<string, Suivi>()
  for (const ind of arbre.individus.values()) suivis.set(ind.id, suivi(arbre, ind))
  return {
    arbre,
    racine,
    adresse,
    ancetres: anc,
    fratries: fratries(arbre, anc),
    homonymes: hom,
    suivis,
    lien: (ind) => lienGeneWeb(adresse, ind, hom.has(ind.id)),
  }
}

/** Les personnes d'un périmètre (null = tout le monde) */
export function membres(d: Donnees, p: Perimetre): Set<string> | null {
  if (p === 'tous') return null
  const s = new Set(d.ancetres.keys())
  if (p === 'ancetres-fratries') for (const id of d.fratries.keys()) s.add(id)
  return s
}

export interface Bilan {
  individus: number
  familles: number
  ancetres: number
  generations: number
  faits: { attendus: number; sources: number }
  faitsAncetres: { attendus: number; sources: number }
}

export function bilan(d: Donnees): Bilan {
  const faits = { attendus: 0, sources: 0 }
  const faitsAncetres = { attendus: 0, sources: 0 }
  for (const [id, s] of d.suivis) {
    const sc = score(s)
    faits.attendus += sc.attendus
    faits.sources += sc.sources
    if (d.ancetres.has(id)) {
      faitsAncetres.attendus += sc.attendus
      faitsAncetres.sources += sc.sources
    }
  }
  let generations = 0
  for (const a of d.ancetres.values()) generations = Math.max(generations, a.generation)
  return {
    individus: d.arbre.individus.size,
    familles: d.arbre.familles.size,
    ancetres: d.ancetres.size,
    generations,
    faits,
    faitsAncetres,
  }
}

export interface Releve { date: string; fichier: string; bilan: Bilan }
