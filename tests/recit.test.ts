import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { lireDate } from '../src/lib/gedcom/dates'
import { calculer } from '../src/lib/donnees'
import { age, quand, recit, texteBrut, type Bloc, type Phrase } from '../src/lib/recit'
import { GED } from './exemple'

test('dates dites en toutes lettres', () => {
  expect(quand(lireDate('3 MAR 1702'))).toBe('le 3 mars 1702')
  expect(quand(lireDate('1 MAR 1702'))).toBe('le 1er mars 1702')
  expect(quand(lireDate('MAR 1702'))).toBe('en mars 1702')
  expect(quand(lireDate('1702'))).toBe('en 1702')
  expect(quand(lireDate('ABT 1702'))).toBe('vers 1702')
  expect(quand(lireDate('BEF 1702'))).toBe('avant 1702')
  expect(quand(lireDate('BET 1700 AND 1702'))).toBe('entre 1700 et 1702')
  expect(quand(undefined)).toBe('')
})

test('âges : exacts avec les mois, approchés sinon, rien sur une date bornée', () => {
  expect(age(lireDate('10 MAY 1800'), lireDate('9 MAY 1850'))).toEqual({ n: 49, approx: false })
  expect(age(lireDate('10 MAY 1800'), lireDate('10 MAY 1850'))).toEqual({ n: 50, approx: false })
  expect(age(lireDate('1800'), lireDate('1850'))).toEqual({ n: 50, approx: true })
  expect(age(lireDate('BEF 1800'), lireDate('1850'))).toBeUndefined()
})

const texte = (l: Phrase) => l.map((m) => (typeof m === 'string' ? m : 't' in m ? m.t : 'sosa' in m ? `[${m.sosa}]` : '')).join('')
function paragraphes(blocs: Bloc[]): Phrase[] {
  return blocs.flatMap((b) => (b.type === 'p' ? [b.texte] : b.items.flatMap((it) => paragraphes(it.blocs))))
}

test('le récit : la personne, ses parents, toujours le même texte, des noms en liens', () => {
  const d = calculer(lireArbre(GED), '@I1@', '')
  const r = recit(d, '@I1@', 2, 1)!
  expect(r.parties.map((p) => p.titre)).toEqual(['Paul Dupont', 'Ses parents', 'Ses grands-parents'])
  expect(texteBrut(r)).toBe(texteBrut(recit(d, '@I1@', 2, 1)!))
  // chaque phrase commence par une majuscule et finit par un point ; pas d'espace avant la virgule
  for (const pt of r.parties) for (const ph of paragraphes(pt.blocs)) {
    const s = texte(ph)
    expect(s).toMatch(/^[A-ZÀ-Ý]/)
    expect(s).toMatch(/[.:]$/)
    expect(s).not.toMatch(/ ,| \.|\s{2}/)
  }
  expect(r.parties.flatMap((p) => paragraphes(p.blocs).flat()).some((m) => typeof m === 'object' && 'id' in m && m.id === '@I2@')).toBe(true)
  expect(recit(d, '@inconnu@', 1, 1)).toBeNull()
})

const NOTICE = `0 HEAD
0 @I1@ INDI
1 NAME Jean /Martin/
1 SEX M
1 BIRT
2 DATE 10 MAR 1820
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
2 ASSO @I3@
3 TYPE INDI
3 RELA Witness
1 BAPM
2 DATE 12 MAR 1820
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
1 DEAT
2 DATE 5 JUL 1865
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
1 BURI
2 PLAC Forest, Bruxelles-Capitale, Belgique
1 OCCU musicien
1 FAMC @F2@
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /Dubois/
1 SEX F
1 BIRT
2 DATE 22 FEB 1819
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
1 DEAT
2 DATE 4 SEP 1894
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
1 OCCU ménagère
1 FAMS @F1@
0 @I3@ INDI
1 NAME Paul /Martin/
1 SEX M
1 BIRT
2 DATE 1 JAN 1795
1 FAMC @F2@
0 @I4@ INDI
1 NAME Pierre /Martin/
1 SEX M
1 FAMS @F2@
0 @I5@ INDI
1 NAME Louis /Martin/
1 SEX M
1 BIRT
2 DATE 1 SEP 1846
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
1 DEAT
2 DATE 3 OCT 1846
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I5@
1 MARR
2 DATE 6 MAY 1846
2 PLAC Bruxelles, Bruxelles-Capitale, Belgique
0 @F2@ FAM
1 HUSB @I4@
1 CHIL @I3@
1 CHIL @I1@
0 TRLR
`

test('la notice : naissance et décès en une phrase, mariage avec l’âge des époux, enfants, notes', () => {
  const d = calculer(lireArbre(NOTICE), '@I1@', '')
  const r = recit(d, '@I1@', 1, 1)!
  const t = texteBrut(r)
  expect(t).toMatch(/Jean Martin \[1\], musicien, fils de Pierre \[2\]\./)
  expect(t).toContain('Né le 10 mars 1820 à Bruxelles (Bruxelles-Capitale)¹, il y mourut le 5 juillet 1865, à l’âge de 45 ans, et fut inhumé à Forest')
  expect(t).toContain('Il avait épousé Marie Dubois, femme au foyer, le 6 mai 1846 à Bruxelles² ; il avait 26 ans, elle 27. Marie était née le 22 février 1819 à Bruxelles et y mourut le 4 septembre 1894, à l’âge de 75 ans.')
  expect(t).toContain('De cette union naquit un garçon :\n\n1. Louis Martin, né le 1er septembre 1846 à Bruxelles, y mourut le 3 octobre 1846, à l’âge de 32 jours.')
  expect(t).toContain('1. Baptisé deux jours plus tard. Témoin : Paul Martin, 25 ans, son frère.')
  expect(t).toContain('2. Un premier enfant naîtra trois mois plus tard.')
  // sans génération de descendants, les enfants tiennent en une ligne
  expect(texteBrut(recit(d, '@I1@', 0, 0)!)).toContain('De cette union naquit un garçon, Louis Martin (1846–1846).')
})

test('les petits arbres : le couple, les parents de chacun, les enfants, l’enfant de la lignée marqué', () => {
  const d = calculer(lireArbre(NOTICE), '@I1@', '')
  const r = recit(d, '@I1@', 1, 1, { arbres: true })!
  const [tete] = r.parties[0].blocs
  expect(tete.type).toBe('arbre')
  if (tete.type !== 'arbre') return
  expect(tete.arbre.couple.map((c) => c?.t)).toEqual(['Jean Martin', 'Marie Dubois'])
  expect(tete.arbre.haut[0].map((c) => c?.t)).toEqual(['Pierre Martin', undefined])
  // un enfant qui porte le nom du père n'est désigné que par son prénom
  expect(tete.arbre.enfants.map((c) => c.t)).toEqual(['Louis'])
  const parents = r.parties[1].blocs[0]
  expect(parents.type === 'arbre' && parents.arbre.enfants.find((c) => c.ligne)?.id).toBe('@I1@')
  // le texte copié ne change pas
  expect(texteBrut(r)).toBe(texteBrut(recit(d, '@I1@', 1, 1)!))
})

test('deux notes identiques dans une même partie ne font qu’une', () => {
  const ged = NOTICE.replace('1 OCCU musicien', '1 OCCU musicien\n1 NOTE Source : Famille.').replace('1 OCCU ménagère', '1 OCCU ménagère\n1 NOTE Source : Famille.')
  const r = recit(calculer(lireArbre(ged), '@I1@', ''), '@I1@', 1, 0)!
  const notes = r.parties[0].notes.map((n) => n.texte.join(''))
  expect(notes.filter((t) => t.includes('Famille')).length).toBe(1)
})

test('deux sources d’un même site mais de pages différentes restent deux notes', () => {
  const ged = NOTICE.replace('1 OCCU musicien', '1 OCCU musicien\n1 SOUR https://www.geneanet.org/a').replace('1 OCCU ménagère', '1 OCCU ménagère\n1 SOUR https://www.geneanet.org/b')
  const r = recit(calculer(lireArbre(ged), '@I1@', ''), '@I1@', 1, 0, { sources: true })!
  const urls = r.parties[0].notes.flatMap((n) => n.texte.flatMap((m) => (typeof m === 'object' && 'url' in m ? [m.url] : [])))
  expect(urls).toEqual(expect.arrayContaining(['https://www.geneanet.org/a', 'https://www.geneanet.org/b']))
})
