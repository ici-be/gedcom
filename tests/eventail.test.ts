import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { suivi } from '../src/lib/suivi'
import { abregerCommune, angles, anglesDepuis, couperLignes, enumerer, fratrie, LIEU_INCONNU, morceauxAnnees, morceauxTitre, ordreRegions, places, prenoms, regionDuLieu, resumer } from '../src/lib/eventail'
import type { Place } from '../src/lib/eventail'
import { GED } from './exemple'

test('places Sosa : personnes, parents à chercher, cases vides au-dessus', () => {
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

test('implexe : la seconde place renvoie à la première', () => {
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

test('résumé : années, sources, commune', () => {
  const arbre = lireArbre(GED)
  const jean = arbre.individus.get('@I2@')!
  const r = resumer(jean, suivi(arbre, jean))
  expect(r.naissance).toBe('v. 1950')
  expect(r.naissanceSourcee).toBe(false)
  expect(r.deces).toBeUndefined() // « 1 DEAT Y » : décédé, date inconnue, rien d'écrit
  expect(r.commune).toBe('Malines')
})

test('région de naissance', () => {
  expect(regionDuLieu(undefined, undefined, 'BE')).toBe(LIEU_INCONNU)
  expect(regionDuLieu('Malines, Anvers, Belgique', undefined, 'BE')).toBe('Anvers')
  expect(regionDuLieu('Cuesmes, Belgique', { region: 'Hainaut', pays: 'BE' }, 'BE')).toBe('Hainaut')
  expect(regionDuLieu('Maubeuge, France', { region: 'Nord', pays: 'FR' }, 'BE')).toBe('Nord (France)')
})

test('angles : pères à gauche, mères à droite', () => {
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

test('fratrie : mêmes père et mère, dans l’ordre des naissances, sans les demi-frères', () => {
  // Luc avant Jean dans la famille, et un demi-frère de Jean par son père
  const ged = GED.replace('1 CHIL @I2@\n1 CHIL @I6@\n', '1 CHIL @I6@\n1 CHIL @I2@\n')
    .replace('0 TRLR', '0 @I7@ INDI\n1 NAME Marc /Dupont/\n1 FAMC @F3@\n0 @F3@ FAM\n1 HUSB @I4@\n1 CHIL @I7@\n0 TRLR')
  const arbre = lireArbre(ged)
  const naissance = (ind: { id: string }) => suivi(arbre, arbre.individus.get(ind.id)!).naissance.evenement
  expect(fratrie(arbre, '@I2@', naissance).map((i) => i.prenom)).toEqual(['Jean', 'Luc'])
  expect(fratrie(arbre, '@I1@', naissance).map((i) => i.prenom)).toEqual(['Paul'])
})

test('titre : prénoms puis nom, fratrie, grande fratrie', () => {
  expect(enumerer(['Pierre', 'Paul', 'Jacques'])).toBe('Pierre, Paul et Jacques')
  const e = (prenom: string, nom = 'Dupont') => ({ prenom, nom })
  expect(morceauxTitre([e('Bruno Marie')], [])).toEqual(['Bruno Marie', 'Dupont'])
  expect(morceauxTitre([e('Pierre'), e('Paul'), e('Jacques')], [])).toEqual(['Pierre, Paul et Jacques', 'Dupont'])
  expect(morceauxTitre([e('Jacques', 'Lambert'), e('Pierre'), e('Paul')], [])).toEqual(['Jacques Lambert,', 'Pierre et Paul Dupont'])
  expect(morceauxTitre(['A', 'B', 'C', 'D'].map((p) => e(p)), ['Jean Dupont', 'Marie Lambert']))
    .toEqual(['Les quatre enfants de', 'Jean Dupont', 'et Marie Lambert'])
})

test('lignes : sur une ligne si possible, puis entre les morceaux, puis entre les mots', () => {
  const mesurer = (t: string, fs: number) => t.length * fs
  const place = (largeur: number) => () => largeur
  expect(couperLignes(['Bruno', 'Dupont'], [1], 3, mesurer, place(20)).lignes).toEqual(['Bruno Dupont'])
  expect(couperLignes(['Pierre et Paul', 'Dupont'], [1], 3, mesurer, place(14)).lignes).toEqual(['Pierre et Paul', 'Dupont'])
  // le premier morceau ne tient qu'en le coupant ; le nom reste à part
  expect(couperLignes(['Pierre et Paul', 'Dupont'], [1], 3, mesurer, place(10)).lignes).toEqual(['Pierre et', 'Paul', 'Dupont'])
  const c = couperLignes(['Anticonstitutionnellement'], [2, 1], 3, mesurer, place(10))
  expect(c).toMatchObject({ fs: 1, tient: false })
})

test('verso : l’éventail d’une branche part de son ancêtre', () => {
  expect(anglesDepuis(128, 256, 220)).toEqual({ a1: -110, a2: 0, profondeur: 1 })
  expect(anglesDepuis(128, 257, 220)).toEqual({ a1: 0, a2: 110, profondeur: 1 })
  // Sosa 131 · 4 + 3 : dernière place des grands-parents de 131
  const a = anglesDepuis(131, 131 * 4 + 3, 220)
  expect([a.a1, a.a2, a.profondeur]).toEqual([55, 110, 2])
})

test('régions : celles du recto d’abord, celles du verso ensuite, chacune par fréquence', () => {
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

describe('années sur les arbres', () => {
  const r = (n?: string, d?: string) => ({ prenom: '', nom: '', naissance: n, deces: d, naissanceSourcee: true, decesSourcee: false, vivant: false })
  test('jamais de « ? »', () => {
    expect(morceauxAnnees(r('1774', '1842')).map(([t]) => t).join('')).toBe('1774 – 1842')
    expect(morceauxAnnees(r('1774')).map(([t]) => t).join('')).toBe('1774')
    expect(morceauxAnnees(r(undefined, '1842')).map(([t]) => t).join('')).toBe('† 1842')
    expect(morceauxAnnees(r())).toEqual([])
  })
})

describe('thèmes, photos et générations de la pyramide', async () => {
  const { THEMES_PYRAMIDE, trouverThemePyramide, cadrePortrait, GENERATIONS_PYRAMIDE, bornerGenerationsPyramide, rangeesPyramide } = await import('../src/ui/arbres/Pyramide')
  test('thème par défaut et thèmes par sexe', () => {
    expect(trouverThemePyramide().id).toBe('quartiers')
    expect(trouverThemePyramide('inconnu').id).toBe('quartiers')
    const herbier = trouverThemePyramide('herbier')
    expect(herbier.case(2, 'M')).not.toEqual(herbier.case(3, 'F'))
    expect(herbier.case(2, 'M')).not.toEqual(trouverThemePyramide('classique').case(2, 'M'))
  })
  test('quatre quartiers, générations et gravure', () => {
    expect(THEMES_PYRAMIDE.length).toBeGreaterThanOrEqual(8)
    const q = trouverThemePyramide('quartiers')
    // Sosa 8 et 9 sont tous deux dans le premier quartier (Sosa 4) ; Sosa 10 est dans le deuxième (Sosa 5)
    expect(q.case(8, 'M')).toEqual(q.case(4, 'M'))
    expect(q.case(9, 'F')).toEqual(q.case(4, 'M'))
    expect(q.case(10, 'M')).toEqual(q.case(5, 'F'))
    expect(q.case(4, 'M')).not.toEqual(q.case(5, 'F'))
    const gen = trouverThemePyramide('generations')
    expect(gen.case(2, 'M')).toEqual(gen.case(3, 'F'))
    expect(gen.case(2, 'M')).not.toEqual(gen.case(4, 'M'))
    const gravure = trouverThemePyramide('gravure')
    expect(gravure.case(2, 'M')).toEqual(gravure.case(3, 'F'))
  })
  test('forme des portraits et bords arrondis (hors signatures)', () => {
    // Par défaut : carré à bords arrondis
    const defaut = cadrePortrait(0, 250, 60, false)
    expect(defaut.wp).toBe(defaut.hp)
    expect(defaut.rx).toBeGreaterThan(0)
    // Portrait carré : largeur === hauteur, coins vifs ou arrondis
    const carreVif = cadrePortrait(0, 250, 60, false, 'carree', false)
    const carreArrondi = cadrePortrait(0, 250, 60, false, 'carree', true)
    expect(carreVif.wp).toBe(carreVif.hp)
    expect(carreVif.rx).toBe(0)
    expect(carreArrondi.rx).toBeGreaterThan(0)
    // Portrait rectangulaire : plus haut que large, coins vifs ou arrondis
    const rectVif = cadrePortrait(0, 250, 60, false, 'rectangulaire', false)
    const rectArrondi = cadrePortrait(0, 250, 60, false, 'rectangulaire', true)
    expect(rectVif.wp).toBeLessThan(rectVif.hp)
    expect(rectVif.rx).toBe(0)
    expect(rectArrondi.rx).toBeGreaterThan(0)
    // Signature : dimensions inchangées quelles que soient la forme et l'option d'arrondi
    expect(cadrePortrait(0, 250, 60, true, 'carree', true)).toEqual(cadrePortrait(0, 250, 60, true, 'ovale', false))
    expect(cadrePortrait(4, 76, 88, true, 'rectangulaire', true)).toEqual(cadrePortrait(4, 76, 88, true, 'ovale', false))
  })
  test('nombre de générations réglable de 4 à 9 sans chevauchement des rangées', () => {
    expect(bornerGenerationsPyramide()).toBe(8)
    expect(bornerGenerationsPyramide(2)).toBe(4)
    expect(bornerGenerationsPyramide(12)).toBe(9)
    expect(GENERATIONS_PYRAMIDE).toEqual([4, 5, 6, 7, 8, 9])
    for (const n of GENERATIONS_PYRAMIDE) {
      const r = rangeesPyramide(n)
      expect(r.length).toBe(n)
      // Les générations I à V sont en cartouches horizontaux, VI à IX en étiquettes verticales
      r.forEach((rg, g) => expect(!!rg.vertical).toBe(g >= 5))
      // Chaque rangée est strictement au-dessus de la précédente (avec sa fratrie éventuelle) et tient dans la feuille
      for (let g = 0; g < r.length; g++) {
        expect(r[g].y).toBeGreaterThanOrEqual(18)
        expect(r[g].y + r[g].h).toBeLessThanOrEqual(965)
        if (g > 0) {
          const basParent = r[g].y + r[g].h + (r[g].fratrie ?? 0)
          expect(basParent).toBeLessThan(r[g - 1].y)
        }
      }
    }
  })
})

describe('arbre en sablier (ascendance et descendance)', async () => {
  const { bornerAscendance, bornerDescendance, rangeesSablier, disposer, ordreUnions } = await import('../src/ui/arbres/Sablier')
  const { MODELES } = await import('../src/ui/arbres/modeles')

  test('présent dans le catalogue des modèles', () => {
    const sablier = MODELES.find((m) => m.id === 'sablier')
    expect(sablier).toBeDefined()
    expect(sablier?.reglages.sablierGenerations).toBe(true)
    expect(sablier?.reglages.photos).toBe(true)
    expect(sablier?.reglages.theme).toBe(true)
  })

  test('bornage des générations', () => {
    expect(bornerAscendance()).toBe(4)
    expect(bornerAscendance(0)).toBe(4)
    expect(bornerAscendance(10)).toBe(6)
    expect(bornerDescendance()).toBe(2)
    expect(bornerDescendance(0)).toBe(2)
    expect(bornerDescendance(5)).toBe(3)
  })

  test('rangees sans chevauchement et contenues dans la feuille', () => {
    for (let a = 1; a <= 6; a++) {
      for (let d = 1; d <= 3; d++) {
        const descV = Array(d).fill(false)
        const r = rangeesSablier(a, descV, true)
        expect(r.length).toBe(a + 1 + d)
        for (let i = 0; i < r.length; i++) {
          expect(r[i].y).toBeGreaterThanOrEqual(10)
          expect(r[i].y + r[i].h).toBeLessThanOrEqual(920)
          if (i > 0) {
            const precedentBas = r[i - 1].y + r[i - 1].h + r[i - 1].fratrie
            expect(precedentBas).toBeLessThan(r[i].y)
          }
        }
      }
    }
  })

  test('disposition et feuilles des branches descendantes', () => {
    const descendants: any[] = [
      {
        ind: { id: 'c1' },
        profondeur: 1,
        enfants: [
          { ind: { id: 'c11' }, profondeur: 2, enfants: [] },
          { ind: { id: 'c12' }, profondeur: 2, enfants: [] },
        ],
      },
      { ind: { id: 'c2' }, profondeur: 1, enfants: [] },
    ]
    const feuilles = disposer(descendants)
    expect(feuilles).toBe(3)
    expect(descendants[0].feuilles).toBe(2)
    expect(descendants[0].enfants[0].debut).toBe(0)
    expect(descendants[0].enfants[1].debut).toBe(1)
    expect(descendants[1].debut).toBe(2)
  })

  test('ordre des unions avec premier et deuxième conjoint', () => {
    const u1: any = { famille: { id: 'f1' }, conjoint: { id: 'p1' }, enfants: [] }
    const u2: any = { famille: { id: 'f2' }, conjoint: { id: 'p2' }, enfants: [] }
    const res = ordreUnions([u1, u2])
    expect(res).toEqual([
      { union: u2, cote: 'gauche' },
      { union: u1, cote: 'droite' },
    ])
  })
})


describe('arbre du couple', async () => {
  const { rangeesSablier, conjointsDe, coupleAEnfantsAutreConjoint } = await import('../src/ui/arbres/Sablier')
  const { MODELES } = await import('../src/ui/arbres/modeles')

  test('présent dans le catalogue, avec le choix du conjoint et l’alignement du titre', () => {
    const couple = MODELES.find((m) => m.id === 'couple')
    expect(couple?.reglages.sablierGenerations).toBe(true)
    expect(couple?.reglages.conjoint).toBe(true)
    expect(couple?.reglages.alignementTitre).toBe(true)
  })

  test('rangees du couple : une génération de plus par moitié, sans chevauchement', () => {
    for (let a = 1; a <= 6; a++) {
      for (let d = 1; d <= 3; d++) {
        const r = rangeesSablier(a, Array(d).fill(false), true, true)
        expect(r.length).toBe(a + 1 + d)
        // les parents de chacun ont leurs frères et sœurs sous la case, les grands-parents passent en étiquettes à la génération IV
        const f1 = r.find((x) => x.sens === 'asc' && x.g === 1)?.fratrie ?? 0
        expect(f1).toBeGreaterThan(0)
        // aux générations III (g=2) et IV (g=3), la fratrie dispose de hauteur pour accueillir 3 lignes
        if (a >= 2) expect(r.find((x) => x.sens === 'asc' && x.g === 2)?.fratrie).toBeGreaterThan(f1)
        if (a >= 3) expect(r.find((x) => x.sens === 'asc' && x.g === 3)?.fratrie).toBeGreaterThan(0)
        if (a >= 4) expect(r.find((x) => x.sens === 'asc' && x.g === 4)?.vertical).toBe(true)
        for (let i = 1; i < r.length; i++) expect(r[i - 1].y + r[i - 1].h + r[i - 1].fratrie).toBeLessThan(r[i].y)
        expect(r[r.length - 1].y + r[r.length - 1].h).toBeLessThanOrEqual(920)
      }
    }
  })

  test('conjoints de la personne de départ', () => {
    const arbre = lireArbre(GED)
    const pere = arbre.individus.get('@I2@')!
    const c = conjointsDe(arbre, pere)
    expect(c.length).toBe(1)
    expect(c[0].conjoint.nom).toBe('Lambert')
  })

  test('enfants avec un autre conjoint pour l’arbre du couple', () => {
    const arbre = lireArbre(GED)
    const jean = arbre.individus.get('@I2@')!
    const marie = arbre.individus.get('@I3@')!

    // Sans autre union : ni Jean ni Marie n'ont d'enfants ailleurs
    expect(coupleAEnfantsAutreConjoint(arbre, jean, marie, '@F1@')).toBe(false)

    // Jean a une autre épouse, mais aucun enfant avec elle : toujours faux
    const gedSansEnfant = GED.replace(
      '0 @F1@ FAM',
      '0 @I10@ INDI\n1 NAME Jeanne /Martin/\n1 SEX F\n1 FAMS @F3@\n0 @F3@ FAM\n1 HUSB @I2@\n1 WIFE @I10@\n0 @F1@ FAM',
    ).replace('1 FAMS @F1@', '1 FAMS @F1@\n1 FAMS @F3@')
    const arbreSansEnfant = lireArbre(gedSansEnfant)
    expect(coupleAEnfantsAutreConjoint(arbreSansEnfant, arbreSansEnfant.individus.get('@I2@'), arbreSansEnfant.individus.get('@I3@'), '@F1@')).toBe(false)

    // Jean a un enfant avec une autre épouse : vrai
    const gedAvecEnfantJean = gedSansEnfant.replace(
      '0 @F1@ FAM',
      '0 @I11@ INDI\n1 NAME Julie /Dupont/\n1 SEX F\n1 FAMC @F3@\n0 @F1@ FAM',
    ).replace('0 @F3@ FAM\n1 HUSB @I2@\n1 WIFE @I10@', '0 @F3@ FAM\n1 HUSB @I2@\n1 WIFE @I10@\n1 CHIL @I11@')
    const arbreAvecEnfantJean = lireArbre(gedAvecEnfantJean)
    expect(coupleAEnfantsAutreConjoint(arbreAvecEnfantJean, arbreAvecEnfantJean.individus.get('@I2@'), arbreAvecEnfantJean.individus.get('@I3@'), '@F1@')).toBe(true)

    // Marie a un enfant avec un autre conjoint : vrai
    const gedAvecEnfantMarie = GED.replace(
      '0 @F1@ FAM',
      '0 @I10@ INDI\n1 NAME Henri /Moreau/\n1 SEX M\n1 FAMS @F3@\n0 @I11@ INDI\n1 NAME Claire /Moreau/\n1 SEX F\n1 FAMC @F3@\n0 @F3@ FAM\n1 HUSB @I10@\n1 WIFE @I3@\n1 CHIL @I11@\n0 @F1@ FAM',
    ).replace('0 @I3@ INDI\n1 NAME Marie /Lambert/\n1 SEX F\n1 BAPM\n2 DATE 2 MAR 1952\n2 PLAC Malines, Anvers, Belgique\n2 SOUR @S1@\n3 PAGE folio 12\n1 FAMS @F1@', '0 @I3@ INDI\n1 NAME Marie /Lambert/\n1 SEX F\n1 BAPM\n2 DATE 2 MAR 1952\n2 PLAC Malines, Anvers, Belgique\n2 SOUR @S1@\n3 PAGE folio 12\n1 FAMS @F1@\n1 FAMS @F3@')
    const arbreAvecEnfantMarie = lireArbre(gedAvecEnfantMarie)
    expect(coupleAEnfantsAutreConjoint(arbreAvecEnfantMarie, arbreAvecEnfantMarie.individus.get('@I2@'), arbreAvecEnfantMarie.individus.get('@I3@'), '@F1@')).toBe(true)
  })
})
