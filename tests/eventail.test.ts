import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { suivi } from '../src/lib/suivi'
import { abregerCommune, angles, LIEU_INCONNU, places, prenoms, regionDuLieu, resumer } from '../src/lib/eventail'
import { GED } from './exemple'

test('places Sosa : personnes, parents à chercher, cases vides au-dessus', () => {
  const arbre = lireArbre(GED)
  const p = places(arbre, '@I1@', 4)
  expect(p.length).toBe(16)
  expect(p[2].ind?.prenom).toBe('Jean')
  expect(p[3].ind?.nom).toBe('Lambert')
  expect(p[4].ind?.prenom).toBe('Pierre')
  expect(p[5].ind?.prenom).toBe('Anne')
  expect(p[6].etat).toBe('a-chercher')
  expect(p[12].etat).toBe('vide')
  expect(p[3].generation).toBe(1)
})

test('implexe : la seconde place renvoie à la première', () => {
  // Cas d'école : Jean (Sosa 2) est aussi le père de Marie (Sosa 6)
  const ged = GED.replace('0 @I3@ INDI\n', '0 @I3@ INDI\n1 FAMC @F9@\n').replace('0 TRLR', '0 @F9@ FAM\n1 HUSB @I2@\n1 CHIL @I3@\n0 TRLR')
  const p = places(lireArbre(ged), '@I1@', 3)
  expect(p[6].ind?.id).toBe('@I2@')
  expect(p[6].dejaVu).toBe(2)
  expect(p[2].dejaVu).toBeUndefined()
})

test('résumé : années, sources, commune', () => {
  const arbre = lireArbre(GED)
  const jean = arbre.individus.get('@I2@')!
  const r = resumer(jean, suivi(arbre, jean))
  expect(r.naissance).toBe('v. 1950')
  expect(r.naissanceSourcee).toBe(false)
  expect(r.deces).toBe('?')
  expect(r.commune).toBe('Malines')
})

test('région de naissance', () => {
  expect(regionDuLieu(undefined, undefined, 'BE')).toBe(LIEU_INCONNU)
  expect(regionDuLieu('Malines, Anvers, Belgique', undefined, 'BE')).toBe('Anvers')
  expect(regionDuLieu('Cuesmes, Belgique', { region: 'Hainaut', pays: 'BE' }, 'BE')).toBe('Hainaut')
  expect(regionDuLieu('Maubeuge, France', { region: 'Nord', pays: 'FR' }, 'BE')).toBe('Nord (France)')
})

test('angles : pères à gauche, mères à droite', () => {
  expect(angles(2, 220)).toEqual({ a1: -110, a2: 0, generation: 1 })
  expect(angles(7, 220)).toEqual({ a1: 55, a2: 110, generation: 2 })
})

test('prénoms limités et communes abrégées', () => {
  expect(prenoms('Marie-Catherine Josèphe Ghislaine', 2)).toBe('Marie-Catherine Josèphe')
  expect(prenoms('Jean', 1)).toBe('Jean')
  expect(abregerCommune('Saint-Ghislain')).toBe('St-Ghislain')
  expect(abregerCommune('Sainte-Ode')).toBe('Ste-Ode')
  expect(abregerCommune('Braine-Saint-Pierre')).toBe('Braine-St-Pierre')
  expect(abregerCommune('Saintes')).toBe('Saintes')
})
