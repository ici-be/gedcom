"""Pour chaque événement encore sans résultat : registre Agatha et images où chercher.

  python3 -I localiser.py DOSSIER [MARGE]

Utilise agatha_PR.json / agatha_CS.json (agatha.py registres), la liste des images de chaque registre
(agatha.py images, appelé ici au besoin) et les liens déjà posés (ancres.json) pour estimer la position
de l'acte par interpolation de date. Écrit DOSSIER/a_lire.json : [{ n, quoi, registres: [{ bp, dossier, quoi,
images: [...] }] }], du plus probable au moins probable.
"""
import json
import os
import re
import sys
from datetime import date

ici = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ici)
import agatha  # noqa: E402
dossier = sys.argv[1]
marge = int(sys.argv[2]) if len(sys.argv) > 2 else 3
evs = json.load(open(f'{dossier}/evenements.json'))
fait = {json.loads(l)['n'] for l in open(f'{dossier}/resultats.jsonl')} if os.path.exists(f'{dossier}/resultats.jsonl') else set()
regs = [dict(r, tab=t) for t in ('PR', 'CS') for r in json.load(open(f'{dossier}/agatha_{t}.json')) if str(r['dispo']) == '1']
ancres = json.load(open(f'{dossier}/ancres.json'))

MOTS = {'n': ('baptême', 'naissance'), 'd': ('sépulture', 'décès'), 'm': ('mariage',)}
NATURE = {'BIRT': 'n', 'BAPM': 'n', 'CHR': 'n', 'DEAT': 'd', 'BURI': 'd', 'MARR': 'm'}


def jour(d, m, y):
    return date(y, m, d).toordinal()


def images(bps):
    cache = f'{dossier}/agatha_images.json'
    F = json.load(open(cache)) if os.path.exists(cache) else {}
    manque = [b for b in bps if b not in F]
    if manque:
        agatha.images(dossier, manque)
        F = json.load(open(cache))
    return F


def candidats(e):
    nat = NATURE.get(e['tag'][:4])
    d, m, y = e['dmy']
    out = []
    for r in regs:
        q = r['quoi'].lower()
        if not (r['de'] <= y <= r['a']) or 'illégitime' in q or 'copie' in q or 'table' in q:
            continue
        if any(w in q for w in MOTS[nat]) or 'mélangé' in q:
            # registre civil d'une seule année, ou paroissial : préférer le plus court ; « mélangés » en dernier
            out.append((('mélangé' in q), r['a'] - r['de'], r))
    return [r for _, _, r in sorted(out, key=lambda x: (x[0], x[1]))]


tous = [e for e in evs if e['n'] not in fait and e['dmy'] and e['tag'][:4] in NATURE]
F = images(sorted({r['bp'] for e in tous for r in candidats(e)}))
# ancres par dossier IIIF : (jour, position de l'image)
pos_ancres = {}
for a in ancres:
    m = re.search(r'/data/images/\d+/([^/]+)/(\d+_\d{4}[A-Za-z_]*)', a['lien'])
    if m and a['dmy']:
        pos_ancres.setdefault(m[1], []).append((jour(*a['dmy']), m[2]))

sortie = []
for e in tous:
    regs_e = []
    for r in candidats(e)[:2]:
        f = F.get(r['bp'])
        if not f or not f['images']:
            continue
        ims = f['images']
        j = jour(*e['dmy'])
        pts = sorted((jj, ims.index(i)) for jj, i in pos_ancres.get(f['dossier'], []) if i in ims)
        # bornes : début et fin du registre
        pts = [(jour(1, 1, r['de']), 0)] + [p for p in pts if jour(1, 1, r['de']) < p[0] < jour(31, 12, r['a'])] + [(jour(31, 12, r['a']), len(ims) - 1)]
        k = next(i for i in range(1, len(pts)) if pts[i][0] >= j or i == len(pts) - 1)
        (j0, i0), (j1, i1) = pts[k - 1], pts[k]
        est = round(i0 + (i1 - i0) * (j - j0) / max(1, j1 - j0))
        mg = marge if (i1 - i0) < 40 or len(pts) > 2 else marge * 2
        regs_e.append({'bp': r['bp'], 'dossier': f['dossier'], 'quoi': f"{r['quoi']} {r['de']}-{r['a']}",
                       'estimation': ims[est], 'images': ims[max(0, est - mg): est + mg + 1]})
    sortie.append({'n': e['n'], 'registres': regs_e})
json.dump(sortie, open(f'{dossier}/a_lire.json', 'w'), ensure_ascii=False, indent=1)
print(len(sortie), 'événements à lire ;', sum(1 for s in sortie if not s['registres']), 'sans registre Agatha')
for s in sortie[:5]:
    print(s['n'], [(r['quoi'], r['estimation'], len(r['images'])) for r in s['registres']])
