// Récit : une notice généalogique suivie, à la manière des ouvrages de famille. La personne choisie, ses
// descendants en listes numérotées (1., a), i.…), puis ses ancêtres génération par génération, chaque couple
// en une notice : « Philippe Veyckemans [64], musicien, fils de… Né le… à Bruxelles, il y mourut… Il s'était
// marié… avec Thérèse Ternat [65], dentellière, âgée de 27 ans… Le couple a eu… ».
// Ce qui alourdirait le texte part en notes de bas de section : témoins, parrains, domiciles, registres,
// service militaire, autres unions d'un conjoint, baptême, enfant né peu après le mariage, sources.
// Le texte ne dépend que de l'arbre : le même arbre donne toujours le même récit.

import type { Donnees } from './donnees'
import type { Evenement, Famille, Individu } from './gedcom/arbre'
import type { DateGed } from './gedcom/dates'
import { decouperLieu, romain } from './communes'
import { decouperMetiers } from './metiers'
import { etatParents, lienDeParente, parents, type Lien } from './parente'
import { places, type Place } from './eventail'
import { sansMentionIntrouvable } from './introuvable'
import { marquants, periode, ponctuel, quandEvenement, type Vecu } from './evenements'

/** Un morceau de texte : du texte, une personne (lien vers son récit), un numéro Sosa, un appel de note, un lien, un événement historique */
export type Morceau =
  | string
  | { id: string; t: string; gras?: boolean }
  | { sosa: number; ancre: boolean }
  | { appel: number }
  | { url: string; t: string }
  | { evt: string; t: string; type: string }
export type Phrase = Morceau[]
export interface Item { marque: string; blocs: Bloc[] }
/** Une personne dans un petit arbre : nom court, années, numéro Sosa, sexe ; `ligne` : l'enfant par qui passe la lignée */
export interface Case { id: string; t: string; annees: string; sosa?: number; sexe: Individu['sexe']; ligne?: boolean }
/** Un petit arbre : les parents de chacun des deux conjoints, le couple, leurs enfants (les premiers, `reste` en plus) */
export interface PetitArbre { haut: [(Case | null)[], (Case | null)[]]; couple: (Case | null)[]; enfants: Case[]; reste: number }
export type Bloc =
  | { type: 'p'; texte: Phrase; ancres?: number[]; italique?: boolean; figures?: string[] }
  | { type: 'liste'; items: Item[] }
  | { type: 'arbre'; arbre: PetitArbre }
export interface Note { n: number; texte: Phrase }
export interface Partie { numero: string; titre: string; blocs: Bloc[]; notes: Note[] }
export interface Recit { titre: string; parties: Partie[]; ancetres: number; descendants: number }
export interface Options {
  sources?: boolean
  /** Un petit arbre en tête de chaque notice de couple */
  arbres?: boolean
  /** Événements historiques connus par chaque personne (absent : le récit n'en parle pas) */
  evenements?: Map<string, Vecu[]>
}

export const MAX_ASCENDANTS = 8
export const MAX_DESCENDANTS = 5

// ——— Le choix des tournures (rare ici : le style des notices est volontairement régulier) ———

function hacher(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

class Plume {
  private derniers = new Map<string, number>()
  private comptes = new Map<string, number>()
  /** Communes déjà situées (avec leur province) */
  lieux = new Set<string>()
  /** Notes de la partie en cours, numérotées pour tout le récit */
  notes: Note[] = []
  private n = 0
  /** Numéro Sosa des ancêtres, et ceux qui ont leur notice dans le récit */
  sosas = new Map<string, number>()
  notices = new Set<number>()
  descendants = 0
  constructor(private graine: string, readonly d: Donnees, readonly options: Options) {}

  /** Une tournure parmi plusieurs, sans reprendre deux fois de suite la même */
  choisir<T>(cle: string, options: T[]): T {
    const n = (this.comptes.get(cle) ?? 0) + 1
    this.comptes.set(cle, n)
    let i = hacher(`${this.graine}|${cle}|${n}`) % options.length
    if (options.length > 1 && i === this.derniers.get(cle)) i = (i + 1) % options.length
    this.derniers.set(cle, i)
    return options[i]
  }

  /** Un appel de note réunissant ces phrases (rien si elles sont toutes vides) */
  appel(segments: (Phrase | null | undefined)[]): Morceau[] {
    const l = segments.filter((s): s is Phrase => !!s && s.length > 0)
    if (!l.length) return []
    this.n++
    this.notes.push({ n: this.n, texte: joindre(l) })
    return [{ appel: this.n }]
  }

  ind(id?: string): Individu | undefined { return id ? this.d.arbre.individus.get(id) : undefined }
  suivi(ind: Individu) { return this.d.suivis.get(ind.id) }
  famille(id?: string): Famille | undefined { return id ? this.d.arbre.familles.get(id) : undefined }
}

// ——— Petits outils de langue ———

const fem = (ind: Individu | undefined) => ind?.sexe === 'F'
const g = (ind: Individu | undefined, m: string, f: string) => (fem(ind) ? f : m)
const il = (ind: Individu | undefined) => g(ind, 'il', 'elle')
const MOTS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const enLettres = (n: number, f = false) => (n === 1 && f ? 'une' : MOTS[n] ?? String(n))
const ORDINAUX = ['', 'premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième']
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const minuscule = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const prenomUsuel = (ind: Individu) => ind.prenom.split(/\s+/)[0] || ind.prenom || ind.nom || '?'
const nomComplet = (ind: Individu) => [ind.prenom, ind.nom].filter(Boolean).join(' ') || '?'

/** « ménagère » (mère au foyer) ne se comprend plus guère tel quel */
const METIERS_RELUS: [RegExp, string][] = [[/^m[ée]nag[èe]re$/i, 'femme au foyer']]
function metiersDe(ind: Individu): string[] {
  const l = ind.metiers.flatMap(decouperMetiers).map(minuscule).map((m) => METIERS_RELUS.find(([r]) => r.test(m))?.[1] ?? m)
  return [...new Set(l)]
}

function enumerer(l: Morceau[][], et = ' et ', virgule = ', '): Morceau[] {
  const res: Morceau[] = []
  l.forEach((x, i) => { if (i) res.push(i === l.length - 1 ? et : virgule); res.push(...x) })
  return res
}

const estTexte = (m: Morceau | undefined): m is string => typeof m === 'string'
const debutVoyelle = (m: Morceau | undefined) => !!m && typeof m === 'object' && 't' in m && /^[AEIOUYÀÂÉÈÊÎÔÛH]/.test(m.t)

/** Assemble une phrase : morceaux vides ôtés, espaces et ponctuation remis en ordre, élisions, majuscule et point */
function phrase(s: TemplateStringsArray, ...v: (Morceau | Morceau[] | undefined | false | null)[]): Phrase {
  const brut: Morceau[] = []
  s.forEach((t, i) => {
    brut.push(t)
    const x = v[i]
    if (x === undefined || x === false || x === null || x === '') return
    if (Array.isArray(x)) brut.push(...x)
    else brut.push(x)
  })
  const res: Morceau[] = []
  for (const m of brut) {
    if (estTexte(m) && estTexte(res[res.length - 1])) res[res.length - 1] += m
    else res.push(m)
  }
  for (let i = 0; i < res.length; i++) {
    const m = res[i]
    if (!estTexte(m)) continue
    let t = m.replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(').replace(/,\s*([,.;:])/g, '$1')
    if (i === 0) t = t.trimStart()
    if (i === res.length - 1) t = t.trimEnd()
    // Un appel de note se colle au mot qui le précède
    const suivant = res[i + 1]
    if (suivant && typeof suivant === 'object' && 'appel' in suivant) t = t.trimEnd()
    // Élision : « d’environ », « d’Anne-Marie », « qu’il »
    t = t.replace(/(?<![\p{L}’'-])([Dd])e (?=[aeiouyàâéèêîôûAEIOUYÀÂÉÈÊÎÔÛ])/gu, '$1’')
    if (debutVoyelle(suivant)) t = t.replace(/(?<![\p{L}’'-])([Dd])e $/u, '$1’')
    res[i] = t
  }
  if (estTexte(res[0])) res[0] = capitale(res[0])
  const dernier = res[res.length - 1]
  if (estTexte(dernier)) res[res.length - 1] = dernier.replace(/[,;]$/, '')
  const fin = res[res.length - 1]
  if (!estTexte(fin) || !/[.!?:]$/.test(fin)) res.push('.')
  return res.filter((m) => m !== '')
}

/** Des phrases mises bout à bout */
function joindre(l: Phrase[]): Phrase {
  return l.flatMap((ph, i) => (i ? [' ', ...ph] : ph))
}

// ——— Dates, lieux, âges, durées ———

const INCERTAINES = new Set(['avant', 'après', 'entre', 'de', 'jusqu’à'])
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** « le 3 mars 1702 », « en mars 1702 », « en 1702 », « vers 1702 », « avant 1702 », « entre 1700 et 1702 » */
export function quand(dt?: DateGed): string {
  if (!dt?.debut) return ''
  const j = dt.debut
  if (dt.qualif === 'entre' && dt.fin) return `entre ${j.annee} et ${dt.fin.annee}`
  if (dt.qualif === 'avant' || dt.qualif === 'après') return `${dt.qualif} ${j.annee}`
  if (dt.qualif === 'vers' || dt.qualif === 'estimé' || dt.qualif === 'calculé') return `vers ${j.annee}`
  if (j.jour && j.mois) return `le ${j.jour === 1 ? '1er' : j.jour} ${MOIS[j.mois - 1]} ${j.annee}`
  if (j.mois) return `en ${MOIS[j.mois - 1]} ${j.annee}`
  return `en ${j.annee}`
}

/** L'année seule : « 1702 », « v. 1702 » */
function annee(dt?: DateGed): string {
  if (!dt?.debut) return ''
  if (dt.qualif === 'avant' || dt.qualif === 'après') return `${dt.qualif === 'avant' ? 'av.' : 'ap.'} ${dt.debut.annee}`
  return (dt.qualif && dt.qualif !== 'de' ? 'v. ' : '') + dt.debut.annee
}

const commune = (e?: Evenement) => (e?.lieu ? decouperLieu(e.lieu).nom : '')

/** « à Malines (Anvers) » la première fois, « à Malines » ensuite ; jamais de province dans les notes */
function lieu(p: Plume, e?: Evenement, simple = false): string {
  if (!e?.lieu) return ''
  const { nom, contexte } = decouperLieu(e.lieu)
  if (simple || p.lieux.has(nom)) return `à ${nom}`
  p.lieux.add(nom)
  const region = contexte.split(',')[0]?.trim()
  return region && region !== nom ? `à ${nom} (${region})` : `à ${nom}`
}

export interface Age { n: number; approx: boolean }

/** Âge en années entre deux dates, si elles le permettent (approché quand il manque le mois ou que la date est « vers ») */
export function age(a?: DateGed, b?: DateGed): Age | undefined {
  if (!a?.debut || !b?.debut || INCERTAINES.has(a.qualif) || INCERTAINES.has(b.qualif)) return undefined
  let n = b.debut.annee - a.debut.annee
  const precis = !!(a.debut.mois && b.debut.mois)
  if (precis && (b.debut.mois! < a.debut.mois! || (b.debut.mois === a.debut.mois && (b.debut.jour ?? 0) < (a.debut.jour ?? 0)))) n--
  if (n < 0 || n > 110) return undefined
  return { n, approx: !precis || !!a.qualif || !!b.qualif }
}

const ans = (a: Age) => `${a.approx ? 'environ ' : ''}${a.n} an${a.n > 1 ? 's' : ''}`

interface Ecart { jours?: number; mois?: number; approx: boolean }

/** L'écart entre deux dates, au jour près quand elles sont complètes */
function ecart(a?: DateGed, b?: DateGed): Ecart | undefined {
  if (!a?.debut || !b?.debut || INCERTAINES.has(a.qualif) || INCERTAINES.has(b.qualif)) return undefined
  const x = a.debut, y = b.debut
  const approx = !!a.qualif || !!b.qualif
  if (x.jour && x.mois && y.jour && y.mois) {
    const jours = Math.round((Date.UTC(y.annee, y.mois - 1, y.jour) - Date.UTC(x.annee, x.mois - 1, x.jour)) / 86400000)
    const mois = (y.annee - x.annee) * 12 + (y.mois - x.mois) - (y.jour < x.jour ? 1 : 0)
    return jours < 0 ? undefined : { jours, mois, approx }
  }
  if (x.mois && y.mois) {
    const mois = (y.annee - x.annee) * 12 + (y.mois - x.mois)
    return mois < 0 ? undefined : { mois, approx: true }
  }
  const mois = (y.annee - x.annee) * 12
  return mois < 0 ? undefined : { mois, approx: true }
}

/** « à l’âge de 44 ans », « à l’âge de 10 mois », « à l’âge de 32 jours » */
function aLAge(naissance?: DateGed, deces?: DateGed): string {
  const e = ecart(naissance, deces)
  if (!e || e.mois === undefined) return ''
  if (e.jours === 0) return ', le jour même de sa naissance'
  if (e.jours !== undefined && e.jours < 60) return `à l’âge de ${e.jours} jour${e.jours > 1 ? 's' : ''}`
  const env = e.approx ? 'environ ' : ''
  if (e.mois < 24 && e.jours !== undefined) return `à l’âge de ${env}${e.mois} mois`
  const a = age(naissance, deces)
  if (!a || (a.n < 2 && a.approx)) return ''
  return a.approx ? `vers l’âge de ${a.n} ans` : `à l’âge de ${ans(a)}`
}

/** « cinq jours », « trois semaines », « deux mois », « un an » */
function duree(a?: DateGed, b?: DateGed): string {
  const e = ecart(a, b)
  if (!e || e.mois === undefined) return ''
  const dire = (n: number, mot: string, f = false, pluriel = mot + 's') => `${enLettres(n, f)} ${n > 1 ? pluriel : mot}`
  if (e.jours !== undefined) {
    if (e.jours === 0) return ''
    if (e.jours < 14) return dire(e.jours, 'jour')
    if (e.jours < 60) return dire(Math.round(e.jours / 7), 'semaine', true)
  }
  if (e.approx && e.mois < 12) return ''
  if (e.mois < 12 || (e.mois < 24 && e.mois !== 12)) return dire(e.mois, 'mois', false, 'mois')
  return dire(Math.floor(e.mois / 12), 'an')
}

const situe = (e?: Evenement) => !!e && (!!e.date?.debut || !!e.lieu)

/** Une note d'acte débarrassée des liens et de la mise en forme du logiciel */
function nettoyer(t?: string): string {
  if (!t) return ''
  const s = sansMentionIntrouvable(t)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[\[(?:[^\]]*\/)?([^\]/]+)\]\]/g, '$1')
    .replace(/\S*https?:\/\/\S+/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^(annexes?|sources?|voir|lien|liens|image)\s*:?\s*$/i.test(l) && !/^(filiation|signatures?)\s*:/i.test(l))
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
  return s.replace(/[:\s]+$/, '').length > 2 ? s.replace(/[:\s]+$/, '') : ''
}

// ——— Les personnes ———

function personne(ind: Individu, gras = false): Morceau {
  return gras ? { id: ind.id, t: nomComplet(ind), gras } : { id: ind.id, t: nomComplet(ind) }
}

/** Le numéro Sosa entre crochets, pour un ancêtre */
function sosa(p: Plume, ind: Individu): Morceau[] {
  const s = p.sosas.get(ind.id)
  return s ? [' ', { sosa: s, ancre: p.notices.has(s) }] : []
}

/** « (1765–1842) », « (1883) », « († 1842) » */
function annees(p: Plume, ind: Individu): string {
  const s = p.suivi(ind)
  const n = annee(s?.naissance.evenement?.date)
  const m = s?.deces.etat === 'sans-objet' ? '' : annee(s?.deces.evenement?.date)
  if (n && m) return ` (${n}–${m})`
  if (n) return ` (${n})`
  return m ? ` († ${m})` : ''
}

/** Un parent nommé dans une filiation : prénom usuel, nom s'il diffère de celui de l'enfant, numéro Sosa, années */
function parentCite(p: Plume, x: Individu, enfant: Individu): Morceau[] {
  const t = x.nom && x.nom === enfant.nom ? prenomUsuel(x) : [prenomUsuel(x), x.nom].filter(Boolean).join(' ')
  return [{ id: x.id, t }, ...sosa(p, x), annees(p, x)]
}

/** « fils de Philippe [64] (1820–1865) et de Thérèse Ternat [65] (1819–1894) » */
function filiation(p: Plume, ind: Individu): Morceau[] {
  const nomme = (x?: Individu) => (x && /[^?\s]/.test(x.prenom + x.nom) ? x : undefined)
  const { pere: p0, mere: m0 } = parents(p.d.arbre, ind)
  const pere = nomme(p0), mere = nomme(m0)
  const etats = etatParents(p.d.arbre, ind)
  const fils = g(ind, 'fils', 'fille')
  if (pere && mere) return [`${fils} de `, ...parentCite(p, pere, ind), ' et de ', ...parentCite(p, mere, ind)]
  if (pere) return [`${fils} de `, ...parentCite(p, pere, ind), etats.mere === 'inconnu' ? ' et de mère inconnue' : '']
  if (mere) return [`${fils} `, etats.pere === 'inconnu' ? 'de père inconnu et ' : '', 'de ', ...parentCite(p, mere, ind)]
  return []
}

// ——— Ce qui part en note ———

const possessif = (l: Lien) => (l.fem && !/^[aeiouéèh]/i.test(l.terme) ? 'sa' : 'son')
const ROLES: Record<string, [string, string]> = { godp: ['parrain', 'marraine'], godparent: ['parrain', 'marraine'] }

/** Témoins, parrain et marraine d'un acte : nom, âge ce jour-là, parenté avec la personne (ou avec l'un des époux) */
function temoins(p: Plume, e: Evenement, sujet: Individu, epoux?: [Individu | undefined, Individu | undefined]): Phrase[] {
  const parRole = new Map<string, Morceau[][]>()
  for (const t of e.temoins ?? []) {
    const x = p.ind(t.id)
    if (!x) continue
    const rela = t.rela.toLowerCase()
    const role = ROLES[rela] ? ROLES[rela][fem(x) ? 1 : 0] : /witness|t[ée]moin/.test(rela) || !rela ? 'témoin' : minuscule(t.rela)
    const a = age(p.suivi(x)?.naissance.evenement?.date, e.date)
    let lien = ''
    if (epoux) {
      for (const [conj, qui] of [[epoux[0], 'de l’époux'], [epoux[1], 'de l’épouse']] as const) {
        const l = conj ? lienDeParente(p.d.arbre, conj, x, false) : undefined
        if (l) { lien = `${l.terme} ${qui}`; break }
      }
      if (!lien) {
        for (const [conj, qui] of [[epoux[0], 'de l’époux'], [epoux[1], 'de l’épouse']] as const) {
          const l = conj ? lienDeParente(p.d.arbre, conj, x) : undefined
          if (l && l.terme !== 'mari' && l.terme !== 'épouse') { lien = `${l.terme} ${qui}`; break }
        }
      }
    } else {
      const l = lienDeParente(p.d.arbre, sujet, x)
      if (l) lien = `${possessif(l)} ${l.terme}${l.cote ? ` du côté ${l.cote}` : ''}`
    }
    const l = parRole.get(role) ?? []
    l.push([{ id: x.id, t: nomComplet(x) }, a && !a.approx ? `, ${ans(a)}` : '', lien ? `, ${lien}` : ''])
    parRole.set(role, l)
  }
  const res: Phrase[] = []
  const parrains = ['parrain', 'marraine'].filter((r) => parRole.has(r))
  if (parrains.length) {
    res.push(phrase`${enumerer(parrains.map((r) => [`${r} : `, ...enumerer(parRole.get(r)!, ' ; ', ' ; ')]), ' ; ', ' ; ')}`)
  }
  for (const [role, l] of parRole) {
    if (role === 'parrain' || role === 'marraine') continue
    res.push(phrase`${role}${l.length > 1 && role === 'témoin' ? 's' : ''} : ${enumerer(l, ' ; ', ' ; ')}`)
  }
  return res
}

/** Les sources d'un acte, en liens courts (le nom du site) */
function sources(p: Plume, l: string[]): Phrase | null {
  if (!p.options.sources || !l.length) return null
  const m = [...new Set(l)].map((s): Morceau[] => {
    const u = /https?:\/\/(?:www\.)?([^/\s]+)\S*/.exec(s)
    return u ? [{ url: u[0], t: u[1] }] : [s]
  })
  return phrase`Source${m.length > 1 ? 's' : ''} : ${enumerer(m, ' ; ', ' ; ')}`
}

/** Ce qu'un acte apporte en note : sa note, ses témoins, ses sources */
function noteActe(p: Plume, e: Evenement | undefined, sujet: Individu, epoux?: [Individu | undefined, Individu | undefined]): Phrase[] {
  if (!e) return []
  const t = nettoyer(e.note)
  // « Source: introuvable (registres brûlés en 1914) » : dit tel quel, sauf si une source a été trouvée depuis
  const perdu = e.introuvable && !e.sources.length ? phrase`Acte introuvable${e.introuvable.cause ? ` : ${e.introuvable.cause}` : ''}` : null
  return [t ? phrase`${t}` : null, perdu, ...temoins(p, e, sujet, epoux), sources(p, e.sources)].filter((x): x is Phrase => !!x)
}

const ETIQUETTES: Record<string, string> = {
  IMMI: 'Immigration', EMIG: 'Émigration', NATU: 'Naturalisation', GRAD: 'Diplôme', EDUC: 'Études', RETI: 'Retraite',
  CONF: 'Confirmation', FCOM: 'Première communion', ORDN: 'Ordination', WILL: 'Testament', PROB: 'Succession',
  ADOP: 'Adoption', BARM: 'Bar-mitsva', BASM: 'Bat-mitsva', BLES: 'Bénédiction', CHRA: 'Baptême adulte', TITL: 'Titre',
  CENS: 'Recensement',
}
const TYPES: [RegExp, string][] = [[/^award$/i, 'Distinction'], [/^illness$/i, 'Maladie'], [/^deed$/i, 'Acte'], [/^census$/i, 'Recensement']]
const IGNORES = /document à|ancestral file|^alive$|unmarried|^marr|^marriage$|other fact|^misc$/i
const MILITAIRE: [RegExp, string][] = [[/service/i, 'service'], [/mobili/i, 'mobilisation'], [/discharge|lib[ée]r/i, 'libération'], [/distinction|award/i, 'distinction']]

/** Domiciles, registres, service militaire et autres faits d'une personne ou d'un couple, en une note */
function faits(p: Plume, evenements: Evenement[], prefixeDomicile: string): Phrase[] {
  const domiciles = new Map<string, string[]>()
  const registres = new Map<string, Map<string, string[]>>()
  const militaire: string[] = []
  const autres: Phrase[] = []
  for (const e of evenements) {
    if (['BIRT', 'BAPM', 'CHR', 'DEAT', 'BURI', 'CREM', 'OCCU', 'MARR', 'MARB', 'MARC', 'MARL', 'MARS', 'ENGA', 'DIV', 'DIVF', 'ANUL', 'SEP'].includes(e.tag)) continue
    const type = (e.type ?? '').trim()
    if ((e.tag === 'EVEN' || e.tag === 'FACT') && IGNORES.test(type)) continue
    const an = e.date?.debut ? annee(e.date) : ''
    if (e.tag === 'RESI' || /residence|domicile/i.test(type)) {
      const cle = [nettoyer(e.note), commune(e)].filter(Boolean).join(', ')
      if (!cle && !an) continue
      const l = domiciles.get(cle) ?? []
      if (an && !l.includes(an)) l.push(an)
      domiciles.set(cle, l)
    } else if (e.tag === 'MILI' || /milit/i.test(type)) {
      const quoi = MILITAIRE.find(([r]) => r.test(type))?.[1] ?? (e.tag === 'MILI' ? 'service' : minuscule(type))
      militaire.push([quoi, quand(e.date), lieu(p, e, true)].filter(Boolean).join(' '))
    } else if (e.tag === 'CENS' || /registre|recensement/i.test(type)) {
      const etiquette = e.tag === 'CENS' ? 'Recensement' : type
      const m = registres.get(etiquette) ?? new Map<string, string[]>()
      const c = commune(e)
      const l = m.get(c) ?? []
      if (an && !l.includes(an)) l.push(an)
      m.set(c, l)
      registres.set(etiquette, m)
    } else {
      const etiquette = (e.tag === 'EVEN' || e.tag === 'FACT') ? TYPES.find(([r]) => r.test(type))?.[1] ?? type : ETIQUETTES[e.tag] ?? type
      if (!etiquette) continue
      const titre = e.tag === 'TITL' && e.type ? `Titre : ${e.type}` : etiquette
      const note = nettoyer(e.note)
      autres.push(phrase`${titre} ${quand(e.date)} ${lieu(p, e, true)}${note ? ` : ${note}` : ''}`)
    }
  }
  const res: Phrase[] = []
  const avecAnnees = (c: string, l: string[]) => (l.length ? `${c}${c ? ' ' : ''}(${l.join(', ')})` : c)
  if (domiciles.size) res.push(phrase`${prefixeDomicile} : ${[...domiciles].map(([c, l]) => avecAnnees(c, l)).join(' — ')}`)
  if (militaire.length) res.push(phrase`Militaire : ${militaire.join(' ; ')}`)
  for (const [etiquette, m] of registres) res.push(phrase`${etiquette} : ${[...m].map(([c, l]) => avecAnnees(c, l)).join(' — ')}`)
  return [...res, ...autres]
}

/** La note attachée au nom d'une personne : domiciles, registres, militaire, note personnelle courte, sources */
function notePersonne(p: Plume, ind: Individu): Phrase[] {
  const res = faits(p, ind.evenements, 'Domicile')
  const n = ind.note && !/<|\[\[|^(TITLE|HEAD)=/m.test(ind.note) ? nettoyer(ind.note) : ''
  if (n && n.length <= 500) res.push(phrase`${n}`)
  const s = sources(p, ind.sources)
  if (s) res.push(s)
  return res
}

// ——— Naissance, décès ———

const naissanceDe = (p: Plume, ind: Individu) => {
  const e = p.suivi(ind)?.naissance.evenement
  return situe(e) ? e : undefined
}
const decesDe = (p: Plume, ind: Individu) => {
  const s = p.suivi(ind)
  return s?.deces.etat !== 'sans-objet' && situe(s?.deces.evenement) ? s!.deces.evenement : undefined
}
const premier = (ind: Individu, tags: string[]) => ind.evenements.find((e) => tags.includes(e.tag) && situe(e))

/** La note de la naissance : baptême (date, lieu), parrain et marraine, témoins, note et sources */
function noteNaissance(p: Plume, ind: Individu, e: Evenement): Phrase[] {
  const res = noteActe(p, e, ind)
  if (e.tag === 'BIRT') {
    const b = premier(ind, ['BAPM', 'CHR'])
    if (b) {
      const baptise = g(ind, 'Baptisé', 'Baptisée')
      const d = duree(e.date, b.date)
      const memeJour = e.date?.tri && e.date.tri === b.date?.tri && e.date.debut?.jour
      const q = memeJour ? 'le jour même' : d ? `${d} plus tard` : quand(b.date)
      const ailleurs = commune(b) && commune(b) !== commune(e) ? lieu(p, b, true) : ''
      if (q || ailleurs) res.unshift(phrase`${baptise} ${q} ${ailleurs}`)
      res.push(...noteActe(p, b, ind))
    }
  }
  return res
}

/** « Né le 11 novembre 1820 à Bruxelles¹ » (participe, sans sujet) */
function ne(p: Plume, ind: Individu, e: Evenement, simple = false): Morceau[] {
  const v = e.tag === 'BIRT' ? g(ind, 'né', 'née') : g(ind, 'baptisé', 'baptisée')
  return [`${v} ${quand(e.date)} ${lieu(p, e, simple)}`.replace(/\s+/g, ' ').trim(), ...(simple ? [] : p.appel(noteNaissance(p, ind, e)))]
}

interface Fin {
  e: Evenement
  /** Mort dans la commune de naissance */
  meme: boolean
  /** « le 5 juillet 1865 à Bruxelles à l’âge de 44 ans », sans le lieu quand c'est la commune de naissance */
  quoi: Morceau[]
  /** Inhumation ou incinération : participe, lieu, même commune que le décès */
  tombe?: { v: string; L: string; meme: boolean }
}

/** La fin de vie d'une personne : décès (ou, à défaut, inhumation), âge, inhumation, note */
function fin(p: Plume, ind: Individu, simple = false): Fin | null {
  const e = decesDe(p, ind)
  if (!e) return null
  const n = naissanceDe(p, ind)
  const tombe = e.tag === 'DEAT' ? premier(ind, ['BURI', 'CREM']) : undefined
  const notes = simple ? [] : p.appel([...noteActe(p, e, ind), ...(tombe ? noteActe(p, tombe, ind) : [])])
  const meme = e.tag === 'DEAT' && !!commune(e) && commune(e) === commune(n)
  const a = aLAge(n?.date, e.date)
  const quoi: Morceau[] = [`${quand(e.date)} ${meme ? '' : lieu(p, e, simple)}${a && !a.startsWith(',') ? ', ' : ''}${a}`.replace(/\s+/g, ' ').trim(), ...notes]
  const t = tombe && commune(tombe)
    ? { v: tombe.tag === 'CREM' ? g(ind, 'incinéré', 'incinérée') : g(ind, 'inhumé', 'inhumée'), L: lieu(p, tombe, simple), meme: commune(tombe) === commune(e) }
    : undefined
  return { e, meme, quoi, tombe: t }
}

/**
 * Le temps du récit d'une vie : le passé simple des livres de famille pour qui a vécu avant 1900, le passé composé
 * ensuite (« il mourut » sonnerait faux pour un grand-père mort en 2013). Sans date, une vie d'autrefois.
 */
function ancien(p: Plume, ind: Individu): boolean {
  const s = p.suivi(ind)
  const an = s?.deces.evenement?.date?.debut?.annee ?? s?.naissance.evenement?.date?.debut?.annee
  return an === undefined || an < 1900
}

/** Après le sujet : « y mourut le 5 juillet 1865, à l’âge de 44 ans² », « est décédé le… à Uccle… » */
function mort(p: Plume, ind: Individu, f: Fin, vieux = ancien(p, ind)): Morceau[] {
  const fut = vieux ? 'fut' : 'a été'
  if (f.e.tag !== 'DEAT') return [`${fut} ${f.e.tag === 'CREM' ? g(ind, 'incinéré', 'incinérée') : g(ind, 'inhumé', 'inhumée')} `, ...f.quoi]
  const verbe = vieux ? 'mourut' : `est ${g(ind, 'décédé', 'décédée')}`
  // « …, à l’âge de 45 ans, et fut inhumé à Forest »
  const virgule = estTexte(f.quoi[0]) && /âge|jour même/.test(f.quoi[0]) ? ',' : ''
  const t = f.tombe ? (f.tombe.meme ? `${virgule} et y ${fut} ${f.tombe.v}` : `${virgule} et ${fut} ${f.tombe.v} ${f.tombe.L}`) : ''
  return [(f.meme ? 'y ' : '') + verbe + ' ', ...f.quoi, t]
}

/** Après la naissance d'un conjoint : « où elle mourut le… », « , décédée le… à… » */
function mortApposee(p: Plume, ind: Individu, f: Fin): Morceau[] {
  if (f.e.tag !== 'DEAT') return [`, ${f.e.tag === 'CREM' ? g(ind, 'incinéré', 'incinérée') : g(ind, 'inhumé', 'inhumée')} `, ...f.quoi]
  const t = f.tombe ? `, ${f.tombe.v} ${f.tombe.meme ? 'dans la même commune' : f.tombe.L}` : ''
  if (f.meme) return [` où ${il(ind)} ${ancien(p, ind) ? 'mourut' : `est ${g(ind, 'décédé', 'décédée')}`} `, ...f.quoi, t]
  return [`, ${g(ind, 'décédé', 'décédée')} `, ...f.quoi, t]
}

// ——— Unions et enfants ———

interface Union { fam: Famille; conj?: Individu; e?: Evenement; marie: boolean }

/** Les unions d'une personne, dans l'ordre des dates */
function unions(p: Plume, ind: Individu): Union[] {
  const res: Union[] = []
  for (const m of p.suivi(ind)?.mariages ?? []) {
    const fam = p.famille(m.famille)
    if (!fam) continue
    const e = m.evenement
    const libre = !!e && (e.tag === 'EVEN' || e.tag === 'FACT') && /unmarried|union libre|concubin|non mari/i.test(e.type ?? '')
    const marie = !libre && !!e && (situe(e) || e.avere || ['MARR', 'MARB', 'MARC', 'MARL'].includes(e.tag))
    res.push({ fam, conj: p.ind(m.conjoint), e, marie })
  }
  const tri = (u: Union) => u.e?.date?.tri || naissancesTri(p, u.fam) || 99999999
  return res.sort((a, b) => tri(a) - tri(b))
}

function naissancesTri(p: Plume, f: Famille): number {
  const l = enfantsDe(p, f).map((c) => naissanceDe(p, c)?.date?.tri).filter((t): t is number => !!t)
  return l.length ? Math.min(...l) : 0
}

function enfantsDe(p: Plume, f?: Famille): Individu[] {
  if (!f) return []
  const tri = (c: Individu) => naissanceDe(p, c)?.date?.tri || 99999999
  return f.enfants.map((c) => p.ind(c)).filter((c): c is Individu => !!c).sort((a, b) => tri(a) - tri(b))
}

/** « six garçons et une fille », dans l'ordre du premier né */
function compte(l: Individu[]): string {
  const groupes = new Map<string, number>()
  for (const c of l) groupes.set(c.sexe, (groupes.get(c.sexe) ?? 0) + 1)
  const mots: Record<string, [string, string, boolean]> = { M: ['garçon', 'garçons', false], F: ['fille', 'filles', true], '?': ['enfant', 'enfants', false] }
  const parts = [...groupes].map(([s, n]) => `${enLettres(n, mots[s][2])} ${n > 1 ? mots[s][1] : mots[s][0]}`)
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1] : parts[0]
}

/** « Marie-Ange (1979), Corentine (1981) et Bruno Veÿckemans [1] (1982) » : le nom en entier au dernier et à l'enfant de la lignée */
function listeEnfants(p: Plume, l: Individu[], ligne?: string): Morceau[] {
  return enumerer(l.map((c, i) => {
    if (c.id === ligne) return [personne(c, true), ...sosa(p, c), annees(p, c)]
    const entier = i === l.length - 1 || (i > 0 && c.nom !== l[i - 1].nom)
    return [{ id: c.id, t: entier ? nomComplet(c) : c.prenom || nomComplet(c) }, annees(p, c)]
  }))
}

const AUTOUR_DU_MARIAGE: Record<string, string> = { ENGA: 'Fiançailles', MARB: 'Publication des bans', MARC: 'Contrat de mariage', MARL: 'Licence de mariage', MARS: 'Accord avant mariage' }

/** La note d'un mariage : acte, domicile du couple, enfant né peu après, parent mort peu avant, fiançailles, contrat */
function noteMariage(p: Plume, u: Union, mari?: Individu, femme?: Individu): Phrase[] {
  const res = noteActe(p, u.e, (mari ?? femme)!, [mari, femme])
  const d = u.e?.date
  for (const e of u.fam.evenements) {
    if (e === u.e) continue
    const quoi = AUTOUR_DU_MARIAGE[e.tag]
    if (quoi && situe(e)) res.push(phrase`${quoi} ${quand(e.date)} ${lieu(p, e, true)}`)
  }
  res.push(...faits(p, u.fam.evenements, 'Domicile du couple'))
  if (d?.debut?.jour && !d.qualif) {
    const l = enfantsDe(p, u.fam)
    const avant = l.filter((c) => { const t = naissanceDe(p, c)?.date?.tri; return !!t && t < d.tri })
    if (avant.length) {
      res.push(phrase`Le couple avait déjà ${avant.length === 1 ? g(avant[0], 'un fils', 'une fille') : `${enLettres(avant.length)} enfants`} à son mariage`)
    } else {
      const pr = l.map((c) => naissanceDe(p, c)?.date).find((x) => x?.debut?.jour)
      const e = ecart(d, pr)
      if (pr && e?.jours !== undefined && e.jours < 245) res.push(phrase`Un premier enfant naîtra ${duree(d, pr)} plus tard`)
    }
    for (const [x, qui] of [[mari, 'de l’époux'], [femme, 'de l’épouse']] as const) {
      if (!x) continue
      const { pere, mere } = parents(p.d.arbre, x)
      for (const par of [pere, mere]) {
        const dd = par ? decesDe(p, par)?.date : undefined
        const e = ecart(dd, d)
        if (!par || !dd?.debut?.jour || !e?.jours || e.jours > 366) continue
        res.push(phrase`${g(par, 'Le père', 'La mère')} ${qui}, ${{ id: par.id, t: nomComplet(par) }}${annees(p, par)}, était ${g(par, 'décédé', 'décédée')} ${duree(dd, d)} auparavant`)
      }
    }
  }
  return res
}

/** Le conjoint dans la phrase du mariage : nom, métiers, parents, âge, naissance, décès ; ses autres unions en note */
function conjoint(p: Plume, u: Union, ageSujet: Age | undefined, simple: boolean): Morceau[] {
  const c = u.conj!
  const res: Morceau[] = [personne(c, !simple), ...sosa(p, c)]
  if (!simple) res.push(...p.appel([...autresUnions(p, c, u.fam), ...notePersonne(p, c)]))
  const m = metiersDe(c)
  if (m.length) res.push(', ', m.join(', '))
  const f = filiation(p, c)
  if (f.length) res.push(', ', ...f)
  const n = naissanceDe(p, c)
  const a = u.marie ? age(n?.date, u.e?.date) : undefined
  if (a) res.push(a.n === ageSujet?.n && a.approx === ageSujet.approx ? `, ${il(c)} aussi ${g(c, 'âgé', 'âgée')} de ${ans(a)}` : `, ${g(c, 'âgé', 'âgée')} de ${ans(a)}`)
  if (n) res.push(', ', ...ne(p, c, n, simple))
  const fn = fin(p, c, simple)
  if (fn) res.push(...(n ? mortApposee(p, c, fn) : mortApposee(p, c, { ...fn, meme: false })))
  return res
}

/** Le conjoint nommé dans la phrase du mariage : nom, numéro Sosa, note, métiers */
function conjointNomme(p: Plume, u: Union): Morceau[] {
  const c = u.conj!
  const res: Morceau[] = [personne(c, true), ...sosa(p, c), ...p.appel([...autresUnions(p, c, u.fam), ...notePersonne(p, c)])]
  const m = metiersDe(c)
  if (m.length) res.push(', ', m.join(', '), ',')
  return res
}

/** « ; il avait 26 ans, elle 27 », « ; ils avaient tous deux 28 ans » */
function agesEpoux(sujet: Individu, a?: Age, c?: Individu, b?: Age): string {
  if (a && b && c && a.n === b.n && a.approx === b.approx) {
    const toutes = fem(sujet) && fem(c)
    return ` ; ${toutes ? 'elles' : 'ils'} avaient ${toutes ? 'toutes' : 'tous'} deux ${ans(a)}`
  }
  if (a && b && c) return ` ; ${il(sujet)} avait ${ans(a)}, ${il(c)} ${b.approx ? 'environ ' : ''}${b.n}`
  if (a) return ` ; ${il(sujet)} avait alors ${ans(a)}`
  if (b && c) return ` ; ${il(c)} avait ${ans(b)}`
  return ''
}

/**
 * La vie du conjoint, en une phrase après celle du mariage : « Fille de Louis [10] (1903–1979) et d’Aline De Ryck [11]
 * (1909–1970), Elisabeth était née le 2 avril 1930 à Anderlecht et est décédée le 17 juin 2007 à Bruxelles, à l’âge de 77 ans. »
 */
function vieConjoint(p: Plume, c: Individu, vieux: boolean): Phrase | null {
  const f = filiation(p, c)
  const n = naissanceDe(p, c)
  // la naissance avant la fin : les appels de note restent dans l'ordre du texte
  const neM = n ? ne(p, c, n) : null
  const fn = fin(p, c)
  const qui = prenomUsuel(c)
  const avant = f.length ? [...f, ', '] : []
  if (n && neM) {
    const etait = n.tag === 'BIRT' ? 'était' : 'avait été'
    const suite = fn ? [' et ', ...mort(p, c, fn, vieux)] : []
    return phrase`${avant}${qui} ${etait} ${neM}${suite}`
  }
  if (fn) return phrase`${avant}${qui} ${mort(p, c, { ...fn, meme: false }, vieux)}`
  if (f.length) return phrase`${qui} était ${g(c, 'le', 'la')} ${f}`
  return null
}

/** « Ils eurent six filles : », « De cette union naquit un fils, Jean [4] (1930–2013). » */
function annonceEnfants(p: Plume, ind: Individu, conj: Individu | undefined, enf: Individu[], liste: Morceau[] | null, suite = true): Phrase {
  const vieux = ancien(p, enf[0]) || ancien(p, ind)
  const n = compte(enf)
  // Sans liste : les enfants suivent (« : »), sauf quand plusieurs lits les regroupent plus bas
  const fin: Morceau[] = liste ? [enf.length === 1 ? ', ' : ' : ', ...liste] : [suite ? ' :' : '.']
  if (!conj) return phrase`${capitale(il(ind))} ${vieux ? 'eut' : 'a eu'} ${n}${fin}`
  const toutesF = enf.every(fem)
  const tournures = vieux
    ? [`Ils eurent ${n}`, `De cette union ${enf.length > 1 ? 'naquirent' : 'naquit'} ${n}`]
    : [`Ils ont eu ${n}`, `De cette union ${enf.length > 1 ? 'sont' : 'est'} ${toutesF ? 'née' : 'né'}${enf.length > 1 ? 's' : ''} ${n}`]
  return phrase`${p.choisir('enfants', tournures)}${fin}`
}

/** En note : les autres unions d'un conjoint (« Thérèse s’était mariée une seconde fois… ») */
function autresUnions(p: Plume, c: Individu, fam: Famille): Phrase[] {
  const l = unions(p, c)
  if (l.length < 2) return []
  const ici = l.findIndex((u) => u.fam.id === fam.id)
  return l.flatMap((u, i) => {
    if (i === ici || !u.conj) return []
    const rang = l.length === 2 ? (i < ici ? 'une première fois' : 'une seconde fois') : `une ${i === 0 ? 'première' : ORDINAUX[i + 1]} fois`
    const a = age(naissanceDe(p, c)?.date, u.e?.date)
    const ph = u.marie
      ? phrase`${prenomUsuel(c)} s’était ${g(c, 'marié', 'mariée')} ${rang} ${quand(u.e?.date)} ${lieu(p, u.e, true)}${a ? `, alors qu’${il(c)} avait ${ans(a)}` : ''}, avec ${conjoint(p, u, a, true)}`
      : phrase`${prenomUsuel(c)} a aussi partagé la vie de ${conjoint(p, u, undefined, true)}`
    const enf = enfantsDe(p, u.fam)
    return enf.length ? [ph, phrase`Le couple a eu ${compte(enf)} : ${listeEnfants(p, enf)}`] : [ph]
  })
}

// ——— Les événements historiques ———

/** Le verbe de l'événement, au singulier et au pluriel (« les bombardements de Milan… commencèrent ») */
const VERBES_EVT: Record<string, [string, string]> = {
  bataille: ['se livra', 'se livrèrent'], incendie: ['éclata', 'éclatèrent'], explosion: ['se produisit', 'se produisirent'],
  inondation: ['survint', 'survinrent'], seisme: ['survint', 'survinrent'],
}

/** « alors qu’il avait 24 ans » ; `qui` : « il », « elle » ou un prénom */
function alorsQue(qui: string, age?: number): string {
  if (age === undefined) return ''
  const que = /^[aeiouyhàâéèêîôû]/i.test(qui) ? 'qu’' : 'que '
  return age < 1 ? `, alors ${que}${qui} n’avait pas un an,` : `, alors ${que}${qui} avait ${age} an${age > 1 ? 's' : ''},`
}

/**
 * Ce qu'une personne et ses conjoints ont connu : chaque bataille, siège ou incendie en une phrase
 * (« Le 18 juin 1815, alors qu’il avait 24 ans, la bataille de Waterloo se livra à 4 km de Waterloo, où il vivait. »),
 * épidémies, guerres et régimes ensemble (« Il connut aussi la Révolution française (1789-1799)… »).
 * Un conjoint n'a que ce que la personne n'a pas connu elle-même.
 */
function evenementsVecus(p: Plume, ind: Individu, conjoints: Individu[]): Phrase[] {
  const toutes = p.options.evenements
  if (!toutes) return []
  const res: Phrase[] = []
  const siens = new Set((toutes.get(ind.id) ?? []).map((v) => v.ev.id))
  for (const x of [ind, ...conjoints]) {
    const l = marquants((toutes.get(x.id) ?? []).filter((v) => x === ind || !siens.has(v.ev.id)))
    if (!l.length) continue
    const nomme = x !== ind
    let premier = true
    const sujet = () => { const s = nomme && premier ? prenomUsuel(x) : il(x); premier = false; return s }
    for (const v of l.filter((v) => ponctuel(v.ev))) {
      const evt: Morceau = { evt: v.ev.id, t: v.ev.t, type: v.ev.type }
      const [un, plusieurs] = v.ev.f && v.ev.f !== v.ev.d ? ['commença', 'commencèrent'] : VERBES_EVT[v.ev.type] ?? ['eut lieu', 'eurent lieu']
      const verbe = v.ev.t.startsWith('les ') ? plusieurs : un
      const qui = sujet()
      const commune = decouperLieu(v.lieu).nom
      const ou = `${(v.km ?? 0) < 3 ? `à ${commune}` : `à ${Math.round(v.km!)} km de ${commune}`}, où ${il(x)} vivait${v.probable ? ' sans doute' : ''}`
      res.push(phrase`${quandEvenement(v.ev)}${alorsQue(qui, v.age)} ${evt} ${verbe} ${ou}`)
    }
    const etendus = l.filter((v) => !ponctuel(v.ev))
    if (etendus.length) {
      const items = etendus.map((v): Morceau[] => [{ evt: v.ev.id, t: v.ev.t, type: v.ev.type }, /\d{4}/.test(v.ev.t) ? '' : ` (${periode(v.ev)})`])
      const verbe = p.choisir('connut', ['connut', 'vécut', 'traversa'])
      const doute = etendus.every((v) => v.probable) ? ' sans doute' : ''
      res.push(phrase`${capitale(sujet())} ${verbe}${doute}${etendus.length < l.length ? ' aussi' : ''} ${enumerer(items)}`)
    }
  }
  return res
}

// ——— Les notices ———

interface Contexte {
  /** Générations de descendants encore à détailler en listes (0 : enfants cités en une ligne) */
  profondeur: number
  /** Rang d'imbrication des listes (1., a), i.…) */
  niveau: number
  /** Donner les parents dans la notice */
  filiation: boolean
  /** L'enfant de la lignée, mis en gras dans la liste des enfants */
  ligne?: string
  ancres?: number[]
}

const LETTRES = 'abcdefghijklmnopqrstuvwxyz'
const GRECQUES = 'αβγδεζηθικλμνξοπρστυφχψω'
function marque(niveau: number, i: number): string {
  switch (niveau % 5) {
    case 0: return `${i + 1}.`
    case 1: return `${LETTRES[i] ?? i + 1})`
    case 2: return `${romain(i + 1).toLowerCase()}.`
    case 3: return `${LETTRES[i]?.toUpperCase() ?? i + 1}.`
    default: return `${GRECQUES[i] ?? i + 1})`
  }
}
const LITS = ['premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième']

/** La notice d'une personne : en-tête, vie, unions, enfants (en ligne ou en liste détaillée) */
function notice(p: Plume, ind: Individu, ctx: Contexte): Bloc[] {
  const blocs: Bloc[] = []
  // En-tête : « Philippe Isidore Veyckemans [64], musicien¹, fils de… »
  const tete: Morceau[] = [personne(ind, true), ...sosa(p, ind)]
  const m = metiersDe(ind)
  const appel = p.appel(notePersonne(p, ind))
  if (m.length) tete.push(', ', m.join(', '), ...appel)
  else tete.push(...appel)
  const f = ctx.filiation ? filiation(p, ind) : []
  if (f.length) tete.push(', ', ...f)
  // Vie : « Né le… à…, il y mourut le… à l’âge de… » ; sans filiation, rattachée au nom : « Louis Martin, né le…, y mourut… »
  const n = naissanceDe(p, ind)
  const neM = n ? ne(p, ind, n) : null
  const fn = fin(p, ind)
  let participe: Morceau[] | null = null
  const phrases: Phrase[] = []
  if (!f.length && (neM || fn)) {
    if (neM && fn) phrases.push(phrase`${tete}, ${neM}, ${mort(p, ind, fn)}`)
    else if (neM) phrases.push(phrase`${tete}, ${neM}`)
    else phrases.push(phrase`${tete}${m.length ? ', ' : ' '}${mort(p, ind, { ...fn!, meme: false })}`)
  } else {
    phrases.push(phrase`${tete}`)
    if (neM && fn) phrases.push(phrase`${neM}, ${il(ind)} ${mort(p, ind, fn)}`)
    else if (neM) participe = neM
    else if (fn) phrases.push(phrase`${il(ind)} ${mort(p, ind, { ...fn, meme: false })}`)
  }
  const decede = !!fn
  // Unions
  const us = unions(p, ind)
  const maries = us.filter((u) => u.marie && u.conj)
  const paragraphes: Phrase[][] = [phrases]
  let precedent: Union | undefined
  us.forEach((u, i) => {
    const courant = i === 0 ? phrases : []
    if (i > 0) paragraphes.push(courant)
    const enf = enfantsDe(p, u.fam)
    if (u.conj) {
      const aS = age(n?.date, u.e?.date)
      const k = maries.indexOf(u)
      const rang = u.marie && maries.length > 1 ? ` en ${k === 0 ? 'premières' : k === 1 ? 'secondes' : ORDINAUX[k + 1] + 's'} noces` : ''
      // Remarié après un veuvage
      const morte = precedent?.conj ? decesDe(p, precedent.conj)?.date : undefined
      const veuvage = morte && u.e?.date && morte.tri && u.e.date.tri > morte.tri ? duree(morte, u.e.date) : ''
      // « Il avait épousé Marie Dubois, femme au foyer, le 6 mai 1846 à Bruxelles² ; il avait 26 ans, elle 27. »
      const aux = decede ? 'avait' : 'a'
      const verbe = u.marie ? `${aux} épousé${rang}` : `${aux} partagé la vie de`
      const nomme = conjointNomme(p, u)
      const acte = u.marie ? p.appel(noteMariage(p, u, fem(ind) ? u.conj : ind, fem(ind) ? ind : u.conj)) : []
      const aC = u.marie ? age(naissanceDe(p, u.conj)?.date, u.e?.date) : undefined
      const corps: Morceau[] = [
        `${verbe} `, ...nomme, ` ${quand(u.e?.date)} ${u.marie ? lieu(p, u.e) : ''}`, ...acte,
        u.marie ? agesEpoux(ind, aS, u.conj, aC) : '',
      ]
      const debut = veuvage ? `après ${veuvage} de veuvage, ` : ''
      if (i === 0 && participe) { courant.push(phrase`${participe}, ${debut}${il(ind)} ${corps}`); participe = null }
      else courant.push(phrase`${debut}${il(ind)} ${corps}`)
      const vie = vieConjoint(p, u.conj, ancien(p, ind))
      if (vie) courant.push(vie)
      const div = u.fam.evenements.find((e) => ['DIV', 'DIVF', 'ANUL', 'SEP'].includes(e.tag))
      if (div) {
        const quoi = div.tag === 'ANUL' ? 'Leur mariage a été annulé' : div.tag === 'SEP' ? 'Ils se sont séparés' : 'Ils ont divorcé'
        courant.push(phrase`${quoi} ${quand(div.date)}`)
      }
    } else if (i === 0 && participe) {
      courant.push(phrase`${il(ind)} est ${participe}`)
      participe = null
    }
    if (enf.length) courant.push(annonceEnfants(p, ind, u.conj, enf, ctx.profondeur > 0 ? null : listeEnfants(p, enf, ctx.ligne), us.length < 2))
    precedent = u
  })
  if (participe) phrases.push(phrase`${il(ind)} est ${participe}`)
  // Les événements historiques, à la fin de la notice (avant l'annonce des enfants détaillés en liste)
  const histoire = evenementsVecus(p, ind, maries.map((u) => u.conj!))
  if (histoire.length) {
    const l = paragraphes[paragraphes.length - 1]
    const derniere = l[l.length - 1]
    const fin = derniere?.[derniere.length - 1]
    l.splice(ctx.profondeur > 0 && estTexte(fin) && fin.endsWith(':') ? l.length - 1 : l.length, 0, ...histoire)
  }
  paragraphes.forEach((l, i) => {
    if (!l.length) return
    // Les personnes présentées dans le paragraphe, pour leurs photos : la personne et son conjoint de cette union
    const figures = [i === 0 ? ind : undefined, us[i]?.conj].filter((x): x is Individu => !!x?.photo).map((x) => x.id)
    blocs.push({ type: 'p', texte: joindre(l), ...(i === 0 && ctx.ancres ? { ancres: ctx.ancres } : {}), ...(figures.length ? { figures } : {}) })
  })

  // Descendants détaillés
  if (ctx.profondeur > 0) {
    const avecEnfants = us.filter((u) => enfantsDe(p, u.fam).length)
    const lits = us.length > 1 && avecEnfants.length > 0
    us.forEach((u, i) => {
      const enf = enfantsDe(p, u.fam)
      if (lits) blocs.push({ type: 'p', italique: true, texte: [`Du ${us.length === 2 && i === 1 ? 'second' : LITS[i] ?? `${i + 1}e`} lit : ${enf.length ? '' : 'sans postérité'}`.trimEnd()] })
      if (!enf.length) return
      p.descendants += enf.length
      blocs.push({
        type: 'liste',
        items: enf.map((c, j) => ({ marque: marque(ctx.niveau, j), blocs: notice(p, c, { profondeur: ctx.profondeur - 1, niveau: ctx.niveau + 1, filiation: false }) })),
      })
    })
  }
  return blocs
}

// ——— Les petits arbres ———

const ENFANTS_MAX = 8

function caseDe(p: Plume, x: Individu | undefined, ligne?: string): Case | null {
  if (!x) return null
  const t = [prenomUsuel(x), x.nom].filter(Boolean).join(' ') || '?'
  const s = p.sosas.get(x.id)
  return { id: x.id, t, annees: annees(p, x).replace(/^ \(|\)$/g, ''), sexe: x.sexe, ...(s ? { sosa: s } : {}), ...(x.id === ligne ? { ligne: true } : {}) }
}

/** Le couple (l'homme à gauche), les parents de chacun au-dessus, les enfants de cette union en dessous */
function arbreCouple(p: Plume, a: Individu | undefined, b: Individu | undefined, fam: Famille | undefined, ligne?: string): Bloc {
  const [h, f] = fem(a) && b ? [b, a] : [a, b]
  const haut = [h, f].map((x) => {
    if (!x) return []
    const { pere, mere } = parents(p.d.arbre, x)
    return [caseDe(p, pere), caseDe(p, mere)]
  }) as PetitArbre['haut']
  const enf = enfantsDe(p, fam)
  return {
    type: 'arbre',
    arbre: {
      haut,
      couple: b ? [caseDe(p, h), caseDe(p, f)] : [caseDe(p, a)],
      enfants: enf.slice(0, ENFANTS_MAX).map((c) => caseDe(p, c, ligne)!),
      reste: Math.max(0, enf.length - ENFANTS_MAX),
    },
  }
}

/** Le couple d'ancêtres des places 2k et 2k+1, en une notice menée par le père (ou la mère s'il est inconnu) */
function noticeCouple(p: Plume, pl: Place[], k: number): Bloc[] {
  const enfant = pl[k]?.ind
  const H = pl[2 * k], F = pl[2 * k + 1]
  const h = H?.ind, f = F?.ind
  if (!enfant || pl[k].dejaVu || (!h && !f)) return []
  if ((h && H.dejaVu) || (f && F.dejaVu)) {
    const qui = [h && [personne(h, true), ' ', { sosa: 2 * k, ancre: false }], f && [personne(f, true), ' ', { sosa: 2 * k + 1, ancre: false }]].filter(Boolean) as Morceau[][]
    const deja = [H.dejaVu, F.dejaVu].filter((x): x is number => !!x)
    const renvois = enumerer(deja.map((s) => [{ sosa: s, ancre: p.notices.has(s) }]))
    return [{ type: 'p', ancres: [2 * k, 2 * k + 1], texte: phrase`${enumerer(qui)}, ${qui.length > 1 ? 'déjà présentés' : g(h ?? f, 'déjà présenté', 'déjà présentée')} plus haut : voir ${renvois}` }]
  }
  const tete = h ?? f!
  const blocs = notice(p, tete, { profondeur: 0, niveau: 0, filiation: true, ligne: enfant.id, ancres: [2 * k, 2 * k + 1] })
  return p.options.arbres ? [arbreCouple(p, h, f, p.famille(enfant.famc[0]), enfant.id), ...blocs] : blocs
}

const TITRES_ASC = ['Ses parents', 'Ses grands-parents', 'Ses arrière-grands-parents', 'Ses trisaïeuls']
const titreAsc = (n: number) => TITRES_ASC[n - 1] ?? `${capitale(ORDINAUX[n + 1] ?? n + 1 + 'e')} génération`

/** Le récit complet : la personne et `descendants` générations de descendants, puis `ascendants` générations d'ancêtres */
export function recit(d: Donnees, id: string, ascendants: number, descendants: number, options: Options = {}): Recit | null {
  const ind = d.arbre.individus.get(id)
  if (!ind) return null
  const p = new Plume(id, d, options)
  const asc = Math.min(Math.max(0, ascendants), MAX_ASCENDANTS)
  const desc = Math.min(Math.max(0, descendants), MAX_DESCENDANTS)
  // Les numéros Sosa jusqu'à la génération au-dessus de la dernière racontée (pour les « fils de… »)
  const pl = places(d.arbre, id, asc + 2)
  for (let s = 1; s < pl.length; s++) {
    const x = pl[s]?.ind
    if (x && !pl[s].dejaVu && !p.sosas.has(x.id)) p.sosas.set(x.id, s)
  }
  if (asc === 0) p.sosas.clear()
  for (let s = 1; s < 2 ** (asc + 1); s++) if (pl[s]?.ind && !pl[s].dejaVu) p.notices.add(s)

  const titre = nomComplet(ind)
  const parties: Partie[] = []
  const blocs = notice(p, ind, { profondeur: desc, niveau: 0, filiation: true, ancres: [1] })
  if (options.arbres) {
    const u = unions(p, ind).find((x) => x.conj) ?? unions(p, ind)[0]
    blocs.unshift(arbreCouple(p, ind, u?.conj, u?.fam))
  }
  parties.push({ numero: 'I', titre, blocs, notes: p.notes })

  let nbAnc = 0
  for (let gen = 1; gen <= asc; gen++) {
    p.notes = []
    const blocs: Bloc[] = []
    for (let k = 2 ** (gen - 1); k < 2 ** gen; k++) {
      blocs.push(...noticeCouple(p, pl, k))
      for (const s of [2 * k, 2 * k + 1]) if (pl[s]?.ind && !pl[s].dejaVu) nbAnc++
    }
    if (!blocs.length) break
    parties.push({ numero: romain(gen + 1), titre: titreAsc(gen), blocs, notes: p.notes })
  }
  return { titre, parties, ancetres: nbAnc, descendants: p.descendants }
}

// ——— Le texte brut (pour le copier) ———

const EXPOSANTS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const exposant = (n: number) => String(n).split('').map((c) => EXPOSANTS[Number(c)]).join('')

export function texteMorceaux(l: Phrase): string {
  return l.map((m) => (typeof m === 'string' ? m : 'appel' in m ? exposant(m.appel) : 'sosa' in m ? `[${m.sosa}]` : m.t)).join('')
}

function texteBlocs(blocs: Bloc[], retrait: string): string[] {
  return blocs.flatMap((b) => {
    if (b.type === 'arbre') return []
    if (b.type === 'p') return [retrait + texteMorceaux(b.texte)]
    return b.items.flatMap((it) => {
      const [premier, ...reste] = texteBlocs(it.blocs, retrait + '    ')
      return [`${retrait}${it.marque} ${(premier ?? '').trimStart()}`, ...reste]
    })
  })
}

/** Le récit en texte brut, notes à la fin de chaque partie */
export function texteBrut(r: Recit): string {
  return r.parties.map((pt) => {
    const l = [`${pt.numero}. ${pt.titre}`, ...texteBlocs(pt.blocs, '')]
    if (pt.notes.length) l.push('———', pt.notes.map((n) => `${n.n}. ${texteMorceaux(n.texte)}`).join('\n'))
    return l.join('\n\n')
  }).join('\n\n\n')
}
