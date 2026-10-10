// Les lieux : combien de faits restent à sourcer dans chaque commune, puis la liste des actes à chercher.

import { Fragment } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { membres, type Donnees, type Perimetre } from '../lib/donnees'
import { communes, siecle, GROUPES, type Acte, type Commune } from '../lib/communes'
import { libelle, nombre, pourcent } from '../lib/format'
import { telecharger, versCsv } from '../lib/csv'
import { nomComplet } from '../lib/parente'
import { ecrire, lire } from '../lib/stockage'
import { Barre, ChoixPerimetre, EnTeteTri, type Tri, Pagination, Pastille, Personne, Sources, normaliser } from './commun'

type TriCommunes = 'nom' | 'total' | 'sans-source' | 'part'
const PAR_PAGE = 100

function useCommunes(d: Donnees, perimetre: Perimetre, autres: boolean): Commune[] {
  return useMemo(() => communes(d.arbre, membres(d, perimetre), autres), [d, perimetre, autres])
}

export function Communes({ d, perimetre, setPerimetre }: { d: Donnees; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }) {
  const [recherche, setRecherche] = useState('')
  const [autres, setAutres] = useState(() => lire('autres', false))
  const [tri, setTriBrut] = useState<Tri<TriCommunes>>({ cle: 'total', sens: -1 })
  const setTri = (t: Tri<TriCommunes>) => { setTriBrut(t); setPage(0) }
  const [page, setPage] = useState(0)
  useEffect(() => ecrire('autres', autres), [autres])
  const toutes = useCommunes(d, perimetre, autres)

  const liste = useMemo(() => {
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
    const r = toutes.filter((c) => {
      if (!mots.length) return true
      const n = normaliser(c.lieu)
      return mots.every((m) => n.includes(m))
    })
    const part = (c: Commune) => (c.actes.length - c.sansSource) / c.actes.length
    // ordre croissant ; le sens choisi l'inverse au besoin, à égalité le plus grand nombre de faits d'abord
    const comparer: Record<TriCommunes, (a: Commune, b: Commune) => number> = {
      nom: (a, b) => a.nom.localeCompare(b.nom, 'fr') || a.contexte.localeCompare(b.contexte, 'fr'),
      total: (a, b) => a.actes.length - b.actes.length,
      'sans-source': (a, b) => a.sansSource - b.sansSource,
      part: (a, b) => part(a) - part(b),
    }
    return r.sort((a, b) => tri.sens * comparer[tri.cle](a, b) || b.actes.length - a.actes.length || a.lieu.localeCompare(b.lieu, 'fr'))
  }, [toutes, recherche, tri])

  const total = liste.reduce((n, c) => n + c.actes.length, 0)
  const sansSource = liste.reduce((n, c) => n + c.sansSource, 0)
  const visibles = liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE)

  const exporter = () => {
    telecharger('lieux.csv', versCsv([
      ['Commune', 'Région, pays', 'Lieu complet', 'Faits', 'Sans source', 'Sourcés'],
      ...liste.map((c) => [c.nom, c.contexte, c.lieu, c.actes.length, c.sansSource, pourcent(c.actes.length - c.sansSource, c.actes.length)]),
    ]))
  }

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Lieux</h1>
        <p class="sous-titre">Les faits à sourcer, commune par commune : de quoi préparer une séance aux archives ou sur les registres en ligne.</p>
      </header>
      {!d.adresse && <p class="astuce bandeau-info">Pour que les noms deviennent des liens vers les fiches en ligne, indiquez l'adresse de votre arbre dans les <a href="#/">réglages de l'accueil</a>.</p>}

      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={(p) => { setPerimetre(p); setPage(0) }} />
        <label>
          <span>Commune</span>
          <input type="search" value={recherche} onInput={(e) => { setRecherche(e.currentTarget.value); setPage(0) }} placeholder="ex. Bruxelles" />
        </label>
        <label class="case">
          <input type="checkbox" checked={autres} onChange={(e) => setAutres(e.currentTarget.checked)} />
          <span>Inclure les autres événements (résidence, recensement…)</span>
        </label>
      </div>

      <div class="barre-resultats">
        <span><strong>{nombre(liste.length)}</strong> lieux · {nombre(total)} faits · <strong>{nombre(sansSource)}</strong> sans source</span>
        <button type="button" class="bouton discret" onClick={exporter} disabled={!liste.length}>Exporter en CSV</button>
      </div>

      <div class="tableau-conteneur">
        <table class="tableau lieux">
          <thead>
            <tr>
              <EnTeteTri cle="nom" texte="Commune" tri={tri} trier={setTri} />
              <EnTeteTri cle="total" texte="Faits" tri={tri} trier={setTri} sensInitial={-1} classe="nombre" />
              <EnTeteTri cle="sans-source" texte="Sans source" tri={tri} trier={setTri} sensInitial={-1} classe="nombre" />
              <EnTeteTri cle="part" texte="Sourcés" tri={tri} trier={setTri} />
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => (
              <tr key={c.lieu}>
                <td>
                  <a href={'#/lieux/' + encodeURIComponent(c.lieu)} class="commune">{c.nom}</a>
                  {c.contexte && <span class="contexte">{c.contexte}</span>}
                </td>
                <td class="nombre">{nombre(c.actes.length)}</td>
                <td class="nombre">{c.sansSource ? <strong>{nombre(c.sansSource)}</strong> : <span class="vide">0</span>}</td>
                <td class="progression">
                  <Barre n={c.actes.length - c.sansSource} total={c.actes.length} />
                  <span>{pourcent(c.actes.length - c.sansSource, c.actes.length)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p class="aucun">Aucun lieu ne correspond.</p>}
      </div>
      <Pagination page={page} pages={Math.ceil(liste.length / PAR_PAGE)} aller={(p) => { setPage(p); window.scrollTo({ top: 0 }) }} />
    </section>
  )
}

/** Les actes d'une commune, par type puis par siècle */
export function Lieu({ d, lieu, perimetre, setPerimetre }: { d: Donnees; lieu: string; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }) {
  const [autres] = useState(() => lire('autres', false))
  const [tout, setTout] = useState(false)
  const [masquerFaits, setMasquerFaits] = useState(true)
  const [faits, setFaits] = useState<string[]>(() => lire('faits', []))
  const toutes = useCommunes(d, perimetre, autres)
  const c = toutes.find((x) => x.lieu === lieu)
  const coches = useMemo(() => new Set(faits), [faits])

  const cocher = (cle: string, oui: boolean) => {
    const n = oui ? [...faits, cle] : faits.filter((x) => x !== cle)
    setFaits(n)
    ecrire('faits', n)
  }

  const groupes = useMemo(() => {
    if (!c) return []
    const actes = c.actes.filter((a) => (tout || !a.evenement.sources.length) && !(masquerFaits && coches.has(a.cle) && !tout))
    return GROUPES.map((g) => {
      const parSiecle = new Map<string, Acte[]>()
      for (const a of actes.filter((x) => x.groupe === g.id).sort((x, y) => (x.evenement.date?.tri || 99999999) - (y.evenement.date?.tri || 99999999))) {
        const k = siecle(a.evenement)
        parSiecle.set(k, [...(parSiecle.get(k) ?? []), a])
      }
      return { ...g, siecles: [...parSiecle.entries()], nombre: actes.filter((x) => x.groupe === g.id).length }
    }).filter((g) => g.nombre)
  }, [c, tout, masquerFaits, coches])

  if (!c) {
    return (
      <section class="ecran">
        <p><a href="#/lieux">‹ Tous les lieux</a></p>
        <p class="aucun">Aucun fait à « {lieu} » pour ce choix de personnes.</p>
        <ChoixPerimetre valeur={perimetre} changer={setPerimetre} />
      </section>
    )
  }

  const exporter = () => {
    const rangs = groupes.flatMap((g) => g.siecles.flatMap(([, actes]) => actes.map((a) => [
      g.titre, libelle(a.evenement), a.evenement.date?.texte ?? '', a.personnes.map((p) => { const i = d.arbre.individus.get(p); return i ? nomComplet(i) : '?' }).join(' & '),
      a.evenement.sources.join(' | '), coches.has(a.cle) ? 'oui' : '',
    ])))
    telecharger(`${c.nom}.csv`, versCsv([['Groupe', 'Type', 'Date', 'Personne(s)', 'Source', 'Fait'], ...rangs]))
  }

  return (
    <section class="ecran">
      <p class="retour"><a href="#/lieux">‹ Tous les lieux</a></p>
      <header class="titre-ecran">
        <h1>{c.nom}</h1>
        <p class="sous-titre">{c.contexte}</p>
      </header>
      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={setPerimetre} />
        <label class="case">
          <input type="checkbox" checked={tout} onChange={(e) => setTout(e.currentTarget.checked)} />
          <span>Afficher aussi les faits sourcés</span>
        </label>
        {!tout && (
          <label class="case">
            <input type="checkbox" checked={masquerFaits} onChange={(e) => setMasquerFaits(e.currentTarget.checked)} />
            <span>Masquer ce que j'ai coché</span>
          </label>
        )}
      </div>
      <div class="barre-resultats">
        <span>
          <strong>{nombre(c.sansSource)}</strong> faits sans source sur {nombre(c.actes.length)} · <Barre n={c.actes.length - c.sansSource} total={c.actes.length} /> {pourcent(c.actes.length - c.sansSource, c.actes.length)} sourcés
        </span>
        <button type="button" class="bouton discret" onClick={exporter}>Exporter en CSV</button>
      </div>
      <p class="astuce">Cochez un acte quand vous l'avez trouvé : il est retenu dans ce navigateur. Il disparaît pour de bon quand la source est ajoutée sur votre arbre et que vous rechargez un nouvel export.</p>

      {groupes.length === 0 && <p class="aucun">Rien à chercher ici. 🎉</p>}
      {groupes.map((g) => (
        <section key={g.id} class="groupe">
          <h2>{g.titre} <span class="compte">{g.nombre}</span></h2>
          {g.siecles.map(([dec, actes]) => (
            <div key={dec} class="siecle">
              <h3>{dec}</h3>
              <ul class="actes">
                {actes.map((a) => (
                  <li key={a.cle} class={coches.has(a.cle) ? 'coche' : ''}>
                    <input type="checkbox" checked={coches.has(a.cle)} onChange={(e) => cocher(a.cle, e.currentTarget.checked)} aria-label="Trouvé" />
                    <Pastille etat={a.evenement.sources.length ? 'source' : 'sans-source'} />
                    <span class="date">{a.evenement.date?.texte || 'date inconnue'}</span>
                    <span class="type">{libelle(a.evenement)}</span>
                    <span class="qui">
                      {a.personnes.map((p, i) => <Fragment key={p}>{i > 0 && ' & '}<Personne d={d} id={p} annees /></Fragment>)}
                    </span>
                    <Sources sources={a.evenement.sources} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </section>
  )
}
