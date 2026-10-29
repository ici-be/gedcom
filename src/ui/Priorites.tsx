// Page Priorités : les faits à chercher chez les ancêtres, génération par génération, avec pour chacun les sources
// voisines (famille proche, même commune à la même époque) qui peuvent mener au bon registre.

import { Fragment } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { lienDansSource, libelle, nombre } from '../lib/format'
import { annee } from '../lib/gedcom/dates'
import { priorites, type Piste, type Priorite, type Quoi } from '../lib/priorites'
import { ecrire, lire } from '../lib/stockage'
import { Pagination, Pastille, Personne } from './commun'

interface Reglages { sansSource: boolean; avecPiste: boolean; quoi: Quoi | '' }

const PAR_PAGE = 40
const NOMS: Record<Quoi, string> = { naissance: 'Naissance', mariage: 'Mariage', deces: 'Décès' }
const GENERATIONS = ['', 'La personne de départ', 'Les parents', 'Les grands-parents', 'Les arrière-grands-parents', 'Les trisaïeuls']
const titreGeneration = (g: number) => GENERATIONS[g] ?? `Génération ${g}`

/** « geneanet.org » pour un lien, le texte (raccourci) sinon */
function Source({ s }: { s: string }) {
  const url = lienDansSource(s)
  if (url) {
    const site = /https?:\/\/(?:www\.)?([^/\s]+)/.exec(url)?.[1] ?? url
    const texte = s.replace(/\S*https?:\/\/\S+|www\.\S+/gi, '').replace(/[,;\s]+$/, '').trim()
    return <a class="pr-source" href={url} target="_blank" rel="noopener noreferrer" title={s}>{texte ? `${texte.slice(0, 60)}${texte.length > 60 ? '…' : ''} · ` : ''}{site} ↗</a>
  }
  return <span class="pr-source texte" title={s}>{s.length > 90 ? s.slice(0, 88) + '…' : s}</span>
}

function LignePiste({ d, p }: { d: Donnees; p: Piste }) {
  const quoi = libelle(p.evenement)
  const an = annee(p.evenement.date)
  const ou = p.evenement.lieu ? p.evenement.lieu.split(',')[0].trim() : ''
  const qui = p.lien === 'ses parents'
    ? <>{quoi} de ses parents</>
    : p.lien.startsWith('mariage de ')
      ? <>Mariage de {p.lien.slice(11)} <Personne d={d} id={p.id} prenoms={1} /></>
      : <>{quoi} de {p.lien && <>{p.lien} </>}<Personne d={d} id={p.id} prenoms={1} /></>
  return (
    <li class={p.voisine ? 'voisine' : undefined}>
      <span class="pr-qui">{qui}{(an || ou) && <span class="pr-quand">{[an, ou && `à ${ou}`].filter(Boolean).join(' ')}</span>}</span>
      <Source s={p.source} />
    </li>
  )
}

function Carte({ d, p }: { d: Donnees; p: Priorite }) {
  const famille = p.pistes.filter((x) => !x.voisine)
  const voisines = p.pistes.filter((x) => x.voisine)
  const indice = [
    p.annee !== undefined ? (p.estimee ? `vers ${p.annee} (estimé)` : p.evenement?.date?.texte ?? String(p.annee)) : '',
    p.commune ? (p.evenement?.lieu ? `à ${p.commune}` : `sans doute à ${p.commune}`) : '',
  ].filter(Boolean).join(' · ')
  return (
    <article class={'pr-carte ' + p.etat}>
      <header>
        <Pastille etat={p.etat} />
        <span class="pr-titre">
          <span class="pr-fait">{NOMS[p.quoi]}{p.etat === 'sans-source' ? ' sans source' : ' à trouver'}</span>
          <span class="pr-qui-principal">
            <Personne d={d} id={p.id} annees prenoms={2} />
            {p.conjoint && <> et <Personne d={d} id={p.conjoint} annees prenoms={2} /></>}
          </span>
        </span>
        <span class="pr-sosa" title="Numéro Sosa">{p.sosa}</span>
        <a class="pr-loupe" href={'#/recherches/' + encodeURIComponent(p.id)} title="Chercher dans les livres, journaux et archives" aria-label="Recherches externes">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2.5a4.5 4.5 0 1 1 0 9a4.5 4.5 0 1 1 0-9M10.3 10.3L14 14" /></svg>
        </a>
      </header>
      {indice && <p class="pr-indice">{indice}</p>}
      {famille.length > 0 && (
        <div class="pr-pistes">
          <span class="pr-etiquette">Dans la famille</span>
          <ul>{famille.map((x, i) => <LignePiste key={i} d={d} p={x} />)}</ul>
        </div>
      )}
      {voisines.length > 0 && (
        <div class="pr-pistes">
          <span class="pr-etiquette">Même commune, même époque</span>
          <ul>{voisines.map((x, i) => <LignePiste key={i} d={d} p={x} />)}</ul>
        </div>
      )}
      {!p.pistes.length && <p class="pr-sans-piste">Pas encore de source voisine dans l’arbre.</p>}
    </article>
  )
}

export function Priorites({ d }: { d: Donnees }) {
  const [r, setR] = useState<Reglages>(() => ({ sansSource: false, avecPiste: false, quoi: '', ...lire<Partial<Reglages>>('priorites', {}) }))
  const regler = (n: Partial<Reglages>) => { const x = { ...r, ...n }; setR(x); ecrire('priorites', x); setPage(0) }
  const [page, setPage] = useState(0)
  const toutes = useMemo(() => priorites(d, r.sansSource), [d, r.sansSource])
  const liste = toutes.filter((p) => (!r.quoi || p.quoi === r.quoi) && (!r.avecPiste || p.pistes.length))
  const pages = Math.ceil(liste.length / PAR_PAGE)
  const affichees = liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE)
  const avecPiste = toutes.filter((p) => p.pistes.length).length

  return (
    <section class="ecran priorites">
      <header class="titre-ecran">
        <h1>Priorités</h1>
        <p class="sous-titre">
          Ce qui manque chez vos ancêtres, des plus proches aux plus lointains. Pour chaque fait, les sources déjà trouvées
          autour (un frère baptisé deux ans plus tard, le mariage des parents, un voisin de la même commune) indiquent souvent le registre à ouvrir.
        </p>
      </header>

      <div class="panneau pr-reglages">
        <div class="pr-options">
          <label class={'rc-option' + (r.sansSource ? ' coche' : '')}>
            <input type="checkbox" checked={r.sansSource} onChange={(e) => regler({ sansSource: e.currentTarget.checked })} /> Inclure les faits notés sans source
          </label>
          <label class={'rc-option' + (r.avecPiste ? ' coche' : '')}>
            <input type="checkbox" checked={r.avecPiste} onChange={(e) => regler({ avecPiste: e.currentTarget.checked })} /> Seulement ceux qui ont une piste
          </label>
          <select value={r.quoi} onChange={(e) => regler({ quoi: e.currentTarget.value as Quoi | '' })} aria-label="Genre de fait">
            <option value="">Naissances, mariages et décès</option>
            <option value="naissance">Naissances</option>
            <option value="mariage">Mariages</option>
            <option value="deces">Décès</option>
          </select>
        </div>
        <p class="aide">
          {nombre(toutes.length)} fait{toutes.length > 1 ? 's' : ''} à chercher, dont {nombre(avecPiste)} avec au moins une piste
          {liste.length !== toutes.length && <> · {nombre(liste.length)} affiché{liste.length > 1 ? 's' : ''}</>}
        </p>
      </div>

      {!liste.length && <p class="aucun">{toutes.length ? 'Aucun fait ne correspond à ces réglages.' : 'Rien ne manque chez vos ancêtres : bravo !'}</p>}
      {affichees.map((p, i) => (
        <Fragment key={p.cle}>
          {(i === 0 || affichees[i - 1].generation !== p.generation) && (
            <h2 class="pr-generation">{titreGeneration(p.generation)} <span class="rch-compte">{liste.filter((x) => x.generation === p.generation).length}</span></h2>
          )}
          <Carte d={d} p={p} />
        </Fragment>
      ))}
      <Pagination page={page} pages={pages} aller={(n) => { setPage(n); window.scrollTo(0, 0) }} />
    </section>
  )
}
