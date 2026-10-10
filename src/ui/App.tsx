import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Arbre } from '../lib/gedcom/arbre'
import { bilan as faireBilan, calculer, type Perimetre, type Releve } from '../lib/donnees'
import { charger } from '../lib/chargement'
import { adresseDevinee } from '../lib/geneanet'
import { ecrire, garderFichier, lire, lireFichier, oublierFichier, oublierTout } from '../lib/stockage'
import { Bienvenue, TableauDeBord } from './Accueil'
import { Individus } from './Individus'
import { Communes, Lieu } from './Communes'
import { Metiers, PageMetier } from './Metiers'
import type { Carte as TypeCarte } from './Carte'
import { Statistiques } from './Statistiques'

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

  const setRacine = (id: string) => { setRacineBrute(id); ecrire('racine', id) }
  const setAdresse = (a: string) => { setAdresseBrute(a); ecrire('adresse', a) }
  const setPerimetre = (p: Perimetre) => { setPerimetreBrut(p); ecrire('perimetre', p) }

  useEffect(() => {
    const changer = () => { setRoute(lireRoute()); window.scrollTo({ top: 0 }) }
    addEventListener('hashchange', changer)
    return () => removeEventListener('hashchange', changer)
  }, [])

  // Au lancement : reprendre le dernier fichier gardé dans le navigateur
  useEffect(() => {
    lireFichier().then(async (g) => {
      if (!g) { setEtat('vide'); return }
      setEtat('lecture')
      try {
        const c = await charger(g.nom, g.octets)
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
    const n = [...releves, { date: fichier.importe, fichier: fichier.nom, bilan }].slice(-50)
    setReleves(n)
    ecrire('releves', n)
  }, [bilan])

  const page = route[0] || ''
  useEffect(() => {
    if (page === 'carte' && !Carte) import('./Carte').then((m) => setCarte(() => m.Carte))
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
  else if (page === 'statistiques') contenu = <Statistiques d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} />
  else if (page === 'metiers') contenu = <Metiers d={donnees} perimetre={perimetre} setPerimetre={setPerimetre} />
  else contenu = (
    <>
      {erreur && <p class="erreur" role="alert">{erreur}</p>}
      <TableauDeBord d={donnees} bilan={bilan} releves={releves} fichier={fichier} ouvrir={ouvrir} setRacine={setRacine} setAdresse={setAdresse} oublier={oublier} />
    </>
  )

  return (
    <>
      <header class="bandeau">
        <div class="bandeau-dedans">
          <a href="#/" class="marque"><Logo /><span>Lignées</span></a>
          {donnees && (
            <nav class="onglets">
              <a href="#/" class={page === '' ? 'actif' : ''}>Accueil</a>
              <a href="#/personnes" class={page === 'personnes' ? 'actif' : ''}>Personnes</a>
              <a href="#/lieux" class={page === 'lieux' ? 'actif' : ''}>Lieux</a>
              <a href="#/metiers" class={page === 'metiers' ? 'actif' : ''}>Métiers</a>
              <a href="#/carte" class={page === 'carte' ? 'actif' : ''}>Carte</a>
              <a href="#/statistiques" class={page === 'statistiques' ? 'actif' : ''}>Statistiques</a>
            </nav>
          )}
        </div>
      </header>
      <main class="page">{contenu}</main>
      <footer class="pied">
        Vos données restent dans votre navigateur. · <a href="https://github.com/ici-be/gedcom" target="_blank" rel="noopener noreferrer">Code source</a>
      </footer>
    </>
  )
}
