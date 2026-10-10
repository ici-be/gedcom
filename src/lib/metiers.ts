// Les métiers : libellés des OCCU découpés, variantes d'écriture et féminins regroupés.

import type { Arbre, Evenement } from './gedcom/arbre'

export interface Mention {
  /** Le libellé tel qu'écrit dans le fichier */
  libelle: string
  evenement: Evenement
}

export interface Metier {
  /** Identifiant (forme principale sans accents), utilisé dans l'adresse de la page */
  cle: string
  /** « Cultivateur / cultivatrice » */
  titre: string
  /** Formes rencontrées et nombre de personnes pour chacune */
  variantes: { libelle: string; personnes: number }[]
  /** Personne → ses mentions de ce métier */
  personnes: Map<string, Mention[]>
}

export interface IndexMetiers {
  metiers: Map<string, Metier>
  /** Libellé (minuscules) → clé du métier */
  cleDe: (libelle: string) => string | undefined
}

// Terminaisons féminines → masculines possibles (de la plus longue à la plus courte)
const SUFFIXES: [string, string[]][] = [
  ['eresse', ['eur']], // pécheresse, venderesse
  ['drice', ['deur']], // ambassadrice
  ['trice', ['teur']],
  ['euse', ['eur', 'eux']],
  ['esse', ['e', '']], // maîtresse, comtesse, hôtesse
  ['ière', ['ier']],
  ['enne', ['en']],
  ['onne', ['on']],
  ['ette', ['et']],
  ['elle', ['el']],
  ['ère', ['er']],
  ['ive', ['if']],
  ['euve', ['euf']],
  ['ée', ['é']],
  ['e', ['']], // marchande, commise, avocate
]

const IRREGULIERS: Record<string, string> = {
  reine: 'roi', impératrice: 'empereur', abbesse: 'abbé', duchesse: 'duc', nonne: 'moine',
  'sage-femme': 'accoucheur', mère: 'père', sœur: 'frère', soeur: 'frère', dame: 'seigneur', servante: 'serviteur',
}

/** Forme de comparaison : minuscules, sans accents, œ → oe, espaces simples */
export function sansAccents(s: string): string {
  return s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** « Cultivateur, échevin » → deux libellés propres */
export function decouperMetiers(valeur: string): string[] {
  return valeur
    .split(/\s*[,;]\s*|\n/)
    .map((p) => p.replace(/\s+/g, ' ').replace(/^[\s.:\-"'«»]+|[\s.:\-"'«»]+$/g, ''))
    .filter((p) => p.length > 1)
}

/** Formes masculines candidates d'un libellé, en transformant le plus de mots possible d'abord */
function masculins(libelle: string): string[] {
  const mots = libelle.split(' ')
  const options = mots.map((mot) => {
    const formes: string[] = []
    if (IRREGULIERS[mot]) formes.push(IRREGULIERS[mot])
    for (const [fem, mascs] of SUFFIXES) {
      if (mot.length > fem.length + 2 && mot.endsWith(fem)) for (const m of mascs) formes.push(mot.slice(0, -fem.length) + m)
    }
    return [...formes, mot]
  })
  let combos: string[][] = [[]]
  for (const formes of options) {
    const suivants: string[][] = []
    for (const c of combos) for (const f of formes) suivants.push([...c, f])
    combos = suivants.slice(0, 500)
  }
  return combos.map((c) => c.join(' ')).filter((c) => c !== libelle)
}

function majuscule(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function indexerMetiers(arbre: Arbre): IndexMetiers {
  // 1. Toutes les mentions, par personne
  const mentions: { personne: string; libelle: string; evenement: Evenement }[] = []
  for (const ind of arbre.individus.values()) {
    for (const e of ind.evenements) {
      if (e.tag !== 'OCCU' || !e.type) continue
      for (const libelle of decouperMetiers(e.type)) mentions.push({ personne: ind.id, libelle, evenement: e })
    }
  }

  // 2. Variantes d'écriture : une forme sans accents → la graphie la plus fréquente
  const graphies = new Map<string, Map<string, number>>()
  for (const m of mentions) {
    const k = sansAccents(m.libelle)
    const g = graphies.get(k) ?? new Map<string, number>()
    const bas = m.libelle.charAt(0).toLowerCase() + m.libelle.slice(1)
    g.set(bas, (g.get(bas) ?? 0) + 1)
    graphies.set(k, g)
  }
  const graphie = (k: string) => [...graphies.get(k)!.entries()].sort((a, b) => b[1] - a[1])[0][0]

  // 3. Féminin → masculin, seulement si la forme masculine existe dans le fichier
  const vers = new Map<string, string>()
  for (const k of graphies.keys()) {
    const g = graphie(k).toLowerCase()
    const m = masculins(g).map(sansAccents).find((c) => c !== k && graphies.has(c))
    vers.set(k, m ?? k)
  }
  // une forme masculine trouvée peut elle-même pointer ailleurs (rare) : on suit la chaîne
  const racine = (k: string) => {
    let r = k
    for (let i = 0; i < 5 && vers.get(r) !== r; i++) r = vers.get(r)!
    return r
  }

  // 4. Regroupement
  const metiers = new Map<string, Metier>()
  const parForme = new Map<string, Map<string, Set<string>>>() // métier → forme → personnes
  for (const m of mentions) {
    const forme = sansAccents(m.libelle)
    const cle = racine(forme)
    let met = metiers.get(cle)
    if (!met) {
      met = { cle, titre: '', variantes: [], personnes: new Map() }
      metiers.set(cle, met)
    }
    const liste = met.personnes.get(m.personne) ?? []
    if (!liste.some((x) => x.evenement === m.evenement && x.libelle === m.libelle)) liste.push({ libelle: m.libelle, evenement: m.evenement })
    met.personnes.set(m.personne, liste)
    const formes = parForme.get(cle) ?? new Map<string, Set<string>>()
    formes.set(forme, (formes.get(forme) ?? new Set()).add(m.personne))
    parForme.set(cle, formes)
  }
  for (const met of metiers.values()) {
    const formes = [...parForme.get(met.cle)!.entries()].sort((a, b) => b[1].size - a[1].size)
    met.variantes = formes.map(([f, p]) => ({ libelle: graphie(f), personnes: p.size }))
    // titre : la forme principale (masculine si elle existe), puis la forme féminine la plus courante
    const principale = graphie(met.cle)
    const autre = formes.find(([f]) => f !== met.cle && vers.get(f) === met.cle)
    met.titre = majuscule(principale) + (autre ? ' / ' + graphie(autre[0]) : '')
  }

  return {
    metiers,
    cleDe: (libelle) => {
      const k = sansAccents(libelle)
      return graphies.has(k) ? racine(k) : undefined
    },
  }
}
