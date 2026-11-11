// Pousser un acte vers la skill « signatures-registre », depuis la page Signatures ouverte en local (npm run dev).
// Le serveur de développement copie l'image de l'acte, déjà téléchargée par scripts/actes.mjs (du disque, ou de pCloud
// par rclone si la copie locale a été libérée), dans « _skills/Images pour signatures/ », avec une fiche .json qui dit
// quelles signatures y chercher. La skill traite ensuite ce dossier ; une fois l'image rangée dans « old/ », l'acte
// est montré comme extrait. Rien de tout cela n'existe sur le site publié.

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const CHEMIN = '/__signatures'
const lireJson = (f, defaut) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return defaut } }

function reglages() {
  const r = lireJson(join(homedir(), '.config', 'lignees', 'actes.json'), {})
  return { ...r, dossier: resolve(String(r.dossier ?? join(homedir(), 'Lignées', 'actes')).replace(/^~(?=\/)/, homedir())) }
}

/** Les fiches .json d'un dossier : identifiant de l'image → nom de la fiche */
function fiches(dossier) {
  const ids = {}
  if (!existsSync(dossier)) return ids
  for (const f of readdirSync(dossier)) {
    if (!f.endsWith('.json')) continue
    const id = lireJson(join(dossier, f), {}).id
    if (typeof id === 'string') ids[id] = f
  }
  return ids
}

function rclone(args) {
  return new Promise((ok, ko) => {
    const p = spawn('rclone', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let erreurs = ''
    p.stderr.on('data', (d) => { erreurs += d })
    p.on('error', () => ko(new Error('rclone introuvable : l’image est sur pCloud et ne peut pas être rapportée')))
    p.on('exit', (code) => (code === 0 ? ok() : ko(new Error('rclone : ' + (erreurs.trim().split('\n').pop() || 'code ' + code)))))
  })
}

/** Où en est chaque image : téléchargée (sur le disque ou sur pCloud), en attente de la skill, extraite */
function etat(entree) {
  const r = reglages()
  const images = {}
  for (const [id, e] of Object.entries(lireJson(join(r.dossier, 'index.json'), {}))) {
    if (!e.fichier || e.erreur) continue
    images[id] = existsSync(join(r.dossier, e.fichier)) ? 'disque' : e.pcloud ? 'pcloud' : undefined
  }
  return { images, attente: Object.keys(fiches(entree)), faits: Object.keys(fiches(join(entree, 'old'))) }
}

async function pousser(entree, demande) {
  const r = reglages()
  const index = lireJson(join(r.dossier, 'index.json'), {})
  const dejaLa = { ...fiches(join(entree, 'old')), ...fiches(entree) }
  const pousses = []
  for (const id of Array.isArray(demande.images) ? demande.images : []) {
    const e = index[id]
    // seul ce que l'index connaît est copié : le chemin vient de lui, jamais de la page
    if (typeof id !== 'string' || !e?.fichier || e.erreur || dejaLa[id]) continue
    const nom = basename(e.fichier)
    const arrivee = join(entree, nom)
    mkdirSync(entree, { recursive: true })
    const source = join(r.dossier, e.fichier)
    if (existsSync(source)) copyFileSync(source, arrivee)
    else {
      const distant = typeof e.pcloud?.chemin === 'string' ? e.pcloud.chemin : r.rclone ? `${r.rclone}/${e.fichier}` : undefined
      if (!distant) throw new Error(`« ${nom} » n’est plus sur le disque, et rclone n’est pas réglé pour la rapporter de pCloud ("rclone" dans ~/.config/lignees/actes.json)`)
      await rclone(['copyto', distant, arrivee + '.partiel'])
      renameSync(arrivee + '.partiel', arrivee)
    }
    const fiche = {
      id, image: nom, adresse: e.url, acte: String(demande.acte ?? ''), personnes: String(demande.personnes ?? ''),
      signataires: (Array.isArray(demande.signataires) ? demande.signataires : []).map(String), pousse: new Date().toISOString().slice(0, 10),
    }
    writeFileSync(join(entree, nom.replace(/\.[^.]+$/, '') + '.json'), JSON.stringify(fiche, null, 1) + '\n')
    pousses.push(nom)
  }
  return pousses
}

function corps(req) {
  return new Promise((ok, ko) => {
    let t = ''
    req.on('data', (d) => { t += d; if (t.length > 1e5) ko(new Error('demande trop longue')) })
    req.on('end', () => { try { ok(JSON.parse(t)) } catch { ko(new Error('demande illisible')) } })
    req.on('error', ko)
  })
}

/** Greffon Vite, en développement seulement */
export function pousserSignatures(racine) {
  const entree = join(racine, '_skills', 'Images pour signatures')
  return {
    name: 'pousser-signatures',
    apply: 'serve',
    configureServer(serveur) {
      serveur.middlewares.use(CHEMIN, async (req, res) => {
        const repondre = (code, v) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)) }
        try {
          if (req.method === 'GET') return repondre(200, etat(entree))
          // une autre page web ouverte dans le navigateur ne peut pas envoyer du JSON ici sans y être autorisée
          if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] ?? '')) return repondre(405, { erreur: 'demande refusée' })
          const pousses = await pousser(entree, await corps(req))
          repondre(200, { pousses, ...etat(entree) })
        } catch (e) {
          repondre(500, { erreur: String(e?.message ?? e) })
        }
      })
    },
  }
}
