// Illettrés : la mention « Signature: illettré » à écrire dans la note de la personne, et les personnes qui la portent.
// Les cases cochées (déjà corrigé sur Geneanet) tiennent jusqu'au prochain fichier chargé.

import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Individu } from '../lib/gedcom/arbre'
import { MENTIONS_ILLETTRE } from '../lib/illettre'
import { comparerSosa, nomComplet } from '../lib/parente'
import { ecrire, lire } from '../lib/stockage'
import { nombre } from '../lib/format'
import { Annees, Copier, Personne } from './commun'

interface Coches { importe: string; ids: string[] }

export function Illettres({ d, importe }: { d: Donnees; importe: string }) {
  const liste = useMemo(() => {
    const l = [...d.arbre.individus.values()].filter((ind) => ind.illettre)
    const sosa = (i: Individu) => d.ancetres.get(i.id)?.sosa
    return l.sort((a, b) => {
      const x = sosa(a)
      const y = sosa(b)
      return x && y ? comparerSosa(x, y) : x ? -1 : y ? 1 : nomComplet(a).localeCompare(nomComplet(b), 'fr')
    })
  }, [d])
  // cochées pour un autre fichier : oubliées
  const [coches, setCoches] = useState<Set<string>>(() => {
    const c = lire<Coches>('illettres', { importe: '', ids: [] })
    return new Set(c.importe === importe ? c.ids : [])
  })
  const cocher = (id: string, oui: boolean) => {
    const n = new Set(coches)
    if (oui) n.add(id)
    else n.delete(id)
    setCoches(n)
    ecrire('illettres', { importe, ids: [...n] })
  }
  const ancetres = liste.filter((ind) => d.ancetres.has(ind.id)).length
  const contredits = liste.filter((ind) => ind.photo?.signature).length

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Illettrés</h1>
        <p class="sous-titre">Dire qu'une personne ne savait pas signer, pour ne plus chercher sa signature d'un acte à l'autre.</p>
      </header>

      <section class="panneau">
        <h2>Où l'écrire</h2>
        <p>
          Le format GEDCOM n'a pas de champ pour cela, et Geneanet non plus. On l'écrit donc dans la <strong>note de la personne</strong>{' '}
          (sur Geneanet : modifier la personne, rubrique « Notes »), sous la forme d'une ligne qui commence par « Signature: ».
          La note fait partie de l'arbre : elle revient dans chaque export, sur tous vos appareils, et les visiteurs de votre arbre la voient aussi.
        </p>
        <p class="aide">
          La mention peut être suivie, sur la même ligne, de l'acte qui l'établit (« Signature: illettré, a déclaré ne savoir signer, mariage Ath 1820 »).
          Accents, majuscules et accords sont libres : « signature : illettrée », « Signature: ne savait pas écrire », « Signature: analphabète »
          ou « Signature: une marque » sont reconnus aussi. Si une signature figure malgré tout dans l'arbre (photo PNG), elle est signalée ci-dessous.
        </p>
        <div class="tableau-conteneur">
          <table class="tableau mots-cles">
            <thead><tr><th>Mention</th><th>Quand l'utiliser</th><th /></tr></thead>
            <tbody>
              {MENTIONS_ILLETTRE.map((m) => (
                <tr key={m.mot}>
                  <td><code>{m.mot}</code></td>
                  <td>{m.sens}</td>
                  <td><Copier texte={m.mot} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panneau">
        <h2>Dans votre arbre</h2>
        <p>
          <strong>{nombre(liste.length)}</strong> personne{liste.length > 1 ? 's portent' : ' porte'} cette mention
          {liste.length > 0 && <>, dont <strong>{nombre(ancetres)}</strong> ancêtre{ancetres > 1 ? 's' : ''}</>}.
          {contredits > 0 && <> <span class="avertissement">{nombre(contredits)} {contredits > 1 ? 'ont' : 'a'} pourtant une signature dans l'arbre.</span></>}
        </p>
        {liste.length > 0 && (
          <>
            <p class="astuce">
              Cochez une personne quand vous l'avez modifiée sur Geneanet : la case est retenue dans ce navigateur jusqu'au prochain fichier chargé
              {coches.size > 0 && <> ({nombre(coches.size)} cochée{coches.size > 1 ? 's' : ''} · <button type="button" class="lien" onClick={() => { setCoches(new Set()); ecrire('illettres', { importe, ids: [] }) }}>tout décocher</button>)</>}.
            </p>
            <div class="tableau-conteneur">
              <table class="tableau">
                <thead><tr><th title="Modifiée sur Geneanet">✓</th><th>Sosa</th><th>Personne</th><th>Note</th></tr></thead>
                <tbody>
                  {liste.map((ind) => (
                    <tr key={ind.id} class={coches.has(ind.id) ? 'coche' : ''}>
                      <td><input type="checkbox" checked={coches.has(ind.id)} onChange={(e) => cocher(ind.id, e.currentTarget.checked)} aria-label="Modifiée sur Geneanet" /></td>
                      <td class="sosa">{d.ancetres.get(ind.id)?.sosa ?? ''}</td>
                      <td class="nom"><Personne d={d} id={ind.id} /><Annees ind={ind} /></td>
                      <td>
                        {ind.illettre!.precision ?? <span class="vide">sans précision</span>}
                        {ind.photo?.signature && <span class="contexte avertissement">Une signature figure pourtant dans l'arbre.</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </section>
  )
}
