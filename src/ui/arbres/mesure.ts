// Largeur d'un texte de la feuille avant de le dessiner, pour choisir où couper les lignes.
// Le canevas mesure avec les polices de la feuille une fois chargées ; ajuster() rattrape les écarts.

export type Police = 'titre' | 'prenom' | 'nom' | 'texte'

const POLICES: Record<Police, [string, number]> = {
  titre: ['500 {}px Fraunces, Georgia, serif', 0],
  prenom: ['500 {}px Fraunces, Georgia, serif', 0],
  nom: ['600 {}px "Fira Sans Condensed", "Arial Narrow", sans-serif', 0.04],
  texte: ['400 {}px "Fira Sans Condensed", "Arial Narrow", sans-serif', 0],
}

let ctx: CanvasRenderingContext2D | null | undefined

export function largeur(texte: string, fs: number, police: Police = 'texte'): number {
  if (ctx === undefined) {
    try { ctx = document.createElement('canvas').getContext('2d') } catch { ctx = null }
  }
  const [font, espacement] = POLICES[police]
  if (!ctx) return texte.length * fs * (police === 'texte' ? 0.42 : 0.52)
  ctx.font = font.replace('{}', String(fs))
  return ctx.measureText(texte).width + texte.length * espacement * fs
}

/** Charge les polices de la feuille (le canevas ne les réclame pas lui-même) */
export function chargerPolices(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  return Promise.all(Object.values(POLICES).map(([f]) => document.fonts.load(f.replace('{}', '20')))).catch(() => {})
}
