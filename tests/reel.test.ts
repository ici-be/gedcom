// Essai sur un vrai fichier : GED=/chemin/fichier.ged npx vitest run tests/reel.test.ts
import { readFileSync } from 'node:fs'
import { test } from 'vitest'
import { decoder } from '../src/lib/gedcom/lecture'
import { lireArbre } from '../src/lib/gedcom/arbre'
import { ancetres, fratries, homonymes } from '../src/lib/parente'
import { suivi, score } from '../src/lib/suivi'
import { communes } from '../src/lib/communes'

test.skipIf(!process.env.GED)('fichier réel', () => {
  let t = performance.now()
  const arbre = lireArbre(decoder(readFileSync(process.env.GED!)))
  console.log('lecture', Math.round(performance.now() - t), 'ms', arbre.individus.size, arbre.familles.size, arbre.origine)
  t = performance.now()
  const anc = ancetres(arbre, '@I1@')
  const fr = fratries(arbre, anc)
  const gmax = Math.max(...[...anc.values()].map((a) => a.generation))
  console.log('ancêtres', anc.size, 'gén max', gmax, 'fratries', fr.size, 'homonymes', homonymes(arbre).size, Math.round(performance.now() - t), 'ms')
  const compte: Record<string, number> = {}
  let att = 0, src = 0
  t = performance.now()
  for (const ind of arbre.individus.values()) {
    const s = suivi(arbre, ind)
    for (const [k, v] of [['n', s.naissance.etat], ['m', s.mariage], ['d', s.deces.etat]]) compte[k + ':' + v] = (compte[k + ':' + v] ?? 0) + 1
    const sc = score(s); att += sc.attendus; src += sc.sources
  }
  console.log('suivi', Math.round(performance.now() - t), 'ms', compte, src, '/', att)
  let a2 = 0, s2 = 0
  for (const a of anc.values()) { const sc = score(suivi(arbre, arbre.individus.get(a.id)!)); a2 += sc.attendus; s2 += sc.sources }
  console.log('ancêtres sourcés', s2, '/', a2)
  const cs = communes(arbre, null, false).sort((a, b) => b.sansSource - a.sansSource)
  console.log('communes', cs.length, cs.slice(0, 5).map((c) => [c.nom, c.contexte, c.actes.length, c.sansSource]))
  const i1 = arbre.individus.get('@I1@')!
  console.log(JSON.stringify(i1), JSON.stringify(suivi(arbre, i1)))
})
