// Recherches qui s'exécutent toutes seules : les bases qui répondent à une page web (API ouverte) sont interrogées
// d'ici, et leurs résultats s'affichent sans ouvrir d'onglet.
// - Open Archives (openarchieven.nl) : index d'actes des Pays-Bas et des Archives de l'État en Belgique. Pour chaque
//   fait daté d'une personne (naissance, mariage, décès), on y cherche l'acte ; les prénoms y sont en latin ou en
//   néerlandais (« Petrus » pour Pierre), d'où une recherche par initiale puis un tri sur les variantes du prénom.
// - Internet Archive, Wikisource, Europeana : mentions du nom dans des livres et documents numérisés.

import type { Evenement, Individu } from './gedcom/arbre'
import type { Donnees } from './donnees'
import { annee } from './gedcom/dates'
import { cleGeo, decouper } from './geo'
import { clePrenom, variantesPrenom } from './prenoms'
import { aChercher } from './suivi'
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
  evenement: Evenement
  annee: number
  /** Pas encore de source dans l'arbre */
  aSourcer: boolean
  conjoint?: Individu
}

/** Les faits datés d'une personne qu'on peut chercher dans un index : naissance ou baptême, mariages, décès ou inhumation */
export function faitsCherches(d: Donnees, ind: Individu): FaitCherche[] {
  const s = d.suivis.get(ind.id)
  if (!s) return []
  const faits: FaitCherche[] = []
  const ajouter = (quoi: Quoi, f: { etat: Parameters<typeof aChercher>[0]; evenement?: Evenement; conjoint?: string }) => {
    const an = annee(f.evenement?.date)
    if (!f.evenement || an === undefined) return
    faits.push({ quoi, evenement: f.evenement, annee: an, aSourcer: aChercher(f.etat), conjoint: f.conjoint ? d.arbre.individus.get(f.conjoint) : undefined })
  }
  ajouter('naissance', s.naissance)
  for (const m of s.mariages) ajouter('mariage', m)
  ajouter('deces', s.deces)
  return faits
}

/** Une ligne d'index d'Open Archives */
export interface Doc {
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

/** Les requêtes à poser pour un fait : une par initiale des formes connues du premier prénom (« G* », « W* » pour Guillaume) */
export function requetesOpenArch(ind: Individu, fait: FaitCherche): string[] {
  const prenom = ind.prenom.split(/\s+/)[0] ?? ''
  const nom = sansAccents(ind.nom).trim()
  if (!prenom || !nom) return []
  const initiales = [...new Set(variantesPrenom(prenom).map((v) => v[0]).filter((c) => /[a-z]/.test(c)))]
  return initiales.map((i) => `https://api.openarch.nl/1.0/records/search.json?name=${e(`${i.toUpperCase()}* ${nom} ${fait.annee}`)}&lang=fr&number=10`)
}

/** Parmi les lignes d'index, celles qui peuvent être l'acte cherché : même type d'acte, même rôle, un prénom en commun, à un an près */
export function candidats(docs: Doc[], ind: Individu, fait: FaitCherche): Candidat[] {
  const cles = new Set(ind.prenom.split(/[\s-]+/).filter(Boolean).map(clePrenom))
  const nom = new Set(mots(ind.nom))
  const commune = fait.evenement.lieu ? cleGeo(decouper(fait.evenement.lieu).commune) : ''
  const jour = fait.evenement.date?.debut
  const vus = new Set<string>()
  const res: (Candidat & { rang: number })[] = []
  for (const doc of docs) {
    if (!doc.url || vus.has(doc.url)) continue
    if (!TYPES[fait.quoi].test(doc.eventtype ?? '') || !ROLES[fait.quoi].test((doc.relationtype ?? '').trim())) continue
    const an = doc.eventdate?.year
    if (an !== undefined && Math.abs(an - fait.annee) > 1) continue
    const prenoms = mots((doc.personname ?? '').split('>')[0]).filter((m) => !nom.has(m))
    if (!prenoms.some((p) => cles.has(clePrenom(p)))) continue
    vus.add(doc.url)
    const lieux = (Array.isArray(doc.eventplace) ? doc.eventplace : doc.eventplace ? [doc.eventplace] : []).filter(Boolean)
    const dateExacte = !!jour?.jour && !!jour.mois && doc.eventdate?.day === jour.jour && doc.eventdate?.month === jour.mois && an === jour.annee
    const memeLieu = !!commune && lieux.some((l) => cleGeo(l) === commune)
    const date = [doc.eventdate?.day, doc.eventdate?.month, an].filter(Boolean).join('/')
    res.push({
      titre: `${doc.eventtype} ${date}${lieux.length ? ', ' + lieux.join(', ') : ''} : ${(doc.personname ?? '').split('>')[0]}`,
      detail: [doc.sourcetype, doc.archive_org].filter(Boolean).join(' · '),
      url: doc.url, dateExacte, memeLieu, rang: (dateExacte ? 2 : 0) + (memeLieu ? 1 : 0),
    })
  }
  return res.sort((a, b) => b.rang - a.rang).map(({ rang: _, ...c }) => c)
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
