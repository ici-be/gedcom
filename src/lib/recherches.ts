// Recherches d'une personne dans des bases externes : un lien qui préremplit la recherche.

import type { Individu } from './gedcom/arbre'

export interface Source {
  id: string
  nom: string
  detail: string
  categorie: Categorie
  /** Lien vers la recherche préremplie */
  url: (nom: Nom) => string
}

export type Categorie = 'livres' | 'presse' | 'genealogie'

export const CATEGORIES: { id: Categorie; titre: string }[] = [
  { id: 'livres', titre: 'Bibliothèques numérisées' },
  { id: 'presse', titre: 'Presse ancienne' },
  { id: 'genealogie', titre: 'Généalogie et web' },
]

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

const liste = { data: [], size: 5 }
const filtres = { data: { filters: [], selected: [] }, size: 5 }
const FACETTES_RETRONEWS = {
  date: {}, location: liste, organization: liste, person: liste, publicationId: filtres, workId: filtres,
  publicationLocation: { data: {}, size: 5 }, thematic: filtres,
}

export const SOURCES: Source[] = [
  {
    id: 'google-livres',
    categorie: 'livres',
    nom: 'Google Livres',
    detail: 'Livres numérisés, plein texte',
    url: (n) => `https://www.google.com/search?tbm=bks&q=${e(n.phrase)}`,
  },
  {
    id: 'gallica',
    categorie: 'livres',
    nom: 'Gallica (BnF)',
    detail: 'Livres, presse et manuscrits français',
    // le prénom à un mot au plus du nom donne de meilleurs résultats que la phrase exacte
    url: (n) => `https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&exactSearch=false&collapsing=true&version=1.2&query=${e(`(( text all "${n.prenom}" prox/unit=word/distance=1 "${n.nom}"))`)}&suggest=10&keywords=`,
  },
  {
    id: 'belgicapress',
    categorie: 'presse',
    nom: 'BelgicaPress (KBR)',
    // sans guillemets : avec, les mots ne sont pas surlignés sur les scans
    detail: 'Presse belge numérisée',
    url: (n) => `https://www.belgicapress.be/pressshow.php?adv=0&all_q=${e(`${n.prenom} ${n.nom}`)}&any_q=&exact_q=&none_q=&from_d=&to_d=&per_lang=&per=&lang=fr&per_type=0&per_sel=0`,
  },
  {
    id: 'retronews',
    categorie: 'presse',
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
    categorie: 'presse',
    nom: 'Delpher',
    detail: 'Journaux et livres néerlandais (Pays-Bas, Flandre)',
    url: (n) => `https://www.delpher.nl/nl/kranten/results?query=${e(n.phrase)}&coll=ddd`,
  },
  {
    id: 'archive-org',
    categorie: 'livres',
    nom: 'Internet Archive',
    detail: 'Livres et revues numérisés, plein texte',
    url: (n) => `https://archive.org/search?query=${e(n.phrase)}&sin=TXT`,
  },
  {
    id: 'wikisource',
    categorie: 'livres',
    nom: 'Wikisource (fr)',
    detail: 'Textes du domaine public',
    url: (n) => `https://fr.wikisource.org/w/index.php?fulltext=1&search=${e(n.phrase)}`,
  },
  {
    id: 'europeana',
    categorie: 'livres',
    nom: 'Europeana',
    detail: 'Patrimoine numérisé des bibliothèques et archives européennes',
    url: (n) => `https://www.europeana.eu/fr/search?query=${e(n.phrase)}`,
  },
  {
    id: 'familysearch',
    categorie: 'genealogie',
    nom: 'FamilySearch',
    detail: 'Registres et index généalogiques (compte gratuit)',
    url: (n) => `https://www.familysearch.org/search/record/results?q.givenName=${e(n.prenom)}&q.surname=${e(n.nom)}`,
  },
  {
    id: 'geneanet',
    categorie: 'genealogie',
    nom: 'Geneanet',
    detail: 'Arbres et relevés des autres généalogistes',
    url: (n) => `https://www.geneanet.org/fonds/individus/?nom=${e(n.nom)}&prenom=${e(n.prenom)}&go=1`,
  },
  {
    id: 'google',
    categorie: 'genealogie',
    nom: 'Google',
    detail: 'Le web en général',
    url: (n) => `https://www.google.com/search?q=${e(n.phrase)}`,
  },
]
