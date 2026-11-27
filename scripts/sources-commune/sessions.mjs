// Vérifie que le Chrome de travail (port 9333, profil ~/.local/share/lignees/chrome) est ouvert et connecté à
// Geneanet et FamilySearch ; sinon tente la connexion avec les identifiants enregistrés dans Chrome.
// Agatha n'en fait plus partie : son serveur d'images (i3f.arch.be) et ses manifestes se lisent sans session (il
// suffit du Referer https://agatha.arch.be/), seule la visionneuse web demande un compte ; agatha.py et actes.mjs
// s'en passent.
//   node sessions.mjs [--attendre MINUTES]
// Les mots de passe ne passent jamais par ce script : Chrome remplit lui-même le formulaire (identifiants
// enregistrés), le script ne fait que cliquer dans le champ puis sur le bouton de connexion du formulaire.
// FamilySearch : connexion par identifiant et mot de passe uniquement, jamais par le bouton Google.
// Si le remplissage automatique n'a rien donné, l'onglet de connexion reste au premier plan et le script attend
// que Bruno se connecte lui-même (5 minutes par défaut). Code de sortie 0 si les deux sessions sont actives.
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright-core')

const PORT = 9333
const CDP = `http://127.0.0.1:${PORT}`
const PROFIL = join(homedir(), '.local', 'share', 'lignees', 'chrome')
const ARBRE = 'bveyckemans'
const i = process.argv.indexOf('--attendre')
const ATTENTE = (i > 0 ? Number(process.argv[i + 1]) : 5) * 60000
const pause = (ms) => new Promise(ok => setTimeout(ok, ms))

async function cdpOuvert() { try { return (await fetch(`${CDP}/json/version`)).ok } catch { return false } }
if (!(await cdpOuvert())) {
  mkdirSync(PROFIL, { recursive: true })
  const bin = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].find(b => (process.env.PATH ?? '').split(':').some(d => existsSync(join(d, b))))
  if (!bin) { console.log('Chrome introuvable'); process.exit(2) }
  spawn(bin, [`--user-data-dir=${PROFIL}`, `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore' }).unref()
  for (let k = 0; k < 40 && !(await cdpOuvert()); k++) await pause(500)
  if (!(await cdpOuvert())) { console.log('Chrome ne répond pas sur le port', PORT); process.exit(2) }
  console.log('Chrome de travail lancé')
}
const nav = await chromium.connectOverCDP(CDP)
const ctx = nav.contexts()[0]
const p = await ctx.newPage()

const SITES = {
  geneanet: {
    test: `https://gw.geneanet.org/${ARBRE}_w?lang=fr&p=bruno&n=veyckemans`, // une fiche : le menu Édition prouve les droits d'écriture
    connecte: () => !!document.querySelector('#menu-edition'),
    connexion: 'https://www.geneanet.org/connexion/',
  },
  familysearch: {
    test: 'https://www.familysearch.org/fr/home/portal/',
    connecte: () => !!document.querySelector('a[href*="/auth/logout"]'),
    connexion: 'https://www.familysearch.org/fr/global',
    // l'adresse de connexion directe renvoie à l'accueil : passer par le bouton « Ouvrir une session »
    avant: async (p) => { await Promise.all([p.waitForNavigation({ timeout: 30000 }).catch(() => null), p.locator('#signInLink').click()]); await p.waitForTimeout(2500) },
  },
}

async function etat(s) {
  await p.goto(s.test, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(2500)
  return p.evaluate(s.connecte).catch(() => false)
}

// Remplissage par Chrome (on ne lit jamais la valeur des champs, seulement s'ils sont remplis) puis clic sur le bouton du formulaire qui contient le mot de passe (jamais Google)
async function connecter(nom, s) {
  await p.goto(s.connexion, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await p.waitForTimeout(2500)
  if (s.avant) await s.avant(p)
  if (s.ouvrir) { await p.evaluate(s.ouvrir); await p.waitForTimeout(1500) }
  const mdp = p.locator('input[type=password]:visible').first()
  if (!(await mdp.count())) return false
  const ident = p.locator('form:has(input[type=password]) input:visible:not([type=password]):not([type=hidden]):not([type=checkbox]):not([type=submit])').first()
  if (await ident.count()) await ident.click().catch(() => {})
  await p.waitForTimeout(1500)
  const rempli = await p.evaluate(() => [...document.querySelectorAll('input[type=password]')].some(x => x.offsetParent && x.value.length > 0))
  if (!rempli) return false
  const bouton = p.locator('form:has(input[type=password]) button[type=submit]:visible, form:has(input[type=password]) input[type=submit]:visible').first()
  if (!(await bouton.count())) return false
  const texte = ((await bouton.innerText().catch(() => '')) || (await bouton.getAttribute('value')) || '').toLowerCase()
  if (texte.includes('google')) return false
  await Promise.all([p.waitForNavigation({ timeout: 30000 }).catch(() => null), bouton.click()])
  await p.waitForTimeout(3000)
  return etat(s)
}

let tous = true
for (const [nom, s] of Object.entries(SITES)) {
  let ok = await etat(s)
  if (!ok) {
    console.log(`${nom} : non connecté, tentative avec les identifiants enregistrés…`)
    ok = await connecter(nom, s).catch(err => { console.log(`${nom} : ${String(err).slice(0, 150)}`); return false })
  }
  if (!ok) {
    // à Bruno de se connecter dans l'onglet laissé ouvert
    await p.goto(s.connexion, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
    if (s.avant) await s.avant(p).catch(() => {})
    if (s.ouvrir) { await p.waitForTimeout(2000); await p.evaluate(s.ouvrir).catch(() => {}) }
    await p.bringToFront()
    console.log(`${nom} : connecte-toi dans la fenêtre Chrome de travail (j'attends ${ATTENTE / 60000} min ; FamilySearch : identifiant et mot de passe, pas Google ; accepte d'enregistrer le mot de passe pour la prochaine fois)`)
    const fin = Date.now() + ATTENTE
    const q = await ctx.newPage()
    while (!ok && Date.now() < fin) {
      await pause(10000)
      await q.goto(s.test, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
      await q.waitForTimeout(2000)
      ok = await q.evaluate(s.connecte).catch(() => false)
    }
    await q.close()
  }
  console.log(`${nom} : ${ok ? 'connecté' : 'NON CONNECTÉ'}`)
  tous &&= ok
}
await p.close().catch(() => {})
process.exit(tous ? 0 : 1)
