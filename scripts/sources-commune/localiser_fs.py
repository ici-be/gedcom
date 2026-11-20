"""Pour chaque événement encore sans résultat : film FamilySearch et images où chercher, par interpolation
entre les liens déjà posés de même nature (baptême/naissance, mariage, décès/sépulture) sur le même film.

  python3 -I localiser_fs.py DOSSIER [MARGE]

Lit evenements.json, resultats*.jsonl, fs_ancres.json et fs_film_*.json (node fs.mjs ancres / film).
Écrit DOSSIER/a_lire.json au format de localiser.py (registres : { dgs, dossier = DGS, quoi, estimation,
images }), utilisable tel quel par lots.py ; les images sont des numéros dans le film (1 = première).
"""
import glob
import json
import os
import sys
from datetime import date

D = sys.argv[1]
marge = int(sys.argv[2]) if len(sys.argv) > 2 else 3
evs = json.load(open(f'{D}/evenements.json'))
fait = set()
for f in glob.glob(f'{D}/resultats*.jsonl'):
    fait |= {json.loads(l)['n'] for l in open(f) if json.loads(l).get('src')}
NATURE = {'BIRT': 'n', 'BAPM': 'n', 'CHR': 'n', 'DEAT': 'd', 'BURI': 'd', 'MARR': 'm', 'MARB': 'm'}
films = {json.load(open(f))['dgs']: json.load(open(f)) for f in glob.glob(f'{D}/fs_film_*.json')}
anc = {}
for a in json.load(open(f'{D}/fs_ancres.json')):
    nat = NATURE.get(a['tag'][:4])
    if nat and a['dmy']:
        anc.setdefault((a['dgs'], nat), []).append((date(a['dmy'][2], a['dmy'][1], a['dmy'][0]).toordinal(), a['image']))
for k in anc:
    anc[k].sort()


def estimer(pts, j):
    """Position estimée et marge, d'après les repères (jour, image) triés."""
    avant = [p for p in pts if p[0] <= j]
    apres = [p for p in pts if p[0] >= j]
    if avant and apres:
        (j0, i0), (j1, i1) = avant[-1], apres[0]
        est = i0 if j1 == j0 else round(i0 + (i1 - i0) * (j - j0) / (j1 - j0))
        return est, max(marge, min(12, abs(i1 - i0) // 6))
    # hors des repères : pente des deux repères les plus proches, marge plus large
    proches = (avant[-2:] if avant else apres[:2])
    if len(proches) == 2 and proches[1][0] != proches[0][0]:
        (j0, i0), (j1, i1) = proches
        pente = (i1 - i0) / (j1 - j0)
    else:
        pente = 1 / 365  # une image par an faute de mieux
        j0, i0 = proches[0]
    ecart_ans = abs(j - j0) / 365
    return round(i0 + pente * (j - j0)), min(15, marge + 1 + int(ecart_ans))


sortie = []
for e in evs:
    if e['n'] in fait or not e['dmy'] or e['tag'][:4] not in NATURE:
        continue
    nat = NATURE[e['tag'][:4]]
    d, m, y = e['dmy']
    j = date(y, m, d).toordinal()
    cands = []
    for (dgs, n2), pts in anc.items():
        if n2 != nat or dgs not in films:
            continue
        lo, hi = pts[0][0] - 30 * 365, pts[-1][0] + 30 * 365
        if lo <= j <= hi:
            dist = min(abs(j - p[0]) for p in pts)
            cands.append((dist, dgs, pts))
    regs = []
    for dist, dgs, pts in sorted(cands)[:2]:
        est, mg = estimer(pts, j)
        n_im = len(films[dgs]['arks'])
        est = max(1, min(n_im, est))
        ims = list(range(max(1, est - mg), min(n_im, est + mg) + 1))
        regs.append({'dgs': dgs, 'dossier': dgs, 'quoi': f"film FS {dgs} {films[dgs].get('titre', '')}".strip(),
                     'estimation': est, 'images': ims, 'repere_le_plus_proche_jours': dist})
    sortie.append({'n': e['n'], 'registres': regs})
json.dump(sortie, open(f'{D}/a_lire.json', 'w'), ensure_ascii=False, indent=1)
print(len(sortie), 'événements à lire ;', sum(1 for s in sortie if not s['registres']), 'sans film repéré')
for s in sortie:
    if not s['registres']:
        e = next(x for x in evs if x['n'] == s['n'])
        print('  sans film :', s['n'], e['tag'], e['date'])
