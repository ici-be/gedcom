// Page d'un lieu : deux petites cartes, la commune dans sa province puis la province dans son pays.

import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Position } from '../lib/geo'
import { cadrer, chargerContours, projection, proportions, type Contours, type Fenetre } from '../lib/carte-origines'
import { FondCarte } from './arbres/FondCarte'

const H = 128

function Vignette({ contours, f, region, pos, titre, id }: { contours: Contours; f: Fenetre; region: string; pos: Position; titre: string; id: string }) {
  const h = H
  const w = Math.round(H * proportions(f))
  const zone = { x: 0, y: 0, w, h }
  const [x, y] = projection(f, zone)(pos.lon, pos.lat)
  const couleurs = new Map([[region, '#b9d3c8']])
  return (
    <figure class="mini-carte">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={titre}>
        <FondCarte id={id} contours={contours} f={f} zone={zone} couleurs={couleurs} />
        <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="9" fill="#c4547a" fill-opacity="0.18" />
        <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.6" fill="#c4547a" stroke="#fff" stroke-width="1.2" />
      </svg>
      <figcaption>{titre}</figcaption>
    </figure>
  )
}

/** position : undefined tant qu'elle se cherche, null si le lieu n'est pas situé */
export function MiniCarte({ position }: { position?: Position | null }) {
  const [contours, setContours] = useState<Contours | null>()
  useEffect(() => {
    let vivant = true
    chargerContours().then((c) => vivant && setContours(c)).catch(() => vivant && setContours(null))
    return () => { vivant = false }
  }, [])
  const cartes = useMemo(() => {
    const code = position?.codeRegion
    if (!contours || !position || !code || !contours.r[code]) return null
    const pays = code.slice(0, 2)
    const memePays = Object.keys(contours.r).filter((c) => c.startsWith(pays + '.') && !(pays === 'FR' && c.startsWith('FR.97')))
    const province = cadrer(contours, [code], 0.12)
    const national = cadrer(contours, memePays.includes(code) ? memePays : [code], 0.2)
    return province && national ? { province, national } : null
  }, [contours, position])
  // pendant le chargement, deux cadres vides de la même hauteur : l'en-tête ne bouge plus quand les cartes arrivent
  if (position === undefined || contours === undefined) {
    return (
      <div class="mini-cartes" aria-hidden="true">
        {[0, 1].map((i) => <figure key={i} class="mini-carte attente"><div class="mini-carte-vide" /><figcaption>&nbsp;</figcaption></figure>)}
      </div>
    )
  }
  if (!cartes || !position || !contours) return null
  const region = position.region ?? 'province'
  const pays = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(position.codeRegion!.slice(0, 2)) ?? '' } catch { return '' } })()
  return (
    <div class="mini-cartes">
      <Vignette id="mini-prov" contours={contours} f={cartes.province} region={position.codeRegion!} pos={position} titre={region} />
      <Vignette id="mini-pays" contours={contours} f={cartes.national} region={position.codeRegion!} pos={position} titre={pays} />
    </div>
  )
}
