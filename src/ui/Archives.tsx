// Plan de visite d'archives : les actes à lever dans les communes choisies, registre par registre et année par année, à imprimer.

import { Fragment } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { membres, type Donnees, type Perimetre } from '../lib/donnees'
import { communes, GROUPES, type Groupe } from '../lib/communes'
import { anneeActe, planArchives } from '../lib/plan-archives'
import { libelle, nombre } from '../lib/format'
import { telecharger, versCsv } from '../lib/csv'
import { nomComplet } from '../lib/parente'
import { ecrire, lire } from '../lib/stockage'
import { ChoixPerimetre, Personne, normaliser } from './commun'

const numero = (s: string): number | undefined => {
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : undefined
}

export function Archives({ d, perimetre, setPerimetre }: { d: Donnees; perimetre: Perimetre; setPerimetre: (p: Perimetre) => void }) {
  const [choisis, setChoisis] = useState<string[]>(() => lire('planLieux', []))
  const [de, setDe] = useState<string>(() => lire('planDe', ''))
  const [a, setA] = useState<string>(() => lire('planA', ''))
  const [groupes, setGroupes] = useState<Groupe[]>(() => lire('planGroupes', ['naissances', 'mariages', 'deces']))
  const [sansDate, setSansDate] = useState(() => lire('planSansDate', true))
  const [masquer, setMasquer] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [faits, setFaits] = useState<string[]>(() => lire('faits', []))
  useEffect(() => ecrire('planLieux', choisis), [choisis])
  useEffect(() => ecrire('planDe', de), [de])
  useEffect(() => ecrire('planA', a), [a])
  useEffect(() => ecrire('planGroupes', groupes), [groupes])
  useEffect(() => ecrire('planSansDate', sansDate), [sansDate])

  const toutes = useMemo(() => communes(d.arbre, membres(d, perimetre), false), [d, perimetre])
  const coches = useMemo(() => new Set(faits), [faits])
  const lieux = useMemo(() => new Set(choisis), [choisis])
  const plan = useMemo(() => planArchives(toutes, {
    lieux, de: numero(de), a: numero(a), groupes: new Set(groupes), sansDate, trouves: masquer ? coches : new Set(),
  }), [toutes, lieux, de, a, groupes, sansDate, masquer, coches])
  const total = plan.reduce((n, p) => n + p.total, 0)

  // la liste des communes à cocher : celles où il reste des actes à chercher
  const candidates = useMemo(() => {
    const mots = normaliser(recherche).split(/\s+/).filter(Boolean)
    return toutes
      .filter((c) => c.sansSource > 0 && mots.every((m) => normaliser(c.lieu).includes(m)))
      .sort((x, y) => y.sansSource - x.sansSource || x.nom.localeCompare(y.nom, 'fr'))
  }, [toutes, recherche])

  const basculer = (lieu: string, oui: boolean) => setChoisis(oui ? [...choisis, lieu] : choisis.filter((x) => x !== lieu))
  const cocher = (cle: string, oui: boolean) => {
    const n = oui ? [...faits, cle] : faits.filter((x) => x !== cle)
    setFaits(n)
    ecrire('faits', n)
  }
  const nomsPersonnes = (ids: string[]) => ids.map((p) => { const i = d.arbre.individus.get(p); return i ? nomComplet(i) : '?' }).join(' & ')

  const exporter = () => {
    telecharger('plan-archives.csv', versCsv([
      ['Commune', 'Registre', 'Année', 'Date', 'Type', 'Personne(s)', 'Trouvé'],
      ...plan.flatMap((p) => p.registres.flatMap((r) => r.actes.map((x) => [
        p.commune.nom, r.titre, anneeActe(x) ?? '', x.evenement.date?.texte ?? '', libelle(x.evenement), nomsPersonnes(x.personnes), coches.has(x.cle) ? 'oui' : '',
      ]))),
    ]))
  }

  return (
    <section class="ecran plan-archives">
      <header class="titre-ecran">
        <h1>Plan de visite d’archives</h1>
        <p class="sous-titre">Choisissez les communes et la période : le plan liste, registre par registre et année par année, les actes à lever.</p>
      </header>

      <div class="filtres plan-reglages">
        <ChoixPerimetre valeur={perimetre} changer={setPerimetre} />
        <label>
          <span>De (année)</span>
          <input type="number" inputMode="numeric" value={de} onInput={(e) => setDe(e.currentTarget.value)} placeholder="ex. 1700" />
        </label>
        <label>
          <span>À (année)</span>
          <input type="number" inputMode="numeric" value={a} onInput={(e) => setA(e.currentTarget.value)} placeholder="ex. 1800" />
        </label>
        {GROUPES.map((g) => (
          <label key={g.id} class="case">
            <input type="checkbox" checked={groupes.includes(g.id)} onChange={(e) => setGroupes(e.currentTarget.checked ? [...groupes, g.id] : groupes.filter((x) => x !== g.id))} />
            <span>{g.titre}</span>
          </label>
        ))}
        <label class="case">
          <input type="checkbox" checked={sansDate} onChange={(e) => setSansDate(e.currentTarget.checked)} />
          <span>Garder les faits sans date</span>
        </label>
        <label class="case">
          <input type="checkbox" checked={masquer} onChange={(e) => setMasquer(e.currentTarget.checked)} />
          <span>Masquer ce que j’ai coché</span>
        </label>
      </div>

      <details class="plan-communes" open={!choisis.length}>
        <summary><strong>{nombre(choisis.length)}</strong> commune{choisis.length > 1 ? 's' : ''} choisie{choisis.length > 1 ? 's' : ''} sur {nombre(candidates.length)} avec des actes à chercher</summary>
        <div class="filtres">
          <label>
            <span>Chercher une commune</span>
            <input type="search" value={recherche} onInput={(e) => setRecherche(e.currentTarget.value)} placeholder="ex. Ath" />
          </label>
          <button type="button" class="bouton discret" onClick={() => setChoisis([...new Set([...choisis, ...candidates.map((c) => c.lieu)])])} disabled={!candidates.length}>Tout choisir</button>
          <button type="button" class="bouton discret" onClick={() => setChoisis([])} disabled={!choisis.length}>Tout décocher</button>
        </div>
        <ul class="liste-cases">
          {candidates.slice(0, 300).map((c) => (
            <li key={c.lieu}>
              <label class="case">
                <input type="checkbox" checked={lieux.has(c.lieu)} onChange={(e) => basculer(c.lieu, e.currentTarget.checked)} />
                <span>{c.nom}{c.contexte && <span class="contexte"> {c.contexte}</span>} <span class="compte">{nombre(c.sansSource)}</span></span>
              </label>
            </li>
          ))}
        </ul>
        {candidates.length > 300 && <p class="aide">Les 300 premières communes : précisez la recherche pour voir les autres.</p>}
      </details>

      <div class="barre-resultats">
        <span><strong>{nombre(total)}</strong> acte{total > 1 ? 's' : ''} à chercher dans {nombre(plan.length)} commune{plan.length > 1 ? 's' : ''}</span>
        <span class="actions">
          <button type="button" class="bouton discret" onClick={exporter} disabled={!total}>Exporter en CSV</button>
          <button type="button" class="bouton discret" onClick={() => window.print()} disabled={!total}>Imprimer</button>
        </span>
      </div>

      {!choisis.length && <p class="aucun">Choisissez au moins une commune ci-dessus.</p>}
      {choisis.length > 0 && !plan.length && <p class="aucun">Rien à chercher pour ce choix. 🎉</p>}

      {plan.map((p) => (
        <section key={p.commune.lieu} class="groupe plan-commune">
          <h2>
            <a href={'#/lieux/' + encodeURIComponent(p.commune.lieu)}>{p.commune.nom}</a>
            {p.commune.contexte && <span class="contexte">{p.commune.contexte}</span>}
            <span class="compte">{p.total}</span>
          </h2>
          {p.registres.map((r) => (
            <div key={r.groupe} class="siecle plan-registre">
              <h3>{r.titre} <span class="compte">{r.actes.length}</span></h3>
              <p class="aide">
                {r.annees && <>Années : {r.annees}</>}
                {r.annees && r.sansDate > 0 && ' · '}
                {r.sansDate > 0 && `${r.sansDate} sans date`}
              </p>
              <ul class="actes">
                {r.actes.map((x) => (
                  <li key={x.cle} class={coches.has(x.cle) ? 'coche' : ''}>
                    <input type="checkbox" checked={coches.has(x.cle)} onChange={(e) => cocher(x.cle, e.currentTarget.checked)} aria-label="Trouvé" />
                    <span class="annee">{anneeActe(x) ?? '?'}</span>
                    <span class="date">{x.evenement.date?.texte || 'date inconnue'}</span>
                    <span class="type">{libelle(x.evenement)}</span>
                    <span class="qui">
                      {x.personnes.map((id, i) => <Fragment key={id}>{i > 0 && ' & '}<Personne d={d} id={id} annees /></Fragment>)}
                    </span>
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
