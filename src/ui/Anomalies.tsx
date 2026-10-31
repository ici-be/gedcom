// Anomalies : des dates qui se contredisent (parent trop jeune, enfant né après la mort de sa mère, mariage d'enfant…).

import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { anomalies, TYPES_ANOMALIES, type TypeAnomalie } from '../lib/anomalies'
import { encodages, TYPES_ENCODAGES, type Encodage, type TypeEncodage } from '../lib/encodages'
import { nombre } from '../lib/format'
import { ecrire, lire } from '../lib/stockage'
import { Personne, Pagination } from './commun'

const PAR_PAGE = 50
const cleE = (e: Encodage) => `E|${e.type}|${e.id ?? ''}|${e.famille ?? ''}|${e.texte}`
const cle = (a: { id: string; autre?: string; type: string; texte: string }) => `${a.id}|${a.autre ?? ''}|${a.type}|${a.texte}`

export function Anomalies({ d }: { d: Donnees }) {
  const toutes = useMemo(() => anomalies(d.arbre), [d])
  const [type, setType] = useState<TypeAnomalie | ''>('')
  const [ignorees, setIgnorees] = useState<string[]>(() => lire('anomaliesIgnorees', []))
  const [page, setPage] = useState(0)
  const changer = (l: string[]) => { setIgnorees(l); ecrire('anomaliesIgnorees', l) }
  const liste = useMemo(() => toutes.filter((a) => (!type || a.type === type) && !ignorees.includes(cle(a))), [toutes, type, ignorees])
  const pages = Math.ceil(liste.length / PAR_PAGE)

  const tousE = useMemo(() => encodages(d.arbre), [d])
  const [typeE, setTypeE] = useState<TypeEncodage | ''>('')
  const [pageE, setPageE] = useState(0)
  const listeE = useMemo(() => tousE.filter((e) => (!typeE || e.type === typeE) && !ignorees.includes(cleE(e))), [tousE, typeE, ignorees])
  // un groupe par personne (ou par famille, quand le problème ne concerne personne en particulier)
  const groupesE = useMemo(() => {
    const m = new Map<string, Encodage[]>()
    for (const e of listeE) {
      const k = e.id ?? `F|${e.famille}`
      const l = m.get(k)
      if (l) l.push(e)
      else m.set(k, [e])
    }
    return [...m.values()]
  }, [listeE])
  const concernes = (e: Encodage) => {
    if (e.id) return <Personne d={d} id={e.id} annees />
    const f = e.famille ? d.arbre.familles.get(e.famille) : undefined
    return <>{[f?.mari, f?.femme].filter((x): x is string => !!x).map((id) => <div key={id}><Personne d={d} id={id} annees /></div>)}</>
  }

  return (
    <section class="ecran">
      <header class="titre-ecran">
        <h1>Anomalies</h1>
        <p class="sous-titre">
          {liste.length
            ? `${nombre(liste.length)} incohérence${liste.length > 1 ? 's' : ''} entre des dates.`
            : 'Aucune incohérence entre les dates.'}
        </p>
      </header>
      <p class="aide">
        Sont signalés : un parent de moins de 15 ans à la naissance de l’enfant, une mère de plus de 50 ans ou un père de plus de 75 ans, un enfant né
        après la mort de sa mère (ou plus d’un an après celle de son père), un mariage avant 15 ans ou après un décès, un décès avant la naissance ou après 110 ans.
        Seules les années sont comparées ; les dates « avant » et « après » ne comptent pas. Une date juste mais rare (un veuf père à 80 ans) peut être écartée.
      </p>
      <p class="aide">
        <select value={type} onChange={(e) => { setType(e.currentTarget.value as TypeAnomalie | ''); setPage(0) }} aria-label="Type d’anomalie">
          <option value="">Tous les types</option>
          {(Object.keys(TYPES_ANOMALIES) as TypeAnomalie[]).map((k) => <option key={k} value={k}>{TYPES_ANOMALIES[k]}</option>)}
        </select>
        {ignorees.length > 0 && <> · {nombre(ignorees.length)} écartée{ignorees.length > 1 ? 's' : ''} <button type="button" class="lien" onClick={() => changer([])}>Tout réafficher</button></>}
      </p>
      <div class="tableau-conteneur">
        <table class="tableau">
          <thead><tr><th>Personne</th><th>Anomalie</th><th>Autre personne</th><th /></tr></thead>
          <tbody>
            {liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map((a) => (
              <tr key={cle(a)}>
                <td><Personne d={d} id={a.id} annees /></td>
                <td>{a.texte}<br /><span class="aide">{TYPES_ANOMALIES[a.type]}</span></td>
                <td>{a.autre && <Personne d={d} id={a.autre} annees />}</td>
                <td>
                  <button type="button" class="bouton discret" title="Cette date est juste : ne plus la signaler" onClick={() => changer([...ignorees, cle(a)])}>
                    <svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>Date juste
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} aller={setPage} />

      <header class="titre-ecran">
        <h2>Mauvais encodages</h2>
        <p class="sous-titre">
          {listeE.length
            ? `${nombre(listeE.length)} fait${listeE.length > 1 ? 's' : ''} ou lien${listeE.length > 1 ? 's' : ''} mal rangé${listeE.length > 1 ? 's' : ''}, pour ${nombre(groupesE.length)} fiche${groupesE.length > 1 ? 's' : ''}.`
            : 'Aucun fait ni lien mal rangé.'}
        </p>
      </header>
      <p class="aide">
        Sont signalés : un mariage, un divorce ou un autre fait de couple noté sur une seule personne plutôt que sur la famille ; une naissance, un décès ou un
        métier noté sur une famille ; plusieurs naissances ou décès différents pour la même personne ; une note copiée d’un autre site (balises HTML, liens et italiques wiki, « * Reference: » de MyHeritage ou Geni) ;
        une personne mari et épouse à la fois, ou parent et enfant de la même famille.
      </p>
      <p class="aide">
        <select value={typeE} onChange={(e) => { setTypeE(e.currentTarget.value as TypeEncodage | ''); setPageE(0) }} aria-label="Type de mauvais encodage">
          <option value="">Tous les types</option>
          {(Object.keys(TYPES_ENCODAGES) as TypeEncodage[]).map((k) => <option key={k} value={k}>{TYPES_ENCODAGES[k]}</option>)}
        </select>
      </p>
      {listeE.length > 0 && (
        <>
          <div class="tableau-conteneur">
            <table class="tableau">
              <thead><tr><th>Personne ou famille</th><th>Problèmes</th></tr></thead>
              <tbody>
                {groupesE.slice(pageE * PAR_PAGE, (pageE + 1) * PAR_PAGE).map((g) => (
                  <tr key={cleE(g[0])}>
                    <td class="groupe-personne">
                      {concernes(g[0])}
                      {g.length > 1 && <span class="compteur" title={`${g.length} problèmes`}>{g.length}</span>}
                    </td>
                    <td>
                      <ul class="problemes">
                        {g.map((e) => (
                          <li key={cleE(e)}>
                            <span>{e.texte}<br /><span class="aide">{TYPES_ENCODAGES[e.type]}</span></span>
                            <button type="button" class="bouton discret" title="C’est voulu : ne plus le signaler" aria-label="C’est voulu : ne plus le signaler" onClick={() => changer([...ignorees, cleE(e)])}>
                              <svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pageE} pages={Math.ceil(groupesE.length / PAR_PAGE)} aller={setPageE} />
        </>
      )}
    </section>
  )
}
