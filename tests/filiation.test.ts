import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { lireFiliation } from '../src/lib/filiation'
import { etatParents, filiationContredite } from '../src/lib/parente'
import { calculer } from '../src/lib/donnees'
import { generations } from '../src/lib/statistiques'
import { GED as EXEMPLE } from './exemple'

describe('mentions « Filiation: »', () => {
  test('les six cas', () => {
    expect(lireFiliation('Filiation: père inconnu')).toEqual({ pere: 'inconnu' })
    expect(lireFiliation('Filiation: mère inconnue')).toEqual({ mere: 'inconnu' })
    expect(lireFiliation('Filiation: parents inconnus')).toEqual({ pere: 'inconnu', mere: 'inconnu' })
    expect(lireFiliation('Filiation: père introuvable')).toEqual({ pere: 'introuvable' })
    expect(lireFiliation('Filiation: mère introuvable')).toEqual({ mere: 'introuvable' })
    expect(lireFiliation('Filiation: parents introuvables')).toEqual({ pere: 'introuvable', mere: 'introuvable' })
  })
  test('accents, majuscules, accords, explication et HTML', () => {
    expect(lireFiliation('Baptisé à Malines.\nfiliation: PERE INCONNU, d’après l’acte, folio 12')).toEqual({ pere: 'inconnu' })
    expect(lireFiliation('Filiation: père inconnu, mère introuvable')).toEqual({ pere: 'inconnu', mere: 'introuvable' })
    expect(lireFiliation('Filiation : père et mère introuvables')).toEqual({ pere: 'introuvable', mere: 'introuvable' })
    expect(lireFiliation('<p>Filiation: parent introuvable</p><p>Sa mère inconnue des voisins</p>')).toEqual({ pere: 'introuvable', mere: 'introuvable' })
  })
  test('« inconnu » l’emporte sur « introuvable »', () => {
    expect(lireFiliation('Filiation: parents introuvables\nFiliation: père inconnu')).toEqual({ pere: 'inconnu', mere: 'introuvable' })
  })
  test('rien à reconnaître', () => {
    expect(lireFiliation('père inconnu')).toBeUndefined()
    expect(lireFiliation('Filiation :\nmère inconnue')).toBeUndefined()
    expect(lireFiliation('Filiation: père incertain')).toBeUndefined()
    expect(lireFiliation('Filiation: père inconnusse')).toBeUndefined()
  })
})

// I1 : père inconnu (note en ligne, coupée par CONC) ; sa mère I2 a des parents introuvables (note @N1@) ;
// I3 dit « mère inconnue » alors que sa mère I4 figure dans l'arbre.
const GED = `0 @I1@ INDI
1 NAME Paul /Dupont/
1 NOTE Baptisé à Malines. Filiation: père in
2 CONC connu
1 FAMC @F1@
0 @I2@ INDI
1 NAME Marie /Dupont/
1 SEX F
1 NOTE @N1@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Luc /Martin/
1 NOTE Filiation: mère inconnue
1 FAMC @F2@
0 @I4@ INDI
1 NAME Anne /Lambert/
1 FAMS @F2@
0 @F1@ FAM
1 WIFE @I2@
1 CHIL @I1@
0 @F2@ FAM
1 WIFE @I4@
1 CHIL @I3@
0 @N1@ NOTE Registres perdus.
1 CONT Filiation: parents introuvables
`

describe('filiation dans l’arbre', () => {
  const a = lireArbre(GED)
  const ind = (id: string) => a.individus.get(id)!
  test('notes de la personne, renvois @N1@ et CONC compris', () => {
    expect(ind('@I1@').note).toBe('Baptisé à Malines. Filiation: père inconnu')
    expect(ind('@I1@').filiation).toEqual({ pere: 'inconnu' })
    expect(ind('@I2@').filiation).toEqual({ pere: 'introuvable', mere: 'introuvable' })
  })
  test('état des parents : l’arbre l’emporte sur la note', () => {
    expect(etatParents(a, ind('@I1@'))).toEqual({ pere: 'inconnu', mere: 'connu' })
    expect(etatParents(a, ind('@I3@'))).toEqual({ pere: 'a-chercher', mere: 'connu' })
    expect(filiationContredite(a, ind('@I3@'))).toEqual(['mere'])
    expect(filiationContredite(a, ind('@I1@'))).toEqual([])
  })
  test('places sans issue dans l’ascendance', () => {
    const g = generations(calculer(a, '@I1@', ''))
    expect(g.map((x) => [x.generation, x.connus, x.closes])).toEqual([[1, 1, 0], [2, 1, 1]])
  })
})

test('enfant qui porte le nom de sa mère, sans père : père inconnu', () => {
  // Luc, fils d'Anne : sans Pierre comme père, et Anne nommée Dupont comme lui
  const sansPere = EXEMPLE.replace('1 HUSB @I4@\n1 WIFE @I5@', '1 WIFE @I5@')
  const luc = (ged: string) => { const a = lireArbre(ged); return etatParents(a, a.individus.get('@I6@')!) }
  expect(luc(sansPere).pere).toBe('a-chercher')
  expect(luc(sansPere.replace('1 NAME Anne /?/', '1 NAME Anne /Dupont/'))).toEqual({ pere: 'inconnu', mere: 'connu' })
})

// Geneanet impose deux parents : « ?? /??/ » tient la place de celui qu'on ne connaît pas
const FICTIF = `0 @I1@ INDI
1 NAME Paul /Maes/
1 NOTE Filiation: père inconnu
1 FAMC @F1@
0 @I2@ INDI
1 NAME ?? /??/
1 SEX M
1 DEAT Y
1 FAMS @F1@
0 @I3@ INDI
1 NAME Anna /Maes/
1 SEX F
1 FAMS @F1@
0 @I4@ INDI
1 NAME ?? /Cambier/
1 SEX M
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I4@
`

describe('parent fictif « ?? /??/ »', () => {
  const a = lireArbre(FICTIF)
  test('retiré de l’arbre, la note s’applique', () => {
    expect(a.individus.has('@I2@')).toBe(false)
    expect(a.familles.get('@F1@')!.mari).toBeUndefined()
    expect(etatParents(a, a.individus.get('@I1@')!)).toEqual({ pere: 'inconnu', mere: 'connu' })
    expect(filiationContredite(a, a.individus.get('@I1@')!)).toEqual([])
  })
  test('un nom de famille connu en fait une vraie personne', () => {
    expect(a.individus.get('@I4@')!.nom).toBe('Cambier')
  })
})
