import { expect, test } from 'vitest'
import { cadreRobuste, distanceKm, lieuEn, mediane, passages, quartierDe, tranches, type Etape, type Vie } from '../src/lib/migrations'
import type { Place } from '../src/lib/eventail'

const BRUXELLES = { lat: 50.85, lon: 4.35 }
const MONS = { lat: 50.45, lon: 3.95 }
const etape = (type: Etape['type'], pos: { lat: number; lon: number }, annee?: number): Etape => ({ type, annee, lieu: '', pos })

test('distance à vol d’oiseau', () => {
  expect(Math.round(distanceKm(BRUXELLES, MONS))).toBe(53)
  expect(distanceKm(MONS, MONS)).toBe(0)
})

test('quartier d’une place Sosa', () => {
  expect(quartierDe(1)).toBe(-1)
  expect(quartierDe(3)).toBe(-1)
  expect([4, 5, 6, 7].map(quartierDe)).toEqual([0, 1, 2, 3])
  expect(quartierDe(5 * 32 + 3)).toBe(1)
  expect(quartierDe(255)).toBe(3)
})

test('passages : du parent à l’enfant, un implexe une seule fois', () => {
  const ind = {} as Place['ind']
  const pl: Place[] = []
  for (const s of [1, 2, 3, 4, 6]) pl[s] = { sosa: s, generation: Math.floor(Math.log2(s)), etat: 'connu', ind }
  // le Sosa 6 est la même personne que le 4, et son enfant (3) n'est pas répété : le passage compte
  pl[6].dejaVu = 4
  const n = new Map([[1, etape('naissance', BRUXELLES)], [2, etape('naissance', MONS)], [3, etape('naissance', BRUXELLES)], [4, etape('naissance', MONS)]])
  const l = passages(pl, n, [0, 1980, 1950, 1952, 1920, 0, 1925])
  expect(l.map((p) => p.sosa)).toEqual([2, 3, 4, 6])
  expect(l[0].annee).toBe(1980)
  expect(Math.round(l[0].km)).toBe(53)
  expect(l[1].km).toBe(0)
  // un enfant lui-même répété : ses parents sont déjà comptés à sa première place
  pl[2].dejaVu = 3
  expect(passages(pl, n, [0, 1980, 1950, 1952, 1920, 0, 1925]).map((p) => p.sosa)).toEqual([2, 3, 6])
})

test('lieu de vie à une date : le dernier connu', () => {
  const v: Vie = { sosa: 2, quartier: -1, debut: 1800, fin: 1860, etapes: [etape('naissance', MONS, 1800), etape('mariage', BRUXELLES, 1825)] }
  expect(lieuEn(v, 1810).pos).toBe(MONS)
  expect(lieuEn(v, 1825).pos).toBe(BRUXELLES)
})

test('tranches de distance, médiane, cadre sans les points excentrés', () => {
  const p = (km: number) => ({ km }) as never
  expect(tranches([p(0), p(0.5), p(10), p(30), p(200)])).toEqual([2, 1, 1, 1])
  expect(mediane([5, 1, 3])).toBe(3)
  expect(mediane([])).toBeUndefined()
  const pts = Array.from({ length: 100 }, (_, i) => ({ lat: 50 + i / 100, lon: 4 }))
  pts.push({ lat: 45, lon: 4 })
  const f = cadreRobuste(pts, 0)!
  expect(f[1]).toBeGreaterThan(49)
})
