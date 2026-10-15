// Éventail des origines : huit générations sur 220°, chaque case teintée selon la province de naissance.
// Feuille A3 paysage (1 unité = 0,3 mm).

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import type { Donnees } from '../../lib/donnees'
import { situerArbre, type Position } from '../../lib/geo'
import { romain } from '../../lib/communes'
import {
  abregerCommune, angles, arc, couperLignes, fratrie, GENERATIONS_RECTO, LIEU_INCONNU, LIEU_NON_SITUE, morceauxTitre, nomPays, parNom, places, point, prenoms,
  ordreRegions, regionsDesPlaces, resumer, secteur, situerRegion, type Centre, type Place, type Resume,
} from '../../lib/eventail'
import { aCadrer, cadrer, chargerContours, colonnes, grouper, proportions, zones, type Contours, type Entree, type Fenetre, type Groupe, type Rect, type Zone } from '../../lib/carte-origines'
import type { OptionsFeuille } from './modeles'
import { chargerPolices, largeur, type Police } from './mesure'
import { FondCarte } from './FondCarte'
import { ajuster, AUTRES, couleursRegions, GRIS, INCONNU, TEINTES } from './feuille'

const GENERATIONS = GENERATIONS_RECTO
const OUVERTURE = 220
const O: Centre = { cx: 700, cy: 690 }
const RAYONS = [0, 96, 176, 254, 330, 408, 486, 566, 636]


type Morceau = [string, string?]
/** `coupe` : texte abrégé par « … » plutôt que trop resserré */
interface Ligne { fs: number; parts: Morceau[]; cls?: string; coupe?: boolean }

const maj = (s: string) => s.toLocaleUpperCase('fr')
const LH = 1.2

function Morceaux({ parts }: { parts: Morceau[] }) {
  return <>{parts.map(([t, c], i) => <tspan key={i} class={c}>{t}</tspan>)}</>
}

/** Attributs relus par ajuster() : taille prévue, place disponible, texte entier */
const mesure = (l: Ligne, max: number) => ({
  'font-size': l.fs, 'data-fs': l.fs, 'data-max': Math.round(max), 'data-texte': l.coupe ? l.parts.map(([t]) => t).join('') : undefined,
})

/** Lignes courbes, centrées dans la case ; retournées dans le bas de l'éventail pour rester lisibles */
function TexteCourbe({ id, r1, r2, a1, a2, lignes }: { id: string; r1: number; r2: number; a1: number; a2: number; lignes: Ligne[] }) {
  // L'éventail ne descend qu'à 110° sous l'horizontale : sans retourner, les extrémités se lisent comme leurs voisines
  const retourne = Math.abs((a1 + a2) / 2) > 135
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  const rm = (r1 + r2) / 2
  let cumul = 0
  return (
    <>
      {lignes.map((l, j) => {
        const h = l.fs * LH
        const r = retourne ? rm - H / 2 + cumul + h * 0.76 : rm + H / 2 - cumul - h * 0.76
        cumul += h
        const pid = `${id}-${j}`
        return (
          <g key={j}>
            <path id={pid} d={arc(O, r, a1, a2, retourne)} fill="none" />
            <text {...mesure(l, r * ((a2 - a1) * Math.PI / 180) - 8)} text-anchor="middle" class={l.cls}>
              <textPath href={'#' + pid} startOffset="50%"><Morceaux parts={l.parts} /></textPath>
            </text>
          </g>
        )
      })}
    </>
  )
}

/** Lignes le long du rayon, lues du centre vers le bord à droite et du bord vers le centre à gauche */
function TexteRayon({ r1, r2, a1, a2, lignes }: { r1: number; r2: number; a1: number; a2: number; lignes: Ligne[] }) {
  const ac = (a1 + a2) / 2
  const dehors = ac >= 0
  const rm = (r1 + r2) / 2
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  let cumul = 0
  return (
    <g transform={`translate(${O.cx},${O.cy}) rotate(${(dehors ? ac - 90 : ac + 90).toFixed(2)})`}>
      {lignes.map((l, j) => {
        const h = l.fs * LH
        const y = -H / 2 + cumul + h * 0.76
        cumul += h
        return (
          <text key={j} x={dehors ? rm : -rm} y={y.toFixed(2)} {...mesure(l, r2 - r1 - 9)} text-anchor="middle" class={l.cls}>
            <Morceaux parts={l.parts} />
          </text>
        )
      })}
    </g>
  )
}

function annees(r: Resume): Morceau[] {
  const n = r.naissance ?? '?'
  // nd : date sans source, en italique si l'option est cochée (classe « italiques » de la feuille)
  const cn = r.naissanceSourcee ? undefined : 'nd'
  if (r.vivant) return [[n, cn]]
  return [[n, cn], [' – '], [r.deces ?? '?', r.decesSourcee ? undefined : 'nd']]
}

/** Prénoms (deux au plus) puis nom sur une seconde ligne, ou « Prénom NOM » sur une seule */
function nom(r: Resume, fs: number, opts: { fsNom?: number; implexe?: boolean } = {}): Ligne[] {
  const nm: Morceau[] = [[maj(r.nom || '?'), 'nm'], ...(opts.implexe ? [[' ◆', 'so'] as Morceau] : [])]
  if (!opts.fsNom) return [{ fs, parts: [[prenoms(r.prenom, 1) + ' ', 'pn'], ...nm] }]
  const pn = prenoms(r.prenom, 2)
  return pn ? [{ fs, parts: [[pn, 'pn']] }, { fs: opts.fsNom, parts: nm }] : [{ fs: opts.fsNom, parts: nm }]
}

/** Métier sur deux lignes quand il serait trop serré sur une (estimation : 0,45 em par signe) */
function metier(t: string | undefined, fs: number, largeur: number): Ligne[] {
  if (!t) return []
  const mots = t.split(/\s+/)
  if (t.length * fs * 0.45 <= largeur || mots.length < 2) return [{ fs, parts: [[t, 'mt']], coupe: true }]
  let coupure = 1
  let pire = Infinity
  for (let i = 1; i < mots.length; i++) {
    const l = Math.max(mots.slice(0, i).join(' ').length, mots.slice(i).join(' ').length)
    if (l < pire) { pire = l; coupure = i }
  }
  return [mots.slice(0, coupure).join(' '), mots.slice(coupure).join(' ')].map((m) => ({ fs, parts: [[m, 'mt']], coupe: true }))
}

/** Le texte d'une case, de plus en plus léger vers le bord ; `largeur` : longueur approximative d'une ligne */
function lignesCase(p: Place, r: Resume, implexe: boolean, largeur: number): Ligne[] {
  const g = p.generation
  const lieu = r.commune ? maj(abregerCommune(r.commune)) : ''
  const l = (fs: number, parts: Morceau[], cls?: string): Ligne[] => (parts.some(([t]) => t) ? [{ fs, parts, cls }] : [])
  if (g === 1) return [...nom(r, 16, { fsNom: 13.5, implexe }), ...l(11, annees(r)), ...l(10, [[lieu]], 'lieu'), ...metier(r.metier, 10.5, largeur)]
  if (g === 2) return [...nom(r, 13, { fsNom: 11.5, implexe }), ...l(10, annees(r)), ...l(9.5, [[lieu]], 'lieu'), ...metier(r.metier, 9.5, largeur)]
  if (g === 3) return [...nom(r, 11.5, { fsNom: 10, implexe }), ...l(9.5, annees(r)), ...l(9, [[lieu]], 'lieu'), ...metier(r.metier, 9, largeur)]
  if (g === 4) return [...nom(r, 10, { fsNom: 9.2, implexe }), ...l(8.8, annees(r)), ...l(8.3, [[lieu]], 'lieu'), ...metier(r.metier, 8.3, largeur)]
  if (g === 5) return [...nom(r, 9, { implexe }), ...l(8.3, annees(r)), ...l(7.8, [[lieu]], 'lieu'), ...metier(r.metier, 7.8, largeur)]
  if (g === 6) return [...nom(r, 8, { implexe }), ...l(7.2, [...annees(r), ...(lieu ? [[' · ' + lieu, 'lieu'] as Morceau] : [])])]
  return nom(r, 7.4, { implexe })
}

/** Réduit toutes les lignes d'une case si leur hauteur dépasse la place disponible */
function caser(lignes: Ligne[], hauteur: number): Ligne[] {
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  if (H <= hauteur) return lignes
  const k = hauteur / H
  return lignes.map((l) => ({ ...l, fs: Math.round(l.fs * k * 100) / 100 }))
}

const LIBELLES: Record<string, (sosa: number) => string> = {
  inconnu: (s) => (s % 2 ? 'mère inconnue' : 'père inconnu'),
  introuvable: () => 'introuvable',
  'a-chercher': () => 'à trouver',
}

interface Bout { t: string; cls?: string; police: Police; k?: number; dx?: number }
interface LigneCentre { fs: number; bouts: Bout[]; avant?: number }

const longueur = (l: LigneCentre, fs = l.fs) =>
  l.bouts.reduce((s, b) => s + largeur(b.t, fs * (b.k ?? 1), b.police) + (b.dx ?? 0) * fs * (b.k ?? 1), 0)

/**
 * Le cercle central avec toute la fratrie : un prénom par ligne suivi de l'année de naissance,
 * le nom de famille dessous (une fois par nom), chaque ligne réduite à la corde du cercle à sa hauteur.
 */
function CentreFratrie({ enfants }: { enfants: Resume[] }) {
  const R = RAYONS[1] - 6
  const n = enfants.length
  const fs = n <= 3 ? 19 : n <= 5 ? 15 : 13
  const lignes: LigneCentre[] = []
  parNom(enfants).forEach((g, i, gs) => {
    for (const e of g.enfants) {
      lignes.push({ fs, bouts: [
        { t: prenoms(e.prenom, 1) || '?', cls: 'pn', police: 'prenom' },
        ...(e.naissance ? [{ t: e.naissance, cls: e.naissanceSourcee ? 'mut' : 'mut nd', police: 'texte', k: fs < 15 ? 0.72 : 0.6, dx: 0.4 } as Bout] : []),
      ] })
    }
    lignes.push({ fs: Math.max(11, fs * 0.62), bouts: [{ t: maj(g.nom || '?'), cls: 'nm', police: 'nom' }], avant: 2 })
    if (i < gs.length - 1) lignes.push({ fs: fs * 0.4, bouts: [] })
  })
  const IL = 1.18
  let H = lignes.reduce((s, l) => s + l.fs * IL + (l.avant ?? 0), 0)
  const k = Math.min(1, (2 * R * 0.86) / H)
  H *= k
  let y = O.cy - H / 2
  return (
    <g text-anchor="middle">
      {lignes.map((l, j) => {
        y += (l.avant ?? 0) * k
        const h = l.fs * k * IL
        const base = y + h * 0.78
        y += h
        if (!l.bouts.length) return null
        // largeur du cercle entre le haut et le bas de la ligne
        const d = Math.max(Math.abs(base - l.fs * k * 0.72 - O.cy), Math.abs(base + l.fs * k * 0.22 - O.cy))
        const corde = 2 * Math.sqrt(Math.max(0, R * R - d * d))
        const w = longueur(l, l.fs * k)
        const taille = w > corde ? (l.fs * k * corde) / w : l.fs * k
        return (
          <text key={j} x={O.cx} y={base.toFixed(1)} font-size={taille.toFixed(2)} data-max={Math.round(corde)}>
            {l.bouts.map((b, i) => <tspan key={i} class={b.cls} font-size={b.k ? b.k + 'em' : undefined} dx={b.dx ? b.dx + 'em' : undefined}>{b.t}</tspan>)}
          </text>
        )
      })}
    </g>
  )
}

/** L'éventail (bandeau des quartiers compris) s'arrête à ce rayon ; le titre s'en tient éloigné d'ECART */
const BORD = 670
const ECART = 40
const MARGE_GAUCHE = 40

/**
 * Largeur permise à une ligne posée à gauche : son coin bas droit (le plus proche de l'éventail)
 * reste à ECART du bord, mesuré vers le centre de l'éventail
 */
function placeAGauche(bas: number): number {
  const dy = O.cy - bas
  return O.cx - Math.sqrt(Math.max(0, (BORD + ECART) ** 2 - dy * dy)) - MARGE_GAUCHE
}

interface Bloc { lignes: { t: string; y: number; max: number }[]; fs: number; bas: number }

/** Un texte coupé en lignes à gauche de l'éventail, à partir de la hauteur `haut` (haut des lettres) */
function blocAGauche(morceaux: string[], haut: number, tailles: number[], maxLignes: number, interligne: number, police: Police): Bloc {
  const base = (i: number, fs: number) => haut + fs * 0.8 + i * fs * interligne
  const place = (i: number, fs: number) => placeAGauche(base(i, fs) + fs * 0.25)
  // le moins de lignes possible : trois au plus si ça tient, sinon jusqu'à maxLignes
  const couper = (n: number) => couperLignes(morceaux, tailles, n, (t, f) => largeur(t, f, police), place)
  const c = couper(Math.min(3, maxLignes))
  const { lignes, fs } = c.tient || maxLignes <= 3 ? c : couper(maxLignes)
  return { lignes: lignes.map((t, i) => ({ t, y: base(i, fs), max: Math.round(place(i, fs)) })), fs, bas: base(lignes.length - 1, fs) }
}

function CodeQR({ url, x, y, taille }: { url: string; x: number; y: number; taille: number }) {
  const d = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const n = qr.getModuleCount()
    let chemin = ''
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.isDark(i, j)) chemin += `M${j},${i}h1v1h-1z`
    return { chemin, n }
  }, [url])
  return (
    <g transform={`translate(${x},${y}) scale(${taille / d.n})`}>
      <path d={d.chemin} fill={GRIS} />
    </g>
  )
}

const HAUT_CARTE = 796
const HAUTEUR_CARTE = 172

/**
 * Bas de la feuille : la carte des régions de naissance, cadrée sur celles des ancêtres, et la légende en deux colonnes.
 * Les naissances outre-mer ou outre-Manche ont chacune leur cartouche à droite (une seule carte resterait sinon presque vide).
 */
function CarteOrigines({ contours, couleurs, poids, groupes }: { contours: Contours; couleurs: Map<string, string>; poids: Map<string, number>; groupes: Groupe[] }) {
  const zs = zones(poids).filter((z) => cadrer(contours, z.codes))
  if (!zs.length) return null
  // marge fixe pour la carte principale ; proportionnée au territoire pour les autres (une île n'a pas besoin de 25 km de mer)
  const fenetres = zs.map((z, i) => {
    if (i === 0) return cadrer(contours, aCadrer(contours, z, true))!
    const f = cadrer(contours, aCadrer(contours, z, false), 0)!
    const m = Math.max(f[2] - f[0], f[3] - f[1]) * 0.06
    return [f[0] - m, f[1] - m, f[2] + m, f[3] + m] as Fenetre
  })
  const props = fenetres.map(proportions)
  const secondaires = zs.slice(1).map((z, i) => ({ z, f: fenetres[i + 1], prop: props[i + 1] }))
  const H = HAUTEUR_CARTE
  // Les cartouches empilés à droite, sous leur titre, au plus 84 de large ; la carte principale centrée avec eux
  const n = secondaires.length
  const hs = n ? (H - (n - 1) * 8) / n - 11 : 0
  const ws = secondaires.map((s) => Math.min(84, hs * s.prop))
  const largeurC = n ? Math.max(...ws) + 14 : 0
  const w0 = Math.min(n ? 220 : 240, H * props[0])
  const h0 = w0 / props[0]
  const gauche = 700 - (w0 + largeurC) / 2
  const droite = gauche + w0 + largeurC
  const cartes: { z: Zone; f: Fenetre; r: Rect; cartouche?: boolean }[] = [{ z: zs[0], f: fenetres[0], r: { x: gauche, y: HAUT_CARTE + (H - h0) / 2, w: w0, h: h0 } }]
  secondaires.forEach((s, i) => {
    cartes.push({ z: s.z, f: s.f, r: { x: gauche + w0 + 14, y: HAUT_CARTE + i * (hs + 19) + 11, w: ws[i], h: ws[i] / s.prop }, cartouche: true })
  })

  const [colG, colD] = colonnes(groupes)
  const lignes = (c: Groupe[]) => c.reduce((s, g) => s + g.lignes.length + (g.titre ? 1.5 : 0.5), 0)
  const pas = Math.min(15, 168 / Math.max(lignes(colG), lignes(colD)))
  const fs = Math.min(10, pas * 0.68)
  const colonne = (c: Groupe[], x: number, fin: boolean) => {
    const a = fin ? 'end' : 'start'
    const els: JSX.Element[] = []
    let y = 806
    for (const g of c) {
      if (g.titre) { els.push(<text key={'t' + g.titre} x={x} y={y.toFixed(1)} font-size={Math.min(8.5, fs)} class="cap mut" text-anchor={a}>{maj(g.titre)}</text>); y += pas }
      else y += pas * 0.5
      for (const l of g.lignes) {
        const cx = fin ? x - 12 : x
        els.push(
          <g key={g.titre + l.nom}>
            <rect x={cx} y={(y - pas * 0.6).toFixed(1)} width="12" height={(pas * 0.73).toFixed(1)} fill={l.couleur} />
            <text x={fin ? x - 17 : x + 17} y={y.toFixed(1)} font-size={fs} data-fs={fs} data-max="200" text-anchor={a}>{l.nom} <tspan class="mut">{l.n}</tspan></text>
          </g>,
        )
        y += pas
      }
      y += pas * 0.5
    }
    return els
  }
  return (
    <g>
      {cartes.map((c, i) => (
        <g key={c.z.zone}>
          <FondCarte id={'carte-' + i} contours={contours} f={c.f} zone={c.r} couleurs={couleurs} cadre={c.cartouche} />
          {c.cartouche && <text x={c.r.x} y={c.r.y - 4} font-size="7.5" class="cap mut" data-max={Math.round(Math.max(c.r.w, 84))}>{maj(c.z.titre)}</text>}
        </g>
      ))}
      {colonne(colG, gauche - 26, true)}
      {colonne(colD, droite + 26, false)}
    </g>
  )
}

export function EventailOrigines({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  const svg = useRef<SVGSVGElement>(null)
  const [positions, setPositions] = useState<Map<string, Position>>()
  const [contours, setContours] = useState<Contours>()
  // Les lignes du titre et du centre se coupent d'après les polices de la feuille : on les attend
  const [polices, setPolices] = useState(false)
  useEffect(() => { chargerPolices().then(() => setPolices(true)) }, [])
  useEffect(() => {
    let vivant = true
    situerArbre(d.arbre).then((p) => vivant && setPositions(p)).catch(() => {})
    return () => { vivant = false }
  }, [d.arbre])
  useEffect(() => {
    if (!options.carte || contours) return
    let vivant = true
    chargerContours().then((c) => vivant && setContours(c)).catch(() => {})
    return () => { vivant = false }
  }, [options.carte])

  const donnees = useMemo(() => {
    const pl = places(d.arbre, d.racine, GENERATIONS)
    const resumes = new Map<number, Resume>()
    for (const p of pl) if (p?.ind) resumes.set(p.sosa, resumer(p.ind, d.suivis.get(p.ind.id)!))
    const regions = regionsDesPlaces(resumes, positions)
    const ordre = ordreRegions(pl, regions)
    const couleurs = couleursRegions(ordre)
    const couleur = (reg: string) => couleurs.get(reg) ?? (reg === LIEU_INCONNU || reg === LIEU_NON_SITUE ? INCONNU : AUTRES)
    const legende: { nom: string; couleur: string }[] = ordre.slice(0, TEINTES.length).map((r) => ({ nom: r, couleur: couleurs.get(r)! }))
    if (ordre.length > TEINTES.length) legende.push({ nom: 'Autres régions', couleur: AUTRES })
    if (pl.some((p) => p?.ind && !p.dejaVu && p.sosa > 1 && [LIEU_INCONNU, LIEU_NON_SITUE].includes(regions.get(p.sosa)!))) legende.push({ nom: 'Lieu inconnu ou non situé', couleur: INCONNU })

    const uniques = pl.filter((p) => p?.ind && !p.dejaVu && p.sosa > 1)
    const communes = new Set<string>()
    for (const p of uniques) { const r = resumes.get(p.sosa)!; if (r.commune) communes.add(r.commune) }
    const nbRegions = new Set(uniques.map((p) => regions.get(p.sosa)!).filter((r) => r !== LIEU_INCONNU && r !== LIEU_NON_SITUE)).size
    const parGeneration = Array.from({ length: GENERATIONS - 1 }, (_, i) => {
      const g = i + 1
      const l = pl.filter((p) => p && p.generation === g && p.ind)
      const segments = new Map<string, number>()
      for (const p of l) { const c = couleur(regions.get(p.sosa)!); segments.set(c, (segments.get(c) ?? 0) + 1) }
      // dans l'ordre de la légende
      const tri = [...legende.map((x) => x.couleur)]
      return { g, connus: l.length, segments: [...segments.entries()].sort((a, b) => tri.indexOf(a[0]) - tri.indexOf(b[0])) }
    })
    // Pour la carte : la couleur de chaque région dessinable, et la légende groupée par pays
    const couleursCarte = new Map<string, string>()
    const poidsCarte = new Map<string, number>()
    const entrees = new Map<string, Entree>()
    let inconnus = 0
    for (const p of uniques) {
      const reg = regions.get(p.sosa)!
      if (reg === LIEU_INCONNU || reg === LIEU_NON_SITUE) { inconnus++; continue }
      const lieu = resumes.get(p.sosa)!.lieu!
      const pos = positions?.get(lieu)
      if (pos?.codeRegion) { couleursCarte.set(pos.codeRegion, couleur(reg)); poidsCarte.set(pos.codeRegion, (poidsCarte.get(pos.codeRegion) ?? 0) + 1) }
      const e = entrees.get(reg)
      if (e) e.n++
      else { const s = situerRegion(lieu, pos); entrees.set(reg, { nom: s.region, pays: s.pays, couleur: couleur(reg), n: 1 }) }
    }
    const groupes = grouper([...entrees.values()], nomPays, AUTRES)
    if (inconnus) groupes.push({ titre: '', lignes: [{ nom: 'Lieu inconnu ou non situé', couleur: INCONNU, n: inconnus }] })
    return { pl, resumes, regions, couleur, legende, ancetres: uniques.length, communes: communes.size, nbRegions, parGeneration, couleursCarte, poidsCarte, groupes }
  }, [d, positions])

  useLayoutEffect(() => {
    if (!svg.current) return
    ajuster(svg.current)
    let vivant = true
    document.fonts?.ready.then(() => vivant && svg.current && ajuster(svg.current))
    return () => { vivant = false }
  })

  const { pl, resumes, regions, couleur } = donnees
  // Une même personne à deux places de l'éventail
  const implexes = pl.some((p) => p?.dejaVu)
  const enfants = useMemo(() => !options.fratrie ? [] : fratrie(d.arbre, d.racine, (ind) => d.suivis.get(ind.id)?.naissance.evenement)
    .map((ind) => resumer(ind, d.suivis.get(ind.id)!)), [d, options.fratrie])
  const avecFratrie = enfants.length > 1
  const cases: JSX.Element[] = []
  const textes: JSX.Element[] = []
  for (let s = 2; s < 2 ** GENERATIONS; s++) {
    const p = pl[s]
    const { a1, a2, generation: g } = angles(s, OUVERTURE)
    const r1 = RAYONS[g]
    const r2 = RAYONS[g + 1]
    const r = resumes.get(s)
    const fond = r ? couleur(regions.get(s)!) : p.etat === 'vide' && !p.sousInconnu ? '#f6f6f3' : 'url(#hachures)'
    cases.push(<path key={s} d={secteur(O, r1, r2, a1, a2)} fill={fond} stroke="#fff" stroke-width={g >= 7 ? 0.8 : 1.4} />)
    const rm = (r1 + r2) / 2
    const ouv = (a2 - a1) * Math.PI / 180
    const courbe = r && rm * ouv > (r2 - r1) * 1.05
    let lignes: Ligne[] = []
    if (r) lignes = lignesCase(p, r, !!p.dejaVu || pl.some((q) => q?.dejaVu === s), courbe ? (r1 + (r2 - r1) * 0.3) * ouv - 8 : r2 - r1 - 9)
    else if (LIBELLES[p.etat]) lignes = [{ fs: g >= 7 ? 7.2 : 8.5, parts: [[LIBELLES[p.etat](s), 'ns']] }]
    if (!lignes.length) continue
    // Hauteur : l'épaisseur de l'anneau pour un texte courbe, la largeur de la case côté centre pour un texte en rayon
    lignes = caser(lignes, courbe ? r2 - r1 - 6 : (r1 + 4.5) * ouv - 3)
    textes.push(courbe
      ? <TexteCourbe key={s} id={`c${s}`} r1={r1} r2={r2} a1={a1} a2={a2} lignes={lignes} />
      : <TexteRayon key={s} r1={r1} r2={r2} a1={a1} a2={a2} lignes={lignes} />)
  }

  const R = RAYONS[GENERATIONS]
  const p1 = resumes.get(1)
  const parents = [2, 3].map((s) => resumes.get(s)).filter((r): r is Resume => !!r).map((r) => [prenoms(r.prenom, 1), r.nom].filter(Boolean).join(' '))
  const morceaux = avecFratrie ? morceauxTitre(enfants.map((e) => ({ prenom: prenoms(e.prenom, 1), nom: e.nom })), parents)
    : p1 ? morceauxTitre([p1], []) : ['Ascendance']
  const titre = morceaux.join(' ')
  // Le titre et le sous-titre sur autant de lignes qu'il faut pour rester à distance de l'éventail
  const [blocTitre, blocSous] = useMemo(() => {
    const t = blocAGauche(morceaux, 72, [32, 30, 28, 26, 24, 22], 4, 1.12, 'titre')
    const st = blocAGauche([`et ${avecFratrie ? 'leurs' : 'ses'} ancêtres,`, 'selon leur lieu de naissance'], t.bas + 12, [12, 11], 2, 1.3, 'texte')
    return [t, st]
  }, [titre, avecFratrie, polices])
  const quartiers = [4, 5, 6, 7].map((s, i) => {
    const a1 = -OUVERTURE / 2 + (i * OUVERTURE) / 4
    const a2 = a1 + OUVERTURE / 4
    const nomQ = resumes.get(s)?.nom
    return (
      <g key={s}>
        <path d={secteur(O, R + 3, R + 12, a1 + 0.3, a2 - 0.3)} fill={i % 2 ? '#8b928e' : GRIS} />
        <path id={'q' + s} d={arc(O, R + 24, a1, a2)} fill="none" />
        <text font-size={10.5} text-anchor="middle" class="cap">
          <textPath href={'#q' + s} startOffset="50%">
            <tspan class="mut">QUARTIER </tspan><tspan class="nm">{maj(nomQ || '?')}</tspan>
          </textPath>
        </text>
      </g>
    )
  })
  const x0 = 452
  const W = 496
  const y0 = 822
  const yLegende = y0 + (GENERATIONS - 1) * 14 + 20
  const adresse = options.qr ? d.adresse : ''
  // Sans contours (pas encore chargés) ou sans ancêtre sur la carte : les barres
  const carte = options.carte && contours && cadrer(contours, donnees.couleursCarte.keys())

  return (
    <svg ref={svg} class={'feuille' + (options.italiques ? ' italiques' : '')} viewBox="0 0 1400 990" role="img" aria-label={`Éventail des origines de ${titre}`}>
      <defs>
        <pattern id="hachures" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#d8d8d2" stroke-width="1.3" />
        </pattern>
      </defs>
      <rect width="1400" height="990" fill="#fff" />
      <g>{cases}</g>
      <g>{textes}</g>
      {quartiers}

      {/* Centre : la personne de départ */}
      <circle cx={O.cx} cy={O.cy} r={RAYONS[1]} fill="#fff" stroke={GRIS} stroke-width="1" />
      {avecFratrie ? <CentreFratrie enfants={enfants} /> : p1 && (
        <g text-anchor="middle">
          <text x={O.cx} y={O.cy - 22} font-size="26" class="pn" data-max="170">{p1.prenom}</text>
          <text x={O.cx} y={O.cy - 2} font-size="13" class="nm" data-max="170">{maj(p1.nom)}</text>
          <text x={O.cx} y={O.cy + 19} font-size="11"><Morceaux parts={annees(p1)} /></text>
          {p1.commune && <text x={O.cx} y={O.cy + 34} font-size="9.5" class="lieu" data-max="150">{maj(abregerCommune(p1.commune))}</text>}
        </g>
      )}

      {/* Numéro de chaque génération, le long des deux bras de l'éventail */}
      {RAYONS.slice(1, -1).map((r1, i) => {
        const g = i + 1
        const rm = (r1 + RAYONS[g + 1]) / 2
        return [-1, 1].map((cote) => {
          const [x, y] = point(O, rm, (cote * OUVERTURE) / 2)
          return <text key={`${g}${cote}`} font-size="9.5" class="disp mut" text-anchor="middle" transform={`translate(${x},${y}) rotate(${cote * 20}) translate(0,12)`}>{romain(g + 1)}</text>
        })
      })}

      {/* Titre et chiffres */}
      <text x={MARGE_GAUCHE} y="64" font-size="11" class="cap mut">ASCENDANCE</text>
      {blocTitre.lignes.map((l) => <text key={'t' + l.y} x={MARGE_GAUCHE} y={l.y.toFixed(1)} font-size={blocTitre.fs} class="disp" data-max={l.max}>{l.t}</text>)}
      {blocSous.lignes.map((l) => <text key={'s' + l.y} x={MARGE_GAUCHE} y={l.y.toFixed(1)} font-size={blocSous.fs} class="mut" data-max={l.max}>{l.t}</text>)}
      <g text-anchor="end">
        {([[donnees.ancetres, 'ancêtres identifiés'], [donnees.communes, 'communes de naissance'], [donnees.nbRegions, 'provinces et régions']] as const).map(([v, l], i) => (
          <g key={l}>
            <text x="1360" y={82 + i * 42} font-size="26" class="disp">{v}</text>
            <text x="1360" y={96 + i * 42} font-size="9.5" class="mut">{l}</text>
          </g>
        ))}
      </g>

      {/* Lieux de naissance sur la carte, ou origine par génération */}
      {carte ? <CarteOrigines contours={contours!} couleurs={donnees.couleursCarte} poids={donnees.poidsCarte} groupes={donnees.groupes} /> : <>
      <text x={O.cx} y={y0 - 12} font-size="10" class="cap mut" text-anchor="middle">ORIGINE DES ANCÊTRES CONNUS, PAR GÉNÉRATION</text>
      {donnees.parGeneration.map(({ g, connus, segments }, j) => {
        const y = y0 + j * 14
        let x = x0
        return (
          <g key={g}>
            <text x={x0 - 8} y={y + 8.5} font-size="10" class="disp" text-anchor="end">{romain(g + 1)}</text>
            <rect x={x0} y={y} width={W} height="10" fill="#f6f6f3" />
            {connus > 0 && segments.map(([c, n]) => {
              const w = (W * n) / 2 ** g
              const el = <rect key={c} x={x.toFixed(2)} y={y} width={w.toFixed(2)} height="10" fill={c} stroke="#fff" stroke-width="0.8" />
              x += w
              return el
            })}
            <text x={x0 + W + 8} y={y + 8.5} font-size="9" class="mut">{connus}/{2 ** g}</text>
          </g>
        )
      })}
      {donnees.legende.map((l, i) => {
        const x = 330 + (i % 4) * 185
        const y = yLegende + Math.floor(i / 4) * 16
        return (
          <g key={l.nom}>
            <rect x={x} y={y - 9} width="12" height="11" fill={l.couleur} />
            <text x={x + 17} y={y} font-size="10" data-max="160">{l.nom}</text>
          </g>
        )
      })}
      </>}

      {/* Pied de page */}
      {(options.italiques || implexes) && (
        <text x="40" y={options.date ? 950 : 966} font-size="8.5" class="mut">
          {options.italiques && <><tspan class="ns">italique</tspan> : date sans source</>}
          {options.italiques && implexes && ' · '}
          {implexes && '◆ implexe'}
        </text>
      )}
      {options.date && <text x="40" y="966" font-size="8.5" class="mut">Établi le {options.date}</text>}
      {adresse && (
        <g>
          <CodeQR url={adresse} x={1306} y={914} taille={54} />
          <text x="1296" y="952" font-size="8" class="cap mut" text-anchor="end">L’ARBRE EN LIGNE</text>
          <text x="1296" y="964" font-size="8.5" class="mut" text-anchor="end" data-max="230">{adresse.replace(/^https?:\/\/(www\.)?/, '')}</text>
        </g>
      )}
    </svg>
  )
}
