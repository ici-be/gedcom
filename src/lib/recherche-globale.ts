// Recherche globale : un texte tapé dans le bandeau → personnes, lieux et métiers qui correspondent.

import type { Donnees } from './donnees'
import { communes } from './communes'
import { sansAccents } from './metiers'
import { nomComplet } from './parente'

export interface Resultat {
  genre: 'personne' | 'lieu' | 'metier'
  libelle: string
  /** Précision affichée à côté : années, contexte du lieu, nombre de personnes */
  detail: string
  lien: string
}

export interface IndexRecherche {
  personnes: { id: string; cherche: string }[]
  lieux: { lieu: string; nom: string; contexte: string; cherche: string; faits: number }[]
  metiers: { cle: string; titre: string; cherche: string; personnes: number }[]
}

/** Minuscules, sans accents, tirets et apostrophes comme des espaces */
export function simplifier(s: string): string {
  return sansAccents(s.toLowerCase()).replace(/[-'’]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function indexerRecherche(d: Donnees): IndexRecherche {
  const personnes = [...d.arbre.individus.values()].map((ind) => ({ id: ind.id, cherche: simplifier(ind.prenom + ' ' + ind.nom + ' ' + ind.nom + ' ' + ind.prenom) }))
  const lieux = communes(d.arbre, null, true).map((c) => ({ lieu: c.lieu, nom: c.nom, contexte: c.contexte, cherche: simplifier(c.nom + ' ' + c.contexte), faits: c.actes.length }))
  const metiers = [...d.metiers.metiers.values()].map((m) => ({
    cle: m.cle, titre: m.titre, personnes: m.personnes.size,
    cherche: simplifier(m.titre + ' ' + m.variantes.map((v) => v.libelle).join(' ')),
  }))
  return { personnes, lieux, metiers }
}

/** Chaque mot tapé doit se retrouver dans le texte (début de mot de préférence) */
function correspond(cherche: string, mots: string[]): number {
  let points = 0
  for (const m of mots) {
    const i = cherche.indexOf(m)
    if (i < 0) return 0
    points += i === 0 || cherche[i - 1] === ' ' ? 2 : 1
  }
  return points
}

function annees(d: Donnees, id: string): string {
  const ind = d.arbre.individus.get(id)
  if (!ind) return ''
  const an = (tags: string[]) => {
    const e = ind.evenements.find((x) => tags.includes(x.tag) && x.date)
    const m = e?.date?.texte.match(/\d{4}/)
    return m ? m[0] : ''
  }
  const n = an(['BIRT', 'BAPM', 'CHR'])
  const m = an(['DEAT', 'BURI'])
  return n && m ? `${n}–${m}` : n || (m ? '† ' + m : '')
}

export function chercher(d: Donnees, index: IndexRecherche, texte: string, max = 8): Resultat[] {
  const mots = simplifier(texte).split(' ').filter(Boolean)
  if (!mots.length || mots.join('').length < 2) return []
  const classe = <T,>(liste: T[], texteDe: (x: T) => string, departage: (x: T) => number) =>
    liste
      .map((x) => ({ x, p: correspond(texteDe(x), mots) }))
      .filter((r) => r.p > 0)
      .sort((a, b) => b.p - a.p || departage(b.x) - departage(a.x))
      .slice(0, max)
      .map((r) => r.x)
  const ancetre = (id: string) => (d.ancetres.has(id) ? 1 : 0)
  const pers = classe(index.personnes, (p) => p.cherche, (p) => ancetre(p.id)).map<Resultat>((p) => {
    const ind = d.arbre.individus.get(p.id)!
    return { genre: 'personne', libelle: nomComplet(ind), detail: annees(d, p.id), lien: '#/recherches/' + encodeURIComponent(p.id) }
  })
  const lieux = classe(index.lieux, (l) => l.cherche, (l) => l.faits).map<Resultat>((l) => ({
    genre: 'lieu', libelle: l.nom, detail: l.contexte, lien: '#/lieux/' + encodeURIComponent(l.lieu),
  }))
  const metiers = classe(index.metiers, (m) => m.cherche, (m) => m.personnes).map<Resultat>((m) => ({
    genre: 'metier', libelle: m.titre, detail: String(m.personnes), lien: '#/metiers/' + encodeURIComponent(m.cle),
  }))
  // personnes en tête, puis lieux et métiers, au plus `max` en tout
  return [...pers.slice(0, Math.max(max - 4, 4)), ...lieux.slice(0, 2), ...metiers.slice(0, 2)].slice(0, max)
}
