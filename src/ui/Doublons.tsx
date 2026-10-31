// Doublons potentiels : des paires de personnes de même nom, aux dates et lieux compatibles, à comparer puis fusionner sur Geneanet.

import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { doublons } from '../lib/doublons'
import { nombre } from '../lib/format'
import { lienGeneWeb } from '../lib/geneanet'
import { Personne, Pagination } from './commun'

const PAR_PAGE = 50

export function Doublons({ d }: { d: Donnees }) {
  const liste = useMemo(() => doublons(d.arbre), [d])
  const [page, setPage] = useState(0)
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
                  <td>{lien && <a class="bouton discret" href={lien} target="_blank" rel="noopener noreferrer"><svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h8v8H2zM6 5.5h8v8H6z" /></svg>Comparer</a>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} aller={setPage} />
    </section>
  )
}
