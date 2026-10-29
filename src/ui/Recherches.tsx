// Recherches externes : pour une ou plusieurs personnes, des onglets qui préremplissent la recherche dans des bases
// (livres, presse, archives). Les bases cochées sont retenues dans le navigateur d'une visite à l'autre.

import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { nomComplet } from '../lib/parente'
import { ecrire, lire } from '../lib/stockage'
import { CATEGORIES, nomRecherche, SOURCES, type Nom, type Source } from '../lib/recherches'
import { Annees, ChoixPersonne, Personne } from './commun'

const CLE_SOURCES = 'recherches.sources'
const CLE_PRENOMS = 'recherches.tous-prenoms'
/** Au-delà, on demande confirmation avant d'ouvrir les onglets */
const BEAUCOUP = 25

/** Menu qui s'ouvre par-dessus la page et se referme d'un clic en dehors */
function Deroulant({ titre, children }: { titre: ComponentChildren; children: ComponentChildren }) {
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => { document.removeEventListener('pointerdown', dehors); document.removeEventListener('keydown', echap) }
  }, [ouvert])
  return (
    <div ref={ref} class="rch-deroulant">
      <button type="button" class="bouton discret" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>{titre} <span aria-hidden="true">{ouvert ? '▴' : '▾'}</span></button>
      {ouvert && <div class="rch-menu">{children}</div>}
    </div>
  )
}

/** Proches d'une personne, à suggérer : parents, conjoints, enfants */
function proches(d: Donnees, id: string): { id: string; lien: string }[] {
  const ind = d.arbre.individus.get(id)
  if (!ind) return []
  const vus = new Set([id])
  const r: { id: string; lien: string }[] = []
  const ajouter = (x: string | undefined, lien: string) => {
    if (x && !vus.has(x) && d.arbre.individus.has(x)) { vus.add(x); r.push({ id: x, lien }) }
  }
  for (const f of ind.famc) {
    const fam = d.arbre.familles.get(f)
    ajouter(fam?.mari, 'père'); ajouter(fam?.femme, 'mère')
  }
  for (const f of ind.fams) {
    const fam = d.arbre.familles.get(f)
    if (!fam) continue
    const conjoint = fam.mari === id ? fam.femme : fam.mari
    ajouter(conjoint, d.arbre.individus.get(conjoint ?? '')?.sexe === 'F' ? 'épouse' : d.arbre.individus.get(conjoint ?? '')?.sexe === 'M' ? 'époux' : 'conjoint')
    for (const e of fam.enfants) ajouter(e, d.arbre.individus.get(e)?.sexe === 'F' ? 'fille' : d.arbre.individus.get(e)?.sexe === 'M' ? 'fils' : 'enfant')
  }
  return r
}

function Sosa({ d, id }: { d: Donnees; id: string }) {
  const a = d.ancetres.get(id)
  return a
    ? <span class="rch-sosa" title="Ancêtre direct : numéro Sosa">Sosa {a.sosa}</span>
    : <span class="rch-sosa hors" title="Pas un ancêtre direct">non Sosa</span>
}

/** Ouvre un onglet par recherche ; le navigateur peut en bloquer, il propose alors d'autoriser les fenêtres surgissantes */
function ouvrir(noms: Nom[], sources: Source[]): boolean {
  const n = noms.length * sources.length
  if (n > BEAUCOUP && !confirm(`Ouvrir ${n} onglets ?`)) return true
  const ouverts = noms.flatMap((nom) => sources.map((s) => window.open(s.url(nom), '_blank', 'noopener')))
  return ouverts.every(Boolean)
}

export function Recherches({ d, id }: { d: Donnees; id?: string }) {
  const [tous, setTous] = useState(() => lire(CLE_PRENOMS, false))
  const [actives, setActives] = useState<string[]>(() => lire<string[]>(CLE_SOURCES, SOURCES.map((s) => s.id)))
  // Personnes cherchées, la personne de l'adresse (#/recherches/<id>) en tête
  const [liste, setListe] = useState<string[]>(() => (id && d.arbre.individus.has(id) ? [id] : []))
  const [bloque, setBloque] = useState(false)
  useEffect(() => {
    if (id && d.arbre.individus.has(id)) setListe((l) => (l.includes(id) ? l : [id, ...l]))
  }, [id, d])

  const personnes = liste.flatMap((x) => {
    const ind = d.arbre.individus.get(x)
    return ind ? [{ id: x, ind, nom: nomRecherche(ind, tous) }] : []
  })
  const noms = personnes.flatMap((p) => (p.nom ? [p.nom] : []))
  const sourcesActives = SOURCES.filter((s) => actives.includes(s.id))
  const nbOnglets = sourcesActives.length * noms.length

  const changerSources = (ids: string[]) => { setActives(ids); ecrire(CLE_SOURCES, ids) }
  const basculerSource = (sid: string) => changerSources(actives.includes(sid) ? actives.filter((x) => x !== sid) : [...actives, sid])
  const basculerCategorie = (ids: string[], cocher: boolean) =>
    changerSources(cocher ? [...new Set([...actives, ...ids])] : actives.filter((x) => !ids.includes(x)))
  const ajouter = (x: string) => { if (x) setListe((l) => (l.includes(x) ? l : [...l, x])) }
  const retirer = (x: string) => setListe((l) => l.filter((y) => y !== x))
  const basculerPersonne = (x: string) => (liste.includes(x) ? retirer(x) : ajouter(x))
  const changerTous = (v: boolean) => { setTous(v); ecrire(CLE_PRENOMS, v) }
  const lancer = (n: Nom[]) => setBloque(!ouvrir(n, sourcesActives))

  return (
    <section class="ecran rch">
      <header class="titre-ecran">
        <h1>Recherches externes</h1>
        <p class="sous-titre">Chercher une ou plusieurs personnes dans des livres, journaux et archives numérisés : chaque base cochée s’ouvre dans un nouvel onglet, la recherche déjà remplie.</p>
      </header>

      <div class="panneau">
        <div class="rch-entete">
          <h2>Personnes <span class="rch-compte">{personnes.length}</span></h2>
          <label class="rch-option">
            <input type="checkbox" checked={tous} onChange={(e) => changerTous(e.currentTarget.checked)} /> avec tous les prénoms
          </label>
        </div>
        {personnes.length > 0 && (
          <ul class="rch-personnes">
            {personnes.map((p) => {
              const autour = proches(d, p.id)
              const nbCoches = autour.filter((x) => liste.includes(x.id)).length
              return (
                <li key={p.id} class={p.nom ? '' : 'impossible'}>
                  <div class="rch-qui">
                    <Personne d={d} id={p.id} annees /> <Sosa d={d} id={p.id} />
                    <div class="rch-requete">
                      {p.nom ? <>cherché comme <q>{p.nom.prenom} {p.nom.nom}</q></> : 'pas de prénom et de nom : recherche impossible'}
                    </div>
                  </div>
                  <div class="rch-actions">
                    {autour.length > 0 && (
                      <Deroulant titre={<>Proches{nbCoches > 0 && <span class="rch-compte">{nbCoches}</span>}</>}>
                        <p class="rch-menu-titre">Proches de {nomComplet(p.ind)}</p>
                        <ul>
                          {autour.map((x) => {
                            const ind = d.arbre.individus.get(x.id)!
                            return (
                              <li key={x.id}>
                                <label>
                                  <input type="checkbox" checked={liste.includes(x.id)} onChange={() => basculerPersonne(x.id)} />
                                  <span class="rch-lien">{x.lien}</span>
                                  <span class="rch-nom">{nomComplet(ind)} <Annees ind={ind} /></span>
                                  <Sosa d={d} id={x.id} />
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                        {autour.length > 1 && (
                          <p class="rch-menu-pied">
                            <button type="button" class="lien" onClick={() => setListe((l) => [...new Set([...l, ...autour.map((x) => x.id)])])}>Tout cocher</button>
                            {' · '}
                            <button type="button" class="lien" onClick={() => setListe((l) => l.filter((y) => !autour.some((x) => x.id === y)))}>Tout décocher</button>
                          </p>
                        )}
                      </Deroulant>
                    )}
                    {p.nom && (
                      <button type="button" class="bouton discret" disabled={!sourcesActives.length} title="Ouvrir les bases cochées pour cette personne seule" onClick={() => lancer([p.nom!])}>
                        Ouvrir ({sourcesActives.length})
                      </button>
                    )}
                    <button type="button" class="rch-retirer" title="Retirer de la recherche" aria-label={'Retirer ' + nomComplet(p.ind)} onClick={() => retirer(p.id)}>×</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div class="rch-ajout">
          <ChoixPersonne d={d} valeur="" choisir={ajouter} prenoms={2} />
          <p class="aide">{personnes.length ? 'Ajouter une autre personne, ou ses proches avec le bouton « Proches ».' : 'Choisissez une personne à chercher.'}</p>
        </div>
      </div>

      <div class="panneau">
        <div class="rch-entete">
          <h2>Bases <span class="rch-compte">{sourcesActives.length}/{SOURCES.length}</span></h2>
          <span class="rch-option">
            <button type="button" class="lien" onClick={() => changerSources(SOURCES.map((s) => s.id))}>Tout cocher</button>
            {' · '}
            <button type="button" class="lien" onClick={() => changerSources([])}>Tout décocher</button>
          </span>
        </div>
        {CATEGORIES.map((c) => {
          const sources = SOURCES.filter((s) => s.categorie === c.id)
          const ids = sources.map((s) => s.id)
          const toutes = ids.every((x) => actives.includes(x))
          return (
            <div key={c.id} class="rch-categorie">
              <h3>
                <label>
                  <input type="checkbox" checked={toutes} ref={(el) => { if (el) el.indeterminate = !toutes && ids.some((x) => actives.includes(x)) }}
                    onChange={() => basculerCategorie(ids, !toutes)} /> {c.titre}
                </label>
              </h3>
              <div class="rch-bases">
                {sources.map((s) => (
                  <label key={s.id} class={'rch-base' + (actives.includes(s.id) ? ' coche' : '')}>
                    <input type="checkbox" checked={actives.includes(s.id)} onChange={() => basculerSource(s.id)} />
                    <span>
                      <strong>{s.nom}</strong>
                      <span class="rch-detail">{s.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div class="rch-barre">
        <div>
          <strong>{nbOnglets} onglet{nbOnglets > 1 ? 's' : ''}</strong>
          <span class="aide"> · {noms.length} personne{noms.length > 1 ? 's' : ''} × {sourcesActives.length} base{sourcesActives.length > 1 ? 's' : ''}</span>
          {bloque && (
            <p class="rch-bloque">
              Le navigateur a bloqué des onglets. Dans Firefox : icône à gauche de l’adresse › Permissions › « Ouvrir des fenêtres
              surgissantes » › Autoriser, puis recommencez.
            </p>
          )}
        </div>
        <button type="button" class="bouton principal" disabled={!nbOnglets} onClick={() => lancer(noms)}>Tout ouvrir</button>
      </div>
    </section>
  )
}
