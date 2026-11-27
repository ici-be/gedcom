// Pose les liens d'actes dans le champ Source des événements Geneanet, par l'éditeur en ligne, avec contrôles.
//   node geneanet.mjs DOSSIER [--valider] [n1,n2,…]
// Lit DOSSIER/evenements.json et DOSSIER/resultats*.jsonl (index et lots de lecture) ({ n, src, douteux? }). Sans --valider : remplit le
// formulaire et vérifie, sans enregistrer. Avec --valider : enregistre, puis relit la fiche publique pour s'assurer
// que le lien y figure. Journal : DOSSIER/journal.jsonl (avant/après de chaque événement), bilan à la fin.
// Chrome de travail : port 9333, connecté à Geneanet. Arbre : bveyckemans.
// Naissance → baptême : quand l'arbre donne pour naissance la date d'un acte qui n'est qu'un baptême (résultat avec
// "acte": "baptême", "date_acte" = date de l'arbre, "naissance_dans_acte": null), le type de l'événement passe à
// Baptême (rien d'autre ne change : ni date, ni lieu, ni note). Garde-fous : événement Naissance à date exacte, sans
// témoin, seul de son type, aucun baptême sur la fiche ; seuls le type (et la source) changent dans le formulaire ;
// après enregistrement, la fiche publique doit dire « Baptisé(e) le … » et plus « Né(e) le … ». Vaut aussi pour un
// événement dont le lien est déjà posé (état « converti » au journal). --sans-bapteme : ne jamais changer le type.
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
const J = lignes(JOURNAL)
const faits = new Set(J.filter(j => j.etat === 'posé' || j.etat === 'déjà présent').map(j => j.n))
const convertis = new Set(J.filter(j => j.bapteme && (j.etat === 'posé' || j.etat === 'converti')).map(j => j.n))
const sansBapteme = opts.includes('--sans-bapteme')
const res = new Map()
for (const f of readdirSync(dossier).filter(f => /^resultats.*\.jsonl$/.test(f)).sort()) for (const r of lignes(`${dossier}/${f}`)) if (r.src && !r.douteux) res.set(r.n, r) // la dernière ligne l'emporte

// date sans jour (« FEB 1733 », « 1706 ») : [0, mois ou 0, année]
const dmyPartiel = (d) => [0, 1 + ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(/\b([A-Z]{3}) \d{4}$/.exec(d)?.[1]), Number(d.match(/\d{4}/)[0])]
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const dateFr = ([d, m, y]) => d ? `${d === 1 ? '1er' : d} ${MOIS[m - 1]} ${y}` : `${y}` // année seule (résidence, registre de population)
const TYPE = { ind: { BIRT: 0, BAPM: 1, CHR: 1, DEAT: 2, BURI: 3 }, fam: { MARR: 0 } }
const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const cle = (src) => src.includes('/data/images/') ? src.split('/data/images/')[1] : src.includes('61903/') ? src.split('61903/')[1] : src.replace(/^https?:\/\//, '')
// lien partagé par plusieurs événements (registre de population des Archives de la Ville) : sa présence sur la fiche ne prouve rien
const partage = (src) => !src.includes('/data/images/') && !src.includes('61903/')
const compter = (html, c) => html.split(c).length - 1
const jma = (s) => (String(s ?? '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/) ?? []).slice(1).map(Number)
// l'acte lu n'est qu'un baptême, à la date que l'arbre donne pour la naissance, et ne dit rien de la naissance
const aBaptiser = (e, r) => !sansBapteme && e.kind === 'ind' && e.tag === 'BIRT' && !r.douteux && !r.note
  && norm(r.acte) === 'bapteme' && r.naissance_dans_acte === null && Array.isArray(e.dmy) && e.dmy[0]
  && JSON.stringify(jma(r.date_acte)) === JSON.stringify(e.dmy)

const nav = await chromium.connectOverCDP('http://127.0.0.1:9333')
const ctx = nav.contexts()[0]
const p = ctx.pages().find(x => x.url().includes('geneanet')) ?? await ctx.newPage()
if (!p.url().includes('geneanet')) await p.goto(`https://gw.geneanet.org/${ARBRE}_w?lang=fr`, { waitUntil: 'domcontentloaded' })
p.on('dialog', d => d.dismiss().catch(() => {}))

const lire1 = (u) => p.evaluate(async (u) => {
  const r = await fetch(u, { credentials: 'include' })
  if (r.status === 404) return null
  const h = await r.text()
  // page de contrôle Cloudflare (« Just a moment... », 403) : à relire plus tard, pas une fiche absente
  if (r.status === 403 || r.status === 429 || h.includes('_cf_chl_opt')) return { bloque: true }
  const d = new DOMParser().parseFromString(h, 'text/html')
  return { texte: (d.querySelector('#perso, #content, main') ?? d.body).innerText.replace(/\s+/g, ' '), html: h }
}, u)
async function lire(u) {
  for (let essai = 0; essai < 5; essai++) {
    const f = await lire1(u)
    if (!f?.bloque) return f
    await p.waitForTimeout(15000 * (essai + 1))
  }
  throw new Error('Geneanet bloque la lecture (Cloudflare) : ' + u)
}
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
    if (tx.includes(norm(t.dateFr)) && t.indices.some(i => tx.includes(norm(i)))) out.push({ oc, deja: !t.partage && f.html.includes(t.cle), avant: compter(f.html, t.cle) })
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
  let idx = (evsF ?? []).map((e, i) => [e, i]).filter(([e]) => e.date?.dmy?.year === y && (e.date.dmy.month || 0) === (mo || 0) && (e.date.dmy.day || 0) === (d || 0))
  // plusieurs événements de la même année : "note" dans le résultat = texte propre à l'événement voulu (adresse…)
  if (t.note) idx = idx.filter(([e]) => norm(JSON.stringify(e)).includes(norm(t.note)))
  const memeType = idx.filter(([e]) => (e.pevent_type ?? e.fevent_type) === t.type)
  const choix = memeType.length === 1 ? memeType : idx
  if (choix.length !== 1) return `${choix.length} événements à cette date : ` + JSON.stringify((evsF ?? []).map(e => [e.pevent_type ?? e.fevent_type, e.date?.dmy]))
  return { m, i: choix[0][1] }
}

const bilan = { posé: [], 'dont baptême': [], converti: [], 'déjà présent': [], essai: [], arrêt: [] }
const note = (n, etat, plus = {}) => { bilan[etat in bilan ? etat : 'arrêt'].push(n); if (plus.bapteme && etat === 'posé') bilan['dont baptême'].push(n); console.log(n, etat, plus.motif ?? '') ; if (etat !== 'essai') appendFileSync(JOURNAL, JSON.stringify({ quand: new Date().toISOString(), n, etat, ...plus }) + '\n') }

for (const [n, r] of res) {
  const e = evs[n]
  const bap = aBaptiser(e, r) && !convertis.has(n)
  if ((faits.has(n) && !bap) || (choisis && !choisis.has(n))) continue
  const tag = e.tag.slice(0, 4)
  const t = {
    kind: e.kind, dmy: e.dmy ?? dmyPartiel(e.date), type: TYPE[e.kind][tag], cle: cle(r.src), partage: partage(r.src), note: r.note,
    ...(e.kind === 'fam'
      ? { p: e.mari.prenom.toLowerCase(), nn: e.mari.nom.toLowerCase(), conjoint: `${e.femme.prenom} ${e.femme.nom}`, indices: [e.femme.nom] }
      : { p: e.qui.prenom.toLowerCase(), nn: e.qui.nom.toLowerCase(), indices: [e.pere?.nom, e.mere?.nom, ...e.conjoints.map(c => c?.nom)].filter(Boolean) }),
  }
  t.dateFr = dateFr(t.dmy)
  if (!t.indices.length) t.indices = ['']
  try {
    // "oc" dans le résultat : fiche imposée à la main quand des homonymes (parent et enfant) citent tous deux l'événement
    const fiches = Number.isInteger(r.oc) ? (await trouverFiches(t)).filter(f => f.oc === r.oc) : await trouverFiches(t)
    if (fiches.length !== 1) { note(n, 'arrêt', { motif: `${fiches.length} fiche(s) conviennent (oc ${fiches.map(f => f.oc).join(", ")})` }); continue }
    const { oc, deja, avant: nAvant } = fiches[0]
    if (deja && !bap) { note(n, 'déjà présent', { oc }); continue }
    const o = await ouvrirEditeur(t, oc)
    if (typeof o === 'string') { note(n, 'arrêt', { motif: o, oc }); continue }
    const { m: avant, i } = o
    const evsA = t.kind === 'fam' ? avant.family.fevents : avant.person.pevents
    const evA = evsA[i]
    // lien déjà posé (séance précédente) : seul le type reste à changer
    const srcDeja = deja && evA.src === r.src
    if (deja && !srcDeja) { note(n, 'arrêt', { motif: 'lien présent sur la fiche mais pas dans cet événement : ' + evA.src, oc }); continue }
    if (!srcDeja && evA.src && evA.src.trim() && !r.forcer_src) { note(n, 'arrêt', { motif: 'source déjà remplie : ' + evA.src, oc }); continue }
    if (bap) {
      const pb = evA.pevent_type !== 0 ? 'événement qui n’est pas une naissance'
        : evA.date?.prec !== 0 || evA.date?.cal || evA.date?.text || evA.date?.dmy?.delta || evA.date?.dmy2?.year ? 'date non exacte'
        : evA.witnesses?.length ? 'naissance avec témoins'
        : evsA.some((x, k) => k !== i && x.pevent_type === 0) ? 'autre naissance sur la fiche'
        : evsA.some(x => x.pevent_type === 1) ? 'baptême déjà présent sur la fiche' : null
      if (pb) { note(n, 'arrêt', { motif: 'baptême non converti : ' + pb, oc }); continue }
    }
    if (!srcDeja) {
      const champ = p.locator(`[name*="[${t.kind === 'fam' ? 'fevents' : 'pevents'}][_${i}]"][name$="[pevent_src][_${i}]"]`)
      if ((await champ.count()) !== 1) { note(n, 'arrêt', { motif: 'champ Source introuvable', oc }); continue }
      await champ.fill(r.src)
      await p.waitForTimeout(300)
    }
    if (bap) {
      const sel = p.locator(`select[name*="[pevents][_${i}]"][name$="[event_type][_${i}]"]`)
      if ((await sel.count()) !== 1 || !(await sel.locator('option[value="number:1"]').textContent())?.startsWith('Baptême')) { note(n, 'arrêt', { motif: 'liste des types introuvable', oc }); continue }
      await sel.selectOption('number:1')
      await p.waitForTimeout(300)
    }
    const apres = await lireModele()
    const copie = JSON.parse(JSON.stringify(avant))
    const evB = (t.kind === 'fam' ? apres.family.fevents : apres.person.pevents)[i]
    // seuls la source et (si demandé) le type de cet événement peuvent avoir changé
    ;(t.kind === 'fam' ? copie.family.fevents : copie.person.pevents)[i] = { ...evA, src: r.src, ...(bap ? { pevent_type: 1 } : {}) }
    copie.titre = apres.titre
    if (JSON.stringify(copie) !== JSON.stringify(apres)) { note(n, 'arrêt', { motif: "d'autres champs ont changé", oc }); continue }
    if (evB.src !== r.src) { note(n, 'arrêt', { motif: 'source non prise : ' + evB.src, oc }); continue }
    if (!valider) { note(n, 'essai', { motif: `oc ${oc}, événement ${i}${bap ? ', naissance → baptême' : ''}${srcDeja ? ' (lien déjà posé)' : ''}` }); continue }
    await Promise.all([
      p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null),
      p.getByRole('button', { name: 'Valider', exact: true }).or(p.locator('input[type=submit][value="Valider"]')).first().click(),
    ])
    let ok = false, okBap = !bap
    for (let k = 0; k < 4 && !(ok && okBap); k++) {
      if (k) await p.waitForTimeout(2000)
      const f = await lire(urlFiche(t.p, t.nn, oc) + '&type=fiche')
      const h = f?.html ?? ''
      ok = srcDeja || (t.partage ? compter(h, t.cle) > nAvant : h.includes(t.cle))
      if (bap) { const tx = norm(f?.texte); okBap = new RegExp(`baptisee? le ${norm(t.dateFr)}`).test(tx) && !new RegExp(`(^| )nee? le ${norm(t.dateFr)}`).test(tx) }
    }
    const motif = !ok ? 'lien absent de la fiche après enregistrement' : !okBap ? 'type non vérifié sur la fiche après enregistrement (voir « avant » au journal)' : null
    note(n, motif ? 'arrêt' : srcDeja ? 'converti' : 'posé', { oc, src: r.src, avant: evA, ...(bap ? { bapteme: !motif } : {}), ...(motif ? { motif } : {}) })
  } catch (err) {
    note(n, 'arrêt', { motif: 'erreur : ' + String(err).slice(0, 200) })
  }
}
console.log('BILAN', Object.entries(bilan).map(([k, v]) => `${k} ${v.length}${k === 'arrêt' && v.length ? ' ' + JSON.stringify(v) : ''}`).join(' | '))
process.exit(0)
