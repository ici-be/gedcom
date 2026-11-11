// Signatures à trouver : les actes en ligne de l'arbre où des personnes sans signature ont dû signer,
// les plus prometteurs d'abord (ancêtres, signatures attendues). Les actes déjà regardés se cochent.

import { Fragment } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import type { Donnees } from '../lib/donnees'
import { actesASignatures, bilanSignatures, sansSignature, type ActeSignatures, type Signataire } from '../lib/signatures'
import { nomComplet } from '../lib/parente'
import { libelle, nombre } from '../lib/format'
import { versCsv, telecharger } from '../lib/csv'
import { ecrire, lire } from '../lib/stockage'
import { identifiantImage, siteDuLien, SITES } from '../lib/actes-en-ligne'
import { AvisImpression, DateLieu, EffacerFiltres, Pagination, Personne, lignesAffichees, normaliser, useImpression } from './commun'

const CLE_VUS = 'signatures.vus'
const PAR_PAGE = 50

type Qui = 'ancetres' | 'tous'
type Type = '' | 'naissance' | 'mariage' | 'deces'

const TYPES: Record<Exclude<Type, ''>, string[]> = {
  naissance: ['BIRT', 'BAPM', 'CHR'],
  mariage: ['MARR', 'MARC'],
  deces: ['DEAT', 'BURI'],
}

/** En local (npm run dev) : ce que le serveur sait des images téléchargées et de la file de la skill signatures-registre */
interface Atelier { images: Record<string, 'disque' | 'pcloud'>; attente: string[]; faits: string[] }

function useAtelier() {
  const [atelier, setAtelier] = useState<Atelier | undefined>()
  const [occupe, setOccupe] = useState('')
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    if (!import.meta.env.DEV) return
    fetch('/__signatures').then((r) => (r.ok ? r.json() : undefined)).then(setAtelier).catch(() => undefined)
  }, [])
  const pousser = async (cle: string, demande: { images: string[]; acte: string; personnes: string; signataires: string[] }) => {
    setOccupe(cle)
    setErreur('')
    try {
      const j = await (await fetch('/__signatures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(demande) })).json()
      if (j.erreur) setErreur(j.erreur)
      else setAtelier(j)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
    setOccupe('')
  }
  return { atelier, occupe, erreur, pousser }
}

function Signature({ d, s }: { d: Donnees; s: Signataire }) {
  const sosa = d.ancetres.get(s.id)?.sosa
  const titre = s.etat === 'photo'
    ? 'Un portrait est son image principale : sa signature est peut-être déjà dans l’arbre, à vérifier'
    : s.certitude === 'possible' ? 'A peut-être signé cet acte' : 'Signe d’ordinaire un tel acte'
  return (
    <li class={'sig-qui' + (sosa ? ' ancetre' : '') + (s.certitude === 'possible' ? ' possible' : '')} title={titre}>
      <span class="sig-role">{s.role}</span> <Personne d={d} id={s.id} prenoms={2} />
      {sosa && <span class="sig-sosa">Sosa {sosa}</span>}
      {s.etat === 'photo' && <span class="sig-verifier">à vérifier</span>}
    </li>
  )
}

export function Signatures({ d }: { d: Donnees }) {
  const actes = useMemo(() => actesASignatures(d.arbre, d.ancetres), [d])
  const bilan = useMemo(() => bilanSignatures(d.arbre, d.ancetres, actes), [d, actes])
  const [qui, setQui] = useState<Qui>('ancetres')
  const [type, setType] = useState<Type>('')
  const [site, setSite] = useState('')
  const [attendues, setAttendues] = useState(false)
  const [texte, setTexte] = useState('')
  const [cacherVus, setCacherVus] = useState(true)
  const [page, setPage] = useState(0)
  const [vus, setVus] = useState<Set<string>>(() => new Set(lire<string[]>(CLE_VUS, [])))
  const impression = useImpression()
  const { atelier, occupe, erreur, pousser } = useAtelier()

  const cocher = (cle: string, oui: boolean) => {
    const n = new Set(vus)
    if (oui) n.add(cle)
    else n.delete(cle)
    setVus(n)
    ecrire(CLE_VUS, [...n])
  }

  const noms = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of actes) {
      m.set(a.cle, normaliser([...a.sujets, ...a.signataires.map((s) => s.id)].map((id) => { const i = d.arbre.individus.get(id); return i ? nomComplet(i) : '' }).join(' ') + ' ' + (a.evenement.lieu ?? '')))
    }
    return m
  }, [actes, d])

  const manquants = (a: ActeSignatures) => a.signataires.filter((s) => sansSignature(s.etat) && (!attendues || s.certitude === 'attendue'))
  const liste = useMemo(() => {
    const q = normaliser(texte.trim())
    return actes.filter((a) => {
      const m = manquants(a)
      if (!m.length) return false
      if (qui === 'ancetres' && !m.some((s) => d.ancetres.has(s.id))) return false
      if (type && !TYPES[type].includes(a.evenement.tag)) return false
      if (site && !a.liens.some((l) => siteDuLien(l) === site)) return false
      if (cacherVus && vus.has(a.cle)) return false
      return !q || noms.get(a.cle)!.includes(q)
    })
  }, [actes, qui, type, site, attendues, texte, cacherVus, vus, noms, d])

  const pages = Math.ceil(liste.length / PAR_PAGE)
  const p = Math.min(page, Math.max(0, pages - 1))
  const filtres = [
    qui === 'tous' && 'tout l’arbre', type && 'type d’acte', site && 'site', attendues && 'signatures attendues', texte.trim() && 'nom ou lieu', !cacherVus && 'actes déjà regardés',
  ].filter((x): x is string => !!x)
  const effacer = () => { setQui('ancetres'); setType(''); setSite(''); setAttendues(false); setTexte(''); setCacherVus(true); setPage(0) }
  const nom = (id: string) => { const i = d.arbre.individus.get(id); return i ? nomComplet(i) : '?' }

  /** Les images de l'acte, et où elles en sont : à pousser, en attente de la skill, extraites */
  const images = (a: ActeSignatures) => {
    const ids = [...new Set(a.liens.map(identifiantImage).filter((x): x is string => !!x))]
    const connues = ids.filter((id) => atelier?.images[id])
    return {
      connues,
      attente: connues.some((id) => atelier!.attente.includes(id)),
      faites: connues.length > 0 && connues.every((id) => atelier!.faits.includes(id)),
      pcloud: connues.some((id) => atelier!.images[id] === 'pcloud'),
    }
  }
  const pousserActe = (a: ActeSignatures) => pousser(a.cle, {
    images: images(a).connues,
    acte: [libelle(a.evenement), a.evenement.date?.texte, a.evenement.lieu].filter(Boolean).join(' · '),
    personnes: a.sujets.map(nom).join(' & '),
    signataires: manquants(a).map((s) => {
      const sosa = d.ancetres.get(s.id)?.sosa
      return `${s.role}\u202f: ${nom(s.id)}${sosa ? ` (Sosa ${sosa})` : ''}${s.certitude === 'possible' ? ', possible' : ''}${s.etat === 'photo' ? ', à vérifier' : ''}`
    }),
  })

  const exporter = () => {
    const lignes: (string | number)[][] = [['Acte', 'Date', 'Lieu', 'Personnes', 'Signatures à trouver', 'Dont ancêtres', 'Liens']]
    for (const a of liste) {
      lignes.push([
        libelle(a.evenement), a.evenement.date?.texte ?? '', a.evenement.lieu ?? '', a.sujets.map(nom).join(' & '),
        manquants(a).map((s) => `${nom(s.id)} (${s.role}${d.ancetres.has(s.id) ? ', Sosa ' + d.ancetres.get(s.id)!.sosa : ''})`).join(', '),
        manquants(a).filter((s) => d.ancetres.has(s.id)).length, a.liens.join(' '),
      ])
    }
    telecharger('signatures-a-trouver.csv', versCsv(lignes))
  }

  return (
    <section class="ecran sig">
      <header class="titre-ecran">
        <h1>Signatures à trouver</h1>
        <p class="sous-titre">Les actes en ligne de votre arbre où des personnes sans signature ont dû signer, les plus prometteurs d'abord.</p>
      </header>

      <section class="panneau">
        {!bilan.avecImages && (
          <p class="avertissement">
            Ce fichier ne contient aucune image : impossible de savoir qui a déjà sa signature. Sur Geneanet, cochez
            « Liens web vers les photos principales des individus » au moment de l'export.
          </p>
        )}
        <p>
          Sur <strong>{nombre(bilan.ancetres)}</strong> ancêtres, <strong>{nombre(bilan.presentes)}</strong> {bilan.presentes > 1 ? 'ont' : 'a'} leur signature dans l'arbre
          {bilan.illettres > 0 && <> et <strong>{nombre(bilan.illettres)}</strong> ne savai{bilan.illettres > 1 ? 'ent' : 't'} pas signer</>}.
          Parmi les <strong>{nombre(bilan.aTrouver)}</strong> autres, <strong>{nombre(bilan.avecActe)}</strong> {bilan.avecActe > 1 ? 'figurent' : 'figure'} dans
          au moins un acte en ligne où {bilan.avecActe > 1 ? 'ils ont' : 'il a'} pu signer.
        </p>
        <p class="aide">
          Sont comptés comme signataires : les époux, leurs parents en vie au mariage, le père qui déclare une naissance, les témoins, parrains et marraines notés
          dans l'acte. Avant l'état civil (1796), la signature n'est que « possible » ; les actes d'avant 1779 en Belgique et d'avant 1667 en France, jamais signés,
          sont laissés de côté. Une personne dont l'image principale est un portrait a peut-être déjà sa signature en seconde image : elle est marquée « à vérifier ».
          Quand un acte montre qu'une personne ne savait pas signer, notez-le par <a href="#/illettres">« Signature: illettré »</a> : elle ne sera plus proposée.
        </p>
      </section>

      <div class="filtres">
        <label>Signataires
          <select value={qui} onChange={(e) => { setQui(e.currentTarget.value as Qui); setPage(0) }}>
            <option value="ancetres">Ancêtres</option>
            <option value="tous">Tout l'arbre</option>
          </select>
        </label>
        <label>Acte
          <select value={type} onChange={(e) => { setType(e.currentTarget.value as Type); setPage(0) }}>
            <option value="">Tous</option>
            <option value="naissance">Naissance, baptême</option>
            <option value="mariage">Mariage</option>
            <option value="deces">Décès</option>
          </select>
        </label>
        <label>Site
          <select value={site} onChange={(e) => { setSite(e.currentTarget.value); setPage(0) }}>
            <option value="">Tous</option>
            {SITES.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            <option value="autre">Autres</option>
          </select>
        </label>
        <label>Nom ou lieu
          <input type="search" value={texte} onInput={(e) => { setTexte(e.currentTarget.value); setPage(0) }} />
        </label>
        <label class="case"><input type="checkbox" checked={attendues} onChange={(e) => { setAttendues(e.currentTarget.checked); setPage(0) }} /> signatures attendues seulement</label>
        <label class="case"><input type="checkbox" checked={cacherVus} onChange={(e) => { setCacherVus(e.currentTarget.checked); setPage(0) }} /> cacher les actes déjà regardés</label>
        <EffacerFiltres actifs={filtres} effacer={effacer} />
      </div>

      <div class="barre-resultats">
        <span>
          <strong>{nombre(liste.length)}</strong> acte{liste.length > 1 ? 's' : ''}
          {vus.size > 0 && <> · {nombre(vus.size)} déjà regardé{vus.size > 1 ? 's' : ''}</>}
        </span>
        <button type="button" class="bouton discret" disabled={!liste.length} onClick={exporter}>Exporter en CSV</button>
      </div>

      {atelier && (
        <p class="aide sig-atelier">
          Version locale{'\u202f'}: « Pousser » copie l'image de l'acte dans <code>_skills/Images pour signatures/</code>, avec les signatures à y chercher.
          {atelier.attente.length > 0
            ? <> <strong>{nombre(atelier.attente.length)}</strong> image{atelier.attente.length > 1 ? 's' : ''} en attente{'\u202f'}: lancez <code>/signatures-registre</code> dans Claude Code.</>
            : <> Lancez ensuite <code>/signatures-registre</code> dans Claude Code.</>}
        </p>
      )}
      {erreur && <p class="avertissement">{erreur}</p>}
      <AvisImpression impression={impression} total={liste.length} page={p} parPage={PAR_PAGE} />
      {liste.length > 0 && (
        <div class="tableau-conteneur">
          <table class="tableau sig-tableau">
            <thead><tr><th title="Acte déjà regardé">✓</th><th>Acte</th><th>Signatures à trouver</th><th>Voir</th>{atelier && <th>Extraire</th>}</tr></thead>
            <tbody>
              {lignesAffichees(liste, p, PAR_PAGE, impression).map((a) => (
                <tr key={a.cle} class={vus.has(a.cle) ? 'coche' : ''}>
                  <td><input type="checkbox" checked={vus.has(a.cle)} onChange={(e) => cocher(a.cle, e.currentTarget.checked)} aria-label="Acte déjà regardé" /></td>
                  <td class="nom">
                    <strong>{libelle(a.evenement)}</strong> <DateLieu e={a.evenement} />
                    <span class="contexte">{a.sujets.map((s, i) => <Fragment key={s}>{i > 0 && ' & '}<Personne d={d} id={s} prenoms={2} /></Fragment>)}</span>
                  </td>
                  <td><ul class="sig-liste">{manquants(a).map((s) => <Signature key={s.id} d={d} s={s} />)}</ul></td>
                  <td class="sig-liens">
                    {a.liens.map((l) => <a key={l} class="bouton discret" href={l} target="_blank" rel="noopener noreferrer">{SITES.find((s) => s.id === siteDuLien(l))?.court ?? 'Ouvrir'}</a>)}
                  </td>
                  {atelier && (() => {
                    const i = images(a)
                    return (
                      <td class="sig-liens">
                        {!i.connues.length ? <span class="vide" title="Image pas encore téléchargée : npm run actes telecharger -- --signatures">pas d'image</span>
                          : i.faites ? <span class="sig-fait">extrait</span>
                          : i.attente ? <span class="vide">en attente</span>
                          : (
                            <button type="button" class="bouton discret" disabled={!!occupe} title={i.pcloud ? 'L’image est rapportée de pCloud' : undefined} onClick={() => void pousserActe(a)}>
                              {occupe === a.cle ? 'Copie…' : 'Pousser'}
                            </button>
                          )}
                      </td>
                    )
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!liste.length && <p class="vide">Aucun acte ne correspond.</p>}
      <Pagination page={p} pages={pages} aller={setPage} />
    </section>
  )
}
