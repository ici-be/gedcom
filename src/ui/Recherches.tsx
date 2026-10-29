// Recherches externes : pour une personne choisie, des liens qui préremplissent la recherche dans des bases (livres, presse,
// archives) et, pour celles qui le permettent, le nombre de résultats. Le nom n'est envoyé à une base que si on le demande.

import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { ecrire, lire } from '../lib/stockage'
import { nomRecherche, SOURCES } from '../lib/recherches'
import { ChoixPersonne, Personne } from './commun'

/** Menu qui s'ouvre par-dessus la page et se referme d'un clic en dehors */
function Deroulant({ titre, children }: { titre: string; children: ComponentChildren }) {
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOuvert(false) }
    document.addEventListener('pointerdown', dehors)
    return () => document.removeEventListener('pointerdown', dehors)
  }, [ouvert])
  return (
    <span ref={ref} style="position:relative;display:inline-block">
      <button type="button" class="lien" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>{titre} {ouvert ? '▴' : '▾'}</button>
      {ouvert && <div class="resultats" style="right:auto;top:auto;margin-top:2px">{children}</div>}
    </span>
  )
}

const CLE_SOURCES = 'recherches.sources'

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
    ajouter(fam.mari === id ? fam.femme : fam.mari, 'conjoint')
    for (const e of fam.enfants) ajouter(e, 'enfant')
  }
  return r
}

export function Recherches({ d, id }: { d: Donnees; id?: string }) {
  const [tous, setTous] = useState(false)
  const [actives, setActives] = useState<string[]>(() => lire<string[]>(CLE_SOURCES, SOURCES.map((s) => s.id)))
  // Personnes ajoutées (avec leurs proches suggérés) et personnes cochées pour la recherche
  const [ajoutees, setAjoutees] = useState<string[]>([])
  const [cochees, setCochees] = useState<string[]>([])
  const [bloque, setBloque] = useState(false)

  const principale = id && d.arbre.individus.has(id) ? id : undefined
  const blocs = [...(principale ? [principale] : []), ...ajoutees.filter((x) => x !== principale)]
  const choisies = [...new Set([...(principale ? [principale] : []), ...cochees])]
    .map((x) => { const ind = d.arbre.individus.get(x); return ind && { id: x, nom: nomRecherche(ind, tous) } })
    .filter((x): x is { id: string; nom: NonNullable<ReturnType<typeof nomRecherche>> } => !!x && !!x.nom)
  const sourcesActives = SOURCES.filter((s) => actives.includes(s.id))

  const changerSources = (ids: string[]) => { setActives(ids); ecrire(CLE_SOURCES, ids) }
  const basculerSource = (sid: string) => changerSources(actives.includes(sid) ? actives.filter((x) => x !== sid) : [...actives, sid])
  const basculerPersonne = (x: string) => setCochees((c) => c.includes(x) ? c.filter((y) => y !== x) : [...c, x])
  const ajouter = (x: string) => {
    if (!x || blocs.includes(x)) return
    setAjoutees((a) => [...a, x]); setCochees((c) => c.includes(x) ? c : [...c, x])
  }
  const retirer = (x: string) => { setAjoutees((a) => a.filter((y) => y !== x)); setCochees((c) => c.filter((y) => y !== x)) }

  const aller = (cible: string) => { location.hash = '#/recherches/' + encodeURIComponent(cible) }
  const nbOnglets = sourcesActives.length * choisies.length
  // Tous les onglets cochés d'un coup : le navigateur peut en bloquer, il propose alors d'autoriser les fenêtres surgissantes
  const toutOuvrir = () => {
    const ouverts = choisies.flatMap((p) => sourcesActives.map((s) => window.open(s.url(p.nom), '_blank', 'noopener')))
    setBloque(ouverts.some((o) => !o))
  }

  const etiquetteSosa = (x: string) => {
    const a = d.ancetres.get(x)
    return a ? <span class="aide">Sosa {a.sosa}</span> : <span class="aide">pas Sosa</span>
  }

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Recherches externes</h1>
        <p class="sous-titre">Chercher une ou plusieurs personnes dans des livres, journaux et archives numérisés.</p>
      </header>
      <div class="graphe-personne"><ChoixPersonne d={d} valeur={id ?? ''} choisir={aller} prenoms={2} /></div>
      {!principale && <p class="aide">Choisissez une personne : chaque base cochée s’ouvre dans un nouvel onglet, la recherche déjà remplie.</p>}
      {principale && (
        <>
          <h2>Personnes</h2>
          {blocs.map((b) => {
            const ind = d.arbre.individus.get(b)!
            const nom = nomRecherche(ind, tous)
            return (
              <div key={b} class="aide" style="margin-bottom:.4rem">
                <label>
                  <input type="checkbox" checked={b === principale || cochees.includes(b)} disabled={b === principale || !nom} onChange={() => basculerPersonne(b)} />{' '}
                  <strong><Personne d={d} id={b} annees /></strong>
                </label>{' '}{etiquetteSosa(b)}
                {!nom && <> — pas de prénom et de nom : recherche impossible</>}
                {b !== principale && <> <button type="button" class="lien" onClick={() => retirer(b)}>Retirer</button></>}
                <Deroulant titre="Proches">
                  <ul style="list-style:none;margin:0;padding:6px 10px;white-space:nowrap">
                  {proches(d, b).map((p) => {
                    const pn = nomRecherche(d.arbre.individus.get(p.id)!, tous)
                    return (
                      <li key={p.id} style="padding:3px 0">
                        <label>
                          <input type="checkbox" checked={choisies.some((c) => c.id === p.id)} disabled={!pn || p.id === principale} onChange={() => basculerPersonne(p.id)} />{' '}
                          {p.lien} : <Personne d={d} id={p.id} annees />
                        </label>{' '}{etiquetteSosa(p.id)}
                        {!blocs.includes(p.id) && <> <button type="button" class="lien" onClick={() => ajouter(p.id)}>ses proches</button></>}
                      </li>
                    )
                  })}
                </ul>
                </Deroulant>
              </div>
            )
          })}
          <div class="graphe-personne"><ChoixPersonne d={d} valeur="" choisir={ajouter} prenoms={2} /></div>
          <p class="aide">Ajouter une autre personne ci-dessus ; ses proches sont alors proposés à cocher.</p>
          <p class="aide">
            <label><input type="checkbox" checked={tous} onChange={(e) => setTous(e.currentTarget.checked)} /> avec tous les prénoms</label>
          </p>
          <p>
            <button type="button" onClick={toutOuvrir} disabled={!nbOnglets}>Tout ouvrir ({nbOnglets} onglet{nbOnglets > 1 ? 's' : ''})</button>{' '}
            <button type="button" class="lien" onClick={() => changerSources(SOURCES.map((s) => s.id))}>Tout cocher</button>{' · '}
            <button type="button" class="lien" onClick={() => changerSources([])}>Tout décocher</button>
            {bloque && <span class="aide"> Le navigateur a bloqué des onglets : autorisez les fenêtres surgissantes pour ce site, puis recommencez.</span>}
          </p>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Chercher</th><th>Base</th><th>Contenu</th></tr></thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={actives.includes(s.id)} onChange={() => basculerSource(s.id)} aria-label={'Chercher dans ' + s.nom} /></td>
                    <td><strong>{s.nom}</strong></td>
                    <td class="aide">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
