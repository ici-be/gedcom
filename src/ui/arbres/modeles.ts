// Catalogue des arbres imprimables. Pour en ajouter un : un composant qui dessine sa feuille en SVG
// (viewBox aux proportions du papier) et une entrée ici ; la page Imprimer s'occupe du reste.

import type { FunctionComponent } from 'preact'
import type { Donnees } from '../../lib/donnees'
import { BoutsDeBranche } from './BoutsDeBranche'
import { EventailOrigines } from './EventailOrigines'
import { Pyramide } from './Pyramide'

export interface OptionsFeuille {
  /** Date imprimée en pied de page (« 13 octobre 2026 »), ou rien */
  date?: string
  /** Code QR vers l'arbre en ligne (si son adresse est connue) */
  qr: boolean
  /** Bas de la feuille : carte des lieux de naissance plutôt que barres par génération */
  carte?: boolean
  /** Frères et sœurs : au centre de l'éventail, ou sous chaque case de la pyramide */
  fratrie?: boolean
  /** Photos de l'arbre en ligne dans les cases */
  photos?: boolean
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
  /** Réglages propres au modèle ; le libellé de la case « frères et sœurs » */
  reglages: { bas?: boolean; photos?: boolean; fratrie: string }
  Feuille: FunctionComponent<{ d: Donnees; options: OptionsFeuille }>
  /** Une seconde feuille, à imprimer au dos de la première (même papier) */
  verso?: { titre: string; description: string; Feuille: FunctionComponent<{ d: Donnees; options: OptionsFeuille }> }
}

export const MODELES: Modele[] = [
  {
    id: 'origines',
    titre: 'Éventail des origines',
    description: 'Huit générations sur 220°, chaque ancêtre teinté selon sa province de naissance, avec les quatre quartiers et l’origine des ancêtres par génération.',
    forme: 'eventail',
    papier: { format: 'A3', orientation: 'landscape' },
    generations: 8,
    reglages: { bas: true, fratrie: 'Frères et sœurs au centre' },
    Feuille: EventailOrigines,
    verso: {
      titre: 'Les 128 bouts de branche',
      description: 'chaque case du bord de l’éventail prolongée d’un petit éventail des générations IX à XV',
      Feuille: BoutsDeBranche,
    },
  },
  {
    id: 'pyramide',
    titre: 'Arbre en pyramide',
    description: 'L’arbre traditionnel : la personne de départ en bas, huit générations en rangées, cases bleues pour les hommes et roses pour les femmes, les cinq premières générations en cartouches avec photo.',
    forme: 'arbre',
    papier: { format: 'A3', orientation: 'landscape' },
    generations: 8,
    reglages: { photos: true, fratrie: 'Frères et sœurs de chacun' },
    Feuille: Pyramide,
  },
]
