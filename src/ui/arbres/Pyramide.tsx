// Arbre en pyramide : la personne de départ en bas, chaque génération une rangée plus haut, huit générations.
// Cases bleues ou roses selon le sexe ; les cinq premières générations en cartouches (photo, nom, dates, lieu, métier),
// les trois suivantes en étiquettes verticales. Frères et sœurs sous chaque cartouche, avec leurs années si la place le permet.
// Au-dessus de chaque case des quatre premières générations, sur le trait qui monte vers les parents : leur mariage
// (« ∞ 1752 », et la commune si elle tient). Plus haut, les étiquettes verticales ne laissent pas la place.
// Feuille A3 paysage (1 unité = 0,3 mm), comme l'éventail.

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../../lib/donnees'
import type { Individu, Photo } from '../../lib/gedcom/arbre'
import { decouperLieu, romain } from '../../lib/communes'
import { abregerCommune, anneeCourte, morceauxAnnees, fratrie, mariageDesParents, places, prenoms, resumer, type Place, type Resume } from '../../lib/eventail'
import type { FormePhoto, OptionsFeuille } from './modeles'
import { chargerPolices, largeur } from './mesure'
import { ajuster } from './feuille'
import { CodeQR } from './EventailOrigines'
import { t, T } from '../../lib/i18n'

export const GEN_MIN_PYRAMIDE = 4
export const GEN_MAX_PYRAMIDE = 9
export const GENERATIONS_DEFAUT = 8
export const GENERATIONS_PYRAMIDE = [4, 5, 6, 7, 8, 9]

/** Mariage des parents au-dessus des cases des générations 0 à 3 (taille du texte) */
const TAILLES_MARIAGE = [9, 8.5, 8, 7.5]
const X0 = 40
const LARG = 1320
const LH = 1.18

/** Par génération (0 : la personne de départ) : haut et hauteur des cases, place sous la case pour la fratrie, largeur des cases */
export interface Rangee { y: number; h: number; fratrie?: number; w: (slot: number) => number; vertical?: boolean }

const RANGEES_PAR_GEN: Record<number, Rangee[]> = {
  4: [
    { y: 880, h: 80, w: () => 280 },
    { y: 696, h: 80, w: () => 260 },
    { y: 446, h: 92, fratrie: 76, w: (s) => Math.min(s * 0.82, 270) },
    { y: 120, h: 100, fratrie: 80, w: (s) => s * 0.9 },
  ],
  5: [
    { y: 888, h: 72, w: () => 270 },
    { y: 748, h: 72, w: () => 250 },
    { y: 566, h: 82, fratrie: 60, w: (s) => Math.min(s * 0.82, 256) },
    { y: 378, h: 86, fratrie: 60, w: (s) => s * 0.9 },
    { y: 90, h: 120, fratrie: 64, w: (s) => s * 0.92 },
  ],
  6: [
    { y: 892, h: 68, w: () => 260 },
    { y: 774, h: 68, w: () => 240 },
    { y: 622, h: 76, fratrie: 50, w: (s) => Math.min(s * 0.8, 246) },
    { y: 466, h: 78, fratrie: 50, w: (s) => s * 0.9 },
    { y: 282, h: 106, fratrie: 52, w: (s) => s * 0.92 },
    { y: 40, h: 210, w: (s) => s * 0.9, vertical: true },
  ],
  7: [
    { y: 896, h: 64, w: () => 250 },
    { y: 790, h: 64, w: () => 230 },
    { y: 656, h: 70, fratrie: 44, w: (s) => Math.min(s * 0.8, 236) },
    { y: 518, h: 72, fratrie: 44, w: (s) => s * 0.9 },
    { y: 356, h: 96, fratrie: 46, w: (s) => s * 0.92 },
    { y: 192, h: 148, w: (s) => s * 0.9, vertical: true },
    { y: 26, h: 150, w: (s) => s * 0.9, vertical: true },
  ],
  8: [
    { y: 900, h: 60, w: () => 250 },
    { y: 806, h: 60, w: () => 230 },
    { y: 688, h: 64, fratrie: 38, w: (s) => Math.min(s * 0.8, 236) },
    { y: 568, h: 66, fratrie: 38, w: (s) => s * 0.9 },
    { y: 424, h: 88, fratrie: 40, w: (s) => s * 0.92 },
    { y: 290, h: 122, w: (s) => s * 0.9, vertical: true },
    { y: 160, h: 122, w: (s) => s * 0.9, vertical: true },
    { y: 22, h: 130, w: (s) => s * 0.9, vertical: true },
  ],
  9: [
    { y: 904, h: 56, w: () => 250 },
    { y: 820, h: 56, w: () => 230 },
    { y: 716, h: 58, fratrie: 32, w: (s) => Math.min(s * 0.8, 236) },
    { y: 610, h: 58, fratrie: 32, w: (s) => s * 0.9 },
    { y: 486, h: 76, fratrie: 34, w: (s) => s * 0.92 },
    { y: 370, h: 104, w: (s) => s * 0.9, vertical: true },
    { y: 254, h: 104, w: (s) => s * 0.9, vertical: true },
    { y: 138, h: 104, w: (s) => s * 0.9, vertical: true },
    { y: 18, h: 108, w: (s) => s * 0.88, vertical: true },
  ],
}

export function bornerGenerationsPyramide(n?: number): number {
  if (!n || Number.isNaN(n)) return GENERATIONS_DEFAUT
  return Math.min(GEN_MAX_PYRAMIDE, Math.max(GEN_MIN_PYRAMIDE, Math.round(n)))
}

export function rangeesPyramide(generations?: number): Rangee[] {
  return RANGEES_PAR_GEN[bornerGenerationsPyramide(generations)]
}

export interface CouleurCase { trait: string; fond: string }
export interface ThemePyramide {
  id: string
  titre: string
  famille: 'sexe' | 'autre'
  apercu: CouleurCase[]
  lien: string
  case: (sosa: number, sexe?: 'M' | 'F' | '?') => CouleurCase
}

export const FORMES_PHOTO: { id: FormePhoto; titre: string }[] = [
  { id: 'ovale', titre: T('Ovales') },
  { id: 'carree', titre: T('Carrés') },
  { id: 'rectangulaire', titre: T('Rectangulaires') },
]

function parSexe(id: string, titre: string, M: CouleurCase, F: CouleurCase, inconnu: CouleurCase, lien = '#9aa19d'): ThemePyramide {
  return { id, titre, famille: 'sexe', apercu: [M, F], lien, case: (_s, sexe) => (sexe === 'M' ? M : sexe === 'F' ? F : inconnu) }
}

const QUARTIERS: CouleurCase[] = [
  { trait: '#6b4f86', fond: '#f3eef8' },
  { trait: '#a3502f', fond: '#faf0eb' },
  { trait: '#4d7a45', fond: '#eef5ec' },
  { trait: '#2f6f7a', fond: '#ebf4f6' },
]

const TONS_GENERATIONS: CouleurCase[] = [
  { trait: '#2f5d50', fond: '#e9f2ee' },
  { trait: '#386b68', fond: '#ebf4f3' },
  { trait: '#3b6480', fond: '#edf3f7' },
  { trait: '#4d5c82', fond: '#eff1f7' },
  { trait: '#68527d', fond: '#f3eff7' },
  { trait: '#874c62', fond: '#f7eef2' },
  { trait: '#9c5a3c', fond: '#f9f0eb' },
  { trait: '#9e7432', fond: '#f9f3e6' },
  { trait: '#8c7a3b', fond: '#f7f4e6' },
]

export const THEMES_PYRAMIDE: ThemePyramide[] = [
  parSexe('classique', T('Bleu et rose'), { trait: '#3d6fb4', fond: '#eef3fa' }, { trait: '#c4547a', fond: '#fbeff3' }, { trait: '#8b928e', fond: '#f4f4f1' }),
  parSexe('herbier', T('Sauge et terre cuite'), { trait: '#2f6b58', fond: '#ebf3ef' }, { trait: '#b85a3a', fond: '#fbf0eb' }, { trait: '#848b86', fond: '#f3f4f1' }, '#98a19c'),
  parSexe('archives', T('Ardoise et ocre'), { trait: '#3b536b', fond: '#edf1f6' }, { trait: '#a87524', fond: '#faf3e4' }, { trait: '#83878b', fond: '#f3f3f1' }, '#999d9f'),
  parSexe('velours', T('Forêt et prune'), { trait: '#2d5a48', fond: '#ebf3ef' }, { trait: '#893d5a', fond: '#f8eef2' }, { trait: '#858886', fond: '#f3f3f1' }, '#999c9a'),
  parSexe('sepia', T('Sépia et ambre'), { trait: '#6e5036', fond: '#f4ede3' }, { trait: '#a16232', fond: '#fbf1e4' }, { trait: '#8c8277', fond: '#f4f1ec' }, '#a69b8e'),
  {
    id: 'quartiers',
    titre: T('Quatre quartiers (branches des grands-parents)'),
    famille: 'autre',
    apercu: QUARTIERS,
    lien: '#9aa19d',
    case: (s) => {
      if (s <= 1) return { trait: '#2f5d50', fond: '#eaf2ee' }
      if (s === 2) return { trait: '#4d5d73', fond: '#eef1f5' }
      if (s === 3) return { trait: '#8c6239', fond: '#f8f1e8' }
      const g = Math.floor(Math.log2(s))
      return QUARTIERS[(s >> (g - 2)) - 4] ?? QUARTIERS[0]
    },
  },
  {
    id: 'generations',
    titre: T('Par génération (dégradé par rangée)'),
    famille: 'autre',
    apercu: [TONS_GENERATIONS[0], TONS_GENERATIONS[2], TONS_GENERATIONS[5], TONS_GENERATIONS[7]],
    lien: '#9aa19d',
    case: (s) => TONS_GENERATIONS[Math.min(TONS_GENERATIONS.length - 1, Math.floor(Math.log2(Math.max(1, s))))],
  },
  {
    id: 'gravure',
    titre: T('Gravure (ivoire et encre)'),
    famille: 'autre',
    apercu: [{ trait: '#4a524e', fond: '#f8f6f0' }],
    lien: '#9aa19d',
    case: () => ({ trait: '#4a524e', fond: '#f8f6f0' }),
  },
]

export const THEME_DEFAUT = 'quartiers'

export function trouverThemePyramide(id = THEME_DEFAUT): ThemePyramide {
  return THEMES_PYRAMIDE.find((t) => t.id === id) ?? THEMES_PYRAMIDE.find((t) => t.id === THEME_DEFAUT)!
}

export const LIBELLES: Record<string, (sosa: number) => string> = {
  inconnu: (s) => t(s % 2 ? 'mère inconnue' : 'père inconnu'),
  introuvable: () => t('introuvable'),
  'a-chercher': () => t('à trouver'),
}

const maj = (s: string) => s.toLocaleUpperCase('fr')

export type Morceau = [string, string?]
export interface Ligne { fs: number; parts: Morceau[]; cls?: string }
export interface Mariage { annee?: string; commune?: string; sourcee: boolean }

export function Morceaux({ parts }: { parts: Morceau[] }) {
  return <>{parts.map(([t, c], i) => <tspan key={i} class={c}>{t}</tspan>)}</>
}


/** Réduit toutes les lignes si leur hauteur dépasse la place */
export function caser(lignes: Ligne[], hauteur: number): Ligne[] {
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  if (H <= hauteur) return lignes
  const k = hauteur / H
  return lignes.map((l) => ({ ...l, fs: Math.round(l.fs * k * 100) / 100 }))
}

/** Le texte d'un cartouche, selon la génération */
export function lignesCartouche(g: number, r: Resume, implexe: boolean, h = 88): Ligne[] {
  const T = [[17, 13, 11, 9.5, 10], [15, 12, 10.5, 9, 9.5], [13.5, 11, 10, 8.8, 9], [11.5, 9.6, 9, 8.2, 8.2], [9.6, 8.6, 8.2, 7.4, h >= 100 ? 7.4 : 0]][Math.min(4, g)]
  const pn = prenoms(r.prenom, g >= 4 ? 1 : 2)
  const nm: Morceau[] = [[maj(r.nom || '?'), 'nm'], ...(implexe ? [[' ◆', 'so'] as Morceau] : [])]
  const l: Ligne[] = []
  if (pn) l.push({ fs: T[0], parts: [[pn, 'pn']] })
  l.push({ fs: T[1], parts: nm })
  if (r.naissance || r.deces) l.push({ fs: T[2], parts: morceauxAnnees(r) })
  if (r.commune) l.push({ fs: T[3], parts: [[maj(abregerCommune(r.commune))]], cls: 'lieu' })
  if (T[4] && r.metier) l.push({ fs: T[4], parts: [[r.metier]], cls: 'mt' })
  return l
}

/** Le texte d'une étiquette verticale : de plus en plus court vers le haut */
export function lignesEtiquette(g: number, r: Resume, implexe: boolean, freres: string): Ligne[] {
  const nom: Morceau[] = [[(prenoms(r.prenom, 1) ? prenoms(r.prenom, 1) + ' ' : ''), 'pn'], [maj(r.nom || '?'), 'nm'], ...(implexe ? [[' ◆', 'so'] as Morceau] : [])]
  const dates = r.naissance || r.deces ? morceauxAnnees(r) : []
  if (g >= 7) return [{ fs: g >= 8 ? 4.2 : 6.8, parts: [...nom, ...(dates.length ? [['  '] as Morceau, ...dates.map(([t, c]) => [t, (c ?? '') + ' mut'] as Morceau)] : [])] }]
  if (g === 6) return [{ fs: 7.4, parts: nom }, ...(dates.length ? [{ fs: 6.6, parts: dates }] : [])]
  const l: Ligne[] = [{ fs: 8.4, parts: nom }]
  if (dates.length) l.push({ fs: 7.6, parts: dates })
  if (r.commune) l.push({ fs: 6.9, parts: [[maj(abregerCommune(r.commune))]], cls: 'lieu' })
  if (freres) l.push({ fs: 6.6, parts: [[freres]], cls: 'fr' })
  return l
}

/** « 5 frères et sœurs », « 1 sœur », « 3 frères » */
export function compteFreres(f: Individu[]): string {
  if (!f.length) return ''
  const h = f.filter((x) => x.sexe === 'M').length
  const fe = f.filter((x) => x.sexe === 'F').length
  const n = f.length
  if (h === n) return t('{n} frère{n?|s}', { n })
  if (fe === n) return t('{n} sœur{n?|s}', { n })
  return t('{n} frères et sœurs', { n })
}

/** Les frères et les sœurs comptés séparément : « 4 frères », « 4 frères et une sœur », « un frère et 2 sœurs » */
export function compteFreresEtSoeurs(f: Individu[]): string {
  const frere = f.filter((x) => x.sexe === 'M').length
  const soeur = f.filter((x) => x.sexe === 'F').length
  const autre = f.length - frere - soeur
  const parts = [
    frere && (frere === 1 ? t('un frère') : t('{n} frères', { n: frere })),
    soeur && (soeur === 1 ? t('une sœur') : t('{n} sœurs', { n: soeur })),
    autre && t('{n} de sexe inconnu', { n: autre }),
  ].filter(Boolean) as string[]
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${t('et')} ${parts[parts.length - 1]}` : parts[0] ?? ''
}

/**
 * Les frères et sœurs en lignes de `max` de large : avec l'année de naissance si tout tient,
 * sinon les prénoms seuls, sinon ce qui tient suivi de « + n ».
 */
export function lignesFratrie(f: { prenom: string; annee?: string }[], max: number, nbLignes: number, fs: number): Morceau[][] {
  if (!f.length || nbLignes < 1) return []
  const couper = (items: Morceau[][]): Morceau[][] => {
    const lignes: Morceau[][] = []
    let courante: Morceau[] = []
    let l = 0
    for (const it of items) {
      const w = it.reduce((s, [t]) => s + largeur(t, fs), 0)
      const sep = courante.length ? largeur(', ', fs) : 0
      if (courante.length && l + sep + w > max) { lignes.push(courante); courante = []; l = 0 }
      if (courante.length) { courante.push([', ']); l += sep }
      courante.push(...it)
      l += w
    }
    if (courante.length) lignes.push(courante)
    return lignes
  }
  const avec = couper(f.map((x) => (x.annee ? [[x.prenom], [' ' + x.annee, 'mut']] : [[x.prenom]])))
  if (avec.length <= nbLignes) return avec
  const sans = couper(f.map((x) => [[x.prenom]]))
  if (sans.length <= nbLignes) return sans
  // ce qui tient, puis « + n »
  for (let k = f.length - 1; k > 0; k--) {
    const l = couper([...f.slice(0, k).map((x): Morceau[] => [[x.prenom]]), [[`+ ${f.length - k}`, 'mut']]])
    if (l.length <= nbLignes) return l
  }
  return [[[t('{n} frères et sœurs', { n: f.length }), 'mut']]]
}

/** Lignes centrées verticalement dans une boîte, à partir de `x` (ancre donnée) */
export function Bloc({ lignes, x, yc, max, ancre = 'middle', groupe }: { lignes: Ligne[]; x: number; yc: number; max: number; ancre?: string; groupe?: string }) {
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  let cumul = 0
  return (
    <>
      {lignes.map((l, j) => {
        const y = yc - H / 2 + cumul + l.fs * LH * 0.78
        cumul += l.fs * LH
        return <text key={j} x={x.toFixed(1)} y={y.toFixed(1)} font-size={l.fs} data-fs={l.fs} data-max={Math.round(max)} data-groupe={groupe !== undefined && j < 2 ? groupe + j : undefined} text-anchor={ancre} class={l.cls}><Morceaux parts={l.parts} /></text>
      })}
    </>
  )
}

/** Dimensions et arrondi d'une photo dans un cartouche ; les signatures gardent leurs dimensions propres */
export function cadrePortrait(g: number, w: number, h: number, signature: boolean, forme: FormePhoto = 'carree', arrondi = true) {
  if (signature) return g === 4 ? { wp: w - 8, hp: h < 80 ? 18 : 20, rx: 0 } : { wp: Math.min(78, w * 0.34), hp: h - 10, rx: 0 }
  const cote4 = h < 80 ? 24 : h >= 100 ? 32 : 28
  const hp = g === 4 ? (forme === 'carree' ? cote4 : cote4 + 2) : forme === 'carree' ? Math.min(h - 10, Math.round(w * 0.34)) : h - 10
  const wp = g === 4 ? (forme === 'carree' ? cote4 : cote4 - 4) : forme === 'carree' ? hp : (h - 10) * 0.78
  const rx = forme === 'ovale' || !arrondi ? 0 : Math.round(Math.min(wp, hp) * 0.18 * 10) / 10
  return { wp, hp, rx }
}

/** Visage en médaillon (ovale, carré ou rectangulaire, coins vifs ou arrondis), ou signature telle quelle ; rien si l'image ne vient pas */
export function Portrait({ id, photo, x, y, w, h, forme = 'carree', rx = 0, rate }: { id: string; photo: Photo; x: number; y: number; w: number; h: number; forme?: FormePhoto; rx?: number; rate: () => void }) {
  if (photo.signature) return <image href={photo.url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" onError={rate} />
  if (forme === 'ovale') {
    return (
      <g>
        <clipPath id={id}><ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} /></clipPath>
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="#e8e4dc" />
        <image href={photo.url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMin slice" clip-path={`url(#${id})`} onError={rate} />
        <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke="#fff" stroke-width="1.2" />
      </g>
    )
  }
  return (
    <g>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx={rx} /></clipPath>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill="#e8e4dc" />
      <image href={photo.url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMin slice" clip-path={`url(#${id})`} onError={rate} />
      <rect x={x} y={y} width={w} height={h} rx={rx} fill="none" stroke="#fff" stroke-width="1.2" />
    </g>
  )
}

export function Pyramide({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  const svg = useRef<SVGSVGElement>(null)
  const [ratees, setRatees] = useState<Set<string>>(new Set())
  // les fratries se coupent d'après les polices de la feuille : on les attend pour recouper
  const [, setPolices] = useState(false)
  useEffect(() => { chargerPolices().then(() => setPolices(true)) }, [])

  const generations = bornerGenerationsPyramide(options.generations)
  const rangees = rangeesPyramide(generations)

  const donnees = useMemo(() => {
    const pl = places(d.arbre, d.racine, generations)
    const resumes = new Map<number, Resume>()
    const freres = new Map<number, Individu[]>()
    const naissance = (i: Individu) => d.suivis.get(i.id)?.naissance.evenement
    for (const p of pl) {
      if (!p?.ind) continue
      resumes.set(p.sosa, resumer(p.ind, d.suivis.get(p.ind.id)!))
      freres.set(p.sosa, fratrie(d.arbre, p.ind.id, naissance).filter((x) => x !== p.ind))
    }
    // Le mariage des parents de chaque place des premières générations, d'après la famille où elle est enfant
    const mariages = new Map<number, Mariage>()
    for (const p of pl) {
      if (!options.mariages || !p?.ind || p.generation >= Math.min(TAILLES_MARIAGE.length, generations - 1)) continue
      const m = mariageDesParents(pl, p.sosa, d.suivis)
      if (!m?.evenement) continue
      const annee = anneeCourte(m.evenement)?.replace(/^\?$/, '') || undefined
      const commune = m.evenement.lieu ? abregerCommune(decouperLieu(m.evenement.lieu).nom) : undefined
      mariages.set(p.sosa, { annee, commune, sourcee: m.etat === 'source' })
    }
    const uniques = pl.filter((p) => p?.ind && !p.dejaVu && p.sosa > 1).length
    return { pl, resumes, freres, uniques, naissance, mariages }
  }, [d, options.mariages, generations])

  useLayoutEffect(() => {
    if (!svg.current) return
    ajuster(svg.current)
    let vivant = true
    document.fonts?.ready.then(() => vivant && svg.current && ajuster(svg.current))
    return () => { vivant = false }
  })

  const { pl, resumes, freres, naissance, mariages } = donnees
  const implexes = pl.some((p) => p?.dejaVu)
  const estImplexe = (p: Place) => !!p.dejaVu || pl.some((q) => q?.dejaVu === p.sosa)
  const photoDe = (p: Place) => {
    const ph = p.ind?.photo
    if (!ph || ratees.has(ph.url)) return undefined
    const active = ph.signature ? (options.signatures ?? options.photos ?? true) : (options.photos ?? true)
    return active ? ph : undefined
  }
  const rater = (url: string) => () => setRatees((r) => new Set(r).add(url))
  const fratrieDe = (s: number) => (options.fratrie ? freres.get(s) ?? [] : []).map((x) => ({ prenom: prenoms(x.prenom, 1) || '?', annee: anneeCourte(naissance(x))?.replace(/^\?$/, '') || undefined }))

  // Position de chaque place : centre, haut, largeur, hauteur
  const pos = (s: number) => {
    const g = Math.floor(Math.log2(s))
    const n = 2 ** g
    const slot = LARG / n
    const R = rangees[g]
    const w = R.w(slot)
    const cx = X0 + slot * (s - n + 0.5)
    return { g, cx, x: cx - w / 2, y: R.y, w, h: R.h, slot, R }
  }
  // Une place se dessine si la personne est connue, ou si elle manque sous un enfant connu
  const dessinee = (s: number) => !!pl[s]?.ind || (s > 1 && !!pl[s >> 1]?.ind && !!LIBELLES[pl[s]?.etat])

  const theme = trouverThemePyramide(options.theme)
  const traits: JSX.Element[] = []
  const cases: JSX.Element[] = []
  const textes: JSX.Element[] = []
  for (let s = 1; s < 2 ** generations; s++) {
    if (!dessinee(s)) continue
    const p = pl[s]
    const { g, cx, x, y, w, h, R } = pos(s)
    const r = resumes.get(s)
    const c = theme.case(s, p.ind?.sexe)

    // Le trait vers les parents : barre entre les deux cases (au milieu pour les cartouches, dessous pour les étiquettes)
    if (r && g < generations - 1 && (dessinee(2 * s) || dessinee(2 * s + 1))) {
      const P = pos(2 * s)
      const M = pos(2 * s + 1)
      const yb = P.R.vertical ? P.y + P.h + 4 : P.y + P.h / 2
      const d = P.R.vertical
        ? `M${P.cx} ${P.y + P.h}V${yb}H${M.cx}V${M.y + M.h}M${cx} ${yb}V${y}`
        : `M${P.x + P.w} ${yb}H${M.x}M${cx} ${yb}V${y}`
      traits.push(<path key={'t' + s} d={d} fill="none" stroke={theme.lien} stroke-width="1" />)

      // Le mariage des parents, juste au-dessus de la case, sur le trait ; la commune seulement si elle tient
      const m = mariages.get(s)
      if (m) {
        const fs = TAILLES_MARIAGE[g]
        const max = w - 6
        const parts: Morceau[] = [['∞ ', 'mut'], ...(m.annee ? [[m.annee, m.sourcee ? undefined : 'nd'] as Morceau] : [])]
        const lieu = (m.annee ? ' · ' : '') + (m.commune ?? '')
        if (m.commune && (!m.annee || largeur(parts.map(([t]) => t).join('') + lieu, fs) <= max)) parts.push([lieu, 'mut'])
        if (parts.length > 1) {
          textes.push(<text key={'m' + s} x={cx.toFixed(1)} y={(y - 4).toFixed(1)} font-size={fs} data-fs={fs} data-max={Math.round(max)} text-anchor="middle" class="mar"><Morceaux parts={parts} /></text>)
        }
      }
    }

    if (!r) {
      cases.push(<rect key={s} x={x} y={y} width={w} height={h} rx={R.vertical ? 1.5 : 3} fill="#fff" stroke="#c9c9c2" stroke-dasharray="3 2.5" stroke-width="0.8" />)
      const libelle = LIBELLES[p.etat](s)
      textes.push(R.vertical
        ? <g key={'x' + s} transform={`translate(${cx},${y + h / 2}) rotate(-90)`}><text x="0" y={(Math.min(w, 9) * 0.35).toFixed(1)} font-size={Math.min(7.5, w * 0.68)} text-anchor="middle" class="ns" data-max={h - 8}>{libelle}</text></g>
        : <text key={'x' + s} x={cx} y={y + h / 2 + 3} font-size={g >= 4 ? 7.5 : 9} text-anchor="middle" class="ns" data-max={w - 8}>{libelle}</text>)
      continue
    }

    const implexe = estImplexe(p)
    cases.push(<rect key={s} x={x.toFixed(2)} y={y} width={w.toFixed(2)} height={h} rx={R.vertical ? 1.5 : 4} fill={c.fond} stroke={c.trait} stroke-width={R.vertical ? (g >= 8 ? 0.45 : 0.7) : 1.2} />)

    if (R.vertical) {
      const f = g === 5 && options.fratrie ? compteFreres(freres.get(s) ?? []) : ''
      const lignes = caser(lignesEtiquette(g, r, implexe, f), Math.max(w * 0.82, w - 3))
      // le numéro en haut de l'étiquette, à l'horizontale ; le nom descend d'autant
      const fn = Math.min(6.5, w * 0.42)
      const decale = options.numeros ? fn + 2 : 0
      if (options.numeros) textes.push(<text key={'n' + s} x={cx.toFixed(2)} y={(y + fn + 1.5).toFixed(1)} font-size={fn.toFixed(2)} data-max={Math.round(w)} text-anchor="middle" class="mut an">{s}</text>)
      textes.push(
        <g key={'x' + s} transform={`translate(${cx.toFixed(2)},${y + (h + decale) / 2}) rotate(-90)`}>
          <Bloc lignes={lignes} x={0} yc={0} max={h - 8 - decale} />
        </g>,
      )
      continue
    }

    // Cartouche : photo à gauche (en haut pour la génération V), texte à côté ; le numéro dans le coin en haut à droite
    if (options.numeros) textes.push(<text key={'n' + s} x={(x + w - 4).toFixed(1)} y={y + 9} font-size={g >= 3 ? 6.5 : 7.5} text-anchor="end" class="mut an">{s}</text>)
    const ph = photoDe(p)
    const formePhoto = options.formePhoto ?? 'carree'
    const cadre = ph ? cadrePortrait(g, w, h, !!ph.signature, formePhoto, options.bordsArrondis ?? true) : undefined
    let lignes = lignesCartouche(g, r, implexe, h)
    if (g === 4) {
      const hp = cadre ? cadre.hp : 0
      if (ph && cadre) textes.push(<Portrait key={'p' + s} id={'ph' + s} photo={ph} x={ph.signature ? x + 4 : cx - cadre.wp / 2} y={y + 4} w={cadre.wp} h={hp} forme={formePhoto} rx={cadre.rx} rate={rater(ph.url)} />)
      lignes = caser(lignes, h - hp - 8)
      textes.push(<g key={'x' + s}><Bloc lignes={lignes} x={cx} yc={y + hp + (h - hp) / 2 + (ph ? 2 : 0)} max={w - 6} /></g>)
    } else {
      const pw = cadre ? cadre.wp : 0
      if (ph && cadre) textes.push(<Portrait key={'p' + s} id={'ph' + s} photo={ph} x={x + 7} y={y + (h - cadre.hp) / 2} w={pw} h={cadre.hp} forme={formePhoto} rx={cadre.rx} rate={rater(ph.url)} />)
      lignes = caser(lignes, h - 8)
      const gauche = x + 7 + (ph ? pw + 7 : 0)
      const largeurTexte = x + w - 6 - gauche
      textes.push(<g key={'x' + s}><Bloc lignes={lignes} x={ph ? gauche : cx} yc={y + h / 2} max={largeurTexte} ancre={ph ? 'start' : 'middle'} /></g>)
    }

    // Frères et sœurs : sous le cartouche, ou à côté pour les deux premières générations
    const f = fratrieDe(s)
    if (!f.length) continue
    if (R.fratrie) {
      const fs = [0, 0, 8.4, 7.8, 7][g]
      const l = lignesFratrie(f, w - 4, Math.floor((R.fratrie - 4) / (fs * LH)), fs)
      textes.push(
        <g key={'f' + s}>
          {l.map((m, j) => <text key={j} x={cx.toFixed(1)} y={(y + h + 4 + fs * (0.8 + j * LH)).toFixed(1)} font-size={fs} data-fs={fs} data-max={Math.round(w - 2)} text-anchor="middle" class="fr"><Morceaux parts={m} /></text>)}
        </g>,
      )
    } else {
      // à côté : du côté extérieur pour le père et la mère, à droite pour la personne de départ
      const versGauche = s === 2
      const larg = 200
      const fs = 8.8
      const l = lignesFratrie(f, larg, Math.floor((h + 6) / (fs * LH)), fs)
      const xt = versGauche ? x - 12 : x + w + 12
      const y0 = y + h / 2 - (l.length * fs * LH) / 2 + fs * 0.8
      textes.push(
        <g key={'f' + s}>
          {l.map((m, j) => <text key={j} x={xt.toFixed(1)} y={(y0 + j * fs * LH).toFixed(1)} font-size={fs} data-fs={fs} data-max={larg} text-anchor={versGauche ? 'end' : 'start'} class="fr"><Morceaux parts={m} /></text>)}
        </g>,
      )
    }
  }

  const p1 = resumes.get(1)
  const titre = p1 ? [prenoms(p1.prenom, 2), p1.nom].filter(Boolean).join(' ') : t('Ascendance')
  const avecQr = options.qr && !!d.adresse
  const avecUrl = options.url && !!d.adresse
  const avecBasDroite = avecQr || avecUrl
  const legende = [
    options.fratrie && t('en italique sous les cases : frères et sœurs'),
    options.italiques && t('date en italique : sans source'),
    implexes && t('◆ implexe'),
    options.numeros && t('chiffre dans la case : numéro Sosa, fiche au verso'),
  ].filter(Boolean).join(' · ')

  return (
    <svg ref={svg} class={'feuille pyramide' + (options.italiques ? ' italiques' : '')} viewBox="0 0 1400 990" role="img" aria-label={t('Arbre d’ascendance de {titre}', { titre })}>
      <rect width="1400" height="990" fill="#fff" />
      <g>{traits}</g>
      <g>{cases}</g>
      <g>{textes}</g>

      {/* Numéros des générations, dans la marge de gauche */}
      {rangees.slice(1).map((R, i) => (
        <text key={i} x="22" y={R.y + R.h / 2 + 4} font-size="10" class="disp mut" text-anchor="middle">{romain(i + 2)}</text>
      ))}

      {/* Titre en bas à gauche, à côté de la personne de départ */}
      <text x={X0} y="906" font-size="9.5" class="cap mut">{maj(t('Ascendance'))}</text>
      <text x={X0} y="932" font-size="24" class="disp" data-max="480">{titre}</text>
      <text x={X0} y="949" font-size="10.5" class="mut" data-max="480">{t('{g} générations · {n} ancêtres identifiés', { g: generations, n: donnees.uniques })}</text>
      {(legende || options.date) && (
        <text x={X0} y="966" font-size="8.5" class="mut" data-max="520">
          {options.date ? t('Établi le {date}', { date: options.date }) : ''}{options.date && legende ? ' · ' : ''}{legende}
        </text>
      )}
      {avecBasDroite && (
        <g>
          {avecQr && <CodeQR url={d.adresse} x={1306} y={906} taille={54} />}
          {avecUrl && (
            <>
              <text x={avecQr ? 1296 : 1360} y="948" font-size="8" class="cap mut" text-anchor="end">{maj(t('L’arbre en ligne'))}</text>
              <text x={avecQr ? 1296 : 1360} y="960" font-size="8.5" class="mut" text-anchor="end" data-max={avecQr ? 200 : 260}>{d.adresse.replace(/^https?:\/\/(www\.)?/, '')}</text>
            </>
          )}
        </g>
      )}
    </svg>
  )
}
