// Petits éléments partagés par les écrans.

import { useMemo, useState } from 'preact/hooks'
import type { Evenement, Individu } from '../lib/gedcom/arbre'
import type { Donnees, Perimetre } from '../lib/donnees'
import type { Etat, Fait } from '../lib/suivi'
import { annee } from '../lib/gedcom/dates'
import { decouperLieu } from '../lib/communes'
import { NOMS_ETATS, libelle, lienDansSource } from '../lib/format'
import { nomComplet } from '../lib/parente'

/** Recherche sans accents ni majuscules */
export function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const SYMBOLES: Record<Etat, string> = { source: '✓', 'sans-source': '!', manquant: '✕', 'sans-objet': '–' }

export function Pastille({ etat }: { etat: Etat }) {
  return (
    <span class={'pastille ' + etat} title={NOMS_ETATS[etat]} aria-label={NOMS_ETATS[etat]}>
      {SYMBOLES[etat]}
    </span>
  )
}

/** Badge d'une source : « S » bleu, lien vers la source en ligne ; « T » orange, source en texte (cliquer l'affiche) */
function BadgeSource({ s }: { s: string }) {
  const [ouvert, setOuvert] = useState(false)
  const url = lienDansSource(s)
  if (url) {
    return <a class="badge-source lien-source" href={url} target="_blank" rel="noopener noreferrer" title={s} aria-label={'Source : ' + s}>S</a>
  }
  return (
    <span class="source-texte-conteneur">
      <button type="button" class="badge-source texte" title={s} aria-label={'Source : ' + s} aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>T</button>
      {ouvert && <span class="bulle-source" role="note">{s}</span>}
    </span>
  )
}

export function Sources({ sources }: { sources: string[] }) {
  if (!sources.length) return null
  return (
    <span class="sources">
      {sources.map((s, i) => <BadgeSource key={i} s={s} />)}
    </span>
  )
}

/** Date et commune d'un événement, sur deux lignes */
export function DateLieu({ e, prefixe, sources }: { e?: Evenement; prefixe?: boolean; sources?: boolean }) {
  if (!e) return null
  const commune = e.lieu ? decouperLieu(e.lieu).nom : ''
  const type = prefixe && e.tag !== 'BIRT' && e.tag !== 'DEAT' && e.tag !== 'MARR' ? libelle(e).toLowerCase() + ' ' : ''
  return (
    <span class="date-lieu">
      <span>
        {type}{e.date?.texte || (e.avere && !e.lieu ? 'date inconnue' : '')}
        {sources && e.sources.length > 0 && <> <Sources sources={e.sources} /></>}
      </span>
      {commune && <span class="lieu" title={e.lieu}>{commune}</span>}
    </span>
  )
}

export function CelluleFait({ f }: { f: Fait }) {
  if (f.etat === 'sans-objet') return <span class="vide">—</span>
  return (
    <span class="fait">
      <Pastille etat={f.etat} />
      <DateLieu e={f.evenement} prefixe sources />
    </span>
  )
}

export function Annees({ ind }: { ind: Individu }) {
  const n = annee(ind.evenements.find((e) => e.tag === 'BIRT' && e.date)?.date ?? ind.evenements.find((e) => (e.tag === 'BAPM' || e.tag === 'CHR') && e.date)?.date)
  const d = annee(ind.evenements.find((e) => e.tag === 'DEAT' && e.date)?.date ?? ind.evenements.find((e) => e.tag === 'BURI' && e.date)?.date)
  if (n === undefined && d === undefined) return null
  return <span class="annees">{n ?? '?'}{d !== undefined ? '–' + d : ''}</span>
}

/** Nom de la personne, avec lien vers sa fiche en ligne si l'adresse de l'arbre est connue */
export function Personne({ d, id, annees }: { d: Donnees; id: string; annees?: boolean }) {
  const ind = d.arbre.individus.get(id)
  if (!ind) return <span class="vide">?</span>
  const url = d.lien(ind)
  const nom = nomComplet(ind)
  return (
    <span class="personne">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title={d.homonymes.has(id) ? 'Homonymes : ouvre la recherche en ligne' : 'Ouvrir la fiche en ligne'}>
          {nom}
        </a>
      ) : (
        nom
      )}
      {annees && <> <Annees ind={ind} /></>}
    </span>
  )
}

/** Choisir une personne par son nom */
export function ChoixPersonne({ d, valeur, choisir }: { d: Donnees; valeur: string; choisir: (id: string) => void }) {
  const [texte, setTexte] = useState('')
  const resultats = useMemo(() => {
    const mots = normaliser(texte).split(/\s+/).filter(Boolean)
    if (!mots.length) return []
    const r: Individu[] = []
    for (const ind of d.arbre.individus.values()) {
      const n = normaliser(ind.prenom + ' ' + ind.nom)
      if (mots.every((m) => n.includes(m))) r.push(ind)
      if (r.length >= 12) break
    }
    return r
  }, [texte, d])
  const actuel = d.arbre.individus.get(valeur)
  return (
    <div class="choix-personne">
      <div class="actuel">{actuel ? <Personne d={d} id={actuel.id} annees /> : <span class="vide">aucune</span>}</div>
      <input type="search" placeholder="Chercher un nom…" value={texte} onInput={(e) => setTexte(e.currentTarget.value)} aria-label="Chercher une personne" />
      {resultats.length > 0 && (
        <ul class="resultats">
          {resultats.map((ind) => (
            <li key={ind.id}>
              <button type="button" onClick={() => { choisir(ind.id); setTexte('') }}>
                {nomComplet(ind)} <Annees ind={ind} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Pagination({ page, pages, aller }: { page: number; pages: number; aller: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav class="pagination" aria-label="Pages">
      <button type="button" disabled={page === 0} onClick={() => aller(page - 1)}>‹ Précédent</button>
      <span>Page {page + 1} sur {pages}</span>
      <button type="button" disabled={page >= pages - 1} onClick={() => aller(page + 1)}>Suivant ›</button>
    </nav>
  )
}

export function Barre({ n, total }: { n: number; total: number }) {
  const p = total ? Math.round((100 * n) / total) : 0
  return (
    <span class="barre" role="img" aria-label={`${p} % sourcés`}>
      <span style={{ width: p + '%' }} />
    </span>
  )
}

const PERIMETRES: { id: Perimetre; texte: string }[] = [
  { id: 'ancetres', texte: 'Ancêtres' },
  { id: 'ancetres-fratries', texte: '+ frères et sœurs' },
  { id: 'tous', texte: 'Tout l’arbre' },
]

/** Bouton qui remet les filtres d'un tableau à « tout afficher » ; il dit combien sont actifs, et lesquels au survol */
export function EffacerFiltres({ actifs, effacer }: { actifs: string[]; effacer: () => void }) {
  const n = actifs.length
  return (
    <button type="button" class={'bouton discret effacer-filtres' + (n ? ' actif' : '')} onClick={effacer} disabled={!n} title={n ? 'Filtres actifs : ' + actifs.join(' · ') : undefined}>
      {n ? `✕ Effacer ${n > 1 ? `les ${n} filtres` : 'le filtre'}` : 'Aucun filtre'}
    </button>
  )
}

export function ChoixPerimetre({ valeur, changer }: { valeur: Perimetre; changer: (p: Perimetre) => void }) {
  return (
    <div class="segments" role="radiogroup" aria-label="Qui afficher">
      {PERIMETRES.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={valeur === p.id} class={valeur === p.id ? 'actif' : ''} onClick={() => changer(p.id)}>
          {p.texte}
        </button>
      ))}
    </div>
  )
}

export interface Tri<K extends string> { cle: K; sens: 1 | -1 }

/** En-tête de colonne cliquable : un premier clic trie dans le sens naturel de la colonne, un second l'inverse */
export function EnTeteTri<K extends string>({ cle, tri, trier, texte, sensInitial = 1, classe }: {
  cle: K
  tri: Tri<K>
  trier: (t: Tri<K>) => void
  texte: string
  /** 1 = croissant (noms, dates), -1 = décroissant (nombres) */
  sensInitial?: 1 | -1
  classe?: string
}) {
  const actif = tri.cle === cle
  return (
    <th class={classe} aria-sort={actif ? (tri.sens === 1 ? 'ascending' : 'descending') : undefined}>
      <button type="button" class="tri" onClick={() => trier(actif ? { cle, sens: tri.sens === 1 ? -1 : 1 } : { cle, sens: sensInitial })}>
        {texte}<span class="fleche" aria-hidden="true">{actif ? (tri.sens === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}
