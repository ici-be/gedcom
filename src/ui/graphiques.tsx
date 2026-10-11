// Petits graphiques en SVG, dessinés à la largeur réelle de leur conteneur.

import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'

function useLargeur() {
  const ref = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new ResizeObserver(([e]) => setLargeur(Math.floor(e.contentRect.width)))
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return { ref, largeur }
}

/** Graduation « ronde » : 1, 2 ou 5 × 10^k */
function pas(max: number, traits: number): number {
  const brut = max / traits
  const p = 10 ** Math.floor(Math.log10(brut || 1))
  for (const m of [1, 2, 5, 10]) if (brut <= m * p) return m * p
  return 10 * p
}

export interface Serie {
  nom: string
  /** Couleur CSS (variable acceptée) */
  couleur: string
  valeurs: (number | undefined)[]
  /** Effectifs, montrés dans l'info-bulle ; une barre fondée sur peu de cas est plus pâle */
  n?: number[]
}

interface PropsColonnes {
  categories: string[]
  series: Serie[]
  format?: (v: number) => string
  /** Barres empilées plutôt que côte à côte */
  empile?: boolean
  hauteur?: number
  /** Catégorie mise en avant (les autres sont atténuées) */
  actif?: number
  /** Valeur maximale imposée (100 pour des pourcentages) */
  max?: number
  /** N'écrire qu'une étiquette sur `pasEtiquettes` sous l'axe */
  pasEtiquettes?: number
  ariaLabel: string
  /** En dessous de cet effectif, la barre est pâle (0 : jamais) */
  seuil?: number
  /** Retirer les premières catégories où aucune série n'atteint le seuil (siècles anciens peu fournis) */
  rogner?: boolean
  /** Pas d'étiquette au-dessus des barres plus petites que cette valeur */
  etiquetteMin?: number
}

const PEU = 10

export function Colonnes(props: PropsColonnes) {
  const { seuil = PEU, rogner } = props
  let { categories, series, actif } = props
  if (rogner) {
    const debut = categories.findIndex((_, i) => series.some((x) => (x.n?.[i] ?? 0) >= seuil))
    if (debut > 0) {
      categories = categories.slice(debut)
      series = series.map((x) => ({ ...x, valeurs: x.valeurs.slice(debut), n: x.n?.slice(debut) }))
      if (actif !== undefined) actif -= debut
    }
  }
  return <ColonnesBrutes {...props} categories={categories} series={series} actif={actif} seuil={seuil} />
}

/** Rectangle aux coins du haut arrondis ou non (le bas, posé sur l'axe ou sur une autre part, reste carré) */
function cheminBarre(x: number, y: number, l: number, h: number, r: number, arrondi: boolean): string {
  r = arrondi ? Math.min(r, l / 2, h) : 0
  return `M${x},${y + h}v${r - h}` + (r ? `a${r},${r} 0 0 1 ${r},${-r}` : '') + `h${l - 2 * r}` + (r ? `a${r},${r} 0 0 1 ${r},${r}` : '') + `v${h - r}Z`
}

function ColonnesBrutes({ categories, series, format = (v) => String(Math.round(v)), empile, hauteur = 220, actif, max: maxImpose, pasEtiquettes, ariaLabel, seuil = PEU, etiquetteMin = -Infinity }: PropsColonnes) {
  const { ref, largeur } = useLargeur()
  const W = Math.max(largeur, 260)
  const H = hauteur
  const m = { haut: 18, droite: 8, bas: 26, gauche: 38 }
  const lw = W - m.gauche - m.droite
  const lh = H - m.haut - m.bas
  const sommes = categories.map((_, i) => series.reduce((s, x) => s + (x.valeurs[i] ?? 0), 0))
  const maxDonnees = empile ? Math.max(0, ...sommes) : Math.max(0, ...series.flatMap((x) => x.valeurs.map((v) => v ?? 0)))
  const p = pas(maxImpose ?? maxDonnees, 4)
  const haut = maxImpose ?? Math.max(p, Math.ceil(maxDonnees / p) * p)
  const y = (v: number) => m.haut + lh - (v / haut) * lh
  const groupe = lw / Math.max(1, categories.length)
  const barre = empile ? groupe * 0.68 : (groupe * 0.8) / series.length
  const etiquettes = !empile && barre >= 26
  const saut = pasEtiquettes ?? Math.max(1, Math.ceil((categories.length * 34) / lw))
  const graduations: number[] = []
  for (let v = 0; v <= haut + 1e-9; v += p) graduations.push(v)

  return (
    <div ref={ref} class="graphique">
      {largeur > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
          {graduations.map((v) => (
            <g key={v}>
              <line x1={m.gauche} x2={W - m.droite} y1={y(v)} y2={y(v)} class="grille" />
              <text x={m.gauche - 6} y={y(v) + 4} class="axe" text-anchor="end">{format(v)}</text>
            </g>
          ))}
          {categories.map((c, i) => {
            const x0 = m.gauche + i * groupe
            const attenue = actif !== undefined && actif !== i
            let pile = 0
            let derniere = -1
            series.forEach((s, j) => { if ((s.valeurs[i] ?? 0) > 0) derniere = j })
            return (
              <g key={c} opacity={attenue ? 0.35 : 1}>
                {series.map((s, j) => {
                  const v = s.valeurs[i]
                  if (v === undefined) return null
                  const n = s.n?.[i]
                  const x = empile ? x0 + (groupe - barre) / 2 : x0 + groupe * 0.1 + j * barre
                  const bas = empile ? pile : 0
                  if (empile) pile += v
                  const yHaut = y(bas + v)
                  const h = Math.max(0, y(bas) - yHaut)
                  const r = Math.min(3, barre / 4)
                  const titre = <title>{`${c}${series.length > 1 ? ' · ' + s.nom : ''} : ${format(v)}${n !== undefined ? ` (${n.toLocaleString('fr-BE')} cas)` : ''}`}</title>
                  const opacite = n !== undefined && n < seuil ? 0.45 : 1
                  return (
                    <g key={s.nom}>
                      <path d={cheminBarre(x + 1, yHaut, Math.max(1, barre - 2), h, r, !empile || j === derniere)} fill={s.couleur} opacity={opacite}>{titre}</path>
                      {etiquettes && v >= etiquetteMin && <text x={x + barre / 2} y={yHaut - 4} class="valeur" text-anchor="middle">{format(v)}</text>}
                    </g>
                  )
                })}
                {i % saut === 0 && <text x={x0 + groupe / 2} y={H - 8} class={'axe' + (actif === i ? ' actif' : '')} text-anchor="middle">{c}</text>}
              </g>
            )
          })}
          <line x1={m.gauche} x2={W - m.droite} y1={y(0)} y2={y(0)} class="base" />
        </svg>
      )}
    </div>
  )
}

export function Legende({ series }: { series: { nom: string; couleur: string }[] }) {
  return (
    <div class="legende-graphique">
      {series.map((s) => <span key={s.nom}><i style={{ background: s.couleur }} />{s.nom}</span>)}
    </div>
  )
}

export interface Ligne {
  cle: string
  libelle: ComponentChildren
  /** Parts empilées (hommes, femmes, inconnus…) */
  parts: number[]
  detail?: ComponentChildren
}

/** Classement en barres horizontales, éventuellement découpées en parts colorées */
export function Classement({ lignes, couleurs, noms }: { lignes: Ligne[]; couleurs: string[]; noms?: string[] }) {
  const max = Math.max(1, ...lignes.map((l) => l.parts.reduce((a, b) => a + b, 0)))
  return (
    <ol class="classement">
      {lignes.map((l, i) => {
        const total = l.parts.reduce((a, b) => a + b, 0)
        return (
          <li key={l.cle}>
            <span class="rang">{i + 1}</span>
            <span class="libelle">{l.libelle}</span>
            <span class="total">{l.detail ?? total.toLocaleString('fr-BE')}</span>
            <span class="piste" title={noms ? l.parts.map((p, j) => `${noms[j]} : ${p}`).join(' · ') : undefined}>
              {l.parts.map((p, j) => p > 0 && <span key={j} style={{ width: `${(p / max) * 100}%`, background: couleurs[j] }} />)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function Choix<T extends string>({ options, valeur, changer, label }: { options: [T, string][]; valeur: T; changer: (v: T) => void; label: string }) {
  return (
    <div class="segments petit" role="radiogroup" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={v} type="button" role="radio" aria-checked={valeur === v} class={valeur === v ? 'actif' : ''} onClick={() => changer(v)}>{t}</button>
      ))}
    </div>
  )
}
