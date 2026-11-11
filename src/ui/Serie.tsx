// Recherche en série dans Open Archives : toutes les personnes à qui il manque une source ou un fait, ancêtres d'abord.
// Le moteur (lib/recherche-serie.ts) tourne même quand on change d'écran ; cette page le pilote et montre ce qu'il a trouvé.

import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Donnees, Perimetre } from '../lib/donnees'
import { nomComplet } from '../lib/parente'
import { nombre } from '../lib/format'
import { versCsv, telecharger } from '../lib/csv'
import { ecrire, lire } from '../lib/stockage'
import { titreFait } from '../lib/recherche-auto'
import { abonner, arreterSerie, chargerSerie, demarrerSerie, effacerSerie, etatSerie, fileSerie, marquerTraite, type FaitSerie, type Tache, type Trouve } from '../lib/recherche-serie'
import { AvisImpression, ChoixPerimetre, EffacerFiltres, Pagination, Personne, lignesAffichees, normaliser, useImpression } from './commun'

const PAR_PAGE = 50
const CLE_REGLAGES = 'serie.reglages'

interface Reglages { perimetre: Perimetre; sansDate: boolean }
interface Ligne { tache: Tache; f: FaitSerie; trouve: Trouve; surs: boolean }

/** « 1 h 20 », « 12 min » */
function duree(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000))
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
}

function useSerie() {
  const [, rafraichir] = useState(0)
  useEffect(() => {
    void chargerSerie()
    return abonner(() => rafraichir((n) => n + 1))
  }, [])
  return etatSerie()
}

export function Serie({ d }: { d: Donnees }) {
  const serie = useSerie()
  const [reglages, setReglages] = useState<Reglages>(() => lire<Reglages>(CLE_REGLAGES, { perimetre: 'tous', sansDate: true }))
  const regler = (r: Partial<Reglages>) => { const n = { ...reglages, ...r }; setReglages(n); ecrire(CLE_REGLAGES, n) }
  const [qui, setQui] = useState<'' | '0' | '1' | '2'>('')
  const [surs, setSurs] = useState(false)
  const [cacher, setCacher] = useState(true)
  const [texte, setTexte] = useState('')
  const [page, setPage] = useState(0)
  const impression = useImpression()

  const taches = useMemo(() => fileSerie(d, reglages.perimetre, reglages.sansDate), [d, reglages])
  const { faits: memoire, traites } = serie.memoire
  const traite = useMemo(() => new Set(traites), [traites])

  const bilan = useMemo(() => {
    let total = 0
    let cherches = 0
    let personnes = 0
    const lignes: Ligne[] = []
    for (const tache of taches) {
      let finie = true
      for (const f of tache.faits) {
        total++
        const trouve = memoire[f.cle]
        if (!trouve) { finie = false; continue }
        cherches++
        if (trouve.candidats.length) lignes.push({ tache, f, trouve, surs: trouve.candidats.some((c) => c.dateExacte || c.memeLieu) })
      }
      if (finie) personnes++
    }
    return { total, cherches, personnes, lignes }
  }, [taches, memoire])

  const noms = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of taches) { const i = d.arbre.individus.get(t.id); if (i) m.set(t.id, normaliser(nomComplet(i))) }
    return m
  }, [taches, d])

  const liste = useMemo(() => {
    const q = normaliser(texte.trim())
    return bilan.lignes.filter((l) =>
      (!qui || String(l.tache.rang) === qui) && (!surs || l.surs) && (!cacher || !traite.has(l.f.cle)) && (!q || (noms.get(l.tache.id) ?? '').includes(q)))
  }, [bilan, qui, surs, cacher, traite, texte, noms])

  const reste = bilan.total - bilan.cherches
  const pages = Math.ceil(liste.length / PAR_PAGE)
  const p = Math.min(page, Math.max(0, pages - 1))
  const filtres = [qui && 'personnes', surs && 'même date ou même lieu', !cacher && 'faits traités', texte.trim() && 'nom'].filter((x): x is string => !!x)
  const courant = serie.courant ? d.arbre.individus.get(serie.courant) : undefined

  const exporter = () => {
    const lignes: (string | number)[][] = [['Sosa', 'Personne', 'Fait', 'Acte trouvé', 'Même date', 'Même lieu', 'Source', 'Adresse']]
    for (const l of liste) {
      const ind = d.arbre.individus.get(l.tache.id)
      for (const c of l.trouve.candidats) {
        lignes.push([l.tache.rang === 0 ? l.tache.sosa ?? '' : '', ind ? nomComplet(ind) : '', titreFait(l.f.fait), c.titre, c.dateExacte ? 'oui' : '', c.memeLieu ? 'oui' : '', c.detail, c.url])
      }
    }
    telecharger('actes-trouves.csv', versCsv(lignes))
  }

  return (
    <section class="ecran serie">
      <p class="retour"><a href="#/recherches">‹ Recherches</a></p>
      <header class="titre-ecran">
        <h1>Recherche en série</h1>
        <p class="sous-titre">Chercher dans les index d'Open Archives l'acte de chaque fait sans source ou sans date, les ancêtres d'abord, puis leurs frères et sœurs, puis le reste de l'arbre.</p>
      </header>

      <section class="panneau">
        <div class="serie-reglages">
          <ChoixPerimetre valeur={reglages.perimetre} changer={(perimetre) => regler({ perimetre })} />
          <label><input type="checkbox" checked={reglages.sansDate} onChange={(e) => regler({ sansDate: e.currentTarget.checked })} /> aussi les faits sans date (fourchette estimée)</label>
        </div>
        <p class="serie-avancement">
          <strong>{nombre(bilan.cherches)}</strong> fait{bilan.cherches > 1 ? 's' : ''} cherché{bilan.cherches > 1 ? 's' : ''} sur <strong>{nombre(bilan.total)}</strong>
          {' · '}{nombre(bilan.personnes)} personne{bilan.personnes > 1 ? 's' : ''} sur {nombre(taches.length)}
          {' · '}<strong>{nombre(bilan.lignes.length)}</strong> avec un acte candidat
          {serie.enCours && reste > 0 && serie.rythme && <> · reste environ {duree(reste * serie.rythme)}</>}
        </p>
        <progress class="serie-barre" max={Math.max(1, bilan.total)} value={bilan.cherches} />
        <div class="rch-auto-actions">
          {serie.enCours
            ? <button type="button" class="bouton principal" onClick={arreterSerie}>Arrêter</button>
            : <button type="button" class="bouton principal" disabled={!serie.pret || !reste} onClick={() => void demarrerSerie(d, taches)}>
                {!serie.pret ? 'Lecture de la mémoire…' : !reste ? 'Tout est cherché' : bilan.cherches ? `Reprendre (${nombre(reste)} faits)` : `Démarrer (${nombre(reste)} faits)`}
              </button>}
          {serie.enCours && courant && <span class="aide"><span class="rouet" /> {nomComplet(courant)}</span>}
          {!serie.enCours && Object.keys(memoire).length > 0 && (
            <button type="button" class="lien danger" onClick={() => { if (confirm('Oublier tout ce qui a été trouvé et repartir du début ?')) void effacerSerie() }}>Tout oublier</button>
          )}
        </div>
        {serie.erreur && <p class="avertissement">{serie.erreur}</p>}
        <p class="aide">
          Les noms et les années sont envoyés à <a href="https://www.openarchieven.nl/?lang=fr" target="_blank" rel="noopener noreferrer">Open Archives</a> (index des Archives de l'État
          en Belgique et des archives néerlandaises), un fait à la fois. Ce qui est trouvé et l'avancement restent dans ce navigateur{' '}: la recherche
          reprend où elle s'était arrêtée, même après un nouvel export, et ne repose pas deux fois la même question. Elle continue pendant que vous
          visitez les autres écrans, tant que cet onglet reste ouvert. Un fait qui a reçu sa source dans l'arbre disparaît de la liste.
        </p>
      </section>

      <div class="filtres">
        <label>Personnes
          <select value={qui} onChange={(e) => { setQui(e.currentTarget.value as typeof qui); setPage(0) }}>
            <option value="">Toutes</option>
            <option value="0">Ancêtres</option>
            <option value="1">Frères et sœurs d'ancêtres</option>
            <option value="2">Reste de l'arbre</option>
          </select>
        </label>
        <label>Nom
          <input type="search" value={texte} onInput={(e) => { setTexte(e.currentTarget.value); setPage(0) }} />
        </label>
        <label class="case"><input type="checkbox" checked={surs} onChange={(e) => { setSurs(e.currentTarget.checked); setPage(0) }} /> même date ou même lieu seulement</label>
        <label class="case"><input type="checkbox" checked={cacher} onChange={(e) => { setCacher(e.currentTarget.checked); setPage(0) }} /> cacher les faits traités</label>
        <EffacerFiltres actifs={filtres} effacer={() => { setQui(''); setSurs(false); setCacher(true); setTexte(''); setPage(0) }} />
      </div>

      <div class="barre-resultats">
        <span><strong>{nombre(liste.length)}</strong> fait{liste.length > 1 ? 's' : ''} avec un acte candidat{traite.size > 0 && <> · {nombre(traite.size)} traité{traite.size > 1 ? 's' : ''}</>}</span>
        <button type="button" class="bouton discret" disabled={!liste.length} onClick={exporter}>Exporter en CSV</button>
      </div>

      <AvisImpression impression={impression} total={liste.length} page={p} parPage={PAR_PAGE} />
      {liste.length > 0 && (
        <div class="tableau-conteneur">
          <table class="tableau sig-tableau">
            <thead><tr><th title="Fait traité : acte vérifié et ajouté à l'arbre, ou écarté">✓</th><th>Sosa</th><th>Personne</th><th>Fait cherché</th><th>Actes trouvés dans l'index</th></tr></thead>
            <tbody>
              {lignesAffichees(liste, p, PAR_PAGE, impression).map((l) => (
                <tr key={l.tache.id + l.f.cle} class={traite.has(l.f.cle) ? 'coche' : ''}>
                  <td><input type="checkbox" checked={traite.has(l.f.cle)} onChange={(e) => marquerTraite(l.f.cle, e.currentTarget.checked)} aria-label="Fait traité" /></td>
                  <td class="sosa">{l.tache.rang === 0 ? l.tache.sosa : l.tache.rang === 1 ? <span class="gen">fratrie de {l.tache.sosa}</span> : ''}</td>
                  <td class="nom"><Personne d={d} id={l.tache.id} annees prenoms={2} /></td>
                  <td>
                    {titreFait(l.f.fait)}
                    <span class="contexte">{!l.f.fait.estime ? 'sans source' : l.f.fait.evenement?.date?.debut ? 'date imprécise dans l’arbre' : 'sans date dans l’arbre'}{l.f.fait.conjoint && <> · avec {nomComplet(l.f.fait.conjoint)}</>}</span>
                  </td>
                  <td>
                    <ul class="rch-candidats">
                      {l.trouve.candidats.slice(0, 4).map((c) => (
                        <li key={c.url}>
                          <a href={c.url} target="_blank" rel="noopener noreferrer">{c.titre}</a>
                          {c.dateExacte && <span class="rch-marque">même date</span>}
                          {c.memeLieu && <span class="rch-marque">même lieu</span>}
                          <span class="rch-detail">{c.detail}</span>
                        </li>
                      ))}
                      {l.trouve.candidats.length > 4 && <li class="vide">et {l.trouve.candidats.length - 4} autre{l.trouve.candidats.length > 5 ? 's' : ''}</li>}
                      {!l.trouve.complet && <li class="vide">nom très répandu{' '}: toutes les lignes de l'index n'ont pas été lues</li>}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!liste.length && <p class="vide">{bilan.cherches ? 'Aucun acte candidat ne correspond.' : 'Rien n’a encore été cherché.'}</p>}
      <Pagination page={p} pages={pages} aller={setPage} />
    </section>
  )
}
