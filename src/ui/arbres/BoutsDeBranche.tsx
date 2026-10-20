// Les 128 bouts de branche, au verso de l'éventail des origines : chaque case du bord du recto (génération VIII)
// prolongée d'un petit éventail de sept générations (IX à XV), dans l'ordre Sosa et par quartier.
// Feuille A3 paysage (1 unité = 0,3 mm), mêmes teintes de régions qu'au recto.

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../../lib/donnees'
import { situerArbre, type Position } from '../../lib/geo'
import { romain } from '../../lib/communes'
import {
  anglesDepuis, GENERATIONS_RECTO, LIEU_INCONNU, LIEU_NON_SITUE, ordreRegions, places, regionsDesPlaces, resumer, secteur, type Place, type Resume,
} from '../../lib/eventail'
import { ajuster, AUTRES, couleursRegions, GRIS, INCONNU } from './feuille'
import type { OptionsFeuille } from './modeles'

/** Générations ajoutées au verso : IX à XV */
const PROFONDEUR = 7
/** Les cases du bord du recto (Sosa 128 à 255) */
const PREMIERE = 2 ** (GENERATIONS_RECTO - 1)
const OUVERTURE = 220
const COLONNES = 16
const LARGEUR = 1320 / COLONNES
const R = 35
const R0 = 6.5
const HAUT = 150
const QUARTIER = 199
const RANGEE = 89
const VIDE = '#f6f6f3'

const maj = (s: string) => s.toLocaleUpperCase('fr')
const rayon = (k: number) => R0 + ((R - R0) * k) / PROFONDEUR

const LIBELLES: Partial<Record<Place['etat'], (sosa: number) => string>> = {
  inconnu: (s) => (s % 2 ? 'mère inconnue' : 'père inconnu'),
  introuvable: () => 'introuvable',
  'a-chercher': () => 'à trouver',
}

/** Ce qu'on retient d'une branche : ses ancêtres identifiés (une personne vue deux fois compte une fois) et la génération atteinte */
function bilanBranche(pl: Place[], racine: number) {
  let connus = 0
  let atteinte = GENERATIONS_RECTO - 1
  let aTrouver = false
  for (let k = 1; k <= PROFONDEUR; k++) {
    for (let s = racine * 2 ** k; s < (racine + 1) * 2 ** k; s++) {
      const p = pl[s]
      if (p?.ind && !p.dejaVu) { connus++; atteinte = Math.max(atteinte, p.generation) }
      if (k === 1 && p?.etat === 'a-chercher') aTrouver = true
    }
  }
  return { connus, atteinte, aTrouver }
}

export function BoutsDeBranche({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  const svg = useRef<SVGSVGElement>(null)
  const [positions, setPositions] = useState<Map<string, Position>>()
  useEffect(() => {
    let vivant = true
    situerArbre(d.arbre).then((p) => vivant && setPositions(p)).catch(() => {})
    return () => { vivant = false }
  }, [d.arbre])

  const donnees = useMemo(() => {
    const pl = places(d.arbre, d.racine, GENERATIONS_RECTO + PROFONDEUR)
    const resumes = new Map<number, Resume>()
    for (const p of pl) if (p?.ind) resumes.set(p.sosa, resumer(p.ind, d.suivis.get(p.ind.id)!))
    const regions = regionsDesPlaces(resumes, positions)
    const ordre = ordreRegions(pl, regions)
    const couleurs = couleursRegions(ordre)
    const couleur = (reg: string) => couleurs.get(reg) ?? (reg === LIEU_INCONNU || reg === LIEU_NON_SITUE ? INCONNU : AUTRES)
    // La légende : les régions présentes au verso, dans l'ordre des teintes
    const auVerso = new Set<string>()
    let ancetres = 0
    for (let s = 2 ** GENERATIONS_RECTO; s < pl.length; s++) {
      if (!pl[s]?.ind || pl[s].dejaVu) continue
      auVerso.add(regions.get(s)!)
      ancetres++
    }
    const legende = ordre.filter((r) => auVerso.has(r) && couleurs.has(r)).map((r) => ({ nom: r, couleur: couleurs.get(r)! }))
    if (ordre.some((r) => auVerso.has(r) && !couleurs.has(r))) legende.push({ nom: 'Autres régions', couleur: AUTRES })
    if (auVerso.has(LIEU_INCONNU) || auVerso.has(LIEU_NON_SITUE)) legende.push({ nom: 'Lieu inconnu ou non situé', couleur: INCONNU })
    return { pl, resumes, regions, couleur, legende, ancetres }
  }, [d, positions])

  useLayoutEffect(() => {
    if (!svg.current) return
    ajuster(svg.current)
    let vivant = true
    document.fonts?.ready.then(() => vivant && svg.current && ajuster(svg.current))
    return () => { vivant = false }
  })

  const { pl, resumes, regions, couleur, legende, ancetres } = donnees
  const fond = (s: number) => couleur(regions.get(s)!)

  /** Un petit éventail : les cases connues teintées, les parents à trouver ou inconnus hachurés comme au recto */
  function eventail(racine: number, cx: number, cy: number): JSX.Element[] {
    const O = { cx, cy }
    const els: JSX.Element[] = [<path key="f" d={secteur(O, R0, R, -OUVERTURE / 2, OUVERTURE / 2)} fill={VIDE} />]
    const visiter = (s: number) => {
      const p = pl[s]
      if (!p) return
      const { a1, a2, profondeur: k } = anglesDepuis(racine, s, OUVERTURE)
      // Au-dessus d'un parent inconnu, rien à chercher : hachuré jusqu'au bord, d'une pièce
      if (p.etat === 'inconnu' || p.sousInconnu) {
        els.push(<path key={s} d={secteur(O, rayon(k - 1), R, a1, a2)} fill="url(#hachures-verso)" />)
        return
      }
      if (p.ind) els.push(<path key={s} d={secteur(O, rayon(k - 1), rayon(k), a1, a2)} fill={fond(s)} stroke="#fff" stroke-width={k <= 4 ? 0.3 : 0} />)
      else if (p.etat !== 'vide') els.push(<path key={s} d={secteur(O, rayon(k - 1), rayon(k), a1, a2)} fill="url(#hachures-verso)" />)
      if (k < PROFONDEUR) { visiter(2 * s); visiter(2 * s + 1) }
    }
    const p = pl[racine]
    if (p?.etat === 'inconnu' || p?.sousInconnu) els.push(<path key="h" d={secteur(O, R0, R, -OUVERTURE / 2, OUVERTURE / 2)} fill="url(#hachures-verso)" />)
    else { visiter(2 * racine); visiter(2 * racine + 1) }
    els.push(
      <circle key="c" cx={cx} cy={cy} r={R0} fill={p?.ind ? fond(racine) : '#fff'} stroke={GRIS} stroke-width="0.6" />,
      <path key="b" d={secteur(O, R, R + 0.01, -OUVERTURE / 2, OUVERTURE / 2)} fill="none" stroke="#b9bdb9" stroke-width="0.4" />,
    )
    return els
  }

  const quartiers = [4, 5, 6, 7].map((sq, q) => {
    const y0 = HAUT + q * QUARTIER
    const debut = PREMIERE + q * 32
    let n = 0
    for (let b = debut; b < debut + 32; b++) n += bilanBranche(pl, b).connus
    const fans: JSX.Element[] = []
    for (let i = 0; i < 32; i++) {
      const b = debut + i
      const haut = y0 + 20 + Math.floor(i / COLONNES) * RANGEE
      const cx = 40 + (i % COLONNES) * LARGEUR + LARGEUR / 2
      const p = pl[b]
      const r = resumes.get(b)
      const { connus, atteinte, aTrouver } = bilanBranche(pl, b)
      const etat = r ? (connus ? `${connus} ancêtre${connus > 1 ? 's' : ''} · jusqu’à ${romain(atteinte + 1)}` : aTrouver ? 'parents à trouver' : 'lignée close')
        : undefined
      fans.push(
        <g key={b}>
          {eventail(b, cx, haut + 43)}
          <text x={cx.toFixed(1)} y={haut + 69} font-size="7.6" text-anchor="middle" data-max={LARGEUR - 6}>
            <tspan class="mut">{b}</tspan>{' '}
            {r ? <tspan class="nm">{maj(r.nom || '?')}</tspan> : <tspan class="ns">{(p && LIBELLES[p.etat]?.(b)) ?? '—'}</tspan>}
            {p?.dejaVu && <tspan class="so"> ◆</tspan>}
          </text>
          {etat && <text x={cx.toFixed(1)} y={haut + 79} font-size="6.6" text-anchor="middle" class="mut" data-max={LARGEUR - 6}>{etat}</text>}
        </g>,
      )
    }
    return (
      <g key={sq}>
        <text x="40" y={y0 + 10} font-size="10" class="cap mut">QUARTIER <tspan class="nm" fill="#1f2523">{maj(resumes.get(sq)?.nom || '?')}</tspan></text>
        <text x="1360" y={y0 + 10} font-size="9" class="mut" text-anchor="end">Sosa {debut} à {debut + 31} · {n} ancêtre{n > 1 ? 's' : ''} identifié{n > 1 ? 's' : ''} au-delà</text>
        <line x1="40" x2="1360" y1={y0 + 15} y2={y0 + 15} stroke={GRIS} stroke-width="0.7" />
        {fans}
      </g>
    )
  })

  const entrees = [...legende.map((l) => ({ ...l, motif: false })), { nom: 'Parent à trouver ou inconnu', couleur: 'url(#hachures-verso)', motif: true }]
  const lignesLegende = Math.ceil(entrees.length / Math.ceil(entrees.length / 5))
  const colonnesLegende = Math.ceil(entrees.length / lignesLegende)
  const implexes = pl.some((p, s) => s >= PREMIERE && s < 2 * PREMIERE && p?.dejaVu)
  const p1 = resumes.get(1)

  return (
    <svg ref={svg} class="feuille" viewBox="0 0 1400 990" role="img" aria-label="Les 128 bouts de branche : générations IX à XV">
      <defs>
        <pattern id="hachures-verso" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="3" stroke="#d8d8d2" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="1400" height="990" fill="#fff" />

      {/* Titre et légende */}
      <text x="40" y="64" font-size="11" class="cap mut">ASCENDANCE{p1 ? ` DE ${maj([p1.prenom.split(' ')[0], p1.nom].filter(Boolean).join(' '))}` : ''} · GÉNÉRATIONS IX À XV</text>
      <text x="40" y="100" font-size="30" class="disp">Les 128 bouts de branche</text>
      <text x="40" y="124" font-size="12" class="mut" data-max="760">
        Chaque case du bord de l’éventail, prolongée de sept générations · {ancetres} ancêtres identifiés au-delà de la huitième génération
      </text>
      {entrees.map((l, i) => {
        const x = 1360 - (colonnesLegende - Math.floor(i / lignesLegende)) * 128
        const y = 54 + (i % lignesLegende) * 14
        return (
          <g key={l.nom}>
            <rect x={x} y={y - 8} width="11" height="9" fill={l.couleur} stroke={l.motif || l.couleur === INCONNU ? '#c9ccc8' : undefined} stroke-width="0.5" />
            <text x={x + 16} y={y} font-size="8.6" data-max="108">{l.nom}</text>
          </g>
        )
      })}

      {quartiers}

      {/* Pied de page */}
      {implexes && <text x="40" y={options.date ? 950 : 966} font-size="8.5" class="mut"><tspan class="so">◆</tspan> implexe : la même personne plus près au recto</text>}
      {options.date && <text x="40" y="966" font-size="8.5" class="mut">Établi le {options.date}</text>}
      <text x="1360" y="966" font-size="8.5" class="mut" text-anchor="end">Au recto, l’éventail des générations I à VIII</text>
    </svg>
  )
}
