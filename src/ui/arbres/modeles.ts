// Catalogue des arbres imprimables. Pour en ajouter un : un composant qui dessine sa feuille en SVG
// (viewBox aux proportions du papier) et une entrée ici ; la page Imprimer s'occupe du reste.

import type { FunctionComponent } from 'preact'
import type { Donnees } from '../../lib/donnees'
import { EventailOrigines } from './EventailOrigines'

export interface OptionsFeuille {
  /** Date imprimée en pied de page (« 13 octobre 2026 »), ou rien */
  date?: string
  /** Code QR vers l'arbre en ligne (si son adresse est connue) */
  qr: boolean
  /** Bas de la feuille : carte des lieux de naissance plutôt que barres par génération */
  carte?: boolean
  /** Centre de l'éventail : la personne de départ avec ses frères et sœurs (mêmes père et mère) */
  fratrie?: boolean
  /** Dates sans source en italique (avec la mention en pied de page) */
  italiques?: boolean
}

export type Format = 'A4' | 'A3' | 'A2'

export interface Modele {
  id: string
  titre: string
  description: string
  /** Forme générale, pour regrouper les modèles quand il y en aura plusieurs */
  forme: 'eventail' | 'arbre' | 'tableau'
  /** Papier prévu et orientation, pour la règle @page ; la feuille se réduit ou s'agrandit pour un autre format */
  papier: { format: Format; orientation: 'portrait' | 'landscape' }
  generations: number
  Feuille: FunctionComponent<{ d: Donnees; options: OptionsFeuille }>
}

export const MODELES: Modele[] = [
  {
    id: 'origines',
    titre: 'Éventail des origines',
    description: 'Huit générations sur 220°, chaque ancêtre teinté selon sa province de naissance, avec les quatre quartiers et l’origine des ancêtres par génération.',
    forme: 'eventail',
    papier: { format: 'A3', orientation: 'landscape' },
    generations: 8,
    Feuille: EventailOrigines,
  },
]
