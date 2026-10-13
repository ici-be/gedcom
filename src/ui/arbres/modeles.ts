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
}

export interface Modele {
  id: string
  titre: string
  description: string
  /** Forme générale, pour regrouper les modèles quand il y en aura plusieurs */
  forme: 'eventail' | 'arbre' | 'tableau'
  /** Papier et orientation, pour la règle @page */
  papier: { format: 'A4' | 'A3' | 'A2'; orientation: 'portrait' | 'landscape' }
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
