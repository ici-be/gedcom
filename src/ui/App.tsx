import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Arbre } from '../lib/gedcom/arbre'
import { baseDuFichier, bilan as faireBilan, calculer, relevePrecedent, VERSION_BILAN, type Perimetre, type Releve } from '../lib/donnees'
import { charger, chargerUrl } from '../lib/chargement'
import { parametreDistant, racineDansAdresse, trouverIndividu } from '../lib/distant'
import { adresseDevinee } from '../lib/geneanet'
import { ecrire, garderFichier, lire, lireFichier, oublierFichier, oublierTout } from '../lib/stockage'
import { Bienvenue, TableauDeBord } from './Accueil'
import { Individus } from './Individus'
import { Communes, Lieu } from './Communes'
import { Metiers, PageMetier } from './Metiers'
import type { Carte as TypeCarte } from './Carte'
import type { Impression as TypeImpression } from './Impression'
import type { Migrations as TypeMigrations } from './Migrations'
import { Statistiques } from './Statistiques'
import { Ascendance } from './Ascendance'
import { Lignee } from './Lignee'
import { Recit } from './Recit'
import { ListeEvenements, PageEvenement } from './Evenements'
import { Filiation } from './Filiation'
import { Introuvables } from './Introuvables'
import { ProposerInstallation } from './Installer'
import { ChoixRacine } from './ChoixRacine'

interface Fichier { nom: string; importe: string; arbre: Arbre }

function lireRoute(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
}

function Logo() {
  return (
    <svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" />
      <path d="M32 52V36M32 36 20 26M32 36l12-10M20 26v-8M44 26v-8M20 18l-6-6M20 18l6-6M44 18l-6-6M44 18l6-6" />
      <circle cx="32" cy="52" r="4.2" />
    </svg>
  )
}

// icônes du menu, au trait (16 × 16)
const ICONES: Record<string, string> = {
  accueil: 'M2 7l6-5 6 5v7H2z',
  personnes: 'M8 2a3 3 0 1 1 0 6a3 3 0 1 1 0-6M2.5 14c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5',
  lieux: 'M8 14.5s5-4.5 5-8.5a5 5 0 0 0-10 0c0 4 5 8.5 5 8.5zM8 4.6a1.4 1.4 0 1 1 0 2.8a1.4 1.4 0 1 1 0-2.8',
  metiers: 'M2 5h12v9H2zM6 5V3h4v2',
  carte: 'M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10',
  migrations: 'M2 11h9M8 8l3 3-3 3M14 5H5M8 2L5 5l3 3',
  ascendance: 'M8 14V8M8 8L3.5 4M8 8l4.5-4M3.5 4V2M12.5 4V2',
  recit: 'M3 2h7l3 3v9H3zM5.5 8h5M5.5 11h5',
  statistiques: 'M2.5 14V9M6.5 14V5M10.5 14V7M14 14V2',
  imprimer: 'M4 6V2h8v4M4 11H2.5V6h11v5H12M4 9h8v5H4z',
}

function Icone({ nom }: { nom: string }) {
  return <svg class="icone-menu" viewBox="0 0 16 16" aria-hidden="true"><path d={ICONES[nom]} /></svg>
}

export function App() {
  const [route, setRoute] = useState(lireRoute)
  const [etat, setEtat] = useState<'demarrage' | 'lecture' | 'pret' | 'vide'>('demarrage')
  const [erreur, setErreur] = useState<string>()
  const [fichier, setFichier] = useState<Fichier | null>(null)
  const [racine, setRacineBrute] = useState(() => lire('racine', ''))
  const [adresse, setAdresseBrute] = useState(() => lire('adresse', ''))
  const [perimetre, setPerimetreBrut] = useState<Perimetre>(() => lire('perimetre', 'ancetres'))
  const [releves, setReleves] = useState<Releve[]>(() => lire('releves', []))
  const nouveauReleve = useRef(false)
  // La carte (Leaflet) n'est chargée qu'à la première visite de l'onglet
  const [Carte, setCarte] = useState<typeof TypeCarte | null>(null)
  // Les arbres à imprimer aussi (polices et code QR)
  const [Impression, setImpression] = useState<typeof TypeImpression | null>(null)
  const [Migrations, setMigrations] = useState<typeof TypeMigrations | null>(null)

  const setRacine = (id: string) => { setRacineBrute(id); ecrire('racine', id) }
  const setAdresse = (a: string) => { setAdresseBrute(a); ecrire('adresse', a) }
  const setPerimetre = (p: Perimetre) => { setPerimetreBrut(p); ecrire('perimetre', p) }

  const arbreRef = useRef<Arbre | null>(null)
  arbreRef.current = fichier?.arbre ?? null

  useEffect(() => {
    const changer = () => {
      const sosa = racineDansAdresse('', location.hash)
      if (sosa && arbreRef.current) {
        const id = trouverIndividu(arbreRef.current, sosa)
        if (id) setRacine(id)
        const hashPropre = /^#\/?(?:cle|url|gist|sosa|racine)=/.test(location.hash) ? '' : location.hash.replace(/\?.*$/, '')
        history.replaceState(null, '', location.pathname + hashPropre)
      }
      setRoute(lireRoute())
      window.scrollTo({ top: 0 })
    }
    addEventListener('hashchange', changer)
    return () => removeEventListener('hashchange', changer)
  }, [])

  // Au lancement : ouvrir le fichier passé dans l'adresse (?cle=, #cle=, ?url= ou ?gist=), sinon reprendre le dernier gardé dans le navigateur
  useEffect(() => {
    const distant = parametreDistant(location.search, location.hash)
    const sosaDemande = racineDansAdresse(location.search, location.hash)
    const appliquerSosa = (arbre: Arbre) => {
      if (!sosaDemande) return
      const id = trouverIndividu(arbre, sosaDemande)
      if (id) setRacine(id)
    }
    if (distant || sosaDemande) {
      const hashPropre = /^#\/?(?:cle|url|gist|sosa|racine)=/.test(location.hash) ? '' : location.hash.replace(/\?.*$/, '')
      history.replaceState(null, '', location.pathname + hashPropre)
      setRoute(lireRoute())
    }
    if (distant) {
      setEtat('lecture')
      chargerUrl(distant).then(async (c) => {
        const importe = new Date().toISOString()
        await garderFichier({ nom: c.nom, importe, octets: c.octets })
        appliquerSosa(c.arbre)
        nouveauReleve.current = true
        setFichier({ nom: c.nom, importe, arbre: c.arbre })
        setEtat('pret')
      }).catch(async (e) => {
        setErreur(e instanceof Error ? e.message : String(e))
        const g = await lireFichier()
        if (!g) { setEtat('vide'); return }
        try {
          const c = await charger(g.nom, g.octets)
          appliquerSosa(c.arbre)
          setFichier({ nom: g.nom, importe: g.importe, arbre: c.arbre })
          setEtat('pret')
        } catch {
          setEtat('vide')
        }
      })
      return
    }
    lireFichier().then(async (g) => {
      if (!g) { setEtat('vide'); return }
      setEtat('lecture')
      try {
        const c = await charger(g.nom, g.octets)
        appliquerSosa(c.arbre)
        setFichier({ nom: g.nom, importe: g.importe, arbre: c.arbre })
        setEtat('pret')
      } catch {
        setEtat('vide')
      }
    })
  }, [])

  const ouvrir = async (f: File) => {
    setErreur(undefined)
    setEtat('lecture')
    try {
      const c = await charger(f.name, new Uint8Array(await f.arrayBuffer()))
      const importe = new Date().toISOString()
      await garderFichier({ nom: c.nom, importe, octets: c.octets })
      nouveauReleve.current = true
      setFichier({ nom: c.nom, importe, arbre: c.arbre })
      setEtat('pret')
      location.hash = '#/'
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
      setEtat(fichier ? 'pret' : 'vide')
    }
  }

  // Un nouvel export se dépose n'importe où dans la page, quelle qu'elle soit
  const [glisse, setGlisse] = useState(false)
  const ouvrirRef = useRef(ouvrir)
  ouvrirRef.current = ouvrir
  useEffect(() => {
    const avecFichier = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')
    const dessus = (e: DragEvent) => { if (avecFichier(e)) { e.preventDefault(); setGlisse(true) } }
    const quitte = (e: DragEvent) => { if (!e.relatedTarget) setGlisse(false) }
    const lache = (e: DragEvent) => {
      if (!avecFichier(e)) return
      e.preventDefault()
      setGlisse(false)
      const f = e.dataTransfer?.files[0]
      // la zone de dépôt de l'accueil s'en occupe elle-même
      if (f && !(e.target as Element | null)?.closest?.('.depot')) ouvrirRef.current(f)
    }
    addEventListener('dragover', dessus)
    addEventListener('dragleave', quitte)
    addEventListener('drop', lache)
    return () => { removeEventListener('dragover', dessus); removeEventListener('dragleave', quitte); removeEventListener('drop', lache) }
  }, [])

  const oublier = async () => {
    await oublierFichier()
    oublierTout()
    setFichier(null)
    setReleves([])
    setRacineBrute('')
    setAdresseBrute('')
    setEtat('vide')
    location.hash = '#/'
  }

  const racineEffective = useMemo(() => {
    const a = fichier?.arbre
    if (!a) return ''
    if (a.individus.has(racine)) return racine
    if (a.individus.has('@I1@')) return '@I1@'
    return a.individus.keys().next().value ?? ''
  }, [fichier, racine])

  // Sans adresse saisie, celle que l'en-tête du fichier Geneanet laisse deviner
  const adresseEffective = adresse || (fichier ? adresseDevinee(fichier.arbre.origine) : '')
  const donnees = useMemo(() => (fichier ? calculer(fichier.arbre, racineEffective, adresseEffective) : null), [fichier, racineEffective, adresseEffective])
  const bilan = useMemo(() => (donnees ? faireBilan(donnees) : null), [donnees])

  // Un relevé par import, pour mesurer les progrès d'un export à l'autre
  useEffect(() => {
    if (!bilan || !fichier || !nouveauReleve.current) return
    nouveauReleve.current = false
    const n = [...releves, { date: fichier.importe, fichier: fichier.nom, bilan, racine: racineEffective, base: baseDuFichier(fichier.arbre, fichier.nom), v: VERSION_BILAN }].slice(-50)
    setReleves(n)
    ecrire('releves', n)
  }, [bilan])

  const page = route[0] || ''

  // Le titre de l'onglet suit celui de la page (son h1, ou un data-titre plus précis), y compris quand il arrive après coup
  const principal = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = principal.current
    if (!el) return
    const maj = () => {
      const t = (el.querySelector('[data-titre]')?.getAttribute('data-titre') ?? el.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const titre = t && t !== 'Lignées' ? `${t} · Lignées` : 'Lignées'
      if (document.title !== titre) document.title = titre
    }
    maj()
    const obs = new MutationObserver(maj)
    obs.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-titre'] })
    return () => obs.disconnect()
  }, [])
  useEffect(() => {
    if (page === 'carte' && !Carte) import('./Carte').then((m) => setCarte(() => m.Carte))
    if (page === 'imprimer' && !Impression) import('./Impression').then((m) => setImpression(() => m.Impression))
    if (page === 'migrations' && !Migrations) import('./Migrations').then((m) => setMigrations(() => m.Migrations))
  }, [page])
  let contenu
  if (etat === 'demarrage') contenu = null
  else if (etat === 'lecture') contenu = <div class="attente" role="status"><span class="rouet" />Lecture de l'arbre…</div>
  else if (!donnees || !fichier || !bilan) contenu = <Bienvenue ouvrir={ouvrir} erreur={erreur} />
  else if (page === 'personnes') contenu = <Individus d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} />
  else if (page === 'lieux' && route[1]) contenu = <Lieu d={donnees} lieu={route[1]} perimetre={perimetre} setPerimetre={setPerimetre} />
  else if (page === 'lieux') contenu = <Communes d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} />
  else if (page === 'metiers' && route[1]) contenu = <PageMetier d={donnees} cle={route[1]} perimetre={perimetre} setPerimetre={setPerimetre} />
  else if (page === 'carte') contenu = Carte
    ? <Carte key={route[1] ?? ''} d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} focus={route[1]} />
    : <div class="attente" role="status"><span class="rouet" />Chargement de la carte…</div>
  else if (page === 'migrations') contenu = Migrations
    ? <Migrations d={donnees} onglet={route[1]} cle={route[2]} />
    : <div class="attente" role="status"><span class="rouet" />Chargement des cartes…</div>
  else if (page === 'recit') contenu = <Recit d={donnees} id={route[1]} />
  else if (page === 'evenements' && route[1]) contenu = <PageEvenement d={donnees} id={route[1]} />
  else if (page === 'evenements') contenu = <ListeEvenements d={donnees} />
  else if (page === 'ascendance') contenu = <Ascendance d={donnees} setPerimetre={setPerimetre} />
  else if (page === 'lignee') contenu = <Lignee d={donnees} cle={route[1] || 'paternelle'} />
  else if (page === 'statistiques') contenu = <Statistiques d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} />
  else if (page === 'imprimer') contenu = Impression
    ? <Impression d={donnees} id={route[1]} />
    : <div class="attente" role="status"><span class="rouet" />Préparation de l'arbre…</div>
  else if (page === 'filiation') contenu = <Filiation d={donnees} />
  else if (page === 'introuvables') contenu = <Introuvables d={donnees} />
  else if (page === 'metiers') contenu = <Metiers d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} />
  else contenu = (
    <>
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      <TableauDeBord d={donnees} bilan={bilan} precedent={relevePrecedent(releves, fichier.importe, baseDuFichier(fichier.arbre, fichier.nom))} fichier={fichier} ouvrir={ouvrir} setAdresse={setAdresse} setPerimetre={setPerimetre} oublier={oublier} />
    </>
  )

  return (
    <>
      <div class={donnees ? 'coque avec-menu' : 'coque'}>
        <header class="bandeau">
          <a href="#/" class="marque"><Logo /><span>Lignées</span></a>
          {donnees && <ChoixRacine d={donnees} setRacine={setRacine} />}
          {donnees && (
            <nav class="onglets">
              <a href="#/" class={page === '' ? 'actif' : ''}><Icone nom="accueil" />Accueil</a>
              <a href="#/personnes" class={page === 'personnes' ? 'actif' : ''}><Icone nom="personnes" />Personnes</a>
              <a href="#/lieux" class={page === 'lieux' ? 'actif' : ''}><Icone nom="lieux" />Lieux</a>
              <a href="#/metiers" class={page === 'metiers' ? 'actif' : ''}><Icone nom="metiers" />Métiers</a>
              <a href="#/carte" class={page === 'carte' ? 'actif' : ''}><Icone nom="carte" />Carte</a>
              <a href="#/migrations" class={page === 'migrations' ? 'actif' : ''}><Icone nom="migrations" />Migrations</a>
              <a href="#/ascendance" class={page === 'ascendance' || page === 'lignee' ? 'actif' : ''}><Icone nom="ascendance" />Ascendance</a>
              <a href="#/recit" class={page === 'recit' || page === 'evenements' ? 'actif' : ''}><Icone nom="recit" />Récit</a>
              <a href="#/statistiques" class={page === 'statistiques' ? 'actif' : ''}><Icone nom="statistiques" />Statistiques</a>
              <a href="#/imprimer" class={page === 'imprimer' ? 'actif' : ''}><Icone nom="imprimer" />Imprimer</a>
            </nav>
          )}
        </header>
        <div class="colonne">
          <main class="page" ref={principal}>{contenu}</main>
          <footer class="pied">
            Vos données restent dans votre navigateur. · <a href="https://github.com/ici-be/gedcom" target="_blank" rel="noopener noreferrer">Code source</a>
          </footer>
        </div>
      </div>
      <ProposerInstallation />
      {glisse && <div class="depot-global" aria-hidden="true"><p>Déposez le fichier pour {fichier ? 'mettre l’arbre à jour' : 'l’ouvrir'}</p></div>}
    </>
  )
}
