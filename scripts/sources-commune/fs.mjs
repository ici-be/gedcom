// Films FamilySearch par la session du Chrome de travail (port 9333) : repères, liste des images, extraits.
//   node fs.mjs ancres D                  film et position de chaque lien FamilySearch de D/ancres.json → D/fs_ancres.json
//   node fs.mjs film D DGS                liste des images du film → D/fs_film_DGS.json (cache)
//   node fs.mjs extrait D DGS IMAGE [LARGEUR] [REGION]
//        télécharge l'image (cache D/fs/DGS_IMAGE.jpg), en tire un extrait (REGION : full ou pct:x,y,l,h comme IIIF)
//        réduit à LARGEUR (1200 par défaut) et affiche son chemin, puis le lien ark de l'image.
// Une pause de 0,7 s suit chaque téléchargement, comme à la main.
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright-core')

const [cmd, D, ...r] = process.argv.slice(2)
const nav = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = nav.contexts()[0]
const pause = (ms) => new Promise(ok => setTimeout(ok, ms))

async function nomImage(ark) {
  const x = await ctx.request.get(`https://www.familysearch.org/das/v2/${ark}`, { headers: { accept: 'application/json' } })
  if (!x.ok()) return null
  const m = /^(\d{9})_(\d{5})$/.exec((await x.json()).name ?? '')
  return m ? { dgs: m[1], image: Number(m[2]) } : null
}

async function film(dgs) {
  const f = `${D}/fs_film_${dgs}.json`
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  const p = await ctx.newPage()
  const recu = new Promise(ok => p.on('response', async (x) => { if (x.url().includes('film-data')) { try { ok(await x.json()) } catch {} } }))
  await p.goto(`https://www.familysearch.org/search/film/${dgs}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const j = await Promise.race([recu, pause(45000).then(() => null)])
  await p.close()
  if (!j?.images) throw new Error(`film ${dgs} : liste des images introuvable (session FamilySearch ?)`)
  const arks = j.images.map(u => /3:1:[A-Z0-9-]+/.exec(u)?.[0] ?? null)
  const out = { dgs, titre: j.meta?.title ?? '', arks }
  writeFileSync(f, JSON.stringify(out))
  return out
}

if (cmd === 'ancres') {
  const ancres = JSON.parse(readFileSync(`${D}/ancres.json`, 'utf8')).filter(a => /familysearch.*3:1:/.test(a.lien))
  const out = []
  for (const a of ancres) {
    const ark = /3:1:[A-Z0-9-]+/.exec(a.lien)[0]
    const n = await nomImage(ark)
    if (n) out.push({ ...a, ark, ...n })
    await pause(300)
  }
  writeFileSync(`${D}/fs_ancres.json`, JSON.stringify(out, null, 1))
  const par = {}
  for (const a of out) (par[a.dgs] ??= []).push(a.dmy?.[2])
  for (const [dgs, ys] of Object.entries(par)) console.log(dgs, ys.length, 'repères', Math.min(...ys.filter(Boolean)), '-', Math.max(...ys.filter(Boolean)))
} else if (cmd === 'film') {
  const f = await film(r[0])
  console.log(f.dgs, f.arks.length, 'images', f.titre)
} else if (cmd === 'extrait') {
  const [dgs, im, largeur = '1200', region = 'full'] = r
  const f = await film(dgs)
  const ark = f.arks[Number(im) - 1]
  if (!ark) { console.log('pas d’image', im, 'dans le film', dgs, `(${f.arks.length} images)`); process.exit(1) }
  mkdirSync(`${D}/fs`, { recursive: true })
  const src = `${D}/fs/${dgs}_${im}.jpg`
  if (!existsSync(src)) {
    const x = await ctx.request.get(`https://www.familysearch.org/das/v2/${ark}/dist.jpg`, { timeout: 120000 })
    if (!x.ok()) { console.log('FamilySearch répond', x.status()); process.exit(1) }
    writeFileSync(src, await x.body())
    await pause(700)
  }
  const out = `${D}/fs/x_${dgs}_${im}_${largeur}_${region.replace(/[^0-9a-z]/g, '-')}.jpg`
  if (!existsSync(out)) {
    if (region === 'full') execFileSync('magick', [src, '-resize', `${largeur}x`, out])
    else {
      const [x, y, l, h] = region.slice(4).split(',').map(Number)
      const [W, H] = execFileSync('identify', ['-format', '%w %h', src]).toString().split(' ').map(Number)
      execFileSync('magick', [src, '-crop', `${Math.round(W * l / 100)}x${Math.round(H * h / 100)}+${Math.round(W * x / 100)}+${Math.round(H * y / 100)}`, '+repage', '-resize', `${largeur}x`, out])
    }
  }
  console.log(out)
  console.log(`https://www.familysearch.org/ark:/61903/${ark}`)
}
process.exit(0)
