// Cherche chaque événement dans l'index nominatif de FamilySearch, par la session du Chrome de travail (port 9333).
//   node fs_index.mjs DOSSIER COMMUNE [n1,n2,…]
// COMMUNE « - » : commune propre à chaque événement (champ « commune » de selection_sosa.py) ; les événements sans
// date exacte sont alors cherchés sur leur fourchette d'années (« annees »), ou sans date.
// Lit DOSSIER/evenements.json, ajoute à DOSSIER/fs_index.jsonl une ligne par événement : { n, q, cands: [...] }
// (les événements déjà présents dans le fichier sont sautés). Chaque candidat : image (ark 3:1), fiche (1:2),
// collection, nom, faits (type, date, lieu) et proches (rôle, nom). Une requête toutes les ~4 s ; en cas de refus (429), pause croissante à partir d'une minute.
import { createRequire } from 'node:module'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [dossier, commune, liste] = process.argv.slice(2)
const evs = JSON.parse(readFileSync(`${dossier}/evenements.json`, 'utf8'))
const sortie = `${dossier}/fs_index.jsonl`
const faits = new Set(existsSync(sortie) ? readFileSync(sortie, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l).n) : [])
const choisis = liste ? new Set(liste.split(',').map(Number)) : null

const GENRE = { BIRT: 'birth', BAPM: 'birth', CHR: 'birth', DEAT: 'death', BURI: 'death', MARR: 'marriage' }
function requete(e) {
  const g = GENRE[e.tag.slice(0, 4)]
  if (!g || (!e.dmy && commune !== '-')) return null
  const [y0, y1] = e.dmy ? [e.dmy[2], e.dmy[2]] : (e.annees ?? [null, null])
  const q = new URLSearchParams({ count: '8' })
  const nom = (pers, pre) => { if (pers?.prenom) q.set(`q.${pre}GivenName`, pers.prenom); if (pers?.nom) q.set(`q.${pre}Surname`, pers.nom) }
  if (e.kind === 'fam') { nom(e.mari, ''); nom(e.femme, 'spouse') } else {
    nom(e.qui, '')
    if (g === 'birth' || g === 'death') { nom(e.pere, 'father'); if (e.mere) { if (e.mere.prenom) q.set('q.motherGivenName', e.mere.prenom); if (e.mere.nom) q.set('q.motherSurname', e.mere.nom) } }
    if (g === 'death' && e.conjoints?.[0]) nom(e.conjoints[0], 'spouse')
  }
  if (y0) { q.set(`q.${g}LikeDate.from`, String(y0)); q.set(`q.${g}LikeDate.to`, String(y1)) }
  const lieu = commune === '-' ? e.commune : commune
  if (lieu) q.set(`q.${g}LikePlace`, lieu)
  if (commune === '-' && !e.dmy && !(e.pere || e.mere || e.kind === 'fam' || e.conjoints?.length)) return null
  return q.toString()
}

const nav = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = nav.contexts()[0]
let p = ctx.pages().find(x => x.url().includes('familysearch.org'))
if (!p) { p = await ctx.newPage(); await p.goto('https://www.familysearch.org/fr/search/', { waitUntil: 'domcontentloaded', timeout: 60000 }) }

let n0 = 0
for (const e of evs) {
  if (faits.has(e.n) || (choisis && !choisis.has(e.n))) continue
  const q = requete(e)
  if (!q) continue
  let r, pause = 60000
  for (let essai = 0; essai < 5; essai++) {
  r = await p.evaluate(async (q) => {
    const t = (document.cookie.match(/fssessionid=([^;]+)/) || [])[1]
    const x = await fetch('https://www.familysearch.org/service/search/hr/v2/personas?' + q, { headers: { accept: 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) } })
    if (x.status !== 200) return { erreur: x.status }
    const d = await x.json()
    return {
      cands: (d.entries || []).map(en => {
        const g = en.content.gedcomx
        const sd = g.sourceDescriptions || []
        const img = sd.find(s => /DigitalArtifact/.test(s.resourceType))?.about?.match(/3:1:[A-Z0-9-]+/)?.[0] ?? null
        const fiche = sd.find(s => /Record/.test(s.resourceType))?.about?.match(/1:2:[A-Z0-9-]+/)?.[0] ?? null
        const coll = sd.find(s => /Collection/.test(s.resourceType))?.titles?.[0]?.value ?? ''
        const pr = g.persons.find(x => x.principal) ?? g.persons[0]
        const dates = (f) => [...new Set([f.date?.formal, ...(f.date?.fields ?? []).flatMap(x => x.values.map(v => v.resource))].filter(v => /^\+\d{4}-\d\d-\d\d$/.test(v ?? '')).map(v => v.slice(1)))]
        return {
          img, fiche, coll,
          nom: pr.display?.name,
          faits: (pr.facts || []).map(f => [f.type.split('/').pop(), f.date?.original ?? '', dates(f), f.place?.original ?? '']),
          proches: g.persons.filter(x => x !== pr).map(x => [x.display?.role, x.display?.name]),
        }
      }),
    }
  }, q)
  if (r.erreur !== 429) break
  console.log(e.n, 'trop de requêtes, pause', pause / 1000, 's'); await new Promise(ok => setTimeout(ok, pause)); pause *= 2
  }
  if (r.erreur) { console.log(e.n, 'erreur', r.erreur); if (r.erreur === 401 || r.erreur === 403 || r.erreur === 429) break; continue }
  appendFileSync(sortie, JSON.stringify({ n: e.n, q, ...r }) + '\n')
  n0++
  await new Promise(ok => setTimeout(ok, 4000))
}
console.log('requêtes :', n0)
process.exit(0)
