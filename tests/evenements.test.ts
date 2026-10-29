import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { calculer } from '../src/lib/donnees'
import { datesEvenement, indexer, lieuA, marquants, moisEvenement, tracesDeces, triDe, type EvenementHistorique, type Jalon } from '../src/lib/evenements'
import type { Position } from '../src/lib/geo'
import { recit, texteBrut } from '../src/lib/recit'

const WATERLOO: Position = { lat: 50.715, lon: 4.399, qualite: 'trouve', pays: 'BE', codeRegion: 'BE.WBR' }
const MONS: Position = { lat: 50.454, lon: 3.952, qualite: 'trouve', pays: 'BE', codeRegion: 'BE.WHT' }
const PARIS: Position = { lat: 48.853, lon: 2.349, qualite: 'trouve', pays: 'FR', codeRegion: 'FR.75' }

const BATAILLE: EvenementHistorique = { id: 'Q48314', t: 'la bataille de Waterloo', type: 'bataille', d: '1815-06-18', p: 11, lat: 50.678, lon: 4.412, r: 20, n: 95 }
const CHOLERA: EvenementHistorique = { id: 'cholera-1832', t: 'l’épidémie de choléra de 1832', type: 'epidemie', d: '1832-03', p: 10, f: '1832-12', z: ['BE', 'FR'], n: 20 }
const BELGE: EvenementHistorique = { id: 'revolution-belge', t: 'la révolution belge', type: 'regime', d: '1830-08-25', p: 11, f: '1831-07-21', z: ['BE'], n: 60 }
const COMMUNE: EvenementHistorique = { id: 'commune-paris', t: 'la Commune de Paris', type: 'regime', d: '1871-03-18', p: 11, f: '1871-05-28', z: ['FR.75'], n: 70 }

test('dates : clés de tri et texte', () => {
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

test('lieu de vie : le dernier connu, « sans doute » loin de tout acte', () => {
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

test('traces : les actes de décès en ligne, les communes proches d’abord', () => {
  const ged = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Pierre /Martin/
1 DEAT
2 DATE 25 JUN 1815
2 PLAC Waterloo, Brabant wallon, Belgique
2 SOUR https://www.familysearch.org/ark:/61903/3:1:ABC
0 @I2@ INDI
1 NAME Anne /Martin/
1 BURI
2 DATE JUL 1815
2 PLAC Waterloo, Brabant wallon, Belgique
2 SOUR Registre paroissial https://agatha.arch.be/xyz
0 @I3@ INDI
1 NAME Louis /Martin/
1 DEAT
2 DATE 2 JUN 1815
2 PLAC Waterloo, Brabant wallon, Belgique
2 SOUR https://example.org/avant
0 @I4@ INDI
1 NAME Jules /Martin/
1 DEAT
2 DATE 20 JUN 1815
2 PLAC Paris, Paris, France
2 SOUR https://example.org/loin
0 @I5@ INDI
1 NAME Paul /Martin/
1 DEAT
2 DATE 30 JUN 1815
2 PLAC Waterloo, Brabant wallon, Belgique
0 @I6@ INDI
1 NAME Marc /Durant/
1 DEAT
2 DATE 3 MAR 1811
2 PLAC Nivelles, Brabant wallon, Belgique
2 SOUR https://example.org/nivelles-1811
0 @I7@ INDI
1 NAME Luc /Durant/
1 DEAT
2 DATE 9 SEP 1806
2 PLAC Nivelles, Brabant wallon, Belgique
2 SOUR https://example.org/nivelles-1806
0 @I8@ INDI
1 NAME Léa /Durant/
1 DEAT
2 DATE 4 FEB 1819
2 PLAC Nivelles, Brabant wallon, Belgique
2 SOUR https://example.org/nivelles-1819
0 @I9@ INDI
1 NAME Eva /Durant/
1 DEAT
2 DATE 4 FEB 1830
2 PLAC Nivelles, Brabant wallon, Belgique
2 SOUR https://example.org/nivelles-1830
0 TRLR`
  const d = calculer(lireArbre(ged), '@I1@', '')
  const NIVELLES: Position = { lat: 50.598, lon: 4.328, qualite: 'trouve', pays: 'BE', codeRegion: 'BE.WBR' }
  const positions = new Map([['Waterloo, Brabant wallon, Belgique', WATERLOO], ['Paris, Paris, France', PARIS], ['Nivelles, Brabant wallon, Belgique', NIVELLES]])
  const t = tracesDeces(d, positions, BATAILLE)
  // Waterloo : les actes pendant la bataille et le mois qui suit, pas celui d'avant ; Paris est trop loin
  // Nivelles : aucun pendant, le plus proche avant et le plus proche après (à moins de dix ans)
  expect(t.map((x) => [x.lieu.split(',')[0], x.actes.map((a) => a.id)])).toEqual([['Waterloo', ['@I1@', '@I2@']], ['Nivelles', ['@I6@', '@I8@']]])
  expect(t[0].actes[1]).toMatchObject({ id: '@I2@', tag: 'BURI', url: 'https://agatha.arch.be/xyz', pendant: true })
  expect(t[1].actes[0].pendant).toBe(false)
  // bataille à Nivelles même : ses actes de quatre ans plus tôt passent avant ceux du jour à Waterloo, à 14 km
  const A_NIVELLES: EvenementHistorique = { ...BATAILLE, lat: NIVELLES.lat, lon: NIVELLES.lon, r: 20 }
  expect(tracesDeces(d, positions, A_NIVELLES).map((x) => x.lieu.split(',')[0])).toEqual(['Nivelles', 'Waterloo'])
  // une révolution ne fait pas chercher dans les registres de décès
  expect(tracesDeces(d, positions, { ...BELGE, d: '1815-06-01', f: '1815-07-01' })).toEqual([])
  expect(moisEvenement(BATAILLE)).toBe('juin 1815')
  expect(moisEvenement(CHOLERA)).toBe('de mars à décembre 1832')
})
