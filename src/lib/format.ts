// Libellés en français des événements et des états.

import type { Evenement } from './gedcom/arbre'
import type { Etat } from './suivi'
import { locale, t } from './i18n'

const LIBELLES: Record<string, string> = {
  BIRT: 'Naissance', BAPM: 'Baptême', CHR: 'Baptême', CHRA: 'Baptême adulte', BARM: 'Bar-mitsva', BASM: 'Bat-mitsva',
  BLES: 'Bénédiction', CONF: 'Confirmation', FCOM: 'Première communion', ORDN: 'Ordination', ADOP: 'Adoption',
  DEAT: 'Décès', BURI: 'Inhumation', CREM: 'Crémation', PROB: 'Succession', WILL: 'Testament',
  MARR: 'Mariage', MARB: 'Bans', MARC: 'Contrat de mariage', MARL: 'Licence de mariage', MARS: 'Accord de mariage',
  ENGA: 'Fiançailles', DIV: 'Divorce', DIVF: 'Demande de divorce', ANUL: 'Annulation', SEP: 'Séparation',
  CENS: 'Recensement', RESI: 'Résidence', IMMI: 'Immigration', EMIG: 'Émigration', NATU: 'Naturalisation',
  GRAD: 'Diplôme', RETI: 'Retraite', EDUC: 'Études', MILI: 'Service militaire', TITL: 'Titre', OCCU: 'Profession',
  EVEN: 'Événement', FACT: 'Fait',
}

/** Types d'événements libres écrits en anglais par Geneanet */
const TYPES: Record<string, string> = { unmarried: 'Relation', residence: 'Résidence' }

export function libelle(e: Evenement): string {
  if ((e.tag === 'EVEN' || e.tag === 'FACT') && e.type) return TYPES[e.type.toLowerCase()] ?? e.type.charAt(0).toUpperCase() + e.type.slice(1)
  if (e.tag === 'OCCU' && e.type) return 'Profession : ' + e.type
  return LIBELLES[e.tag] ?? e.tag
}

export const NOMS_ETATS: Record<Etat, string> = {
  source: 'Sourcé',
  'sans-source': 'Sans source',
  manquant: 'Manquant',
  introuvable: 'Source introuvable',
  'sans-objet': 'Sans objet',
}

export function estLien(s: string): boolean {
  return /^(https?:\/\/|www\.)\S+$/i.test(s.trim())
}

/** Sépare une source qui contient une adresse web : texte + lien */
export function lienDansSource(s: string): string | undefined {
  const m = /(https?:\/\/\S+|www\.\S+)/i.exec(s)
  if (!m) return undefined
  return m[1].startsWith('www.') ? 'https://' + m[1] : m[1]
}

export function pourcent(n: number, total: number): string {
  if (!total) return '—'
  const p = (100 * n) / total
  return (p > 0 && p < 1 ? '<1' : Math.round(p)) + ' %'
}

export function nombre(n: number): string {
  return n.toLocaleString(locale())
}

/** Nom proposé pour le PDF d'un arbre imprimé : « Genealogie_Bruno_Veyckemans_2026-10-15 » (sans accents ni espaces) */
export function nomFichierArbre(prenom: string, nom: string, jour: string): string {
  const propre = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '')
  return [t('Genealogie'), propre(prenom.split(/\s+/)[0] ?? ''), propre(nom), jour].filter(Boolean).join('_')
}

/** Nom proposé pour le PDF de l'arbre du couple : « Genealogie_Cambier-Foulquet_2026-10-19 » (le nom de famille d'un seul s'ils sont identiques) */
export function nomFichierCouple(nom1: string, nom2: string, jour: string): string {
  const propre = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '')
  const noms = [propre(nom1), propre(nom2)].filter(Boolean)
  return [t('Genealogie'), [...new Set(noms)].join('-'), jour].filter(Boolean).join('_')
}
