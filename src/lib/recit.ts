// Récit : un texte suivi sur une personne, ses ancêtres et ses descendants, tiré des seuls faits de l'arbre
// (naissances ou baptêmes, métiers, mariages, enfants, décès ou inhumations, lieux et âges).
// Chaque fait se dit de plusieurs façons ; le choix tourne sans reprendre deux fois de suite la même tournure,
// et dépend seulement de la personne racontée : le même arbre donne toujours le même texte.

import type { Donnees } from './donnees'
import type { Evenement, Famille, Individu } from './gedcom/arbre'
import type { DateGed } from './gedcom/dates'
import { decouperLieu } from './communes'
import { decouperMetiers } from './metiers'
import { etatParents, parents } from './parente'
import { places, type Place } from './eventail'
import type { Fait } from './suivi'

/** Un morceau de texte, ou le nom d'une personne (pour en faire un lien) */
export type Morceau = string | { id: string; t: string }
export type Phrase = Morceau[]
export interface Partie { titre: string; paragraphes: Phrase[] }
export interface Recit { titre: string; parties: Partie[]; ancetres: number; descendants: number }

export const MAX_ASCENDANTS = 8
export const MAX_DESCENDANTS = 5
/** Au-delà, les couples d'ancêtres sont résumés en quelques phrases */
const ASC_DETAILLES = 3

// ——— Le choix des tournures ———

function hacher(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

type Option<T> = (() => T) | false

/** L'état de la rédaction : tournures déjà prises, personnes et lieux déjà présentés */
class Plume {
  private derniers = new Map<string, number>()
  private comptes = new Map<string, number>()
  /** Personnes déjà nommées en entier */
  vus = new Set<string>()
  /** Communes déjà situées (avec leur province) */
  lieux = new Set<string>()
  /** Dans le paragraphe en cours : la dernière commune citée et le sujet de la dernière phrase */
  dernierLieu?: string
  sujet?: string
  constructor(private graine: string, readonly d: Donnees) {}

  /** Une tournure parmi celles proposées ; chacune est une fonction, seule la retenue est écrite */
  choisir<T>(cle: string, options: Option<T>[]): T {
    const l = options.filter((o): o is () => T => o !== false)
    const n = (this.comptes.get(cle) ?? 0) + 1
    this.comptes.set(cle, n)
    let i = hacher(`${this.graine}|${cle}|${n}`) % l.length
    if (l.length > 1 && i === this.derniers.get(cle)) i = (i + 1) % l.length
    this.derniers.set(cle, i)
    const res = l[i]()
    if (Array.isArray(res) && typeof res[0] === 'string') this.debut = res[0]
    return res
  }
  /** Début de la dernière phrase tournée, pour ne pas commencer deux phrases de suite pareil */
  debut = ''

  paragraphe() { this.dernierLieu = undefined; this.sujet = undefined }
  ind(id?: string): Individu | undefined { return id ? this.d.arbre.individus.get(id) : undefined }
  suivi(ind: Individu) { return this.d.suivis.get(ind.id) }
  famille(id?: string): Famille | undefined { return id ? this.d.arbre.familles.get(id) : undefined }
}

// ——— Petits outils de langue ———

const fem = (ind: Individu | undefined) => ind?.sexe === 'F'
const g = (ind: Individu | undefined, m: string, f: string) => (fem(ind) ? f : m)
const il = (ind: Individu | undefined) => g(ind, 'il', 'elle')
const MOTS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const enLettres = (n: number) => MOTS[n] ?? String(n)
const ORDINAUX = ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième']
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const minuscule = (s: string) => (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const prenomUsuel = (ind: Individu) => ind.prenom.split(/\s+/)[0] || ind.prenom || ind.nom || '?'
const metiersDe = (ind: Individu) => [...new Set(ind.metiers.flatMap(decouperMetiers).map(minuscule))]

function enumerer(l: Morceau[][], et = ' et '): Morceau[] {
  const res: Morceau[] = []
  l.forEach((x, i) => { if (i) res.push(i === l.length - 1 ? et : ', '); res.push(...x) })
  return res
}

/** Assemble une phrase : morceaux vides ôtés, espaces et ponctuation remis en ordre, majuscule et point */
function phrase(s: TemplateStringsArray, ...v: (Morceau | Morceau[] | undefined | false)[]): Phrase {
  const brut: Morceau[] = []
  s.forEach((t, i) => {
    brut.push(t)
    const x = v[i]
    if (x === undefined || x === false || x === '') return
    if (Array.isArray(x)) brut.push(...x)
    else brut.push(x)
  })
  const res: Morceau[] = []
  for (const m of brut) {
    if (typeof m === 'string' && typeof res[res.length - 1] === 'string') res[res.length - 1] += m
    else res.push(m)
  }
  for (let i = 0; i < res.length; i++) {
    const m = res[i]
    if (typeof m !== 'string') continue
    let t = m.replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(').replace(/,\s*([,.;])/g, '$1')
    if (i === 0) t = t.trimStart()
    if (i === res.length - 1) t = t.trimEnd()
    res[i] = t
  }
  // Élision : « d’environ », « d’Anne-Marie »
  for (let i = 0; i < res.length; i++) {
    const m = res[i]
    if (typeof m !== 'string') continue
    let t = m.replace(/(?<![\p{L}’'-])([Dd])e (?=[aeiouyàâéèêîôûAEIOUYÀÂÉÈÊÎÔÛ])/gu, '$1’')
    const suivant = res[i + 1]
    if (typeof suivant === 'object' && /^[AEIOUYÀÂÉÈÊÎÔÛH]/.test(suivant.t)) t = t.replace(/(?<![\p{L}’'-])([Dd])e $/u, '$1’')
    res[i] = t
  }
  if (typeof res[0] === 'string') res[0] = capitale(res[0])
  const dernier = res[res.length - 1]
  if (typeof dernier === 'string') res[res.length - 1] = dernier.replace(/[,;]$/, '')
  if (typeof res[res.length - 1] !== 'string' || !/[.!?]$/.test(res[res.length - 1] as string)) res.push('.')
  return res.filter((m) => m !== '')
}

/** Les phrases d'un paragraphe, mises bout à bout */
function joindre(l: Phrase[]): Phrase {
  return l.flatMap((ph, i) => (i ? [' ', ...ph] : ph))
}

// ——— Dates, lieux, âges ———

const INCERTAINES = new Set(['avant', 'après', 'entre', 'de', 'jusqu’à'])

/** « le 3 mars 1702 », « en mars 1702 », « en 1702 », « vers 1702 », « avant 1702 », « entre 1700 et 1702 » */
export function quand(dt?: DateGed): string {
  if (!dt?.debut) return ''
  const j = dt.debut
  if (dt.qualif === 'entre' && dt.fin) return `entre ${j.annee} et ${dt.fin.annee}`
  if (dt.qualif === 'avant' || dt.qualif === 'après') return `${dt.qualif} ${j.annee}`
  if (dt.qualif === 'vers' || dt.qualif === 'estimé' || dt.qualif === 'calculé') return `vers ${j.annee}`
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
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

/** « à Malines (Anvers) » la première fois, « à Malines » ensuite, une autre tournure juste après la même commune */
function lieu(p: Plume, e?: Evenement): string {
  if (!e?.lieu) return ''
  const { nom, contexte } = decouperLieu(e.lieu)
  if (p.dernierLieu === nom) return p.choisir('meme-lieu', [() => 'au même endroit', () => 'dans la même commune', () => `à ${nom} également`, () => 'là aussi'])
  p.dernierLieu = nom
  if (p.lieux.has(nom)) return `à ${nom}`
  p.lieux.add(nom)
  const region = contexte.split(',')[0]?.trim()
  return region && region !== nom ? `à ${nom} (${region})` : `à ${nom}`
}

export interface Age { n: number; approx: boolean }

/** Âge entre deux dates, si elles le permettent (approché quand il manque le mois ou que la date est « vers ») */
export function age(a?: DateGed, b?: DateGed): Age | undefined {
  if (!a?.debut || !b?.debut || INCERTAINES.has(a.qualif) || INCERTAINES.has(b.qualif)) return undefined
  let n = b.debut.annee - a.debut.annee
  const precis = !!(a.debut.mois && b.debut.mois)
  if (precis && (b.debut.mois! < a.debut.mois! || (b.debut.mois === a.debut.mois && (b.debut.jour ?? 0) < (a.debut.jour ?? 0)))) n--
  if (n < 0 || n > 110) return undefined
  return { n, approx: !precis || !!a.qualif || !!b.qualif }
}

const ans = (a: Age) => `${a.approx ? 'environ ' : ''}${a.n} an${a.n > 1 ? 's' : ''}`
const situe = (e?: Evenement) => !!e && (!!e.date?.debut || !!e.lieu)

// ——— Les personnes ———

/** Le nom à la première rencontre (prénoms et nom), le prénom ensuite */
function nom(p: Plume, ind: Individu): Morceau {
  if (p.vus.has(ind.id)) return { id: ind.id, t: prenomUsuel(ind) }
  p.vus.add(ind.id)
  return { id: ind.id, t: [ind.prenom, ind.nom].filter(Boolean).join(' ') || '?' }
}

/** Sujet d'une phrase : le pronom quand on parle encore de la même personne (pas à chaque fois), sinon son nom */
function sujet(p: Plume, ind: Individu): Morceau {
  const meme = p.sujet === ind.id
  p.sujet = ind.id
  if (meme && p.choisir('pronom', [() => true, () => true, () => false])) return il(ind)
  return nom(p, ind)
}

/** Nom suivi des années : « Jean (1802–1870) » */
function avecAnnees(p: Plume, ind: Individu): Morceau[] {
  const s = p.suivi(ind)
  const n = annee(s?.naissance.evenement?.date)
  const m = s?.deces.etat === 'sans-objet' ? '' : annee(s?.deces.evenement?.date)
  return [nom(p, ind), n || m ? ` (${n || '?'}${m ? '–' + m : ''})` : '']
}

function naissance(p: Plume, ind: Individu): Phrase | null {
  const e = p.suivi(ind)?.naissance.evenement
  if (!situe(e)) return null
  const Q = quand(e!.date), L = lieu(p, e)
  if (e!.tag === 'BAPM' || e!.tag === 'CHR') {
    const b = g(ind, 'baptisé', 'baptisée')
    return p.choisir('bapteme', [
      () => phrase`${sujet(p, ind)} est ${b} ${Q} ${L}`,
      () => phrase`${sujet(p, ind)} reçoit le baptême ${Q} ${L}`,
      !!L && !!Q && (() => phrase`${Q}, ${sujet(p, ind)} est ${b} ${L}`),
    ])
  }
  return p.choisir('naissance', [
    () => phrase`${sujet(p, ind)} naît ${Q} ${L}`,
    () => phrase`${sujet(p, ind)} voit le jour ${Q} ${L}`,
    () => phrase`${sujet(p, ind)} est ${g(ind, 'né', 'née')} ${Q} ${L}`,
    !!L && !!Q && (() => phrase`${Q}, ${sujet(p, ind)} naît ${L}`),
    !!L && (() => phrase`C’est ${L} que naît ${sujet(p, ind)}, ${Q}`),
  ])
}

function filiation(p: Plume, ind: Individu): Phrase | null {
  const { pere, mere } = parents(p.d.arbre, ind)
  const etats = etatParents(p.d.arbre, ind)
  const fils = g(ind, 'le fils', 'la fille')
  if (pere && mere) {
    return p.choisir('filiation', [
      () => phrase`${sujet(p, ind)} est ${fils} de ${nom(p, pere)} et de ${nom(p, mere)}`,
      () => { p.sujet = undefined; return phrase`Ses parents sont ${nom(p, pere)} et ${nom(p, mere)}` },
      () => phrase`${sujet(p, ind)} a pour parents ${nom(p, pere)} et ${nom(p, mere)}`,
    ])
  }
  if (pere || mere) {
    const autre = pere ? (etats.mere === 'inconnu' ? ', de mère inconnue' : '') : (etats.pere === 'inconnu' ? ', de père inconnu' : '')
    return phrase`${sujet(p, ind)} est ${fils} de ${nom(p, (pere ?? mere)!)}${autre}`
  }
  if (etats.pere === 'inconnu' && etats.mere === 'inconnu') return phrase`Ses parents ne sont pas connus`
  return null
}

function metiers(p: Plume, ind: Individu): Phrase | null {
  const l = metiersDe(ind).slice(0, 3)
  if (!l.length) return null
  const t = enumerer(l.map((m) => [m]))
  const le = g(ind, 'le', 'la')
  return p.choisir('metier', [
    () => phrase`${sujet(p, ind)} est ${t}`,
    () => { p.sujet = ind.id; return phrase`Les actes ${le} disent ${t}` },
    () => { p.sujet = ind.id; return phrase`On ${le} trouve ${t} dans les actes` },
    () => (l.length > 1 ? phrase`${sujet(p, ind)} est tour à tour ${t}` : phrase`${sujet(p, ind)} exerce le métier de ${t}`),
    p.sujet === ind.id && (() => phrase`De son état, ${il(ind)} est ${t}`),
  ])
}

/** Le mariage `m` de `ind` ; `rang` : 0 pour le premier ; `precedent` : le conjoint d'avant */
function mariage(p: Plume, ind: Individu, m: Fait, rang: number, precedent?: Individu): Phrase | null {
  const conj = p.ind(m.conjoint)
  if (!conj) return null
  const e = m.evenement
  const Q = quand(e?.date), L = lieu(p, e)
  const aSujet = age(p.suivi(ind)?.naissance.evenement?.date, e?.date)
  const aConj = age(p.suivi(conj)?.naissance.evenement?.date, e?.date)
  const C = (): Morceau[] => (aConj && !aSujet ? [nom(p, conj), `, alors ${g(conj, 'âgé', 'âgée')} de ${ans(aConj)},`] : [nom(p, conj)])
  if (rang > 0) {
    const mort = precedent ? p.suivi(precedent)?.deces.evenement?.date?.tri : undefined
    const veuf = mort && e?.date?.tri && mort <= e.date.tri ? g(ind, 'Veuf', 'Veuve') + ', ' : ''
    const noces = rang === 1 ? 'En secondes noces' : `En ${ORDINAUX[rang + 1]?.replace('ième', 'ièmes') ?? 'nouvelles'} noces`
    return p.choisir('remariage', [
      () => phrase`${veuf}${sujet(p, ind)} se remarie ${Q} ${L} avec ${C()}`,
      () => phrase`${noces}, ${sujet(p, ind)} épouse ${C()} ${Q} ${L}`,
    ])
  }
  if (!e || (!situe(e) && !e.avere)) {
    return p.choisir('union', [
      () => phrase`${sujet(p, ind)} s’unit à ${nom(p, conj)}`,
      () => phrase`${sujet(p, ind)} partage sa vie avec ${nom(p, conj)}`,
      () => { p.sujet = ind.id; return phrase`${g(ind, 'Sa compagne', 'Son compagnon')} est ${nom(p, conj)}` },
    ])
  }
  return p.choisir('mariage', [
    () => phrase`${sujet(p, ind)} épouse ${C()} ${Q} ${L}`,
    () => phrase`${sujet(p, ind)} se marie ${Q} ${L} avec ${C()}`,
    !!aSujet && (() => phrase`À ${ans(aSujet!)}, ${sujet(p, ind)} épouse ${nom(p, conj)} ${Q} ${L}`),
    !!Q && (() => phrase`${Q}, ${sujet(p, ind)} prend pour ${g(ind, 'épouse', 'époux')} ${C()} ${L}`),
    () => { p.sujet = ind.id; return phrase`Le mariage de ${nom(p, ind)} avec ${C()} est célébré ${Q} ${L}` },
  ])
}

function enfantsDe(p: Plume, f?: Famille): Individu[] {
  if (!f) return []
  const tri = (c: Individu) => p.suivi(c)?.naissance.evenement?.date?.tri || 99999999
  return f.enfants.map((c) => p.ind(c)).filter((c): c is Individu => !!c).sort((a, b) => tri(a) - tri(b))
}

/** Le nombre d'enfants d'une union, avec leurs noms si `noms` */
function enfants(p: Plume, f: Famille | undefined, noms: boolean): Phrase | null {
  const l = enfantsDe(p, f)
  const n = l.length
  if (!n) return null
  p.sujet = undefined
  const liste = (): Morceau[] => (noms ? enumerer(l.map((c) => avecAnnees(p, c))) : [])
  if (n === 1) {
    const un = g(l[0], 'un fils', 'une fille')
    return p.choisir('enfant-unique', [
      () => phrase`De cette union naît ${un}${noms ? [', ', ...liste()] : ''}`,
      () => phrase`On ne leur connaît qu’${un}${noms ? [', ', ...liste()] : ''}`,
    ])
  }
  const N = enLettres(n)
  const suite = () => (noms ? [' : ', ...liste()] : '')
  return p.choisir('enfants', [
    () => phrase`De cette union naissent ${N} enfants${suite()}`,
    !p.debut.startsWith('Le couple') && (() => phrase`Le couple a ${N} enfants${suite()}`),
    () => phrase`On leur connaît ${N} enfants${suite()}`,
    () => phrase`${capitale(N)} enfants naissent de ce mariage${suite()}`,
  ])
}

function deces(p: Plume, ind: Individu): Phrase | null {
  const s = p.suivi(ind)
  const e = s?.deces.evenement
  if (!e || s?.deces.etat === 'sans-objet' || !situe(e)) return null
  const Q = quand(e.date), L = lieu(p, e)
  const a = age(s?.naissance.evenement?.date, e.date)
  const meme = p.sujet === ind.id
  if (e.tag === 'BURI' || e.tag === 'CREM') {
    const v = e.tag === 'BURI' ? g(ind, 'inhumé', 'inhumée') : g(ind, 'incinéré', 'incinérée')
    return phrase`${sujet(p, ind)} est ${v} ${Q} ${L}${a ? `, à ${ans(a)}` : ''}`
  }
  if (a && a.n === 0) {
    return p.choisir('mort-enfant', [
      () => phrase`${sujet(p, ind)} meurt en bas âge, ${Q} ${L}`,
      () => phrase`${sujet(p, ind)} ne vit que quelques mois et s’éteint ${Q} ${L}`,
    ])
  }
  // Veuvage : le dernier conjoint, mort au moins deux ans plus tôt
  const conj = p.ind(s?.mariages.at(-1)?.conjoint)
  const mc = conj ? p.suivi(conj)?.deces.evenement?.date : undefined
  const veuf = mc?.debut && e.date?.debut && !INCERTAINES.has(mc.qualif) && e.date.debut.annee - mc.debut.annee >= 2
    ? `${g(ind, 'Veuf', 'Veuve')} depuis ${mc.debut.annee}, ` : ''
  return p.choisir('deces', [
    () => phrase`${veuf}${sujet(p, ind)} meurt ${Q} ${L}${a ? `, à ${ans(a)}` : ''}`,
    () => phrase`${veuf}${sujet(p, ind)} s’éteint ${Q} ${L}${a ? ` à l’âge de ${ans(a)}` : ''}`,
    () => phrase`${veuf}${sujet(p, ind)} décède ${Q} ${L}${a ? `, ${g(ind, 'âgé', 'âgée')} de ${ans(a)}` : ''}`,
    !!a && (() => phrase`${sujet(p, ind)} a ${ans(a!)} lorsqu’${il(ind)} meurt ${Q} ${L}`),
    meme && (() => phrase`Sa mort survient ${Q} ${L}${a ? ` ; ${il(ind)} avait ${ans(a)}` : ''}`),
  ])
}

/** Une personne en une phrase (naissance, métier, mariage, décès), pour les générations lointaines */
function resume(p: Plume, ind: Individu, avecMariage: boolean): Phrase {
  const s = p.suivi(ind)
  const n = s?.naissance.evenement
  const m = s?.deces.etat === 'sans-objet' ? undefined : s?.deces.evenement
  const met = metiersDe(ind)[0]
  const S = sujet(p, ind)
  const appositions: Morceau[][] = []
  if (situe(n)) appositions.push([`${n!.tag === 'BIRT' ? g(ind, 'né', 'née') : g(ind, 'baptisé', 'baptisée')} ${quand(n!.date)} ${lieu(p, n)}`])
  if (met) appositions.push([met])
  const verbes: Morceau[][] = []
  const union = avecMariage ? s?.mariages[0] : undefined
  const conj = p.ind(union?.conjoint)
  if (conj) verbes.push(['épouse ', nom(p, conj), ` ${quand(union?.evenement?.date)} ${lieu(p, union?.evenement)}`])
  if (situe(m)) {
    const a = age(n?.date, m!.date)
    const v = p.choisir('meurt', [() => 'meurt', () => 's’éteint', () => 'décède'])
    verbes.push([a?.n === 0 ? `meurt en bas âge ${quand(m!.date)} ${lieu(p, m)}` : `${v} ${quand(m!.date)} ${lieu(p, m)}${a ? ` à ${ans(a)}` : ''}`])
  }
  if (!appositions.length && !verbes.length) {
    return p.choisir('inconnu', [() => phrase`On ne sait presque rien de ${S}`, () => phrase`${S} reste mal ${g(ind, 'connu', 'connue')}`])
  }
  if (!verbes.length) return phrase`${S}, ${enumerer(appositions, ', ')}`
  if (!appositions.length) return phrase`${S} ${enumerer(verbes)}`
  return phrase`${S}, ${enumerer(appositions, ', ')}, ${enumerer(verbes)}`
}

// ——— Les parties du récit ———

/** Le portrait de la personne racontée : naissance, parents et métier, puis unions et enfants, puis décès */
function portrait(p: Plume, ind: Individu): Phrase[] {
  const debut = [naissance(p, ind), filiation(p, ind), metiers(p, ind)].filter((x): x is Phrase => !!x)
  p.paragraphe()
  const suite: Phrase[] = []
  let precedent: Individu | undefined
  p.suivi(ind)?.mariages.forEach((m, i) => {
    const ph = mariage(p, ind, m, i, precedent)
    if (ph) suite.push(ph)
    const e = enfants(p, p.famille(m.famille), true)
    if (e) suite.push(e)
    precedent = p.ind(m.conjoint)
  })
  const fin = deces(p, ind)
  if (fin) suite.push(fin)
  const res = [debut, suite].filter((x) => x.length).map(joindre)
  return res.length ? res : [resume(p, ind, false)]
}

const TITRES_ASC = ['', 'Ses parents', 'Ses grands-parents', 'Ses arrière-grands-parents', 'Ses trisaïeuls']
const titreAsc = (n: number) => TITRES_ASC[n] ?? `${capitale(ORDINAUX[n + 1] ?? n + 1 + 'e')} génération`

/** Un couple d'ancêtres (places 2k et 2k+1), présenté depuis leur enfant de la lignée */
function couple(p: Plume, pl: Place[], k: number, detail: boolean): Phrase | null {
  p.paragraphe()
  const enfant = pl[k]?.ind
  const H = pl[2 * k], F = pl[2 * k + 1]
  const h = H?.ind, f = F?.ind
  if (!enfant || (!h && !f)) return null
  const fils = g(enfant, 'le fils', 'la fille')
  // Implexe : déjà raconté plus haut
  if ((h && H.dejaVu) || (f && F.dejaVu)) {
    const qui = h && f ? [nom(p, h), ' et ', nom(p, f)] : [nom(p, (h ?? f)!)]
    const deja = h && f ? 'déjà rencontrés' : g(h ?? f, 'déjà rencontré', 'déjà rencontrée')
    return phrase`${nom(p, enfant)} est ${fils} de ${qui}, ${deja} plus haut dans cette ascendance`
  }
  const res: Phrase[] = []
  const etats = etatParents(p.d.arbre, enfant)
  const cote = k === 2 ? 'Du côté paternel, ' : k === 3 ? 'Du côté maternel, ' : ''
  // Les parents de la personne racontée sont déjà nommés dans son portrait
  if (k === 1 && h && f) {
    // rien à rappeler
  } else if (h && f) {
    res.push(p.choisir('couple', [
      () => phrase`${cote}${nom(p, enfant)} est ${fils} de ${nom(p, h)} et de ${nom(p, f)}`,
      () => phrase`${cote}les parents de ${nom(p, enfant)} se nomment ${nom(p, h)} et ${nom(p, f)}`,
      () => phrase`${cote}${nom(p, h)} et ${nom(p, f)} sont les parents de ${nom(p, enfant)}`,
      () => phrase`${cote}${nom(p, enfant)} a pour parents ${nom(p, h)} et ${nom(p, f)}`,
    ]))
  } else {
    const autre = h ? (etats.mere === 'inconnu' ? ' ; sa mère est inconnue' : ' ; sa mère reste à identifier') : (etats.pere === 'inconnu' ? ' ; son père est inconnu' : ' ; son père reste à identifier')
    res.push(phrase`${cote}${nom(p, enfant)} est ${fils} de ${nom(p, (h ?? f)!)}${autre}`)
  }
  p.sujet = undefined
  const fam = enfant.famc.map((id) => p.famille(id)).find(Boolean)
  const union = h ? p.suivi(h)?.mariages.find((m) => m.famille === fam?.id) : undefined
  const e = union?.evenement
  if (!detail) {
    for (const x of [h, f]) if (x) res.push(resume(p, x, false))
    if (h && f && situe(e)) { p.sujet = undefined; res.push(phrase`Ils se marient ${quand(e!.date)} ${lieu(p, e)}`) }
    const en = enfants(p, fam, false)
    if (en) res.push(en)
    return joindre(res)
  }
  for (const x of [h, f]) {
    if (!x) continue
    for (const ph of [naissance(p, x), metiers(p, x)]) if (ph) res.push(ph)
  }
  if (h && f && situe(e)) {
    const ah = age(p.suivi(h)?.naissance.evenement?.date, e!.date), af = age(p.suivi(f)?.naissance.evenement?.date, e!.date)
    const ages = ah && af ? ` ; il a ${ans(ah)}, elle ${ans(af)}` : ''
    const Q = quand(e!.date), L = lieu(p, e)
    p.sujet = undefined
    res.push(p.choisir('mariage-couple', [
      () => phrase`Ils se marient ${Q} ${L}${ages}`,
      () => phrase`Leur mariage a lieu ${Q} ${L}${ages}`,
      !!Q && (() => phrase`${Q}, ${nom(p, h)} épouse ${nom(p, f)} ${L}${ages}`),
      () => phrase`Le couple s’unit ${Q} ${L}${ages}`,
    ]))
  }
  const en = enfants(p, fam, false)
  if (en) res.push(en)
  for (const x of [h, f]) {
    if (!x) continue
    const autres = (p.suivi(x)?.mariages ?? []).filter((m) => m.famille !== fam?.id).map((m) => p.ind(m.conjoint)).filter((c): c is Individu => !!c)
    if (!autres.length) continue
    const qui = () => enumerer(autres.map((c) => [nom(p, c)]))
    res.push(p.choisir('autres-unions', [
      () => phrase`${sujet(p, x)} connaît aussi une autre union, avec ${qui()}`,
      () => phrase`${sujet(p, x)} a également été ${g(x, 'marié', 'mariée')} à ${qui()}`,
    ]))
  }
  for (const x of [h, f]) {
    if (!x) continue
    const ph = deces(p, x)
    if (ph) res.push(ph)
  }
  return joindre(res)
}

/** Un enfant de la personne racontée, en détail */
function descendant(p: Plume, ind: Individu): Phrase {
  p.paragraphe()
  const res: Phrase[] = []
  for (const ph of [naissance(p, ind), metiers(p, ind)]) if (ph) res.push(ph)
  let precedent: Individu | undefined
  p.suivi(ind)?.mariages.forEach((m, i) => {
    const ph = mariage(p, ind, m, i, precedent)
    if (ph) res.push(ph)
    const e = enfants(p, p.famille(m.famille), false)
    if (e) res.push(e)
    precedent = p.ind(m.conjoint)
  })
  const fin = deces(p, ind)
  if (fin) res.push(fin)
  return res.length ? joindre(res) : resume(p, ind, false)
}

const TITRES_DESC = ['', 'Ses enfants', 'Ses petits-enfants', 'Ses arrière-petits-enfants']
const titreDesc = (n: number) => TITRES_DESC[n] ?? `${capitale(ORDINAUX[n] ?? n + 'e')} génération de descendants`

function enfantsTous(p: Plume, ind: Individu): Individu[] {
  return (p.suivi(ind)?.mariages ?? []).flatMap((m) => enfantsDe(p, p.famille(m.famille)))
}

/** Le récit complet : la personne, `ascendants` générations d'ancêtres, `descendants` générations de descendants */
export function recit(d: Donnees, id: string, ascendants: number, descendants: number): Recit | null {
  const ind = d.arbre.individus.get(id)
  if (!ind) return null
  const p = new Plume(id, d)
  const titre = [ind.prenom, ind.nom].filter(Boolean).join(' ') || '?'
  const parties: Partie[] = [{ titre, paragraphes: portrait(p, ind) }]

  let nbAnc = 0
  const asc = Math.min(Math.max(0, ascendants), MAX_ASCENDANTS)
  if (asc > 0) {
    const pl = places(d.arbre, id, asc + 1)
    for (let gen = 1; gen <= asc; gen++) {
      const paragraphes: Phrase[] = []
      for (let k = 2 ** (gen - 1); k < 2 ** gen; k++) {
        const ph = couple(p, pl, k, gen <= ASC_DETAILLES)
        if (ph) paragraphes.push(ph)
        for (const s of [2 * k, 2 * k + 1]) if (pl[s]?.ind && !pl[s].dejaVu) nbAnc++
      }
      if (!paragraphes.length) break
      parties.push({ titre: titreAsc(gen), paragraphes })
    }
  }

  let nbDesc = 0
  const desc = Math.min(Math.max(0, descendants), MAX_DESCENDANTS)
  let generation: Individu[] = [ind]
  const vus = new Set<string>([ind.id])
  for (let gen = 1; gen <= desc; gen++) {
    const paragraphes: Phrase[] = []
    const suivants: Individu[] = []
    for (const parent of generation) {
      const l = enfantsTous(p, parent).filter((c) => !vus.has(c.id))
      if (!l.length) continue
      l.forEach((c) => vus.add(c.id))
      nbDesc += l.length
      suivants.push(...l)
      if (gen === 1) {
        for (const c of l) paragraphes.push(descendant(p, c))
        continue
      }
      p.paragraphe()
      const N = enLettres(l.length)
      const es = l.length > 1 ? 'enfants' : 'enfant'
      if (gen === 2) {
        const intro = p.choisir('intro-desc', [
          () => phrase`${nom(p, parent)} a ${N} ${es}`,
          l.length > 1 && (() => phrase`Les enfants de ${nom(p, parent)} sont au nombre de ${N}`),
          () => phrase`Du côté de ${nom(p, parent)}, on compte ${N} ${es}`,
        ])
        paragraphes.push(joindre([intro, ...l.map((c) => { p.sujet = undefined; return resume(p, c, true) })]))
      } else {
        const liste = () => enumerer(l.map((c) => avecAnnees(p, c)))
        paragraphes.push(p.choisir('liste-desc', [
          () => phrase`${nom(p, parent)} a pour ${es} ${liste()}`,
          () => phrase`De ${nom(p, parent)} descendent ${liste()}`,
          () => phrase`${capitale(es)} de ${nom(p, parent)} : ${liste()}`,
        ]))
      }
    }
    if (!paragraphes.length) break
    parties.push({ titre: titreDesc(gen), paragraphes })
    generation = suivants
  }
  return { titre, parties, ancetres: nbAnc, descendants: nbDesc }
}

/** Le récit en texte brut (pour le copier) */
export function texteBrut(r: Recit): string {
  const t = (l: Phrase) => l.map((m) => (typeof m === 'string' ? m : m.t)).join('')
  return r.parties.map((pt) => [pt.titre, ...pt.paragraphes.map(t)].join('\n\n')).join('\n\n\n')
}
