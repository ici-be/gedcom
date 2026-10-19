// Ce que partagent les feuilles imprimées : les teintes des régions de naissance et l'ajustement des textes.

// Teintes claires, distinctes en case de quelques millimètres, sous un texte noir
export const TEINTES = ['#d9cbe3', '#cbe0c4', '#ecdba8', '#c4dfe0', '#e7c3b3', '#c3d0e6', '#d6dcae', '#efc2c8', '#e3d3bf', '#d3bfa6']
export const AUTRES = '#dcdcd5'
export const INCONNU = '#efefea'
export const GRIS = '#3c4441'

/** Une teinte par région, dans l'ordre donné (les plus fréquentes d'abord) ; les suivantes restent en « autres régions » */
export function couleursRegions(ordre: string[]): Map<string, string> {
  return new Map(ordre.slice(0, TEINTES.length).map((r, i) => [r, TEINTES[i]]))
}

/**
 * Les textes trop longs pour leur case sont rapetissés (textLength n'est pas suivi partout sur un textPath) ;
 * ceux marqués data-texte (métiers) sont plutôt abrégés par « … » quand il faudrait trop les rapetisser.
 */
export function ajuster(svg: SVGSVGElement) {
  // Les textes d'un même groupe (data-groupe) gardent la même taille : celle du plus à l'étroit
  const groupes = new Map<string, { t: SVGTextElement; fs: number; k: number }[]>()
  for (const t of svg.querySelectorAll<SVGTextElement>('text[data-max]')) {
    t.dataset.fs ??= t.getAttribute('font-size') ?? ''
    const fs = Number(t.dataset.fs)
    t.setAttribute('font-size', String(fs))
    const noeud = t.dataset.texte !== undefined ? t.querySelector('tspan')?.firstChild : null
    if (noeud instanceof Text) noeud.data = t.dataset.texte!
    const max = Number(t.dataset.max)
    const long = t.getComputedTextLength()
    const groupe = t.dataset.groupe
    if (groupe !== undefined) {
      if (!groupes.has(groupe)) groupes.set(groupe, [])
      groupes.get(groupe)!.push({ t, fs, k: Math.min(1, max / long) })
      continue
    }
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
  for (const membres of groupes.values()) {
    const k = Math.min(...membres.map((m) => m.k))
    if (k < 1) for (const m of membres) m.t.setAttribute('font-size', (m.fs * k * 0.98).toFixed(2))
  }
}
