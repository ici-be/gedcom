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
import { abregerCommune, anneeCourte, fratrie, places, prenoms, resumer, type Place, type Resume } from '../../lib/eventail'
import type { OptionsFeuille } from './modeles'
import { chargerPolices, largeur } from './mesure'
import { ajuster } from './feuille'
import { CodeQR } from './EventailOrigines'

const GENERATIONS = 8
/** Mariage des parents au-dessus des cases des générations 0 à 3 (taille du texte) */
const TAILLES_MARIAGE = [9, 8.5, 8, 7.5]
const X0 = 40
const LARG = 1320
const LH = 1.18

/** Par génération (0 : la personne de départ) : haut et hauteur des cases, place sous la case pour la fratrie, largeur des cases */
interface Rangee { y: number; h: number; fratrie?: number; w: (slot: number) => number; vertical?: boolean }
const RANGEES: Rangee[] = [
  { y: 900, h: 60, w: () => 250 },
  { y: 806, h: 60, w: () => 230 },
  { y: 688, h: 64, fratrie: 38, w: (s) => Math.min(s * 0.8, 236) },
  { y: 568, h: 66, fratrie: 38, w: (s) => s * 0.9 },
  { y: 424, h: 88, fratrie: 40, w: (s) => s * 0.92 },
  { y: 290, h: 122, w: (s) => s * 0.9, vertical: true },
  { y: 160, h: 122, w: (s) => s * 0.9, vertical: true },
  { y: 22, h: 130, w: (s) => s * 0.9, vertical: true },
]

const COULEURS = { M: { trait: '#3d6fb4', fond: '#eef3fa' }, F: { trait: '#c4547a', fond: '#fbeff3' }, '?': { trait: '#8b928e', fond: '#f4f4f1' } }
const LIBELLES: Record<string, (sosa: number) => string> = {
  inconnu: (s) => (s % 2 ? 'mère inconnue' : 'père inconnu'),
  introuvable: () => 'introuvable',
  'a-chercher': () => 'à trouver',
}

const maj = (s: string) => s.toLocaleUpperCase('fr')

type Morceau = [string, string?]
interface Ligne { fs: number; parts: Morceau[]; cls?: string }
interface Mariage { annee?: string; commune?: string; sourcee: boolean }

function Morceaux({ parts }: { parts: Morceau[] }) {
  return <>{parts.map(([t, c], i) => <tspan key={i} class={c}>{t}</tspan>)}</>
}

function annees(r: Resume): Morceau[] {
  const n = r.naissance ?? '?'
  const cn = r.naissanceSourcee ? undefined : 'nd'
  if (r.vivant) return [[n, cn]]
  return [[n, cn], [' – '], [r.deces ?? '?', r.decesSourcee ? undefined : 'nd']]
}

/** Réduit toutes les lignes si leur hauteur dépasse la place */
function caser(lignes: Ligne[], hauteur: number): Ligne[] {
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  if (H <= hauteur) return lignes
  const k = hauteur / H
  return lignes.map((l) => ({ ...l, fs: Math.round(l.fs * k * 100) / 100 }))
}

/** Le texte d'un cartouche, selon la génération */
function lignesCartouche(g: number, r: Resume, implexe: boolean): Ligne[] {
  const T = [[17, 13, 11, 9.5, 10], [15, 12, 10.5, 9, 9.5], [13.5, 11, 10, 8.8, 9], [11.5, 9.6, 9, 8.2, 8.2], [9.6, 8.6, 8.2, 7.4, 0]][g]
  const pn = prenoms(r.prenom, g >= 4 ? 1 : 2)
  const nm: Morceau[] = [[maj(r.nom || '?'), 'nm'], ...(implexe ? [[' ◆', 'so'] as Morceau] : [])]
  const l: Ligne[] = []
  if (pn) l.push({ fs: T[0], parts: [[pn, 'pn']] })
  l.push({ fs: T[1], parts: nm })
  if (r.naissance || r.deces) l.push({ fs: T[2], parts: annees(r) })
  if (r.commune) l.push({ fs: T[3], parts: [[maj(abregerCommune(r.commune))]], cls: 'lieu' })
  if (T[4] && r.metier) l.push({ fs: T[4], parts: [[r.metier]], cls: 'mt' })
  return l
}

/** Le texte d'une étiquette verticale : de plus en plus court vers le haut */
function lignesEtiquette(g: number, r: Resume, implexe: boolean, freres: string): Ligne[] {
  const nom: Morceau[] = [[(prenoms(r.prenom, 1) ? prenoms(r.prenom, 1) + ' ' : ''), 'pn'], [maj(r.nom || '?'), 'nm'], ...(implexe ? [[' ◆', 'so'] as Morceau] : [])]
  const dates = r.naissance || r.deces ? annees(r) : []
  if (g === 7) return [{ fs: 6.8, parts: [...nom, ...(dates.length ? [['  '] as Morceau, ...dates.map(([t, c]) => [t, (c ?? '') + ' mut'] as Morceau)] : [])] }]
  if (g === 6) return [{ fs: 7.4, parts: nom }, ...(dates.length ? [{ fs: 6.6, parts: dates }] : [])]
  const l: Ligne[] = [{ fs: 8.4, parts: nom }]
  if (dates.length) l.push({ fs: 7.6, parts: dates })
  if (r.commune) l.push({ fs: 6.9, parts: [[maj(abregerCommune(r.commune))]], cls: 'lieu' })
  if (freres) l.push({ fs: 6.6, parts: [[freres]], cls: 'fr' })
  return l
}

/** « 5 frères et sœurs », « 1 sœur », « 3 frères » */
function compteFreres(f: Individu[]): string {
  if (!f.length) return ''
  const h = f.filter((x) => x.sexe === 'M').length
  const fe = f.filter((x) => x.sexe === 'F').length
  const n = f.length
  if (h === n) return n === 1 ? '1 frère' : `${n} frères`
  if (fe === n) return n === 1 ? '1 sœur' : `${n} sœurs`
  return `${n} frères et sœurs`
}

/**
 * Les frères et sœurs en lignes de `max` de large : avec l'année de naissance si tout tient,
 * sinon les prénoms seuls, sinon ce qui tient suivi de « + n ».
 */
function lignesFratrie(f: { prenom: string; annee?: string }[], max: number, nbLignes: number, fs: number): Morceau[][] {
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
  return [[[`${f.length} frères et sœurs`, 'mut']]]
}

/** Lignes centrées verticalement dans une boîte, à partir de `x` (ancre donnée) */
function Bloc({ lignes, x, yc, max, ancre = 'middle' }: { lignes: Ligne[]; x: number; yc: number; max: number; ancre?: string }) {
  const H = lignes.reduce((s, l) => s + l.fs * LH, 0)
  let cumul = 0
  return (
    <>
      {lignes.map((l, j) => {
        const y = yc - H / 2 + cumul + l.fs * LH * 0.78
        cumul += l.fs * LH
        return <text key={j} x={x.toFixed(1)} y={y.toFixed(1)} font-size={l.fs} data-fs={l.fs} data-max={Math.round(max)} text-anchor={ancre} class={l.cls}><Morceaux parts={l.parts} /></text>
      })}
    </>
  )
}

/** Visage dans un ovale, ou signature telle quelle ; rien si l'image ne vient pas */
function Portrait({ id, photo, x, y, w, h, rate }: { id: string; photo: Photo; x: number; y: number; w: number; h: number; rate: () => void }) {
  if (photo.signature) return <image href={photo.url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" onError={rate} />
  return (
    <g>
      <clipPath id={id}><ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} /></clipPath>
      <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="#e8e4dc" />
      <image href={photo.url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMin slice" clip-path={`url(#${id})`} onError={rate} />
      <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="none" stroke="#fff" stroke-width="1.2" />
    </g>
  )
}

export function Pyramide({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  const svg = useRef<SVGSVGElement>(null)
  const [ratees, setRatees] = useState<Set<string>>(new Set())
  // les fratries se coupent d'après les polices de la feuille : on les attend pour recouper
  const [, setPolices] = useState(false)
  useEffect(() => { chargerPolices().then(() => setPolices(true)) }, [])

  const donnees = useMemo(() => {
    const pl = places(d.arbre, d.racine, GENERATIONS)
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
      if (!p?.ind || p.generation >= TAILLES_MARIAGE.length) continue
      const parent = pl[2 * p.sosa]?.ind ?? pl[2 * p.sosa + 1]?.ind
      if (!parent) continue
      const fam = p.ind.famc.find((f) => parent.fams.includes(f))
      const m = fam ? d.suivis.get(parent.id)?.mariages.find((x) => x.famille === fam) : undefined
      // une union hors mariage n'a pas de date de mariage à montrer
      if (!m?.evenement || m.etat === 'sans-objet') continue
      const annee = anneeCourte(m.evenement)?.replace(/^\?$/, '') || undefined
      const commune = m.evenement.lieu ? abregerCommune(decouperLieu(m.evenement.lieu).nom) : undefined
      if (annee || commune) mariages.set(p.sosa, { annee, commune, sourcee: m.etat === 'source' })
    }
    const uniques = pl.filter((p) => p?.ind && !p.dejaVu && p.sosa > 1).length
    return { pl, resumes, freres, uniques, naissance, mariages }
  }, [d])

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
  const photoDe = (p: Place) => (options.photos && p.ind?.photo && !ratees.has(p.ind.photo.url) ? p.ind.photo : undefined)
  const rater = (url: string) => () => setRatees((r) => new Set(r).add(url))
  const fratrieDe = (s: number) => (options.fratrie ? freres.get(s) ?? [] : []).map((x) => ({ prenom: prenoms(x.prenom, 1) || '?', annee: anneeCourte(naissance(x))?.replace(/^\?$/, '') || undefined }))

  // Position de chaque place : centre, haut, largeur, hauteur
  const pos = (s: number) => {
    const g = Math.floor(Math.log2(s))
    const n = 2 ** g
    const slot = LARG / n
    const R = RANGEES[g]
    const w = R.w(slot)
    const cx = X0 + slot * (s - n + 0.5)
    return { g, cx, x: cx - w / 2, y: R.y, w, h: R.h, slot, R }
  }
  // Une place se dessine si la personne est connue, ou si elle manque sous un enfant connu
  const dessinee = (s: number) => !!pl[s]?.ind || (s > 1 && !!pl[s >> 1]?.ind && !!LIBELLES[pl[s]?.etat])

  const traits: JSX.Element[] = []
  const cases: JSX.Element[] = []
  const textes: JSX.Element[] = []
  for (let s = 1; s < 2 ** GENERATIONS; s++) {
    if (!dessinee(s)) continue
    const p = pl[s]
    const { g, cx, x, y, w, h, R } = pos(s)
    const r = resumes.get(s)
    const c = COULEURS[p.ind?.sexe ?? '?']

    // Le trait vers les parents : barre entre les deux cases (au milieu pour les cartouches, dessous pour les étiquettes)
    if (r && g < GENERATIONS - 1 && (dessinee(2 * s) || dessinee(2 * s + 1))) {
      const P = pos(2 * s)
      const M = pos(2 * s + 1)
      const yb = P.R.vertical ? P.y + P.h + 4 : P.y + P.h / 2
      const d = P.R.vertical
        ? `M${P.cx} ${P.y + P.h}V${yb}H${M.cx}V${M.y + M.h}M${cx} ${yb}V${y}`
        : `M${P.x + P.w} ${yb}H${M.x}M${cx} ${yb}V${y}`
      traits.push(<path key={'t' + s} d={d} fill="none" stroke="#9aa19d" stroke-width="1" />)

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
      const t = LIBELLES[p.etat](s)
      textes.push(R.vertical
        ? <g key={'x' + s} transform={`translate(${cx},${y + h / 2}) rotate(-90)`}><text x="0" y={(Math.min(w, 9) * 0.35).toFixed(1)} font-size={Math.min(7.5, w * 0.72)} text-anchor="middle" class="ns" data-max={h - 8}>{t}</text></g>
        : <text key={'x' + s} x={cx} y={y + h / 2 + 3} font-size={g >= 4 ? 7.5 : 9} text-anchor="middle" class="ns" data-max={w - 8}>{t}</text>)
      continue
    }

    const implexe = estImplexe(p)
    cases.push(<rect key={s} x={x.toFixed(2)} y={y} width={w.toFixed(2)} height={h} rx={R.vertical ? 1.5 : 4} fill={c.fond} stroke={c.trait} stroke-width={R.vertical ? 0.7 : 1.2} />)

    if (R.vertical) {
      const f = g === 5 && options.fratrie ? compteFreres(freres.get(s) ?? []) : ''
      const lignes = caser(lignesEtiquette(g, r, implexe, f), w - 3)
      textes.push(
        <g key={'x' + s} transform={`translate(${cx.toFixed(2)},${y + h / 2}) rotate(-90)`}>
          <Bloc lignes={lignes} x={0} yc={0} max={h - 8} />
        </g>,
      )
      continue
    }

    // Cartouche : photo à gauche (en haut pour la génération V), texte à côté
    const ph = photoDe(p)
    let lignes = lignesCartouche(g, r, implexe)
    if (g === 4) {
      const hp = ph ? (ph.signature ? 20 : 30) : 0
      if (ph) textes.push(<Portrait key={'p' + s} id={'ph' + s} photo={ph} x={ph.signature ? x + 4 : cx - 12} y={y + 4} w={ph.signature ? w - 8 : 24} h={hp} rate={rater(ph.url)} />)
      lignes = caser(lignes, h - hp - 8)
      textes.push(<g key={'x' + s}><Bloc lignes={lignes} x={cx} yc={y + hp + (h - hp) / 2 + (ph ? 2 : 0)} max={w - 6} /></g>)
    } else {
      const pw = ph ? (ph.signature ? Math.min(78, w * 0.34) : (h - 10) * 0.78) : 0
      if (ph) textes.push(<Portrait key={'p' + s} id={'ph' + s} photo={ph} x={x + 7} y={y + 5} w={pw} h={h - 10} rate={rater(ph.url)} />)
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
  const titre = p1 ? [prenoms(p1.prenom, 2), p1.nom].filter(Boolean).join(' ') : 'Ascendance'
  const adresse = options.qr ? d.adresse : ''
  const legende = [
    mariages.size > 0 && '∞ mariage des parents',
    options.fratrie && 'en italique sous les cases : frères et sœurs',
    options.italiques && 'date en italique : sans source',
    implexes && '◆ implexe',
  ].filter(Boolean).join(' · ')

  return (
    <svg ref={svg} class={'feuille pyramide' + (options.italiques ? ' italiques' : '')} viewBox="0 0 1400 990" role="img" aria-label={`Arbre d’ascendance de ${titre}`}>
      <rect width="1400" height="990" fill="#fff" />
      <g>{traits}</g>
      <g>{cases}</g>
      <g>{textes}</g>

      {/* Numéros des générations, dans la marge de gauche */}
      {RANGEES.slice(1).map((R, i) => (
        <text key={i} x="22" y={R.y + R.h / 2 + 4} font-size="10" class="disp mut" text-anchor="middle">{romain(i + 2)}</text>
      ))}

      {/* Titre en bas à gauche, à côté de la personne de départ */}
      <text x={X0} y="906" font-size="9.5" class="cap mut">ASCENDANCE</text>
      <text x={X0} y="932" font-size="24" class="disp" data-max="480">{titre}</text>
      <text x={X0} y="949" font-size="10.5" class="mut" data-max="480">{GENERATIONS} générations · {donnees.uniques} ancêtres identifiés</text>
      {(legende || options.date) && (
        <text x={X0} y="966" font-size="8.5" class="mut" data-max="520">
          {options.date ? `Établi le ${options.date}` : ''}{options.date && legende ? ' · ' : ''}{legende}
        </text>
      )}
      {adresse && (
        <g>
          <CodeQR url={adresse} x={1306} y={906} taille={54} />
          <text x="1296" y="948" font-size="8" class="cap mut" text-anchor="end">L’ARBRE EN LIGNE</text>
          <text x="1296" y="960" font-size="8.5" class="mut" text-anchor="end" data-max="200">{adresse.replace(/^https?:\/\/(www\.)?/, '')}</text>
        </g>
      )}
    </svg>
  )
}
