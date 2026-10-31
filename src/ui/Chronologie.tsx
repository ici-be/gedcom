// Chronologie d'une personne : sa vie, celle de ses proches et l'histoire qu'elle a traversée, sur une même ligne du temps.

import '@fontsource/fraunces/latin-400.css'
import { Fragment } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { chronologie, marquantes, type Etape, type Genre, type Nature } from '../lib/chronologie'
import { nomComplet } from '../lib/parente'
import { ecrire, lire } from '../lib/stockage'
import { ChoixPersonne, Pastille, Photo, usePhotos, CasePhotos } from './commun'
import { IconeEvenement, lienEvenement, useEvenements } from './Evenements'

const lien = (id: string) => '#/chronologie/' + encodeURIComponent(id)
/** Événements historiques gardés par défaut (les plus marquants) */
const HISTOIRE_MAX = 12

const ICONES: Record<Nature, string> = {
  naissance: 'M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2-5-6-5 0 3 2 5 6 5z',
  union: 'M9 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM15 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  deces: 'M12 3v18M6 9h12',
  metier: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  lieu: 'M12 21s6-5.5 6-10.5a6 6 0 0 0-12 0C6 15.5 12 21 12 21zM12 8.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4',
  autre: 'M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7',
}

function Icone({ nature }: { nature: Nature }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d={ICONES[nature]} />
    </svg>
  )
}

/** Les âges de la vie, pour découper la ligne en grandes parties */
const ETAPES_DE_VIE: [number, string][] = [[0, 'Enfance'], [15, 'Jeunesse'], [25, 'Âge adulte'], [60, 'Vieillesse']]
const etapeDeVie = (age: number) => [...ETAPES_DE_VIE].reverse().find(([a]) => age >= a)![1]

interface GroupeAnnee { annee: number; etapes: Etape[]; age?: number; approx?: boolean }

const anneesTexte = (a: number) => `${a} an${a > 1 ? 's' : ''}`

export function Chronologie({ d, id }: { d: Donnees; id?: string }) {
  const cible = id && d.arbre.individus.has(id) ? id : d.racine
  const ind = d.arbre.individus.get(cible)!
  const photos = usePhotos(d)
  const ev = useEvenements(d, true)
  const vecus = ev?.etat === 'pret' ? ev.index.parPersonne.get(cible) : undefined
  const [genres, setGenresBrut] = useState<Genre[]>(() => lire('chronoGenres', ['perso', 'proche', 'histoire']))
  const [toutes, setToutes] = useState(false)
  const setGenres = (g: Genre[]) => { setGenresBrut(g); ecrire('chronoGenres', g) }

  const c = useMemo(() => chronologie(d, cible, vecus ?? []), [d, cible, vecus])
  const garde = useMemo(() => (c ? marquantes(c.etapes, HISTOIRE_MAX) : new Set<string>()), [c])
  const nbHistoire = c?.etapes.filter((e) => e.genre === 'histoire').length ?? 0

  const visibles = useMemo(() => (c?.etapes ?? []).filter((e) => genres.includes(e.genre) && (e.genre !== 'histoire' || toutes || garde.has(e.cle))), [c, genres, toutes, garde])
  const groupes = useMemo(() => {
    const m: GroupeAnnee[] = []
    for (const e of visibles) {
      if (e.annee === undefined) continue
      const g = m[m.length - 1]
      if (g && g.annee === e.annee) g.etapes.push(e)
      else m.push({ annee: e.annee, etapes: [e], age: c?.naissance !== undefined ? e.annee - c.naissance : undefined })
    }
    return m
  }, [visibles, c])
  const sansDate = visibles.filter((e) => e.annee === undefined)

  if (!c) return null
  const basculer = (g: Genre) => setGenres(genres.includes(g) ? genres.filter((x) => x !== g) : [...genres, g])
  const nbParGenre = (g: Genre) => c.etapes.filter((e) => e.genre === g).length
  const sexe = ind.sexe === 'F' ? 'f' : ind.sexe === 'M' ? 'h' : ''
  const vie = c.naissance !== undefined || c.deces !== undefined
    ? `${c.naissance ?? '?'} – ${c.deces ?? (c.naissance !== undefined && new Date().getFullYear() - c.naissance < 100 ? '' : '?')}`
    : ''

  // la frise d'ensemble : la vie en un coup d'œil, de la naissance au décès
  const debutAn = Math.floor(c.debut / 10000), finAn = Math.floor(c.fin / 10000)
  const etendue = Math.max(1, finAn - debutAn)
  const pos = (tri: number) => Math.min(100, Math.max(0, (tri / 10000 - debutAn) / etendue * 100))
  const pas = etendue > 80 ? 20 : etendue > 40 ? 10 : etendue > 15 ? 5 : 1
  const reperes: number[] = []
  for (let a = Math.ceil(debutAn / pas) * pas; a <= finAn; a += pas) reperes.push(a)
  const aller = (e: Event, cle: string) => {
    e.preventDefault()
    const el = document.getElementById(cle)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('ch-vise')
    void el.getBoundingClientRect()
    el.classList.add('ch-vise')
  }

  let derniereAnnee: number | undefined
  let etapePrec: string | undefined

  const carte = (e: Etape) => (
    <article key={e.cle} id={e.cle} class={`ch-carte ${e.genre} ${e.nature}${e.nature === 'naissance' && e.genre === 'perso' && e.annee === c.naissance ? ' borne' : ''}${e.nature === 'deces' && e.genre === 'perso' && e.annee === c.deces ? ' borne' : ''}`}>
      <span class="ch-pastille">{e.genre === 'histoire' ? <IconeEvenement type={e.type ?? ''} classe="" /> : <Icone nature={e.nature} />}</span>
      <div class="ch-texte">
        <div class="ch-ligne-titre">
          <h3>
            {e.genre === 'histoire'
              ? <a href={lienEvenement(e.idHistoire!)}>{e.titre}</a>
              : e.titre}
          </h3>
          {e.relation && e.qui && <a class="ch-relation" href={lien(e.qui)} title="Voir sa chronologie">{e.relation}</a>}
          {e.genre === 'histoire' && e.type && <span class="ch-relation histoire">{TYPES_HISTOIRE[e.type] ?? e.type}</span>}
          {e.etat && e.genre === 'perso' && <Pastille etat={e.etat} />}
        </div>
        <p class="ch-meta">
          {e.date && <span class="ch-date">{e.date}</span>}
          {e.lieu && (
            <>
              {e.date && <span class="ch-sep" aria-hidden="true">·</span>}
              {e.genre === 'histoire' ? <span>{e.probable ? 'probablement ' : ''}près de {e.lieu.split(',')[0]}{e.detail ? ` (${e.detail})` : ''}</span> : <a href={'#/lieux/' + encodeURIComponent(e.lieu)}>{e.lieu}</a>}
            </>
          )}
          {e.genre !== 'histoire' && e.detail && <><span class="ch-sep" aria-hidden="true">·</span><span>{e.detail}</span></>}
        </p>
      </div>
    </article>
  )

  return (
    <section class="ecran chronologie">
      <header class="titre-ecran">
        <h1 data-titre={`Chronologie de ${nomComplet(ind)}`}>Chronologie</h1>
        <p class="sous-titre">La vie d’une personne année après année, avec ce qui arrive à ses proches et l’histoire qu’elle traverse. Chaque proche mène à sa propre chronologie.</p>
      </header>

      <section class="panneau ch-choix">
        <div class="ch-choix-ligne">
          <ChoixPersonne d={d} valeur={cible} choisir={(n) => { location.hash = lien(n) }} />
          <a class="bouton discret" href={'#/recit/' + encodeURIComponent(cible)}>Récit</a>
          {cible !== d.racine && <a class="bouton discret" href={'#/parente/' + encodeURIComponent(d.racine) + '/' + encodeURIComponent(cible)}>Parenté</a>}
        </div>
      </section>

      <section class={'ch-hero ' + sexe}>
        <Photo ind={photos.afficher ? ind : undefined} classe="ch-portrait" />
        <div class="ch-hero-texte">
          <h2>{ind.prenom || '?'} <span class="ch-nom">{ind.nom || '?'}</span></h2>
          <p class="ch-vie">
            {vie}
            {c.ageDeces !== undefined && <span> · {anneesTexte(c.ageDeces)}</span>}
          </p>
          <ul class="ch-chiffres">
            {c.unions > 0 && <li><strong>{c.unions}</strong> {c.unions > 1 ? 'unions' : 'union'}</li>}
            {c.enfants > 0 && <li><strong>{c.enfants}</strong> {c.enfants > 1 ? 'enfants' : 'enfant'}</li>}
            {c.lieux > 0 && <li><strong>{c.lieux}</strong> {c.lieux > 1 ? 'lieux' : 'lieu'}</li>}
            {nbHistoire > 0 && <li><strong>{nbHistoire}</strong> événement{nbHistoire > 1 ? 's' : ''} historique{nbHistoire > 1 ? 's' : ''}</li>}
          </ul>
        </div>
      </section>

      {c.debut > 0 && (
        <section class="ch-frise" aria-label="La vie en un coup d’œil">
          <div class="ch-piste">
            <div class="ch-vie-barre" />
            {visibles.filter((e) => e.annee !== undefined).map((e) => (
              <a key={e.cle} href={'#' + e.cle} onClick={(ev) => aller(ev, e.cle)} class={`ch-point ${e.genre}`} style={{ left: pos(e.tri) + '%' }} title={`${e.date} · ${e.titre}`} aria-label={`${e.date} ${e.titre}`} />
            ))}
          </div>
          <div class="ch-reperes">
            {reperes.map((a) => <span key={a} style={{ left: pos(a * 10000) + '%' }}>{a}</span>)}
          </div>
        </section>
      )}

      <div class="ch-filtres">
        {([['perso', 'Sa vie'], ['proche', 'Ses proches'], ['histoire', 'L’histoire']] as [Genre, string][]).map(([g, nom]) => (
          <label key={g} class={`ch-filtre ${g}${genres.includes(g) ? ' actif' : ''}`}>
            <input type="checkbox" checked={genres.includes(g)} onChange={() => basculer(g)} />
            <span class="ch-filtre-point" />
            {nom} <small>{nbParGenre(g)}</small>
          </label>
        ))}
        {nbHistoire > HISTOIRE_MAX && genres.includes('histoire') && (
          <label class="case">
            <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.currentTarget.checked)} />
            <span>Tous les événements historiques ({nbHistoire})</span>
          </label>
        )}
        <CasePhotos p={photos} classe="case" />
      </div>
      {ev?.etat === 'attente' && <p class="aide"><span class="rouet petit" /> Recherche des événements historiques…</p>}
      {ev?.etat === 'erreur' && <p class="aide">Les événements historiques n’ont pas pu être chargés ; réessayez une fois en ligne.</p>}

      {!groupes.length && !sansDate.length && <p class="aucun">Aucun fait daté pour cette personne.</p>}

      <ol class="ch-ligne">
        {groupes.map((g) => {
          const trou = derniereAnnee !== undefined ? g.annee - derniereAnnee : 0
          derniereAnnee = g.annee
          const vieAvant = g.age !== undefined && g.age >= 0 ? etapeDeVie(g.age) : undefined
          const avant = etapePrec
          if (vieAvant) etapePrec = vieAvant
          return (
            <Fragment key={g.annee}>
              {vieAvant && vieAvant !== avant && <li class="ch-etape-vie"><span>{vieAvant}</span></li>}
              {trou >= 8 && <li class="ch-trou" aria-hidden="true"><span>{trou} ans plus tard</span></li>}
              <li class="ch-annee">
                <div class="ch-rail">
                  <span class="ch-an">{g.annee}</span>
                  {g.age !== undefined && g.age >= 0 && <span class="ch-age">{g.age === 0 ? 'naissance' : anneesTexte(g.age)}</span>}
                </div>
                <div class="ch-cartes">{g.etapes.map(carte)}</div>
              </li>
            </Fragment>
          )
        })}
      </ol>

      {sansDate.length > 0 && (
        <section class="ch-sans-date">
          <h2>Sans date</h2>
          <div class="ch-cartes">{sansDate.map(carte)}</div>
        </section>
      )}
    </section>
  )
}

const TYPES_HISTOIRE: Record<string, string> = {
  bataille: 'Bataille', siege: 'Siège', bombardement: 'Bombardement', massacre: 'Massacre', incendie: 'Incendie', inondation: 'Inondation',
  seisme: 'Séisme', explosion: 'Explosion', epidemie: 'Épidémie', famine: 'Famine', hiver: 'Hiver rude', guerre: 'Guerre', regime: 'Régime',
}
