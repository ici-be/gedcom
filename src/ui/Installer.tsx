import { useEffect, useState } from 'preact/hooks'
import { ecrire, lire } from '../lib/stockage'

// Sur smartphone, proposer d'ajouter Lignées à l'écran d'accueil (application installée, hors ligne).
// Android (Chrome, Edge, Samsung…) : le navigateur fournit l'invite, déclenchée par le bouton.
// iPhone / iPad (Safari) : pas d'invite possible, on explique le geste.

interface InviteInstallation extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// L'événement peut arriver avant l'affichage : on le garde dès le chargement du module
let invite: InviteInstallation | null = null
const abonnes = new Set<() => void>()
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  invite = e as InviteInstallation
  abonnes.forEach((f) => f())
})
addEventListener('appinstalled', () => {
  invite = null
  abonnes.forEach((f) => f())
})

const DELAI_RELANCE = 30 * 24 * 3600 * 1000

function dejaInstallee(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function smartphone(): boolean {
  return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820
}

function iosSafari(): boolean {
  const ua = navigator.userAgent
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  // Chrome, Firefox… sur iOS savent aussi ajouter à l'écran d'accueil depuis iOS 16.4, mais le geste diffère
  return ios && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}

export function ProposerInstallation() {
  const [, rafraichir] = useState(0)
  const [ecarte, setEcarte] = useState(() => Date.now() - lire('installation-ecartee', 0) < DELAI_RELANCE)

  useEffect(() => {
    const f = () => rafraichir((n) => n + 1)
    abonnes.add(f)
    return () => { abonnes.delete(f) }
  }, [])

  if (ecarte || dejaInstallee() || !smartphone()) return null
  const ios = !invite && iosSafari()
  if (!invite && !ios) return null

  const ecarter = () => { setEcarte(true); ecrire('installation-ecartee', Date.now()) }
  const installer = async () => {
    if (!invite) return
    await invite.prompt()
    const { outcome } = await invite.userChoice
    invite = null
    if (outcome === 'dismissed') ecarter()
    else rafraichir((n) => n + 1)
  }

  return (
    <aside class="installation" aria-label="Installer l'application">
      <p>
        <strong>Installer Lignées</strong>{' '}
        {ios
          ? <>: touchez <IconePartager /> <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>. L'arbre s'ouvrira comme une application, même sans réseau.</>
          : <>sur l'écran d'accueil : l'arbre s'ouvrira comme une application, même sans réseau.</>}
      </p>
      <div class="installation-actions">
        {!ios && <button type="button" class="bouton principal" onClick={installer}>Installer</button>}
        <button type="button" class="bouton discret" onClick={ecarter}>{ios ? 'Fermer' : 'Plus tard'}</button>
      </div>
    </aside>
  )
}

function IconePartager() {
  return (
    <svg class="icone-partager" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1" />
    </svg>
  )
}
