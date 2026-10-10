import { describe, expect, test } from 'vitest'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { ancetres, comparerSosa, dansBranche, fratries, homonymes } from '../src/lib/parente'
import { score, suivi } from '../src/lib/suivi'
import { communes, decouperLieu } from '../src/lib/communes'
import { adresseDevinee, lienGeneWeb, normaliserAdresse } from '../src/lib/geneanet'
import { versCsv } from '../src/lib/csv'
import { GED } from './exemple'

const a = lireArbre(GED)
const ind = (id: string) => a.individus.get(id)!

describe('parenté', () => {
  test('numéros Sosa', () => {
    const anc = ancetres(a, '@I1@')
    expect([...anc.values()].map((x) => [x.id, x.sosa, x.generation])).toEqual([
      ['@I1@', '1', 1], ['@I2@', '2', 2], ['@I3@', '3', 2], ['@I4@', '4', 3], ['@I5@', '5', 3],
    ])
  })
  test('frères et sœurs des ancêtres', () => {
    const fr = fratries(a, ancetres(a, '@I1@'))
    expect([...fr.keys()]).toEqual(['@I6@'])
    expect(fr.get('@I6@')!.sosa).toBe('2')
  })
  test('implexe : un même ancêtre par deux chemins', () => {
    const b = lireArbre(`0 @I1@ INDI\n1 FAMC @F1@\n0 @I2@ INDI\n1 FAMC @F2@\n0 @I3@ INDI\n1 FAMC @F3@\n0 @I4@ INDI
0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I3@\n0 @F2@ FAM\n1 HUSB @I4@\n0 @F3@ FAM\n1 HUSB @I4@\n`)
    const anc = ancetres(b, '@I1@')
    expect(anc.get('@I4@')).toMatchObject({ sosa: '4', occurrences: 2 })
  })
  test('branches et tri', () => {
    expect(dansBranche('9', '2')).toBe(true) // 9 = père de la mère du père
    expect(dansBranche('13', '2')).toBe(false)
    expect(comparerSosa('10', '9')).toBeGreaterThan(0)
    expect(comparerSosa('123456789012345678901', '99')).toBeGreaterThan(0)
  })
  test('homonymes, sans tenir compte des accents', () => {
    const b = lireArbre('0 @I1@ INDI\n1 NAME Rene /Dupont/\n0 @I2@ INDI\n1 NAME René /Dupont/\n0 @I3@ INDI\n1 NAME Paul /Dupont/\n')
    expect([...homonymes(b)]).toEqual(['@I1@', '@I2@'])
  })
})

describe('suivi', () => {
  test('naissance sourcée, mariage sans source, vivant', () => {
    const s = suivi(a, ind('@I1@'), 2026)
    expect(s.naissance.etat).toBe('source')
    expect(s.deces.etat).toBe('sans-objet')
    expect(s.mariage).toBe('sans-objet')
  })
  test('décès déclaré sans date ni source = manquant', () => {
    const s = suivi(a, ind('@I2@'), 2026)
    expect(s.naissance.etat).toBe('sans-source')
    expect(s.deces.etat).toBe('manquant')
    expect(s.deces.evenement?.avere).toBe(true)
    expect(s.mariages[0]).toMatchObject({ etat: 'sans-source', conjoint: '@I3@' })
  })
  test('baptême à la place de la naissance', () => {
    const s = suivi(a, ind('@I3@'), 2026)
    expect(s.naissance).toMatchObject({ etat: 'source' })
    expect(s.naissance.evenement?.tag).toBe('BAPM')
  })
  test('mariage « Y » sans détail = manquant ; décès présumé d’après les enfants', () => {
    const s = suivi(a, ind('@I5@'), 2026)
    expect(s.mariage).toBe('manquant')
    expect(s.naissance.etat).toBe('manquant')
    expect(s.deces.etat).toBe('manquant') // enfants nés en 1950-1955 : elle n'est plus en vie
    expect(score(s)).toEqual({ attendus: 3, sources: 0 })
  })
})

describe('lieux', () => {
  test('découpage', () => {
    expect(decouperLieu('Malines, Anvers, Belgique')).toEqual({ nom: 'Malines', contexte: 'Anvers, Belgique' })
    expect(decouperLieu('[Église Saint-Rombaut] - Malines, Anvers')).toEqual({ nom: 'Malines', contexte: 'Anvers' })
  })
  test('faits regroupés par lieu', () => {
    const c = communes(a, null, false).find((x) => x.nom === 'Malines')!
    expect(c.actes.length).toBe(4) // naissance de Jean, baptême de Marie, décès de Pierre, mariage
    expect(c.sansSource).toBe(2)
    const m = c.actes.find((x) => x.groupe === 'mariages')!
    expect(m.personnes).toEqual(['@I2@', '@I3@'])
  })
  test('limité à un périmètre', () => {
    const c = communes(a, new Set(['@I3@']), false).find((x) => x.nom === 'Malines')!
    expect(c.actes.map((x) => x.evenement.tag).sort()).toEqual(['BAPM', 'MARR'])
  })
})

describe('liens GeneWeb', () => {
  test('adresse nettoyée', () => {
    expect(normaliserAdresse('gw.geneanet.org/bveyckemans_w?lang=fr&p=x')).toBe('https://gw.geneanet.org/bveyckemans_w')
    expect(normaliserAdresse('http://localhost:2317/?b=base&lang=fr')).toBe('http://localhost:2317/?b=base')
    expect(normaliserAdresse('')).toBe('')
  })
  test('fiche et homonymes', () => {
    const p = { ...ind('@I1@'), prenom: 'Jean Célestin', nom: 'Veÿckemans' }
    expect(lienGeneWeb('https://gw.geneanet.org/x', p, false)).toBe('https://gw.geneanet.org/x?lang=fr&p=jean+c%C3%A9lestin&n=ve%C3%BFckemans&type=fiche')
    expect(lienGeneWeb('https://gw.geneanet.org/x', p, true)).toContain('?lang=fr&m=S&p=')
    expect(lienGeneWeb('http://h/?b=base', p, false)).toContain('?b=base&lang=fr')
    expect(lienGeneWeb('', p, false)).toBeUndefined()
  })
  test('adresse devinée depuis l’en-tête', () => {
    expect(adresseDevinee(a.origine)).toBe('https://gw.geneanet.org/dupont')
    expect(adresseDevinee({ logiciel: 'Heredis', base: 'x' })).toBe('')
  })
})

test('CSV', () => {
  expect(versCsv([['a', 'b;c'], [1, 'd"e']])).toBe('﻿a;"b;c"\r\n1;"d""e"')
})
