import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { genres, premierPrenom } from '../src/lib/genres'

let n = 0
const ind = (prenom: string, sexe: string) => `0 @I${++n}@ INDI\n1 NAME ${prenom} /X/\n1 SEX ${sexe}\n`
const ged = [
  ...Array.from({ length: 20 }, () => ind('Jean Baptiste', 'M')),
  ind('Jean', 'F'),
  ...Array.from({ length: 20 }, () => ind('Marie-Thérèse', 'F')),
  ind('Marie', 'M'),
  ind('Marie', 'U'),
  ...Array.from({ length: 20 }, () => ind('Dominique', 'M')),
  ind('Dominique', 'F'),
  ...Array.from({ length: 3 }, () => ind('Léon', 'M')),
  ind('Léon', 'F'),
].join('')

test('premier prénom', () => {
  expect(premierPrenom('Jean-Baptiste Joseph')).toBe('jean')
  expect(premierPrenom('Thérèse')).toBe('therese')
  expect(premierPrenom('J.')).toBeUndefined()
  expect(premierPrenom('')).toBeUndefined()
})

test('genres douteux', () => {
  const g = genres(lireArbre(ged))
  expect(g.map((x) => [x.type, x.prenom, x.suggere])).toEqual([
    ['inconnu', 'Marie', 'F'],
    ['oppose', 'Jean', 'M'],
    ['oppose', 'Marie', 'F'],
  ])
  // Dominique est mixte, Léon trop rare
  expect(g.find((x) => x.prenom === 'Jean')).toMatchObject({ hommes: 20, femmes: 1 })
})
