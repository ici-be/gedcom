import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { indexerMetiers } from '../src/lib/metiers'
import { construireGraphe, decrire, liensDeLArbre, motif, TYPES_LIENS, type Critere } from '../src/lib/graphe'

// Pierre et Anne, parents de Jean (baptisé : parrain Louis, marraine Rose) ; Jean épouse Marie (témoins Louis et Paul,
// ce dernier aussi déclarant au décès de Jean) ; Louis et Paul sont musiciens ; Jacques est seul.
const GED = `0 @I1@ INDI
1 NAME Jean /Dupont/
1 SEX M
1 FAMC @F1@
1 FAMS @F2@
1 BAPM
2 DATE 1800
2 ASSO @I5@
3 TYPE INDI
3 RELA GODP
2 ASSO @I6@
3 TYPE INDI
3 RELA GODP
1 DEAT
2 DATE 1850
2 ASSO @I7@
3 TYPE INDI
3 RELA Witness
0 @I2@ INDI
1 NAME Pierre /Dupont/
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Anne /Martin/
1 SEX F
1 FAMS @F1@
0 @I4@ INDI
1 NAME Marie /Lambert/
1 SEX F
1 FAMS @F2@
0 @I5@ INDI
1 NAME Louis /Durant/
1 SEX M
1 OCCU musicien
1 ASSO @F2@
2 TYPE FAM
2 RELA witness
0 @I6@ INDI
1 NAME Rose /Petit/
1 SEX F
0 @I7@ INDI
1 NAME Paul /Leroy/
1 SEX M
1 OCCU musicien, chantre
1 BIRT
2 PLAC Ath, Hainaut, Belgique
0 @I8@ INDI
1 NAME Jacques /Seul/
1 SEX M
1 OCCU chantre
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 @F2@ FAM
1 MARR
2 DATE 1825
2 ASSO @I5@
3 TYPE INDI
3 RELA Witness
2 ASSO @I7@
3 TYPE INDI
3 RELA Witness
1 HUSB @I1@
1 WIFE @I4@
`
const a = lireArbre(GED)
const m = indexerMetiers(a)
const base: Critere = { mode: 'entourage', metiers: [], texte: '', personne: '@I1@', pas: 1, famille: false, types: TYPES_LIENS }

describe('liens de l’arbre', () => {
  const { faits } = liensDeLArbre(a)
  test('chaque lien de famille une fois', () => {
    expect(faits.filter((f) => f.type === 'famille').length).toBe(4)
  })
  test('parrains et témoins par acte ; les parents seulement pour le baptême', () => {
    const louis = faits.filter((f) => f.a === '@I5@' && f.type !== 'cotemoin')
    expect(louis.map((f) => [f.type, f.b, f.acte?.tag, f.parEnfant]).sort()).toEqual([
      ['parrain', '@I1@', 'BAPM', undefined], ['parrain', '@I2@', 'BAPM', '@I1@'], ['parrain', '@I3@', 'BAPM', '@I1@'],
      ['temoin', '@I1@', 'MARR', undefined], ['temoin', '@I4@', 'MARR', undefined],
    ].sort())
    // Paul, déclarant au décès de Jean, n'est pas relié aux parents de Jean pour autant
    expect(faits.some((f) => f.a === '@I7@' && (f.b === '@I2@' || f.b === '@I3@'))).toBe(false)
  })
})

describe('graphe', () => {
  test('entourage', () => {
    const g = construireGraphe(a, m, base, false)
    expect(g.noeuds.map((n) => n.id).sort()).toEqual(['@I1@', '@I2@', '@I3@', '@I4@', '@I5@', '@I6@', '@I7@'])
    const ar = g.aretes.find((x) => x.a === '@I1@' && x.b === '@I5@')!
    expect([ar.type, ar.faits.length]).toEqual(['parrain', 2])
  })
  test('plusieurs métiers, isolés masqués', () => {
    const c: Critere = { ...base, mode: 'metiers', metiers: [m.cleDe('chantre')!, m.cleDe('musicien')!] }
    const g = construireGraphe(a, m, c, true)
    expect(g.noeuds.map((n) => [n.id, n.metier]).sort()).toEqual([['@I5@', 1], ['@I7@', 0]])
    expect(g.isoles).toBe(1)
    expect(g.aretes.map((x) => x.type)).toEqual(['cotemoin'])
  })
  test('frères et sœurs reliés seulement sans leurs parents', () => {
    const b = lireArbre(GED.replace('1 CHIL @I1@', '1 CHIL @I1@\n1 CHIL @I8@'))
    const c: Critere = { ...base, mode: 'nom', texte: 'j*' }
    expect(construireGraphe(b, indexerMetiers(b), c, false).aretes.map((x) => decrire(b, x.faits[0], '@I1@'))).toEqual(['frère'])
    expect(construireGraphe(b, indexerMetiers(b), { ...c, famille: true }, false).aretes.some((x) => x.faits[0].fratrie)).toBe(false)
  })
  test('lieu', () => {
    expect(construireGraphe(a, m, { ...base, mode: 'lieu', texte: 'ath' }, false).noeuds.map((n) => n.id)).toEqual(['@I7@'])
  })
})

test('descriptions', () => {
  const { parPersonne } = liensDeLArbre(a)
  const de = (vu: string, autre: string) => parPersonne.get(vu)!.filter((f) => f.a === autre || f.b === autre).map((f) => decrire(a, f, vu)).sort()
  expect(de('@I1@', '@I6@')).toEqual(['sa marraine (1800)'])
  expect(de('@I6@', '@I1@')).toEqual(['filleul (1800)'])
  expect(de('@I1@', '@I7@')).toEqual(['témoin à son décès (1850)', 'témoin à son mariage (1825)'])
  expect(de('@I7@', '@I1@')).toEqual(['Paul témoin à son décès (1850)', 'Paul témoin à son mariage (1825)'])
  expect(de('@I2@', '@I5@')).toEqual(['parrain au baptême de son enfant Jean Dupont (1800)'])
  expect(de('@I5@', '@I7@')).toEqual(['témoins ensemble au mariage de Jean Dupont et Marie Lambert (1825)'])
  expect(de('@I1@', '@I2@')).toEqual(['père'])
})

test('motif', () => {
  expect(motif('v*k*man?')!.test('veyckemans')).toBe(true)
  expect(motif('Brüx(')!.test('brux(elles')).toBe(true)
  expect(motif('  ')).toBeUndefined()
})
