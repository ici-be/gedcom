import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { parente, pourcentPart, terme } from '../src/lib/lien-parente'

const ind = (n: number, nom: string, sexe: string, extra = '') => `0 @I${n}@ INDI\n1 NAME ${nom} /Test/\n1 SEX ${sexe}\n${extra}`
const arbre = lireArbre([
  ind(1, 'Xavier', 'M', '1 FAMS @F1@\n'), ind(2, 'Yvonne', 'F', '1 FAMS @F1@\n'),
  ind(3, 'Cécile', 'F', '1 FAMC @F1@\n1 FAMS @F2@\n'), ind(4, 'Denis', 'M', '1 FAMC @F1@\n1 FAMS @F3@\n'),
  ind(5, 'Gaëlle', 'F', '1 FAMC @F2@\n1 FAMS @F5@\n'), ind(6, 'Hugo', 'M', '1 FAMC @F3@\n'),
  ind(7, 'Ines', 'F', '1 FAMC @F4@\n'), ind(8, 'Jules', 'M', '1 FAMS @F5@\n'), ind(9, 'Karl', 'M', '1 FAMS @F2@\n'),
  ind(10, 'Léa', 'F', '1 FAMS @F3@\n'), ind(11, 'Marc', 'M', ''), ind(12, 'Nina', 'F', '1 FAMC @F6@\n'),
  `0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n1 CHIL @I4@\n`,
  `0 @F2@ FAM\n1 HUSB @I9@\n1 WIFE @I3@\n1 CHIL @I5@\n`,
  `0 @F3@ FAM\n1 HUSB @I4@\n1 WIFE @I10@\n1 CHIL @I6@\n`,
  `0 @F4@ FAM\n1 HUSB @I8@\n1 WIFE @I5@\n1 CHIL @I7@\n`,
  `0 @F5@ FAM\n1 HUSB @I8@\n1 WIFE @I5@\n1 CHIL @I7@\n`,
  `0 @F6@ FAM\n1 HUSB @I9@\n1 CHIL @I12@\n`,
].join(''))
const g = (n: number) => arbre.individus.get(`@I${n}@`)!

test('termes', () => {
  expect(terme(2, 2, 'F', 'M').terme).toBe('cousine germaine')
  expect(terme(3, 3, 'M', 'M').terme).toBe('cousin issu de germain')
  expect(terme(5, 5, 'M', 'M').terme).toBe('cousin du 4ᵉ degré')
  expect(terme(3, 1, 'F', 'M').terme).toBe('grand-tante')
  expect(terme(1, 4, 'M', 'M').terme).toBe('arrière-petit-neveu')
  expect(terme(3, 2, 'M', 'M').terme).toBe('oncle à la mode de Bretagne')
  expect(terme(4, 2, 'M', 'F').pivot?.role).toBe('grand-mère')
  expect(terme(1, 1, 'F', 'M', true).terme).toBe('demi-sœur')
})

test('sang : cousins germains', () => {
  const p = parente(arbre, g(5), g(6))
  expect(p.type).toBe('sang')
  if (p.type !== 'sang') return
  expect(p.terme.terme).toBe('cousin germain')
  expect(p.inverse.terme).toBe('cousine germaine')
  expect(p.degre).toBe(4)
  expect(pourcentPart(p.part)).toBe('12,5 %')
  expect(p.chemins[0].communs).toHaveLength(2)
  expect(p.chemins[0].montee).toEqual(['@I5@', '@I3@'])
  expect(p.chemins[0].descente).toEqual(['@I6@', '@I4@'])
})

test('sang : ascendance, descendance et oncle', () => {
  const terme = (x: number, y: number) => { const p = parente(arbre, g(x), g(y)); return p.type === 'sang' ? p.terme.terme : p.type }
  expect(terme(5, 1)).toBe('grand-père')
  expect(terme(1, 7)).toBe('arrière-petite-fille')
  expect(terme(5, 4)).toBe('oncle')
  expect(terme(4, 5)).toBe('nièce')
  expect(terme(3, 4)).toBe('frère')
})

test('alliance, inconnu, identique', () => {
  const p = parente(arbre, g(8), g(3))
  expect(p.type).toBe('alliance')
  if (p.type === 'alliance') {
    expect(p.terme).toBe('belle-mère')
    expect(p.etapes.map((e) => e.lien)).toEqual(['époux de', 'fille de'])
  }
  expect(parente(arbre, g(1), g(11)).type).toBe('aucun')
  expect(parente(arbre, g(1), g(1)).type).toBe('identique')
})

test('un grand-père : un seul chemin, pas de détour par ses propres parents', () => {
  // Gaëlle (5) → Cécile (3) → Xavier (1) : grand-père de Gaëlle ; Xavier a lui-même des parents connus
  const a = lireArbre([
    ind(1, 'Gus', 'M', '1 FAMS @F1@\n'), ind(2, 'Gina', 'F', '1 FAMS @F1@\n'),
    ind(3, 'Paul', 'M', '1 FAMC @F1@\n1 FAMS @F2@\n'), ind(4, 'Rita', 'F', '1 FAMS @F2@\n'),
    ind(5, 'Luc', 'M', '1 FAMC @F2@\n1 FAMS @F3@\n'), ind(6, 'Eva', 'F', '1 FAMS @F3@\n'),
    ind(7, 'Zoé', 'F', '1 FAMC @F3@\n'),
    `0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n`,
    `0 @F2@ FAM\n1 HUSB @I3@\n1 WIFE @I4@\n1 CHIL @I5@\n`,
    `0 @F3@ FAM\n1 HUSB @I5@\n1 WIFE @I6@\n1 CHIL @I7@\n`,
  ].join(''))
  const p = parente(a, a.individus.get('@I7@')!, a.individus.get('@I3@')!)
  expect(p.type === 'sang' && p.chemins.length).toBe(1)
})
