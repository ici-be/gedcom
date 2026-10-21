// Dans le bandeau, sur toutes les pages : la personne de départ (Sosa 1), et de quoi en changer.

import { useEffect, useRef, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { nomComplet } from '../lib/parente'
import { ChoixPersonne } from './commun'
import { t } from '../lib/i18n'

export function ChoixRacine({ d, setRacine }: { d: Donnees; setRacine: (id: string) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const boite = useRef<HTMLDivElement>(null)
  const racine = d.arbre.individus.get(d.racine)
  useEffect(() => {
    if (!ouvert) return
    // le champ de recherche prêt à taper
    boite.current?.querySelector('input')?.focus()
    const dehors = (e: PointerEvent) => { if (!boite.current?.contains(e.target as Node)) setOuvert(false) }
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false) }
    addEventListener('pointerdown', dehors)
    addEventListener('keydown', echap)
    return () => { removeEventListener('pointerdown', dehors); removeEventListener('keydown', echap) }
  }, [ouvert])
  return (
    <div class="choix-racine" ref={boite}>
      <button type="button" class="choix-racine-bouton" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}
        title={t('Personne de départ') + (racine ? t(' : ') + nomComplet(racine) : '')}>
        <span class="choix-racine-sosa">{t('Sosa 1')}</span>
        <span class="choix-racine-nom">{racine ? racine.prenom.split(/\s+/)[0] || racine.nom : t('à choisir')}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {ouvert && (
        <div class="choix-racine-panneau" role="dialog" aria-label={t('Changer de personne de départ')}>
          <p class="aide">{t('Personne de départ :')}</p>
          <ChoixPersonne d={d} valeur={d.racine} prenoms={2} choisir={(id) => { setRacine(id); setOuvert(false) }} />
        </div>
      )}
    </div>
  )
}
