"""Rapproche les résultats de l'index FamilySearch (fs_index.jsonl) des événements (evenements.json).

  python3 -I apparier.py DOSSIER [--tout]

Un candidat est retenu d'office quand : même date exacte pour un fait de même nature (naissance/baptême,
décès/sépulture, mariage), prénom et nom concordants, et au moins un parent (ou le conjoint) concordant
sans contradiction. Les retenus vont dans DOSSIER/resultats.jsonl (source « index FS »), le reste est
affiché en une ligne par candidat plausible, pour un examen à l'œil (texte seulement, pas d'image).
"""
import json
import os
import sys
from difflib import SequenceMatcher

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gedcom import simple  # noqa: E402

dossier = sys.argv[1]
evs = {e['n']: e for e in json.load(open(f'{dossier}/evenements.json'))}
idx = {}
for l in open(f'{dossier}/fs_index.jsonl'):
    d = json.loads(l)
    idx[d['n']] = d.get('cands', [])
res_f = f'{dossier}/resultats.jsonl'
deja = {json.loads(l)['n'] for l in open(res_f)} if os.path.exists(res_f) else set()

NATURE = {'BIRT': 'n', 'BAPM': 'n', 'CHR': 'n', 'DEAT': 'd', 'BURI': 'd', 'MARR': 'm'}
FAITS = {'Birth': 'n', 'Christening': 'n', 'Baptism': 'n', 'Death': 'd', 'Burial': 'd', 'DeathRegistration': 'd',
         'Marriage': 'm', 'MarriageRegistration': 'm', 'MarriageBanns': 'm'}
EQUIV = [{'jan', 'joannes', 'johannes', 'jean', 'johan', 'joanna', 'jeanne', 'joanne'}, {'petrus', 'pierre', 'pieter', 'peter'},
         {'maria', 'marie', 'mari'}, {'elisabeth', 'elisabetha', 'elisa', 'elizabeth', 'isabella', 'lisa'},
         {'guilielmus', 'guilelmus', 'guillaume', 'willem', 'wilhelmus', 'gulielmus'}, {'henricus', 'henri', 'hendrik', 'henrick'},
         {'jacobus', 'jacques', 'jacob', 'jacomo'}, {'catharina', 'catherine', 'catharine', 'katharina'}, {'anna', 'anne'},
         {'adrianus', 'adriaen', 'adriaan', 'adrien'}, {'franciscus', 'frans', 'francois'}, {'cornelius', 'corneille', 'cornelis'},
         {'josephus', 'joseph', 'jozef'}, {'martinus', 'martin', 'marten', 'merten'}, {'antonius', 'antoine', 'anthonis', 'antoon'},
         {'michael', 'michiel', 'michel'}, {'judocus', 'joos', 'josse'}, {'egidius', 'gilles', 'gielis'}, {'dymphna', 'dimphna', 'dympna'},
         {'theresia', 'therese'}, {'ludovicus', 'louis', 'lodewijk'}, {'andreas', 'andre'}, {'renerius', 'rener', 'reinier'}]


def prenom_ok(a, b):
    a, b = simple(a), simple(b)
    if not a or not b:
        return None
    x, y = a[0], b[0]
    if x == y or SequenceMatcher(None, x, y).ratio() >= 0.75 or any(x in s and y in s for s in EQUIV):
        return True
    return any(t in b for t in a[:2]) or any(t in a for t in b[:2])


def nom_ok(a, b):
    a, b = ''.join(simple(a)), ''.join(simple(b))
    if not a or not b:
        return None
    for p in ('vander', 'vande', 'van', 'de'):
        a, b = a.removeprefix(p) if len(a) > len(p) + 3 else a, b.removeprefix(p) if len(b) > len(p) + 3 else b
    return a == b or SequenceMatcher(None, a, b).ratio() >= 0.78


def pers_ok(arbre, fs_nom):
    if not arbre or not fs_nom:
        return None
    t = fs_nom.split()
    if len(t) < 2:
        return prenom_ok(arbre['prenom'], fs_nom)
    # le nom de famille FS peut compter plusieurs mots : on essaie les découpages
    for k in range(1, len(t)):
        if prenom_ok(arbre['prenom'], ' '.join(t[:k])) and nom_ok(arbre['nom'], ' '.join(t[k:])):
            return True
    return False


def role(c, *noms):
    return next((n for r, n in c['proches'] if r in noms), None)


def juger(e, c):
    nat = NATURE.get(e['tag'][:4])
    d, m, y = e['dmy']
    cible = f'{y:04d}-{m:02d}-{d:02d}'
    dates = [(FAITS.get(t), ds) for t, _, ds, _ in c['faits']]
    exacte = any(f == nat and cible in ds for f, ds in dates)
    proche = nat == 'n' and any(f == 'n' and any(abs(int(x[-2:]) - d) <= 3 and x[:7] == cible[:7] for x in ds) for f, ds in dates)
    if e['kind'] == 'fam':
        a = pers_ok(e['mari'], c['nom']) and pers_ok(e['femme'], role(c, 'Spouse', 'Wife', 'Bride'))
        b = pers_ok(e['femme'], c['nom']) and pers_ok(e['mari'], role(c, 'Spouse', 'Husband', 'Groom'))
        noms = bool(a or b)
        liens = [True] if noms else []
    else:
        noms = bool(pers_ok(e['qui'], c['nom']))
        liens = [pers_ok(e['pere'], role(c, 'Father')), pers_ok(e['mere'], role(c, 'Mother'))]
        if nat == 'd' and e['conjoints']:
            liens.append(any(pers_ok(k, role(c, 'Spouse', 'Husband', 'Wife')) for k in e['conjoints']) or None)
        liens = [x for x in liens if x is not None]
    return noms, exacte, proche, liens


def resume(c):
    f = '; '.join(f'{t} {o}' for t, o, _, _ in c['faits'])
    p = ', '.join(f'{r} {n}' for r, n in c['proches'] if r not in ('Principal',))
    return f"{c['nom']} [{f}] {p} → {c['img']}"


retenus, reste = [], []
for n, e in sorted(evs.items()):
    if n in deja or not e['dmy'] or n not in idx:
        continue
    bons = []
    for c in idx[n]:
        if not c['img']:
            continue
        noms, exacte, proche, liens = juger(e, c)
        if noms and exacte and liens and all(liens):
            bons.append(c)
    imgs = {c['img'] for c in bons}
    if len(imgs) == 1:
        c = bons[0]
        retenus.append({'n': n, 'src': 'https://www.familysearch.org/ark:/61903/' + c['img'], 'origine': 'index FS', 'fiche_fs': c['fiche'],
                        'lu': resume(c)})
    else:
        reste.append((n, e, len(imgs)))

with open(res_f, 'a') as f:
    for r in retenus:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print(f'{len(retenus)} retenus d’office (ajoutés à resultats.jsonl), {len(reste)} à examiner')
if '--tout' in sys.argv:
    for n, e, k in reste:
        qui = f"{e['mari']['prenom']} {e['mari']['nom']} × {e['femme']['prenom']} {e['femme']['nom']}" if e['kind'] == 'fam' else \
            f"{e['qui']['prenom']} {e['qui']['nom']} (p. {(e['pere'] or {}).get('prenom', '')} {(e['pere'] or {}).get('nom', '')}, m. {(e['mere'] or {}).get('prenom', '')} {(e['mere'] or {}).get('nom', '')})"
        print(f"\n#{n} {e['tag']} {e['date']} {qui}" + (f' — {k} images concordantes' if k > 1 else ''))
        for c in idx.get(n, []):
            noms, exacte, proche, liens = juger(e, c)
            if noms or exacte or proche:
                print(f"   {'D' if exacte else ('d' if proche else '-')}{'N' if noms else '-'}{''.join('+' if x else '×' for x in liens)} {resume(c)}")
