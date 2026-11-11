// Télécharge les images des actes cités comme sources chez les ancêtres (FamilySearch, Agatha), du Sosa le plus proche
// au plus lointain, et les envoie si on veut sur pCloud.
//
//   node scripts/actes.mjs connexion        ouvre un Chrome à part pour se connecter à FamilySearch et à Agatha
//   node scripts/actes.mjs liste            ce qui est cité, téléchargé, encore à faire
//   node scripts/actes.mjs telecharger      télécharge la suite de la file (40 images par défaut)
//   node scripts/actes.mjs pcloud-connexion demande l'adresse et le mot de passe pCloud, ne garde qu'un jeton
//   node scripts/actes.mjs pcloud           envoie sur pCloud les images qui n'y sont pas encore
//
// Options : --ged FICHIER (.zip ou .ged ; par défaut le dernier export de ~/Téléchargements) · --racine « Prénom Nom » ou @I1@
//   --generations N · --site familysearch|agatha · --max N · --pause SECONDES · --dossier DOSSIER (défaut ~/Lignées/actes)
//   --signatures (au lieu des actes des ancêtres : les actes où la signature d'un ancêtre est à trouver, les plus prometteurs d'abord)
//   --seulement TEXTE (nom de personne, type d'acte ou morceau d'adresse) · --reessayer (les images en échec)
//   --liberer (pcloud : efface la copie locale une fois l'image envoyée)
// Les réglages durables (racine, dossier, ged) peuvent s'écrire dans ~/.config/lignees/actes.json.
//
// Les mots de passe ne passent jamais par ce script : on se connecte soi-même dans la fenêtre Chrome, dont le profil
// (~/.local/share/lignees/chrome) garde la session. Les images sont demandées une à une, avec une pause, comme à la main.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { runnerImport } from 'vite'

const CONFIG = join(homedir(), '.config', 'lignees')
const PROFIL = join(homedir(), '.local', 'share', 'lignees', 'chrome')
const PORT = 9333
const CDP = `http://127.0.0.1:${PORT}`
const CONNEXIONS = ['https://www.familysearch.org/auth/familysearch/login', 'https://agatha.arch.be/fr/']

// ——— Arguments et réglages ———

const [commande = 'liste', ...reste] = process.argv.slice(2)
const options = {}
for (let i = 0; i < reste.length; i++) {
  if (!reste[i].startsWith('--')) continue
  const suivant = reste[i + 1]
  options[reste[i].slice(2)] = suivant === undefined || suivant.startsWith('--') ? true : reste[++i]
}
const lireJson = (f, defaut) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return defaut } }
const ecrireJson = (f, v, mode) => {
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f + '.tmp', JSON.stringify(v, null, 1), mode ? { mode } : undefined)
  renameSync(f + '.tmp', f)
}
const reglages = { ...lireJson(join(CONFIG, 'actes.json'), {}), ...options }
const DOSSIER = resolve(String(reglages.dossier ?? join(homedir(), 'Lignées', 'actes')).replace(/^~(?=\/)/, homedir()))
const INDEX = join(DOSSIER, 'index.json')
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))

// ——— L'arbre et la file des actes ———

function dernierExport() {
  const candidats = []
  for (const d of [join(homedir(), 'Téléchargements'), join(homedir(), 'Downloads')]) {
    if (!existsSync(d)) continue
    for (const f of readdirSync(d)) if (/\.(zip|ged)$/i.test(f)) candidats.push({ chemin: join(d, f), mtime: statSync(join(d, f)).mtimeMs })
  }
  for (const c of candidats.sort((a, b) => b.mtime - a.mtime)) {
    if (/\.ged$/i.test(c.chemin)) return c.chemin
    // un zip de Geneanet : le nom du .ged y figure en clair
    if (readFileSync(c.chemin).subarray(0, 4096).includes('.ged')) return c.chemin
  }
  throw new Error('Aucun export trouvé dans ~/Téléchargements : indiquez-le avec --ged FICHIER')
}

async function file() {
  const lib = async (m) => (await runnerImport(resolve(import.meta.dirname, '..', 'src', 'lib', m))).module
  const [{ decoder }, { lireArbre }, { estZip, gedDuZip }, { ancetres }, { trouverIndividu }, { fileActes, fileSignatures }] = await Promise.all(
    ['gedcom/lecture.ts', 'gedcom/arbre.ts', 'zip.ts', 'parente.ts', 'distant.ts', 'actes-en-ligne.ts'].map(lib))
  const chemin = reglages.ged ? resolve(String(reglages.ged)) : dernierExport()
  let octets = new Uint8Array(readFileSync(chemin))
  if (estZip(octets)) octets = gedDuZip(octets).octets
  const arbre = lireArbre(decoder(octets))
  const racine = reglages.racine ? trouverIndividu(arbre, String(reglages.racine)) : arbre.individus.has('@I1@') ? '@I1@' : arbre.individus.keys().next().value
  if (!racine) throw new Error(`Personne de départ introuvable : ${reglages.racine}`)
  const depart = arbre.individus.get(racine)
  console.log(`Arbre : ${chemin}\nPersonne de départ : ${depart.prenom} ${depart.nom} (${racine})`)
  const options = {
    generations: reglages.generations ? Number(reglages.generations) : undefined,
    sites: reglages.site ? [String(reglages.site)] : undefined,
  }
  if (reglages.signatures && ![...arbre.individus.values()].some((i) => i.photo)) {
    throw new Error('Cet export ne contient aucune image : on ne sait pas qui a déjà sa signature. Sur Geneanet, cochez\n« Liens web vers les photos principales des individus » à l’export, ou donnez un export qui les a avec --ged.')
  }
  const actes = (reglages.signatures ? fileSignatures : fileActes)(arbre, ancetres(arbre, racine), options)
  // --seulement TEXTE : les actes dont le nom de fichier ou l'adresse contient ce texte
  const seulement = typeof reglages.seulement === 'string' ? reglages.seulement.toLowerCase() : ''
  return seulement ? actes.filter((a) => (a.fichier + ' ' + a.url).toLowerCase().includes(seulement)) : actes
}

/** index.json : { [identifiant de l'image]: { fichier, url, sosa, octets, date, pcloud?, erreur? } } */
const lireIndex = () => lireJson(INDEX, {})
const fait = (e) => e && e.fichier && !e.erreur

// ——— Le navigateur ———

async function cdpOuvert() {
  try { return (await fetch(`${CDP}/json/version`)).ok } catch { return false }
}

async function ouvrirChrome(pages = []) {
  if (await cdpOuvert()) return false
  mkdirSync(PROFIL, { recursive: true })
  const binaire = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find((b) =>
    (process.env.PATH ?? '').split(':').some((d) => existsSync(join(d, b))))
  if (!binaire) throw new Error('Chrome ou Chromium introuvable')
  spawn(binaire, [`--user-data-dir=${PROFIL}`, `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', ...pages],
    { detached: true, stdio: 'ignore' }).unref()
  for (let i = 0; i < 40 && !(await cdpOuvert()); i++) await pause(500)
  if (!(await cdpOuvert())) throw new Error('Chrome ne répond pas')
  return true
}

async function contexte() {
  await ouvrirChrome()
  const { chromium } = await import('playwright-core')
  const navigateur = await chromium.connectOverCDP(CDP)
  return { navigateur, ctx: navigateur.contexts()[0] }
}

class NonConnecte extends Error {}

/** L'image entière d'un acte FamilySearch : le même fichier que le bouton « Télécharger » de la visionneuse */
async function imageFamilySearch(ctx, acte) {
  let ark = acte.id.slice('familysearch:'.length)
  if (!/^3:[12]:/.test(ark)) {
    // adresse « records/images/…rmsId=… » : la visionneuse dit quelle image elle montre
    const page = await ctx.newPage()
    try {
      const vu = page.waitForResponse((r) => /\/(das|dz)\/v[12]\/3:[12]:[A-Z0-9-]+\//.test(r.url()), { timeout: 45000 })
      await page.goto(acte.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      if (/\/(auth|identity)\//.test(page.url())) throw new NonConnecte('FamilySearch')
      ark = /\/(?:das|dz)\/v[12]\/(3:[12]:[A-Z0-9-]+)\//.exec((await vu).url())[1]
    } finally { await page.close() }
  }
  const r = await ctx.request.get(`https://www.familysearch.org/das/v2/${ark}/dist.jpg`, { timeout: 120000 })
  if (r.status() === 401) throw new NonConnecte('FamilySearch')
  if (r.status() === 403) throw new Error('image réservée (centre FamilySearch ou bibliothèque affiliée)')
  if (!r.ok()) throw new Error(`FamilySearch répond ${r.status()}`)
  return r.body()
}

/** L'image entière d'un acte d'Agatha, demandée au serveur IIIF de la visionneuse */
async function imageAgatha(ctx, acte) {
  const [inst, dossier, vue] = acte.id.slice('agatha:'.length).split('/')
  const referer = `https://agatha.arch.be/fr/data/images/${inst}/${dossier}/${vue}/`
  const lire = (url) => ctx.request.get(url, { headers: { Referer: referer }, timeout: 120000 })
  // « 510_1385_000_00430_000 » est rangé sous « 510_1385_000 »
  let base = `https://i3f.arch.be/iiif/${inst}/${dossier.split('_').slice(0, 3).join('_')}/${dossier}/${dossier}_${vue}.jp2`
  let info = await lire(`${base}/info.json`)
  if (!info.ok()) {
    // rangement inattendu, ou session expirée : on ouvre la page et on regarde ce que la visionneuse demande
    const page = await ctx.newPage()
    try {
      const vu = page.waitForResponse((r) => /i3f\.arch\.be\/.*\/info\.json/.test(r.url()), { timeout: 30000 }).catch(() => undefined)
      await page.goto(acte.url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const reponse = await vu
      if (!reponse) {
        if (await page.locator('[data-bs-target="#modal_login"].alert-link').count()) throw new NonConnecte('Agatha')
        throw new Error('la visionneuse ne montre aucune image')
      }
      base = reponse.url().replace(/\/info\.json.*$/, '')
      info = await lire(`${base}/info.json`)
      if (!info.ok()) throw new Error(`Agatha répond ${info.status()}`)
    } finally { await page.close() }
  }
  // le serveur ne donne pas plus de 3000 px de large d'un coup : une image plus grande est demandée par morceaux, puis assemblée
  const { width, height } = await info.json()
  if (width > MAX_AGATHA || height > MAX_AGATHA) {
    const entiere = await assembler(lire, base, width, height).catch(() => undefined)
    if (entiere) return entiere
  }
  const r = await lire(`${base}/full/full/0/default.jpg`)
  if (!r.ok()) throw new Error(`Agatha répond ${r.status()}`)
  return r.body()
}

const MAX_AGATHA = 3000

/** Assemble les morceaux d'une grande image avec Pillow (python3) ; sans Pillow, on se contente de l'image réduite */
async function assembler(lire, base, largeur, hauteur) {
  const colonnes = Math.ceil(largeur / MAX_AGATHA)
  const rangees = Math.ceil(hauteur / MAX_AGATHA)
  const l = Math.ceil(largeur / colonnes)
  const h = Math.ceil(hauteur / rangees)
  const tmp = mkdtempSync(join(tmpdir(), 'lignees-'))
  try {
    const morceaux = []
    for (let y = 0; y < hauteur; y += h) {
      for (let x = 0; x < largeur; x += l) {
        const r = await lire(`${base}/${x},${y},${Math.min(l, largeur - x)},${Math.min(h, hauteur - y)}/full/0/default.jpg`)
        if (!r.ok()) throw new Error(`Agatha répond ${r.status()}`)
        const f = join(tmp, `${x}_${y}.jpg`)
        writeFileSync(f, await r.body())
        morceaux.push(`${x},${y},${f}`)
        await pause(300)
      }
    }
    const sortie = join(tmp, 'entiere.jpg')
    const py = `import sys
from PIL import Image
im = None
for m in sys.argv[4:]:
    x, y, f = m.split(',', 2)
    t = Image.open(f)
    if im is None: im = Image.new(t.mode, (int(sys.argv[1]), int(sys.argv[2])))
    im.paste(t, (int(x), int(y)))
im.save(sys.argv[3], quality=90)`
    const ok = await new Promise((fin) => spawn('python3', ['-I', '-c', py, String(largeur), String(hauteur), sortie, ...morceaux], { stdio: 'ignore' })
      .on('error', () => fin(false)).on('exit', (code) => fin(code === 0)))
    if (!ok) throw new Error('assemblage impossible')
    return readFileSync(sortie)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
}

const IMAGES = { familysearch: imageFamilySearch, agatha: imageAgatha }

// ——— Commandes ———

async function connexion() {
  const lance = await ouvrirChrome(CONNEXIONS)
  if (!lance) {
    const { navigateur, ctx } = await contexte()
    for (const u of CONNEXIONS) await (await ctx.newPage()).goto(u).catch(() => undefined)
    await navigateur.close()
  }
  console.log('Une fenêtre Chrome à part est ouverte : connectez-vous-y à FamilySearch et à Agatha, puis laissez-la ouverte\n(ou fermez-la : la session reste dans son profil). Ensuite : node scripts/actes.mjs telecharger')
}

function resume(actes, index) {
  const parSite = {}
  for (const a of actes) {
    const s = (parSite[a.site] ??= { cites: 0, faits: 0, erreurs: 0 })
    s.cites++
    if (fait(index[a.id])) s.faits++
    else if (index[a.id]?.erreur) s.erreurs++
  }
  for (const [site, s] of Object.entries(parSite)) {
    console.log(`${site.padEnd(13)} ${String(s.cites).padStart(5)} images citées · ${s.faits} téléchargées · ${s.erreurs} en échec · ${s.cites - s.faits - s.erreurs} à faire`)
  }
}

async function liste() {
  const actes = await file()
  const index = lireIndex()
  console.log(`Dossier : ${DOSSIER}`)
  resume(actes, index)
  const parGeneration = new Map()
  for (const a of actes) {
    const g = parGeneration.get(a.generation) ?? [0, 0]
    g[0]++
    if (fait(index[a.id])) g[1]++
    parGeneration.set(a.generation, g)
  }
  console.log('Par génération (téléchargées / citées) : ' + [...parGeneration].sort((a, b) => a[0] - b[0]).map(([g, [n, f]]) => `${g}: ${f}/${n}`).join(' · '))
  const octets = Object.values(index).reduce((n, e) => n + (fait(e) ? e.octets ?? 0 : 0), 0)
  if (octets) console.log(`Sur le disque : ${(octets / 1e6).toFixed(0)} Mo`)
  const suite = actes.filter((a) => !index[a.id]).slice(0, 10)
  if (suite.length) console.log('À suivre :\n' + suite.map((a) => `  ${a.fichier}  (${a.site})`).join('\n'))
}

async function telecharger() {
  const actes = await file()
  const index = lireIndex()
  const reessayer = !!reglages.reessayer
  // une image déjà là (téléchargée pour un ancêtre) : on y note seulement les signatures à chercher
  for (const a of actes) if (a.signataires && fait(index[a.id])) index[a.id].signataires = a.signataires
  if (reglages.signatures && existsSync(DOSSIER)) ecrireJson(INDEX, index)
  const aFaire = actes.filter((a) => !fait(index[a.id]) && (reessayer || !index[a.id]?.erreur)).slice(0, Number(reglages.max ?? 40))
  if (!aFaire.length) { console.log('Rien à télécharger.'); return resume(actes, index) }
  const attente = Number(reglages.pause ?? 4) * 1000
  const { navigateur, ctx } = await contexte()
  let echecs = 0
  try {
    for (const [i, a] of aFaire.entries()) {
      process.stdout.write(`${String(i + 1).padStart(3)}/${aFaire.length} ${a.fichier} … `)
      try {
        const image = await IMAGES[a.site](ctx, a)
        if (image.length < 2000 || image[0] !== 0xff || image[1] !== 0xd8) throw new Error('la réponse n’est pas une image JPEG')
        const fichier = a.fichier + '.jpg'
        mkdirSync(dirname(join(DOSSIER, fichier)), { recursive: true })
        writeFileSync(join(DOSSIER, fichier), image)
        index[a.id] = { fichier, url: a.url, sosa: a.sosa, octets: image.length, date: new Date().toISOString().slice(0, 10), signataires: a.signataires }
        echecs = 0
        console.log(`${(image.length / 1e6).toFixed(1)} Mo`)
      } catch (e) {
        if (e instanceof NonConnecte) {
          console.log(`\nLa session ${e.message} a expiré : reconnectez-vous dans la fenêtre Chrome (node scripts/actes.mjs connexion), puis relancez.`)
          break
        }
        index[a.id] = { url: a.url, sosa: a.sosa, erreur: String(e.message ?? e).split('\n')[0], date: new Date().toISOString().slice(0, 10) }
        console.log('échec : ' + index[a.id].erreur)
        // trois échecs de suite : le site a un souci, inutile d'insister
        if (++echecs >= 3) { console.log('Trois échecs de suite : arrêt. Relancez plus tard avec --reessayer.'); break }
      }
      ecrireJson(INDEX, index)
      if (i < aFaire.length - 1) await pause(attente * (0.75 + Math.random() / 2))
    }
  } finally { await navigateur.close() }
  resume(actes, index)
}

// ——— pCloud ———

const FICHIER_PCLOUD = join(CONFIG, 'pcloud.json')

async function pcloud(hote, methode, parametres, fichier) {
  let envoi
  if (fichier) {
    const formulaire = new FormData()
    formulaire.append('file', new Blob([fichier.octets]), fichier.nom)
    envoi = { method: 'POST', body: formulaire }
  }
  const r = await fetch(`https://${hote}/${methode}?${new URLSearchParams(parametres)}`, envoi)
  const j = await r.json()
  if (j.result !== 0) throw Object.assign(new Error(`pCloud : ${j.error ?? j.result}`), { code: j.result })
  return j
}

function demander(question, cache = false) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  // mot de passe : rien ne s'affiche pendant la frappe
  if (cache) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question) }
  return new Promise((ok) => rl.question(question, (v) => { rl.close(); if (cache) process.stdout.write('\n'); ok(v.trim()) }))
}

async function pcloudConnexion() {
  if (!process.stdin.isTTY) throw new Error('À lancer dans un terminal : le mot de passe se tape au clavier.')
  const username = await demander('Adresse du compte pCloud : ')
  const password = await demander('Mot de passe (ne s’affiche pas) : ', true)
  // les comptes européens sont sur eapi.pcloud.com, les autres sur api.pcloud.com
  let derniere
  for (const hote of ['eapi.pcloud.com', 'api.pcloud.com']) {
    try {
      const j = await pcloud(hote, 'userinfo', { getauth: 1, logout: 1, username, password, device: 'Lignées (actes)' })
      ecrireJson(FICHIER_PCLOUD, { hote, jeton: j.auth, dossier: reglages['dossier-pcloud'] ?? '/Lignées/actes' }, 0o600)
      console.log(`Connecté (${hote}). Le jeton est dans ${FICHIER_PCLOUD} ; le mot de passe n’est pas gardé.`)
      return
    } catch (e) { derniere = e }
  }
  throw new Error(`${derniere.message}. Avec la double authentification, créez plutôt le dossier de synchronisation de l’application pCloud et donnez-le en --dossier.`)
}

async function envoyerPcloud() {
  const c = lireJson(FICHIER_PCLOUD, null)
  if (!c?.jeton) throw new Error('Pas encore connecté à pCloud : node scripts/actes.mjs pcloud-connexion')
  const index = lireIndex()
  const aEnvoyer = Object.values(index).filter((e) => fait(e) && !e.pcloud && existsSync(join(DOSSIER, e.fichier)))
  const dossiers = new Set()
  const creer = async (chemin) => {
    const parties = chemin.split('/').filter(Boolean)
    for (let i = 1; i <= parties.length; i++) {
      const d = '/' + parties.slice(0, i).join('/')
      if (dossiers.has(d)) continue
      await pcloud(c.hote, 'createfolderifnotexists', { auth: c.jeton, path: d })
      dossiers.add(d)
    }
  }
  let n = 0
  for (const e of aEnvoyer) {
    const distant = `${c.dossier}/${e.fichier}`.replace(/\/+/g, '/')
    const dossier = distant.slice(0, distant.lastIndexOf('/'))
    await creer(dossier)
    const local = join(DOSSIER, e.fichier)
    const j = await pcloud(c.hote, 'uploadfile', { auth: c.jeton, path: dossier, nopartial: 1 }, { nom: distant.slice(dossier.length + 1), octets: readFileSync(local) })
    if (j.metadata?.[0]?.size !== statSync(local).size) throw new Error(`pCloud : ${e.fichier} n’est pas arrivé entier`)
    e.pcloud = distant
    if (reglages.liberer) rmSync(local)
    ecrireJson(INDEX, index)
    console.log(`${String(++n).padStart(4)}/${aEnvoyer.length} ${distant}`)
  }
  // l'index part aussi : il dit quelle image correspond à quelle adresse
  if (existsSync(INDEX)) {
    await creer(c.dossier)
    await pcloud(c.hote, 'uploadfile', { auth: c.jeton, path: c.dossier, nopartial: 1 }, { nom: 'index.json', octets: readFileSync(INDEX) })
  }
  console.log(n ? `${n} image${n > 1 ? 's envoyées' : ' envoyée'} dans ${c.dossier}.` : 'Tout est déjà sur pCloud.')
}

const COMMANDES = { connexion, liste, telecharger, 'pcloud-connexion': pcloudConnexion, pcloud: envoyerPcloud }
if (!COMMANDES[commande]) {
  console.error(`Commande inconnue : ${commande}\nCommandes : ${Object.keys(COMMANDES).join(', ')}`)
  process.exit(2)
}
COMMANDES[commande]().then(() => process.exit(0), (e) => { console.error(e.message ?? e); process.exit(1) })
