// Événements historiques : la liste de ceux qu'ont connus les personnes de l'arbre (#/evenements) et la page
// d'un événement (#/evenements/Q48314) avec chacune des personnes concernées, leur âge, leur lieu et la distance.

import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { decouper, situerArbre, type Position } from '../lib/geo'
import { decouperLieu, nomSiecle, numeroSiecle } from '../lib/communes'
import { chargerEvenements, datesEvenement, indexer, NOMS_TYPES, ponctuel, type Index, type TypeEvenement } from '../lib/evenements'
import { nombre } from '../lib/format'
import { lire } from '../lib/stockage'
import { Personne } from './commun'

export const lienEvenement = (id: string) => '#/evenements/' + encodeURIComponent(id)

// ——— Icônes (trait, couleur du texte) ———

const TRACES: Record<TypeEvenement, string> = {
  bataille: 'M4 4l11 11M20 4L9 15M14 17l3 3M10 17l-3 3M16 14l3-3M8 14l-3-3',
  guerre: 'M4 4l11 11M20 4L9 15M14 17l3 3M10 17l-3 3M16 14l3-3M8 14l-3-3',
  siege: 'M5 21V8h3V5h2v3h4V5h2v3h3v13zM10 21v-5h4v5',
  bombardement: 'M11 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15 10l3-3M18 7l1-3M18 7l3-1',
  massacre: 'M12 3v18M7 8h10',
  incendie: 'M12 22c4 0 7-2.7 7-6.7 0-4.3-3.6-6.3-4.5-10.3-1.8 1.6-2.6 3.6-2.5 5.6C10.5 9.4 9.6 8 9.5 6.2 6.6 8.4 5 11.6 5 15.3 5 19.3 8 22 12 22z',
  explosion: 'M12 2l2 6 6-3-3 6 6 1-6 3 3 6-6-3-2 6-2-6-6 3 3-6-6-3 6-1-3-6 6 3z',
  inondation: 'M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 14c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 19c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0',
  seisme: 'M2 12h4l2-6 3 12 3-9 2 5 2-2h4',
  epidemie: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19',
  famine: 'M12 22V8M12 12c-3 0-4.5-2-4.5-4.5C10.5 7.5 12 9.5 12 12zM12 12c3 0 4.5-2 4.5-4.5C13.5 7.5 12 9.5 12 12zM12 17c-3 0-4.5-2-4.5-4.5 3 0 4.5 2 4.5 4.5zM12 17c3 0 4.5-2 4.5-4.5-3 0-4.5 2-4.5 4.5zM12 7c-1.2-1.2-1.2-3 0-5 1.2 2 1.2 3.8 0 5z',
  hiver: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5',
  regime: 'M5 22V3M5 4h12l-2.5 4L17 12H5',
}

export function IconeEvenement({ type, classe }: { type: string; classe?: string }) {
  const d = TRACES[type as TypeEvenement] ?? TRACES.regime
  return (
    <svg class={classe ?? 'icone-evt'} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d={d} />
    </svg>
  )
}

// ——— Chargement : lieux situés (y compris ceux placés à la main sur la carte) et liste des événements ———

let enCache: { cle: Donnees; promesse: Promise<Index> } | undefined

/** Les positions de la carte : situées d'après les listes de localités, ou placées à la main */
async function positionsArbre(d: Donnees): Promise<Map<string, Position>> {
  const auto = await situerArbre(d.arbre)
  const manuelles = lire<Record<string, [number, number]>>('positions', {})
  const res = new Map(auto)
  for (const [lieu, [lat, lon]] of Object.entries(manuelles)) res.set(lieu, { lat, lon, qualite: 'manuel', pays: decouper(lieu).pays })
  return res
}

function indexArbre(d: Donnees): Promise<Index> {
  if (enCache?.cle !== d) {
    const promesse = Promise.all([positionsArbre(d), chargerEvenements()]).then(([pos, liste]) => indexer(d, pos, liste))
    promesse.catch(() => { if (enCache?.promesse === promesse) enCache = undefined })
    enCache = { cle: d, promesse }
  }
  return enCache.promesse
}

export type EtatIndex = { etat: 'attente' } | { etat: 'erreur' } | { etat: 'pret'; index: Index }

/** L'index des événements de l'arbre, calculé seulement si `actif` */
export function useEvenements(d: Donnees, actif = true): EtatIndex | undefined {
  const [res, setRes] = useState<EtatIndex | undefined>()
  useEffect(() => {
    if (!actif) { setRes(undefined); return }
    let vivant = true
    setRes({ etat: 'attente' })
    indexArbre(d).then((index) => vivant && setRes({ etat: 'pret', index })).catch(() => vivant && setRes({ etat: 'erreur' }))
    return () => { vivant = false }
  }, [d, actif])
  return res
}

function Attente({ e }: { e: EtatIndex | undefined }) {
  if (e?.etat === 'erreur') return <p class="aucun">La liste des événements n'a pas pu être chargée. Réessayez une fois en ligne.</p>
  return <div class="attente" role="status"><span class="rouet" />Recherche des événements…</div>
}

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const wikipedia = (titre: string, w?: string) => w
  ? 'https://fr.wikipedia.org/wiki/' + encodeURIComponent(w.replace(/ /g, '_'))
  : 'https://fr.wikipedia.org/w/index.php?search=' + encodeURIComponent(titre.replace(/^(l’|la |le |les )/, ''))

// ——— Tous les événements de l'arbre ———

export function ListeEvenements({ d }: { d: Donnees }) {
  const e = useEvenements(d)
  const [type, setType] = useState('')
  const lignes = useMemo(() => {
    if (e?.etat !== 'pret') return []
    return e.index.liste.filter((x) => e.index.parEvenement.has(x.id) && (!type || x.type === type))
  }, [e, type])
  const types = useMemo(() => {
    if (e?.etat !== 'pret') return []
    const t = new Set(e.index.liste.filter((x) => e.index.parEvenement.has(x.id)).map((x) => x.type))
    return (Object.keys(NOMS_TYPES) as TypeEvenement[]).filter((k) => t.has(k))
  }, [e])

  return (
    <section class="ecran">
      <p class="retour"><a href="#/recit">‹ Récit</a></p>
      <header class="titre-ecran">
        <h1>Événements historiques</h1>
        <p class="sous-titre">Les batailles, sièges, incendies, épidémies, guerres et changements de régime survenus près de chez les personnes de l'arbre, de leur vivant, d'après les lieux et les dates de leurs actes. Les événements viennent de Wikidata ; le lieu de vie à une date est déduit des actes les plus proches.</p>
      </header>
      {e?.etat !== 'pret' ? <Attente e={e} /> : (
        <>
          <div class="filtres">
            <label>
              <span>Type</span>
              <select id="evenements-type" value={type} onChange={(x) => setType(x.currentTarget.value)}>
                <option value="">Tous</option>
                {types.map((t) => <option key={t} value={t}>{NOMS_TYPES[t]}</option>)}
              </select>
            </label>
          </div>
          <div class="barre-resultats"><span>{nombre(lignes.length)} événement{lignes.length > 1 ? 's' : ''}</span></div>
          <div class="tableau-conteneur">
            <table class="tableau ev-tableau">
              <thead><tr><th>Date</th><th>Événement</th><th class="nombre">Personnes</th></tr></thead>
              <tbody>
                {lignes.map((x, i) => {
                  const s = numeroSiecle(Number(x.d.slice(0, 4)))
                  const nouveau = i === 0 || numeroSiecle(Number(lignes[i - 1].d.slice(0, 4))) !== s
                  return [
                    nouveau && <tr key={'s' + s} class="ev-siecle"><td colSpan={3}>{capitale(nomSiecle(s))}</td></tr>,
                    <tr key={x.id}>
                      <td class="ev-date">{datesEvenement(x)}</td>
                      <td><a href={lienEvenement(x.id)} class="ev-titre"><IconeEvenement type={x.type} />{capitale(x.t)}</a> <span class="vide">{NOMS_TYPES[x.type].toLowerCase()}</span></td>
                      <td class="nombre">{nombre(e.index.parEvenement.get(x.id)!.length)}</td>
                    </tr>,
                  ]
                })}
              </tbody>
            </table>
            {!lignes.length && <p class="aucun">Aucun événement ne touche les lieux situés de l'arbre.</p>}
          </div>
        </>
      )}
    </section>
  )
}

// ——— Un événement ———

/** « BE », « FR.59 », « FR.62 » → « Belgique, France (en partie) » */
function nomsZones(z: string[]): string {
  const pays = new Map<string, boolean>()
  for (const x of z) {
    const [p, region] = x.split('.')
    if (!region) pays.set(p, true)
    else if (!pays.has(p)) pays.set(p, false)
  }
  let noms: Intl.DisplayNames | undefined
  try { noms = new Intl.DisplayNames(['fr'], { type: 'region' }) } catch { /* navigateur ancien : les codes */ }
  return [...pays].map(([p, entier]) => (noms?.of(p) ?? p) + (entier ? '' : ' (en partie)')).join(', ')
}

export function PageEvenement({ d, id }: { d: Donnees; id: string }) {
  const e = useEvenements(d)
  if (e?.etat !== 'pret') return <section class="ecran"><p class="retour"><a href="#/evenements">‹ Tous les événements</a></p><Attente e={e} /></section>
  const ev = e.index.liste.find((x) => x.id === id)
  const l = e.index.parEvenement.get(id) ?? []
  if (!ev) {
    return <section class="ecran"><p class="retour"><a href="#/evenements">‹ Tous les événements</a></p><p class="aucun">Cet événement n'est pas dans la liste.</p></section>
  }
  const zones = nomsZones(ev.z ?? [])
  return (
    <section class="ecran">
      <p class="retour"><a href="#/evenements">‹ Tous les événements</a></p>
      <header class="titre-ecran">
        <h1 class="ev-h1"><IconeEvenement type={ev.type} />{capitale(ev.t)}</h1>
        <p class="sous-titre">
          {NOMS_TYPES[ev.type]} · {datesEvenement(ev)}
          {ponctuel(ev)
            ? <> · personnes vivant à moins de {ev.r} km du <a href={`https://www.openstreetmap.org/?mlat=${ev.lat}&mlon=${ev.lon}#map=11/${ev.lat}/${ev.lon}`} target="_blank" rel="noopener noreferrer">lieu de l'événement</a></>
            : zones && <> · {zones}</>}
          {' · '}<a href={wikipedia(ev.t, ev.w)} target="_blank" rel="noopener noreferrer">Wikipédia</a>
          {/^Q\d+$/.test(ev.id) && <> · <a href={`https://www.wikidata.org/wiki/${ev.id}`} target="_blank" rel="noopener noreferrer">Wikidata</a></>}
        </p>
      </header>
      <div class="barre-resultats"><span>{nombre(l.length)} personne{l.length > 1 ? 's' : ''} de l'arbre</span></div>
      <div class="tableau-conteneur">
        <table class="tableau ev-tableau">
          <thead><tr><th>Sosa</th><th>Personne</th><th>Âge</th><th>Où elle vivait</th>{ponctuel(ev) && <th class="nombre">Distance</th>}<th>Récit</th></tr></thead>
          <tbody>
            {l.map((v) => {
              const a = d.ancetres.get(v.id)
              return (
                <tr key={v.id}>
                  <td class="sosa">{a?.sosa}</td>
                  <td class="nom"><Personne d={d} id={v.id} annees /></td>
                  <td>{v.age === undefined ? <span class="vide">–</span> : v.age < 1 ? 'moins d’un an' : `${v.age} an${v.age > 1 ? 's' : ''}`}</td>
                  <td><a href={'#/lieux/' + encodeURIComponent(v.lieu)} title={v.lieu}>{decouperLieu(v.lieu).nom}</a>{v.probable && <span class="vide" title="Aucun acte daté près de l'événement : lieu déduit des actes précédent et suivant"> · sans doute</span>}</td>
                  {ponctuel(ev) && <td class="nombre">{v.km! < 1 ? 'sur place' : `${Math.round(v.km!)} km`}</td>}
                  <td><a href={'#/recit/' + encodeURIComponent(v.id)}>Récit</a></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!l.length && <p class="aucun">Personne de l'arbre ne vivait là à ce moment.</p>}
      </div>
    </section>
  )
}
