"""Lecture minimale d'un export GEDCOM Geneanet (individus, familles, blocs d'événements)."""
import re
import unicodedata

MOIS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split()
MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']


def lire(chemin):
    recs, cur = {}, None
    for l in open(chemin, encoding='utf-8-sig'):
        m = re.match(r'(\d+) (@\S+@ )?(\S+) ?(.*)', l.rstrip('\n'))
        if not m:
            continue
        if m[1] == '0':
            cur = (m[2] or '').strip()
            recs[cur] = {'tag': m[3], 'lignes': []}
        elif cur is not None:
            recs[cur]['lignes'].append((int(m[1]), m[3], m[4]))
    return recs


class Arbre:
    def __init__(self, chemin):
        self.r = lire(chemin)

    def v(self, i, t, niv=1):
        return [x for lv, tt, x in self.r.get(i, {}).get('lignes', []) if lv == niv and tt == t]

    def nom(self, i):
        """(prénoms, nom) d'un individu."""
        n = (self.v(i, 'NAME') or ['/?/'])[0]
        m = re.match(r'(.*?)/(.*)/', n)
        return (m[1].strip(), m[2].strip()) if m else (n.strip(), '')

    def nom_complet(self, i):
        p, n = self.nom(i)
        return f'{p} {n}'.strip()

    def sexe(self, i):
        return (self.v(i, 'SEX') or ['?'])[0]

    def parents(self, i):
        f = self.v(i, 'FAMC')
        if not f:
            return None, None
        return (self.v(f[0], 'HUSB') or [None])[0], (self.v(f[0], 'WIFE') or [None])[0]

    def conjoints(self, i):
        out = []
        for f in self.v(i, 'FAMS'):
            for k in self.v(f, 'HUSB') + self.v(f, 'WIFE'):
                if k != i:
                    out.append(k)
        return out

    def blocs(self, i):
        """Événements (niveau 1) avec leurs sous-lignes."""
        out, b = [], None
        for lv, t, x in self.r[i]['lignes']:
            if lv == 1:
                b = [(lv, t, x)]
                out.append(b)
            elif b:
                b.append((lv, t, x))
        return out

    def ancetres(self, ref):
        anc, todo = {}, [(ref, 1)]
        while todo:
            i, s = todo.pop()
            if i in anc or i not in self.r:
                continue
            anc[i] = s
            pere, mere = self.parents(i)
            if pere:
                todo.append((pere, 2 * s))
            if mere:
                todo.append((mere, 2 * s + 1))
        return anc


def date_dmy(txt):
    """'05 JUL 1701' -> (5, 7, 1701) ; sinon None."""
    m = re.fullmatch(r'(\d{1,2}) ([A-Z]{3}) (\d{4})', (txt or '').strip())
    if not m or m[2] not in MOIS:
        return None
    return int(m[1]), MOIS.index(m[2]) + 1, int(m[3])


def date_fr(d, m, y):
    """Forme utilisée par les fiches Geneanet : « 5 juillet 1701 » (1er pour le premier)."""
    return f"{'1er' if d == 1 else d} {MOIS_FR[m - 1]} {y}"


def simple(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z ]', ' ', s).split()
