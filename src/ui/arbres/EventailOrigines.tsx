// Éventail des origines : huit générations sur 220°, chaque case teintée selon la province de naissance.
// Feuille A3 paysage (1 unité = 0,3 mm).

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import type { Donnees } from '../../lib/donnees'
import { situerArbre, type Position } from '../../lib/geo'
import { romain } from '../../lib/communes'
import {
  angles, arc, LIEU_INCONNU, LIEU_NON_SITUE, places, point, premierPrenom, regionDuLieu, resumer, secteur,
  type Centre, type Place, type Resume,
} from '../../lib/eventail'
import type { OptionsFeuille } from './modeles'

const GENERATIONS = 8
const OUVERTURE = 220
const O: Centre = { cx: 700, cy: 690 }
const RAYONS = [0, 96, 176, 254, 330, 408, 486, 566, 636]
const GRIS = '#3c4441'

// Teintes claires, distinctes en case de quelques millimètres, sous un texte noir
const TEINTES = ['#d9cbe3', '#cbe0c4', '#ecdba8', '#c4dfe0', '#e7c3b3', '#c3d0e6', '#d6dcae', '#efc2c8', '#e3d3bf', '#d3bfa6']
const AUTRES = '#dcdcd5'
const INCONNU = '#efefea'

type Morceau = [string, string?]
interface Ligne { fs: number; parts: Morceau[]; cls?: string }

const maj = (s: string) => s.toLocaleUpperCase('fr')
const LH = 1.2

function Morceaux({ parts }: { parts: Morceau[] }) {
  return <>{parts.map(([t, c], i) => <tspan key={i} class={c}>{t}</tspan>)}</>
}

/** Lignes courbes, centrées dans la case ; retournées dans le bas de l'éventail pour rester lisibles */
function TexteCourbe({ id, r1, r2, a1, a2, lignes }: { id: string; r1: number; r2: number; a1: number; a2: number; lignes: Ligne[] }) {
  const retourne = Math.abs((a1 + a2) / 2) > 95
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
            <text font-size={l.fs} text-anchor="middle" class={l.cls}>
              <textPath href={'#' + pid} startOffset="50%" data-max={Math.round(r * ((a2 - a1) * Math.PI / 180) - 8)}><Morceaux parts={l.parts} /></textPath>
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
          <text key={j} x={dehors ? rm : -rm} y={y.toFixed(2)} font-size={l.fs} text-anchor="middle" class={l.cls} data-max={r2 - r1 - 9}>
            <Morceaux parts={l.parts} />
          </text>
        )
      })}
    </g>
  )
}

function annees(r: Resume): Morceau[] {
  const n = r.naissance ?? '?'
  const cn = r.naissanceSourcee ? undefined : 'ns'
  if (r.vivant) return [['° ' + n, cn]]
  return [[n, cn], [' – '], [r.deces ?? '?', r.decesSourcee ? undefined : 'ns']]
}

function nom(r: Resume, fs: number, opts: { sosa?: number; implexe?: boolean; court?: boolean } = {}): Ligne {
  return {
    fs,
    parts: [
      ...(opts.sosa ? [[opts.sosa + ' ', 'so'] as Morceau] : []),
      [(opts.court ? premierPrenom(r.prenom) : r.prenom) + ' ', 'pn'],
      [maj(r.nom || '?'), 'nm'],
      ...(opts.implexe ? [[' ◆', 'so'] as Morceau] : []),
    ],
  }
}

/** Le texte d'une case, de plus en plus léger vers le bord */
function lignesCase(p: Place, r: Resume, implexe: boolean): Ligne[] {
  const g = p.generation
  const lieu = r.commune ? maj(r.commune) : ''
  const metier: Ligne | null = r.metier ? { fs: 0, parts: [[r.metier, 'mt']] } : null
  const m = (fs: number) => (metier ? { ...metier, fs } : null)
  const l = (fs: number, parts: Morceau[], cls?: string): Ligne | null => (parts.some(([t]) => t) ? { fs, parts, cls } : null)
  const sosa = (fs: number): Ligne => ({ fs, parts: [['Sosa ' + p.sosa, 'so']] })
  const repete = p.dejaVu ? [{ fs: 0, parts: [['= Sosa ' + p.dejaVu, 'so']] as Morceau[] }] : null
  let lignes: (Ligne | null)[]
  if (g === 1) lignes = [nom(r, 17, { implexe }), l(11, annees(r)), l(10, [[lieu]], 'lieu'), m(10.5), sosa(8.5)]
  else if (g === 2) lignes = [nom(r, 13.5, { implexe }), l(10, annees(r)), l(9.5, [[lieu]], 'lieu'), m(9.5), sosa(8)]
  else if (g === 3) lignes = [nom(r, 11.5, { implexe }), l(9.5, annees(r)), l(9, [[lieu]], 'lieu'), m(9), sosa(7.5)]
  else if (g === 4) lignes = [nom(r, 10, { sosa: p.sosa, implexe }), l(8.8, annees(r)), l(8.3, [[lieu]], 'lieu'), m(8.3)]
  else if (g === 5) lignes = [nom(r, 9, { sosa: p.sosa, implexe }), l(8.3, annees(r)), l(7.8, [[lieu]], 'lieu'), m(7.8)]
  else if (g === 6) lignes = [nom(r, 8, { sosa: p.sosa, implexe }), repete ? { ...repete[0], fs: 7.2 } : l(7.2, [...annees(r), ...(lieu ? [[' · ' + lieu, 'lieu'] as Morceau] : [])])]
  else lignes = [nom(r, 7.4, { court: true, implexe })]
  return lignes.filter((x): x is Ligne => !!x)
}

const LIBELLES: Record<string, (sosa: number) => string> = {
  inconnu: (s) => (s % 2 ? 'mère inconnue' : 'père inconnu'),
  introuvable: () => 'introuvable',
  'a-chercher': () => 'à trouver',
}

/** Les textes trop longs pour leur case sont resserrés, jamais coupés */
function ajuster(svg: SVGSVGElement) {
  for (const t of svg.querySelectorAll<SVGTextContentElement>('[data-max]')) {
    const hote = (t.tagName === 'textPath' ? t.parentNode : t) as SVGTextElement
    t.removeAttribute('textLength')
    t.removeAttribute('lengthAdjust')
    if (hote.dataset.fs) hote.setAttribute('font-size', hote.dataset.fs)
    const max = Number(t.dataset.max)
    const long = t.getComputedTextLength()
    if (long <= max) continue
    hote.dataset.fs = hote.getAttribute('font-size') ?? ''
    if (long > max * 1.25) hote.setAttribute('font-size', ((Number(hote.dataset.fs) * max * 1.2) / long).toFixed(2))
    t.setAttribute('textLength', String(max))
    t.setAttribute('lengthAdjust', 'spacingAndGlyphs')
  }
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

export function EventailOrigines({ d, options }: { d: Donnees; options: OptionsFeuille }) {
  const svg = useRef<SVGSVGElement>(null)
  const [positions, setPositions] = useState<Map<string, Position>>()
  useEffect(() => {
    let vivant = true
    situerArbre(d.arbre).then((p) => vivant && setPositions(p)).catch(() => {})
    return () => { vivant = false }
  }, [d.arbre])

  const donnees = useMemo(() => {
    const pl = places(d.arbre, d.racine, GENERATIONS)
    const resumes = new Map<number, Resume>()
    for (const p of pl) if (p?.ind) resumes.set(p.sosa, resumer(p.ind, d.suivis.get(p.ind.id)!))
    // Pays le plus fréquent parmi les naissances : les autres pays seront précisés
    const freqPays = new Map<string, number>()
    for (const r of resumes.values()) {
      const pays = r.lieu ? positions?.get(r.lieu)?.pays : undefined
      if (pays) freqPays.set(pays, (freqPays.get(pays) ?? 0) + 1)
    }
    const paysPrincipal = [...freqPays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const regions = new Map<number, string>()
    for (const [s, r] of resumes) regions.set(s, regionDuLieu(r.lieu, r.lieu ? positions?.get(r.lieu) : undefined, paysPrincipal))
    // Couleurs par ordre de fréquence (une personne vue deux fois compte une fois)
    const freq = new Map<string, number>()
    for (const p of pl) if (p?.ind && !p.dejaVu && p.sosa > 1) { const reg = regions.get(p.sosa)!; freq.set(reg, (freq.get(reg) ?? 0) + 1) }
    const ordre = [...freq.entries()].filter(([r]) => r !== LIEU_INCONNU && r !== LIEU_NON_SITUE).sort((a, b) => b[1] - a[1]).map(([r]) => r)
    const couleurs = new Map<string, string>()
    ordre.slice(0, TEINTES.length).forEach((r, i) => couleurs.set(r, TEINTES[i]))
    const couleur = (reg: string) => couleurs.get(reg) ?? (reg === LIEU_INCONNU || reg === LIEU_NON_SITUE ? INCONNU : AUTRES)
    const legende: { nom: string; couleur: string }[] = ordre.slice(0, TEINTES.length).map((r) => ({ nom: r, couleur: couleurs.get(r)! }))
    if (ordre.length > TEINTES.length) legende.push({ nom: 'Autres régions', couleur: AUTRES })
    if (freq.has(LIEU_INCONNU) || freq.has(LIEU_NON_SITUE)) legende.push({ nom: 'Lieu inconnu ou non situé', couleur: INCONNU })

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
    return { pl, resumes, regions, couleur, legende, ancetres: uniques.length, communes: communes.size, nbRegions, parGeneration }
  }, [d, positions])

  useLayoutEffect(() => {
    if (!svg.current) return
    ajuster(svg.current)
    let vivant = true
    document.fonts?.ready.then(() => vivant && svg.current && ajuster(svg.current))
    return () => { vivant = false }
  })

  const { pl, resumes, regions, couleur } = donnees
  const cases: JSX.Element[] = []
  const textes: JSX.Element[] = []
  for (let s = 2; s < 2 ** GENERATIONS; s++) {
    const p = pl[s]
    const { a1, a2, generation: g } = angles(s, OUVERTURE)
    const r1 = RAYONS[g]
    const r2 = RAYONS[g + 1]
    const r = resumes.get(s)
    const fond = r ? couleur(regions.get(s)!) : p.etat === 'vide' ? '#f6f6f3' : 'url(#hachures)'
    cases.push(<path key={s} d={secteur(O, r1, r2, a1, a2)} fill={fond} stroke="#fff" stroke-width={g >= 7 ? 0.8 : 1.4} />)
    let lignes: Ligne[] = []
    if (r) lignes = lignesCase(p, r, !!p.dejaVu || pl.some((q) => q?.dejaVu === s))
    else if (LIBELLES[p.etat]) lignes = [{ fs: g >= 7 ? 7.2 : 8.5, parts: [[LIBELLES[p.etat](s), 'ns']] }]
    if (!lignes.length) continue
    const rm = (r1 + r2) / 2
    const courbe = r && rm * ((a2 - a1) * Math.PI / 180) > (r2 - r1) * 1.05
    textes.push(courbe
      ? <TexteCourbe key={s} id={`c${s}`} r1={r1} r2={r2} a1={a1} a2={a2} lignes={lignes} />
      : <TexteRayon key={s} r1={r1} r2={r2} a1={a1} a2={a2} lignes={lignes} />)
  }

  const R = RAYONS[GENERATIONS]
  const p1 = resumes.get(1)
  const titre = p1 ? [p1.prenom, p1.nom].filter(Boolean).join(' ') : 'Ascendance'
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
            <tspan class="mut">QUARTIER </tspan><tspan class="nm">{maj(nomQ || '?')}</tspan><tspan class="so">{'  Sosa ' + s}</tspan>
          </textPath>
        </text>
      </g>
    )
  })
  const [px, py] = point(O, 470, -110)
  const [mx, my] = point(O, 470, 110)
  const x0 = 452
  const W = 496
  const y0 = 822
  const yLegende = y0 + (GENERATIONS - 1) * 14 + 20
  const adresse = options.qr ? d.adresse : ''

  return (
    <svg ref={svg} class="feuille" viewBox="0 0 1400 990" role="img" aria-label={`Éventail des origines de ${titre}`}>
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
      {p1 && (
        <g text-anchor="middle">
          <text x={O.cx} y={O.cy - 22} font-size="26" class="pn" data-max="170">{p1.prenom}</text>
          <text x={O.cx} y={O.cy - 2} font-size="13" class="nm" data-max="170">{maj(p1.nom)}</text>
          <text x={O.cx} y={O.cy + 19} font-size="11"><Morceaux parts={annees(p1)} /></text>
          {p1.commune && <text x={O.cx} y={O.cy + 34} font-size="9.5" class="lieu" data-max="150">{maj(p1.commune)}</text>}
        </g>
      )}

      {/* Côtés, le long des bras */}
      <text font-size="11" class="cap mut" text-anchor="middle" transform={`translate(${px},${py}) rotate(-20) translate(0,22)`}>CÔTÉ PATERNEL</text>
      <text font-size="11" class="cap mut" text-anchor="middle" transform={`translate(${mx},${my}) rotate(20) translate(0,22)`}>CÔTÉ MATERNEL</text>

      {/* Titre et chiffres */}
      <text x="40" y="64" font-size="11" class="cap mut">ASCENDANCE</text>
      <text x="40" y="98" font-size="32" class="disp" data-max="420">{titre}</text>
      <text x="40" y="120" font-size="12" class="mut">et ses ancêtres, selon leur lieu de naissance</text>
      <g text-anchor="end">
        {([[donnees.ancetres, 'ancêtres identifiés'], [donnees.communes, 'communes de naissance'], [donnees.nbRegions, 'provinces et régions']] as const).map(([v, l], i) => (
          <g key={l}>
            <text x="1360" y={82 + i * 42} font-size="26" class="disp">{v}</text>
            <text x="1360" y={96 + i * 42} font-size="9.5" class="mut">{l}</text>
          </g>
        ))}
      </g>

      {/* Origine par génération */}
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

      {/* Pied de page */}
      <text x="40" y={options.date ? 950 : 966} font-size="8.5" class="mut">
        <tspan class="ns">italique</tspan> : date sans source · ◆ implexe · hachures : ancêtre à trouver
      </text>
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
