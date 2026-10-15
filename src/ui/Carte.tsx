// La carte : un cercle par commune, de taille selon le nombre de faits, de couleur selon la part sourcée.
// Chargée seulement quand on ouvre l'onglet (Leaflet et les listes de localités pèsent leur poids).

import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { render } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { membres, type Donnees, type Perimetre } from '../lib/donnees'
import { communes, siecle, GROUPES, type Groupe } from '../lib/communes'
import { decouper, situerArbre, type Position } from '../lib/geo'
import { nombre, pourcent } from '../lib/format'
import { telecharger } from '../lib/csv'
import { ecrire, lire } from '../lib/stockage'
import { Barre, ChoixPerimetre } from './commun'

type Manuelles = Record<string, [number, number]>

// ——— Couleurs : du rouge (rien de sourcé) au vert (tout est sourcé) ———

const ECHELLE = ['#c0392b', '#e0662a', '#e9a23b', '#8fb04a', '#2e8b57']

function couleur(part: number): string {
  return ECHELLE[Math.min(ECHELLE.length - 1, Math.floor(part * ECHELLE.length))]
}

function rayon(n: number): number {
  return Math.min(30, 4 + Math.sqrt(n) * 1.7)
}

function sombre(): boolean {
  const t = document.documentElement.dataset.theme
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
}

// ——— Ce qui est affiché ———

interface LieuCarte { lieu: string; nom: string; contexte: string; faits: number; sansSource: number; position?: Position }
interface Point { lat: number; lon: number; lieux: LieuCarte[]; faits: number; sansSource: number; incertain: boolean; manuel: boolean }

const SIECLES_AFFICHES = 'Tous'

interface Props { d: Donnees; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void; focus?: string }

export function Carte({ d, perimetre, setPerimetre, focus }: Props) {
  const [auto, setAuto] = useState<Map<string, Position> | null>(null)
  const [manuelles, setManuellesBrut] = useState<Manuelles>(() => lire('positions', {}))
  const [groupe, setGroupe] = useState<Groupe | 'tous'>('tous')
  const [choixSiecle, setChoixSiecle] = useState(SIECLES_AFFICHES)
  const [aFaire, setAFaire] = useState(false)
  const [aPlacer, setAPlacer] = useState<string | null>(null)
  const [voirTout, setVoirTout] = useState(false)

  const setManuelles = (m: Manuelles) => { setManuellesBrut(m); ecrire('positions', m) }

  useEffect(() => {
    let vivant = true
    situerArbre(d.arbre).then((p) => vivant && setAuto(p))
    return () => { vivant = false }
  }, [d.arbre])

  const toutes = useMemo(() => communes(d.arbre, membres(d, perimetre), false), [d, perimetre])

  // Siècles présents, pour le sélecteur
  const siecles = useMemo(() => {
    const s = new Map<string, number>()
    for (const c of toutes) for (const a of c.actes) {
      const k = siecle(a.evenement)
      if (k !== 'Date inconnue') s.set(k, a.evenement.date?.debut?.annee ?? 0)
    }
    return [...s.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k)
  }, [toutes])

  const lieux = useMemo<LieuCarte[]>(() => {
    const res: LieuCarte[] = []
    for (const c of toutes) {
      const actes = c.actes.filter((a) => (groupe === 'tous' || a.groupe === groupe) && (choixSiecle === SIECLES_AFFICHES || siecle(a.evenement) === choixSiecle))
      // une source notée introuvable n'est plus à chercher
      const sansSource = actes.filter((a) => !a.evenement.sources.length && !a.evenement.introuvable).length
      if (!actes.length || (aFaire && !sansSource)) continue
      const m = manuelles[c.lieu]
      const position: Position | undefined = m ? { lat: m[0], lon: m[1], qualite: 'manuel' } : auto?.get(c.lieu)
      res.push({ lieu: c.lieu, nom: c.nom, contexte: c.contexte, faits: actes.length, sansSource, position })
    }
    return res
  }, [toutes, groupe, choixSiecle, aFaire, manuelles, auto])

  // Plusieurs écritures d'un même lieu (« Paris 3e », « Paris, 14e ») : un seul cercle
  const points = useMemo(() => {
    const parCoord = new Map<string, Point>()
    for (const l of lieux) {
      if (!l.position) continue
      const k = l.position.lat.toFixed(3) + ',' + l.position.lon.toFixed(3)
      const p = parCoord.get(k) ?? { lat: l.position.lat, lon: l.position.lon, lieux: [], faits: 0, sansSource: 0, incertain: false, manuel: false }
      p.lieux.push(l)
      p.faits += l.faits
      p.sansSource += l.sansSource
      p.incertain ||= l.position.qualite === 'incertain'
      p.manuel ||= l.position.qualite === 'manuel'
      parCoord.set(k, p)
    }
    for (const p of parCoord.values()) p.lieux.sort((a, b) => b.faits - a.faits)
    // les gros cercles d'abord, pour que les petits restent cliquables par-dessus
    return [...parCoord.values()].sort((a, b) => b.faits - a.faits)
  }, [lieux])

  // « Belgique », « Bruxelles-Capitale, Belgique » sans commune : rien à placer
  const nonPlaces = useMemo(() => lieux.filter((l) => !l.position && decouper(l.lieu).commune).sort((a, b) => b.faits - a.faits), [lieux])
  const aVerifier = useMemo(() => lieux.filter((l) => l.position?.qualite === 'incertain').sort((a, b) => b.faits - a.faits), [lieux])
  const faitsPlaces = points.reduce((s, p) => s + p.faits, 0)
  const faitsTotal = lieux.reduce((s, l) => s + l.faits, 0)

  // ——— Leaflet ———
  const conteneur = useRef<HTMLDivElement>(null)
  const carte = useRef<L.Map>(undefined)
  const couche = useRef<L.LayerGroup>(undefined)
  const marqueurs = useRef(new Map<string, L.CircleMarker>())
  const aPlacerRef = useRef(aPlacer)
  aPlacerRef.current = aPlacer
  const cadre = useRef(false)

  const placer = (lieu: string, lat: number, lon: number) => {
    setManuelles({ ...lire<Manuelles>('positions', {}), [lieu]: [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4] })
    setAPlacer(null)
  }
  const placerRef = useRef(placer)
  placerRef.current = placer

  useEffect(() => {
    const m = L.map(conteneur.current!, { preferCanvas: true, zoomSnap: 0.5, worldCopyJump: true }).setView([50.5, 4.5], 7)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · lieux <a href="https://www.geonames.org/">GeoNames</a>',
    }).addTo(m)
    m.on('click', (e: L.LeafletMouseEvent) => {
      const l = aPlacerRef.current
      if (l) placerRef.current(l, e.latlng.lat, e.latlng.lng)
    })
    couche.current = L.layerGroup().addTo(m)
    carte.current = m
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setAPlacer(null) }
    addEventListener('keydown', echap)
    return () => { removeEventListener('keydown', echap); m.remove() }
  }, [])

  useEffect(() => {
    const m = carte.current
    const g = couche.current
    if (!m || !g) return
    g.clearLayers()
    marqueurs.current.clear()
    const contour = sombre() ? '#0d1110' : '#ffffff'
    for (const p of points) {
      const part = p.faits ? (p.faits - p.sansSource) / p.faits : 0
      const c = L.circleMarker([p.lat, p.lon], {
        radius: rayon(p.faits),
        color: p.incertain ? '#6b4fa0' : contour,
        weight: p.incertain ? 2 : 1,
        dashArray: p.incertain ? '3 3' : undefined,
        fillColor: couleur(part),
        fillOpacity: 0.82,
      })
      // en mode placement, un clic sur un cercle place le lieu au même endroit que sur le fond
      c.on('click', (e: L.LeafletMouseEvent) => {
        const l = aPlacerRef.current
        if (!l) return
        placerRef.current(l, e.latlng.lat, e.latlng.lng)
        setTimeout(() => m.closePopup())
      })
      c.bindTooltip(`${p.lieux[0].nom}${p.lieux.length > 1 ? ' …' : ''} · ${nombre(p.faits)} fait${p.faits > 1 ? 's' : ''}`, { direction: 'top', offset: [0, -rayon(p.faits)] })
      c.bindPopup(() => {
        const div = document.createElement('div')
        render(<Bulle p={p} placer={(lieu) => { m.closePopup(); setAPlacer(lieu) }} retirer={(lieu) => {
          const n = { ...lire<Manuelles>('positions', {}) }
          delete n[lieu]
          setManuelles(n)
          m.closePopup()
        }} />, div)
        return div
      }, { maxWidth: 340, minWidth: 220 })
      c.addTo(g)
      for (const l of p.lieux) marqueurs.current.set(l.lieu, c)
    }
    // Premier affichage : cadrer sur l'essentiel (ou sur le lieu demandé)
    if (!cadre.current && auto && points.length) {
      cadre.current = true
      const cible = focus ? marqueurs.current.get(focus) : undefined
      if (cible) {
        m.setView(cible.getLatLng(), 11, { animate: false })
        cible.openPopup()
      } else {
        // les lieux qui portent 80 % des faits, pour ne pas dézoomer à cause d'un décès en Amérique
        const tries = [...points].sort((a, b) => b.faits - a.faits)
        let cumul = 0
        const essentiels: L.LatLngExpression[] = []
        for (const p of tries) { essentiels.push([p.lat, p.lon]); cumul += p.faits; if (cumul >= faitsPlaces * 0.8) break }
        m.fitBounds(L.latLngBounds(essentiels), { padding: [24, 24], maxZoom: 11, animate: false })
      }
    }
  }, [points, auto])

  useEffect(() => {
    conteneur.current?.classList.toggle('en-placement', !!aPlacer)
    // la liste est sous la carte : on remonte pour que l'on puisse cliquer
    if (aPlacer) conteneur.current?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [aPlacer])

  const exporter = () => telecharger('positions-lignees.json', JSON.stringify(manuelles, null, 1))
  const importer = async (f: File | undefined) => {
    if (!f) return
    try {
      const n = JSON.parse(await f.text()) as Manuelles
      const propres = Object.fromEntries(Object.entries(n).filter(([, v]) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number')))
      setManuelles({ ...manuelles, ...propres })
    } catch {
      alert('Ce fichier ne contient pas de positions lisibles.')
    }
  }
  const nbManuelles = Object.keys(manuelles).length

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Carte</h1>
        <p class="sous-titre">
          Un cercle par lieu : plus il est grand, plus il y a de faits ; sa couleur dit la part déjà sourcée.
          Cliquez sur un cercle pour aller aux actes.
        </p>
      </header>

      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={setPerimetre} />
        <label>
          Faits
          <select value={groupe} onChange={(e) => setGroupe(e.currentTarget.value as Groupe | 'tous')}>
            <option value="tous">Tous</option>
            {GROUPES.filter((g) => g.id !== 'autres').map((g) => <option key={g.id} value={g.id}>{g.titre}</option>)}
          </select>
        </label>
        <label class="case">
          <input type="checkbox" checked={aFaire} onChange={(e) => setAFaire(e.currentTarget.checked)} />
          <span>Seulement les lieux qui ont des faits sans source</span>
        </label>
      </div>
      <div class="segments siecles" role="radiogroup" aria-label="Siècle">
        {[SIECLES_AFFICHES, ...siecles].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={choixSiecle === s} class={choixSiecle === s ? 'actif' : ''} onClick={() => setChoixSiecle(s)}>
            {s === SIECLES_AFFICHES ? 'Tous les siècles' : s.replace(' siècle', '')}
          </button>
        ))}
      </div>

      <div class="carte-cadre">
        <div ref={conteneur} class="carte-fond" />
        {!auto && <div class="carte-attente" role="status"><span class="rouet" />Recherche des lieux…</div>}
        {aPlacer && (
          <div class="carte-consigne" role="status">
            Cliquez sur la carte à l'emplacement de <strong>{aPlacer}</strong>
            <button type="button" class="bouton discret" onClick={() => setAPlacer(null)}>Annuler</button>
          </div>
        )}
      </div>

      <div class="legende">
        <span class="degrade" aria-hidden="true">{ECHELLE.map((c) => <i key={c} style={{ background: c }} />)}</span>
        <span>0 % → 100 % sourcé</span>
        <span class="legende-incertain"><i aria-hidden="true" /> position à vérifier</span>
        {auto && <span>{nombre(points.length)} lieux · {pourcent(faitsPlaces, faitsTotal)} des faits situés</span>}
      </div>

      {auto && (nonPlaces.length > 0 || aVerifier.length > 0) && (
        <div class="a-placer">
          {nonPlaces.length > 0 && (
            <section class="panneau">
              <h2>À placer <span class="compte">{nonPlaces.length}</span></h2>
              <p class="aide">Lieux introuvables dans la liste des localités (orthographe ancienne, hameau, faute de frappe…). Choisissez « Placer », puis cliquez sur la carte.</p>
              <ListeLieux lieux={voirTout ? nonPlaces : nonPlaces.slice(0, 15)} action="Placer" agir={setAPlacer} actif={aPlacer} />
              {nonPlaces.length > 15 && !voirTout && <button type="button" class="lien" onClick={() => setVoirTout(true)}>Voir les {nonPlaces.length}</button>}
            </section>
          )}
          {aVerifier.length > 0 && (
            <section class="panneau">
              <h2>À vérifier <span class="compte">{aVerifier.length}</span></h2>
              <p class="aide">Plusieurs localités portent ce nom : c'est la plus proche des autres lieux de la même région qui a été retenue.</p>
              <ListeLieux lieux={aVerifier} action="Voir" agir={(l) => {
                const c = marqueurs.current.get(l)
                if (c && carte.current) { carte.current.setView(c.getLatLng(), 10); c.openPopup(); conteneur.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
              }} />
            </section>
          )}
        </div>
      )}

      <p class="astuce">
        Les lieux sont reconnus dans une liste de localités livrée avec le site (GeoNames) : aucun nom n'est envoyé sur Internet.
        Seul le fond de carte est téléchargé. Les positions placées à la main sont gardées dans ce navigateur
        {nbManuelles > 0 && <> ({nbManuelles}) · <button type="button" class="lien" onClick={exporter}>les exporter</button></>}
        {' · '}<label class="lien">les importer<input type="file" accept=".json,application/json" hidden onChange={(e) => importer(e.currentTarget.files?.[0])} /></label>.
      </p>
    </section>
  )
}

function ListeLieux({ lieux, action, agir, actif }: { lieux: LieuCarte[]; action: string; agir: (lieu: string) => void; actif?: string | null }) {
  return (
    <ul class="liste-lieux">
      {lieux.map((l) => (
        <li key={l.lieu} class={actif === l.lieu ? 'actif' : ''}>
          <a href={'#/lieux/' + encodeURIComponent(l.lieu)}>{l.nom}</a>
          <span class="contexte">{l.contexte}{l.position?.libelle && <> · retenu : {l.position.libelle}</>}</span>
          <span class="nombre">{nombre(l.faits)}</span>
          <button type="button" class="bouton discret" onClick={() => agir(l.lieu)}>{action}</button>
        </li>
      ))}
    </ul>
  )
}

function Bulle({ p, placer, retirer }: { p: Point; placer: (lieu: string) => void; retirer: (lieu: string) => void }) {
  return (
    <div class="bulle-carte">
      {p.lieux.map((l) => (
        <div key={l.lieu} class="bulle-lieu">
          <a class="bulle-nom" href={'#/lieux/' + encodeURIComponent(l.lieu)}>{l.nom}</a>
          {l.contexte && <span class="contexte">{l.contexte}</span>}
          <span class="bulle-chiffres">
            {nombre(l.faits)} fait{l.faits > 1 ? 's' : ''} · <strong>{nombre(l.sansSource)}</strong> sans source
          </span>
          <Barre n={l.faits - l.sansSource} total={l.faits} />
          {l.position?.qualite === 'incertain' && <span class="bulle-note">Position à vérifier : {l.position.libelle}</span>}
          <span class="bulle-actions">
            {l.position?.qualite === 'manuel'
              ? <><span class="bulle-note">Placé à la main</span> <button type="button" class="lien" onClick={() => retirer(l.lieu)}>retirer</button></>
              : <button type="button" class="lien" onClick={() => placer(l.lieu)}>corriger la position</button>}
          </span>
        </div>
      ))}
    </div>
  )
}
