// Doublons potentiels : des paires de personnes de même nom, aux dates et lieux compatibles, à comparer puis fusionner sur Geneanet.

import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { doublons, famillesEnDouble } from '../lib/doublons'
import { nombre } from '../lib/format'
import { lienGeneWeb } from '../lib/geneanet'
import { ecrire, lire } from '../lib/stockage'
import { Personne, Pagination } from './commun'

const PAR_PAGE = 50
/** À partir de ce score, une paire est « très probable » */
const SCORE_PROBABLE = 5
const cle = (a: string, b: string) => [a, b].sort().join('+')

export function Doublons({ d }: { d: Donnees }) {
  const toutes = useMemo(() => doublons(d.arbre), [d])
  const [ecartes, setEcartes] = useState<string[]>(() => lire('doublonsEcartes', []))
  const [probables, setProbables] = useState(false)
  const [page, setPage] = useState(0)
  const liste = useMemo(
    () => toutes.filter((p) => !ecartes.includes(cle(p.a, p.b)) && (!probables || p.score >= SCORE_PROBABLE)),
    [toutes, ecartes, probables],
  )
  const familles = useMemo(() => famillesEnDouble(d.arbre, toutes), [d, toutes])
  const [pageF, setPageF] = useState(0)
  const listeF = useMemo(() => familles.filter((p) => !ecartes.includes(cle(p.a, p.b))), [familles, ecartes])
  const couple = (id: string) => {
    const f = d.arbre.familles.get(id)
    return (
      <>
        {f?.mari ? <Personne d={d} id={f.mari} annees /> : <span class="aide">mari inconnu</span>}
        <br />
        {f?.femme ? <Personne d={d} id={f.femme} annees /> : <span class="aide">épouse inconnue</span>}
        <br /><span class="aide">{[f?.evenements.find((e) => e.tag === 'MARR')?.date?.texte, f && f.enfants.length ? `${f.enfants.length} enfant${f.enfants.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}</span>
      </>
    )
  }
  const changerEcartes = (l: string[]) => { setEcartes(l); ecrire('doublonsEcartes', l) }
  const pages = Math.ceil(liste.length / PAR_PAGE)
  const lieu = (id: string) => {
    const e = d.arbre.individus.get(id)?.evenements.find((x) => x.tag === 'BIRT' && x.lieu) ?? d.arbre.individus.get(id)?.evenements.find((x) => x.lieu)
    return e?.lieu
  }

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Doublons potentiels</h1>
        <p class="sous-titre">
          {liste.length
            ? `${nombre(liste.length)} paire${liste.length > 1 ? 's' : ''} de personnes qui pourraient n'en faire qu'une.`
            : 'Aucune paire de personnes ne semble faire double emploi.'}
        </p>
      </header>
      <p class="aide">
        Sont rapprochées les personnes de même nom et de mêmes prénoms (accents, tirets et majuscules ne comptent pas) dont les dates ne s'écartent pas
        de plus de deux ans, et qui ont en commun une date, un lieu, un parent ou un conjoint. Deux homonymes sans rien d'autre en commun ne sont pas signalés.
        {d.adresse
          ? ' « Comparer » ouvre la recherche de l’arbre en ligne, qui liste les deux fiches : ouvrez-les, puis « Modifier » > « Fusionner » sur Geneanet.'
          : ' Indiquez l’adresse de l’arbre en ligne (Accueil) pour ouvrir les deux fiches sur Geneanet et les fusionner.'}
      </p>
      <p class="aide">
        <label><input type="checkbox" checked={probables} onChange={(e) => { setProbables(e.currentTarget.checked); setPage(0) }} /> Seulement les paires très probables</label>
        {ecartes.length > 0 && <> · {nombre(ecartes.length)} paire{ecartes.length > 1 ? 's' : ''} écartée{ecartes.length > 1 ? 's' : ''} <button type="button" class="lien" onClick={() => changerEcartes([])}>Tout réafficher</button></>}
      </p>
      <div class="tableau-conteneur">
        <table class="tableau">
          <thead><tr><th>Première fiche</th><th>Seconde fiche</th><th>Ce qui les rapproche</th><th /></tr></thead>
          <tbody>
            {liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map((p) => {
              const a = d.arbre.individus.get(p.a)!
              const lien = lienGeneWeb(d.adresse, a, true)
              return (
                <tr key={p.a + p.b}>
                  <td><Personne d={d} id={p.a} annees /><br /><span class="aide">{lieu(p.a)}</span></td>
                  <td><Personne d={d} id={p.b} annees /><br /><span class="aide">{lieu(p.b)}</span></td>
                  <td>{p.indices.join(' · ')}</td>
                  <td class="actions-doublon">{lien && <a class="bouton discret" href={lien} target="_blank" rel="noopener noreferrer"><svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h8v8H2zM6 5.5h8v8H6z" /></svg>Comparer</a>}
                    <button type="button" class="bouton discret" title="Ces deux personnes ne sont pas les mêmes : ne plus les proposer" onClick={() => changerEcartes([...ecartes, cle(p.a, p.b)])}>
                      <svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>Pas les mêmes
                    </button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} aller={setPage} />
      <header class="titre-ecran">
        <h2>Familles en double</h2>
        <p class="sous-titre">
          {listeF.length
            ? `${nombre(listeF.length)} paire${listeF.length > 1 ? 's' : ''} de familles qui pourraient n'en faire qu'une.`
            : 'Aucune famille ne semble faire double emploi.'}
        </p>
      </header>
      {listeF.length > 0 && (
        <>
          <p class="aide">
            Deux familles dont les conjoints sont les mêmes (ou en double dans la liste ci-dessus), avec un mariage à moins de deux ans d’écart quand il est daté.
            Fusionnez d’abord les personnes en double : les deux familles n’en feront plus qu’une.
          </p>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Première famille</th><th>Seconde famille</th><th>Ce qui les rapproche</th><th /></tr></thead>
              <tbody>
                {listeF.slice(pageF * PAR_PAGE, (pageF + 1) * PAR_PAGE).map((p) => (
                  <tr key={p.a + p.b}>
                    <td>{couple(p.a)}</td>
                    <td>{couple(p.b)}</td>
                    <td>{p.indices.join(' · ')}</td>
                    <td class="actions-doublon">
                      <button type="button" class="bouton discret" title="Ces deux familles sont distinctes : ne plus les proposer" onClick={() => changerEcartes([...ecartes, cle(p.a, p.b)])}>
                        <svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>Pas les mêmes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pageF} pages={Math.ceil(listeF.length / PAR_PAGE)} aller={setPageF} />
        </>
      )}
    </section>
  )
}
