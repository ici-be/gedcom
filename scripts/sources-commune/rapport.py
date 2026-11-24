"""Rapport d'une commune : liens posés, registres utilisés, écarts, douteux, non trouvés.

  python3 -I rapport.py DOSSIER COMMUNE

Lit evenements.json, resultats*.jsonl, journal.jsonl, agatha_*.json ; ajoute, s'il existe, le texte de
DOSSIER/a_verifier.md (points à faire vérifier par Bruno, rédigés à la main) et DOSSIER/notes_registres.md
(particularités des registres). Écrit DOSSIER/rapport_<commune>.md, avec l'espace fine devant « : » et « ; ».
"""
import collections
import datetime
import glob
import json
import os
import re
import sys
import unicodedata

W, commune = sys.argv[1], sys.argv[2]
ev = {e['n']: e for e in json.load(open(W + '/evenements.json'))}
R = {}
for f in sorted(glob.glob(W + '/resultats*.jsonl')):
    for l in open(f):
        d = json.loads(l)
        if d.get("src") or not (R.get(d["n"]) or {}).get("src"):
            R[d["n"]] = d  # une ligne sans lien n’écrase pas une ligne avec lien
J = {}
BAP = set()  # naissances changées en baptêmes (l'acte n'est qu'un baptême, à la date donnée pour la naissance)
for l in (open(W + '/journal.jsonl') if os.path.exists(W + '/journal.jsonl') else []):
    d = json.loads(l)
    if J.get(d['n']) != 'posé':
        J[d['n']] = d['etat']
    if d.get('bapteme') and d['etat'] in ('posé', 'converti'):
        BAP.add(d['n'])
regs = {}
for t in ('PR', 'CS'):
    if os.path.exists(f'{W}/agatha_{t}.json'):
        for r in json.load(open(f'{W}/agatha_{t}.json')):
            regs[r['bp']] = r
F = json.load(open(W + '/agatha_images.json')) if os.path.exists(W + '/agatha_images.json') else {}
noms_reg = {}
for bp, f in F.items():
    r = regs.get(bp)
    if r:
        noms_reg.setdefault(f['dossier'], set()).add(f"{r['quoi'].lower()} {r['de']}" + (f"-{r['a']}" if r['a'] != r['de'] else ''))


def qui(e):
    if e['kind'] == 'fam':
        return f"{e['mari']['prenom']} {e['mari']['nom']} et {e['femme']['prenom']} {e['femme']['nom']}"
    return f"{e['qui']['prenom']} {e['qui']['nom']}"


def lire(nom):
    return open(f'{W}/{nom}').read().strip() + '\n' if os.path.exists(f'{W}/{nom}') else ''


cle = lambda n: tuple(ev[n]['dmy'] or (0, 0, 0))[::-1]  # noqa: E731
TAG = {'BIRT': 'naissance', 'BAPM': 'baptême', 'DEAT': 'décès', 'BURI': 'sépulture', 'MARR': 'mariage'}
dite = lambda e: f"{TAG.get(e['tag'][:4], e['tag'])} {e['date']}"  # noqa: E731
use = collections.Counter()
for n, d in R.items():
    if J.get(n) == 'posé':
        m = re.search(r'/images/\d+/([^/]+)/', d.get('src') or '')
        if m:
            use['Agatha ' + m[1]] += 1
        elif 'brucity' in (d.get('src') or ''):
            use['Archives de la Ville de Bruxelles, registres de population'] += 1
        elif 'archivesdepartementales.lenord.fr' in (d.get('src') or ''):
            use['Archives départementales du Nord'] += 1
        elif str(d.get('origine', '')).startswith('index FS'):
            use['FamilySearch, index nominatif'] += 1
        else:
            use['FamilySearch, lu sur les films'] += 1
nb = sum(1 for v in J.values() if v == 'posé')
fs = use['FamilySearch, index nominatif']
fsl = use['FamilySearch, lu sur les films']
avb = use['Archives de la Ville de Bruxelles, registres de population']
adn = use['Archives départementales du Nord']
deja = [n for n, v in J.items() if v == 'déjà présent']
datees = [n for n, e in ev.items() if e['dmy']]
cat = collections.Counter('ancêtres' if e['rel'].startswith('Sosa') else 'frères et sœurs' if e['rel'].startswith('fratrie')
                          else 'unions' if 'union' in e['rel'] else 'hors lignée' for e in ev.values())
portee = [f'{k} {v}' for k, v in cat.most_common()]
L = [f"# {commune} : liens d’actes ajoutés sur Geneanet\n",
     f"Le {datetime.date.today():%d/%m/%Y}, {nb} liens ont été posés dans le champ Source des événements de {commune} qui n’en avaient pas "
     f"({len(ev)} événements retenus, dont {len(datees)} à date complète ; {', '.join(portee)}). "
     f"{fs} liens FamilySearch repérés par l’index nominatif (nom, date exacte et parents concordants) ; {fsl} liens FamilySearch et "
     f"{nb - fs - fsl - avb - adn} liens Agatha lus sur l’image" + (f" ; {adn} liens Archives départementales du Nord" if adn else '') + (f" ; {avb} liens vers les registres de population des Archives de la Ville de Bruxelles" if avb else '') + ". Chaque lien a été relu sur la fiche publique juste après l’enregistrement. Aucune date ni aucun nom n’a été modifié."
     + (f" {len(BAP)} naissance(s) de l’arbre, qui avaient en fait la date d’un acte de baptême muet sur la naissance, sont devenues des baptêmes (même date, même lieu)." if BAP else '')
     + (f" {len(deja)} événement(s) avaient déjà leur lien sur la fiche en ligne." if deja else '')
     + " Outil : `scripts/sources-commune/` du dépôt gedcom ; détail : `evenements.json`, `resultats*.jsonl`, `journal.jsonl`.\n",
     "## Registres utilisés\n"]
for d, c in sorted(use.items()):
    k = d.removeprefix('Agatha ')
    L.append(f"- {d} : {c} lien(s)" + (f" ({' ; '.join(sorted(noms_reg[k]))})" if k in noms_reg else ''))
L.append('')
if lire('notes_registres.md'):
    L.append(lire('notes_registres.md'))
if lire('a_verifier.md'):
    L += ['## À vérifier en priorité\n', lire('a_verifier.md')]
if BAP:
    L.append('## Naissances changées en baptêmes\n')
    for n in sorted(BAP, key=cle):
        L.append(f"- **{qui(ev[n])}** ({dite(ev[n])}) : {R.get(n, {}).get('lu', '')}")
    L.append('')
L.append('## Écarts relevés (liens posés, arbre laissé tel quel)\n')
for n in sorted(R, key=cle):
    d = R[n]
    if J.get(n) == 'posé' and d.get('ecart'):
        L.append(f"- **{qui(ev[n])}** ({dite(ev[n])}) : {d['ecart']} — {d['lu']}")
douteux = [n for n in sorted(R, key=cle) if R[n].get('douteux') and J.get(n) != 'posé']
if douteux:
    L.append('\n## Actes douteux (lien non posé)\n')
    for n in douteux:
        d = R[n]
        L.append(f"- **{qui(ev[n])}** ({dite(ev[n])}) : {d.get('motif_doute') or d.get('ecart', '')} — candidat : {d['src']} ({d['lu']})")
L.append('\n## Non trouvés\n')
for n in sorted(ev, key=cle):
    e = ev[n]
    if e['dmy'] and J.get(n) not in ('posé', 'déjà présent') and n not in douteux:
        L.append(f"- **{qui(e)}** ({dite(e)}) : {R.get(n, {}).get('motif') or 'arrêt à l’écriture : voir journal.jsonl'}")
sans = len(ev) - len(datees)
if sans:
    L.append(f"\nLes {sans} événements sans date complète (naissances « vers », décès « après », sépultures sans date…) n’ont pas été traités.\n")
t = re.sub(r' ([:;?!])(?=\s)', ' \\1', '\n'.join(L))
nom = unicodedata.normalize('NFKD', commune).encode('ascii', 'ignore').decode().lower().replace(' ', '-')
open(f'{W}/rapport_{nom}.md', 'w').write(t)
print(f'{W}/rapport_{nom}.md :', nb, 'posés (index FS', fs, '; films FS', fsl, '; Agatha', nb - fs - fsl - avb - adn, '; AVB', avb, '; AD Nord', adn, ') ;', len(douteux), 'douteux')
