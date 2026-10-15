// Sources introuvables : la mention « Source: introuvable (cause) » à écrire dans la note d'un événement, et celles trouvées dans l'arbre.

import { Fragment } from 'preact'
import { useMemo } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Evenement } from '../lib/gedcom/arbre'
import { MENTION_INTROUVABLE } from '../lib/introuvable'
import { comparerSosa, nomComplet } from '../lib/parente'
import { aChercher } from '../lib/suivi'
import { libelle, nombre } from '../lib/format'
import { Copier, DateLieu, Personne } from './commun'

const EXEMPLES: { mot: string; sens: string }[] = [
  { mot: 'Source: introuvable (les archives de 1789 à 1820 ont brûlé en 1914)', sens: 'Registres détruits : incendie, guerre, inondation.' },
  { mot: 'Source: introuvable (lacune dans les registres de 1740 à 1752)', sens: 'Années manquantes dans la collection conservée.' },
  { mot: 'Source: introuvable (acte absent des registres de la paroisse et des communes voisines)', sens: 'Recherche faite sans résultat.' },
  { mot: 'Source: introuvable (lieu de naissance inconnu)', sens: 'Rien ne dit où chercher.' },
]

interface Ligne { e: Evenement; personnes: string[]; sosa?: string }

export function Introuvables({ d }: { d: Donnees }) {
  const lignes = useMemo(() => {
    const l: Ligne[] = []
    const sosa = (ids: string[]) => ids.map((id) => d.ancetres.get(id)?.sosa).filter((x): x is string => !!x).sort(comparerSosa)[0]
    for (const ind of d.arbre.individus.values()) {
      for (const e of ind.evenements) if (e.introuvable) l.push({ e, personnes: [ind.id], sosa: sosa([ind.id]) })
    }
    for (const fam of d.arbre.familles.values()) {
      const conjoints = [fam.mari, fam.femme].filter((x): x is string => !!x)
      for (const e of fam.evenements) if (e.introuvable) l.push({ e, personnes: conjoints, sosa: sosa(conjoints) })
    }
    const nom = (x: Ligne) => { const i = d.arbre.individus.get(x.personnes[0] ?? ''); return i ? nomComplet(i) : '' }
    return l.sort((a, b) => a.sosa && b.sosa ? comparerSosa(a.sosa, b.sosa) : a.sosa ? -1 : b.sosa ? 1 : nom(a).localeCompare(nom(b), 'fr'))
  }, [d])
  const aSourcer = useMemo(() => {
    let n = 0
    for (const id of d.ancetres.keys()) {
      const s = d.suivis.get(id)
      if (s && [s.naissance.etat, s.mariage, s.deces.etat].some(aChercher)) n++
    }
    return n
  }, [d])
  const contredites = lignes.filter((l) => l.e.sources.length).length

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Sources introuvables</h1>
        <p class="sous-titre">Dire qu'un acte ne se trouvera pas, pour ne plus retomber dessus en cherchant les sources qui manquent.</p>
      </header>

      <section class="panneau">
        <h2>Où l'écrire</h2>
        <p>
          Le format GEDCOM n'a pas de champ pour cela, et Geneanet non plus. On l'écrit donc dans la <strong>note de l'événement</strong>{' '}
          (sur Geneanet : modifier la personne, puis la naissance, le baptême, le mariage ou le décès concerné, rubrique « Note »),
          sous la forme d'une ligne qui commence par <code>{MENTION_INTROUVABLE}</code>, suivie si l'on veut de la raison entre parenthèses.
          La note fait partie de l'arbre : elle revient dans chaque export, sur tous vos appareils, et les visiteurs de votre arbre la voient aussi.
        </p>
        <p class="aide">
          Un mariage se note sur l'événement du mariage (il est commun aux deux époux). Majuscules et pluriel sont libres :
          « source : introuvable », « Sources: introuvables » ou « Acte: introuvable » sont reconnus aussi.
          Si une source est malgré tout attachée à l'événement, c'est la source qui l'emporte.
        </p>
        <div class="tableau-conteneur">
          <table class="tableau mots-cles">
            <thead><tr><th>Mention</th><th>Quand l'utiliser</th><th /></tr></thead>
            <tbody>
              {EXEMPLES.map((m) => (
                <tr key={m.mot}>
                  <td><code>{m.mot}</code></td>
                  <td>{m.sens}</td>
                  <td><Copier texte={m.mot} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="aide">
          <strong>Sans source</strong> : l'acte n'a pas encore été cherché ou trouvé — c'est une piste ouverte.{' '}
          <strong>Introuvable</strong> : on l'a cherché, il n'existe plus ou n'est pas accessible ; on pourra rouvrir la piste (en retirant la mention) si des registres sont retrouvés ou mis en ligne.
        </p>
        <p class="aide">
          Effets : une pastille ∅ à la place du point d'exclamation, avec la raison au survol (écran <a href="#/personnes">Personnes</a>) ;
          le fait sort de la liste « À compléter », des ancêtres à sourcer de l'accueil et des actes à chercher par <a href="#/lieux">lieu</a> et sur la <a href="#/carte">carte</a> ;
          un filtre « Source introuvable » les retrouve ; le <a href="#/recit">récit</a> mentionne l'acte introuvable et sa raison en note.
          Il ne compte pas pour autant comme sourcé dans les pourcentages.
        </p>
      </section>

      <section class="panneau">
        <h2>Dans votre arbre</h2>
        <p>
          <strong>{nombre(lignes.length)}</strong> fait{lignes.length > 1 ? 's portent' : ' porte'} cette mention.{' '}
          <strong>{nombre(aSourcer)}</strong> ancêtre{aSourcer > 1 ? 's ont' : ' a'} encore un fait à sourcer.
          {contredites > 0 && <> <span class="avertissement">{nombre(contredites)} {contredites > 1 ? 'ont' : 'a'} pourtant une source.</span></>}
        </p>
        {lignes.length > 0 && (
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Sosa</th><th>Personne</th><th>Fait</th><th>Raison</th></tr></thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i}>
                    <td class="sosa">{l.sosa ?? ''}</td>
                    <td class="nom">{l.personnes.map((p, j) => <Fragment key={p}>{j > 0 && ' & '}<Personne d={d} id={p} annees /></Fragment>)}</td>
                    <td><strong>{libelle(l.e)}</strong> <DateLieu e={l.e} /></td>
                    <td>
                      {l.e.introuvable!.cause ?? <span class="vide">non précisée</span>}
                      {l.e.sources.length > 0 && <span class="contexte avertissement">Une source est attachée à l'événement : c'est elle qui compte.</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
