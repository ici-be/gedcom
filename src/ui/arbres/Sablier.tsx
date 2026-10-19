// Arbre en sablier (ascendance et descendance) : la personne de départ au milieu, avec son ou ses conjoints ;
// au-dessus ses ancêtres en rangées comme sur la pyramide (une à six générations), en dessous ses descendants
// (une à trois générations), chacun centré au-dessus de ses enfants. Mêmes thèmes, cartouches, photos,
// frères et sœurs et mariages que la pyramide. Feuille A3 paysage (1 unité = 0,3 mm).
// Variante « couple » : la personne de départ et un de ses conjoints côte à côte au milieu, les ancêtres de l'homme
// sur la moitié gauche et ceux de la femme sur la moitié droite, leurs enfants communs en dessous.

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../../lib/donnees'
import type { Arbre, Evenement, Famille, Individu, Photo } from '../../lib/gedcom/arbre'
import { decouperLieu, romain } from '../../lib/communes'
import { abregerCommune, anneeCourte, fratrie, mariageDesParents, places, prenoms, resumer, type Place, type Resume } from '../../lib/eventail'
import { marie } from '../../lib/suivi'
import type { OptionsFeuille } from './modeles'
import { chargerPolices, largeur } from './mesure'
import { ajuster } from './feuille'
import { CodeQR } from './EventailOrigines'
import {
  Bloc, cadrePortrait, caser, compteFreres, LIBELLES, lignesCartouche, lignesEtiquette, lignesFratrie, Morceaux, Portrait,
  trouverThemePyramide, type CouleurCase, type Ligne, type Mariage, type Morceau,
} from './Pyramide'

export const ASC_MIN_SABLIER = 1
export const ASC_MAX_SABLIER = 6
export const ASC_DEFAUT_SABLIER = 4
export const DESC_MIN_SABLIER = 1
export const DESC_MAX_SABLIER = 3
export const DESC_DEFAUT_SABLIER = 2

const X0 = 40
const LARG = 1320
const LH = 1.18
/** Haut et bas de l'arbre ; le pied de page (titre, légende, code QR) est en dessous */
const Y0 = 14
const Y1 = 896
const ECART = 26
const TAILLES_MARIAGE = [9, 8.5, 8, 7.5]
/** Largeur en dessous de laquelle un descendant passe en étiquette verticale */
const MIN_CARTOUCHE = 84
const CENTRE = { cx: 700, w: 260, wConjoint: 220, wCouple: 250, ecart: 76 }
const NEUTRE: CouleurCase = { trait: '#7d8580', fond: '#f6f6f3' }

const borner = (n: number | undefined, min: number, max: number, defaut: number) =>
  !n || Number.isNaN(n) ? defaut : Math.min(max, Math.max(min, Math.round(n)))
export const bornerAscendance = (n?: number) => borner(n, ASC_MIN_SABLIER, ASC_MAX_SABLIER, ASC_DEFAUT_SABLIER)
export const bornerDescendance = (n?: number) => borner(n, DESC_MIN_SABLIER, DESC_MAX_SABLIER, DESC_DEFAUT_SABLIER)

const arrondi = (n: number) => Math.round(n * 10) / 10

// ——— Descendance ———

export interface Descendant {
  ind: Individu
  /** 1 : enfant, 2 : petit-enfant… */
  profondeur: number
  conjoint?: Individu
  /** Famille du premier mariage (pour son année) */
  famille?: string
  enfants: Descendant[]
  /** Nombre de places au bas de sa branche, et la première d'entre elles */
  feuilles: number
  debut: number
  /** Rang de l'enfant de la personne de départ dont il descend (pour les couleurs par branche) */
  branche: number
}

export interface Union { famille: Famille; conjoint?: Individu; enfants: Descendant[] }

/** Les enfants d'un couple, dans l'ordre des naissances (l'ordre du fichier quand la date manque) */
export function enfantsDuCouple(arbre: Arbre, fam: Famille, naissance: (i: Individu) => Evenement | undefined): Individu[] {
  const cle = (e: Individu) => naissance(e)?.date?.tri || Infinity
  return fam.enfants
    .map((id, i) => ({ e: arbre.individus.get(id), i }))
    .filter((x): x is { e: Individu; i: number } => !!x.e)
    .sort((a, b) => cle(a.e) - cle(b.e) || a.i - b.i)
    .map(({ e }) => e)
}

const conjointDans = (arbre: Arbre, f: Famille, id: string) => {
  const c = f.mari === id ? f.femme : f.mari
  return c ? arbre.individus.get(c) : undefined
}

/**
 * Les unions de la personne et leurs descendants sur `profondeur` générations ; une personne déjà rencontrée
 * (enfant rattaché à deux couples, boucle dans le fichier) n'est comptée qu'une fois.
 */
export function descendance(arbre: Arbre, ind: Individu, profondeur: number, naissance: (i: Individu) => Evenement | undefined): Union[] {
  const vus = new Set([ind.id])
  const familles = (e: Individu) => e.fams.map((f) => arbre.familles.get(f)).filter((f): f is Famille => !!f)
  const suivants = (fams: Famille[], p: number): Descendant[] => {
    const res: Descendant[] = []
    if (p > profondeur) return res
    for (const f of fams) {
      for (const c of enfantsDuCouple(arbre, f, naissance)) {
        if (vus.has(c.id)) continue
        vus.add(c.id)
        res.push(construire(c, p))
      }
    }
    return res
  }
  const construire = (e: Individu, p: number): Descendant => {
    const fams = familles(e)
    const avec = fams.find((f) => conjointDans(arbre, f, e.id))
    return {
      ind: e,
      profondeur: p,
      conjoint: avec ? conjointDans(arbre, avec, e.id) : undefined,
      famille: (avec ?? fams[0])?.id,
      enfants: suivants(fams, p + 1),
      feuilles: 1,
      debut: 0,
      branche: 0,
    }
  }
  return familles(ind).map((f) => ({ famille: f, conjoint: conjointDans(arbre, f, ind.id), enfants: suivants([f], 1) }))
}

/**
 * L'ordre des unions de gauche à droite : le premier conjoint à droite de la personne, le deuxième à gauche,
 * les autres (sans case) au milieu ; renvoie aussi le côté de chacune.
 */
export function ordreUnions(unions: Union[]): { union: Union; cote: 'gauche' | 'droite' | 'milieu' }[] {
  const avecConjoint = unions.filter((u) => u.conjoint)
  const droite = avecConjoint[0]
  const gauche = avecConjoint[1]
  const milieu = unions.filter((u) => u !== droite && u !== gauche)
  return [
    ...(gauche ? [{ union: gauche, cote: 'gauche' as const }] : []),
    ...milieu.map((union) => ({ union, cote: 'milieu' as const })),
    ...(droite ? [{ union: droite, cote: 'droite' as const }] : []),
  ]
}

/** Places au bas de chaque branche, première place de chacun, branche ; renvoie le nombre total de places */
export function disposer(enfants: Descendant[]): number {
  const compter = (n: Descendant): number => (n.feuilles = n.enfants.length ? n.enfants.reduce((s, e) => s + compter(e), 0) : 1)
  const placer = (n: Descendant, debut: number, branche: number) => {
    n.debut = debut
    n.branche = branche
    let x = debut
    for (const e of n.enfants) { placer(e, x, branche); x += e.feuilles }
  }
  let x = 0
  enfants.forEach((e, i) => { compter(e); placer(e, x, i); x += e.feuilles })
  return x
}

/** Tous les descendants, génération par génération */
export function parProfondeur(enfants: Descendant[]): Descendant[][] {
  const res: Descendant[][] = []
  const parcourir = (n: Descendant) => { (res[n.profondeur - 1] ??= []).push(n); n.enfants.forEach(parcourir) }
  enfants.forEach(parcourir)
  return res
}

// ——— Rangées ———

export interface RangeeSablier { sens: 'asc' | 'centre' | 'desc'; g: number; y: number; h: number; fratrie: number; vertical: boolean }

/**
 * Les rangées de haut en bas : ancêtres (de la plus lointaine génération aux parents), personne de départ, descendants.
 * Les cartouches des ancêtres I à V, les étiquettes verticales au-delà ; les descendants en étiquettes quand ils sont trop
 * nombreux. Le tout rapetissé (ou un peu agrandi) pour tenir entre le haut de la feuille et le pied de page.
 */
export function rangeesSablier(asc: number, descVerticales: boolean[], fratrie: boolean, couple = false): RangeeSablier[] {
  const brut: Omit<RangeeSablier, 'y'>[] = []
  for (let g = asc; g >= 1; g--) {
    // Pour le couple, chaque moitié de la feuille porte une ascendance : les cases ont la taille de la génération suivante
    const ge = couple ? g + 1 : g
    const vertical = ge >= 5
    brut.push({ sens: 'asc', g, vertical, h: vertical ? 120 : [0, 64, 64, 68, 92][ge], fratrie: fratrie && !vertical && ge >= 2 ? 34 : 0 })
  }
  brut.push({ sens: 'centre', g: 0, vertical: false, h: 74, fratrie: 0 })
  descVerticales.forEach((v, i) => brut.push({ sens: 'desc', g: i + 1, vertical: v, h: v ? 120 : 64, fratrie: 0 }))
  const total = brut.reduce((s, r) => s + r.h + r.fratrie, 0) + ECART * (brut.length - 1)
  const k = Math.min(1.3, (Y1 - Y0) / total)
  let y = Y0 + (Y1 - Y0 - total * k) / 2
  return brut.map((r) => {
    const R = { ...r, y: arrondi(y), h: arrondi(r.h * k), fratrie: arrondi(r.fratrie * k) }
    y += (r.h + r.fratrie + ECART) * k
    return R
  })
}

const largeurAscendant = (g: number, slot: number) => (g === 1 ? 230 : g === 2 ? Math.min(slot * 0.8, 236) : g === 3 ? slot * 0.9 : g === 4 ? slot * 0.92 : slot * 0.9)
const LARGEUR_MAX_DESC = [0, 250, 230, 210]
/** Taille du texte d'un cartouche de descendant, d'après sa largeur (comme les générations de la pyramide) */
const tailleDesc = (w: number) => (w >= 220 ? 1 : w >= 170 ? 2 : w >= 110 ? 3 : 4)

/** Les conjoints de la personne, une entrée par union (pour choisir celui de l'arbre du couple) */
export function conjointsDe(arbre: Arbre, ind: Individu): { famille: string; conjoint: Individu }[] {
  return ind.fams
    .map((id) => arbre.familles.get(id))
    .filter((f): f is Famille => !!f)
    .flatMap((f) => {
      const conjoint = conjointDans(arbre, f, ind.id)
      return conjoint ? [{ famille: f.id, conjoint }] : []
    })
}

/** Une ascendance dessinée : celle de la personne de départ, ou de chacun des deux membres du couple */
interface Cote {
  cle: string
  pl: Place[]
  /** Le numéro de la place sur la feuille : le Sosa lui-même, ou décalé d'une génération dans la moitié du couple */
  virtuel: (s: number) => number
  freres: Map<number, Individu[]>
  mariages: Map<number, Mariage>
}

export function Sablier({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  return <ArbreSablier d={d} options={options} couple={false} />
}

export function Couple({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  return <ArbreSablier d={d} options={options} couple />
}

function ArbreSablier({ d, options, couple }: { d: Donnees; options: OptionsFeuille; couple: boolean }) {
  const svg = useRef<SVGSVGElement>(null)
  const [ratees, setRatees] = useState<Set<string>>(new Set())
  const [, setPolices] = useState(false)
  useEffect(() => { chargerPolices().then(() => setPolices(true)) }, [])

  const asc = bornerAscendance(options.ascendance)
  const desc = bornerDescendance(options.descendance)

  const donnees = useMemo(() => {
    const naissance = (i: Individu) => d.suivis.get(i.id)?.naissance.evenement
    const resumes = new Map<string, Resume>()
    const resume = (i: Individu) => {
      if (!resumes.has(i.id)) resumes.set(i.id, resumer(i, d.suivis.get(i.id)!))
      return resumes.get(i.id)!
    }
    const versMariage = (e?: Evenement, etat?: string): Mariage | undefined => {
      if (!e) return undefined
      const annee = anneeCourte(e)?.replace(/^\?$/, '') || undefined
      const commune = e.lieu ? abregerCommune(decouperLieu(e.lieu).nom) : undefined
      return annee || commune ? { annee, commune, sourcee: etat === 'source' } : undefined
    }

    const racine = d.arbre.individus.get(d.racine)
    const unions = racine ? descendance(d.arbre, racine, desc, naissance) : []
    let ordre: ReturnType<typeof ordreUnions>
    let personnes: (Individu | undefined)[]
    if (couple) {
      // Le conjoint choisi (le premier par défaut) ; l'homme à gauche, la femme à droite
      const choisie = unions.find((u) => u.conjoint && u.famille.id === options.conjoint) ?? unions.find((u) => u.conjoint)
      ordre = choisie ? [{ union: choisie, cote: 'milieu' }] : []
      const conjoint = choisie?.conjoint
      personnes = racine?.sexe === 'F' && conjoint?.sexe === 'M' ? [conjoint, racine] : [racine, conjoint]
    } else {
      ordre = ordreUnions(unions)
      personnes = [racine]
    }

    const cotes: Cote[] = personnes.map((ind, i) => {
      const pl = ind ? places(d.arbre, ind.id, asc + 1) : []
      const freres = new Map<number, Individu[]>()
      for (const p of pl) {
        if (!p?.ind) continue
        resume(p.ind)
        freres.set(p.sosa, fratrie(d.arbre, p.ind.id, naissance).filter((x) => x !== p.ind))
      }
      const mariages = new Map<number, Mariage>()
      for (const p of pl) {
        if (!options.mariages || !p?.ind || p.generation >= asc || p.generation + (couple ? 1 : 0) >= TAILLES_MARIAGE.length) continue
        const m = mariageDesParents(pl, p.sosa, d.suivis)
        const mm = versMariage(m?.evenement, m?.etat)
        if (mm) mariages.set(p.sosa, mm)
      }
      const virtuel = couple ? (s: number) => s + 2 ** (Math.floor(Math.log2(s)) + i) : (s: number) => s
      return { cle: 'ab'[i], pl, virtuel, freres, mariages }
    })

    const enfants = ordre.flatMap((o) => o.union.enfants)
    const feuilles = disposer(enfants)
    const niveaux = parProfondeur(enfants)
    for (const n of niveaux.flat()) resume(n.ind)
    /** L'union d'une personne dans une famille : mariée (avec l'année et la commune), ou non */
    const unionDe = (id: string, famille?: string): { marie: boolean; m?: Mariage } => {
      const f = famille ? d.suivis.get(id)?.mariages.find((x) => x.famille === famille) : undefined
      return marie(f) ? { marie: true, m: versMariage(f!.evenement, f!.etat) } : { marie: false }
    }
    // Les ancêtres, comptés une fois même s'ils reviennent (implexe, ou ancêtre commun aux deux membres du couple)
    const ids = cotes.map((c) => new Set(c.pl.filter((p) => p?.ind && p.sosa > 1).map((p) => p.ind!.id)))
    const uniques = new Set(ids.flatMap((s) => [...s])).size
    const communs = new Set(ids.length > 1 ? [...ids[0]].filter((id) => ids[1].has(id)) : [])
    return { racine, resume, cotes, naissance, ordre, feuilles, niveaux, unionDe, uniques, communs }
  }, [d, options.mariages, options.conjoint, asc, desc, couple])

  useLayoutEffect(() => {
    if (!svg.current) return
    ajuster(svg.current)
    let vivant = true
    document.fonts?.ready.then(() => vivant && svg.current && ajuster(svg.current))
    return () => { vivant = false }
  })

  const { racine, resume, cotes, naissance, ordre, feuilles, niveaux, unionDe, communs } = donnees
  const theme = trouverThemePyramide(options.theme)
  const decal = couple ? 1 : 0

  // Les descendants trop serrés passent en étiquettes verticales (toute la rangée prend leur hauteur)
  const unite = feuilles ? LARG / feuilles : LARG
  const descVerticales = (niveaux.length ? niveaux : [[]]).map((n) => n.some((x) => x.feuilles * unite < MIN_CARTOUCHE))
  const rangees = rangeesSablier(asc, descVerticales, !!options.fratrie, couple)
  const rAsc = (g: number) => rangees.find((r) => (g === 0 ? r.sens === 'centre' : r.sens === 'asc' && r.g === g))!
  const rDesc = (p: number) => rangees.find((r) => r.sens === 'desc' && r.g === p)!
  const rCentre = rAsc(0)
  /** Hauteur du trait horizontal qui relie une rangée à ses enfants (au milieu de l'espace libre au-dessus d'eux) */
  const barreAuDessus = (R: RangeeSablier) => {
    const i = rangees.indexOf(R)
    const P = rangees[i - 1]
    return arrondi((P.y + P.h + P.fratrie + R.y) / 2)
  }

  const implexes = communs.size > 0 || cotes.some((c) => c.pl.some((p) => p?.dejaVu))
  const estImplexe = (c: Cote, p: Place) => !!p.dejaVu || c.pl.some((q) => q?.dejaVu === p.sosa) || (!!p.ind && p.sosa > 1 && communs.has(p.ind.id))
  /** Les couleurs d'un ancêtre : par génération, il garde la sienne ; sinon, d'après sa place sur la feuille */
  const couleurAsc = (v: number, s: number, sexe?: 'M' | 'F' | '?') => theme.case(theme.id === 'generations' ? s : v, sexe)
  const photoDe = (i?: Individu) => (options.photos && i?.photo && !ratees.has(i.photo.url) ? i.photo : undefined)
  const rater = (url: string) => () => setRatees((r) => new Set(r).add(url))
  const listeFratrie = (f: Individu[]) => (options.fratrie ? f : []).map((x) => ({ prenom: prenoms(x.prenom, 1) || '?', annee: anneeCourte(naissance(x))?.replace(/^\?$/, '') || undefined }))
  const formePhoto = options.formePhoto ?? 'carree'

  const traits: JSX.Element[] = []
  const cases: JSX.Element[] = []
  const textes: JSX.Element[] = []
  const trait = (cle: string, chemin: string) => traits.push(<path key={cle} d={chemin} fill="none" stroke={theme.lien} stroke-width="1" />)

  /** Un cartouche : photo à gauche (en haut pour les plus étroits, taille 4), texte à côté ; renvoie rien */
  const cartouche = (cle: string, x: number, y: number, w: number, h: number, taille: number, r: Resume, implexe: boolean, c: CouleurCase, ph?: Photo, enPlus: Ligne[] = []) => {
    cases.push(<rect key={'c' + cle} x={x.toFixed(2)} y={y} width={w.toFixed(2)} height={h} rx="4" fill={c.fond} stroke={c.trait} stroke-width="1.2" />)
    const cadre = ph ? cadrePortrait(taille, w, h, !!ph.signature, formePhoto, options.bordsArrondis ?? true) : undefined
    const cx = x + w / 2
    let lignes = [...lignesCartouche(taille, r, implexe, h), ...enPlus]
    if (taille >= 4) {
      const hp = cadre ? cadre.hp : 0
      if (ph && cadre) textes.push(<Portrait key={'p' + cle} id={'ph' + cle} photo={ph} x={ph.signature ? x + 4 : cx - cadre.wp / 2} y={y + 4} w={cadre.wp} h={hp} forme={formePhoto} rx={cadre.rx} rate={rater(ph.url)} />)
      lignes = caser(lignes, h - hp - 8)
      textes.push(<g key={'x' + cle}><Bloc lignes={lignes} x={cx} yc={y + hp + (h - hp) / 2 + (ph ? 2 : 0)} max={w - 6} /></g>)
    } else {
      const pw = cadre ? cadre.wp : 0
      if (ph && cadre) textes.push(<Portrait key={'p' + cle} id={'ph' + cle} photo={ph} x={x + 7} y={y + (h - cadre.hp) / 2} w={pw} h={cadre.hp} forme={formePhoto} rx={cadre.rx} rate={rater(ph.url)} />)
      lignes = caser(lignes, h - 8)
      const gauche = x + 7 + (ph ? pw + 7 : 0)
      textes.push(<g key={'x' + cle}><Bloc lignes={lignes} x={ph ? gauche : cx} yc={y + h / 2} max={x + w - 6 - gauche} ancre={ph ? 'start' : 'middle'} /></g>)
    }
  }

  /** Une étiquette verticale */
  const etiquette = (cle: string, cx: number, y: number, w: number, h: number, g: number, r: Resume, implexe: boolean, c: CouleurCase, freresTexte = '') => {
    cases.push(<rect key={'c' + cle} x={(cx - w / 2).toFixed(2)} y={y} width={w.toFixed(2)} height={h} rx="1.5" fill={c.fond} stroke={c.trait} stroke-width={g >= 8 ? 0.45 : 0.7} />)
    const lignes = caser(lignesEtiquette(g, r, implexe, freresTexte), Math.max(w * 0.82, w - 3))
    textes.push(
      <g key={'x' + cle} transform={`translate(${cx.toFixed(2)},${y + h / 2}) rotate(-90)`}>
        <Bloc lignes={lignes} x={0} yc={0} max={h - 8} />
      </g>,
    )
  }

  /** Une case en pointillé (place sans personne) */
  const caseVide = (cle: string, x: number, y: number, w: number, h: number, rx: number) =>
    cases.push(<rect key={cle} x={x} y={y} width={w} height={h} rx={rx} fill="#fff" stroke="#c9c9c2" stroke-dasharray="3 2.5" stroke-width="0.8" />)

  /** Le mariage (année, et commune si elle tient) juste au-dessus d'une case */
  const mariageAuDessus = (cle: string, m: Mariage, cx: number, y: number, fs: number, max: number) => {
    const parts: Morceau[] = [['∞ ', 'mut'], ...(m.annee ? [[m.annee, m.sourcee ? undefined : 'nd'] as Morceau] : [])]
    const lieu = (m.annee ? ' · ' : '') + (m.commune ?? '')
    if (m.commune && (!m.annee || largeur(parts.map(([t]) => t).join('') + lieu, fs) <= max)) parts.push([lieu, 'mut'])
    if (parts.length > 1) textes.push(<text key={'m' + cle} x={cx.toFixed(1)} y={(y - 4).toFixed(1)} font-size={fs} data-fs={fs} data-max={Math.round(max)} text-anchor="middle" class="mar"><Morceaux parts={parts} /></text>)
  }

  /** Au-dessus du trait entre deux conjoints de la rangée du milieu : « ∞ » et l'année, puis la commune, s'ils sont mariés ; sinon « avec » */
  const mariageEntre = (cle: string, u: { marie: boolean; m?: Mariage }, xm: number, yMilieu: number) => {
    const max = CENTRE.ecart - 6
    const m: Partial<Mariage> = u.m ?? {}
    if (!u.marie) {
      textes.push(<text key={'mu' + cle} x={xm} y={(yMilieu - 5).toFixed(1)} font-size="9" data-fs="9" data-max={max} text-anchor="middle" class="mar mut">avec</text>)
      return
    }
    textes.push(<text key={'mu' + cle} x={xm} y={(yMilieu - (m.commune ? 15 : 5)).toFixed(1)} font-size="9" data-fs="9" data-max={max} text-anchor="middle" class="mar">
      <tspan class="mut">∞ </tspan>{m.annee && <tspan class={m.sourcee ? undefined : 'nd'}>{m.annee}</tspan>}
    </text>)
    if (m.commune) textes.push(<text key={'ml' + cle} x={xm} y={(yMilieu - 5).toFixed(1)} font-size="7.5" data-fs="7.5" data-max={max} text-anchor="middle" class="mar mut">{m.commune}</text>)
  }

  /** Les frères et sœurs à côté d'une case, vers l'extérieur de la feuille (en `xt`, sur `larg` de large) */
  const fratrieACote = (cle: string, f: ReturnType<typeof listeFratrie>, xt: number, larg: number, versGauche: boolean, yc: number, h: number) => {
    const fs = 8.8
    const l = lignesFratrie(f, larg, Math.floor((h + 6) / (fs * LH)), fs)
    const y0 = yc - (l.length * fs * LH) / 2 + fs * 0.8
    textes.push(<g key={cle}>{l.map((m, j) => <text key={j} x={xt.toFixed(1)} y={(y0 + j * fs * LH).toFixed(1)} font-size={fs} data-fs={fs} data-max={Math.round(larg)} text-anchor={versGauche ? 'end' : 'start'} class="fr"><Morceaux parts={m} /></text>)}</g>)
  }

  // ——— Ascendance (comme la pyramide, la personne de départ au milieu de la feuille ; pour le couple, une moitié chacun) ———
  const wCentre = couple ? CENTRE.wCouple : CENTRE.w
  /** La place `v` sur la feuille : G, la rangée comme sur la pyramide ; g, la génération comptée depuis la rangée du milieu */
  const pos = (v: number) => {
    const G = Math.floor(Math.log2(v))
    const g = G - decal
    const R = rAsc(g)
    if (g === 0) {
      const cx = !couple ? CENTRE.cx : v === 2 ? CENTRE.cx - (CENTRE.ecart + wCentre) / 2 : CENTRE.cx + (CENTRE.ecart + wCentre) / 2
      return { G, g, cx, x: cx - wCentre / 2, y: R.y, w: wCentre, h: R.h, R }
    }
    const n = 2 ** G
    const slot = LARG / n
    const w = largeurAscendant(G, slot)
    const cx = X0 + slot * (v - n + 0.5)
    return { G, g, cx, x: cx - w / 2, y: R.y, w, h: R.h, R }
  }

  for (const cote of cotes) {
    const { cle, pl, virtuel, freres, mariages } = cote
    const dessinee = (s: number) => !!pl[s]?.ind || (s > 1 && !!pl[s >> 1]?.ind && !!LIBELLES[pl[s]?.etat])
    for (let s = 1; s < 2 ** (asc + 1); s++) {
      if (!dessinee(s)) continue
      const p = pl[s]
      const v = virtuel(s)
      const { G, g, cx, x, y, w, h, R } = pos(v)
      const r = p.ind ? resume(p.ind) : undefined

      if (r && g < asc && (dessinee(2 * s) || dessinee(2 * s + 1))) {
        const P = pos(2 * v)
        const M = pos(2 * v + 1)
        const yb = P.R.vertical ? P.y + P.h + 4 : P.y + P.h / 2
        // Vers l'enfant : tout droit s'il est sous ses parents, sinon en équerre (les époux du couple, rapprochés au milieu)
        const xm = (P.cx + M.cx) / 2
        const ym = barreAuDessus(R)
        const bas = cx >= P.cx && cx <= M.cx ? `M${cx} ${yb}V${y}` : `M${xm} ${yb}V${ym}H${cx}V${y}`
        trait(cle + 't' + s, (P.R.vertical ? `M${P.cx} ${P.y + P.h}V${yb}H${M.cx}V${M.y + M.h}` : `M${P.x + P.w} ${yb}H${M.x}`) + bas)
        const m = mariages.get(s)
        if (m) mariageAuDessus(cle + s, m, cx, y, TAILLES_MARIAGE[G], w - 6)
      }
      if (g === 0) continue // la personne de départ (et son conjoint) se dessinent au milieu

      if (!r) {
        caseVide(cle + 'c' + s, x, y, w, h, R.vertical ? 1.5 : 3)
        const t = LIBELLES[p.etat](s)
        textes.push(R.vertical
          ? <g key={cle + 'x' + s} transform={`translate(${cx},${y + h / 2}) rotate(-90)`}><text x="0" y={(Math.min(w, 9) * 0.35).toFixed(1)} font-size={Math.min(7.5, w * 0.68)} text-anchor="middle" class="ns" data-max={h - 8}>{t}</text></g>
          : <text key={cle + 'x' + s} x={cx} y={y + h / 2 + 3} font-size={G >= 4 ? 7.5 : 9} text-anchor="middle" class="ns" data-max={w - 8}>{t}</text>)
        continue
      }

      const implexe = estImplexe(cote, p)
      const c = couleurAsc(v, s, p.ind!.sexe)
      if (R.vertical) {
        etiquette(cle + s, cx, y, w, h, G, r, implexe, c, G === 5 && options.fratrie ? compteFreres(freres.get(s) ?? []) : '')
        continue
      }
      cartouche(cle + s, x, y, w, h, G, r, implexe, c, photoDe(p.ind))

      // Frères et sœurs : sous le cartouche, ou à côté (vers l'extérieur) pour le père et la mère
      const f = listeFratrie(freres.get(s) ?? [])
      if (!f.length) continue
      if (R.fratrie) {
        const fs = [0, 0, 8.4, 7.8, 7][G]
        const l = lignesFratrie(f, w - 4, Math.floor((R.fratrie - 4) / (fs * LH)), fs)
        textes.push(<g key={cle + 'f' + s}>{l.map((m, j) => <text key={j} x={cx.toFixed(1)} y={(y + h + 4 + fs * (0.8 + j * LH)).toFixed(1)} font-size={fs} data-fs={fs} data-max={Math.round(w - 2)} text-anchor="middle" class="fr"><Morceaux parts={m} /></text>)}</g>)
      } else {
        const versGauche = v === 2
        const xt = versGauche ? x - 12 : x + w + 12
        fratrieACote(cle + 'f' + s, f, xt, versGauche ? xt - X0 - 20 : X0 + LARG - xt, versGauche, y + h / 2, h)
      }
    }
  }

  // ——— La rangée du milieu : la personne de départ et ses conjoints, ou le couple ———
  const yMilieu = rCentre.y + rCentre.h / 2
  /** D'où partent les traits vers les enfants de chaque union */
  const origines = new Map<Union, { x: number; y: number }>()
  if (couple) {
    cotes.forEach((cote, i) => {
      const { x, y, w, h } = pos(2 + i)
      const ind = cote.pl[1]?.ind
      if (!ind) {
        caseVide('vide' + i, x, y, w, h, 3)
        if (i === 1 && racine) textes.push(<text key={'vide-t' + i} x={x + w / 2} y={y + h / 2 + 3} font-size="9" text-anchor="middle" class="ns">aucun conjoint connu</text>)
        return
      }
      cartouche('centre' + cote.cle, x, y, w, h, 0, resume(ind), estImplexe(cote, cote.pl[1]), couleurAsc(2 + i, 1, ind.sexe), photoDe(ind))
      // Frères et sœurs de chacun, vers l'extérieur de la feuille
      const f = listeFratrie(cote.freres.get(1) ?? [])
      if (!f.length) return
      const xt = i === 0 ? x - 14 : x + w + 14
      fratrieACote('f' + cote.cle + '1', f, xt, i === 0 ? xt - X0 - 20 : X0 + LARG - xt - 20, i === 0, yMilieu, rCentre.h)
    })
    const union = ordre[0]?.union
    if (union && racine) {
      const A = pos(2)
      const B = pos(3)
      trait('u' + union.famille.id, `M${A.x + A.w} ${yMilieu}H${B.x}`)
      origines.set(union, { x: CENTRE.cx, y: yMilieu })
      if (options.mariages) mariageEntre(union.famille.id, unionDe(racine.id, union.famille.id), CENTRE.cx, yMilieu)
    }
  } else if (racine) {
    const xCentre = CENTRE.cx - CENTRE.w / 2
    let gaucheRangee = xCentre
    const p1 = cotes[0].pl[1]
    cartouche('centre', xCentre, rCentre.y, CENTRE.w, rCentre.h, 0, resume(racine), estImplexe(cotes[0], p1), theme.case(1, racine.sexe), photoDe(racine))
    for (const { union, cote } of ordre) {
      if (cote === 'milieu' || !union.conjoint) { origines.set(union, { x: CENTRE.cx, y: rCentre.y + rCentre.h }); continue }
      const xc = cote === 'droite' ? xCentre + CENTRE.w + CENTRE.ecart : xCentre - CENTRE.ecart - CENTRE.wConjoint
      const c = theme.famille === 'sexe' ? theme.case(1, union.conjoint.sexe) : NEUTRE
      cartouche('conj' + union.famille.id, xc, rCentre.y, CENTRE.wConjoint, rCentre.h, 1, resume(union.conjoint), false, c, photoDe(union.conjoint))
      const x1 = cote === 'droite' ? xCentre + CENTRE.w : xc + CENTRE.wConjoint
      const x2 = cote === 'droite' ? xc : xCentre
      const xm = (x1 + x2) / 2
      trait('u' + union.famille.id, `M${x1} ${yMilieu}H${x2}`)
      origines.set(union, { x: xm, y: yMilieu })
      if (cote === 'gauche') gaucheRangee = xc
      if (options.mariages) mariageEntre(union.famille.id, unionDe(racine.id, union.famille.id), xm, yMilieu)
    }
    // Frères et sœurs de la personne de départ : à gauche de la rangée
    const f = listeFratrie(cotes[0].freres.get(1) ?? [])
    if (f.length) fratrieACote('f1', f, gaucheRangee - 14, gaucheRangee - 14 - X0 - 20, true, yMilieu, rCentre.h)
  }

  // ——— Descendance ———
  const posDesc = (n: Descendant) => {
    const R = rDesc(n.profondeur)
    const span = n.feuilles * unite
    const cx = X0 + unite * (n.debut + n.feuilles / 2)
    const vertical = R.vertical && span < MIN_CARTOUCHE
    const w = vertical ? Math.min(span * 0.9, 46) : Math.min(LARGEUR_MAX_DESC[n.profondeur], span - 8)
    const h = vertical ? R.h : Math.min(R.h, 92)
    return { cx, x: cx - w / 2, y: R.y, w, h, R, vertical }
  }
  const couleurDesc = (n: Descendant): CouleurCase =>
    theme.id === 'quartiers' ? theme.apercu[n.branche % theme.apercu.length]
      : theme.id === 'generations' ? theme.case(2 ** n.profondeur)
        : theme.case(1, n.ind.sexe)
  /** Les traits d'un parent (ou d'un couple) vers ses enfants : vers le bas, une barre, puis vers chaque enfant */
  const versEnfants = (cle: string, de: { x: number; y: number }, enfants: Descendant[]) => {
    if (!enfants.length) return
    const ps = enfants.map(posDesc)
    const yb = barreAuDessus(ps[0].R)
    const xs = [de.x, ...ps.map((p) => p.cx)]
    trait(cle, `M${de.x.toFixed(1)} ${de.y}V${yb}M${Math.min(...xs).toFixed(1)} ${yb}H${Math.max(...xs).toFixed(1)}${ps.map((p) => `M${p.cx.toFixed(1)} ${yb}V${p.y}`).join('')}`)
  }
  for (const { union } of ordre) versEnfants('d' + union.famille.id, origines.get(union)!, union.enfants)
  let nbDescendants = 0
  for (const n of niveaux.flat()) {
    nbDescendants++
    const { cx, x, y, w, h, vertical } = posDesc(n)
    const r = resume(n.ind)
    if (vertical) {
      etiquette('d' + n.ind.id, cx, y, w, h, h >= 100 ? 5 : 6, r, false, couleurDesc(n))
    } else {
      const enPlus: Ligne[] = []
      if (options.mariages && n.conjoint) {
        const { marie, m } = unionDe(n.ind.id, n.famille)
        const nom = [prenoms(n.conjoint.prenom, 1), n.conjoint.nom.toLocaleUpperCase('fr')].filter(Boolean).join(' ')
        const debut: Morceau[] = marie ? [['∞ ', 'mut'], ...(m?.annee ? [[m.annee + ' ', m.sourcee ? undefined : 'nd'] as Morceau] : [])] : [['avec ', 'mut']]
        enPlus.push({ fs: [0, 9, 8.6, 8.2, 7.4][tailleDesc(w)], parts: [...debut, [nom]], cls: 'mt' })
      }
      cartouche('d' + n.ind.id, x, y, w, h, tailleDesc(w), r, false, couleurDesc(n), photoDe(n.ind), enPlus)
    }
    versEnfants('e' + n.ind.id, { x: cx, y: y + h }, n.enfants)
  }
  if (racine && !nbDescendants) {
    const R = rDesc(1)
    const hs = Math.min(R.h, 64)
    trait('sans', `M${CENTRE.cx} ${couple ? yMilieu : rCentre.y + rCentre.h}V${R.y}`)
    caseVide('sans', CENTRE.cx - 130, R.y, 260, hs, 3)
    textes.push(<text key="sans-t" x={CENTRE.cx} y={R.y + hs / 2 + 3} font-size="9" text-anchor="middle" class="ns">{couple ? 'aucun enfant commun connu' : 'aucun enfant connu'}</text>)
  }

  // ——— Marges et pied de page ———
  const NOMS_DESC = ['ENFANTS', 'PETITS-ENFANTS', 'ARRIÈRE-PETITS-ENFANTS']
  const nomDe = (i?: Individu) => {
    const r = i ? resume(i) : undefined
    return r ? [prenoms(r.prenom, 2), r.nom].filter(Boolean).join(' ') : ''
  }
  const noms = cotes.map((c) => nomDe(c.pl[1]?.ind)).filter(Boolean)
  const titre = noms.length ? noms.join(' et ') : couple ? 'Arbre du couple' : 'Ascendance et descendance'
  const surTitre = couple ? 'ARBRE DU COUPLE' : 'ASCENDANCE ET DESCENDANCE'
  const adresse = options.qr ? d.adresse : ''
  const legende = [
    options.fratrie && 'en italique : frères et sœurs',
    options.italiques && 'date en italique : sans source',
    implexes && (communs.size ? '◆ implexe ou ancêtre commun aux deux' : '◆ implexe'),
  ].filter(Boolean).join(' · ')
  const nbGenDesc = niveaux.length

  return (
    <svg ref={svg} class={'feuille pyramide sablier' + (options.italiques ? ' italiques' : '')} viewBox="0 0 1400 990" role="img" aria-label={`${couple ? 'Arbre du couple' : 'Ascendance et descendance de'} ${titre}`}>
      <rect width="1400" height="990" fill="#fff" />
      <g>{traits}</g>
      <g>{cases}</g>
      <g>{textes}</g>

      {/* Générations dans la marge de gauche : chiffres romains pour la personne et ses ancêtres, noms pour les descendants */}
      {rangees.map((R, i) => R.sens === 'desc'
        ? <g key={i} transform={`translate(22,${R.y + R.h / 2}) rotate(-90)`}><text x="0" y="3" font-size="7" class="cap mut" text-anchor="middle" data-max={R.h - 4}>{NOMS_DESC[R.g - 1]}</text></g>
        : <text key={i} x="22" y={R.y + R.h / 2 + 4} font-size="10" class="disp mut" text-anchor="middle">{romain(R.g + 1)}</text>)}

      <text x={X0} y="920" font-size="9.5" class="cap mut">{surTitre}</text>
      <text x={X0} y="944" font-size="24" class="disp" data-max="900">{titre}</text>
      <text x={X0} y="960" font-size="10.5" class="mut" data-max="900">
        {asc} génération{asc > 1 ? 's' : ''} d’ancêtres{couple ? ' de chacun' : ''} · {donnees.uniques} ancêtres identifiés · {nbDescendants} descendant{nbDescendants > 1 ? 's' : ''}{couple && nbDescendants ? ` commun${nbDescendants > 1 ? 's' : ''}` : ''}{nbGenDesc ? ` sur ${nbGenDesc} génération${nbGenDesc > 1 ? 's' : ''}` : ''}
      </text>
      {(legende || options.date) && (
        <text x={X0} y="976" font-size="8.5" class="mut" data-max="900">
          {options.date ? `Établi le ${options.date}` : ''}{options.date && legende ? ' · ' : ''}{legende}
        </text>
      )}
      {adresse && (
        <g>
          <CodeQR url={adresse} x={1306} y={914} taille={54} />
          <text x="1296" y="956" font-size="8" class="cap mut" text-anchor="end">L’ARBRE EN LIGNE</text>
          <text x="1296" y="968" font-size="8.5" class="mut" text-anchor="end" data-max="200">{adresse.replace(/^https?:\/\/(www\.)?/, '')}</text>
        </g>
      )}
    </svg>
  )
}
