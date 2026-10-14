// Page Lignée : une ligne d'ancêtres, de la personne de départ jusqu'à un ancêtre, génération par génération.
// Une lignée se désigne par le numéro Sosa de son dernier ancêtre, ou par « paternelle », « maternelle »,
// « longue » (la plus longue de l'arbre).

import type { Donnees } from './donnees'
import type { Individu } from './gedcom/arbre'
import { annee, type DateGed } from './gedcom/dates'
import type { EtatParent } from './filiation'
import { decouperLieu } from './communes'
import { etatParents, parents } from './parente'
import type { Fait } from './suivi'
import { anneeNaissanceEstimee } from './suivi'

const MAX = 200
/** Une date « avant 1803 » ou « entre 1795 et 1798 » ne suffit pas à calculer un âge */
const BORNEES = new Set(['avant', 'après', 'entre', 'de', 'jusqu’à'])

export interface Maillon {
  id: string
  sosa: string
  generation: number
  /** Année de naissance, estimée au besoin (d'après le mariage ou les enfants) */
  naissance?: number
  estimee: boolean
  ageDeces?: number
  /** L'enfant suivant dans la lignée (vers la personne de départ), l'autre parent et leur union */
  enfant?: string
  conjoint?: string
  sosaConjoint?: string
  union?: Fait
  enfants: number
  /** Âge à la naissance de l'enfant suivant */
  ageEnfant?: number
}

export interface Suite { cote: 'pere' | 'mere'; etat: EtatParent; id?: string; sosa: string }

export interface Lignee {
  cle: string
  /** De la personne de départ (génération 1) au plus lointain ancêtre */
  maillons: Maillon[]
  /** Les parents du dernier ancêtre : de quoi remonter plus haut, ou pourquoi la lignée s'arrête */
  suite: Suite[]
  /** Communes de naissance successives, du plus ancien au plus récent (lieu complet, nombre de générations) */
  lieux: [string, number][]
  /** Patronymes successifs, du plus ancien au plus récent */
  noms: [string, number][]
  /** Écart moyen entre deux naissances successives */
  duree?: number
  sourcees: number
}

export const CLES = ['paternelle', 'maternelle', 'longue'] as const

/** Les côtés à suivre depuis la personne de départ */
function chemin(d: Donnees, cle: string): ('pere' | 'mere')[] | null {
  const { arbre } = d
  const ind = (id: string) => arbre.individus.get(id)
  if (cle === 'paternelle' || cle === 'maternelle') {
    const cote = cle === 'paternelle' ? 'pere' : 'mere'
    const c: ('pere' | 'mere')[] = []
    for (let i = parents(arbre, ind(d.racine)!)[cote]; i && c.length < MAX; i = parents(arbre, i)[cote]) c.push(cote)
    return c
  }
  if (cle === 'longue') {
    // profondeur de chaque ancêtre ; à égalité, le père d'abord (le plus petit Sosa)
    const prof = new Map<string, number>()
    const enCours = new Set<string>()
    const profondeur = (i: Individu | undefined): number => {
      if (!i || enCours.has(i.id)) return 0
      const p = prof.get(i.id)
      if (p !== undefined) return p
      enCours.add(i.id)
      const { pere, mere } = parents(arbre, i)
      const v = 1 + Math.max(profondeur(pere), profondeur(mere))
      enCours.delete(i.id)
      prof.set(i.id, v)
      return v
    }
    const c: ('pere' | 'mere')[] = []
    for (let i = ind(d.racine); i && c.length < MAX;) {
      const { pere, mere } = parents(arbre, i)
      const [p, m] = [profondeur(pere), profondeur(mere)]
      if (!p && !m) break
      const cote = p >= m ? 'pere' : 'mere'
      c.push(cote)
      i = cote === 'pere' ? pere : mere
    }
    return c
  }
  if (!/^\d+$/.test(cle) || cle === '0') return null
  return BigInt(cle).toString(2).slice(1).split('').map((b) => (b === '0' ? 'pere' : 'mere'))
}

export function lignee(d: Donnees, cle: string): Lignee | null {
  const { arbre } = d
  const racine = arbre.individus.get(d.racine)
  const c = chemin(d, cle)
  if (!racine || !c || c.length > MAX) return null

  const inds: Individu[] = [racine]
  const sosas = [1n]
  for (const cote of c) {
    const p = parents(arbre, inds[inds.length - 1])[cote]
    if (!p) return null
    inds.push(p)
    sosas.push(2n * sosas[sosas.length - 1] + (cote === 'mere' ? 1n : 0n))
  }

  const reelle = (id: string) => annee(d.suivis.get(id)?.naissance.evenement?.date)
  const precise = (dt?: DateGed) => (dt && !BORNEES.has(dt.qualif) ? annee(dt) : undefined)
  const pourAge = (id: string) => precise(d.suivis.get(id)?.naissance.evenement?.date)
  const maillons: Maillon[] = inds.map((ind, k) => {
    const s = d.suivis.get(ind.id)!
    const n = reelle(ind.id)
    const estimation = n ?? anneeNaissanceEstimee(arbre, ind, s.naissance)
    const m = precise(s.deces.evenement?.date)
    const na = pourAge(ind.id)
    const x: Maillon = {
      id: ind.id, sosa: String(sosas[k]), generation: k + 1, naissance: estimation, estimee: n === undefined && estimation !== undefined,
      ageDeces: na !== undefined && m !== undefined && m >= na ? m - na : undefined, enfants: 0,
    }
    if (k > 0) {
      const enfant = inds[k - 1]
      const fam = enfant.famc.map((f) => arbre.familles.get(f)).find(Boolean)
      if (fam) {
        x.enfant = enfant.id
        x.conjoint = (fam.mari === ind.id ? fam.femme : fam.mari) || undefined
        x.sosaConjoint = String(sosas[k] ^ 1n)
        x.union = s.mariages.find((u) => u.famille === fam.id)
        x.enfants = fam.enfants.length
        const ne = pourAge(enfant.id)
        if (na !== undefined && ne !== undefined && ne > na) x.ageEnfant = ne - na
      }
    }
    return x
  })

  const dernier = inds[inds.length - 1]
  const etats = etatParents(arbre, dernier)
  const p = parents(arbre, dernier)
  const haut = sosas[sosas.length - 1]
  const suite: Suite[] = (['pere', 'mere'] as const).map((cote) => ({
    cote, etat: etats[cote], id: p[cote]?.id, sosa: String(2n * haut + (cote === 'mere' ? 1n : 0n)),
  }))

  // Lieux et noms, du plus ancien au plus récent, regroupés quand ils se suivent
  const grouper = (v: (string | undefined)[], cle: (s: string) => string = (s) => s) => {
    const r: [string, number][] = []
    for (const x of v) {
      if (!x) continue
      const der = r[r.length - 1]
      if (der && cle(der[0]) === cle(x)) der[1]++
      else r.push([x, 1])
    }
    return r
  }
  const anciens = [...inds].reverse()
  const lieux = grouper(anciens.map((i) => d.suivis.get(i.id)?.naissance.evenement?.lieu), (l) => decouperLieu(l).nom.toLowerCase())
  const noms = grouper(anciens.map((i) => (i.nom && !/^\?+$/.test(i.nom) ? i.nom : undefined)), (n) => n.toLowerCase())

  const ecarts = maillons.map((m) => m.ageEnfant).filter((v): v is number => v !== undefined)
  return {
    cle, maillons, suite, lieux, noms,
    duree: ecarts.length ? ecarts.reduce((a, b) => a + b, 0) / ecarts.length : undefined,
    sourcees: inds.filter((i) => d.suivis.get(i.id)?.naissance.etat === 'source').length,
  }
}
