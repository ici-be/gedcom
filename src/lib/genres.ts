// Genres douteux : une personne dont le premier prénom est, dans l'arbre même, presque toujours porté par l'autre sexe
// (un « Jean » noté femme, une « Marie » noté homme), ou de sexe inconnu avec un prénom bien marqué.
// Les prénoms mixtes (Dominique, Claude, Camille…) ne sont jamais signalés.

import type { Arbre, Individu } from './gedcom/arbre'

export type TypeGenre = 'oppose' | 'inconnu'

export const TYPES_GENRES: Record<TypeGenre, string> = {
  oppose: 'Prénom de l’autre sexe',
  inconnu: 'Sexe inconnu',
}

export interface Genre {
  id: string
  type: TypeGenre
  /** Le prénom comparé, tel qu'il est écrit */
  prenom: string
  /** Sexe que le prénom suggère */
  suggere: 'M' | 'F'
  hommes: number
  femmes: number
}

/** Prénoms portés par les deux sexes, sans accents et en minuscules */
export const PRENOMS_MIXTES = new Set([
  'dominique', 'claude', 'camille', 'alix', 'hyacinthe', 'amable', 'sacha', 'sasha', 'andrea', 'ange', 'lou', 'charlie', 'eden',
  'morgan', 'kim', 'jo', 'toni', 'france', 'valery', 'ariel', 'noa', 'yannick', 'gael', 'loan', 'emery', 'jody', 'leslie', 'sydney',
  'sidney', 'alexis',
])

/** Il faut au moins ce nombre de porteurs de l'autre sexe… */
const MINI = 5
/** …et que ceux du même sexe en fassent au plus cette part */
const PART_MAXI = 0.05

const plat = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Premier prénom, sans ce qui suit un trait d'union (« Jean-Baptiste » → « Jean ») */
export function premierPrenom(prenom: string): string | undefined {
  const mot = prenom.replace(/[«»"“”()[\]]/g, ' ').trim().split(/[\s-]+/)[0]
  if (!mot || !/^\p{L}[\p{L}'’.]*$/u.test(mot) || mot.includes('.')) return undefined
  const k = plat(mot)
  return k.length >= 2 ? k : undefined
}

export function genres(arbre: Arbre): Genre[] {
  const comptes = new Map<string, { M: number; F: number; forme: string }>()
  const cles = new Map<Individu, string>()
  for (const ind of arbre.individus.values()) {
    const k = premierPrenom(ind.prenom)
    if (!k || PRENOMS_MIXTES.has(k)) continue
    cles.set(ind, k)
    if (ind.sexe === '?') continue
    const c = comptes.get(k) ?? { M: 0, F: 0, forme: ind.prenom.split(/[\s-]+/)[0] }
    c[ind.sexe]++
    comptes.set(k, c)
  }
  const res: Genre[] = []
  for (const [ind, k] of cles) {
    const c = comptes.get(k)
    if (!c) continue
    const total = c.M + c.F
    const forme = ind.prenom.trim().split(/[\s-]+/)[0]
    if (ind.sexe === '?') {
      const s = c.M >= MINI && c.F <= PART_MAXI * total ? 'M' : c.F >= MINI && c.M <= PART_MAXI * total ? 'F' : undefined
      if (s) res.push({ id: ind.id, type: 'inconnu', prenom: forme, suggere: s, hommes: c.M, femmes: c.F })
      continue
    }
    const autre = ind.sexe === 'M' ? 'F' : 'M'
    if (c[autre] >= MINI && c[ind.sexe] <= PART_MAXI * total) {
      res.push({ id: ind.id, type: 'oppose', prenom: forme, suggere: autre, hommes: c.M, femmes: c.F })
    }
  }
  return res.sort((a, b) => a.type.localeCompare(b.type) || a.prenom.localeCompare(b.prenom, 'fr'))
}
