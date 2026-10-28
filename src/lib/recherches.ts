// Recherches d'une personne dans des bases externes : un lien qui préremplit la recherche, et pour les bases
// qui l'autorisent depuis un navigateur (CORS), le nombre de résultats.

import type { Individu } from './gedcom/arbre'

export interface Source {
  id: string
  nom: string
  detail: string
  /** Lien vers la recherche préremplie */
  url: (nom: Nom) => string
  /** Nombre de résultats, pour les bases interrogeables depuis le navigateur */
  compter?: (nom: Nom) => Promise<number>
}

export interface Nom { prenom: string; nom: string; /** « Prénom Nom », entre guillemets */ phrase: string }

/** Sans accents ni tréma : les bases numérisées (texte océrisé) n'ont pas « Lamourÿ » mais « Lamoury » */
const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Premier prénom seul : « Jean Baptiste » est rarement écrit ainsi dans les journaux */
export function nomRecherche(ind: Individu, tousPrenoms = false): Nom | undefined {
  const nom = sansAccents(ind.nom)
  const prenom = sansAccents(tousPrenoms ? ind.prenom : ind.prenom.split(/\s+/)[0] ?? '')
  if (!nom || !prenom) return undefined
  return { prenom, nom, phrase: `"${prenom} ${nom}"` }
}

const e = encodeURIComponent

async function json(url: string): Promise<any> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
}

const liste = { data: [], size: 5 }
const filtres = { data: { filters: [], selected: [] }, size: 5 }
const FACETTES_RETRONEWS = {
  date: {}, location: liste, organization: liste, person: liste, publicationId: filtres, workId: filtres,
  publicationLocation: { data: {}, size: 5 }, thematic: filtres,
}

export const SOURCES: Source[] = [
  {
    id: 'google-livres',
    nom: 'Google Livres',
    detail: 'Livres numérisés, plein texte',
    url: (n) => `https://www.google.com/search?tbm=bks&q=${e(n.phrase)}`,
    compter: async (n) => (await json(`https://www.googleapis.com/books/v1/volumes?maxResults=1&q=${e(n.phrase)}`)).totalItems ?? 0,
  },
  {
    id: 'gallica',
    nom: 'Gallica (BnF)',
    detail: 'Livres, presse et manuscrits français',
    // le prénom à un mot au plus du nom donne de meilleurs résultats que la phrase exacte
    url: (n) => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&exactSearch=false&collapsing=true&version=1.2&query=${e(`(( text all "${n.prenom}" prox/unit=word/distance=1 "${n.nom}"))`)}&suggest=10&keywords=`,
  },
  {
    id: 'belgicapress',
    nom: 'BelgicaPress (KBR)',
    // sans guillemets : avec, les mots ne sont pas surlignés sur les scans
    detail: 'Presse belge numérisée',
    url: (n) => `https://www.belgicapress.be/pressshow.php?adv=0&all_q=${e(`${n.prenom} ${n.nom}`)}&any_q=&exact_q=&none_q=&from_d=&to_d=&per_lang=&per=&lang=fr&per_type=0&per_sel=0`,
  },
  {
    id: 'retronews',
    nom: 'RetroNews (BnF)',
    detail: 'Presse française (accès partiel gratuit)',
    // la recherche simple de RetroNews lit une requête JSON en base64 dans « q »
    url: (n) => {
      const requete = { search: { type: 'simple', criteria: { searchText: `${n.prenom} ${n.nom}`.toLowerCase(), selectedFacets: FACETTES_RETRONEWS }, page: 0, sort: 'relevance' }, sort: 'relevance' }
      return `https://www.retronews.fr/search?page=1&q=${e(btoa(e(JSON.stringify(requete))))}`
    },
  },
  {
    id: 'delpher',
    nom: 'Delpher',
    detail: 'Journaux et livres néerlandais (Pays-Bas, Flandre)',
    url: (n) => `https://www.delpher.nl/nl/kranten/results?query=${e(n.phrase)}&coll=ddd`,
  },
  {
    id: 'archive-org',
    nom: 'Internet Archive',
    detail: 'Livres et revues numérisés, plein texte',
    url: (n) => `https://archive.org/search?query=${e(n.phrase)}&sin=TXT`,
    compter: async (n) => (await json(`https://archive.org/advancedsearch.php?output=json&rows=0&q=${e(n.phrase)}`)).response?.numFound ?? 0,
  },
  {
    id: 'wikisource',
    nom: 'Wikisource (fr)',
    detail: 'Textes du domaine public',
    url: (n) => `https://fr.wikisource.org/w/index.php?fulltext=1&search=${e(n.phrase)}`,
    compter: async (n) => (await json(`https://fr.wikisource.org/w/api.php?action=query&list=search&srlimit=1&format=json&origin=*&srsearch=${e(n.phrase)}`)).query?.searchinfo?.totalhits ?? 0,
  },
  {
    id: 'europeana',
    nom: 'Europeana',
    detail: 'Patrimoine numérisé des bibliothèques et archives européennes',
    url: (n) => `https://www.europeana.eu/fr/search?query=${e(n.phrase)}`,
  },
  {
    id: 'familysearch',
    nom: 'FamilySearch',
    detail: 'Registres et index généalogiques (compte gratuit)',
    url: (n) => `https://www.familysearch.org/search/record/results?q.givenName=${e(n.prenom)}&q.surname=${e(n.nom)}`,
  },
  {
    id: 'geneanet',
    nom: 'Geneanet',
    detail: 'Arbres et relevés des autres généalogistes',
    url: (n) => `https://www.geneanet.org/fonds/individus/?nom=${e(n.nom)}&prenom=${e(n.prenom)}&go=1`,
  },
  {
    id: 'google',
    nom: 'Google',
    detail: 'Le web en général',
    url: (n) => `https://www.google.com/search?q=${e(n.phrase)}`,
  },
]
