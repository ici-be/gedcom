// Source introuvable : une ligne « Source: introuvable (les registres de 1789 à 1820 ont brûlé en 1914) » dans la note de l'événement.
// Comme pour « Filiation: », le GEDCOM n'a pas de champ pour dire qu'une recherche est close : la note voyage avec l'arbre.

export interface Introuvable {
  /** Ce qui explique le manque, écrit entre parenthèses après la mention */
  cause?: string
}

export const MENTION_INTROUVABLE = 'Source: introuvable'

/** « Source: introuvable », « sources : introuvables », « Acte: introuvable », suivi du reste de la ligne (jusqu'à une balise HTML) */
const MENTION = /\b(?:sources?|actes?)\s*:\s*introuvables?\b([^\n<]*)/gi

/** « (registres brûlés) » → « registres brûlés » ; « , d'après la mairie. » → « d'après la mairie » */
function lireCause(reste: string): string | undefined {
  let c = reste.trim().replace(/^[,;:–—-]\s*/, '')
  if (c.startsWith('(')) {
    // la parenthèse qui ferme la première, en comptant celles qui s'ouvrent dedans
    let n = 0
    let fin = -1
    for (let i = 0; i < c.length; i++) {
      if (c[i] === '(') n++
      else if (c[i] === ')' && --n === 0) { fin = i; break }
    }
    c = fin < 0 ? c.slice(1) : c.slice(1, fin)
  }
  c = c.trim().replace(/[.;,\s]+$/, '')
  return c || undefined
}

export function lireIntrouvable(note: string): Introuvable | undefined {
  if (!/introuvable/i.test(note)) return undefined
  const causes: string[] = []
  let trouve = false
  for (const m of note.matchAll(MENTION)) {
    trouve = true
    const c = lireCause(m[1])
    if (c && !causes.includes(c)) causes.push(c)
  }
  if (!trouve) return undefined
  return causes.length ? { cause: causes.join(' ; ') } : {}
}

/** La note sans la mention ni sa cause, pour le récit */
export function sansMentionIntrouvable(note: string): string {
  return note.replace(MENTION, ' ')
}

/** « source introuvable (registres brûlés en 1914) » */
export function texteIntrouvable(i: Introuvable): string {
  return 'source introuvable' + (i.cause ? ` (${i.cause})` : '')
}
