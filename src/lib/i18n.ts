// Langues de la page d'impression et des arbres imprimables : le texte français sert de clé, les dictionnaires
// anglais et néerlandais le traduisent ; sans traduction, le français s'affiche.
//
// t('Texte français')                  → le texte dans la langue courante
// t('{n} frère{n?|s}', { n })          → {n} est remplacé ; {n?singulier|pluriel} choisit selon n
// T('Texte français')                  → le texte tel quel, pour marquer une donnée à traduire plus tard avec t(donnée)

import { EN } from './langues/en'
import { NL } from './langues/nl'

export type Langue = 'fr' | 'en' | 'nl'

export const LANGUES: { id: Langue; court: string; nom: string; locale: string }[] = [
  { id: 'fr', court: 'FR', nom: 'Français', locale: 'fr-BE' },
  { id: 'en', court: 'EN', nom: 'English', locale: 'en-GB' },
  { id: 'nl', court: 'NL', nom: 'Nederlands', locale: 'nl-BE' },
]

const DICTIONNAIRES: Record<Langue, Record<string, string>> = { fr: {}, en: EN, nl: NL }

let courante: Langue = 'fr'

export function langue(): Langue { return courante }
export function definirLangue(l: Langue) { courante = l }

/** « fr-BE », « en-GB » ou « nl-BE » : pour les nombres, les dates et les noms de pays */
export function locale(): string { return LANGUES.find((l) => l.id === courante)!.locale }

export function estLangue(v: unknown): v is Langue { return v === 'fr' || v === 'en' || v === 'nl' }

/** La langue du navigateur parmi les nôtres, sinon le français */
export function langueDuNavigateur(): Langue {
  const nav = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  for (const l of nav) {
    const court = (l ?? '').slice(0, 2).toLowerCase()
    if (estLangue(court)) return court
  }
  return 'fr'
}

export function T(fr: string): string { return fr }

/** Les espaces insécables d'un texte ne comptent pas dans la clé : « a : b » et « a\u202f: b » sont la même phrase */
const cle = (fr: string) => fr.replace(/[\u00a0\u202f]/g, ' ')

/** Espace fine insécable avant les deux-points et le point-virgule, comme dans tous les textes français du site */
const typographieFr = (s: string) => s.replace(/[ \u00a0]([:;])/g, '\u202f$1')

export function t(fr: string, params?: Record<string, string | number>): string {
  let s = courante === 'fr' ? typographieFr(fr) : DICTIONNAIRES[courante][cle(fr)] ?? typographieFr(fr)
  if (!params) return s
  // {n?singulier|pluriel} : le singulier pour 0 et 1 en français, pour 1 seulement ailleurs
  s = s.replace(/\{(\w+)\?([^|}]*)\|([^}]*)\}/g, (_m, nom: string, un: string, plusieurs: string) => {
    const n = Number(params[nom])
    return (courante === 'fr' ? n < 2 : n === 1) ? un : plusieurs
  })
  return s.replace(/\{(\w+)\}/g, (m, nom: string) => (nom in params ? String(params[nom]) : m))
}
