// Recherches externes : pour une personne choisie, des liens qui préremplissent la recherche dans des bases (livres, presse,
// archives) et, pour celles qui le permettent, le nombre de résultats. Le nom n'est envoyé à une base que si on le demande.

import { useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { nombre } from '../lib/format'
import { nomRecherche, SOURCES, type Source } from '../lib/recherches'
import { ChoixPersonne, Personne } from './commun'

type Resultat = number | 'erreur' | 'attente'

export function Recherches({ d, id }: { d: Donnees; id?: string }) {
  const [tous, setTous] = useState(false)
  const [resultats, setResultats] = useState<Record<string, Resultat>>({})
  const choisi = id ? d.arbre.individus.get(id) : undefined
  const nom = choisi && nomRecherche(choisi, tous)

  const aller = (cible: string) => { location.hash = '#/recherches/' + encodeURIComponent(cible); setResultats({}) }
  const compter = async (s: Source) => {
    if (!nom || !s.compter) return
    setResultats((r) => ({ ...r, [s.id]: 'attente' }))
    let v: Resultat
    try { v = await s.compter(nom) } catch { v = 'erreur' }
    setResultats((r) => ({ ...r, [s.id]: v }))
  }
  const toutCompter = () => SOURCES.forEach((s) => { if (s.compter) void compter(s) })

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Recherches externes</h1>
        <p class="sous-titre">Chercher une personne dans des livres, journaux et archives numérisés.</p>
      </header>
      <div class="graphe-personne"><ChoixPersonne d={d} valeur={id ?? ''} choisir={aller} prenoms={2} /></div>
      {!choisi && <p class="aide">Choisissez une personne : chaque base s’ouvre dans un nouvel onglet, la recherche déjà remplie.</p>}
      {choisi && !nom && <p class="aide">Cette personne n’a pas de prénom et de nom : la recherche n’aurait pas de sens.</p>}
      {choisi && nom && (
        <>
          <p class="aide">
            Recherche de <strong>{nom.phrase}</strong> (<Personne d={d} id={choisi.id} annees />).{' '}
            <label><input type="checkbox" checked={tous} onChange={(e) => { setTous(e.currentTarget.checked); setResultats({}) }} /> avec tous les prénoms</label>
          </p>
          <p class="aide">
            Les nombres ne sont demandés qu’à votre clic : le nom est alors envoyé à la base interrogée.
            Les homonymes et les graphies anciennes (Veyckemans, Veyckmans…) ne sont pas distingués ; un nombre dit où regarder, pas qui est qui.{' '}
            <button type="button" class="lien" onClick={toutCompter}>Compter partout</button>
          </p>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Base</th><th>Contenu</th><th>Résultats</th><th /></tr></thead>
              <tbody>
                {SOURCES.map((s) => {
                  const r = resultats[s.id]
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.nom}</strong></td>
                      <td class="aide">{s.detail}</td>
                      <td>
                        {!s.compter ? <span class="aide">à voir sur place</span>
                          : r === 'attente' ? '…'
                          : r === 'erreur' ? <span class="aide">indisponible</span>
                          : typeof r === 'number' ? nombre(r)
                          : <button type="button" class="lien" onClick={() => compter(s)}>Compter</button>}
                      </td>
                      <td><a href={s.url(nom)} target="_blank" rel="noopener noreferrer">Chercher ›</a></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
