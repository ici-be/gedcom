import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { datesEvenement, indexer, lieuA, marquants, triDe, type EvenementHistorique, type Jalon } from '../src/lib/evenements'
import type { Position } from '../src/lib/geo'
import { recit, texteBrut } from '../src/lib/recit'

const WATERLOO: Position = { lat: 50.715, lon: 4.399, qualite: 'trouve', pays: 'BE', codeRegion: 'BE.WBR' }
const MONS: Position = { lat: 50.454, lon: 3.952, qualite: 'trouve', pays: 'BE', codeRegion: 'BE.WHT' }
const PARIS: Position = { lat: 48.853, lon: 2.349, qualite: 'trouve', pays: 'FR', codeRegion: 'FR.75' }

const BATAILLE: EvenementHistorique = { id: 'Q48314', t: 'la bataille de Waterloo', type: 'bataille', d: '1815-06-18', p: 11, lat: 50.678, lon: 4.412, r: 20, n: 95 }
const CHOLERA: EvenementHistorique = { id: 'cholera-1832', t: 'l’épidémie de choléra de 1832', type: 'epidemie', d: '1832-03', p: 10, f: '1832-12', z: ['BE', 'FR'], n: 20 }
const BELGE: EvenementHistorique = { id: 'revolution-belge', t: 'la révolution belge', type: 'regime', d: '1830-08-25', p: 11, f: '1831-07-21', z: ['BE'], n: 60 }
const COMMUNE: EvenementHistorique = { id: 'commune-paris', t: 'la Commune de Paris', type: 'regime', d: '1871-03-18', p: 11, f: '1871-05-28', z: ['FR.75'], n: 70 }

test('dates : clés de tri et texte', () => {
  expect(triDe('1815-06-18')).toBe(18150618)
  expect(triDe('1832')).toBe(18320101)
  expect(triDe('1832', true)).toBe(18321231)
  expect(datesEvenement(BATAILLE)).toBe('18 juin 1815')
  expect(datesEvenement(BELGE)).toBe('25 août 1830 – 21 juillet 1831')
  expect(datesEvenement({ ...COMMUNE })).toBe('du 18 mars au 28 mai 1871')
  expect(datesEvenement(CHOLERA)).toBe('de mars à décembre 1832')
  expect(datesEvenement({ ...CHOLERA, d: '1832-04' })).toBe('d’avril à décembre 1832')
  expect(datesEvenement({ ...CHOLERA, d: '1914', p: 9, f: '1918' })).toBe('1914-1918')
})

test('lieu de vie : le dernier connu, « sans doute » loin de tout acte', () => {
  const j = (tri: number, pos: Position): Jalon => ({ tri, lieu: '', pos })
  const l = [j(17910303, MONS), j(18140514, WATERLOO), j(18200101, WATERLOO), j(18500101, PARIS)]
  expect(lieuA(l, 18150618)).toEqual({ jalon: l[1], probable: false })
  expect(lieuA(l, 18050101)?.jalon).toBe(l[0])
  expect(lieuA(l, 18050101)?.probable).toBe(true)
  expect(lieuA(l, 18800101)).toBeUndefined()
})

const GED = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Jean-Baptiste /Dupont/
1 SEX M
1 BIRT
2 DATE 3 MAR 1791
2 PLAC Mons, Hainaut, Belgique
1 DEAT
2 DATE 1 FEB 1860
2 PLAC Waterloo, Brabant wallon, Belgique
1 FAMS @F1@
0 @I2@ INDI
1 NAME Marie /Lebrun/
1 SEX F
1 BIRT
2 DATE 1793
2 PLAC Waterloo, Brabant wallon, Belgique
1 DEAT
2 DATE 1812
2 PLAC Waterloo, Brabant wallon, Belgique
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 14 MAY 1814
2 PLAC Waterloo, Brabant wallon, Belgique
0 TRLR`

test('qui a connu quoi, et la phrase du récit', () => {
  const arbre = lireArbre(GED)
  const d = calculer(arbre, '@I1@', '')
  const positions = new Map([
    ['Mons, Hainaut, Belgique', MONS],
    ['Waterloo, Brabant wallon, Belgique', WATERLOO],
  ])
  const index = indexer(d, positions, [COMMUNE, CHOLERA, BATAILLE, BELGE])
  const jb = index.parPersonne.get('@I1@')!
  expect(jb.map((v) => v.ev.id)).toEqual(['Q48314', 'revolution-belge', 'cholera-1832'])
  expect(jb[0].age).toBe(24)
  expect(Math.round(jb[0].km!)).toBe(4)
  // morte en 1812 : ni bataille, ni révolution
  expect(index.parPersonne.get('@I2@')).toBeUndefined()
  expect(index.parEvenement.get('Q48314')!.map((v) => v.id)).toEqual(['@I1@'])
  expect(marquants(jb).length).toBe(3)

  const brut = texteBrut(recit(d, '@I1@', 0, 0, { evenements: index.parPersonne })!)
  expect(brut).toContain('Le 18 juin 1815, alors qu’il avait 24 ans, la bataille de Waterloo se livra à 4 km de Waterloo, où il vivait.')
  expect(brut).toMatch(/Il (connut|vécut|traversa) aussi la révolution belge \(1830-1831\) et l’épidémie de choléra de 1832\./)
  // sans l'option, rien
  expect(texteBrut(recit(d, '@I1@', 0, 0)!)).not.toContain('Waterloo, où')
})
