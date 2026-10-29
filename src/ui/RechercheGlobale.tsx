// Dans le bandeau : un champ qui trouve une personne, un lieu ou un métier, et y mène (raccourci « / »).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { chercher, indexerRecherche, type Resultat } from '../lib/recherche-globale'
import { t } from '../lib/i18n'

const GENRES: Record<Resultat['genre'], string> = { personne: 'Personne', lieu: 'Lieu', metier: 'Métier' }

export function RechercheGlobale({ d }: { d: Donnees }) {
  const [texte, setTexte] = useState('')
  const [actif, setActif] = useState(0)
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const index = useMemo(() => indexerRecherche(d), [d])
  const resultats = useMemo(() => chercher(d, index, texte), [d, index, texte])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName) && !cible.isContentEditable) {
        e.preventDefault()
        champ.current?.focus()
      }
    }
    const dehors = (e: PointerEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false) }
    addEventListener('keydown', touche)
    addEventListener('pointerdown', dehors)
    return () => { removeEventListener('keydown', touche); removeEventListener('pointerdown', dehors) }
  }, [])

  const aller = (r: Resultat) => {
    location.hash = r.lien
    setTexte('')
    setOuvert(false)
    champ.current?.blur()
  }
  const clavier = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setTexte(''); setOuvert(false); champ.current?.blur() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActif((actif + 1) % Math.max(resultats.length, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((actif + resultats.length - 1) % Math.max(resultats.length, 1)) }
    else if (e.key === 'Enter' && resultats[actif]) { e.preventDefault(); aller(resultats[actif]) }
  }
  const affiche = ouvert && texte.trim().length > 1
  return (
    <div class="recherche-globale" ref={boite} role="search">
      <input ref={champ} type="search" value={texte} placeholder={t('Rechercher… ( / )')} aria-label={t('Rechercher une personne, un lieu ou un métier')}
        autocomplete="off" aria-expanded={affiche} aria-controls="resultats-recherche"
        onInput={(e) => { setTexte((e.target as HTMLInputElement).value); setActif(0); setOuvert(true) }}
        onFocus={() => setOuvert(true)} onKeyDown={clavier} />
      {affiche && (
        <ul class="resultats-recherche" id="resultats-recherche" role="listbox">
          {resultats.length === 0 && <li class="aucun">{t('Rien trouvé')}</li>}
          {resultats.map((r, i) => (
            <li key={r.lien} role="option" aria-selected={i === actif}>
              <a href={r.lien} class={i === actif ? 'actif' : ''} onClick={(e) => { e.preventDefault(); aller(r) }} onMouseEnter={() => setActif(i)}>
                <span class="genre">{t(GENRES[r.genre])}</span>
                <span class="libelle">{r.libelle}</span>
                {r.detail && <span class="detail">{r.genre === 'metier' ? r.detail + ' ' + t('pers.') : r.detail}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
