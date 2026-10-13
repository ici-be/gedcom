// Tableau de suivi : naissance, mariage(s) et décès de chaque personne, avec l'état des sources.

import { Fragment } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Donnees, Perimetre } from '../lib/donnees'
import type { Individu } from '../lib/gedcom/arbre'
import type { Ancetre } from '../lib/parente'
import { comparerSosa, dansBranche, etatParents, nomComplet, parents } from '../lib/parente'
import { texteParent, type EtatParent } from '../lib/filiation'
import { score, unionLibre, type Etat, type Fait, type Suivi } from '../lib/suivi'
import { libelle, NOMS_ETATS, nombre } from '../lib/format'
import { telecharger, versCsv } from '../lib/csv'
import { ecrire, lire } from '../lib/stockage'
import { LiensMetiers } from './Metiers'
import { Annees, CelluleFait, ChoixPerimetre, DateLieu, EffacerFiltres, EnTeteTri, Pagination, Pastille, Personne, Sources, normaliser, useImpression, lignesAffichees, AvisImpression } from './commun'

type QuelFait = 'tous' | 'naissance' | 'mariage' | 'deces'
type QuelEtat = 'tout' | 'a-faire' | 'sans-source' | 'manquant' | 'complet'
type Tri = 'sosa' | 'nom' | 'naissance' | 'deces' | 'score'
/** à chercher : il manque un parent sans mention « Filiation: » · clos : un parent inconnu ou introuvable */
type QuelsParents = 'tous' | 'a-chercher' | 'clos'

interface Filtres {
  recherche: string
  lieu: string
  fait: QuelFait
  etat: QuelEtat
  genMin: string
  genMax: string
  branche: string
  parents: QuelsParents
  tri: Tri
  sens: 1 | -1
}

const FILTRES: Filtres = { recherche: '', lieu: '', fait: 'tous', etat: 'a-faire', genMin: '', genMax: '', branche: '', parents: 'tous', tri: 'sosa', sens: 1 }
/** Tout afficher : aucun nom, lieu, fait, état, génération ni branche imposé (le tri est gardé) */
const SANS_FILTRE: Partial<Filtres> = { recherche: '', lieu: '', fait: 'tous', etat: 'tout', genMin: '', genMax: '', branche: '', parents: 'tous' }
const PAR_PAGE = 100

interface Ligne {
  ind: Individu
  s: Suivi
  /** Ancêtre lui-même, ou ancêtre dont il est frère ou sœur */
  anc?: Ancetre
  fratrie: boolean
  parents: { pere: EtatParent; mere: EtatParent }
}

function parentsCorrespondent(p: Ligne['parents'], voulu: QuelsParents): boolean {
  if (voulu === 'a-chercher') return p.pere === 'a-chercher' || p.mere === 'a-chercher'
  if (voulu === 'clos') return [p.pere, p.mere].some((e) => e === 'inconnu' || e === 'introuvable')
  return true
}

/** « père inconnu, mère introuvable » : seulement les parents absents de l'arbre */
function texteParents(p: Ligne['parents'], aussiAChercher = false): string {
  return (['pere', 'mere'] as const)
    .filter((c) => p[c] !== 'connu' && (aussiAChercher || p[c] !== 'a-chercher'))
    .map((c) => texteParent(p[c], c))
    .join(', ')
}

function etatsChoisis(s: Suivi, fait: QuelFait): Etat[] {
  if (fait === 'naissance') return [s.naissance.etat]
  if (fait === 'mariage') return [s.mariage]
  if (fait === 'deces') return [s.deces.etat]
  return [s.naissance.etat, s.mariage, s.deces.etat]
}

function correspond(etats: Etat[], voulu: QuelEtat): boolean {
  const utiles = etats.filter((e) => e !== 'sans-objet')
  switch (voulu) {
    // Avec un fait précis, seulement les personnes concernées (mariées, décédées…)
    case 'tout': return utiles.length > 0
    case 'a-faire': return utiles.some((e) => e !== 'source')
    case 'sans-source': return utiles.includes('sans-source')
    case 'manquant': return utiles.includes('manquant')
    case 'complet': return utiles.length > 0 && utiles.every((e) => e === 'source')
  }
}

/** Faits où chercher le lieu : ceux du fait choisi, ou tous */
function faitsAvecLieu(s: Suivi, fait: QuelFait): Fait[] {
  if (fait === 'naissance') return [s.naissance]
  if (fait === 'mariage') return s.mariages
  if (fait === 'deces') return [s.deces]
  return [s.naissance, s.deces, ...s.mariages]
}

function cleTri(l: Ligne, tri: Tri): string | number {
  switch (tri) {
    case 'nom': return normaliser(nomComplet(l.ind))
    case 'naissance': return l.s.naissance.evenement?.date?.tri || 99999999
    case 'deces': return l.s.deces.evenement?.date?.tri || 99999999
    case 'score': { const sc = score(l.s); return sc.attendus ? sc.sources / sc.attendus : 2 }
    case 'sosa': return 0
  }
}

export function Individus({ d, perimetre, setPerimetre }: { d: Donnees; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }) {
  const [f, setF] = useState<Filtres>(() => ({ ...FILTRES, ...lire<Partial<Filtres>>('filtres', {}) }))
  const [page, setPage] = useState(0)
  const [ouvert, setOuvert] = useState<string | null>(null)
  const impression = useImpression()
  useEffect(() => ecrire('filtres', f), [f])
  const changer = (m: Partial<Filtres>) => { setF({ ...f, ...m }); setPage(0) }

  const avecAncetres = perimetre !== 'tous'
  const actifs = [
    f.recherche.trim() && `nom « ${f.recherche.trim()} »`,
    f.lieu.trim() && `lieu « ${f.lieu.trim()} »`,
    f.fait !== 'tous' && `fait : ${f.fait === 'deces' ? 'décès' : f.fait}`,
    f.etat !== 'tout' && `état : ${{ 'a-faire': 'à compléter', 'sans-source': 'sans source', manquant: 'manquant', complet: 'tout sourcé' }[f.etat]}`,
    avecAncetres && (f.genMin || f.genMax) && `générations ${f.genMin || '…'} à ${f.genMax || '…'}`,
    avecAncetres && f.branche && `branche ${f.branche}`,
    f.parents !== 'tous' && (f.parents === 'a-chercher' ? 'parents à chercher' : 'parents inconnus ou introuvables'),
  ].filter((x): x is string => !!x)

  const lignes = useMemo(() => {
    const ligne = (ind: Individu, anc: Ancetre | undefined, fratrie: boolean): Ligne => ({ ind, s: d.suivis.get(ind.id)!, anc, fratrie, parents: etatParents(d.arbre, ind) })
    let base: Ligne[]
    if (perimetre === 'tous') {
      base = [...d.arbre.individus.values()].map((ind) => ligne(ind, d.ancetres.get(ind.id) ?? d.fratries.get(ind.id), !d.ancetres.has(ind.id) && d.fratries.has(ind.id)))
    } else {
      base = [...d.ancetres.values()].map((a) => ligne(d.arbre.individus.get(a.id)!, a, false))
      if (perimetre === 'ancetres-fratries') {
        for (const a of d.fratries.values()) base.push(ligne(d.arbre.individus.get(a.id)!, a, true))
      }
    }
    const mots = normaliser(f.recherche).split(/\s+/).filter(Boolean)
    const lieu = normaliser(f.lieu.trim())
    const gMin = Number(f.genMin) || 0
    const gMax = Number(f.genMax) || Infinity
    const branche = /^\d+$/.test(f.branche) && f.branche !== '0' ? f.branche : ''
    const r = base.filter((l) => {
      if (!correspond(etatsChoisis(l.s, f.fait), f.etat)) return false
      if (!parentsCorrespondent(l.parents, f.parents)) return false
      if (mots.length) {
        const n = normaliser(l.ind.prenom + ' ' + l.ind.nom)
        if (!mots.every((m) => n.includes(m))) return false
      }
      if (lieu && !faitsAvecLieu(l.s, f.fait).some((x) => x.evenement?.lieu && normaliser(x.evenement.lieu).includes(lieu))) return false
      if (avecAncetres && l.anc) {
        if (l.anc.generation < gMin || l.anc.generation > gMax) return false
        if (branche && !dansBranche(l.anc.sosa, branche)) return false
      }
      return true
    })
    const parSosa = (a: Ligne, b: Ligne) => (a.anc && b.anc ? comparerSosa(a.anc.sosa, b.anc.sosa) || Number(a.fratrie) - Number(b.fratrie) : a.anc ? -1 : b.anc ? 1 : 0)
    if (f.tri === 'sosa') r.sort((a, b) => f.sens * parSosa(a, b))
    else {
      const cles = new Map(r.map((l) => [l.ind.id, cleTri(l, f.tri)]))
      r.sort((a, b) => {
        const x = cles.get(a.ind.id)!
        const y = cles.get(b.ind.id)!
        return f.sens * (x < y ? -1 : x > y ? 1 : 0) || parSosa(a, b)
      })
    }
    return r
  }, [d, perimetre, f, avecAncetres])

  const pages = Math.ceil(lignes.length / PAR_PAGE)
  const visibles = lignesAffichees(lignes, page, PAR_PAGE, impression)
  const tri = { cle: f.tri, sens: f.sens }
  const trier = (t: { cle: Tri; sens: 1 | -1 }) => changer({ tri: t.cle, sens: t.sens })
  const enTete = (t: Tri, texte: string) => <EnTeteTri cle={t} texte={texte} tri={tri} trier={trier} />

  const exporter = () => {
    const texteFait = (x: Fait) => [NOMS_ETATS[x.etat], x.evenement?.date?.texte ?? '', x.evenement?.lieu ?? '', x.evenement?.sources.join(' | ') ?? '']
    const entetes = ['Sosa', 'Génération', 'Nom', 'Prénom', 'Naissance', 'Date', 'Lieu', 'Source', 'Mariage', 'Date', 'Lieu', 'Source', 'Décès', 'Date', 'Lieu', 'Source', 'Parents absents', 'Lien']
    const rangs = lignes.map((l) => {
      const m = l.s.mariages[0] ?? { etat: 'sans-objet' as Etat }
      return [
        l.anc ? (l.fratrie ? 'fratrie de ' : '') + l.anc.sosa : '', l.anc?.generation ?? '', l.ind.nom, l.ind.prenom,
        ...texteFait(l.s.naissance), ...texteFait({ ...m, etat: l.s.mariage }), ...texteFait(l.s.deces), texteParents(l.parents, true), d.lien(l.ind) ?? '',
      ]
    })
    telecharger('suivi-sources.csv', versCsv([entetes, ...rangs]))
  }

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Personnes</h1>
        <p class="sous-titre">Naissance, mariage et décès : ce qui est sourcé, ce qui ne l'est pas, ce qui manque.</p>
      </header>
      {!d.adresse && <p class="astuce bandeau-info">Pour que les noms deviennent des liens vers les fiches en ligne, indiquez l'adresse de votre arbre dans les <a href="#/">réglages de l'accueil</a>.</p>}

      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={(p) => { setPerimetre(p); setPage(0) }} />
        <label>
          <span>Nom</span>
          <input type="search" value={f.recherche} onInput={(e) => changer({ recherche: e.currentTarget.value })} placeholder="ex. Veyckemans" />
        </label>
        <label>
          <span>Lieu</span>
          <input type="search" value={f.lieu} onInput={(e) => changer({ lieu: e.currentTarget.value })} placeholder="ex. Malines" />
        </label>
        <label>
          <span>Fait</span>
          <select value={f.fait} onChange={(e) => changer({ fait: e.currentTarget.value as QuelFait })}>
            <option value="tous">Tous</option>
            <option value="naissance">Naissance</option>
            <option value="mariage">Mariage</option>
            <option value="deces">Décès</option>
          </select>
        </label>
        <label>
          <span>État</span>
          <select value={f.etat} onChange={(e) => changer({ etat: e.currentTarget.value as QuelEtat })}>
            <option value="a-faire">À compléter</option>
            <option value="sans-source">Sans source</option>
            <option value="manquant">Manquant</option>
            <option value="complet">Tout sourcé</option>
            <option value="tout">Tout afficher</option>
          </select>
        </label>
        {avecAncetres && (
          <>
            <label class="court">
              <span>Générations</span>
              <span class="intervalle">
                <input type="number" min="1" inputMode="numeric" value={f.genMin} onInput={(e) => changer({ genMin: e.currentTarget.value })} placeholder="de" aria-label="Génération minimale" />
                <input type="number" min="1" inputMode="numeric" value={f.genMax} onInput={(e) => changer({ genMax: e.currentTarget.value })} placeholder="à" aria-label="Génération maximale" />
              </span>
            </label>
            <label class="court" title="Ancêtres d'un Sosa : 2 = côté paternel, 3 = côté maternel">
              <span>Branche (Sosa)</span>
              <input type="number" min="1" inputMode="numeric" value={f.branche} onInput={(e) => changer({ branche: e.currentTarget.value })} placeholder="ex. 2" />
            </label>
          </>
        )}
        <label title="Parents absents de l'arbre : à chercher, ou notés inconnus ou introuvables (« Filiation: père inconnu » dans la note)">
          <span>Parents <a href="#/filiation" class="aide-lien" title="Noter un parent inconnu ou introuvable">?</a></span>
          <select value={f.parents} onChange={(e) => changer({ parents: e.currentTarget.value as QuelsParents })}>
            <option value="tous">Peu importe</option>
            <option value="a-chercher">À chercher</option>
            <option value="clos">Inconnus ou introuvables</option>
          </select>
        </label>
        <EffacerFiltres actifs={actifs} effacer={() => changer(SANS_FILTRE)} />
      </div>

      <div class="barre-resultats">
        <span><strong>{nombre(lignes.length)}</strong> personne{lignes.length > 1 ? 's' : ''}</span>
        <span class="legende">
          <Pastille etat="source" /> sourcé <Pastille etat="sans-source" /> sans source <Pastille etat="manquant" /> manquant
        </span>
        <button type="button" class="bouton discret" onClick={exporter} disabled={!lignes.length}>Exporter en CSV</button>
      </div>

      <AvisImpression impression={impression} total={lignes.length} page={page} parPage={PAR_PAGE} />
      <div class="tableau-conteneur">
        <table class="tableau suivi">
          <thead>
            <tr>
              {avecAncetres || lignes.some((l) => l.anc) ? enTete('sosa', 'Sosa') : null}
              {enTete('nom', 'Personne')}
              {enTete('naissance', 'Naissance')}
              <th>Mariage</th>
              {enTete('deces', 'Décès')}
              {enTete('score', 'Sourcés')}
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => {
              const sc = score(l.s)
              const estOuvert = ouvert === l.ind.id
              return (
                <Fragment key={l.ind.id}>
                  <tr class={estOuvert ? 'ouvert' : ''}>
                    {(avecAncetres || lignes.some((x) => x.anc)) && (
                      <td class="sosa">
                        {l.anc ? (
                          <>
                            {l.fratrie && <span class="fratrie" title={`${l.ind.sexe === 'M' ? 'Frère' : l.ind.sexe === 'F' ? 'Sœur' : 'Frère ou sœur'} du Sosa ${l.anc.sosa}`}>≈</span>}
                            <span title={l.anc.sosa}>{l.anc.sosa.length > 9 ? l.anc.sosa.slice(0, 7) + '…' : l.anc.sosa}</span>
                            <span class="gen">G{l.anc.generation}{l.anc.occurrences > 1 ? ' ×' + l.anc.occurrences : ''}</span>
                          </>
                        ) : null}
                      </td>
                    )}
                    <td class="nom">
                      <button type="button" class="deplier" aria-expanded={estOuvert} onClick={() => setOuvert(estOuvert ? null : l.ind.id)} title="Détails">
                        {estOuvert ? '▾' : '▸'}
                      </button>
                      <Personne d={d} id={l.ind.id} />
                      <Annees ind={l.ind} />
                      {texteParents(l.parents) && <span class="filiation" title="D'après la note de la personne">{texteParents(l.parents)}</span>}
                    </td>
                    <td><CelluleFait f={l.s.naissance} /></td>
                    <td>
                      {l.s.mariages.length ? (
                        <span class="mariages">
                          {l.s.mariages.map((m, i) => <CelluleFait key={i} f={m} />)}
                        </span>
                      ) : <span class="vide">—</span>}
                    </td>
                    <td><CelluleFait f={l.s.deces} /></td>
                    <td class="score">{sc.attendus ? `${sc.sources}/${sc.attendus}` : '—'}</td>
                  </tr>
                  {estOuvert && (
                    <tr class="details">
                      <td colSpan={6}><Details d={d} ind={l.ind} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {!lignes.length && <p class="aucun">Aucune personne ne correspond à ces critères.</p>}
      </div>
      <Pagination page={page} pages={pages} aller={(p) => { setPage(p); window.scrollTo({ top: 0 }) }} />
    </section>
  )
}

/** Tous les événements de la personne et de ses unions, avec leurs sources */
function Details({ d, ind }: { d: Donnees; ind: Individu }) {
  const { pere, mere } = parents(d.arbre, ind)
  const etats = etatParents(d.arbre, ind)
  const absent = (c: 'pere' | 'mere') => etats[c] === 'a-chercher' ? '?' : <em>{texteParent(etats[c], c)}</em>
  const unions = ind.fams.map((f) => d.arbre.familles.get(f)).filter((f) => !!f)
  return (
    <div class="fiche">
      <p class="parents">
        {pere || mere || ind.filiation ? (
          <>{ind.sexe === 'M' ? 'Fils' : ind.sexe === 'F' ? 'Fille' : 'Enfant'} de {pere ? <Personne d={d} id={pere.id} annees /> : absent('pere')} et {mere ? <Personne d={d} id={mere.id} annees /> : absent('mere')}</>
        ) : 'Parents non renseignés'}
        {ind.metiers.length > 0 && <> · <LiensMetiers d={d} valeurs={ind.metiers} /></>}
      </p>
      <ul class="evenements">
        {ind.evenements.filter((e) => e.tag !== 'OCCU').map((e, i) => (
          <li key={i}>
            <Pastille etat={e.sources.length ? 'source' : 'sans-source'} />
            <strong>{libelle(e)}</strong> <DateLieu e={e} /> <Sources sources={e.sources} />
          </li>
        ))}
        {unions.map((fam) => {
          const conjoint = fam.mari === ind.id ? fam.femme : fam.mari
          return fam.evenements.map((e, i) => (
            <li key={fam.id + i}>
              <Pastille etat={e.sources.length ? 'source' : unionLibre(e) ? 'sans-objet' : 'sans-source'} />
              <strong>{libelle(e)}</strong>
              {conjoint && <> avec <Personne d={d} id={conjoint} /></>} <DateLieu e={e} /> <Sources sources={e.sources} />
            </li>
          ))
        })}
      </ul>
      {ind.sources.length > 0 && <p class="sources-generales">Sources générales : <Sources sources={ind.sources} /></p>}
    </div>
  )
}
