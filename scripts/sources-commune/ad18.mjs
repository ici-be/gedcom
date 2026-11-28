// Registres des Archives départementales du Cher (archives18.fr, Arkothèque) par le Chrome de travail (port 9333) :
// le site renvoie une page de contrôle aux requêtes sans navigateur, mais ses API JSON et IIIF répondent dans la session.
//   node ad18.mjs registres D Commune     registres de la commune → D/ad18_registres.json
//   node ad18.mjs liste D ID              images du registre (fiche ID) → D/fs_film_ad18-ID.json (format des films FS :
//                                         { dgs: "ad18-ID", titre, arks: [lien ark de chaque image], iiif: [...] })
//   node ad18.mjs ancres D                position de chaque lien archives18 de D/ancres.json → D/fs_ancres.json
//                                         (même format que fs.mjs ancres : localiser_fs.py s'en sert tel quel)
//   node ad18.mjs extrait D ID IMAGE [LARGEUR] [REGION]
//        télécharge l'image IMAGE (1 = première) du registre ID, réduite à LARGEUR (1200 par défaut), REGION full ou
//        pct:x,y,l,h (IIIF) → D/ad18/ID_IMAGE_….jpg ; affiche son chemin, puis le lien ark de l'image (à mettre dans src).
// Une pause de 0,7 s suit chaque téléchargement.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [cmd, D, ...r] = process.argv.slice(2)
const nav = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = nav.contexts()[0]
const pause = (ms) => new Promise(ok => setTimeout(ok, ms))
const SITE = 'https://www.archives18.fr'
const MOTEUR = 'arko_default_61011a8e5db65'
const FILTRE_COMMUNE = 'arko_default_61011b4c3eacb'
// lien ark d'une image, sans le suffixe « .fiche=….moteur=… »
const arkPropre = (a) => SITE + a.replace(/\.fiche=.*$/, '').replace('/ark:/', '/ark:')
const idArk = (a) => /ark:\/?41383\/(?:s[0-9a-f]+\/)?([0-9a-f]+)/.exec(a)?.[1]

async function json(u) {
  const x = await ctx.request.get(u.startsWith('http') ? u : SITE + u, { headers: { accept: 'application/json' } })
  if (!x.ok()) throw new Error(`${u} : HTTP ${x.status()}`)
  return x.json()
}

// ouvre une page du site et renvoie la réponse « visionneuse-infos » (liste complète des images) et l'adresse finale
async function visionneuse(url) {
  const p = await ctx.newPage()
  const recu = new Promise(ok => p.on('response', async (x) => { if (x.url().includes('visionneuse-infos')) { try { ok(await x.json()) } catch {} } }))
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const j = await Promise.race([recu, pause(45000).then(() => null)])
  const fin = p.url()
  await p.close()
  return { j, fin }
}

function enregistrer(id, titre, j) {
  const medias = j.medias.filter(m => m.type === 'image').flatMap(m => m.sources)  // une source par image
  const out = { dgs: `ad18-${id}`, titre, arks: medias.map(m => arkPropre(m.ARKLink)), iiif: medias.map(m => m.src) }
  writeFileSync(`${D}/fs_film_ad18-${id}.json`, JSON.stringify(out))
  return out
}

async function liste(id) {
  const f = `${D}/fs_film_ad18-${id}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const regs = existsSync(`${D}/ad18_registres.json`) ? JSON.parse(readFileSync(`${D}/ad18_registres.json`, 'utf8')) : []
  const titre = regs.find(x => String(x.id) === String(id))?.intitule ?? ''
  // la page du registre contient l'adresse de sa liste d'images (« visionneuse-infos/…/image/N »)
  const h = await (await ctx.request.get(`${SITE}/archives-numerisees/registres-paroissiaux-et-etat-civil?detail=${id}`)).text()
  const v = /\/_recherche-api\/visionneuse-infos\/[A-Za-z0-9_/]+\/image\/\d+/.exec(h)?.[0]
  const j = v ? await json(`${v}/0`) : null
  if (!j?.medias) throw new Error(`registre ${id} : liste des images introuvable`)
  return enregistrer(id, titre, j)
}

if (cmd === 'registres') {
  const g = `${MOTEUR}--filtreGroupes`
  const q = new URLSearchParams({ [`${g}[mode]`]: 'simple', [`${g}[op]`]: 'AND', [`${g}[groupes][0][${FILTRE_COMMUNE}][op]`]: 'AND',
    [`${g}[groupes][0][${FILTRE_COMMUNE}][q][]`]: r.join(' '), [`${g}[groupes][0][${FILTRE_COMMUNE}][extras][mode]`]: 'popup',
    [`${MOTEUR}--from`]: '0', [`${MOTEUR}--resultSize`]: '200', [`${MOTEUR}--searchMode`]: 'strict' })
  const res = []
  let total = 0
  do {
    q.set(`${MOTEUR}--from`, String(res.length))
    const j = await json(`/_recherche-api/search/1?${q}`)
    total = j.total
    if (!j.results.length) break
    res.push(...j.results)
  } while (res.length < total)
  const annees = (t) => t.match(/(\d{4}) - (\d{4})\s*$/)?.slice(1).join('-') ?? ''
  const regs = res.map(x => ({ id: x.id, intitule: x.intitule, refUnique: x.refUnique, annees: annees(x.intitule) }))
    .sort((a, b) => a.annees.localeCompare(b.annees))
  writeFileSync(`${D}/ad18_registres.json`, JSON.stringify(regs, null, 1))
  for (const x of regs) console.log(x.id, x.intitule)
  console.log(regs.length, 'registres (total annoncé', total + ')')
} else if (cmd === 'liste') {
  const f = await liste(r[0])
  console.log(f.dgs, f.arks.length, 'images', f.titre)
} else if (cmd === 'ancres') {
  const ancres = JSON.parse(readFileSync(`${D}/ancres.json`, 'utf8')).filter(a => /archives18\.fr\/ark/.test(a.lien))
  const films = {}
  for (const f of (await import('node:fs')).readdirSync(D).filter(f => /^fs_film_ad18-\d+\.json$/.test(f))) {
    const x = JSON.parse(readFileSync(`${D}/${f}`, 'utf8')); films[x.dgs] = x
  }
  const out = []
  for (const a of ancres) {
    const ia = idArk(a.lien)
    let trouve = null
    for (const x of Object.values(films)) { const k = x.arks.findIndex(u => idArk(u) === ia); if (k >= 0) { trouve = { dgs: x.dgs, image: k + 1 }; break } }
    if (!trouve) {
      // ancien lien ark (sans registre) : la visionneuse ouverte dit le registre (detail=ID) et la position
      const { j, fin } = await visionneuse(a.lien.replace(/\.fiche=.*$/, ''))
      const id = /detail=(\d+)/.exec(fin)?.[1]
      if (id && j?.medias) {
        const x = films[`ad18-${id}`] ?? enregistrer(id, '', j); films[x.dgs] = x
        const pos = Number(/\|(\d+)$/.exec(decodeURIComponent(fin))?.[1])
        if (Number.isFinite(pos)) trouve = { dgs: x.dgs, image: pos + 1 }
      }
    }
    if (trouve) out.push({ ...a, ...trouve }); else console.log('repère non situé :', a.tag, a.dmy, a.lien)
  }
  writeFileSync(`${D}/fs_ancres.json`, JSON.stringify(out, null, 1))
  const par = {}
  for (const a of out) (par[a.dgs] ??= []).push(a.dmy?.[2])
  for (const [dgs, ys] of Object.entries(par)) console.log(dgs, ys.length, 'repères', Math.min(...ys.filter(Boolean)), '-', Math.max(...ys.filter(Boolean)))
} else if (cmd === 'extrait') {
  const [id, im, largeur = '1200', region = 'full'] = r
  const f = await liste(id)
  const k = Number(im) - 1
  if (!(k >= 0 && k < f.arks.length)) throw new Error(`image ${im} hors du registre (${f.arks.length} images)`)
  mkdirSync(`${D}/ad18`, { recursive: true })
  const sortie = `${D}/ad18/${id}_${im}_${largeur}_${region.replace(/[^0-9a-z]+/gi, '-')}.jpg`
  if (!existsSync(sortie)) {
    const x = await ctx.request.get(`${SITE}${f.iiif[k]}/${region}/${largeur},/0/default.jpg`)
    if (!x.ok()) throw new Error(`image ${im} : HTTP ${x.status()}`)
    writeFileSync(sortie, await x.body())
    await pause(700)
  }
  console.log(sortie)
  console.log(f.arks[k])
} else {
  console.log('commandes : registres, liste, ancres, extrait')
}
process.exit(0)
