// Pose les liens d'actes dans le champ Source des événements Geneanet, par l'éditeur en ligne, avec contrôles.
//   node geneanet.mjs DOSSIER [--valider] [n1,n2,…]
// Lit DOSSIER/evenements.json et DOSSIER/resultats*.jsonl (index et lots de lecture) ({ n, src, douteux? }). Sans --valider : remplit le
// formulaire et vérifie, sans enregistrer. Avec --valider : enregistre, puis relit la fiche publique pour s'assurer
// que le lien y figure. Journal : DOSSIER/journal.jsonl (avant/après de chaque événement), bilan à la fin.
// Chrome de travail : port 9333, connecté à Geneanet. Arbre : bveyckemans.
import { createRequire } from 'node:module'
import { appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright-core')

const ARBRE = 'bveyckemans'
const [dossier, ...opts] = process.argv.slice(2)
const valider = opts.includes('--valider')
const liste = opts.find(o => /^\d/.test(o))
const choisis = liste ? new Set(liste.split(',').map(Number)) : null
const evs = Object.fromEntries(JSON.parse(readFileSync(`${dossier}/evenements.json`, 'utf8')).map(e => [e.n, e]))
const lignes = (f) => existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const JOURNAL = `${dossier}/journal.jsonl`
const faits = new Set(lignes(JOURNAL).filter(j => j.etat === 'posé' || j.etat === 'déjà présent').map(j => j.n))
const res = new Map()
for (const f of readdirSync(dossier).filter(f => /^resultats.*\.jsonl$/.test(f)).sort()) for (const r of lignes(`${dossier}/${f}`)) if (r.src && !r.douteux) res.set(r.n, r) // la dernière ligne l'emporte

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const dateFr = ([d, m, y]) => `${d === 1 ? '1er' : d} ${MOIS[m - 1]} ${y}`
const TYPE = { ind: { BIRT: 0, BAPM: 1, CHR: 1, DEAT: 2, BURI: 3 }, fam: { MARR: 0 } }
const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const cle = (src) => src.includes('/data/images/') ? src.split('/data/images/')[1] : src.split('61903/')[1]

const nav = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = nav.contexts()[0]
const p = ctx.pages().find(x => x.url().includes('geneanet')) ?? await ctx.newPage()
if (!p.url().includes('geneanet')) await p.goto(`https://gw.geneanet.org/${ARBRE}_w?lang=fr`, { waitUntil: 'domcontentloaded' })
p.on('dialog', d => d.dismiss().catch(() => {}))

const lire = (u) => p.evaluate(async (u) => {
  const r = await fetch(u, { credentials: 'include' })
  if (r.status === 404) return null
  const h = await r.text()
  const d = new DOMParser().parseFromString(h, 'text/html')
  return { texte: (d.querySelector('#perso, #content, main') ?? d.body).innerText.replace(/\s+/g, ' '), html: h }
}, u)
const urlFiche = (pn, nn, oc, w = false) => `https://gw.geneanet.org/${ARBRE}${w ? '_w' : ''}?lang=fr&p=${encodeURIComponent(pn)}&n=${encodeURIComponent(nn)}&oc=${oc}`

// Fiches candidates : celles qui citent la date de l'événement et un proche (parent ou conjoint)
async function trouverFiches(t) {
  const out = []
  let manques = 0
  for (let oc = 0; oc < 80 && manques < 4; oc++) {
    const f = await lire(urlFiche(t.p, t.nn, oc) + '&type=fiche')
    if (!f) { manques++; continue }
    manques = 0
    const tx = norm(f.texte)
    if (tx.includes(norm(t.dateFr)) && t.indices.some(i => tx.includes(norm(i)))) out.push({ oc, deja: f.html.includes(t.cle) })
  }
  return out
}

const lireModele = () => p.evaluate(() => {
  const el = document.querySelector('[ng-model^="family.fevents"], [ng-model^="person.pevents"]')
  if (!el) return null
  const sc = window.angular.element(el).scope()
  const net = (v) => JSON.parse(JSON.stringify(v ?? null, (k, x) => (k.startsWith('$$') ? undefined : x)))
  return { family: net(sc.family), person: net(sc.person), titre: document.querySelector('.reveal-modal.open h2, .reveal-modal.open h1, .reveal-modal.open .modal-title')?.parentElement?.innerText?.slice(0, 200) }
})

async function ouvrirEditeur(t, oc) {
  await p.goto(urlFiche(t.p, t.nn, oc, true), { waitUntil: 'domcontentloaded', timeout: 60000 })
  const id = t.kind === 'fam' ? 'edition-edit-families' : 'edition-edit-person'
  await p.waitForSelector('#menu-edition', { timeout: 20000 })
  await p.evaluate((id) => document.getElementById(id).click(), id)
  let m = null
  for (let k = 0; k < 20 && !(m = await lireModele()); k++) {
    // plusieurs unions : choisir la carte du conjoint
    if (t.conjoint && k === 3) {
      await p.evaluate((cj) => {
        const modal = [...document.querySelectorAll('.reveal-modal')].find(x => x.offsetParent && /Cliquez sur un conjoint/.test(x.innerText))
        if (!modal) return
        const c = [...modal.querySelectorAll('a, [ng-click], .card, div')].filter(x => x.children.length < 8 && x.innerText && x.innerText.toLowerCase().replace(/\s+/g, ' ').includes(cj) && !x.querySelector('select'))
          .sort((a, b) => a.innerText.length - b.innerText.length)[0]
        c?.click()
      }, t.conjoint.toLowerCase())
    }
    await p.waitForTimeout(400)
  }
  if (!m) return 'formulaire non ouvert'
  await p.waitForTimeout(500)
  m = await lireModele()
  if (t.conjoint && !norm(m.titre).includes(norm(t.conjoint))) return `autre union : ${m.titre}`
  const evsF = t.kind === 'fam' ? m.family?.fevents : m.person?.pevents
  const [d, mo, y] = t.dmy
  const idx = (evsF ?? []).map((e, i) => [e, i]).filter(([e]) => e.date?.dmy?.year === y && e.date.dmy.month === mo && e.date.dmy.day === d)
  const memeType = idx.filter(([e]) => (e.pevent_type ?? e.fevent_type) === t.type)
  const choix = memeType.length === 1 ? memeType : idx
  if (choix.length !== 1) return `${choix.length} événements à cette date : ` + JSON.stringify((evsF ?? []).map(e => [e.pevent_type ?? e.fevent_type, e.date?.dmy]))
  return { m, i: choix[0][1] }
}

const bilan = { posé: [], 'déjà présent': [], essai: [], arrêt: [] }
const note = (n, etat, plus = {}) => { bilan[etat === 'posé' || etat === 'déjà présent' || etat === 'essai' ? etat : 'arrêt'].push(n); console.log(n, etat, plus.motif ?? '') ; if (etat !== 'essai') appendFileSync(JOURNAL, JSON.stringify({ quand: new Date().toISOString(), n, etat, ...plus }) + '\n') }

for (const [n, r] of res) {
  if (faits.has(n) || (choisis && !choisis.has(n))) continue
  const e = evs[n]
  const tag = e.tag.slice(0, 4)
  const t = {
    kind: e.kind, dmy: e.dmy, dateFr: dateFr(e.dmy), type: TYPE[e.kind][tag], cle: cle(r.src),
    ...(e.kind === 'fam'
      ? { p: e.mari.prenom.toLowerCase(), nn: e.mari.nom.toLowerCase(), conjoint: `${e.femme.prenom} ${e.femme.nom}`, indices: [e.femme.nom] }
      : { p: e.qui.prenom.toLowerCase(), nn: e.qui.nom.toLowerCase(), indices: [e.pere?.nom, e.mere?.nom, ...e.conjoints.map(c => c?.nom)].filter(Boolean) }),
  }
  if (!t.indices.length) t.indices = ['']
  try {
    const fiches = await trouverFiches(t)
    if (fiches.length !== 1) { note(n, 'arrêt', { motif: `${fiches.length} fiche(s) conviennent` }); continue }
    const { oc, deja } = fiches[0]
    if (deja) { note(n, 'déjà présent', { oc }); continue }
    const o = await ouvrirEditeur(t, oc)
    if (typeof o === 'string') { note(n, 'arrêt', { motif: o, oc }); continue }
    const { m: avant, i } = o
    const evA = (t.kind === 'fam' ? avant.family.fevents : avant.person.pevents)[i]
    if (evA.src && evA.src.trim() && !r.forcer_src) { note(n, 'arrêt', { motif: 'source déjà remplie : ' + evA.src, oc }); continue }
    const champ = p.locator(`[name*="[${t.kind === 'fam' ? 'fevents' : 'pevents'}][_${i}]"][name$="[pevent_src][_${i}]"]`)
    if ((await champ.count()) !== 1) { note(n, 'arrêt', { motif: 'champ Source introuvable', oc }); continue }
    await champ.fill(r.src)
    await p.waitForTimeout(300)
    const apres = await lireModele()
    const copie = JSON.parse(JSON.stringify(avant))
    const evB = (t.kind === 'fam' ? apres.family.fevents : apres.person.pevents)[i]
    ;(t.kind === 'fam' ? copie.family.fevents : copie.person.pevents)[i] = evB
    copie.titre = apres.titre
    if (JSON.stringify(copie) !== JSON.stringify(apres)) { note(n, 'arrêt', { motif: "d'autres champs ont changé", oc }); continue }
    if (evB.src !== r.src) { note(n, 'arrêt', { motif: 'source non prise : ' + evB.src, oc }); continue }
    if (!valider) { note(n, 'essai', { motif: `oc ${oc}, événement ${i}` }); continue }
    await Promise.all([
      p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null),
      p.getByRole('button', { name: 'Valider', exact: true }).or(p.locator('input[type=submit][value="Valider"]')).first().click(),
    ])
    let ok = false
    for (let k = 0; k < 4 && !ok; k++) { if (k) await p.waitForTimeout(2000); ok = !!(await lire(urlFiche(t.p, t.nn, oc) + '&type=fiche'))?.html.includes(t.cle) }
    note(n, ok ? 'posé' : 'arrêt', { oc, src: r.src, avant: evA, ...(ok ? {} : { motif: 'lien absent de la fiche après enregistrement' }) })
  } catch (err) {
    note(n, 'arrêt', { motif: 'erreur : ' + String(err).slice(0, 200) })
  }
}
console.log('BILAN', Object.entries(bilan).map(([k, v]) => `${k} ${v.length}${k === 'arrêt' && v.length ? ' ' + JSON.stringify(v) : ''}`).join(' | '))
process.exit(0)
