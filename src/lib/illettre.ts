// Illettré : une ligne « Signature: illettré (a déclaré ne savoir signer, mariage 1820) » dans la note de la personne.
// Comme pour « Filiation: », le GEDCOM n'a pas de champ pour cela : la note voyage avec l'arbre.
// Sert à ne plus chercher la signature de quelqu'un qui ne savait pas écrire.

export interface Illettre {
  /** Ce qui l'établit, écrit après la mention (« d'après l'acte de mariage, Ath 1820 ») */
  precision?: string
}

export interface MentionIllettre { mot: string; sens: string }

export const MENTIONS_ILLETTRE: MentionIllettre[] = [
  { mot: 'Signature: illettré', sens: 'Un homme qui ne savait pas écrire.' },
  { mot: 'Signature: illettrée', sens: 'Une femme qui ne savait pas écrire.' },
  { mot: 'Signature: ne sait pas signer (acte de mariage, Ath 1820)', sens: 'Avec l’acte où il est dit « a déclaré ne savoir signer ».' },
  { mot: 'Signature: une croix (acte de baptême de son fils, 1832)', sens: 'Il a tracé une marque au lieu de signer.' },
]

/** Le texte sans accents ni majuscules, de même longueur (pour garder les positions dans la note d'origine) */
function simple(t: string): string {
  return t.split('').map((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c).join('')
}

/** « Signature: illettré », « signature : ne savait pas signer », « Signature: une croix »…, suivi du reste de la ligne (jusqu'à une balise HTML) */
const MENTION = /\bsignatures?\s*:\s*(?:illettre(?:e|s|es)?|analphabetes?|ne\s+(?:sa(?:it|vait)|savaient|savent)\s+(?:pas\s+)?(?:signer|ecrire)|une\s+croix|une\s+marque)\b([^\n<]*)/g

function lirePrecision(reste: string): string | undefined {
  let p = reste.trim().replace(/^[,;:–—-]\s*/, '')
  if (p.startsWith('(') && p.endsWith(')')) p = p.slice(1, -1)
  p = p.trim().replace(/[.;,\s]+$/, '')
  return p || undefined
}

export function lireIllettre(note: string): Illettre | undefined {
  const texte = simple(note)
  if (!texte.includes('signature')) return undefined
  const precisions: string[] = []
  let trouve = false
  for (const m of texte.matchAll(MENTION)) {
    trouve = true
    // la précision dans la graphie d'origine
    const debut = m.index! + m[0].length - m[1].length
    const p = lirePrecision(note.slice(debut, m.index! + m[0].length))
    if (p && !precisions.includes(p)) precisions.push(p)
  }
  if (!trouve) return undefined
  return precisions.length ? { precision: precisions.join(' ; ') } : {}
}
