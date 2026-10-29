// La table des ancêtres, au verso de l'arbre en pyramide : chaque case du recto par son numéro Sosa,
// avec ce que les étiquettes verticales n'ont pas pu dire (dates, communes de naissance et de décès, métier).
// Génération par génération, en colonnes ; le corps diminue si l'arbre a trop de générations pour tenir.
// Feuille A3 paysage (1 unité = 0,3 mm), comme le recto.

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../../lib/donnees'
import { decouper } from '../../lib/geo'
import { romain } from '../../lib/communes'
import { abregerCommune, places, prenoms, resumer, type Resume } from '../../lib/eventail'
import { ajuster } from './feuille'
import { chargerPolices, largeur } from './mesure'
import type { OptionsFeuille } from './modeles'
import { bornerGenerationsPyramide, trouverThemePyramide, type Morceau, Morceaux } from './Pyramide'
import { t } from '../../lib/i18n'

const X0 = 40
const LARG = 1320
const HAUT = 150
const BAS = 940
const GOUTTIERE = 18
const LH = 1.18
/** Corps de la ligne du nom, de la ligne des détails et du titre de génération, avant réduction */
const FS_NOM = 8.6
const FS_DETAIL = 7.2
const FS_TITRE = 9
const ECART = 2.4
const COLONNES_MIN = 4
const COLONNES_MAX = 8

export interface Pave { h: number; titre: boolean }

/**
 * Répartit les pavés en colonnes de hauteur `H`, dans l'ordre, sans laisser un titre seul en bas de colonne.
 * Renvoie la colonne et la position de chaque pavé, ou rien si `C` colonnes ne suffisent pas.
 */
export function disposer(paves: Pave[], H: number, C: number): { col: number; y: number }[] | undefined {
  const res: { col: number; y: number }[] = []
  let col = 0
  let y = 0
  paves.forEach((b, i) => {
    const avecSuivant = b.titre && paves[i + 1] ? b.h + paves[i + 1].h : b.h
    if (y > 0 && y + avecSuivant > H) { col++; y = 0 }
    res.push({ col, y })
    y += b.h
  })
  return col < C ? res : undefined
}

/** Le plus petit nombre de colonnes qui contient tout ; au-delà de COLONNES_MAX, un facteur de réduction du corps */
export function choisirColonnes(paves: (k: number) => Pave[], H: number): { C: number; k: number; positions: { col: number; y: number }[] } {
  for (let C = COLONNES_MIN; C <= COLONNES_MAX; C++) {
    const p = disposer(paves(1), H, C)
    if (p) return { C, k: 1, positions: p }
  }
  for (let k = 0.96; k > 0.3; k -= 0.04) {
    const p = disposer(paves(k), H, COLONNES_MAX)
    if (p) return { C: COLONNES_MAX, k, positions: p }
  }
  return { C: COLONNES_MAX, k: 0.3, positions: disposer(paves(0.3), Infinity, COLONNES_MAX)! }
}

const maj = (s: string) => s.toLocaleUpperCase('fr')

/** « ° 1765 Malines · † 1842 Malines · cultivateur », raccourci pour tenir dans `max` : le métier part d'abord, puis les communes */
function morceauxDetail(r: Resume, communeDeces: string | undefined, max: number, fs: number): Morceau[] {
  const naissance: Morceau[] = r.naissance || r.commune ? [['° ', 'mut'], ...(r.naissance ? [[r.naissance, r.naissanceSourcee ? undefined : 'nd'] as Morceau] : [])] : []
  const deces: Morceau[] = r.deces || communeDeces ? [['† ', 'mut'], ...(r.deces ? [[r.deces, r.decesSourcee ? undefined : 'nd'] as Morceau] : [])] : []
  const lieu = (c?: string, avecAnnee?: boolean): Morceau[] => (c ? [[(avecAnnee ? ' ' : '') + abregerCommune(c)]] : [])
  const essais = [
    [lieu(r.commune, !!r.naissance), lieu(communeDeces, !!r.deces), r.metier],
    [lieu(r.commune, !!r.naissance), lieu(communeDeces, !!r.deces), undefined],
    [lieu(r.commune, !!r.naissance), [], undefined],
    [[], [], undefined],
  ] as const
  let parts: Morceau[] = []
  for (const [ln, ld, metier] of essais) {
    const n = naissance.length ? [...naissance, ...ln] : []
    const d = deces.length ? [...deces, ...ld] : []
    parts = [...n, ...(n.length && d.length ? [[' · ', 'mut'] as Morceau] : []), ...d]
    if (metier) parts.push(...(parts.length ? [[' · ', 'mut'] as Morceau] : []), [metier, 'mt'])
    if (largeur(parts.map(([t]) => t).join(''), fs) <= max) break
  }
  return parts
}

export function TableAncetres({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  const svg = useRef<SVGSVGElement>(null)
  // les détails se raccourcissent d'après les polices de la feuille : on les attend pour recouper
  const [, setPolices] = useState(false)
  useEffect(() => { chargerPolices().then(() => setPolices(true)) }, [])

  const generations = bornerGenerationsPyramide(options.generations)

  const donnees = useMemo(() => {
    const pl = places(d.arbre, d.racine, generations)
    const resumes = new Map<number, Resume>()
    const deces = new Map<number, string | undefined>()
    for (const p of pl) {
      if (!p?.ind) continue
      const suivi = d.suivis.get(p.ind.id)!
      resumes.set(p.sosa, resumer(p.ind, suivi))
      const lieu = suivi.deces.evenement?.lieu
      deces.set(p.sosa, lieu ? decouper(lieu).commune || undefined : undefined)
    }
    // Par génération : son titre, puis une entrée par case connue du recto
    const lignes: ({ titre: true; g: number; connus: number } | { titre: false; s: number })[] = []
    for (let g = 0; g < generations; g++) {
      const sosas: number[] = []
      for (let s = 2 ** g; s < 2 ** (g + 1); s++) if (pl[s]?.ind) sosas.push(s)
      lignes.push({ titre: true, g, connus: sosas.length })
      for (const s of sosas) lignes.push({ titre: false, s })
    }
    const uniques = pl.filter((p) => p?.ind && !p.dejaVu && p.sosa > 1).length
    return { pl, resumes, deces, lignes, uniques }
  }, [d, generations])

  useLayoutEffect(() => {
    if (!svg.current) return
    ajuster(svg.current)
    let vivant = true
    document.fonts?.ready.then(() => vivant && svg.current && ajuster(svg.current))
    return () => { vivant = false }
  })

  const { pl, resumes, deces, lignes, uniques } = donnees
  const hauteurEntree = (k: number) => (FS_NOM + FS_DETAIL) * k * LH + ECART * k
  const hauteurTitre = (k: number) => FS_TITRE * k * LH + 10 * k
  const { C, k, positions: pos } = choisirColonnes((k) => lignes.map((l) => ({ h: l.titre ? hauteurTitre(k) : hauteurEntree(k), titre: l.titre })), BAS - HAUT)
  const W = (LARG - (C - 1) * GOUTTIERE) / C
  const fsNom = FS_NOM * k
  const fsDetail = FS_DETAIL * k
  const fsTitre = FS_TITRE * k
  // la colonne des numéros : assez large pour le plus grand Sosa
  const larg = largeur(String(2 ** generations - 1), fsNom) + 3 * k
  const theme = trouverThemePyramide(options.theme)
  const implexes = pl.some((p) => p?.dejaVu)

  const corps: JSX.Element[] = lignes.map((l, i) => {
    const { col, y: dy } = pos[i]
    const x = X0 + col * (W + GOUTTIERE)
    const y = HAUT + dy
    if (l.titre) {
      const yb = y + fsTitre * LH * 0.78 + 4 * k
      return (
        <g key={'g' + l.g}>
          <text x={x} y={yb.toFixed(1)} font-size={fsTitre.toFixed(2)} class="cap mut">{maj(t('Génération'))} <tspan class="nm" fill="#1f2523">{romain(l.g + 1)}</tspan></text>
          <text x={(x + W).toFixed(1)} y={yb.toFixed(1)} font-size={(fsTitre * 0.9).toFixed(2)} class="mut" text-anchor="end">{l.connus} / {2 ** l.g}</text>
          <line x1={x} x2={(x + W).toFixed(1)} y1={(yb + 3 * k).toFixed(1)} y2={(yb + 3 * k).toFixed(1)} stroke="#3c4441" stroke-width="0.7" />
        </g>
      )
    }
    const s = l.s
    const p = pl[s]
    const r = resumes.get(s)!
    const c = theme.case(s, p.ind?.sexe)
    const y1 = y + fsNom * LH * 0.78
    const y2 = y + fsNom * LH + fsDetail * LH * 0.78
    const xt = x + larg + 9 * k
    const maxTexte = x + W - xt
    const pn = prenoms(r.prenom, 2)
    const detail: Morceau[] = p.dejaVu ? [[t('◆ voir le n° {n}', { n: p.dejaVu }), 'so']] : morceauxDetail(r, deces.get(s), maxTexte, fsDetail)
    return (
      <g key={s}>
        <text x={(x + larg).toFixed(1)} y={y1.toFixed(1)} font-size={fsNom.toFixed(2)} class="mut an" text-anchor="end">{s}</text>
        <rect x={(x + larg + 3 * k).toFixed(1)} y={(y1 - fsNom * 0.62).toFixed(1)} width={(3 * k).toFixed(1)} height={(fsNom * 0.66).toFixed(1)} fill={c.trait} />
        <text x={xt.toFixed(1)} y={y1.toFixed(1)} font-size={fsNom.toFixed(2)} data-fs={fsNom.toFixed(2)} data-max={Math.floor(maxTexte)}>
          {pn && <tspan class="pn">{pn} </tspan>}<tspan class="nm">{maj(r.nom || '?')}</tspan>{p.dejaVu && <tspan class="so"> ◆</tspan>}
        </text>
        {detail.length > 0 && (
          <text x={xt.toFixed(1)} y={y2.toFixed(1)} font-size={fsDetail.toFixed(2)} data-fs={fsDetail.toFixed(2)} data-max={Math.floor(maxTexte)}><Morceaux parts={detail} /></text>
        )}
      </g>
    )
  })

  const p1 = resumes.get(1)
  const legende = [t('° naissance'), t('† décès'), t('v. vers, av. avant, ap. après'), options.italiques && t('date en italique : sans source'), implexes && t('◆ implexe : la même personne sous un plus petit numéro')].filter(Boolean).join(' · ')

  return (
    <svg ref={svg} class={'feuille' + (options.italiques ? ' italiques' : '')} viewBox="0 0 1400 990" role="img" aria-label={t('Table des ancêtres par numéro Sosa')}>
      <rect width="1400" height="990" fill="#fff" />

      {/* Titre */}
      <text x={X0} y="64" font-size="11" class="cap mut">{maj(p1 ? t('Ascendance de {nom}', { nom: [prenoms(p1.prenom, 1), p1.nom].filter(Boolean).join(' ') }) : t('Ascendance'))} · {maj(t('Générations I à {g}', { g: romain(generations) }))}</text>
      <text x={X0} y="100" font-size="30" class="disp">{t('Table des ancêtres')}</text>
      <text x={X0} y="124" font-size="12" class="mut" data-max="900">
        {t('Chaque case du recto par son numéro Sosa · {n} ancêtres identifiés · le père d’un numéro n porte le numéro 2n, la mère 2n + 1', { n: uniques })}
      </text>

      {corps}

      {/* Pied de page */}
      <text x={X0} y={options.date ? 950 : 966} font-size="8.5" class="mut" data-max="900">{legende}</text>
      {options.date && <text x={X0} y="966" font-size="8.5" class="mut">{t('Établi le {date}', { date: options.date })}</text>}
      <text x="1360" y="966" font-size="8.5" class="mut" text-anchor="end">{t('Au recto, l’arbre en pyramide des générations I à {g}', { g: romain(generations) })}</text>
    </svg>
  )
}
