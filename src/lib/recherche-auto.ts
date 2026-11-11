// Recherches qui s'exécutent toutes seules : les bases qui répondent à une page web (API ouverte) sont interrogées
// d'ici, et leurs résultats s'affichent sans ouvrir d'onglet.
// - Open Archives (openarchieven.nl) : index d'actes des Pays-Bas et des Archives de l'État en Belgique. Pour chaque
//   fait daté d'une personne (naissance, mariage, décès), on y cherche l'acte ; les prénoms y sont en latin ou en
//   néerlandais (« Petrus » pour Pierre), d'où une recherche par initiale puis un tri sur les variantes du prénom.
// - Internet Archive, Wikisource, Europeana : mentions du nom dans des livres et documents numérisés.

import type { Evenement, Individu } from './gedcom/arbre'
import type { Donnees } from './donnees'
import { annee } from './gedcom/dates'
import { decouper } from './geo'
import { cleCommuneBilingue as cleCommune } from './lieux-variantes'
import { decouperLieu } from './communes'
import { libelle } from './format'
import { clePrenom, variantesPrenom } from './prenoms'
import { aChercher, anneeNaissanceEstimee } from './suivi'
import type { Nom } from './recherches'

export interface Resultat { titre: string; detail?: string; url: string }
export interface Reponse { total: number; resultats: Resultat[] }

export interface Moteur {
  id: string
  nom: string
  detail: string
  chercher: (nom: Nom, signal?: AbortSignal) => Promise<Reponse>
  /** La même recherche sur le site, pour voir tous les résultats */
  page: (nom: Nom) => string
}

const e = encodeURIComponent

async function json(url: string, signal?: AbortSignal): Promise<any> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(r.status === 429 ? 'trop de demandes, réessayez plus tard' : `réponse ${r.status}`)
  return r.json()
}

const texte = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, '’').replace(/\s+/g, ' ').trim()
const premier = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v))

export const MOTEURS: Moteur[] = [
  {
    id: 'archive-org', nom: 'Internet Archive', detail: 'Livres et revues numérisés',
    page: (n) => `https://archive.org/search?query=${e(n.phrase)}&sin=TXT`,
    chercher: async (n, signal) => {
      const j = await json(`https://archive.org/advancedsearch.php?q=${e(n.phrase)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=creator&rows=5&output=json`, signal)
      return {
        total: j.response?.numFound ?? 0,
        resultats: (j.response?.docs ?? []).map((d: any) => ({
          titre: premier(d.title) || d.identifier, detail: [premier(d.creator), d.year].filter(Boolean).join(', '), url: `https://archive.org/details/${e(d.identifier)}`,
        })),
      }
    },
  },
  {
    id: 'wikisource', nom: 'Wikisource (fr)', detail: 'Textes du domaine public',
    page: (n) => `https://fr.wikisource.org/w/index.php?fulltext=1&search=${e(n.phrase)}`,
    chercher: async (n, signal) => {
      const j = await json(`https://fr.wikisource.org/w/api.php?action=query&list=search&srsearch=${e(n.phrase)}&srlimit=5&format=json&origin=*`, signal)
      return {
        total: j.query?.searchinfo?.totalhits ?? 0,
        resultats: (j.query?.search ?? []).map((d: any) => ({ titre: d.title, detail: '… ' + texte(d.snippet ?? '') + ' …', url: `https://fr.wikisource.org/wiki/${e(String(d.title).replace(/ /g, '_'))}` })),
      }
    },
  },
  {
    id: 'europeana', nom: 'Europeana', detail: 'Bibliothèques et archives européennes',
    page: (n) => `https://www.europeana.eu/fr/search?query=${e(n.phrase)}`,
    chercher: async (n, signal) => {
      const j = await json(`https://api.europeana.eu/record/v2/search.json?wskey=api2demo&query=${e(n.phrase)}&rows=5&profile=minimal`, signal)
      return {
        total: j.totalResults ?? 0,
        resultats: (j.items ?? []).map((d: any) => ({ titre: premier(d.title) || 'Sans titre', detail: [premier(d.dataProvider), premier(d.year)].filter(Boolean).join(', '), url: d.guid ?? `https://www.europeana.eu/item${d.id}` })),
      }
    },
  },
]

// ——— Actes dans les index (Open Archives) ———

export type Quoi = 'naissance' | 'mariage' | 'deces'

export interface FaitCherche {
  quoi: Quoi
  /** L'événement de l'arbre, s'il existe */
  evenement?: Evenement
  /** Années cherchées : la même pour un fait daté, une fourchette estimée pour un fait sans date */
  de: number
  a: number
  /** Pas encore de source dans l'arbre */
  aSourcer: boolean
  /** Le fait n'a pas de date dans l'arbre : la fourchette vient des autres faits (mariage, enfants…) */
  estime: boolean
  conjoint?: Individu
}

const ANNEES_DECES = ['DEAT', 'BURI', 'CREM']

/** Une date « après 1936 », « avant 1800 » ou « entre 1750 et 1760 » n'est pas une année : elle borne la fourchette à chercher */
function bornes(e?: Evenement): { de?: number; a?: number } | undefined {
  const an = annee(e?.date)
  const q = e?.date?.qualif
  if (an === undefined || !q) return undefined
  if (q === 'après') return { de: an }
  if (q === 'avant' || q === 'jusqu’à') return { a: an }
  if (q === 'entre' || q === 'de') return e?.date?.fin ? { de: an, a: e.date.fin.annee } : { de: an }
  return undefined
}

/**
 * Les faits d'une personne qu'on peut chercher dans un index : naissance ou baptême, mariages, décès ou inhumation.
 * `sansDate` ajoute les faits sans date, dans une fourchette estimée : naissance d'après le mariage ou les enfants,
 * mariage dans les douze ans avant le premier enfant, décès entre le dernier fait connu et cent ans après la naissance.
 */
export function faitsCherches(d: Donnees, ind: Individu, sansDate = false): FaitCherche[] {
  const s = d.suivis.get(ind.id)
  if (!s) return []
  const faits: FaitCherche[] = []
  const dater = (quoi: Quoi, f: { etat: Parameters<typeof aChercher>[0]; evenement?: Evenement; conjoint?: string }): boolean => {
    const an = annee(f.evenement?.date)
    if (!f.evenement || an === undefined || bornes(f.evenement)) return false
    faits.push({ quoi, evenement: f.evenement, de: an, a: an, aSourcer: aChercher(f.etat), estime: false, conjoint: f.conjoint ? d.arbre.individus.get(f.conjoint) : undefined })
    return true
  }
  const estimer = (quoi: Quoi, f: { evenement?: Evenement; conjoint?: string }, de: number | undefined, a: number | undefined) => {
    if (de === undefined || a === undefined || a < de || a - de > 80) return
    faits.push({ quoi, evenement: f.evenement, de, a: Math.min(a, new Date().getFullYear()), aSourcer: true, estime: true, conjoint: f.conjoint ? d.arbre.individus.get(f.conjoint) : undefined })
  }
  const naissance = annee(s.naissance.evenement?.date) ?? anneeNaissanceEstimee(d.arbre, ind, s.naissance)
  const anneesEnfants = (famille?: string) => (d.arbre.familles.get(famille ?? '')?.enfants ?? [])
    .map((c) => annee(d.arbre.individus.get(c)?.evenements.find((e) => ['BIRT', 'BAPM', 'CHR'].includes(e.tag) && e.date)?.date))
    .filter((x): x is number => x !== undefined)

  if (!dater('naissance', s.naissance) && sansDate && aChercher(s.naissance.etat) && naissance !== undefined) {
    const b = bornes(s.naissance.evenement)
    if (b) estimer('naissance', s.naissance, b.de ?? b.a! - 15, b.a ?? b.de! + 15)
    else estimer('naissance', s.naissance, naissance - 10, naissance + 5)
  }
  let dernier = naissance
  for (const m of s.mariages) {
    const enfants = anneesEnfants(m.famille)
    for (const x of [annee(m.evenement?.date), ...enfants]) if (x !== undefined && (dernier === undefined || x > dernier)) dernier = x
    if (dater('mariage', m) || !sansDate || !aChercher(m.etat)) continue
    const b = bornes(m.evenement)
    const aine = enfants.length ? Math.min(...enfants) : undefined
    if (b) estimer('mariage', m, b.de ?? (aine !== undefined ? aine - 12 : b.a! - 15), b.a ?? aine ?? b.de! + 15)
    else if (aine !== undefined) estimer('mariage', m, aine - 12, aine)
  }
  if (!dater('deces', s.deces) && sansDate && aChercher(s.deces.etat)) {
    const b = bornes(s.deces.evenement)
    const centenaire = naissance === undefined ? undefined : naissance + 100
    if (b) estimer('deces', s.deces, b.de ?? dernier ?? b.a! - 50, b.a ?? Math.min(centenaire ?? Infinity, b.de! + 50))
    else if (!ind.evenements.some((e) => ANNEES_DECES.includes(e.tag) && annee(e.date) !== undefined)) {
      estimer('deces', s.deces, dernier, centenaire === undefined ? undefined : Math.min(centenaire, (dernier ?? naissance!) + 80))
    }
  }
  return faits
}

/** Une ligne d'index d'Open Archives */
export interface Doc {
  archive_code?: string
  personname?: string
  relationtype?: string
  eventtype?: string
  eventdate?: { day?: number; month?: number; year?: number }
  eventplace?: string[] | string | null
  archive_org?: string
  sourcetype?: string
  url?: string
}

export interface Candidat {
  titre: string
  detail: string
  url: string
  /** Même jour que dans l'arbre */
  dateExacte: boolean
  /** Même commune que dans l'arbre */
  memeLieu: boolean
}

const TYPES: Record<Quoi, RegExp> = {
  naissance: /naissance|bapt|geboorte|doop/i,
  mariage: /mariage|huwelijk/i,
  deces: /d[ée]c[èe]s|enterrement|inhum|overlijden|begraf/i,
}
/** Le rôle de la personne dans l'acte : l'enfant, un des mariés, le défunt (pas un parent ni un témoin) */
const ROLES: Record<Quoi, RegExp> = {
  naissance: /^(enfant|baptis[ée]e?|kind|dopeling|n[ée]e?)$/i,
  mariage: /^(mari[ée]e?|groom\/mari[ée]e|bruidegom|bruid|[ée]poux|[ée]pouse)$/i,
  deces: /^(d[ée]c[ée]d[ée]e?|d[ée]funte?|overledene)$/i,
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const mots = (s: string) => sansAccents(s).toLowerCase().split(/[^a-z]+/).filter(Boolean)

/** Filtres d'Open Archives (en néerlandais) pour une fourchette d'années : sans eux, il y aurait trop de lignes à lire */
function filtres(ind: Individu, fait: FaitCherche): string[] {
  if (!fait.estime) return ['']
  if (fait.quoi === 'mariage') return [`&eventtype=Huwelijk${ind.sexe === 'M' ? '&relationtype=Bruidegom' : ind.sexe === 'F' ? '&relationtype=Bruid' : ''}`]
  // registres paroissiaux avant l'état civil (1796), état civil ensuite
  const paroisse = fait.de < 1796
  const civil = fait.a >= 1796
  // l'enfant d'un acte de naissance ou de baptême est « Kind » ; seules certaines archives néerlandaises écrivent « Dopeling » au baptême
  if (fait.quoi === 'naissance') return ['&relationtype=Kind', ...(paroisse ? ['&eventtype=Doop&relationtype=Dopeling'] : [])]
  return [...(paroisse ? ['&eventtype=Begraven&relationtype=Overledene'] : []), ...(civil ? ['&eventtype=Overlijden&relationtype=Overledene'] : [])]
}

/** Les requêtes à poser pour un fait : une par initiale des formes connues du premier prénom (« G* », « W* » pour Guillaume) */
export function requetesOpenArch(ind: Individu, fait: FaitCherche): string[] {
  const prenom = ind.prenom.split(/\s+/)[0] ?? ''
  const nom = sansAccents(ind.nom).trim()
  if (!prenom || !nom) return []
  const initiales = [...new Set(variantesPrenom(prenom).map((v) => v[0]).filter((c) => /[a-z]/.test(c)))]
  const annees = fait.de === fait.a ? String(fait.de) : `${fait.de}-${fait.a}`
  // un mariage : les deux mariés doivent être dans le même acte (« J* Peeters & Janssens 1840 »)
  const conjoint = fait.quoi === 'mariage' && fait.conjoint?.nom ? ` & ${sansAccents(fait.conjoint.nom).trim()}` : ''
  return initiales.flatMap((i) => filtres(ind, fait).map((f) => `https://api.openarch.nl/1.0/records/search.json?name=${e(`${i.toUpperCase()}* ${nom}${conjoint} ${annees}`)}&lang=fr&number=10${f}`))
}

/** Archives d'Open Archives qui ne sont pas aux Pays-Bas (d'après la liste des archives du site) */
const PAYS_ARCHIVES: Record<string, string> = { ins: 'FR', nyc: 'US', rtr: 'US', suh: 'DE', sbb: 'DE', nas: 'SR', anr: 'ID' }
for (const c of 'abh abe mch abl aba abu abn dme sla ell far abb abg abt hgo sir rae gnt sad ton kor aal den abs fde haa dbe ind jac cfg idm spa ten fwk fvb fvg fvo fvm fvl hzb'.split(' ')) PAYS_ARCHIVES[c] = 'BE'

/** Les pays où chercher : celui du fait s'il a un lieu, sinon ceux des autres faits de la personne (et du conjoint pour un mariage) ; vide si l'arbre n'en dit rien */
function paysAttendus(ind: Individu, fait: FaitCherche): Set<string> {
  const pays = (lieu?: string) => (lieu ? decouper(lieu).pays : undefined)
  const duFait = pays(fait.evenement?.lieu)
  if (duFait) return new Set([duFait])
  const lieux = [...ind.evenements, ...(fait.quoi === 'mariage' ? fait.conjoint?.evenements ?? [] : [])].map((ev) => pays(ev.lieu))
  return new Set(lieux.filter((p): p is string => !!p))
}

/** Les prénoms de l'acte sans le nom de famille (« Maria Josephina Van Hove » pour VANHOVE → maria, josephina) */
function prenomsActe(personne: string, nom: string[]): string[] {
  const m = mots(personne)
  const colle = nom.join('')
  for (let k = m.length - 1; k > 0; k--) if (m.slice(k).join('') === colle) return m.slice(0, k)
  return m.filter((x) => !nom.includes(x))
}

/** 2 : les prénoms se suivent dans le même ordre (« Jean » et « Joannes Baptista ») · 1 : les mêmes dans un autre ordre, ou le prénom d'usage n'est pas le premier · 0 : des prénoms différents */
function accordPrenoms(a: string[], b: string[]): 0 | 1 | 2 {
  const n = Math.min(a.length, b.length)
  if (!n) return 0
  if (a.slice(0, n).every((p, i) => p === b[i])) return 2
  const [court, long] = a.length <= b.length ? [a, b] : [b, a]
  return court.every((p) => long.includes(p)) ? 1 : 0
}

/**
 * Parmi les lignes d'index, celles qui peuvent être l'acte cherché : même type d'acte, même rôle, à un an près, dans un
 * pays où l'arbre situe la personne, et les mêmes prénoms (« Marie Josephine » n'est ni « Marie Marthe » ni « Bertha Maria »).
 * Des prénoms dans un autre ordre ou un autre pays ne passent que si le jour ou la commune sont ceux de l'arbre.
 */
export function candidats(docs: Doc[], ind: Individu, fait: FaitCherche): Candidat[] {
  const cles = ind.prenom.split(/[\s-]+/).filter(Boolean).map(clePrenom)
  const nom = mots(ind.nom)
  const pays = paysAttendus(ind, fait)
  const commune = fait.evenement?.lieu ? cleCommune(decouper(fait.evenement.lieu).commune) : ''
  const jour = fait.evenement?.date?.debut
  // un fait daté : à un an près ; une fourchette estimée : dedans
  const marge = fait.estime ? 0 : 1
  const vus = new Set<string>()
  const res: (Candidat & { rang: number })[] = []
  for (const doc of docs) {
    if (!doc.url || vus.has(doc.url)) continue
    if (!TYPES[fait.quoi].test(doc.eventtype ?? '') || !ROLES[fait.quoi].test((doc.relationtype ?? '').trim())) continue
    const an = doc.eventdate?.year
    if (an !== undefined && (an < fait.de - marge || an > fait.a + marge)) continue
    const accord = accordPrenoms(cles, prenomsActe((doc.personname ?? '').split('>')[0], nom).map(clePrenom))
    if (!accord) continue
    const lieux = (Array.isArray(doc.eventplace) ? doc.eventplace : doc.eventplace ? [doc.eventplace] : []).filter(Boolean)
    const dateExacte = !!jour?.jour && !!jour.mois && doc.eventdate?.day === jour.jour && doc.eventdate?.month === jour.mois && an === jour.annee
    const memeLieu = !!commune && lieux.some((l) => cleCommune(l) === commune)
    if (accord < 2 && !dateExacte && !memeLieu) continue
    const ailleurs = pays.size > 0 && !!doc.archive_code && !pays.has(PAYS_ARCHIVES[doc.archive_code] ?? 'NL')
    if (ailleurs && !dateExacte) continue
    const date = [doc.eventdate?.day, doc.eventdate?.month, an].filter(Boolean).join('/')
    const titre = `${doc.eventtype} ${date}${lieux.length ? ', ' + lieux.join(', ') : ''} : ${(doc.personname ?? '').split('>')[0]}`
    // le même acte indexé par deux archives n'est montré qu'une fois
    if (vus.has(titre)) continue
    vus.add(doc.url).add(titre)
    res.push({
      titre, detail: [doc.sourcetype, doc.archive_org].filter(Boolean).join(' · '),
      url: doc.url, dateExacte, memeLieu, rang: (dateExacte ? 4 : 0) + (memeLieu ? 2 : 0) + (accord - 1),
    })
  }
  return res.sort((a, b) => b.rang - a.rang).map(({ rang: _, ...c }) => c)
}

const NOMS_FAITS: Record<Quoi, string> = { naissance: 'Naissance', mariage: 'Mariage', deces: 'Décès' }

/** « Mariage 10 novembre 1877, Anderlecht », ou « Décès entre 1850 et 1890 » pour un fait sans date */
export function titreFait(f: FaitCherche): string {
  if (f.estime) return `${NOMS_FAITS[f.quoi]} entre ${f.de} et ${f.a}`
  const lieu = f.evenement?.lieu ? decouperLieu(f.evenement.lieu).nom : ''
  return `${f.evenement ? libelle(f.evenement) : NOMS_FAITS[f.quoi]} ${f.evenement?.date?.texte ?? f.de}${lieu ? ', ' + lieu : ''}`
}

const attendre = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, ko) => {
  const t = setTimeout(ok, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); ko(signal.reason) }, { once: true })
})

/** Au plus trois pages de dix lignes par requête : un nom très répandu donne trop de lignes pour tout lire */
const PAGES = 3

/** Cherche l'acte d'un fait dans Open Archives ; `complet` est faux quand il restait des lignes non lues */
export async function chercherActe(ind: Individu, fait: FaitCherche, signal?: AbortSignal): Promise<{ candidats: Candidat[]; complet: boolean }> {
  const docs: Doc[] = []
  let complet = true
  for (const url of requetesOpenArch(ind, fait)) {
    for (let page = 0; page < PAGES; page++) {
      const j = await json(`${url}&start=${page * 10}`, signal)
      const lot: Doc[] = j.response?.docs ?? []
      docs.push(...lot)
      const total = j.response?.number_found ?? 0
      await attendre(350, signal)
      if ((page + 1) * 10 >= total || !lot.length) break
      if (page === PAGES - 1) complet = false
    }
  }
  return { candidats: candidats(docs, ind, fait), complet }
}
