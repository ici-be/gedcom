// Catalogue des arbres imprimables. Pour en ajouter un : un composant qui dessine sa feuille en SVG
// (viewBox aux proportions du papier) et une entrée ici ; la page Imprimer s'occupe du reste.

import type { FunctionComponent } from 'preact'
import type { Donnees } from '../../lib/donnees'
import { BoutsDeBranche } from './BoutsDeBranche'
import { EventailOrigines } from './EventailOrigines'
import { Pyramide } from './Pyramide'
import { Couple, Sablier } from './Sablier'
import { TableAncetres } from './TableAncetres'

export type FormePhoto = 'ovale' | 'carree' | 'rectangulaire'

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
  /** Photos dans les cases des descendants (sur le sablier et l'arbre du couple ; sinon comme `photos`) */
  photosDesc?: boolean
  /** Conjoint et mariage dans les cartouches des descendants (sinon comme `mariages`) */
  mariagesDesc?: boolean
  /** Cases des descendants de même largeur : une place plus large pour ceux sans enfant, et les enfants d'un même parent empilés à la dernière génération (arbre du couple) */
  equitable?: boolean
  /** Forme des portraits dans les cases (hors signatures) */
  formePhoto?: FormePhoto
  /** Bords arrondis pour les portraits carrés ou rectangulaires */
  bordsArrondis?: boolean
  /** Mariage des parents : année (et lieu) sur la pyramide, boule teintée sur l'éventail */
  mariages?: boolean
  /** Dates sans source en italique (avec la mention en pied de page) */
  italiques?: boolean
  /** Thème de couleurs (sur la pyramide) */
  theme?: string
  /** Nombre de générations affichées (sur la pyramide) */
  generations?: number
  /** Numéro Sosa dans chaque case, pour retrouver la fiche dans la table du verso (sur la pyramide) */
  numeros?: boolean
  /** Nombre de générations d'ascendance (sur le sablier) */
  ascendance?: number
  /** Nombre de générations de descendance (sur le sablier) */
  descendance?: number
  /** Famille de la personne de départ avec le conjoint de l'arbre du couple (la première union par défaut) */
  conjoint?: string
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
  reglages: {
    bas?: boolean
    theme?: boolean
    generations?: boolean
    sablierGenerations?: boolean
    photos?: boolean
    /** Réglages de contenu distincts pour les descendants */
    descendants?: boolean
    /** Case « descendants équitables » */
    equitable?: boolean
    /** Choix du conjoint (arbre du couple) */
    conjoint?: boolean
    fratrie: string
    mariages: string
  }
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
    reglages: { bas: true, fratrie: 'Frères et sœurs du Sosa 1 (au centre)', mariages: 'Mariages des parents (boule teintée et année)' },
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
    description: 'L’arbre traditionnel : la personne de départ en bas, quatre à neuf générations en rangées, les cinq premières en cartouches avec photo, en plusieurs thèmes de couleurs.',
    forme: 'arbre',
    papier: { format: 'A3', orientation: 'landscape' },
    generations: 8,
    reglages: { theme: true, generations: true, photos: true, fratrie: 'Frères et sœurs de chacun (sous ou à côté de la case)', mariages: 'Mariages des parents (année et commune au-dessus de la case)' },
    Feuille: Pyramide,
    verso: {
      titre: 'La table des ancêtres',
      description: 'chaque case du recto par son numéro Sosa, avec dates, communes de naissance et de décès et métier',
      Feuille: TableAncetres,
    },
  },
  {
    id: 'sablier',
    titre: 'Ascendance et descendance',
    description: 'L’arbre en sablier : la personne de départ au centre avec ses conjoints, ses ancêtres au-dessus et ses descendants en dessous, en plusieurs thèmes de couleurs.',
    forme: 'arbre',
    papier: { format: 'A3', orientation: 'landscape' },
    generations: 6,
    reglages: { theme: true, sablierGenerations: true, descendants: true, photos: true, fratrie: 'Frères et sœurs de chacun (sous ou à côté de la case)', mariages: 'Mariages et conjoints (année et commune)' },
    Feuille: Sablier,
  },
  {
    id: 'couple',
    titre: 'Arbre du couple',
    description: 'La personne de départ et son conjoint côte à côte au centre, les ancêtres de chacun au-dessus (ceux de l’homme à gauche, ceux de la femme à droite) et leurs descendants communs en dessous, en plusieurs thèmes de couleurs.',
    forme: 'arbre',
    papier: { format: 'A3', orientation: 'landscape' },
    generations: 6,
    reglages: { theme: true, sablierGenerations: true, descendants: true, photos: true, conjoint: true, equitable: true, fratrie: 'Frères et sœurs de chacun (sous ou à côté de la case)', mariages: 'Mariages et conjoints (année et commune)' },
    Feuille: Couple,
  },
]
