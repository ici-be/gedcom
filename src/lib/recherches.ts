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

/** Premier prénom seul : « Jean Baptiste » est rarement écrit ainsi dans les journaux */
export function nomRecherche(ind: Individu, tousPrenoms = false): Nom | undefined {
  const nom = ind.nom.trim()
  const prenom = (tousPrenoms ? ind.prenom : ind.prenom.split(/\s+/)[0] ?? '').trim()
  if (!nom || !prenom) return undefined
  return { prenom, nom, phrase: `"${prenom} ${nom}"` }
}

const e = encodeURIComponent

async function json(url: string): Promise<any> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(String(r.status))
  return r.json()
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
    url: (n) => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=${e(`(gallica all ${n.phrase})`)}`,
  },
  {
    id: 'belgicapress',
    nom: 'BelgicaPress (KBR)',
    detail: 'Presse belge numérisée',
    url: (n) => `https://www.belgicapress.be/pressshow.php?adv=0&all_q=${e(n.phrase)}&any_q=&exact_q=&none_q=&from_d=&to_d=&per_lang=&per=&lang=fr&per_type=0&per_sel=0`,
  },
  {
    id: 'retronews',
    nom: 'RetroNews (BnF)',
    detail: 'Presse française (accès partiel gratuit)',
    url: (n) => `https://www.retronews.fr/search#allTerms=${e(n.phrase)}&sort=score&publishedBounds=from&indexedBounds=from&page=1&searchIn=all&total=0`,
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
