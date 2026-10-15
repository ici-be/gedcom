// Le fond de carte des feuilles et de la page Migrations : provinces et départements en teintes claires,
// chaque pays bordé d'un liseré gris.

import { useMemo } from 'preact/hooks'
import { projeter, type Contours, type Fenetre, type Rect } from '../../lib/carte-origines'

/** Une carte dans son rectangle : chaque pays bordé d'un liseré gris, les régions des ancêtres en couleur */
export function FondCarte({ id, contours, f, zone, couleurs, cadre }: { id: string; contours: Contours; f: Fenetre; zone: Rect; couleurs: Map<string, string>; cadre?: boolean }) {
  const regions = useMemo(() => projeter(contours, f, zone), [contours, f.join(), zone.x, zone.y, zone.w, zone.h])
  const parPays = new Map<string, typeof regions>()
  for (const r of regions) { const p = r.code.slice(0, 2); parPays.set(p, [...(parPays.get(p) ?? []), r]) }
  return (
    <g>
      <clipPath id={id}><rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} /></clipPath>
      {cadre && <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} fill="#fff" />}
      {/* Chaque pays : un liseré gris sous ses régions, qui ne reste visible qu'à ses frontières et sur les côtes */}
      <g clip-path={`url(#${id})`}>
        {[...parPays.entries()].map(([pays, rs]) => (
          <g key={pays}>
            {rs.map((r) => <path key={r.code} d={r.d} fill="none" stroke="#8b928e" stroke-width="1.6" stroke-linejoin="round" />)}
            {rs.map((r) => <path key={r.code + 'f'} d={r.d} fill={couleurs.get(r.code) ?? '#f3f3ef'} fill-rule="evenodd" stroke="#fff" stroke-width={couleurs.has(r.code) ? 0.5 : 0.4} />)}
          </g>
        ))}
      </g>
      {cadre && <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} fill="none" stroke="#b9bdb9" stroke-width="0.8" />}
    </g>
  )
}
