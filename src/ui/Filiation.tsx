// Parents inconnus ou introuvables : les mentions « Filiation: … » à écrire dans la note de la personne, et celles trouvées dans l'arbre.

import { useMemo } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Individu } from '../lib/gedcom/arbre'
import { MENTIONS, texteParent } from '../lib/filiation'
import { comparerSosa, etatParents, filiationContredite, nomComplet } from '../lib/parente'
import { nombre } from '../lib/format'
import { Annees, Copier, Personne } from './commun'

export function Filiation({ d }: { d: Donnees }) {
  const notes = useMemo(() => {
    const l = [...d.arbre.individus.values()].filter((ind) => ind.filiation)
    const sosa = (i: Individu) => d.ancetres.get(i.id)?.sosa
    return l.sort((a, b) => {
      const x = sosa(a)
      const y = sosa(b)
      return x && y ? comparerSosa(x, y) : x ? -1 : y ? 1 : nomComplet(a).localeCompare(nomComplet(b), 'fr')
    })
  }, [d])
  const aChercher = useMemo(() => {
    let n = 0
    for (const a of d.ancetres.values()) {
      const p = etatParents(d.arbre, d.arbre.individus.get(a.id)!)
      if (p.pere === 'a-chercher' || p.mere === 'a-chercher') n++
    }
    return n
  }, [d])

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Parents inconnus ou introuvables</h1>
        <p class="sous-titre">Dire qu'un parent n'est pas à chercher, pour que la recherche se concentre sur les vraies pistes.</p>
      </header>

      <section class="panneau">
        <h2>Où l'écrire</h2>
        <p>
          Le format GEDCOM n'a pas de champ pour cela, et Geneanet non plus. On l'écrit donc dans la <strong>note de la personne</strong>{' '}
          (sur Geneanet : modifier la personne, rubrique « Notes »), sous la forme d'une ligne qui commence par « Filiation: ».
          La note fait partie de l'arbre : elle revient dans chaque export, sur tous vos appareils, et les visiteurs de votre arbre la voient aussi.
        </p>
        <p class="aide">
          La mention se met dans la note de l'<strong>enfant</strong>, pas du parent, n'importe où dans la note. Elle peut être suivie d'une explication
          sur la même ligne (« Filiation: père inconnu, d'après l'acte de baptême, Malines 1754, folio 12 »), et réunir les deux côtés
          (« Filiation: père inconnu, mère introuvable »). Accents, majuscules et accords sont libres :
          « filiation:pere inconnu » ou « Filiation : père et mère introuvables » (avec une espace avant les deux-points) sont reconnus aussi. Si le parent figure malgré tout dans l'arbre, c'est l'arbre qui l'emporte.
        </p>
        <p class="aide">
          Sans mention, un enfant sans père dans l'arbre qui porte le nom de sa mère est tenu pour un enfant naturel : son père compte comme inconnu, pas à chercher.
        </p>
        <div class="tableau-conteneur">
          <table class="tableau mots-cles">
            <thead><tr><th>Mention</th><th>Quand l'utiliser</th><th /></tr></thead>
            <tbody>
              {MENTIONS.map((m) => (
                <tr key={m.mot}>
                  <td><code>{m.mot}</code></td>
                  <td>{m.sens}<span class="contexte">{m.exemple}</span></td>
                  <td><Copier texte={m.mot} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="aide">
          <strong>Inconnu</strong> : l'acte existe et ne nomme pas le parent — c'est un résultat, il n'y a rien de plus à trouver.{' '}
          <strong>Introuvable</strong> : le parent a un nom quelque part, mais les sources disponibles ne permettent pas d'aller plus loin ; on pourra rouvrir la piste si des registres sont mis en ligne.
        </p>
        <p class="aide">
          Effets : un repère à côté du nom et dans la fiche (écran <a href="#/personnes">Personnes</a>), un filtre « Parents » pour ne garder que les pistes ouvertes, et
          dans les <a href="#/statistiques">Statistiques</a>, les places de l'ascendance au-dessus d'un parent inconnu ou introuvable comptent comme sans issue.
        </p>
      </section>

      <section class="panneau">
        <h2>Dans votre arbre</h2>
        <p>
          <strong>{nombre(notes.length)}</strong> personne{notes.length > 1 ? 's portent' : ' porte'} une de ces mentions.{' '}
          <strong>{nombre(aChercher)}</strong> ancêtre{aChercher > 1 ? 's ont' : ' a'} encore un parent à chercher.
        </p>
        {notes.length > 0 && (
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Sosa</th><th>Personne</th><th>Note</th></tr></thead>
              <tbody>
                {notes.map((ind) => {
                  const p = etatParents(d.arbre, ind)
                  const contredits = filiationContredite(d.arbre, ind)
                  return (
                    <tr key={ind.id}>
                      <td class="sosa">{d.ancetres.get(ind.id)?.sosa ?? ''}</td>
                      <td class="nom"><Personne d={d} id={ind.id} /><Annees ind={ind} /></td>
                      <td>
                        {(['pere', 'mere'] as const).filter((c) => p[c] === 'inconnu' || p[c] === 'introuvable').map((c) => texteParent(p[c], c)).join(', ')}
                        {contredits.length > 0 && (
                          <span class="contexte avertissement">
                            La note dit {contredits.map((c) => texteParent(ind.filiation![c]!, c)).join(' et ')}, mais l'arbre le contredit : c'est l'arbre qui compte.
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  )
}
