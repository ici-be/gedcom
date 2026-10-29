// Page /print/ : proposer un don à une association (une carte, à la fin de l'impression ou depuis le menu), et déclarer ce qu'on a donné.

import { useEffect, useRef, useState } from 'preact/hooks'
import { ASSOCIATIONS, MENTION_FISCALE, URL_COMPTEUR, declarerDon, lireTotal, type TotalDons } from '../lib/dons'
import { nombre } from '../lib/format'
import { t } from '../lib/i18n'

function Coeur() {
  return <svg class="coeur" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14s-5.5-3.4-5.5-7.4A3 3 0 0 1 8 5a3 3 0 0 1 5.5 1.6C13.5 10.6 8 14 8 14z" /></svg>
}

export function BoutonDons({ ouvrir }: { ouvrir: () => void }) {
  return <button type="button" class="bouton-dons" onClick={ouvrir}><Coeur />{t('Soutenir une association')}</button>
}

/** Valeur enregistrée dans la feuille quand le don va ailleurs */
const AUTRE = 'Autre'

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
      {envoi === 'ok' && <p class="dons-merci" role="status">{t('Merci, c’est ajouté.')}</p>}
      {!ouvert
        ? <button type="button" class="lien" onClick={() => { setOuvert(true); setEnvoi('') }}>{t('J’ai donné')}</button>
        : (
          <form class="dons-formulaire" onSubmit={valider}>
            <label for="don-montant">{t('Montant (€)')}</label>
            <input id="don-montant" type="number" min="1" max="10000" step="1" inputMode="numeric" required placeholder="5" value={montant} onInput={(e) => setMontant(e.currentTarget.value)} />
            <label for="don-asso">{t('À')}</label>
            <select id="don-asso" value={asso} onChange={(e) => setAsso(e.currentTarget.value)}>
              {ASSOCIATIONS.map((a) => <option key={a.nom} value={a.nom}>{a.nom}</option>)}
              <option value={AUTRE}>{t('Une autre association de mon choix')}</option>
            </select>
            <button type="submit" class="bouton" disabled={envoi === 'en-cours'}>{t('Ajouter au total')}</button>
            {envoi === 'echec' && <p class="erreur" role="alert">{t('L’envoi n’a pas abouti, réessayez plus tard.')}</p>}
            <p class="aide">{t('Seuls le montant et l’association sont envoyés, jamais votre arbre ni votre nom. Le total est déclaratif : rien n’est vérifié.')}</p>
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
    <div class="dons-carte" role="dialog" aria-label={t('Soutenir une association')} tabIndex={-1} ref={carte}>
      <button type="button" class="dons-fermer" aria-label={t('Fermer')} onClick={fermer}>×</button>
      <h2><Coeur />{apresImpression ? t('Votre feuille est imprimée ?') : t('Un don, si vous le souhaitez')}</h2>
      <p class="aide">{t('Lignées est gratuit. S’il vous a servi, pensez à l’une de ces associations.')}{MENTION_FISCALE && ' ' + t(MENTION_FISCALE)}</p>
      <ul class="dons-assos">
        {ASSOCIATIONS.map((a) => (
          <li key={a.nom}>
            <div><b>{a.nom}</b><span class="aide">{t(a.resume)}</span></div>
            <div class="dons-liens">
              <a class="bouton principal" href={a.don} target="_blank" rel="noopener noreferrer">{t('Faire un don')}</a>
              <a class="lien" href={a.site} target="_blank" rel="noopener noreferrer">{t('Le site')}</a>
              <a class="lien" href={a.donorinfo} target="_blank" rel="noopener noreferrer">DonorInfo</a>
            </div>
          </li>
        ))}
      </ul>
      {URL_COMPTEUR && (
        <div class="dons-compteur">
          {total && <p class="dons-total"><b>{nombre(total.dons)}</b> {t('don{n?|s} déclaré{n?|s}', { n: total.dons })} · <b>{nombre(total.total)} €</b></p>}
          <Declaration onDeclare={recharger} />
        </div>
      )}
    </div>
  )
}
