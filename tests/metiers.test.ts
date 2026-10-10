import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { decouperMetiers, indexerMetiers, sansAccents } from '../src/lib/metiers'

function arbre(metiers: [string, string][]): string {
  return metiers.map(([sexe, occu], i) => `0 @I${i + 1}@ INDI\n1 NAME P${i} /N/\n1 SEX ${sexe}\n1 OCCU ${occu}\n`).join('')
}

describe('métiers', () => {
  test('découpage et nettoyage', () => {
    expect(decouperMetiers('musicien ambulant, chocolatier ; mécanicien.')).toEqual(['musicien ambulant', 'chocolatier', 'mécanicien'])
    expect(sansAccents('Manœuvre  Ménagère')).toBe('manoeuvre menagere')
  })

  test('féminin réuni au masculin, mot par mot', () => {
    const ix = indexerMetiers(lireArbre(arbre([
      ['M', 'cultivateur'], ['F', 'cultivatrice'], ['F', 'ouvrière de fabrique'], ['M', 'ouvrier de fabrique'],
      ['F', 'musicienne ambulante'], ['M', 'musicien ambulant'], ['F', 'religieuse'], ['M', 'religieux'],
      ['F', 'reine'], ['M', 'roi'], ['F', 'employée'], ['M', 'employé'],
    ])))
    const titres = [...ix.metiers.values()].map((m) => m.titre).sort()
    expect(titres).toEqual([
      'Cultivateur / cultivatrice', 'Employé / employée', 'Musicien ambulant / musicienne ambulante',
      'Ouvrier de fabrique / ouvrière de fabrique', 'Religieux / religieuse', 'Roi / reine',
    ])
    expect(ix.cleDe('Cultivatrice')).toBe('cultivateur')
  })

  test('pas de fusion si la forme masculine est absente du fichier', () => {
    const ix = indexerMetiers(lireArbre(arbre([['F', 'couturière'], ['F', 'dentellière'], ['M', 'marin']])))
    expect([...ix.metiers.keys()].sort()).toEqual(['couturiere', 'dentelliere', 'marin'])
  })

  test('variantes d’écriture réunies, graphie la plus fréquente gardée', () => {
    const ix = indexerMetiers(lireArbre(arbre([['F', 'ménagère'], ['F', 'ménagère'], ['F', 'menagere'], ['M', 'Manoeuvre'], ['M', 'manœuvre']])))
    const m = ix.metiers.get('menagere')!
    expect(m.titre).toBe('Ménagère')
    expect(m.personnes.size).toBe(3)
    expect(ix.metiers.get('manoeuvre')!.personnes.size).toBe(2)
  })

  test('une personne comptée une fois par métier, plusieurs métiers par ligne', () => {
    const ix = indexerMetiers(lireArbre('0 @I1@ INDI\n1 SEX M\n1 OCCU cultivateur, échevin\n1 OCCU cultivateur\n2 DATE 1750\n'))
    expect(ix.metiers.get('cultivateur')!.personnes.get('@I1@')!.length).toBe(2)
    expect(ix.metiers.has('echevin')).toBe(true)
  })
})
