import { readFileSync } from 'node:fs'
import { test } from 'vitest'
import { decoder } from '../src/lib/gedcom/lecture'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { indexerMetiers } from '../src/lib/metiers'
import { construireGraphe, liensDeLArbre, TYPES_LIENS } from '../src/lib/graphe'

test.skipIf(!process.env.GED)('graphe sur un vrai fichier', () => {
  const a = lireArbre(decoder(readFileSync(process.env.GED!)))
  const m = indexerMetiers(a)
  let t = performance.now()
  const { faits } = liensDeLArbre(a)
  const c: Record<string, number> = {}
  for (const f of faits) c[f.type + (f.parEnfant ? '/parents' : '')] = (c[f.type + (f.parEnfant ? '/parents' : '')] ?? 0) + 1
  console.log('liens', faits.length, c, Math.round(performance.now() - t), 'ms')
  const top = [...m.metiers.values()].sort((x, y) => y.personnes.size - x.personnes.size).slice(0, 8)
  console.log(top.map((x) => x.cle + ' ' + x.personnes.size).join(', '))
  const musique = [...m.metiers.values()].filter((x) => /music|chant|instrument/.test(x.cle))
  console.log('musique', musique.map((x) => x.cle + ' ' + x.personnes.size).join(', '))
  for (const [nom, crit] of [
    ['musique+famille', { mode: 'metiers', metiers: musique.map((x) => x.cle), famille: true }],
    ['entourage I1 2 pas', { mode: 'entourage', personne: '@I1@', pas: 2 }],
    ['entourage I1 4 pas', { mode: 'entourage', personne: '@I1@', pas: 4 }],
    ['lieu bruxelles', { mode: 'lieu', texte: 'bruxelles' }],
  ] as const) {
    t = performance.now()
    const g = construireGraphe(a, m, { mode: 'entourage', metiers: [], texte: '', personne: '', pas: 1, famille: false, types: TYPES_LIENS, ...crit } as never, true)
    console.log(nom, 'noeuds', g.noeuds.length, 'aretes', g.aretes.length, 'isoles', g.isoles, Math.round(performance.now() - t), 'ms')
  }
})
