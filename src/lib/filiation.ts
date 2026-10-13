// Filiation inconnue : mots-clés (#pere-inconnu…) écrits dans la note de la personne, sur Geneanet ou ailleurs.
// Le GEDCOM 5.5.1 n'a aucun champ pour dire qu'il est inutile de chercher un parent : la note voyage avec l'arbre.

/** inconnu : l'acte ne le nomme pas (le parent n'existe pas pour la généalogie) · introuvable : recherche abandonnée faute de sources */
export type Raison = 'inconnu' | 'introuvable'

export interface Filiation { pere?: Raison; mere?: Raison }

export interface MotCle {
  mot: string
  filiation: Filiation
  sens: string
  exemple: string
}

export const MOTS_CLES: MotCle[] = [
  {
    mot: '#pere-inconnu', filiation: { pere: 'inconnu' },
    sens: "L'acte de naissance ou de baptême ne nomme pas le père.",
    exemple: 'Enfant naturel, non reconnu : seule la mère est à chercher.',
  },
  {
    mot: '#mere-inconnue', filiation: { mere: 'inconnu' },
    sens: "L'acte ne nomme pas la mère.",
    exemple: 'Enfant reconnu par son père seul.',
  },
  {
    mot: '#parents-inconnus', filiation: { pere: 'inconnu', mere: 'inconnu' },
    sens: "L'acte ne nomme ni le père ni la mère.",
    exemple: 'Enfant trouvé, abandonné, né « de parents inconnus ».',
  },
  {
    mot: '#pere-introuvable', filiation: { pere: 'introuvable' },
    sens: 'Le père est nommé ou devrait l’être, mais les sources manquent.',
    exemple: 'Registres détruits, lacune, acte illisible : recherche close du côté paternel.',
  },
  {
    mot: '#mere-introuvable', filiation: { mere: 'introuvable' },
    sens: 'Même chose du côté maternel.',
    exemple: 'Mère nommée sans aucun moyen de la situer.',
  },
  {
    mot: '#parents-introuvables', filiation: { pere: 'introuvable', mere: 'introuvable' },
    sens: 'Les deux parents restent hors d’atteinte.',
    exemple: 'Naissance hors de la région, avant le début des registres…',
  },
]

/** Sans accent ni majuscule, « _ » ou rien à la place du trait d'union, accords libres : #Père_Inconnue, #parentsintrouvable… */
const MOT = /#(pere|mere|parents?)[-_]?(inconnu|introuvable)(?:e|s|es)?(?![\p{L}\p{N}_-])/gu

export function lireFiliation(note: string): Filiation | undefined {
  if (!note.includes('#')) return undefined
  const texte = note.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const f: Filiation = {}
  for (const m of texte.matchAll(MOT)) {
    const raison = m[2] as Raison
    const cotes = m[1].startsWith('parent') ? (['pere', 'mere'] as const) : [m[1] as 'pere' | 'mere']
    // « inconnu » est un fait établi : il l'emporte sur « introuvable »
    for (const c of cotes) if (f[c] !== 'inconnu') f[c] = raison
  }
  return f.pere || f.mere ? f : undefined
}

/** connu : présent dans l'arbre · à chercher : absent, sans mot-clé */
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
