// Accueil : d'où viennent les ancêtres. Les provinces et départements de naissance, d'autant plus foncés
// qu'il y est né d'ancêtres, et un point par commune ; même fond de carte que l'éventail imprimé.

import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { situerArbre, type Position } from '../lib/geo'
import { cadrer, chargerContours, projection, proportions, zones, type Contours } from '../lib/carte-origines'
import { decouperLieu } from '../lib/communes'
import { nombre } from '../lib/format'
import { FondCarte } from './arbres/FondCarte'

const CLAIR = [226, 237, 231]
const FONCE = [47, 93, 80]
const LARGEUR = 600

/** Du vert très clair (une naissance) au vert de l'appli (la région la plus fournie), en échelle logarithmique */
function teinte(n: number, max: number): string {
  const t = max > 1 ? Math.log(n) / Math.log(max) : 1
  const c = CLAIR.map((a, i) => Math.round(a + (FONCE[i] - a) * (0.15 + 0.85 * t)))
  return `rgb(${c.join(',')})`
}

export function CarteAccueil({ d }: { d: Donnees }) {
  const [positions, setPositions] = useState<Map<string, Position>>()
  const [contours, setContours] = useState<Contours>()
  const [erreur, setErreur] = useState(false)
  useEffect(() => {
    let vivant = true
    situerArbre(d.arbre).then((p) => vivant && setPositions(p)).catch(() => vivant && setErreur(true))
    chargerContours().then((c) => vivant && setContours(c)).catch(() => vivant && setErreur(true))
    return () => { vivant = false }
  }, [d.arbre])

  const carte = useMemo(() => {
    if (!positions || !contours) return null
    const parRegion = new Map<string, { n: number; nom: string }>()
    const parCommune = new Map<string, { n: number; pos: Position; nom: string }>()
    let situes = 0
    for (const id of d.ancetres.keys()) {
      const lieu = d.suivis.get(id)?.naissance.evenement?.lieu
      const pos = lieu ? positions.get(lieu) : undefined
      if (!lieu || !pos) continue
      situes++
      if (pos.codeRegion) {
        const r = parRegion.get(pos.codeRegion) ?? { n: 0, nom: pos.region ?? pos.codeRegion }
        r.n++
        parRegion.set(pos.codeRegion, r)
      }
      const nom = decouperLieu(lieu).nom
      const c = parCommune.get(nom) ?? { n: 0, pos, nom }
      c.n++
      parCommune.set(nom, c)
    }
    const z = zones(new Map([...parRegion].map(([c, r]) => [c, r.n])))[0]
    const f = z && cadrer(contours, z.codes, 0.35)
    if (!f) return null
    const hauteur = Math.min(LARGEUR / proportions(f), 640)
    const largeur = hauteur * proportions(f)
    const zone = { x: 0, y: 0, w: largeur, h: hauteur }
    const max = Math.max(...[...parRegion.values()].map((r) => r.n))
    const couleurs = new Map([...parRegion].map(([c, r]) => [c, teinte(r.n, max)]))
    const pt = projection(f, zone)
    const points = [...parCommune.values()]
      .map((c) => ({ ...c, xy: pt(c.pos.lon, c.pos.lat) }))
      .filter(({ xy: [x, y] }) => x >= 0 && y >= 0 && x <= largeur && y <= hauteur)
      .sort((a, b) => b.n - a.n)
    const tete = [...parRegion.values()].sort((a, b) => b.n - a.n).slice(0, 5)
    const communes = points.slice(0, 3)
    return { f, zone, couleurs, points, tete, communes, max, situes, hors: situes - z.n }
  }, [positions, contours, d])

  if (erreur) return null
  return (
    <section class="panneau carte-accueil">
      <div class="carte-accueil-texte">
        <h2>D’où viennent vos ancêtres</h2>
        {!carte ? <p class="aide">Préparation de la carte…</p> : (
          <>
            <p class="aide">Lieu de naissance de {nombre(carte.situes)} ancêtres sur {nombre(d.ancetres.size)}{carte.hors > 0 ? `, dont ${nombre(carte.hors)} hors de la carte` : ''}.</p>
            <ol class="carte-accueil-regions">
              {carte.tete.map((r) => (
                <li key={r.nom}><span class="pastille-couleur" style={{ background: teinte(r.n, carte.max) }} /><span>{r.nom}</span><b>{nombre(r.n)}</b></li>
              ))}
            </ol>
            {carte.communes.length > 0 && (
              <p class="aide">Communes les plus présentes : {carte.communes.map((c, i) => <span key={c.nom}>{i ? ', ' : ''}<a href={'#/carte'}>{c.nom}</a> ({nombre(c.n)})</span>)}.</p>
            )}
            <p class="aide"><a href="#/migrations">Les migrations siècle par siècle →</a></p>
          </>
        )}
      </div>
      <div class="carte-accueil-fond">
        {carte && (
          <svg viewBox={`0 0 ${carte.zone.w.toFixed(0)} ${carte.zone.h.toFixed(0)}`} role="img" aria-label="Carte des lieux de naissance des ancêtres">
            <FondCarte id="accueil" contours={contours!} f={carte.f} zone={carte.zone} couleurs={carte.couleurs} />
            <g>
              {carte.points.map((c) => (
                <circle key={c.nom} cx={c.xy[0].toFixed(1)} cy={c.xy[1].toFixed(1)} r={(1.6 + Math.sqrt(c.n) * 1.1).toFixed(1)}
                  fill="#1f2523" fill-opacity="0.5" stroke="#fff" stroke-width="0.6"><title>{c.nom} : {c.n}</title></circle>
              ))}
            </g>
          </svg>
        )}
      </div>
    </section>
  )
}
