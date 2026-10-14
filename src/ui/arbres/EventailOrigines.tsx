// Éventail des origines : huit générations sur 220°, chaque case teintée selon la province de naissance.
// Feuille A3 paysage (1 unité = 0,3 mm).

import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import type { Donnees } from '../../lib/donnees'
import { situerArbre, type Position } from '../../lib/geo'
import { romain } from '../../lib/communes'
import {
  abregerCommune, angles, arc, LIEU_INCONNU, LIEU_NON_SITUE, places, point, prenoms, regionDuLieu, resumer, secteur,
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
  const cn = r.naissanceSourcee ? undefined : 'ns'
  if (r.vivant) return [['° ' + n, cn]]
  return [[n, cn], [' – '], [r.deces ?? '?', r.decesSourcee ? undefined : 'ns']]
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

/**
 * Les textes trop longs pour leur case sont rapetissés (textLength n'est pas suivi partout sur un textPath) ;
 * ceux marqués data-texte (métiers) sont plutôt abrégés par « … » quand il faudrait trop les rapetisser.
 */
function ajuster(svg: SVGSVGElement) {
  for (const t of svg.querySelectorAll<SVGTextElement>('text[data-max]')) {
    t.dataset.fs ??= t.getAttribute('font-size') ?? ''
    const fs = Number(t.dataset.fs)
    t.setAttribute('font-size', String(fs))
    const noeud = t.dataset.texte !== undefined ? t.querySelector('tspan')?.firstChild : null
    if (noeud instanceof Text) noeud.data = t.dataset.texte!
    const max = Number(t.dataset.max)
    const long = t.getComputedTextLength()
    if (long <= max) continue
    const k = max / long
    if (noeud instanceof Text && k < 0.8) {
      t.setAttribute('font-size', (fs * 0.85).toFixed(2))
      let texte = t.dataset.texte!
      while (texte.length > 1 && t.getComputedTextLength() > max) {
        texte = texte.slice(0, -1).trimEnd()
        noeud.data = texte + '…'
      }
      continue
    }
    t.setAttribute('font-size', (fs * k * 0.98).toFixed(2))
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
            <tspan class="mut">QUARTIER </tspan><tspan class="nm">{maj(nomQ || '?')}</tspan>
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
          {p1.commune && <text x={O.cx} y={O.cy + 34} font-size="9.5" class="lieu" data-max="150">{maj(abregerCommune(p1.commune))}</text>}
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
