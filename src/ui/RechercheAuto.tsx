// Recherche automatique : pour chaque personne de la liste, les actes trouvés dans les index d'Open Archives
// (un par fait daté) et les mentions du nom dans les bases qui répondent directement. Rien ne part avant le clic.

import { useEffect, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import type { Individu } from '../lib/gedcom/arbre'
import { comparerSosa } from '../lib/parente'
import { nomRecherche } from '../lib/recherches'
import { MOTEURS, chercherActe, faitsCherches, titreFait, type Candidat, type FaitCherche, type Reponse } from '../lib/recherche-auto'
import { Personne } from './commun'

interface ResultatActe { fait: FaitCherche; candidats?: Candidat[]; complet?: boolean; erreur?: string }
interface ResultatMoteur { id: string; reponse?: Reponse; erreur?: string }
interface Resultats { actes: ResultatActe[]; moteurs: ResultatMoteur[]; fini: boolean }

/** Ancêtres ajoutés d'un coup à la liste */
const LOT = 20

const message = (e: unknown) => (e instanceof TypeError ? 'la base ne répond pas' : e instanceof Error ? e.message : String(e))

export function RechercheAuto({ d, liste, tousPrenoms, ajouter }: { d: Donnees; liste: string[]; tousPrenoms: boolean; ajouter: (ids: string[]) => void }) {
  const [resultats, setResultats] = useState<Map<string, Resultats>>(new Map())
  const [enCours, setEnCours] = useState(false)
  const [aSourcer, setASourcer] = useState(false)
  const [livres, setLivres] = useState(true)
  const arret = useRef<AbortController | null>(null)
  useEffect(() => () => arret.current?.abort(), [])

  const lancer = async () => {
    const controle = new AbortController()
    arret.current = controle
    setEnCours(true)
    const tout = new Map(resultats)
    const publier = (id: string, r: Resultats) => { tout.set(id, { ...r }); setResultats(new Map(tout)) }
    try {
      for (const id of liste) {
        const ind = d.arbre.individus.get(id)
        if (!ind || tout.get(id)?.fini) continue
        const r: Resultats = { actes: faitsCherches(d, ind).filter((f) => !aSourcer || f.aSourcer).map((fait) => ({ fait })), moteurs: [], fini: false }
        publier(id, r)
        for (const a of r.actes) {
          try { Object.assign(a, await chercherActe(ind, a.fait, controle.signal)) } catch (e) {
            if (controle.signal.aborted) throw e
            a.erreur = message(e)
          }
          publier(id, r)
        }
        const nom = nomRecherche(ind, tousPrenoms)
        if (livres && nom) {
          r.moteurs = await Promise.all(MOTEURS.map(async (m) => {
            try { return { id: m.id, reponse: await m.chercher(nom, controle.signal) } } catch (e) { return { id: m.id, erreur: message(e) } }
          }))
          if (controle.signal.aborted) throw controle.signal.reason
        }
        r.fini = true
        publier(id, r)
      }
    } catch { /* arrêté : ce qui est trouvé reste affiché */ }
    setEnCours(false)
  }

  /** Les prochains ancêtres (par numéro Sosa) qui ont un fait daté sans source et ne sont pas encore dans la liste */
  const suivants = () => {
    const ids: string[] = []
    const anc = [...d.ancetres.values()].sort((a, b) => comparerSosa(a.sosa, b.sosa))
    for (const a of anc) {
      if (ids.length >= LOT) break
      const ind = d.arbre.individus.get(a.id)
      if (ind && !liste.includes(a.id) && ind.nom && ind.prenom && faitsCherches(d, ind).some((f) => f.aSourcer)) ids.push(a.id)
    }
    return ids
  }

  const faits = liste.filter((id) => resultats.has(id))
  const restants = liste.filter((id) => !resultats.get(id)?.fini).length

  return (
    <div class="panneau rch-auto">
      <div class="rch-entete">
        <h2>Recherche automatique</h2>
        <span class="rch-option">
          <label><input type="checkbox" checked={aSourcer} onChange={(e) => setASourcer(e.currentTarget.checked)} /> faits sans source seulement</label>{' · '}
          <label><input type="checkbox" checked={livres} onChange={(e) => setLivres(e.currentTarget.checked)} /> livres et documents</label>
        </span>
      </div>
      <p class="aide">
        Pour chaque personne de la liste, cherche l'acte de chaque fait daté (naissance, mariage, décès) dans{' '}
        <a href="https://www.openarchieven.nl/?lang=fr" target="_blank" rel="noopener noreferrer">Open Archives</a>, qui réunit les index des Archives de l'État en Belgique
        et des archives néerlandaises, en essayant les formes latines et flamandes du prénom (« Petrus » pour Pierre) ; puis compte les mentions du nom dans
        Internet Archive, Wikisource et Europeana. Les noms ne sont envoyés à ces sites qu'au clic sur « Chercher ».
      </p>
      <p class="aide">Pour tout l'arbre d'un coup, avec mémoire de ce qui est trouvé{'\u202f'}: <a href="#/serie">recherche en série ›</a></p>
      <div class="rch-auto-actions">
        <button type="button" class="bouton principal" disabled={enCours || !restants} onClick={lancer}>
          {enCours ? 'Recherche en cours…' : restants ? `Chercher (${restants} personne${restants > 1 ? 's' : ''})` : 'Tout est cherché'}
        </button>
        {enCours && <button type="button" class="bouton discret" onClick={() => arret.current?.abort()}>Arrêter</button>}
        <button type="button" class="bouton discret" disabled={enCours} title="Par numéro Sosa, ceux qui ont un fait daté sans source" onClick={() => ajouter(suivants())}>
          + {LOT} ancêtres à sourcer
        </button>
        {faits.length > 0 && !enCours && <button type="button" class="lien" onClick={() => setResultats(new Map())}>Effacer les résultats</button>}
      </div>

      {faits.map((id) => {
        const r = resultats.get(id)!
        const ind = d.arbre.individus.get(id) as Individu
        const nom = nomRecherche(ind, tousPrenoms)
        const trouves = r.actes.reduce((n, a) => n + (a.candidats?.length ?? 0), 0)
        return (
          <section key={id} class="rch-resultat">
            <h3>
              <Personne d={d} id={id} annees />
              {r.fini ? <span class={'rch-compte' + (trouves ? '' : ' vide')}>{trouves} acte{trouves > 1 ? 's' : ''}</span> : <span class="rouet" role="status" aria-label="Recherche en cours" />}
            </h3>
            {r.actes.length > 0 && (
              <ul class="rch-faits">
                {r.actes.map((a, i) => (
                  <li key={i}>
                    <span class="rch-fait">{titreFait(a.fait)}{a.fait.aSourcer && <span class="rch-a-sourcer">à sourcer</span>}</span>
                    {a.erreur ? <span class="avertissement">{a.erreur}</span>
                      : !a.candidats ? <span class="vide">…</span>
                      : !a.candidats.length ? <span class="vide">rien dans l'index{a.complet === false && ' (nom trop répandu : toutes les lignes n’ont pas été lues)'}</span>
                      : (
                        <ul class="rch-candidats">
                          {a.candidats.slice(0, 5).map((c) => (
                            <li key={c.url}>
                              <a href={c.url} target="_blank" rel="noopener noreferrer">{c.titre}</a>
                              {c.dateExacte && <span class="rch-marque">même date</span>}
                              {c.memeLieu && <span class="rch-marque">même lieu</span>}
                              <span class="rch-detail">{c.detail}</span>
                            </li>
                          ))}
                          {a.candidats.length > 5 && <li class="vide">et {a.candidats.length - 5} autre{a.candidats.length > 6 ? 's' : ''}</li>}
                        </ul>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {!r.actes.length && <p class="vide">Aucun fait daté à chercher dans les index.</p>}
            {r.moteurs.length > 0 && nom && (
              <ul class="rch-moteurs">
                {r.moteurs.map((m) => {
                  const moteur = MOTEURS.find((x) => x.id === m.id)!
                  return (
                    <li key={m.id}>
                      <a class="rch-moteur" href={moteur.page(nom)} target="_blank" rel="noopener noreferrer">{moteur.nom}</a>{' '}
                      {m.erreur ? <span class="avertissement">{m.erreur}</span> : <strong>{m.reponse!.total.toLocaleString('fr-BE')}</strong>}
                      {m.reponse && m.reponse.resultats.length > 0 && (
                        <ul>
                          {m.reponse.resultats.slice(0, 3).map((x) => (
                            <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer">{x.titre}</a>{x.detail && <span class="rch-detail"> {x.detail}</span>}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
