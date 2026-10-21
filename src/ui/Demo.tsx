// Page /print/ : petite démonstration animée (une dizaine de secondes) du dépôt du fichier au choix de l'arbre, ouverte depuis le menu.

import { useEffect, useRef } from 'preact/hooks'
import { t } from '../lib/i18n'

// la démo est écrite pour dix secondes ; tous les délais sont multipliés par RYTHME
const DUREE = 10200
const RYTHME = 2

// éventail fictif : 6 générations sur 220°, chaque quartier teinté par une province
function point(cx: number, cy: number, r: number, a: number): string {
  const rad = (a * Math.PI) / 180
  return `${(cx + r * Math.sin(rad)).toFixed(1)} ${(cy - r * Math.cos(rad)).toFixed(1)}`
}
function secteur(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number): string {
  return `M${point(cx, cy, r2, a1)}A${r2} ${r2} 0 0 1 ${point(cx, cy, r2, a2)}L${point(cx, cy, r1, a2)}A${r1} ${r1} 0 0 0 ${point(cx, cy, r1, a1)}Z`
}
const alea = (n: number) => { const x = Math.sin(n * 91.7) * 10000; return x - Math.floor(x) }

interface Segment { d: string; province: number; retard: number; opacite: number }
const SEGMENTS: Segment[] = (() => {
  const r: Segment[] = []
  const cx = 200, cy = 160, ouverture = 220, epaisseur = 27, r0 = 22
  let n = 0
  for (let g = 2; g <= 6; g++) {
    const nb = 2 ** (g - 1), r1 = r0 + (g - 2) * epaisseur + 2, r2 = r0 + (g - 1) * epaisseur
    for (let i = 0; i < nb; i++) {
      const a1 = -ouverture / 2 + (i * ouverture) / nb, a2 = a1 + ouverture / nb
      const quartier = Math.floor((i * 4) / nb)
      r.push({
        d: secteur(cx, cy, r1, r2, a1 + 0.35, a2 - 0.35),
        province: ((quartier + (alea(g * 100 + i) > 0.62 ? 1 : 0)) % 5) + 1,
        retard: ((g - 1) * 0.28 + (i / nb) * 0.2) * RYTHME,
        opacite: 0.55 + alea(n++) * 0.4,
      })
    }
  }
  return r
})()

const MINI: { d: string; centre: boolean }[] = (() => {
  const r: { d: string; centre: boolean }[] = []
  for (let k = 1; k <= 3; k++) {
    const nb = 2 ** k
    for (let i = 0; i < nb; i++) {
      const a1 = -110 + (i * 220) / nb
      r.push({ d: secteur(50, 62, 6 + (k - 1) * 14 + 1, 6 + k * 14, a1 + 1.5, a1 + 220 / nb - 1.5), centre: k === 1 })
    }
  }
  return r
})()

export function Demo({ fermer }: { fermer: () => void }) {
  const racine = useRef<HTMLDivElement>(null)
  const relance = useRef<() => void>(() => {})

  useEffect(() => {
    const el = racine.current!
    const q = (s: string) => el.querySelector(s) as HTMLElement
    const scene = q('.demo-scene'), souris = q('.demo-souris'), fichier = q('.demo-fichier'), depot = q('.demo-depot')
    const vues = [...el.querySelectorAll<HTMLElement>('.demo-vue')]
    const etapes = [...q('.demo-etapes').children]
    const jauge = q('.demo-jauge div'), eventail = q('.demo-eventail')
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
    let minuteurs: number[] = []

    const planifie = (ms: number, fn: () => void) => { minuteurs.push(window.setTimeout(fn, ms * RYTHME)) }
    const centre = (e: HTMLElement, dx = 0.5, dy = 0.5): [number, number] => {
      const s = scene.getBoundingClientRect(), r = e.getBoundingClientRect()
      return [r.left - s.left + r.width * dx, r.top - s.top + r.height * dy]
    }
    const vers = (e: HTMLElement, dx?: number, dy?: number) => { const [x, y] = centre(e, dx, dy); souris.style.transform = `translate(${x}px,${y}px)` }
    const clic = () => { souris.classList.add('clic'); window.setTimeout(() => souris.classList.remove('clic'), 180) }
    const montre = (i: number) => {
      vues.forEach((v, k) => v.classList.toggle('on', k === i))
      etapes.forEach((e, k) => { e.classList.toggle('on', k === i); e.classList.toggle('fait', k < i) })
    }
    const remise = () => {
      minuteurs.forEach(clearTimeout); minuteurs = []
      depot.classList.remove('survol', 'lu-ok')
      const saisie = q('.demo-saisie'); saisie.textContent = t('Chercher une personne'); saisie.classList.add('vide'); q('.demo-champ').classList.remove('actif')
      q('.demo-resultats').classList.remove('on'); q('.demo-res1').classList.remove('choisi')
      el.querySelectorAll('.demo-carte').forEach((c) => c.classList.remove('survol', 'choisi'))
      eventail.classList.remove('trace'); q('.demo-pret').classList.remove('on'); q('.demo-imprimer').classList.remove('appui')
      fichier.style.transition = 'none'; fichier.style.opacity = '0'; fichier.style.transform = `translate(${scene.clientWidth - 200}px,40px)`
      souris.style.transition = 'none'; souris.style.opacity = '0'
      jauge.style.transition = 'none'; jauge.style.width = '0'
      void scene.offsetWidth
      fichier.style.transition = ''; souris.style.transition = ''
    }
    const final = () => { remise(); montre(3); eventail.classList.add('trace'); jauge.style.width = '100%' }

    const joue = () => {
      remise()
      if (reduit) { final(); return }
      jauge.style.transition = `width ${DUREE * RYTHME}ms linear`; jauge.style.width = '100%'
      montre(0)
      // 1. le fichier glisse jusqu'à la zone de dépôt
      planifie(300, () => {
        const p = centre(depot)
        fichier.style.opacity = '1'
        fichier.style.transform = `translate(${p[0] - 70}px,${p[1] - 18}px)`
        depot.classList.add('survol')
        souris.style.opacity = '1'
        const s = centre(fichier)
        souris.style.transition = 'none'; souris.style.transform = `translate(${s[0]}px,${s[1]}px)`
        void souris.offsetWidth; souris.style.transition = ''
        souris.style.transform = `translate(${p[0] - 20}px,${p[1] - 6}px)`
      })
      planifie(1600, () => { fichier.style.opacity = '0'; depot.classList.remove('survol'); depot.classList.add('lu-ok') })
      // 2. recherche de la personne de départ
      planifie(2700, () => { montre(1); vers(q('.demo-champ'), 0.3) })
      planifie(3100, () => {
        clic(); q('.demo-champ').classList.add('actif')
        const s = q('.demo-saisie'); s.classList.remove('vide'); s.textContent = ''
        const txt = 'Marie Dup'
        let k = 0
        const tape = () => { if (k < txt.length) { s.textContent += txt[k++]; minuteurs.push(window.setTimeout(tape, 85 * RYTHME)) } else q('.demo-resultats').classList.add('on') }
        tape()
      })
      planifie(4200, () => vers(q('.demo-res1'), 0.35))
      planifie(4800, () => { clic(); q('.demo-res1').classList.add('choisi') })
      // 3. choix de l'arbre
      planifie(5400, () => { montre(2); vers(q('.demo-c3'), 0.5, 0.4) })
      planifie(5800, () => { q('.demo-c3').classList.add('survol'); vers(q('.demo-c2'), 0.5, 0.4) })
      planifie(6200, () => { q('.demo-c3').classList.remove('survol'); q('.demo-c2').classList.add('survol'); vers(q('.demo-c1'), 0.5, 0.4) })
      planifie(6600, () => { q('.demo-c2').classList.remove('survol'); q('.demo-c1').classList.add('survol') })
      planifie(7000, () => { clic(); q('.demo-c1').classList.remove('survol'); q('.demo-c1').classList.add('choisi') })
      // 4. la feuille se dessine, puis impression
      planifie(7500, () => { montre(3); vers(q('.demo-imprimer')); planifie(250, () => eventail.classList.add('trace')) })
      planifie(9000, () => { clic(); q('.demo-imprimer').classList.add('appui') })
      planifie(9200, () => { q('.demo-imprimer').classList.remove('appui'); q('.demo-pret').classList.add('on'); souris.style.opacity = '0' })
      planifie(DUREE, joue)
    }
    relance.current = joue

    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer() }
    const visible = () => { if (!document.hidden && !reduit) joue() }
    const redim = () => { if (reduit) final() }
    addEventListener('keydown', echap)
    addEventListener('resize', redim)
    document.addEventListener('visibilitychange', visible)
    el.focus()
    joue()
    return () => {
      minuteurs.forEach(clearTimeout)
      removeEventListener('keydown', echap)
      removeEventListener('resize', redim)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  const carte = (n: number, titre: string, contenu: preact.ComponentChildren) => (
    <div class={`demo-carte demo-c${n}`}><svg viewBox="0 0 100 70" aria-hidden="true">{contenu}</svg><span>{titre}</span></div>
  )
  const rect = (x: number, y: number, w: number, plein = false) => <rect class={plein ? 'f' : 'm'} x={x} y={y} width={w} height="9" rx="1.5" />

  return (
    <div class="demo-fond" onClick={(e) => { if (e.target === e.currentTarget) fermer() }}>
      <div class="demo" role="dialog" aria-modal="true" aria-label={t('Voir la démo')} tabIndex={-1} ref={racine}>
        <button type="button" class="demo-fermer" aria-label={t('Fermer')} onClick={fermer}>×</button>
        <header class="demo-entete">
          <div>
            <h2>{t('Imprimer son arbre en quatre gestes')}</h2>
            <p>{t('Votre fichier GEDCOM reste sur votre appareil.')}</p>
          </div>
          <button type="button" class="demo-rejouer" onClick={() => relance.current()}>{t('Rejouer la démo')}</button>
        </header>

        <ol class="demo-etapes" aria-label={t('Étapes')}>
          <li>{t('Déposer le fichier')}</li><li>{t('Choisir la personne')}</li><li>{t('Choisir l’arbre')}</li><li>{t('Imprimer')}</li>
        </ol>

        <div class="demo-fenetre" aria-hidden="true">
          <div class="demo-barre"><i /><i /><i /><span>ici.be/gedcom-print/</span></div>
          <div class="demo-scene">
            <section class="demo-vue">
              <h3>{t('Arbres à imprimer')}</h3>
              <div class="demo-depot">
                <div class="vide">
                  <strong>{t('Déposez votre fichier GEDCOM ici')}</strong><br />
                  <small>{t('ou cliquez pour le choisir · .ged')}</small><br />
                  <small>{t('Rien n’est envoyé sur Internet.')}</small>
                </div>
                <div class="lu">
                  <div class="coche">✓</div><br />
                  <strong>famille.ged</strong><br />
                  <small>{t('2 184 personnes · 612 familles')}</small>
                </div>
              </div>
            </section>
            <section class="demo-vue">
              <h3>{t('Qui est au centre de l’arbre ?')}</h3>
              <p class="aide">{t('La personne de départ devient le Sosa 1.')}</p>
              <div class="demo-champ">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.6" /><path d="M10.5 10.5 14 14" /></svg>
                <span class="demo-saisie vide">{t('Chercher une personne')}</span><span class="demo-curtxt" />
              </div>
              <div class="demo-resultats">
                <div class="demo-res demo-res1"><span><b>Marie Dupont</b><span class="sosa">{t('Sosa 1')}</span></span><small>1958 · Namur</small></div>
                <div class="demo-res"><span><b>Marie Dupont</b></span><small>1931 · Liège</small></div>
                <div class="demo-res"><span><b>Marie Dupuis</b></span><small>1962 · Mons</small></div>
              </div>
            </section>
            <section class="demo-vue">
              <h3>{t('Quel arbre imprimer ?')}</h3>
              <p class="aide">{t('Une feuille prête pour l’imprimeur ou pour un PDF.')}</p>
              <div class="demo-cartes">
                {carte(1, t('Éventail des origines'), <g>{MINI.map((m) => <path key={m.d} class={m.centre ? 'f' : 'm'} d={m.d} />)}</g>)}
                {carte(2, t('Arbre en pyramide'), <>
                  {rect(40, 54, 20, true)}{rect(22, 40, 22, true)}{rect(56, 40, 22, true)}
                  {[8, 31, 51, 74].map((x) => rect(x, 26, 18))}
                  {[4, 17, 30, 43, 56, 69, 82].map((x) => rect(x, 10, 10))}
                </>)}
                {carte(3, t('Ascendance et descendance'), <>
                  {[14, 42, 70].map((x) => rect(x, 6, 16))}{rect(28, 20, 18)}{rect(54, 20, 18)}{rect(41, 32, 18, true)}{rect(28, 45, 18)}{rect(54, 45, 18)}
                  {[14, 42, 70].map((x) => rect(x, 58, 16))}
                </>)}
                {carte(4, t('Arbre du couple'), <>
                  {rect(24, 30, 22, true)}{rect(54, 30, 22, true)}
                  {[8, 30, 52, 74].map((x) => rect(x, 12, 18))}
                  {[18, 41, 64].map((x) => rect(x, 52, 18))}
                </>)}
              </div>
            </section>
            <section class="demo-vue">
              <h3>{t('Votre feuille est prête')}</h3>
              <div class="demo-feuille">
                <div class="demo-papier">
                  <b>{t('Éventail des origines')}</b>
                  <p>Marie Dupont · {t('{n} générations', { n: 6 })} · A3 {t('paysage')}</p>
                  <svg class="demo-eventail" viewBox="0 0 400 218">
                    <circle cx="200" cy="160" r="22" fill="var(--accent)" class="seg" />
                    {SEGMENTS.map((s) => <path key={s.d} class="seg" d={s.d} fill={`var(--demo-p${s.province})`} fill-opacity={s.opacite.toFixed(2)} style={{ transitionDelay: `${s.retard.toFixed(2)}s` }} />)}
                  </svg>
                </div>
                <div class="demo-actions">
                  <button type="button" class="bouton principal demo-imprimer" tabIndex={-1}>{t('Imprimer ou enregistrer en PDF')}</button>
                  <div class="demo-pret">✓ {t('Feuille envoyée à l’impression')}</div>
                  <div class="aide">{t('Teinté selon la province de naissance')}</div>
                </div>
              </div>
            </section>
            <div class="demo-fichier">
              <svg width="18" height="22" viewBox="0 0 18 22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M2 1h9l5 5v15H2z" /><path d="M11 1v5h5" /></svg>
              <span>famille.ged <small>{t('148 Ko')}</small></span>
            </div>
            <div class="demo-souris"><svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2v15l4-3.6 2.8 6 2.6-1.2-2.8-5.9H16z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round" /></svg></div>
          </div>
        </div>
        <div class="demo-jauge" aria-hidden="true"><div /></div>
      </div>
    </div>
  )
}
