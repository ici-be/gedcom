// Anomalies : des dates qui se contredisent (parent trop jeune, enfant né après la mort de sa mère, mariage d'enfant…).

import { useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { anomalies, TYPES_ANOMALIES, type TypeAnomalie } from '../lib/anomalies'
import { encodages, TYPES_ENCODAGES, type Encodage, type TypeEncodage } from '../lib/encodages'
import { lieuxAVerifier, RAISONS_VARIANTES } from '../lib/lieux-variantes'
import { telecharger, versCsv } from '../lib/csv'
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

  const [lieuxEcartes, setLieuxEcartes] = useState<string[]>(() => lire('lieuxEcartes', []))
  const [pageL, setPageL] = useState(0)
  const groupesL = useMemo(() => lieuxAVerifier(d.arbre, new Set(lieuxEcartes)), [d, lieuxEcartes])
  const changerL = (l: string[]) => { setLieuxEcartes(l); ecrire('lieuxEcartes', l) }
  const exporterL = () => telecharger('lieux-a-normaliser.csv', versCsv([
    ['Forme à garder', 'Forme à remplacer', 'Faits'],
    ...groupesL.flatMap((g) => g.variantes.slice(1).map((v) => [g.suggestion, v.lieu, v.faits])),
  ]))

  const coche = <svg class="icone-bouton" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" /></svg>
  const pluriel = (n: number, un: string, plus = un + 's') => `${nombre(n)} ${n > 1 ? plus : un}`
  const tuiles: { id: string; titre: string; n: number; detail: string }[] = [
    { id: 'an-dates', titre: 'Dates incohérentes', n: toutes.length, detail: 'parents trop jeunes, décès avant naissance…' },
    { id: 'an-encodages', titre: 'Mauvais encodages', n: groupesE.length, detail: `${pluriel(listeE.length, 'problème')} sur ${pluriel(groupesE.length, 'fiche')}` },
    { id: 'an-lieux', titre: 'Lieux à normaliser', n: groupesL.length, detail: 'même lieu écrit de plusieurs façons' },
  ]

  return (
    <section class="ecran anomalies">
      <header class="titre-ecran">
        <h1>Anomalies</h1>
        <p class="sous-titre">Ce qui se contredit ou semble mal rangé dans l’arbre, à corriger sur l’arbre en ligne puis à recharger ici.</p>
      </header>

      <nav class="an-tuiles" aria-label="Aller à une section">
        {tuiles.map((t) => (
          <a key={t.id} href={'#' + t.id} class={t.n ? 'an-tuile' : 'an-tuile ok'} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            <strong>{nombre(t.n)}</strong>
            <span class="an-tuile-titre">{t.titre}</span>
            <span class="aide">{t.n ? t.detail : 'Rien à signaler'}</span>
          </a>
        ))}
      </nav>

      <section class="an-section" id="an-dates">
        <div class="an-entete">
          <h2>Dates incohérentes <span class={liste.length ? 'compte' : 'compte ok'}>{nombre(liste.length)}</span></h2>
          <select value={type} onChange={(e) => { setType(e.currentTarget.value as TypeAnomalie | ''); setPage(0) }} aria-label="Type d’anomalie">
            <option value="">Tous les types</option>
            {(Object.keys(TYPES_ANOMALIES) as TypeAnomalie[]).map((k) => <option key={k} value={k}>{TYPES_ANOMALIES[k]}</option>)}
          </select>
        </div>
        <details class="an-aide">
          <summary>Ce qui est signalé</summary>
          <p>
            Un parent de moins de 15 ans à la naissance de l’enfant, une mère de plus de 50 ans ou un père de plus de 75 ans, un enfant né
            après la mort de sa mère (ou plus d’un an après celle de son père), un mariage avant 15 ans ou après un décès, un décès avant la naissance ou après 110 ans.
            Seules les années sont comparées ; les dates « avant » et « après » ne comptent pas. Une date juste mais rare (un veuf père à 80 ans) peut être écartée.
          </p>
        </details>
        {ignorees.length > 0 && <p class="an-ecartes">{pluriel(ignorees.length, 'élément écarté', 'éléments écartés')} <button type="button" class="lien" onClick={() => changer([])}>Tout réafficher</button></p>}
        {liste.length === 0 && <p class="an-vide">Aucune incohérence entre les dates.</p>}
        <ul class="an-lignes">
          {liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE).map((a) => (
            <li key={cle(a)}>
              <div class="an-qui">
                <Personne d={d} id={a.id} annees />
                {a.autre && <span class="an-autre"><span class="aide">avec</span> <Personne d={d} id={a.autre} annees /></span>}
              </div>
              <div class="an-quoi">
                <span class="an-type">{TYPES_ANOMALIES[a.type]}</span>
                <span>{a.texte}</span>
              </div>
              <button type="button" class="bouton discret" title="Cette date est juste : ne plus la signaler" onClick={() => changer([...ignorees, cle(a)])}>{coche}Date juste</button>
            </li>
          ))}
        </ul>
        <Pagination page={page} pages={pages} aller={setPage} />
      </section>

      <section class="an-section" id="an-encodages">
        <div class="an-entete">
          <h2>Mauvais encodages <span class={groupesE.length ? 'compte' : 'compte ok'}>{nombre(groupesE.length)}</span></h2>
          <select value={typeE} onChange={(e) => { setTypeE(e.currentTarget.value as TypeEncodage | ''); setPageE(0) }} aria-label="Type de mauvais encodage">
            <option value="">Tous les types</option>
            {(Object.keys(TYPES_ENCODAGES) as TypeEncodage[]).map((k) => <option key={k} value={k}>{TYPES_ENCODAGES[k]}</option>)}
          </select>
        </div>
        <details class="an-aide">
          <summary>Ce qui est signalé</summary>
          <p>
            Un mariage, un divorce ou un autre fait de couple noté sur une seule personne plutôt que sur la famille ; une naissance, un décès ou un
            métier noté sur une famille ; plusieurs naissances ou décès différents pour la même personne ; un nom ou un prénom écrit tout en majuscules ; une note copiée d’un autre site (balises HTML, liens et italiques wiki, « * Reference: » de MyHeritage ou Geni) ;
            une personne mari et épouse à la fois, ou parent et enfant de la même famille.
          </p>
        </details>
        {groupesE.length === 0 && <p class="an-vide">Aucun fait ni lien mal rangé.</p>}
        <ul class="an-lignes">
          {groupesE.slice(pageE * PAR_PAGE, (pageE + 1) * PAR_PAGE).map((g) => (
            <li key={cleE(g[0])}>
              <div class="an-qui">
                {concernes(g[0])}
                {g.length > 1 && <span class="compteur" title={`${g.length} problèmes`}>{g.length}</span>}
              </div>
              <ul class="an-quoi problemes">
                {g.map((e) => (
                  <li key={cleE(e)}>
                    <span><span class="an-type">{TYPES_ENCODAGES[e.type]}</span><span>{e.texte}</span></span>
                    <button type="button" class="bouton discret" title="C’est voulu : ne plus le signaler" aria-label="C’est voulu : ne plus le signaler" onClick={() => changer([...ignorees, cleE(e)])}>{coche}</button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <Pagination page={pageE} pages={Math.ceil(groupesE.length / PAR_PAGE)} aller={setPageE} />
      </section>

      <section class="an-section" id="an-lieux">
        <div class="an-entete">
          <h2>Lieux à normaliser <span class={groupesL.length ? 'compte' : 'compte ok'}>{nombre(groupesL.length)}</span></h2>
          <button type="button" class="bouton discret" onClick={exporterL} disabled={!groupesL.length}>Exporter en CSV</button>
        </div>
        <details class="an-aide">
          <summary>Ce qui est signalé</summary>
          <p>
            Les lieux qui ne diffèrent que par les majuscules, les accents, les tirets, « St » pour « Saint », une province ou un pays écrit autrement ou absent,
            le nom français ou néerlandais d’une commune belge (Mons, Bergen), ou une lettre de trop ou de moins dans un nom de 6 lettres ou plus
            (à vérifier : deux villages voisins peuvent n’avoir qu’une lettre d’écart). Un lieu avec hameau ou adresse n’est jamais rapproché d’un autre.
            La forme proposée est la plus employée ; corrigez les autres sur l’arbre en ligne, puis chargez un nouvel export.
          </p>
        </details>
        {lieuxEcartes.length > 0 && <p class="an-ecartes">{pluriel(lieuxEcartes.length, 'groupe écarté', 'groupes écartés')} <button type="button" class="lien" onClick={() => changerL([])}>Tout réafficher</button></p>}
        {groupesL.length === 0 && <p class="an-vide">Aucun lieu écrit de plusieurs façons.</p>}
        <ul class="an-lignes">
          {groupesL.slice(pageL * PAR_PAGE, (pageL + 1) * PAR_PAGE).map((g) => (
            <li key={g.cle}>
              <div class="an-qui">
                <span class="an-garder">À garder</span>
                <a href={'#/lieux/' + encodeURIComponent(g.suggestion)}>{g.suggestion}</a>
                <span class="aide">{pluriel(g.variantes[0].faits, 'fait')}</span>
              </div>
              <div class="an-quoi">
                <span class="an-type">{g.raisons.map((r) => RAISONS_VARIANTES[r]).join(' · ')}</span>
                <ul class="an-variantes">
                  {g.variantes.slice(1).map((v) => (
                    <li key={v.lieu}><span class="an-fleche" aria-hidden="true">→</span> <a href={'#/lieux/' + encodeURIComponent(v.lieu)}>{v.lieu}</a> <span class="aide">{pluriel(v.faits, 'fait')}</span></li>
                  ))}
                </ul>
              </div>
              <button type="button" class="bouton discret" title="Ce sont bien des lieux différents : ne plus les rapprocher" onClick={() => changerL([...lieuxEcartes, g.cle])}>{coche}Lieux différents</button>
            </li>
          ))}
        </ul>
        <Pagination page={pageL} pages={Math.ceil(groupesL.length / PAR_PAGE)} aller={setPageL} />
      </section>
    </section>
  )
}
