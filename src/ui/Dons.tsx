// Page /print/ : proposer un don à une association (une carte, à la fin de l'impression ou depuis le menu), et déclarer ce qu'on a donné.

import { useEffect, useRef, useState } from 'preact/hooks'
import { ASSOCIATIONS, MENTION_FISCALE, URL_COMPTEUR, declarerDon, lireTotal, type TotalDons } from '../lib/dons'
import { nombre } from '../lib/format'

function Coeur() {
  return <svg class="coeur" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s-5.5-3.4-5.5-7.4A3 3 0 0 1 8 5a3 3 0 0 1 5.5 1.6C13.5 10.6 8 14 8 14z" /></svg>
}

export function BoutonDons({ ouvrir }: { ouvrir: () => void }) {
  return <button type="button" class="bouton-dons" onClick={ouvrir}><Coeur />Soutenir une association</button>
}

function Declaration({ onDeclare }: { onDeclare: () => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [montant, setMontant] = useState('')
  const [asso, setAsso] = useState(ASSOCIATIONS[0].nom)
  const [envoi, setEnvoi] = useState<'' | 'en-cours' | 'ok' | 'echec'>('')
  const valider = async (e: Event) => {
    e.preventDefault()
    const m = Math.round(Number(montant.replace(',', '.')))
    if (!(m >= 1 && m <= 10000)) return
    setEnvoi('en-cours')
    const ok = await declarerDon(asso, m)
    setEnvoi(ok ? 'ok' : 'echec')
    if (ok) { setOuvert(false); setMontant(''); onDeclare() }
  }
  return (
    <div class="dons-declaration">
      {envoi === 'ok' && <p class="dons-merci" role="status">Merci, c’est ajouté.</p>}
      {!ouvert
        ? <button type="button" class="lien" onClick={() => { setOuvert(true); setEnvoi('') }}>J’ai donné</button>
        : (
          <form class="dons-formulaire" onSubmit={valider}>
            <label for="don-montant">Montant (€)</label>
            <input id="don-montant" type="number" min="1" max="10000" step="1" inputMode="numeric" required placeholder="20" value={montant} onInput={(e) => setMontant(e.currentTarget.value)} />
            <label for="don-asso">À</label>
            <select id="don-asso" value={asso} onChange={(e) => setAsso(e.currentTarget.value)}>
              {ASSOCIATIONS.map((a) => <option key={a.nom} value={a.nom}>{a.nom}</option>)}
            </select>
            <button type="submit" class="bouton" disabled={envoi === 'en-cours'}>Ajouter au total</button>
            {envoi === 'echec' && <p class="erreur" role="alert">L’envoi n’a pas abouti, réessayez plus tard.</p>}
            <p class="aide">Seuls le montant et l’association sont envoyés, jamais votre arbre ni votre nom. Le total est déclaratif : rien n’est vérifié.</p>
          </form>
        )}
    </div>
  )
}

export function CarteDons({ fermer, apresImpression }: { fermer: () => void; apresImpression: boolean }) {
  const [total, setTotal] = useState<TotalDons | null>(null)
  const carte = useRef<HTMLDivElement>(null)
  const recharger = () => { lireTotal().then(setTotal) }
  useEffect(() => {
    recharger()
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer() }
    addEventListener('keydown', echap)
    carte.current?.focus()
    return () => removeEventListener('keydown', echap)
  }, [])
  return (
    <div class="dons-carte" role="dialog" aria-label="Soutenir une association" tabIndex={-1} ref={carte}>
      <button type="button" class="dons-fermer" aria-label="Fermer" onClick={fermer}>×</button>
      <h2><Coeur />{apresImpression ? 'Votre feuille est imprimée ?' : 'Un don, si vous le souhaitez'}</h2>
      <p class="aide">Lignées est gratuit. S’il vous a servi, pensez à l’une de ces associations.{MENTION_FISCALE && ' ' + MENTION_FISCALE}</p>
      <ul class="dons-assos">
        {ASSOCIATIONS.map((a) => (
          <li key={a.nom}>
            <div><b>{a.nom}</b><span class="aide">{a.resume}</span></div>
            <div class="dons-liens">
              <a class="bouton principal" href={a.don} target="_blank" rel="noopener noreferrer">Faire un don</a>
              <a class="lien" href={a.site} target="_blank" rel="noopener noreferrer">Le site</a>
              <a class="lien" href={a.donorinfo} target="_blank" rel="noopener noreferrer">DonorInfo</a>
            </div>
          </li>
        ))}
      </ul>
      {URL_COMPTEUR && (
        <div class="dons-compteur">
          {total && <p class="dons-total"><b>{nombre(total.dons)}</b> don{total.dons > 1 ? 's' : ''} déclaré{total.dons > 1 ? 's' : ''} · <b>{nombre(total.total)} €</b></p>}
          <Declaration onDeclare={recharger} />
        </div>
      )}
    </div>
  )
}
