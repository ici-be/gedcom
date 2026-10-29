// Recherches externes : pour une personne choisie, des liens qui préremplissent la recherche dans des bases (livres, presse,
// archives) et, pour celles qui le permettent, le nombre de résultats. Le nom n'est envoyé à une base que si on le demande.

import { useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import { nomRecherche, SOURCES, type Source } from '../lib/recherches'
import { ChoixPersonne, Personne } from './commun'

type Resultat = number | 'erreur' | 'attente'

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
  const [resultats, setResultats] = useState<Record<string, Resultat>>({})
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

  const aller = (cible: string) => { location.hash = '#/recherches/' + encodeURIComponent(cible); setResultats({}) }
  const compter = async (s: Source, p: (typeof choisies)[number]) => {
    if (!s.compter) return
    const cle = s.id + '|' + p.id
    setResultats((r) => ({ ...r, [cle]: 'attente' }))
    let v: Resultat
    try { v = await s.compter(p.nom) } catch { v = 'erreur' }
    setResultats((r) => ({ ...r, [cle]: v }))
  }
  const compterSource = (s: Source) => choisies.forEach((p) => void compter(s, p))
  const toutCompter = () => sourcesActives.forEach(compterSource)

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
              <div key={b} class="aide" style="margin-bottom:.75rem">
                <label>
                  <input type="checkbox" checked={b === principale || cochees.includes(b)} disabled={b === principale || !nom} onChange={() => basculerPersonne(b)} />{' '}
                  <strong><Personne d={d} id={b} annees /></strong>
                </label>{' '}{etiquetteSosa(b)}
                {!nom && <> — pas de prénom et de nom : recherche impossible</>}
                {b !== principale && <> <button type="button" class="lien" onClick={() => retirer(b)}>Retirer</button></>}
                <ul style="list-style:none;margin:.25rem 0 0 1.5rem;padding:0">
                  {proches(d, b).map((p) => {
                    const pn = nomRecherche(d.arbre.individus.get(p.id)!, tous)
                    return (
                      <li key={p.id}>
                        <label>
                          <input type="checkbox" checked={choisies.some((c) => c.id === p.id)} disabled={!pn || p.id === principale} onChange={() => basculerPersonne(p.id)} />{' '}
                          {p.lien} : <Personne d={d} id={p.id} annees />
                        </label>{' '}{etiquetteSosa(p.id)}
                        {!blocs.includes(p.id) && <> <button type="button" class="lien" onClick={() => ajouter(p.id)}>ses proches</button></>}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          <div class="graphe-personne"><ChoixPersonne d={d} valeur="" choisir={ajouter} prenoms={2} /></div>
          <p class="aide">Ajouter une autre personne ci-dessus ; ses proches sont alors proposés à cocher.</p>
          <p class="aide">
            <label><input type="checkbox" checked={tous} onChange={(e) => { setTous(e.currentTarget.checked); setResultats({}) }} /> avec tous les prénoms</label>
          </p>
          <p class="aide">
            Les nombres ne sont demandés qu’à votre clic : les noms sont alors envoyés à la base interrogée.
            Les homonymes et les graphies anciennes (Veyckemans, Veyckmans…) ne sont pas distingués ; un nombre dit où regarder, pas qui est qui.{' '}
            <button type="button" class="lien" onClick={toutCompter}>Compter partout</button>
          </p>
          <p>
            <button type="button" onClick={toutOuvrir} disabled={!nbOnglets}>Tout ouvrir ({nbOnglets} onglet{nbOnglets > 1 ? 's' : ''})</button>{' '}
            <button type="button" class="lien" onClick={() => changerSources(SOURCES.map((s) => s.id))}>Tout cocher</button>{' · '}
            <button type="button" class="lien" onClick={() => changerSources([])}>Tout décocher</button>
            {bloque && <span class="aide"> Le navigateur a bloqué des onglets : autorisez les fenêtres surgissantes pour ce site, puis recommencez.</span>}
          </p>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Chercher</th><th>Base</th><th>Contenu</th><th>Résultats</th></tr></thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={actives.includes(s.id)} onChange={() => basculerSource(s.id)} aria-label={'Chercher dans ' + s.nom} /></td>
                    <td><strong>{s.nom}</strong></td>
                    <td class="aide">{s.detail}</td>
                    <td>
                      {!s.compter ? <span class="aide">à voir sur place</span> : (
                        <>
                          {choisies.map((p) => {
                            const r = resultats[s.id + '|' + p.id]
                            const v = r === 'attente' ? '…'
                              : r === 'erreur' ? <span class="aide">indisponible</span>
                              : typeof r === 'number' ? nombre(r)
                              : <button type="button" class="lien" onClick={() => compter(s, p)}>Compter</button>
                            return <div key={p.id}>{choisies.length > 1 && <span class="aide">{p.nom.prenom} : </span>}{v}</div>
                          })}
                        </>
                      )}
                    </td>
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
