// Migrations : les lieux de vie des ancêtres (naissance, mariages, décès) et les déplacements d'une génération
// à l'autre, du lieu de naissance du parent à celui de l'enfant.

import type { Donnees } from './donnees'
import type { Evenement, Individu } from './gedcom/arbre'
import { annee } from './gedcom/dates'
import type { Place } from './eventail'
import type { Fenetre } from './carte-origines'
import type { Position } from './geo'
import { anneeNaissanceEstimee } from './suivi'

/** Générations prises en compte : de la personne de départ à la seizième (au-delà, presque plus de lieux) */
export const GENERATIONS_MIGRATIONS = 16
/** Sans date de décès, une vie est comptée soixante ans */
export const VIE_PAR_DEFAUT = 60

export interface Point { lat: number; lon: number }
export type TypeEtape = 'naissance' | 'mariage' | 'deces'
export interface Etape { type: TypeEtape; annee?: number; lieu: string; pos: Position }

export function distanceKm(a: Point, b: Point): number {
  const t = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * t) / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(((b.lon - a.lon) * t) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Quartier d'une place Sosa (0 à 3, dans l'ordre des Sosa 4 à 7) ; -1 pour la personne de départ et ses parents */
export function quartierDe(sosa: number): number {
  if (sosa < 4) return -1
  return (sosa >> (Math.floor(Math.log2(sosa)) - 2)) - 4
}

/** Les lieux situés d'une personne, dans l'ordre de sa vie : naissance (ou baptême), mariages, décès (ou inhumation) */
export function etapes(d: Donnees, ind: Individu, positions: Map<string, Position>): Etape[] {
  const s = d.suivis.get(ind.id)
  if (!s) return []
  const res: Etape[] = []
  const ajouter = (type: TypeEtape, e?: Evenement) => {
    const pos = e?.lieu ? positions.get(e.lieu) : undefined
    if (pos) res.push({ type, annee: annee(e!.date), lieu: e!.lieu!, pos })
  }
  ajouter('naissance', s.naissance.evenement)
  const mariages = s.mariages.map((m) => m.evenement).filter((e): e is Evenement => !!e)
  for (const e of mariages.sort((a, b) => (annee(a.date) ?? 9999) - (annee(b.date) ?? 9999))) ajouter('mariage', e)
  ajouter('deces', s.deces.evenement)
  return res
}

/** Année de naissance de chaque place : connue, sinon estimée (mariage, enfants), sinon d'après celle de l'enfant */
export function anneesDeNaissance(d: Donnees, pl: Place[]): number[] {
  const res: number[] = []
  for (let s = 1; s < pl.length; s++) {
    const ind = pl[s]?.ind
    const suivi = ind ? d.suivis.get(ind.id) : undefined
    const connue = ind && suivi ? anneeNaissanceEstimee(d.arbre, ind, suivi.naissance) : undefined
    res[s] = connue ?? (s === 1 ? new Date().getFullYear() - 40 : res[s >> 1] - (s % 2 ? 27 : 31))
  }
  return res
}

export interface Passage {
  /** Place Sosa du parent */
  sosa: number
  de: Etape
  vers: Etape
  /** Année de naissance de l'enfant */
  annee: number
  km: number
  quartier: number
}

/**
 * Du lieu de naissance de chaque parent à celui de son enfant. Une place déjà vue plus près (implexe)
 * ne compte qu'une fois : on saute les passages vers un enfant qui est lui-même une place répétée.
 */
export function passages(pl: Place[], naissances: Map<number, Etape>, annees: number[]): Passage[] {
  const res: Passage[] = []
  for (let s = 2; s < pl.length; s++) {
    const enfant = pl[s >> 1]
    if (!pl[s]?.ind || !enfant?.ind || enfant.dejaVu) continue
    const de = naissances.get(pl[s].dejaVu ?? s)
    const vers = naissances.get(s >> 1)
    if (!de || !vers) continue
    res.push({ sosa: s, de, vers, annee: annees[s >> 1], km: distanceKm(de.pos, vers.pos), quartier: quartierDe(s) })
  }
  return res
}

export interface Centre extends Point { generation: number; n: number }

/** Pour chaque quartier, le point moyen des naissances connues de chaque génération (deux naissances au moins), de la plus ancienne à la plus récente */
export function centres(pl: Place[], naissances: Map<number, Etape>): Centre[][] {
  const res: Centre[][] = [[], [], [], []]
  const sommes = new Map<string, { q: number; g: number; n: number; lat: number; lon: number }>()
  for (const [s, e] of naissances) {
    const q = quartierDe(s)
    if (q < 0 || pl[s]?.dejaVu) continue
    const g = pl[s].generation
    const cle = q + ':' + g
    const v = sommes.get(cle) ?? { q, g, n: 0, lat: 0, lon: 0 }
    v.n++; v.lat += e.pos.lat; v.lon += e.pos.lon
    sommes.set(cle, v)
  }
  for (const v of sommes.values()) if (v.n >= 2) res[v.q].push({ generation: v.g, n: v.n, lat: v.lat / v.n, lon: v.lon / v.n })
  for (const l of res) l.sort((a, b) => b.generation - a.generation)
  return res
}

export interface Vie { sosa: number; quartier: number; debut: number; fin: number; etapes: Etape[] }

/** Les vies situées (une par personne) : de la naissance au décès, ou soixante ans faute de date */
export function vies(pl: Place[], parSosa: Map<number, Etape[]>, annees: number[]): Vie[] {
  const res: Vie[] = []
  for (const [s, l] of parSosa) {
    if (s < 2 || pl[s]?.dejaVu) continue
    const debut = annees[s]
    const fin = l.find((e) => e.type === 'deces')?.annee ?? debut + VIE_PAR_DEFAUT
    const lieux = l.filter((e) => e.type !== 'deces').map((e) => ({ ...e, annee: e.annee ?? debut }))
    if (lieux.length) res.push({ sosa: s, quartier: quartierDe(s), debut, fin, etapes: lieux })
  }
  return res
}

/** Où vit une personne l'année `a` : son dernier lieu connu avant (naissance, puis mariages) */
export function lieuEn(v: Vie, a: number): Etape {
  let e = v.etapes[0]
  for (const x of v.etapes) if ((x.annee ?? v.debut) <= a) e = x
  return e
}

/** Répartition des passages d'un siècle : même commune, moins de 15 km, 15 à 50, 50 et plus */
export function tranches(l: Passage[]): [number, number, number, number] {
  const t: [number, number, number, number] = [0, 0, 0, 0]
  for (const p of l) t[p.km < 1 ? 0 : p.km < 15 ? 1 : p.km < 50 ? 2 : 3]++
  return t
}

export function mediane(v: number[]): number | undefined {
  if (!v.length) return undefined
  const t = [...v].sort((a, b) => a - b)
  return t[Math.floor(t.length / 2)]
}

/** Le cadre d'une carte : les points sans les plus excentrés (un sur cent de chaque côté), avec une marge */
export function cadreRobuste(points: Point[], marge = 0.25, horsCadre = 0.01): Fenetre | undefined {
  if (!points.length) return undefined
  const lat = points.map((p) => p.lat).sort((a, b) => a - b)
  const lon = points.map((p) => p.lon).sort((a, b) => a - b)
  const k = Math.floor(points.length * horsCadre)
  return [lon[k] - marge, lat[k] - marge, lon[lon.length - 1 - k] + marge, lat[lat.length - 1 - k] + marge]
}
