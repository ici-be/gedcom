// Filiation inconnue : une ligne « Filiation : père inconnu » dans la note de la personne, sur Geneanet ou ailleurs.
// Le GEDCOM 5.5.1 n'a aucun champ pour dire qu'il est inutile de chercher un parent : la note voyage avec l'arbre.
// Une phrase plutôt qu'un #mot-clé : la syntaxe wiki de GeneWeb change un « # » en début de ligne en liste numérotée.

/** inconnu : l'acte ne le nomme pas (le parent n'existe pas pour la généalogie) · introuvable : recherche abandonnée faute de sources */
export type Raison = 'inconnu' | 'introuvable'

export interface Filiation { pere?: Raison; mere?: Raison }

export interface Mention {
  mot: string
  filiation: Filiation
  sens: string
  exemple: string
}

export const MENTIONS: Mention[] = [
  {
    mot: 'Filiation : père inconnu', filiation: { pere: 'inconnu' },
    sens: "L'acte de naissance ou de baptême ne nomme pas le père.",
    exemple: 'Enfant naturel, non reconnu : seule la mère est à chercher.',
  },
  {
    mot: 'Filiation : mère inconnue', filiation: { mere: 'inconnu' },
    sens: "L'acte ne nomme pas la mère.",
    exemple: 'Enfant reconnu par son père seul.',
  },
  {
    mot: 'Filiation : parents inconnus', filiation: { pere: 'inconnu', mere: 'inconnu' },
    sens: "L'acte ne nomme ni le père ni la mère.",
    exemple: 'Enfant trouvé, abandonné, né « de parents inconnus ».',
  },
  {
    mot: 'Filiation : père introuvable', filiation: { pere: 'introuvable' },
    sens: 'Le père est nommé ou devrait l’être, mais les sources manquent.',
    exemple: 'Registres détruits, lacune, acte illisible : recherche close du côté paternel.',
  },
  {
    mot: 'Filiation : mère introuvable', filiation: { mere: 'introuvable' },
    sens: 'Même chose du côté maternel.',
    exemple: 'Mère nommée sans aucun moyen de la situer.',
  },
  {
    mot: 'Filiation : parents introuvables', filiation: { pere: 'introuvable', mere: 'introuvable' },
    sens: 'Les deux parents restent hors d’atteinte.',
    exemple: 'Naissance hors de la région, avant le début des registres…',
  },
]

/** Le reste de la ligne après « Filiation : », jusqu'à la balise suivante (Geneanet garde parfois les notes en HTML) */
const LIGNE = /\bfiliation\s*:([^\n<]*)/g
/** « père inconnu », « mère introuvable », « parents inconnus », « père et mère introuvables »… */
const CAS = /\b(pere et mere|pere|mere|parents?)\s+(inconnu|introuvable)(?:e|s|es)?\b/g

export function lireFiliation(note: string): Filiation | undefined {
  const texte = note.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!texte.includes('filiation')) return undefined
  const f: Filiation = {}
  for (const l of texte.matchAll(LIGNE)) {
    for (const m of l[1].matchAll(CAS)) {
      const raison = m[2] as Raison
      const cotes: ('pere' | 'mere')[] = m[1] === 'pere' || m[1] === 'mere' ? [m[1]] : ['pere', 'mere']
      // « inconnu » est un fait établi : il l'emporte sur « introuvable »
      for (const c of cotes) if (f[c] !== 'inconnu') f[c] = raison
    }
  }
  return f.pere || f.mere ? f : undefined
}

/** connu : présent dans l'arbre · à chercher : absent, sans mention « Filiation : » */
export type EtatParent = 'connu' | 'a-chercher' | Raison

export function texteParent(etat: EtatParent, cote: 'pere' | 'mere'): string {
  const p = cote === 'pere' ? 'père' : 'mère'
  const e = cote === 'pere' ? '' : 'e'
  switch (etat) {
    case 'inconnu': return `${p} inconnu${e}`
    case 'introuvable': return `${p} introuvable`
    case 'a-chercher': return `${p} à chercher`
    case 'connu': return p
  }
}
