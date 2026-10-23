// Annotations : les mentions à écrire dans les notes de l'arbre (le GEDCOM n'a pas de champ pour elles), et la page de chacune.

import type { ComponentChildren } from 'preact'
import { useMemo } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { nombre } from '../lib/format'
import { Copier } from './commun'

interface Annotation {
  page: string
  titre: string
  mot: string
  ou: string
  sens: ComponentChildren
  compte: (n: number) => string
}

const ANNOTATIONS: Annotation[] = [
  {
    page: 'filiation', titre: 'Parents inconnus ou introuvables', mot: 'Filiation: père inconnu', ou: 'Note de la personne (l’enfant)',
    sens: 'Un parent qu’il ne sert à rien de chercher : enfant naturel, enfant trouvé, registres perdus.',
    compte: (n) => `${nombre(n)} personne${n > 1 ? 's' : ''}`,
  },
  {
    page: 'introuvables', titre: 'Sources introuvables', mot: 'Source: introuvable (les archives ont brûlé en 1914)', ou: 'Note de l’événement',
    sens: 'Un acte qui ne se trouvera pas (registres brûlés, lacune), pour ne plus le compter parmi les sources à chercher.',
    compte: (n) => `${nombre(n)} fait${n > 1 ? 's' : ''}`,
  },
  {
    page: 'illettres', titre: 'Illettrés', mot: 'Signature: illettré', ou: 'Note de la personne',
    sens: 'Une personne qui ne savait pas écrire, pour ne plus chercher sa signature.',
    compte: (n) => `${nombre(n)} personne${n > 1 ? 's' : ''}`,
  },
]

/** Le lien de retour en tête des pages d'une annotation */
export function RetourAnnotations() {
  return <p class="retour"><a href="#/annotations">‹ Annotations</a></p>
}

export function Annotations({ d }: { d: Donnees }) {
  const comptes = useMemo(() => {
    const c: Record<string, number> = { filiation: 0, introuvables: 0, illettres: 0 }
    for (const ind of d.arbre.individus.values()) {
      if (ind.filiation) c.filiation++
      if (ind.illettre) c.illettres++
      for (const e of ind.evenements) if (e.introuvable) c.introuvables++
    }
    for (const fam of d.arbre.familles.values()) for (const e of fam.evenements) if (e.introuvable) c.introuvables++
    return c
  }, [d])

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Annotations</h1>
        <p class="sous-titre">Ce que le GEDCOM ne sait pas dire, écrit dans les notes de l'arbre pour ne pas refaire deux fois les mêmes recherches.</p>
      </header>
      <p class="aide">
        Le format GEDCOM n'a pas de champ pour ces informations, et Geneanet non plus. On les écrit donc dans une <strong>note</strong>, sous la forme
        d'une ligne qui commence par un mot suivi de deux-points. La note fait partie de l'arbre : elle revient dans chaque export, sur tous vos appareils.
      </p>
      <div class="annotations">
        {ANNOTATIONS.map((a) => (
          <section key={a.page} class="panneau annotation">
            <h2><a href={`#/${a.page}`}>{a.titre}</a></h2>
            <p>{a.sens}</p>
            <p class="annotation-mot"><code>{a.mot}</code><Copier texte={a.mot} /></p>
            <p class="aide">{a.ou}</p>
            <p class="annotation-pied">
              <span>{comptes[a.page] ? <>Dans votre arbre : <strong>{a.compte(comptes[a.page])}</strong></> : <span class="vide">Pas encore dans votre arbre</span>}</span>
              <a href={`#/${a.page}`}>Explications et liste ›</a>
            </p>
          </section>
        ))}
      </div>
    </section>
  )
}
