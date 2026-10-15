import { expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { suivi } from '../src/lib/suivi'
import { abregerCommune, angles, anglesDepuis, couperLignes, enumerer, fratrie, LIEU_INCONNU, morceauxTitre, ordreRegions, places, prenoms, regionDuLieu, resumer } from '../src/lib/eventail'
import type { Place } from '../src/lib/eventail'
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

test('au-dessus d’un parent inconnu, les places vides sont marquées', () => {
  const ged = GED.replace('0 @I3@ INDI\n', '0 @I3@ INDI\n1 NOTE Filiation: père inconnu\n')
  const p = places(lireArbre(ged), '@I1@', 5)
  expect(p[6].etat).toBe('inconnu')
  expect(p[12].sousInconnu).toBe(true)
  expect(p[25].sousInconnu).toBe(true)
  expect(p[14].sousInconnu).toBeUndefined()
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

test('fratrie : mêmes père et mère, dans l’ordre des naissances, sans les demi-frères', () => {
  // Luc avant Jean dans la famille, et un demi-frère de Jean par son père
  const ged = GED.replace('1 CHIL @I2@\n1 CHIL @I6@\n', '1 CHIL @I6@\n1 CHIL @I2@\n')
    .replace('0 TRLR', '0 @I7@ INDI\n1 NAME Marc /Dupont/\n1 FAMC @F3@\n0 @F3@ FAM\n1 HUSB @I4@\n1 CHIL @I7@\n0 TRLR')
  const arbre = lireArbre(ged)
  const naissance = (ind: { id: string }) => suivi(arbre, arbre.individus.get(ind.id)!).naissance.evenement
  expect(fratrie(arbre, '@I2@', naissance).map((i) => i.prenom)).toEqual(['Jean', 'Luc'])
  expect(fratrie(arbre, '@I1@', naissance).map((i) => i.prenom)).toEqual(['Paul'])
})

test('titre : prénoms puis nom, fratrie, grande fratrie', () => {
  expect(enumerer(['Pierre', 'Paul', 'Jacques'])).toBe('Pierre, Paul et Jacques')
  const e = (prenom: string, nom = 'Dupont') => ({ prenom, nom })
  expect(morceauxTitre([e('Bruno Marie')], [])).toEqual(['Bruno Marie', 'Dupont'])
  expect(morceauxTitre([e('Pierre'), e('Paul'), e('Jacques')], [])).toEqual(['Pierre, Paul et Jacques', 'Dupont'])
  expect(morceauxTitre([e('Jacques', 'Lambert'), e('Pierre'), e('Paul')], [])).toEqual(['Jacques Lambert,', 'Pierre et Paul Dupont'])
  expect(morceauxTitre(['A', 'B', 'C', 'D'].map((p) => e(p)), ['Jean Dupont', 'Marie Lambert']))
    .toEqual(['Les quatre enfants de', 'Jean Dupont', 'et Marie Lambert'])
})

test('lignes : sur une ligne si possible, puis entre les morceaux, puis entre les mots', () => {
  const mesurer = (t: string, fs: number) => t.length * fs
  const place = (largeur: number) => () => largeur
  expect(couperLignes(['Bruno', 'Dupont'], [1], 3, mesurer, place(20)).lignes).toEqual(['Bruno Dupont'])
  expect(couperLignes(['Pierre et Paul', 'Dupont'], [1], 3, mesurer, place(14)).lignes).toEqual(['Pierre et Paul', 'Dupont'])
  // le premier morceau ne tient qu'en le coupant ; le nom reste à part
  expect(couperLignes(['Pierre et Paul', 'Dupont'], [1], 3, mesurer, place(10)).lignes).toEqual(['Pierre et', 'Paul', 'Dupont'])
  const c = couperLignes(['Anticonstitutionnellement'], [2, 1], 3, mesurer, place(10))
  expect(c).toMatchObject({ fs: 1, tient: false })
})

test('verso : l’éventail d’une branche part de son ancêtre', () => {
  expect(anglesDepuis(128, 256, 220)).toEqual({ a1: -110, a2: 0, profondeur: 1 })
  expect(anglesDepuis(128, 257, 220)).toEqual({ a1: 0, a2: 110, profondeur: 1 })
  // Sosa 131 · 4 + 3 : dernière place des grands-parents de 131
  const a = anglesDepuis(131, 131 * 4 + 3, 220)
  expect([a.a1, a.a2, a.profondeur]).toEqual([55, 110, 2])
})

test('régions : celles du recto d’abord, celles du verso ensuite, chacune par fréquence', () => {
  const pl: Place[] = []
  const regions = new Map<number, string>()
  const mettre = (s: number, r: string, dejaVu?: number) => {
    pl[s] = { sosa: s, generation: Math.floor(Math.log2(s)), etat: 'connu', ind: {} as Place['ind'], dejaVu }
    regions.set(s, r)
  }
  mettre(1, 'Liège')
  mettre(2, 'Hainaut'); mettre(3, 'Namur'); mettre(4, 'Namur')
  mettre(5, LIEU_INCONNU)
  // au verso : beaucoup de Limbourg, du Hainaut, et un implexe qui ne compte pas
  mettre(300, 'Limbourg'); mettre(301, 'Limbourg'); mettre(302, 'Hainaut'); mettre(303, 'Anvers', 2); mettre(304, 'Anvers', 2)
  expect(ordreRegions(pl, regions)).toEqual(['Namur', 'Hainaut', 'Limbourg'])
})
