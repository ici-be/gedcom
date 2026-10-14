import { describe, expect, test } from 'vitest'
import { codePays, decouper, situer, type Repertoire } from '../src/lib/geo'

const BE: Repertoire = {
  a: { WAL: ['Wallonia', 'wallonia', 'wallonie'], 'WAL.WHT': ['Province du Hainaut', 'province du hainaut', 'hainaut'], 'WAL.WNA': ['Province de Namur', 'province de namur', 'namur'], 'VLG.VAN': ['Provincie Antwerpen', 'provincie antwerpen', 'anvers'] },
  l: [
    ['Cuesmes', 50.436, 3.923, 'WAL', 'WHT', 9992],
    ['Mechelen', 51.026, 4.478, 'VLG', 'VAN', 77530, ['Malines']],
    ['Saint-Germain', 50.573, 4.842, 'WAL', 'WNA', 0],
    ['Saint-Germain', 50.45, 3.95, 'WAL', 'WHT', 0],
    ['Borgerhout', 51.21, 4.435, 'VLG', 'VAN', 46087],
    ['Borgerhout', 51.124, 5.074, 'VLG', 'VAN', 0],
    ['Mons', 50.454, 3.952, 'WAL', 'WHT', 91277],
  ],
}
const FR: Repertoire = {
  a: { '11': ['Île-de-France', 'ile de france'], '11.75': ['Paris', 'paris'] },
  l: [['Paris', 48.853, 2.349, '11', '75', 2138551], ['Les Paris', 45.64, 5.737, '84', '73', 0, ['Paris']]],
}
const monde: Repertoire = { a: {}, l: [['Prague', 50.088, 14.421, 'CZ', '', 1165581, ['Praha']]] }
const charger = async (f: string) => ({ BE, FR, monde } as Record<string, Repertoire>)[f] ?? Promise.reject(new Error(f))

describe('pays', () => {
  test('noms en plusieurs langues, alias et fautes de frappe', () => {
    expect(codePays('Belgique')).toBe('BE')
    expect(codePays('België')).toBe('BE')
    expect(codePays('Begique')).toBe('BE')
    expect(codePays('Allemagne')).toBe('DE') // et pas la RDA
    expect(codePays('Etats-Unis d\'Amérique')).toBe('US')
    expect(codePays('République tchèque')).toBe('CZ')
    expect(codePays('Hainaut')).toBeUndefined()
  })
  test('découpage', () => {
    expect(decouper('Cuesmes, Hainaut, Belgique')).toEqual({ commune: 'Cuesmes', contexte: ['Hainaut'], pays: 'BE' })
    expect(decouper('Rue Blaes 247, Bruxelles, Belgique')).toEqual({ commune: 'Bruxelles', contexte: [], pays: 'BE' })
    expect(decouper('Belgique').commune).toBe('')
  })
})

describe('situer', () => {
  test('communes, noms alternatifs, homonymes départagés par la province', async () => {
    const p = await situer([
      'Cuesmes, Hainaut, Belgique', 'Malines, Anvers, Belgique', 'Saint Germain - Mons, Hainaut, Belgique',
      'Borgerhout, Anvers, Belgique', 'Paris 10e, Paris, France', 'Prague, République tchèque', 'Atlantide, Belgique', 'Belgique',
    ], charger)
    expect(p.get('Cuesmes, Hainaut, Belgique')).toMatchObject({ lat: 50.436, qualite: 'trouve', region: 'Hainaut', codeRegion: 'BE.WHT' })
    expect(p.get('Malines, Anvers, Belgique')).toMatchObject({ lat: 51.026, qualite: 'trouve' })
    expect(p.get('Saint Germain - Mons, Hainaut, Belgique')).toMatchObject({ lat: 50.45, qualite: 'trouve' })
    expect(p.get('Borgerhout, Anvers, Belgique')).toMatchObject({ lat: 51.21, qualite: 'trouve' }) // la ville, pas le hameau
    expect(p.get('Paris 10e, Paris, France')).toMatchObject({ lat: 48.853, qualite: 'trouve', codeRegion: 'FR.75' })
    expect(p.get('Prague, République tchèque')).toMatchObject({ lat: 50.088 })
    expect(p.has('Atlantide, Belgique')).toBe(false)
    expect(p.has('Belgique')).toBe(false)
  })
})
