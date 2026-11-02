// Le fond de carte des feuilles et de la page Migrations : provinces et départements en teintes claires,
// chaque pays bordé d'un liseré gris.

import { useMemo } from 'preact/hooks'
import { projeter, projeterAnneaux, type Contours, type Fenetre, type Rect } from '../../lib/carte-origines'

const LISERE = '#8b928e'

/** Une carte dans son rectangle : chaque pays bordé d'un liseré gris, les régions des ancêtres en couleur */
export function FondCarte({ id, contours, f, zone, couleurs, cadre }: { id: string; contours: Contours; f: Fenetre; zone: Rect; couleurs: Map<string, string>; cadre?: boolean }) {
  const regions = useMemo(() => projeter(contours, f, zone), [contours, f.join(), zone.x, zone.y, zone.w, zone.h])
  const pays = useMemo(() => contours.p ? projeterAnneaux(contours.p, f, zone) : undefined, [contours, f.join(), zone.x, zone.y, zone.w, zone.h])
  const parPays = new Map<string, typeof regions>()
  for (const r of regions) { const p = r.code.slice(0, 2); parPays.set(p, [...(parPays.get(p) ?? []), r]) }
  const remplir = (rs: typeof regions) => rs.map((r) => <path key={r.code + 'f'} d={r.d} fill={couleurs.get(r.code) ?? '#f3f3ef'} fill-rule="evenodd" stroke="#fff" stroke-width={couleurs.has(r.code) ? 0.5 : 0.4} />)
  return (
    <g>
      <clipPath id={id}><rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} /></clipPath>
      {cadre && <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} fill="#fff" />}
      <g clip-path={`url(#${id})`}>
        {pays ? <>
          {remplir(regions)}
          {/* Le liseré de chaque pays, côté terre seulement (découpé à son contour) : il ne déborde pas sur la mer,
              (0,6 de chaque côté d'une frontière : 1,2 en tout, à peine plus que l'ancien liseré qui débordait),
              les détroits restent ouverts et les îles détachées du continent */}
          {pays.map((p) => (
            <g key={p.code}>
              <clipPath id={`${id}-${p.code}`}><path d={p.d} fill-rule="evenodd" /></clipPath>
              <path d={p.d} fill="none" stroke={LISERE} stroke-width="1.2" stroke-linejoin="round" clip-path={`url(#${id}-${p.code})`} />
            </g>
          ))}
        </> : [...parPays.entries()].map(([code, rs]) => (
          // Sans contour de pays : un liseré gris sous ses régions, visible seulement à ses frontières et sur les côtes
          <g key={code}>
            {rs.map((r) => <path key={r.code} d={r.d} fill="none" stroke={LISERE} stroke-width="1.6" stroke-linejoin="round" />)}
            {remplir(rs)}
          </g>
        ))}
      </g>
      {cadre && <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} fill="none" stroke="#b9bdb9" stroke-width="0.8" />}
    </g>
  )
}
