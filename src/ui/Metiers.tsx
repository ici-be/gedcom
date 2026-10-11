// Les métiers : combien de personnes les ont exercés, quand et où ; puis une page par métier.

import { Fragment } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import { membres, type Donnees, type Perimetre } from '../lib/donnees'
import type { Metier, Mention } from '../lib/metiers'
import { decouperMetiers } from '../lib/metiers'
import { decouperLieu } from '../lib/communes'
import { annee } from '../lib/gedcom/dates'
import { nombre } from '../lib/format'
import { telecharger, versCsv } from '../lib/csv'
import { comparerSosa, nomComplet } from '../lib/parente'
import { CelluleFait, ChoixPerimetre, DateLieu, EffacerFiltres, EnTeteTri, type Tri, Pagination, Personne, Sources, normaliser } from './commun'

type TriMetiers = 'nom' | 'personnes' | 'hommes' | 'femmes' | 'periode'
const PAR_PAGE = 100

/** Un métier réduit aux personnes du périmètre, avec ses chiffres */
interface Resume {
  metier: Metier
  personnes: [string, Mention[]][]
  hommes: number
  femmes: number
  debut?: number
  fin?: number
  communes: [string, number][]
}

function anneeNaissance(d: Donnees, id: string): number | undefined {
  return annee(d.suivis.get(id)?.naissance.evenement?.date)
}

/** Lieu d'une mention : celui du métier, à défaut celui de la naissance */
function lieuMention(d: Donnees, id: string, m: Mention): string | undefined {
  return m.evenement.lieu ?? d.suivis.get(id)?.naissance.evenement?.lieu
}

function resumer(d: Donnees, metier: Metier, perimetre: Set<string> | null): Resume | null {
  const personnes = [...metier.personnes.entries()].filter(([id]) => !perimetre || perimetre.has(id))
  if (!personnes.length) return null
  let hommes = 0
  let femmes = 0
  let debut: number | undefined
  let fin: number | undefined
  const communes = new Map<string, number>()
  for (const [id, mentions] of personnes) {
    const sexe = d.arbre.individus.get(id)?.sexe
    if (sexe === 'M') hommes++
    else if (sexe === 'F') femmes++
    const n = anneeNaissance(d, id)
    if (n !== undefined) {
      debut = debut === undefined ? n : Math.min(debut, n)
      fin = fin === undefined ? n : Math.max(fin, n)
    }
    const lieux = new Set(mentions.map((m) => lieuMention(d, id, m)).filter((l): l is string => !!l))
    for (const l of lieux) communes.set(l, (communes.get(l) ?? 0) + 1)
  }
  return {
    metier, personnes, hommes, femmes, debut, fin,
    communes: [...communes.entries()].sort((a, b) => b[1] - a[1]),
  }
}

function Periode({ r }: { r: Resume }) {
  if (r.debut === undefined) return <span class="vide">—</span>
  return <span class="periode">{r.debut === r.fin ? r.debut : `${r.debut}–${r.fin}`}</span>
}

export function lienMetier(cle: string): string {
  return '#/metiers/' + encodeURIComponent(cle)
}

/** Les métiers d'une personne, chacun lié à sa page */
export function LiensMetiers({ d, valeurs }: { d: Donnees; valeurs: string[] }) {
  const libelles = valeurs.flatMap(decouperMetiers)
  return (
    <>
      {libelles.map((l, i) => {
        const cle = d.metiers.cleDe(l)
        return (
          <Fragment key={i}>
            {i > 0 && ', '}
            {cle ? <a href={lienMetier(cle)} class="metier">{l}</a> : l}
          </Fragment>
        )
      })}
    </>
  )
}

export function Metiers({ d, perimetre, setPerimetre }: { d: Donnees; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }) {
  const [recherche, setRecherche] = useState('')
  const [tri, setTriBrut] = useState<Tri<TriMetiers>>({ cle: 'personnes', sens: -1 })
  const setTri = (t: Tri<TriMetiers>) => { setTriBrut(t); setPage(0) }
  const [page, setPage] = useState(0)

  const resumes = useMemo(() => {
    const m = membres(d, perimetre)
    return [...d.metiers.metiers.values()].map((x) => resumer(d, x, m)).filter((r): r is Resume => !!r)
  }, [d, perimetre])

  const liste = useMemo(() => {
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
    const r = resumes.filter((x) => {
      if (!mots.length) return true
      const n = normaliser(x.metier.variantes.map((v) => v.libelle).join(' '))
      return mots.every((m) => n.includes(m))
    })
    // ordre croissant ; le sens choisi l'inverse au besoin, à égalité le plus de personnes d'abord
    const comparer: Record<TriMetiers, (a: Resume, b: Resume) => number> = {
      nom: (a, b) => a.metier.titre.localeCompare(b.metier.titre, 'fr'),
      personnes: (a, b) => a.personnes.length - b.personnes.length,
      hommes: (a, b) => a.hommes - b.hommes,
      femmes: (a, b) => a.femmes - b.femmes,
      periode: (a, b) => (a.debut ?? 9999) - (b.debut ?? 9999) || (a.fin ?? 9999) - (b.fin ?? 9999),
    }
    return r.sort((a, b) => tri.sens * comparer[tri.cle](a, b) || b.personnes.length - a.personnes.length || a.metier.titre.localeCompare(b.metier.titre, 'fr'))
  }, [resumes, recherche, tri])

  const avecMetier = useMemo(() => new Set(resumes.flatMap((r) => r.personnes.map(([id]) => id))).size, [resumes])
  const visibles = liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE)

  const exporter = () => {
    telecharger('metiers.csv', versCsv([
      ['Métier', 'Formes', 'Personnes', 'Hommes', 'Femmes', 'Nés de', 'Nés jusqu’à', 'Communes principales'],
      ...liste.map((r) => [
        r.metier.titre, r.metier.variantes.map((v) => v.libelle).join(' | '), r.personnes.length, r.hommes, r.femmes,
        r.debut ?? '', r.fin ?? '', r.communes.slice(0, 3).map(([l]) => decouperLieu(l).nom).join(', '),
      ]),
    ]))
  }

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Métiers</h1>
        <p class="sous-titre">Les professions de la famille. Les formes masculine et féminine d'un même métier sont réunies, ainsi que les variantes d'écriture.</p>
      </header>

      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={(p) => { setPerimetre(p); setPage(0) }} />
        <label>
          <span>Métier</span>
          <input type="search" value={recherche} onInput={(e) => { setRecherche(e.currentTarget.value); setPage(0) }} placeholder="ex. musicien" />
        </label>
        <EffacerFiltres actifs={recherche.trim() ? [`métier « ${recherche.trim()} »`] : []} effacer={() => { setRecherche(''); setPage(0) }} />
      </div>

      <div class="barre-resultats">
        <span><strong>{nombre(liste.length)}</strong> métiers · {nombre(avecMetier)} personnes avec au moins un métier</span>
        <button type="button" class="bouton discret" onClick={exporter} disabled={!liste.length}>Exporter en CSV</button>
      </div>

      <div class="tableau-conteneur">
        <table class="tableau metiers">
          <thead>
            <tr>
              <EnTeteTri cle="nom" texte="Métier" tri={tri} trier={setTri} />
              <EnTeteTri cle="personnes" texte="Personnes" tri={tri} trier={setTri} sensInitial={-1} classe="nombre" />
              <EnTeteTri cle="hommes" texte="Hommes" tri={tri} trier={setTri} sensInitial={-1} classe="nombre" />
              <EnTeteTri cle="femmes" texte="Femmes" tri={tri} trier={setTri} sensInitial={-1} classe="nombre" />
              <EnTeteTri cle="periode" texte="Naissances" tri={tri} trier={setTri} />
              <th>Communes principales</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.metier.cle}>
                <td>
                  <a href={lienMetier(r.metier.cle)} class="commune">{r.metier.titre}</a>
                  {r.metier.variantes.length > 2 && <span class="contexte">{r.metier.variantes.length} formes</span>}
                </td>
                <td class="nombre">{nombre(r.personnes.length)}</td>
                <td class="nombre">{r.hommes ? nombre(r.hommes) : <span class="vide">–</span>}</td>
                <td class="nombre">{r.femmes ? nombre(r.femmes) : <span class="vide">–</span>}</td>
                <td><Periode r={r} /></td>
                <td class="communes-principales">
                  {r.communes.slice(0, 3).map(([l, n], i) => (
                    <Fragment key={l}>{i > 0 && ', '}<a href={'#/lieux/' + encodeURIComponent(l)} title={l}>{decouperLieu(l).nom}</a> <span class="vide">{n}</span></Fragment>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!liste.length && <p class="aucun">Aucun métier ne correspond.</p>}
      </div>
      <Pagination page={page} pages={Math.ceil(liste.length / PAR_PAGE)} aller={(p) => { setPage(p); window.scrollTo({ top: 0 }) }} />
    </section>
  )
}

type TriPersonnes = 'naissance' | 'nom' | 'sosa'

/** Les personnes qui ont exercé un métier */
export function PageMetier({ d, cle, perimetre, setPerimetre }: { d: Donnees; cle: string; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }) {
  const [tri, setTriBrut] = useState<Tri<TriPersonnes>>({ cle: 'naissance', sens: 1 })
  const setTri = (t: Tri<TriPersonnes>) => { setTriBrut(t); setPage(0) }
  const [page, setPage] = useState(0)
  const metier = d.metiers.metiers.get(cle)
  const r = useMemo(() => (metier ? resumer(d, metier, membres(d, perimetre)) : null), [d, metier, perimetre])

  const personnes = useMemo(() => {
    if (!r) return []
    const l = [...r.personnes]
    const sosa = (id: string) => d.ancetres.get(id)?.sosa
    const nom = (id: string) => normaliser(nomComplet(d.arbre.individus.get(id)!))
    const naissance = (id: string) => d.suivis.get(id)?.naissance.evenement?.date?.tri || 99999999
    const comparer: Record<TriPersonnes, (a: string, b: string) => number> = {
      nom: (a, b) => nom(a).localeCompare(nom(b), 'fr'),
      naissance: (a, b) => naissance(a) - naissance(b),
      // les non-ancêtres restent en bas dans les deux sens
      sosa: (a, b) => { const x = sosa(a), y = sosa(b); return x && y ? comparerSosa(x, y) : 0 },
    }
    l.sort(([a], [b]) => {
      if (tri.cle === 'sosa' && !sosa(a) !== !sosa(b)) return sosa(a) ? -1 : 1
      return tri.sens * comparer[tri.cle](a, b) || naissance(a) - naissance(b)
    })
    return l
  }, [r, tri, d])

  if (!metier || !r) {
    return (
      <section class="ecran">
        <p class="retour"><a href="#/metiers">‹ Tous les métiers</a></p>
        <p class="aucun">Personne n'a exercé ce métier parmi les personnes choisies.</p>
        <ChoixPerimetre valeur={perimetre} changer={setPerimetre} />
      </section>
    )
  }

  const visibles = personnes.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE)
  const autres = (id: string) => d.arbre.individus.get(id)!.metiers.flatMap(decouperMetiers).filter((l) => d.metiers.cleDe(l) !== cle)

  const exporter = () => {
    telecharger(`${metier.titre.replace(/[\\/:*?"<>|]/g, '-')}.csv`, versCsv([
      ['Sosa', 'Nom', 'Prénom', 'Sexe', 'Naissance', 'Lieu de naissance', 'Libellé', 'Date', 'Lieu', 'Source', 'Autres métiers', 'Lien'],
      ...personnes.flatMap(([id, mentions]) => {
        const ind = d.arbre.individus.get(id)!
        const n = d.suivis.get(id)!.naissance.evenement
        return mentions.map((m) => [
          d.ancetres.get(id)?.sosa ?? '', ind.nom, ind.prenom, ind.sexe, n?.date?.texte ?? '', n?.lieu ?? '',
          m.libelle, m.evenement.date?.texte ?? '', m.evenement.lieu ?? '', m.evenement.sources.join(' | '), autres(id).join(', '), d.lien(ind) ?? '',
        ])
      }),
    ]))
  }

  return (
    <section class="ecran">
      <p class="retour"><a href="#/metiers">‹ Tous les métiers</a></p>
      <header class="titre-ecran">
        <h1>{metier.titre}</h1>
        <p class="sous-titre">
          {nombre(r.personnes.length)} personne{r.personnes.length > 1 ? 's' : ''}
          {(r.hommes > 0 || r.femmes > 0) && <> · {r.hommes} homme{r.hommes > 1 ? 's' : ''}, {r.femmes} femme{r.femmes > 1 ? 's' : ''}</>}
          {r.debut !== undefined && <> · nées {r.debut === r.fin ? `en ${r.debut}` : `entre ${r.debut} et ${r.fin}`}</>}
        </p>
      </header>

      {metier.variantes.length > 1 && (
        <div class="etiquettes" aria-label="Formes rencontrées">
          <span class="etiquettes-titre">Formes</span>
          {metier.variantes.map((v) => <span key={v.libelle} class="etiquette">{v.libelle} <span class="vide">{v.personnes}</span></span>)}
        </div>
      )}
      {r.communes.length > 0 && (
        <div class="etiquettes" aria-label="Communes">
          <span class="etiquettes-titre">Communes</span>
          {r.communes.slice(0, 12).map(([l, n]) => (
            <a key={l} class="etiquette" href={'#/lieux/' + encodeURIComponent(l)} title={l}>{decouperLieu(l).nom} <span class="vide">{n}</span></a>
          ))}
          {r.communes.length > 12 && <span class="vide">et {r.communes.length - 12} autres</span>}
        </div>
      )}

      <div class="filtres">
        <ChoixPerimetre valeur={perimetre} changer={(p) => { setPerimetre(p); setPage(0) }} />
        <button type="button" class="bouton discret" onClick={exporter}>Exporter en CSV</button>
      </div>

      <div class="tableau-conteneur">
        <table class="tableau suivi">
          <thead>
            <tr>
              <EnTeteTri cle="sosa" texte="Sosa" tri={tri} trier={setTri} />
              <EnTeteTri cle="nom" texte="Personne" tri={tri} trier={setTri} />
              <EnTeteTri cle="naissance" texte="Naissance" tri={tri} trier={setTri} />
              <th>Mention</th>
              <th>Autres métiers</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(([id, mentions]) => {
              const a = d.ancetres.get(id)
              return (
                <tr key={id}>
                  <td class="sosa">
                    {a && <><span title={a.sosa}>{a.sosa.length > 9 ? a.sosa.slice(0, 7) + '…' : a.sosa}</span><span class="gen">G{a.generation}</span></>}
                  </td>
                  <td class="nom"><Personne d={d} id={id} annees /></td>
                  <td><CelluleFait f={d.suivis.get(id)!.naissance} /></td>
                  <td>
                    <ul class="mentions">
                      {mentions.map((m, i) => (
                        <li key={i}>
                          <span class="libelle-metier">{m.libelle}</span>
                          {(m.evenement.date || m.evenement.lieu) && <DateLieu e={m.evenement} />}
                          <Sources sources={m.evenement.sources} />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td class="autres-metiers"><LiensMetiers d={d} valeurs={autres(id)} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={Math.ceil(personnes.length / PAR_PAGE)} aller={(p) => { setPage(p); window.scrollTo({ top: 0 }) }} />
    </section>
  )
}
