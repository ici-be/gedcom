import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { lireFiliation } from '../src/lib/filiation'
import { etatParents, filiationContredite } from '../src/lib/parente'
import { calculer } from '../src/lib/donnees'
import { generations } from '../src/lib/statistiques'

describe('mots-clés de filiation', () => {
  test('les six mots-clés', () => {
    expect(lireFiliation('#pere-inconnu')).toEqual({ pere: 'inconnu' })
    expect(lireFiliation('#mere-inconnue')).toEqual({ mere: 'inconnu' })
    expect(lireFiliation('#parents-inconnus')).toEqual({ pere: 'inconnu', mere: 'inconnu' })
    expect(lireFiliation('#pere-introuvable')).toEqual({ pere: 'introuvable' })
    expect(lireFiliation('#mere-introuvable')).toEqual({ mere: 'introuvable' })
    expect(lireFiliation('#parents-introuvables')).toEqual({ pere: 'introuvable', mere: 'introuvable' })
  })
  test('accents, majuscules, accords et texte autour', () => {
    expect(lireFiliation('Baptême, folio 12. #Père_Inconnu, voir aussi…')).toEqual({ pere: 'inconnu' })
    expect(lireFiliation('#mère-inconnu #pereintrouvable')).toEqual({ pere: 'introuvable', mere: 'inconnu' })
    expect(lireFiliation('<p>#parent-introuvable</p>')).toEqual({ pere: 'introuvable', mere: 'introuvable' })
  })
  test('« inconnu » l’emporte sur « introuvable »', () => {
    expect(lireFiliation('#parents-introuvables #pere-inconnu')).toEqual({ pere: 'inconnu', mere: 'introuvable' })
  })
  test('rien à reconnaître', () => {
    expect(lireFiliation('père inconnu')).toBeUndefined()
    expect(lireFiliation('<tr style="color: #ecf0f1">')).toBeUndefined()
    expect(lireFiliation('#pere-inconnu-a-verifier')).toBeUndefined()
  })
})

// I1 : père inconnu (note en ligne, coupée par CONC) ; sa mère I2 a des parents introuvables (note @N1@) ;
// I3 dit #mere-inconnue alors que sa mère I4 figure dans l'arbre.
const GED = `0 @I1@ INDI
1 NAME Paul /Dupont/
1 NOTE Baptisé à Malines. #pere-in
2 CONC connu
1 FAMC @F1@
0 @I2@ INDI
1 NAME Marie /Dupont/
1 SEX F
1 NOTE @N1@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Luc /Martin/
1 NOTE #mere-inconnue
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
1 CONT #parents-introuvables
`

describe('filiation dans l’arbre', () => {
  const a = lireArbre(GED)
  const ind = (id: string) => a.individus.get(id)!
  test('notes de la personne, renvois @N1@ et CONC compris', () => {
    expect(ind('@I1@').note).toBe('Baptisé à Malines. #pere-inconnu')
    expect(ind('@I1@').filiation).toEqual({ pere: 'inconnu' })
    expect(ind('@I2@').filiation).toEqual({ pere: 'introuvable', mere: 'introuvable' })
  })
  test('état des parents : l’arbre l’emporte sur la note', () => {
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
