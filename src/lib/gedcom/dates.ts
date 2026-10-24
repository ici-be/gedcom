// Dates GEDCOM : « 30 MAY 1982 », « ABT 1750 », « BET 1750 AND 1752 », calendriers julien et républicain.

export type Qualif = '' | 'vers' | 'avant' | 'après' | 'entre' | 'de' | 'jusqu’à' | 'estimé' | 'calculé'

/** `julien` : la date d'origine d'un jour du calendrier julien, converti en grégorien dans les autres champs */
export interface Jour { annee: number; mois?: number; jour?: number; julien?: Jour }

export interface DateGed {
  brute: string
  qualif: Qualif
  debut?: Jour
  fin?: Jour
  /** Clé de tri AAAAMMJJ (0 si la date n'est pas comprise) */
  tri: number
  /** Texte lisible en français */
  texte: string
}

const MOIS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
}
const MOIS_REPUBLICAINS: Record<string, number> = {
  VEND: 1, BRUM: 2, FRIM: 3, NIVO: 4, PLUV: 5, VENT: 6, GERM: 7, FLOR: 8, PRAI: 9, MESS: 10, THER: 11, FRUC: 12, COMP: 13,
}
const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const QUALIFS: Record<string, Qualif> = {
  ABT: 'vers', CAL: 'calculé', EST: 'estimé', BEF: 'avant', AFT: 'après', BET: 'entre', FROM: 'de', TO: 'jusqu’à', INT: '',
}

/** Calendrier républicain → grégorien (an I = 22 septembre 1792 ; années sextiles III, VII, XI, XV). */
function depuisRepublicain(an: number, mois: number, jour: number): Jour {
  let t = Date.UTC(1792, 8, 22)
  for (let a = 1; a < an; a++) t += (a % 4 === 3 ? 366 : 365) * 86400000
  t += ((mois - 1) * 30 + (jour - 1)) * 86400000
  const d = new Date(t)
  return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate() }
}

/** Calendrier julien → grégorien : l'écart (10 jours en 1582, 13 en 1900) vaut s/100 - s/400 - 2, l'année commençant en mars */
function depuisJulien(annee: number, mois: number, jour: number): Jour {
  const a = mois < 3 ? annee - 1 : annee
  const ecart = Math.floor(a / 100) - Math.floor(a / 400) - 2
  const d = new Date(Date.UTC(2000, mois - 1, jour + ecart))
  d.setUTCFullYear(annee, mois - 1, jour + ecart)
  return { annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate(), julien: { annee, mois, jour } }
}

function lireJour(s: string): Jour | undefined {
  let calendrier = 'G'
  s = s.trim().replace(/^@#D(\w+)(?: (\w+))?@\s*/, (_, c: string, c2?: string) => {
    calendrier = c2 ? c + ' ' + c2 : c
    return ''
  })
  const morceaux = s.split(/\s+/).filter(Boolean)
  if (!morceaux.length) return undefined
  const an = morceaux.pop()!.replace(/\/\d+$/, '') // « 1700/01 » : double datation
  if (!/^\d{1,4}$/.test(an)) return undefined
  const annee = Number(an)
  const tableMois = calendrier.startsWith('FRENCH') ? MOIS_REPUBLICAINS : MOIS
  const mois = morceaux.length ? tableMois[morceaux.pop()!.toUpperCase()] : undefined
  if (morceaux.length && mois === undefined) return undefined
  const jour = morceaux.length ? Number(morceaux.pop()) : undefined
  if (morceaux.length || (jour !== undefined && !(jour >= 1 && jour <= 31))) return undefined
  if (calendrier.startsWith('FRENCH')) {
    if (!mois) return { annee: annee + 1791 }
    return depuisRepublicain(annee, mois, jour ?? 1)
  }
  if (calendrier.startsWith('JULIAN') && mois && jour) return depuisJulien(annee, mois, jour)
  return { annee, mois, jour }
}

function cle(j?: Jour): number {
  return j ? j.annee * 10000 + (j.mois ?? 0) * 100 + (j.jour ?? 0) : 0
}

export function texteJour(j: Jour): string {
  if (j.julien) return `${texteJour({ ...j, julien: undefined })} (${texteJour(j.julien)} julien)`
  if (!j.mois) return String(j.annee)
  const m = NOMS_MOIS[j.mois - 1]
  return j.jour ? `${j.jour === 1 ? '1er' : j.jour} ${m} ${j.annee}` : `${m} ${j.annee}`
}

export function lireDate(brute: string): DateGed {
  const s = brute.trim().replace(/^\((.*)\)$/, '$1')
  const vide: DateGed = { brute, qualif: '', tri: 0, texte: s }
  if (!s) return vide

  let m = /^BET\s+(.+?)\s+AND\s+(.+)$/i.exec(s) ?? /^FROM\s+(.+?)\s+TO\s+(.+)$/i.exec(s)
  if (m) {
    const debut = lireJour(m[1])
    const fin = lireJour(m[2])
    if (!debut || !fin) return vide
    const qualif: Qualif = /^BET/i.test(s) ? 'entre' : 'de'
    const lien = qualif === 'entre' ? 'et' : 'à'
    return { brute, qualif, debut, fin, tri: cle(debut), texte: `${qualif} ${texteJour(debut)} ${lien} ${texteJour(fin)}` }
  }

  m = /^(ABT|CAL|EST|BEF|AFT|BET|FROM|TO|INT)\s+(.+)$/i.exec(s)
  const qualif: Qualif = m ? QUALIFS[m[1].toUpperCase()] : ''
  const reste = m ? m[2].replace(/\s*\(.*\)$/, '') : s
  const debut = lireJour(reste)
  if (!debut) return vide
  return { brute, qualif, debut, tri: cle(debut), texte: (qualif ? qualif + ' ' : '') + texteJour(debut) }
}

/** Année principale d'une date (début de l'intervalle), ou undefined */
export function annee(d?: DateGed): number | undefined {
  return d?.debut?.annee
}
