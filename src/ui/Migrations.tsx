// Migrations : où vivaient les ancêtres et comment les familles se sont déplacées, en trois onglets.
// Siècles et lignées : une carte par siècle, puis le chemin d'une lignée. Quartiers : le point moyen des
// naissances de chaque génération. Au fil des années : la carte des ancêtres en vie, et les distances.
// Les cartes ont le style du bas de l'éventail imprimé (mêmes teintes de régions).

import '@fontsource/fraunces/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-400.css'
import '@fontsource/fira-sans-condensed/latin-500.css'
import '@fontsource/fira-sans-condensed/latin-600.css'
import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { situerArbre, type Position } from '../lib/geo'
import { chargerContours, proportions, projection, type Contours, type Fenetre } from '../lib/carte-origines'
import { decouperLieu, romain } from '../lib/communes'
import { LIEU_INCONNU, LIEU_NON_SITUE, ordreRegions, places, regionsDesPlaces, resumer, type Place, type Resume } from '../lib/eventail'
import { lignee } from '../lib/lignee'
import { parents } from '../lib/parente'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import {
  anneesDeNaissance, cadreRobuste, centres, distanceKm, etapes, GENERATIONS_MIGRATIONS, lieuEn, mediane, passages, quartierDe, tranches, vies,
  type Etape, type Passage, type Point, type Vie,
} from '../lib/migrations'
import { AUTRES, couleursRegions, GRIS, INCONNU } from './arbres/feuille'
import { FondCarte } from './arbres/FondCarte'
import { largeur } from './arbres/mesure'

/** Une encre par quartier (Sosa 4 à 7), lisible sur les teintes claires */
const ENCRES = ['#6b4f86', '#a3502f', '#4d7a45', '#2f6f7a']
const ONGLETS: [string, string][] = [['siecles', 'Siècles et lignées'], ['quartiers', 'Quartiers'], ['temps', 'Au fil des années']]

const maj = (s: string) => s.toLocaleUpperCase('fr')
const f1 = (x: number) => x.toFixed(1)
const commune = (e: Etape) => decouperLieu(e.lieu).nom
const km = (d: number) => (d < 1 ? 'même commune' : `${Math.round(d)} km`)
/** Les plus longs passages, un seul par enfant (celui du parent né le plus loin) */
const plusLongs = (l: Passage[], n: number) => {
  const vus = new Set<number>()
  return [...l].sort((a, b) => b.km - a.km).filter((p) => !vus.has(p.sosa >> 1) && vus.add(p.sosa >> 1)).slice(0, n)
}

interface Calcul {
  pl: Place[]
  /** Lieux situés de chaque place (une personne vue deux fois : à sa première place seulement) */
  parSosa: Map<number, Etape[]>
  naissances: Map<number, Etape>
  annees: number[]
  passages: Passage[]
  /** Teinte d'un code de région (« BE.VBR »), et le nom de la région */
  teinte: (code?: string) => string
  nomRegion: Map<string, string>
  ordre: string[]
  couleurs: Map<string, string>
  fenetre: Fenetre
  quartiers: string[]
}

function calculer(d: Donnees, positions: Map<string, Position>): Calcul | null {
  const pl = places(d.arbre, d.racine, GENERATIONS_MIGRATIONS)
  const parSosa = new Map<number, Etape[]>()
  const naissances = new Map<number, Etape>()
  const resumes = new Map<number, Resume>()
  for (let s = 1; s < pl.length; s++) {
    const p = pl[s]
    if (!p?.ind) continue
    resumes.set(s, resumer(p.ind, d.suivis.get(p.ind.id)!))
    if (p.dejaVu) continue
    const l = etapes(d, p.ind, positions)
    if (!l.length) continue
    parSosa.set(s, l)
    const n = l.find((e) => e.type === 'naissance')
    if (n) naissances.set(s, n)
  }
  const tous = [...parSosa.values()].flat().map((e) => e.pos)
  const fenetre = cadreRobuste(tous)
  if (!fenetre) return null
  const annees = anneesDeNaissance(d, pl)
  // Les teintes de l'éventail : même ordre des régions, même calcul
  const regions = regionsDesPlaces(resumes, positions)
  const ordre = ordreRegions(pl, regions)
  const couleurs = couleursRegions(ordre)
  const parCode = new Map<string, string>()
  const nomRegion = new Map<string, string>()
  for (const [s, r] of resumes) {
    const code = r.lieu ? positions.get(r.lieu)?.codeRegion : undefined
    if (!code || nomRegion.has(code)) continue
    const reg = regions.get(s)!
    nomRegion.set(code, reg)
    parCode.set(code, couleurs.get(reg) ?? (reg === LIEU_INCONNU || reg === LIEU_NON_SITUE ? INCONNU : AUTRES))
  }
  return {
    pl, parSosa, naissances, annees, passages: passages(pl, naissances, annees),
    teinte: (code) => (code ? parCode.get(code) ?? AUTRES : AUTRES), nomRegion, ordre, couleurs, fenetre,
    quartiers: [4, 5, 6, 7].map((s) => pl[s]?.ind?.nom || '?'),
  }
}

// ——— Cartes ———

type Projection = (lon: number, lat: number) => [number, number]

/** Une carte au style de l'éventail ; le contenu se dessine avec la projection reçue */
function Carte({ id, contours, f, l, fills, titre, children }: {
  id: string; contours: Contours; f: Fenetre; l: number; fills: Map<string, string>; titre: string; children: (P: Projection, h: number, kmPx: number) => ComponentChildren
}) {
  const h = l / proportions(f)
  const zone = { x: 0, y: 0, w: l, h }
  const P = projection(f, zone)
  const kmPx = h / ((f[3] - f[1]) * 111.2)
  return (
    <svg class="feuille mg-carte" viewBox={`0 0 ${f1(l)} ${f1(h)}`} role="img" aria-label={titre}>
      <clipPath id={id + '-cadre'}><rect width={l} height={h} /></clipPath>
      <g clip-path={`url(#${id}-cadre)`}>
        <FondCarte id={id} contours={contours} f={f} zone={zone} couleurs={fills} />
        {children(P, h, kmPx)}
      </g>
    </svg>
  )
}

function Echelle({ x, y, kmPx, l = 50 }: { x: number; y: number; kmPx: number; l?: number }) {
  const w = l * kmPx
  return (
    <g transform={`translate(${f1(x)},${f1(y)})`}>
      <path d={`M0 -3V0H${f1(w)}V-3`} fill="none" stroke={GRIS} stroke-width="0.8" />
      <text x={f1(w + 5)} y="1" font-size="8.5" class="mut">{l} km</text>
    </g>
  )
}

/** Une échelle ronde qui tient dans un cinquième de la largeur */
const longueurEchelle = (largeurKm: number) => [200, 100, 50, 20, 10, 5].find((l) => l <= largeurKm / 5) ?? 2

/** Les communes les plus citées, en petites capitales, sans chevauchement ; `reserve` : rectangles déjà occupés */
function Etiquettes({ P, l, h, evs, max = 14, reserve = [], dx = 4 }: { P: Projection; l: number; h: number; evs: Etape[]; max?: number; reserve?: number[][]; dx?: number }) {
  const n = new Map<string, { e: Etape; n: number }>()
  for (const e of evs) { const c = commune(e); const v = n.get(c) ?? { e, n: 0 }; v.n++; n.set(c, v) }
  const pris = [...reserve]
  const res: { x: number; y: number; t: string }[] = []
  for (const [c, { e }] of [...n.entries()].sort((a, b) => b[1].n - a[1].n)) {
    if (res.length >= max) break
    const [x, y] = P(e.pos.lon, e.pos.lat)
    const t = maj(c)
    const w = largeur(t, 8.5) + t.length * 0.6 + 4
    if (x < 4 || x + dx + w > l - 4 || y < 10 || y > h - 18) continue
    const r = [x + dx - 2, y - 8, x + dx + w, y + 3]
    if (pris.some((q) => !(r[2] < q[0] || r[0] > q[2] || r[3] < q[1] || r[1] > q[3]))) continue
    pris.push(r)
    res.push({ x, y, t })
  }
  return (
    <g>
      {res.map(({ x, y, t }) => (
        <g key={t}>
          <circle cx={f1(x)} cy={f1(y)} r="1.6" fill={GRIS} />
          <text x={f1(x + dx)} y={f1(y + 3)} font-size="8.5" class="lieu" fill={GRIS}>{t}</text>
        </g>
      ))}
    </g>
  )
}

/** Arc du parent vers l'enfant, toujours bombé du même côté */
function courbe(P: Projection, a: Point, b: Point, bombe = 0.18): string {
  const [x1, y1] = P(a.lon, a.lat)
  const [x2, y2] = P(b.lon, b.lat)
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  return `M${f1(x1)} ${f1(y1)}Q${f1(mx - (y2 - y1) * bombe)} ${f1(my + (x2 - x1) * bombe)} ${f1(x2)} ${f1(y2)}`
}

const Fleche = ({ id, couleur }: { id: string; couleur: string }) => (
  <marker id={id} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
    <path d="M0 0L6 3L0 6z" fill={couleur} />
  </marker>
)

/** Légende des teintes pour les codes de région présents */
function Legende({ m, codes, extra }: { m: Calcul; codes: Iterable<string>; extra?: ComponentChildren }) {
  const noms = new Set([...codes].map((c) => m.nomRegion.get(c)).filter((r): r is string => !!r))
  const avec = m.ordre.filter((r) => noms.has(r) && m.couleurs.has(r))
  const autres = [...noms].some((r) => !m.couleurs.has(r) && r !== LIEU_INCONNU && r !== LIEU_NON_SITUE)
  return (
    <div class="mg-legende">
      {avec.map((r) => <span key={r}><i style={{ background: m.couleurs.get(r) }} />{r}</span>)}
      {autres && <span><i style={{ background: AUTRES }} />Autres régions</span>}
      {extra}
    </div>
  )
}

// ——— Siècles et lignées ———

function Siecles({ m, contours }: { m: Calcul; contours: Contours }) {
  const siecles = useMemo(() => {
    const parSiecle = new Map<number, Passage[]>()
    for (const p of m.passages) { const c = Math.floor(p.annee / 100); parSiecle.set(c, [...(parSiecle.get(c) ?? []), p]) }
    const naissancesDe = (c: number) => [...m.naissances.entries()].filter(([s]) => s > 1 && Math.floor(m.annees[s] / 100) === c).map(([, e]) => e)
    return [...parSiecle.keys()].sort((a, b) => a - b).map((c) => ({ c, passages: parSiecle.get(c)!, naissances: naissancesDe(c) }))
      .filter((x) => x.naissances.length >= 5).slice(-5)
  }, [m])
  const [choisi, setChoisi] = useState<number | undefined>()
  const actif = siecles.find((x) => x.c === choisi) ?? [...siecles].sort((a, b) => b.passages.length - a.passages.length)[0]
  if (!actif) return <p class="aucun">Pas assez de lieux situés pour dessiner les siècles.</p>
  const codes = new Set(siecles.flatMap((x) => x.naissances.map((e) => e.pos.codeRegion).filter((c): c is string => !!c)))
  const fills = (l: Etape[]) => new Map(l.filter((e) => e.pos.codeRegion).map((e) => [e.pos.codeRegion!, m.teinte(e.pos.codeRegion)]))
  const nomSiecle = (c: number) => <>{romain(c + 1)}<sup>e</sup> siècle</>
  const loin = plusLongs(actif.passages.filter((p) => p.km >= 15), 12)
  const enfant = (p: Passage) => m.pl[p.sosa >> 1]?.ind
  const largeurKm = (m.fenetre[2] - m.fenetre[0]) * 111.2 * Math.cos((((m.fenetre[1] + m.fenetre[3]) / 2) * Math.PI) / 180)

  return (
    <>
      <section class="panneau">
        <header class="mg-entete">
          <h2>Cinq siècles, cinq cartes</h2>
          <p class="aide">Une carte par siècle de naissance de l’enfant ; chaque flèche va du lieu de naissance du parent à celui de l’enfant. Les régions teintées sont celles où naissent des ancêtres pendant le siècle, avec les couleurs de l’éventail. Un clic sur une carte l’ouvre en grand.</p>
        </header>
        <div class="mg-siecles">
          {siecles.map((x) => {
            const t = tranches(x.passages)
            const med = mediane(x.passages.map((p) => p.km))
            return (
              <button key={x.c} type="button" class={'mg-siecle' + (x === actif ? ' actif' : '')} aria-pressed={x === actif} onClick={() => setChoisi(x.c)}>
                <span class="mg-papier">
                  <Carte id={'s' + x.c} contours={contours} f={m.fenetre} l={230} fills={fills(x.naissances)} titre={`Déplacements au ${romain(x.c + 1)}e siècle`}>
                    {(P, h, kmPx) => (
                      <>
                        <defs><Fleche id={'fl' + x.c} couleur={GRIS} /></defs>
                        {x.naissances.map((e, i) => { const [cx, cy] = P(e.pos.lon, e.pos.lat); return <circle key={i} cx={f1(cx)} cy={f1(cy)} r="1.1" fill={GRIS} fill-opacity="0.55" /> })}
                        {x.passages.filter((p) => p.km >= 2).map((p) => (
                          <path key={p.sosa} d={courbe(P, p.de.pos, p.vers.pos)} fill="none" stroke={GRIS} stroke-width={p.km > 60 ? 1 : 0.6} stroke-opacity={p.km > 60 ? 0.85 : 0.5} marker-end={`url(#fl${x.c})`} />
                        ))}
                        <Echelle x={10} y={h - 10} kmPx={kmPx} l={longueurEchelle(largeurKm)} />
                      </>
                    )}
                  </Carte>
                </span>
                <strong>{nomSiecle(x.c)}</strong>
                <span class="aide">
                  {nombre(x.naissances.length)} naissances · {x.passages.length ? Math.round((100 * t[0]) / x.passages.length) : 0} % dans la commune du parent
                  {med !== undefined && med >= 1 ? ` · ${Math.round(med)} km en médiane` : ''}
                </span>
              </button>
            )
          })}
        </div>
        <Legende m={m} codes={codes} />
      </section>

      <section class="panneau">
        <header class="mg-entete"><h2>Le {nomSiecle(actif.c)} en grand</h2></header>
        <div class="mg-duo">
          <div class="mg-papier">
            <Carte id="sgrand" contours={contours} f={m.fenetre} l={560} fills={fills(actif.naissances)} titre={`Déplacements au ${romain(actif.c + 1)}e siècle`}>
              {(P, h, kmPx) => (
                <>
                  <defs><Fleche id="flgrand" couleur={GRIS} /></defs>
                  <Etiquettes P={P} l={560} h={h} evs={actif.naissances} max={18} />
                  {actif.naissances.map((e, i) => { const [cx, cy] = P(e.pos.lon, e.pos.lat); return <circle key={i} cx={f1(cx)} cy={f1(cy)} r="1.5" fill={GRIS} fill-opacity="0.5" /> })}
                  {actif.passages.filter((p) => p.km >= 2).map((p) => (
                    <path key={p.sosa} d={courbe(P, p.de.pos, p.vers.pos)} fill="none" stroke={ENCRES[p.quartier] ?? GRIS} stroke-width={p.km > 40 ? 1.4 : 0.9} stroke-opacity="0.75" marker-end="url(#flgrand)" />
                  ))}
                  <Echelle x={14} y={h - 14} kmPx={kmPx} l={longueurEchelle(largeurKm)} />
                </>
              )}
            </Carte>
          </div>
          <div class="mg-cote">
            <Quartiers m={m} />
            <h3>Les plus longs déplacements</h3>
            {loin.length ? (
              <div class="tableau-conteneur">
                <table class="tableau">
                  <thead><tr><th>Né en</th><th>Enfant</th><th>De → à</th><th class="nombre">km</th></tr></thead>
                  <tbody>
                    {loin.map((p) => (
                      <tr key={p.sosa}><td>{p.annee}</td><td>{enfant(p)?.prenom.split(' ')[0]} {enfant(p)?.nom}</td><td>{commune(p.de)} → {commune(p.vers)}</td><td class="nombre">{Math.round(p.km)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p class="aide">Aucun déplacement de plus de 15 km pendant ce siècle.</p>}
          </div>
        </div>
      </section>
    </>
  )
}

function Quartiers({ m }: { m: Calcul }) {
  return (
    <div class="mg-legende">
      {m.quartiers.map((q, i) => <span key={i}><b class="mg-puce" style={{ background: ENCRES[i] }} />Quartier {q}</span>)}
    </div>
  )
}

/** Les lignées proposées : de père en père depuis chaque arrière-grand-parent, puis de mère en mère */
function lignees(d: Donnees, pl: Place[]): { cle: string; nom: string; q: number }[] {
  const res: { cle: string; nom: string; q: number }[] = []
  for (let s = 8; s <= 15; s++) {
    let ind = pl[s]?.ind
    if (!ind) continue
    let sosa = BigInt(s)
    for (let p = parents(d.arbre, ind).pere; p && sosa < 2n ** 200n; p = parents(d.arbre, p).pere) { ind = p; sosa *= 2n }
    res.push({ cle: String(sosa), nom: pl[s].ind!.nom || '?', q: quartierDe(s) })
  }
  res.push({ cle: 'maternelle', nom: 'de mère en mère', q: 3 })
  return res
}

function FilLignee({ d, m, contours, positions, cle }: { d: Donnees; m: Calcul; contours: Contours; positions: Map<string, Position>; cle?: string }) {
  const choix = useMemo(() => lignees(d, m.pl), [d, m])
  const actif = cle ?? choix[0]?.cle
  const l = useMemo(() => (actif ? lignee(d, actif) : null), [d, actif])
  const [survol, setSurvol] = useState<string>()
  const info = choix.find((c) => c.cle === actif)
  // l'encre du quartier : celui du troisième maillon (Sosa 4 à 7)
  const enc = ENCRES[info?.q ?? (l?.maillons[2] ? quartierDe(Number(l.maillons[2].sosa)) : -1)] ?? GRIS
  const maillons = useMemo(() => (l ? [...l.maillons].reverse().map((x) => ({ x, ind: d.arbre.individus.get(x.id)!, lieux: etapes(d, d.arbre.individus.get(x.id)!, positions) })) : []), [l, d, positions])
  const tous = maillons.flatMap((x) => x.lieux)
  let f = cadreRobuste(tous.map((e) => e.pos), 0.2, 0)
  if (f) {
    // jamais plus serré que 1,4° de large et 1° de haut
    const [a, b, c, e] = f
    const dx = Math.max(0, 1.4 - (c - a)) / 2, dy = Math.max(0, 1 - (e - b)) / 2
    f = [a - dx, b - dy, c + dx, e + dy]
  }
  const L = 560
  return (
    <section class="panneau">
      <header class="mg-entete">
        <h2>Le fil d’une lignée</h2>
        <p class="aide">De père en père depuis un arrière-grand-parent, ou de mère en mère : la carte suit le chemin de la lignée, naissances, mariages et décès dans l’ordre du temps.</p>
      </header>
      <nav class="mg-choix" aria-label="Lignée">
        {choix.map((c) => <a key={c.cle} href={'#/migrations/siecles/' + c.cle} class={c.cle === actif ? 'actif' : ''} aria-current={c.cle === actif ? 'true' : undefined}>{c.nom}</a>)}
        {actif && <a class="mg-ouvrir" href={'#/lignee/' + actif}>Ouvrir la lignée →</a>}
      </nav>
      {!f || !l ? <p class="aide">Aucun lieu situé dans cette lignée.</p> : (
        <div class="mg-duo">
          <div class="mg-papier">
            <Carte id="fil" contours={contours} f={f} l={L} fills={new Map(tous.filter((e) => e.pos.codeRegion).map((e) => [e.pos.codeRegion!, m.teinte(e.pos.codeRegion)]))} titre="Chemin de la lignée">
              {(P, h, kmPx) => {
                const chemin = tous.map((e, j) => { const [x, y] = P(e.pos.lon, e.pos.lat); return (j ? 'L' : 'M') + f1(x) + ' ' + f1(y) }).join('')
                const largeurKm = L / kmPx
                return (
                  <>
                    <path d={chemin} fill="none" stroke={enc} stroke-width="1.5" stroke-linejoin="round" stroke-opacity="0.8" />
                    {tous.filter((e) => e.type !== 'naissance').map((e, i) => { const [x, y] = P(e.pos.lon, e.pos.lat); return <circle key={i} cx={f1(x)} cy={f1(y)} r="2.2" fill="#fff" stroke={enc} stroke-width="1" /> })}
                    <Etiquettes P={P} l={L} h={h} evs={tous} max={22} dx={11} />
                    {maillons.map(({ x, lieux }) => {
                      const n = lieux.find((e) => e.type === 'naissance')
                      if (!n) return null
                      const [cx, cy] = P(n.pos.lon, n.pos.lat)
                      const grand = survol === x.id
                      return (
                        <g key={x.id}>
                          <circle cx={f1(cx)} cy={f1(cy)} r={grand ? 11 : 7} fill={enc} stroke="#fff" stroke-width="1" />
                          <text x={f1(cx)} y={f1(cy + 3)} font-size={grand ? 10 : 8} fill="#fff" text-anchor="middle" font-weight="600">{x.generation}</text>
                        </g>
                      )
                    })}
                    <Echelle x={14} y={h - 14} kmPx={kmPx} l={longueurEchelle(largeurKm)} />
                  </>
                )
              }}
            </Carte>
          </div>
          <ol class="mg-fil">
            {maillons.map(({ x, ind, lieux }, j) => {
              const n = lieux.find((e) => e.type === 'naissance')
              const dc = lieux.find((e) => e.type === 'deces')
              const suivant = maillons[j + 1]?.lieux.find((e) => e.type === 'naissance')
              const f = ind.sexe === 'F' ? 'e' : ''
              const ou = [n && `né${f} ${n.annee ?? ''} à ${commune(n)}`, dc && `mort${f} ${dc.annee ?? ''} à ${commune(dc)}`].filter(Boolean).join(' · ')
              return (
                <li key={x.id} tabIndex={0} class={survol === x.id ? 'actif' : ''} onMouseEnter={() => setSurvol(x.id)} onMouseLeave={() => setSurvol(undefined)} onFocus={() => setSurvol(x.id)} onBlur={() => setSurvol(undefined)}>
                  <span class="mg-gen">{romain(x.generation)}</span>
                  <span><b>{ind.prenom.split(' ')[0]} {maj(ind.nom)}</b></span>
                  <span class="mg-ou">{ou || 'lieux inconnus'}{n && suivant ? <> · <b class="mg-km">{km(distanceKm(n.pos, suivant.pos))}</b> jusqu’à l’enfant</> : null}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

// ——— Quartiers : centres de gravité ———

function Gravite({ d, m, contours }: { d: Donnees; m: Calcul; contours: Contours }) {
  const cs = useMemo(() => centres(m.pl, m.naissances), [m])
  const depart = m.naissances.get(1)
  const L = 560
  const traces = (P: Projection, r0: number, etiquettes: boolean) => cs.map((pts, q) => {
    if (!pts.length) return null
    const enc = ENCRES[q]
    const chemin = pts.map((p, i) => { const [x, y] = P(p.lon, p.lat); return (i ? 'L' : 'M') + f1(x) + ' ' + f1(y) }).join('')
    const [xa, ya] = P(pts[pts.length - 1].lon, pts[pts.length - 1].lat)
    const fin = depart ? P(depart.pos.lon, depart.pos.lat) : undefined
    return (
      <g key={q}>
        <path d={chemin} fill="none" stroke={enc} stroke-width="1.6" stroke-linejoin="round" />
        {fin && <path d={`M${f1(xa)} ${f1(ya)}L${f1(fin[0])} ${f1(fin[1])}`} fill="none" stroke={enc} stroke-width="1.2" stroke-dasharray="2 3" />}
        {pts.map((p, i) => {
          const [x, y] = P(p.lon, p.lat)
          const r = r0 + Math.sqrt(p.n) * r0 * 0.4
          const bout = etiquettes && (i === 0 || i === pts.length - 1)
          return (
            <g key={p.generation}>
              <circle cx={f1(x)} cy={f1(y)} r={f1(r)} fill="#fff" stroke={enc} stroke-width="1.2" />
              {bout && <text x={f1(x + r + 2)} y={f1(y + 3.5)} font-size="10" class="disp" fill={enc}>{romain(p.generation + 1)}</text>}
            </g>
          )
        })}
      </g>
    )
  })
  // Médaillon : les centres proches du départ, agrandis, quand la carte entière les tasse
  const proches = depart ? cs.flat().filter((p) => distanceKm(p, depart.pos) < 120) : []
  const fz = depart && proches.length ? cadreRobuste([...proches, depart.pos], 0.3, 0) : undefined
  const fills = new Map([...m.naissances.values()].filter((e) => e.pos.codeRegion).map((e) => [e.pos.codeRegion!, m.teinte(e.pos.codeRegion)]))
  const rangs = cs.map((pts, q) => {
    const vieux = pts[0]
    let saut = { d: 0, g: -1 }
    for (let i = 1; i < pts.length; i++) { const v = distanceKm(pts[i - 1], pts[i]); if (v > saut.d) saut = { d: v, g: pts[i].generation } }
    return { q, vieux, total: vieux && depart ? distanceKm(vieux, depart.pos) : undefined, saut }
  })
  const racine = d.arbre.individus.get(d.racine)

  return (
    <section class="panneau">
      <header class="mg-entete">
        <h2>Le centre de gravité des quartiers</h2>
        <p class="aide">Pour chaque quartier et chaque génération, le point moyen des naissances connues ; la taille du rond suit le nombre de naissances. Les quatre chemins vont de la génération la plus ancienne aux grands-parents, puis le pointillé rejoint la naissance de {racine?.prenom.split(' ')[0] || 'la personne de départ'}. Un point moyen peut tomber là où personne n’a vécu.</p>
      </header>
      <div class="mg-duo">
        <div class="mg-papier">
          <Carte id="gravite" contours={contours} f={m.fenetre} l={L} fills={fills} titre="Centre de gravité des naissances par quartier et par génération">
            {(P, h, kmPx) => {
              const reserve: number[][] = []
              let medaillon = null
              if (fz && depart) {
                const lz = L * 0.46
                const z = { x: L - lz - 12, y: h - lz / proportions(fz) - 30, w: lz, h: lz / proportions(fz) }
                const Pz = projection(fz, z)
                const [ux0, uy0] = P(fz[0], fz[3]), [ux1, uy1] = P(fz[2], fz[1])
                const [dx, dy] = Pz(depart.pos.lon, depart.pos.lat)
                const kmZ = z.h / ((fz[3] - fz[1]) * 111.2)
                reserve.push([z.x, z.y, z.x + z.w, z.y + z.h])
                medaillon = (
                  <g>
                    <rect x={f1(ux0)} y={f1(uy0)} width={f1(ux1 - ux0)} height={f1(uy1 - uy0)} fill="none" stroke={GRIS} stroke-width="0.8" />
                    <path d={`M${f1(ux1)} ${f1(uy1)}L${f1(z.x + z.w)} ${f1(z.y)}M${f1(ux0)} ${f1(uy1)}L${f1(z.x)} ${f1(z.y)}`} stroke={GRIS} stroke-width="0.5" stroke-dasharray="2 2" />
                    <rect x={f1(z.x - 1)} y={f1(z.y - 1)} width={f1(z.w + 2)} height={f1(z.h + 2)} fill="#fff" stroke={GRIS} stroke-width="0.8" />
                    <clipPath id="gravite-z-cadre"><rect x={z.x} y={z.y} width={z.w} height={z.h} /></clipPath>
                    <g clip-path="url(#gravite-z-cadre)">
                      <FondCarte id="gravite-z" contours={contours} f={fz} zone={z} couleurs={fills} />
                      {traces(Pz, 2.2, true)}
                      <circle cx={f1(dx)} cy={f1(dy)} r="4.5" fill={GRIS} />
                    </g>
                    <Echelle x={z.x + 8} y={z.y + z.h - 8} kmPx={kmZ} l={longueurEchelle(z.w / kmZ)} />
                  </g>
                )
              }
              const fin = depart ? P(depart.pos.lon, depart.pos.lat) : undefined
              return (
                <>
                  <g opacity="0.8"><Etiquettes P={P} l={L} h={h} evs={[...m.naissances.values()].filter((e) => !fz || !(e.pos.lon > fz[0] && e.pos.lon < fz[2] && e.pos.lat > fz[1] && e.pos.lat < fz[3]))} max={10} reserve={reserve} /></g>
                  {traces(P, 1.4, !fz)}
                  {fin && <circle cx={f1(fin[0])} cy={f1(fin[1])} r="4" fill={GRIS} />}
                  {medaillon}
                  <Echelle x={14} y={h - 14} kmPx={kmPx} l={longueurEchelle(L / kmPx)} />
                </>
              )
            }}
          </Carte>
        </div>
        <div class="mg-cote">
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Quartier</th><th>Depuis</th><th class="nombre">Jusqu’au départ</th><th class="nombre">Plus grand saut</th></tr></thead>
              <tbody>
                {rangs.map(({ q, vieux, total, saut }) => (
                  <tr key={q}>
                    <td><b class="mg-puce" style={{ background: ENCRES[q] }} />{m.quartiers[q]}</td>
                    <td>{vieux ? romain(vieux.generation + 1) : '—'}</td>
                    <td class="nombre">{total !== undefined ? `${Math.round(total)} km` : '—'}</td>
                    <td class="nombre">{saut.g >= 0 ? `${Math.round(saut.d)} km (${romain(saut.g + 1)})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="aide">« Depuis » : la génération la plus ancienne qui compte au moins deux naissances situées. « Plus grand saut » : le plus long écart entre deux générations successives du quartier, et la génération où il se produit.</p>
        </div>
      </div>
    </section>
  )
}

// ——— Au fil des années ———

function Vivante({ m, contours }: { m: Calcul; contours: Contours }) {
  const toutes = useMemo(() => vies(m.pl, m.parSosa, m.annees), [m])
  const debut = Math.max(1500, Math.floor(Math.min(...toutes.map((v) => v.debut)) / 10) * 10)
  const fin = new Date().getFullYear()
  const [annee, setAnnee] = useState(Math.round((debut + fin) / 2 / 10) * 10)
  const [lecture, setLecture] = useState(false)
  // la vitesse de lecture, en années par seconde (gardée d'une visite à l'autre)
  const [vitesse, setVitesse] = useState(() => lire('migrations.vitesse', 6))
  const minuterie = useRef<number>(undefined)
  useEffect(() => {
    if (!lecture) return
    minuterie.current = window.setInterval(() => {
      setAnnee((a) => {
        if (a + 1 >= fin) { setLecture(false); return fin }
        return a + 1
      })
    }, 1000 / vitesse)
    return () => clearInterval(minuterie.current)
  }, [lecture, vitesse])
  const vivants = toutes.filter((v) => v.debut <= annee && annee <= v.fin)
  const lieux = vivants.map((v) => ({ v, e: lieuEn(v, annee) }))
  const parCode = new Map<string, number>()
  for (const { e } of lieux) if (e.pos.codeRegion) parCode.set(e.pos.codeRegion, (parCode.get(e.pos.codeRegion) ?? 0) + 1)
  const fills = new Map([...parCode.keys()].map((c) => [c, m.teinte(c)]))
  const parRegion = new Map<string, number>()
  for (const [c, n] of parCode) { const r = m.nomRegion.get(c) ?? c; parRegion.set(r, (parRegion.get(r) ?? 0) + n) }
  const top = [...parRegion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const max = top[0]?.[1] ?? 1
  const parQ = [0, 1, 2, 3].map((q) => vivants.filter((v: Vie) => v.quartier === q).length)
  const L = 560

  return (
    <section class="panneau">
      <header class="mg-entete">
        <h2>La carte vivante</h2>
        <p class="aide">Pour chaque année, un point par ancêtre en vie, à son dernier lieu connu (naissance, puis mariage), dans l’encre de son quartier ; les régions où vivent des ancêtres se colorent. Sans date de décès, une vie est comptée soixante ans.</p>
      </header>
      <div class="mg-lecture">
        <button type="button" class="bouton principal" id="migrations-lire" onClick={() => { if (!lecture && annee >= fin) setAnnee(debut); setLecture(!lecture) }}>{lecture ? 'Pause' : 'Lire'}</button>
        <input type="range" id="migrations-annee" min={debut} max={fin} step="1" value={annee} aria-label="Année" onInput={(e) => { setLecture(false); setAnnee(Number(e.currentTarget.value)) }} />
        <span class="mg-annee">{annee}</span>
        <label class="mg-vitesse">
          Vitesse
          <input type="range" id="migrations-vitesse" min="1" max="30" step="1" value={vitesse} onInput={(e) => { const v = Number(e.currentTarget.value); setVitesse(v); ecrire('migrations.vitesse', v) }} />
          <span>{vitesse} an{vitesse > 1 ? 's' : ''}/s</span>
        </label>
      </div>
      <div class="mg-duo">
        <div class="mg-papier">
          <Carte id="vivante" contours={contours} f={m.fenetre} l={L} fills={fills} titre={`Ancêtres en vie en ${annee}`}>
            {(P, h, kmPx) => (
              <>
                {lieux.map(({ v, e }) => { const [x, y] = P(e.pos.lon, e.pos.lat); return <circle key={v.sosa} cx={f1(x)} cy={f1(y)} r="2.4" fill={ENCRES[v.quartier] ?? GRIS} fill-opacity="0.85" stroke="#fff" stroke-width="0.5" /> })}
                <Echelle x={14} y={h - 14} kmPx={kmPx} l={longueurEchelle(L / kmPx)} />
              </>
            )}
          </Carte>
        </div>
        <div class="mg-cote">
          <h3>{nombre(vivants.length)} ancêtre{vivants.length > 1 ? 's' : ''} en vie en {annee}</h3>
          <div class="mg-legende">
            {m.quartiers.map((q, i) => <span key={i}><b class="mg-puce" style={{ background: ENCRES[i] }} />{q} {parQ[i]}</span>)}
          </div>
          <div class="mg-barres">
            {top.map(([r, n]) => (
              <div key={r}>
                <span>{r}</span>
                <span class="mg-barre"><i style={{ width: `${(100 * n) / max}%`, background: m.couleurs.get(r) ?? AUTRES }} /></span>
                <span class="nombre">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Kilometres({ m }: { m: Calcul }) {
  const W = 1000, H = 300, X0 = 52, X1 = W - 16, Y0 = 16, Y1 = H - 34
  const l = m.passages
  const a0 = Math.max(1500, Math.floor(Math.min(...l.map((p) => p.annee)) / 50) * 50)
  const a1 = Math.ceil(Math.max(...l.map((p) => p.annee)) / 50) * 50
  const dmax = 400
  const X = (a: number) => X0 + ((a - a0) / (a1 - a0)) * (X1 - X0)
  const Y = (d: number) => Y1 - (Math.sqrt(Math.min(d, dmax)) / Math.sqrt(dmax)) * (Y1 - Y0)
  const quarts: [number, number, number][] = []
  for (let a = a0; a < a1; a += 25) {
    const v = l.filter((p) => p.annee >= a && p.annee < a + 25).map((p) => p.km).sort((x, y) => x - y)
    if (v.length >= 8) quarts.push([a + 12.5, v[Math.floor(v.length / 2)], v[Math.floor(v.length * 0.75)]])
  }
  const ligne = (k: 1 | 2) => quarts.map((q, i) => (i ? 'L' : 'M') + f1(X(q[0])) + ' ' + f1(Y(q[k]))).join('')
  const siecles = [...new Set(l.map((p) => Math.floor(p.annee / 100)))].sort((a, b) => a - b)
  const grands = plusLongs(l, 10)
  const dernier = quarts[quarts.length - 1]

  return (
    <section class="panneau">
      <header class="mg-entete">
        <h2>Combien de kilomètres entre parent et enfant&nbsp;?</h2>
        <p class="aide">Chaque point est une naissance, placée à son année et à sa distance du lieu de naissance du parent (échelle resserrée vers le haut). La ligne pleine suit la distance médiane par quart de siècle ; trois naissances sur quatre sont sous le pointillé.</p>
      </header>
      <div class="mg-papier">
        <svg class="mg-graphe" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distance entre la naissance du parent et celle de l'enfant, par année">
          {[0, 5, 25, 50, 100, 200, 400].map((d) => (
            <g key={d}>
              <line x1={X0} x2={X1} y1={f1(Y(d))} y2={f1(Y(d))} stroke="#e6e2d9" />
              <text x={X0 - 6} y={f1(Y(d) + 4)} text-anchor="end">{d} km</text>
            </g>
          ))}
          {Array.from({ length: Math.floor((a1 - a0) / 50) + 1 }, (_, i) => a0 + i * 50).map((a) => <text key={a} x={f1(X(a))} y={H - 12} text-anchor="middle">{a}</text>)}
          {l.map((p) => <circle key={p.sosa} cx={f1(X(p.annee))} cy={f1(Y(p.km))} r="2" fill={ENCRES[p.quartier] ?? GRIS} fill-opacity="0.35" />)}
          <path d={ligne(2)} fill="none" stroke="#2f5d50" stroke-width="1.5" stroke-dasharray="4 3" />
          <path d={ligne(1)} fill="none" stroke="#2f5d50" stroke-width="2.5" />
          {dernier && <text x={f1(X(dernier[0]) - 4)} y={f1(Y(dernier[1]) - 8)} text-anchor="end" class="fort">médiane</text>}
        </svg>
      </div>
      <div class="mg-duo egal">
        <div class="mg-cote">
          <h3>Par siècle de naissance de l’enfant</h3>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Siècle</th><th class="nombre">Naissances</th><th class="nombre">Même commune</th><th class="nombre">&lt; 15 km</th><th class="nombre">15 à 50</th><th class="nombre">50 et +</th></tr></thead>
              <tbody>
                {siecles.map((c) => {
                  const v = l.filter((p) => Math.floor(p.annee / 100) === c)
                  const t = tranches(v)
                  const pc = (n: number) => `${Math.round((100 * n) / v.length)} %`
                  return <tr key={c}><td>{romain(c + 1)}<sup>e</sup></td><td class="nombre">{v.length}</td>{t.map((n, i) => <td key={i} class="nombre">{pc(n)}</td>)}</tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div class="mg-cote">
          <h3>Les plus grands départs</h3>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Né en</th><th>Enfant</th><th>De → à</th><th class="nombre">km</th></tr></thead>
              <tbody>
                {grands.map((p) => {
                  const e = m.pl[p.sosa >> 1]?.ind
                  return <tr key={p.sosa}><td>{p.annee}</td><td>{e?.prenom.split(' ')[0]} {e?.nom}</td><td>{commune(p.de)} → {commune(p.vers)}</td><td class="nombre">{Math.round(p.km)}</td></tr>
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}

// ——— La page ———

export function Migrations({ d, onglet, cle }: { d: Donnees; onglet?: string; cle?: string }) {
  const [positions, setPositions] = useState<Map<string, Position>>()
  const [contours, setContours] = useState<Contours>()
  const [erreur, setErreur] = useState(false)
  useEffect(() => {
    let vivant = true
    situerArbre(d.arbre).then((p) => vivant && setPositions(p)).catch(() => vivant && setErreur(true))
    chargerContours().then((c) => vivant && setContours(c)).catch(() => vivant && setErreur(true))
    return () => { vivant = false }
  }, [d.arbre])
  const m = useMemo(() => (positions ? calculer(d, positions) : null), [d, positions])
  const actif = ONGLETS.some(([k]) => k === onglet) ? onglet! : 'siecles'

  let contenu
  if (erreur) contenu = <p class="erreur" role="alert">Les listes de localités ou les contours des régions n’ont pas pu être chargés.</p>
  else if (!positions || !contours) contenu = <div class="attente" role="status"><span class="rouet" />Placement des lieux sur la carte…</div>
  else if (!m) contenu = <p class="aucun">Aucun lieu de naissance, de mariage ou de décès n’a pu être situé.</p>
  else if (actif === 'quartiers') contenu = <Gravite d={d} m={m} contours={contours} />
  else if (actif === 'temps') contenu = <><Vivante m={m} contours={contours} /><Kilometres m={m} /></>
  else contenu = <><Siecles m={m} contours={contours} /><FilLignee d={d} m={m} contours={contours} positions={positions} cle={cle} /></>

  const situes = m ? [...m.parSosa.values()].reduce((s, l) => s + l.length, 0) : 0
  return (
    <section class="ecran migrations">
      <header class="titre-ecran">
        <h1>Migrations</h1>
        <p class="sous-titre">
          Où vivaient les ancêtres directs, jusqu’à la {GENERATIONS_MIGRATIONS}<sup>e</sup> génération, d’après les lieux de naissance (ou de baptême), de mariage et de décès (ou d’inhumation).
          {m && <> {nombre(situes)} lieux situés pour {nombre(m.parSosa.size)} ancêtres ; {nombre(m.passages.length)} passages du lieu de naissance d’un parent à celui de son enfant.</>}
        </p>
      </header>
      <nav class="mg-onglets" aria-label="Vues">
        <span class="segments">
          {ONGLETS.map(([k, t]) => <a key={k} href={'#/migrations/' + k} class={actif === k ? 'actif' : ''} aria-current={actif === k ? 'page' : undefined}>{t}</a>)}
        </span>
      </nav>
      {contenu}
    </section>
  )
}

