#!/usr/bin/env python3
"""
Construit public/evenements.json : les événements historiques évoqués dans les récits.

    python3 -I scripts/evenements.py public/evenements.json

Deux sortes d'événements :
- ponctuels (batailles, sièges, incendies, inondations, explosions…), lus dans Wikidata (licence CC0) :
  un point et un rayon, pour l'Europe de l'Ouest de 1500 à 1960 ;
- étendus (épidémies, famines, hivers, guerres, changements de régime), écrits dans
  scripts/evenements-etendus.json : des pays ou des provinces, avec les codes de public/geo
  (« BE », « BE.WHT », « FR.59 », « NL.11 »).

Format : { "e": [ { "id", "t", "type", "d", "p", "f"?, "lat"?, "lon"?, "r"?, "z"?, "n", "w"? }, … ] }
  t : titre avec son article (« la bataille de Waterloo ») ; d, f : début et fin (AAAA, AAAA-MM ou AAAA-MM-JJ) ;
  p : précision de la date (9 année, 10 mois, 11 jour) ; r : rayon en km ; z : zones ; n : notoriété
  (nombre d'articles Wikipédia) ; w : titre de l'article de Wikipédia en français.
"""

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

POINT = 'https://query.wikidata.org/sparql'
AGENT = 'Lignees/1.0 (https://ici.be/gedcom/; script evenements.py)'

# Europe de l'Ouest, du Portugal au Danemark et de l'Irlande à l'Autriche
CADRE = {'lat': (35.5, 61.0), 'lon': (-11.0, 17.5)}
ANNEES = (1500, 1960)

# Type d'événement → classes Wikidata, rayon de base (km), notoriété minimale (articles Wikipédia).
# L'ordre compte : un siège qui est aussi une bataille reste un siège.
TYPES = [
    ('siege', ['Q188055'], 10, 3),
    ('bombardement', ['Q4688003'], 6, 3),
    ('massacre', ['Q3199915'], 6, 3),
    ('bataille', ['Q178561'], 12, 3),
    ('incendie', ['Q838718'], 4, 2),
    ('inondation', ['Q8068', 'Q121742'], 20, 2),
    ('seisme', ['Q7944'], 40, 2),
    ('explosion', ['Q179057'], 5, 3),
]

REQUETE = '''
SELECT ?e ?titre ?d ?pd ?d1 ?p1 ?d2 ?lat ?lon ?n ?article WHERE {{
  ?e wdt:P31/wdt:P279* wd:{classe} .
  ?e wikibase:sitelinks ?n . FILTER(?n >= {minimum})
  ?e rdfs:label ?titre . FILTER(LANG(?titre) = "fr")
  OPTIONAL {{ ?e p:P585/psv:P585 [ wikibase:timeValue ?d ; wikibase:timePrecision ?pd ] }}
  OPTIONAL {{ ?e p:P580/psv:P580 [ wikibase:timeValue ?d1 ; wikibase:timePrecision ?p1 ] }}
  OPTIONAL {{ ?e p:P582/psv:P582 [ wikibase:timeValue ?d2 ] }}
  FILTER(BOUND(?d) || BOUND(?d1))
  BIND(COALESCE(?d, ?d1) AS ?debut)
  FILTER(YEAR(?debut) >= {de} && YEAR(?debut) <= {a})
  {{ ?e wdt:P625 ?c }} UNION {{ ?e wdt:P276 ?l . ?l wdt:P625 ?c }}
  BIND(geof:latitude(?c) AS ?lat) BIND(geof:longitude(?c) AS ?lon)
  FILTER(?lat >= {lat0} && ?lat <= {lat1} && ?lon >= {lon0} && ?lon <= {lon1})
  OPTIONAL {{ ?article schema:about ?e ; schema:isPartOf <https://fr.wikipedia.org/> }}
}}
'''

# Article devant le titre, d'après le premier mot (les titres de Wikidata n'en ont pas). Les campagnes, invasions,
# occupations et expéditions, trop étendues pour un point et un rayon, n'en ont pas : elles sont écartées.
ARTICLES = {
    'la': ['bataille', 'prise', 'défense', 'chute', 'libération', 'catastrophe', 'crue', 'tempête', 'marée',
           'mutinerie', 'nuit', 'journée', 'révolte', 'rébellion', 'percée', 'charge', 'destruction', 'tuerie',
           'reddition', 'capitulation', 'surprise', 'déroute', 'rencontre', 'contre-offensive', 'grande',
           'première', 'deuxième', 'seconde', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'dernière'],
    'le': ['siège', 'combat', 'massacre', 'bombardement', 'raid', 'sac', 'incendie', 'grand', 'tremblement', 'séisme',
           'désastre', 'blocus', 'débarquement', 'passage', 'franchissement', 'pillage', 'raz-de-marée', 'naufrage', 'premier',
           'second', 'dernier', 'coup', 'soulèvement'],
    'l’': ['incendie', 'inondation', 'explosion', 'attaque', 'assaut', 'offensive', 'escarmouche', 'affaire', 'opération',
           'évacuation', 'embuscade', 'éruption'],
    'les': ['batailles', 'combats', 'massacres', 'inondations', 'bombardements', 'émeutes', 'journées', 'sièges'],
}
PREMIER_MOT = {m: a for a, l in ARTICLES.items() for m in l}


def avec_article(titre: str) -> str | None:
    """« bataille de Waterloo » → « la bataille de Waterloo » ; None si l'on ne sait pas l'article"""
    t = titre.strip()
    if not t:
        return None
    mot = t.split()[0].lower()
    if mot in ('le', 'la', 'les', 'l’', "l'") or t.lower().startswith(("l'", 'l’')):
        return t[0].lower() + t[1:]
    a = PREMIER_MOT.get(mot)
    if not a:
        return None
    if a == 'l’' or (a != 'les' and mot[0] in 'aeéèêiîoôuh'):
        return 'l’' + t[0].lower() + t[1:]
    return f'{a} {t[0].lower()}{t[1:]}'


def sparql(q: str) -> list[dict]:
    url = POINT + '?' + urllib.parse.urlencode({'query': q, 'format': 'json'})
    for essai in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': AGENT, 'Accept': 'application/sparql-results+json'})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)['results']['bindings']
        except Exception as e:  # serveur surchargé : on réessaie un peu plus tard
            print(f'  nouvel essai ({e})', file=sys.stderr)
            time.sleep(10 * (essai + 1))
    raise SystemExit('Wikidata ne répond pas')


def date(v: str, precision: int) -> str:
    """« +1815-06-18T00:00:00Z » → « 1815-06-18 », coupée à la précision donnée"""
    s = v.lstrip('+')[:10]
    return s[:4] if precision <= 9 else s[:7] if precision == 10 else s


def lire_type(type_: str, classes: list[str], rayon: int, minimum: int, vus: dict) -> None:
    for classe in classes:
        # Par tranches de siècles, pour ne pas dépasser le temps accordé à une requête
        for de in range(ANNEES[0], ANNEES[1] + 1, 100):
            a = min(de + 99, ANNEES[1])
            q = REQUETE.format(classe=classe, minimum=minimum, de=de, a=a, lat0=CADRE['lat'][0], lat1=CADRE['lat'][1],
                               lon0=CADRE['lon'][0], lon1=CADRE['lon'][1])
            lignes = sparql(q)
            print(f'{type_} {classe} {de}-{a} : {len(lignes)} lignes', file=sys.stderr)
            for l in lignes:
                id_ = l['e']['value'].rsplit('/', 1)[1]
                if id_ in vus and vus[id_]['type'] != type_:
                    continue  # déjà pris par un type plus précis
                e = vus.setdefault(id_, {'id': id_, 'type': type_, 'titre': l['titre']['value'], 'dates': [], 'fins': [],
                                         'points': set(), 'n': int(l['n']['value']), 'rayon': rayon})
                if 'd' in l:
                    e['dates'].append((int(l['pd']['value']), l['d']['value']))
                if 'd1' in l:
                    e['dates'].append((int(l['p1']['value']), l['d1']['value']))
                if 'd2' in l:
                    e['fins'].append(l['d2']['value'])
                e['points'].add((round(float(l['lat']['value']), 3), round(float(l['lon']['value']), 3)))
                if 'article' in l:
                    e['w'] = urllib.parse.unquote(l['article']['value'].rsplit('/wiki/', 1)[1]).replace('_', ' ')
            time.sleep(1)


def ponctuel(e: dict) -> dict | None:
    titre = avec_article(e['titre'])
    if not titre or not e['dates']:
        return None
    # La date la plus précise, puis la plus ancienne
    precision, d = sorted(e['dates'], key=lambda x: (-x[0], x[1]))[0]
    if precision < 9:
        return None  # connue à la décennie près : trop vague pour dire qui l'a vécue
    pts = sorted(e['points'])
    lat = sum(p[0] for p in pts) / len(pts)
    lon = sum(p[1] for p in pts) / len(pts)
    # Des points trop dispersés (une campagne entière) ne disent pas où cela s'est passé
    if max(abs(p[0] - lat) for p in pts) > 0.5 or max(abs(p[1] - lon) for p in pts) > 0.7:
        return None
    # Les grands événements touchent plus loin : jusqu'au double du rayon de base
    r = round(e['rayon'] * (1 + min(1.0, math.log10(max(1, e['n'])) / 2)))
    res = {'id': e['id'], 't': titre, 'type': e['type'], 'd': date(d, precision), 'p': min(precision, 11),
           'lat': round(lat, 3), 'lon': round(lon, 3), 'r': r, 'n': e['n']}
    fins = sorted(f for f in e['fins'] if f.lstrip('+')[:10] > d.lstrip('+')[:10])
    if fins:
        res['f'] = date(fins[-1], 11 if precision >= 11 else precision)
    if 'w' in e:
        res['w'] = e['w']
    return res


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    sortie = Path(sys.argv[1])
    vus: dict[str, dict] = {}
    for type_, classes, rayon, minimum in TYPES:
        lire_type(type_, classes, rayon, minimum, vus)
    liste = [x for x in (ponctuel(e) for e in vus.values()) if x]
    etendus = json.loads((Path(__file__).parent / 'evenements-etendus.json').read_text(encoding='utf-8'))
    liste += etendus
    liste.sort(key=lambda x: (x['d'], x['id']))
    sortie.write_text(json.dumps({'e': liste}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    par_type: dict[str, int] = {}
    for x in liste:
        par_type[x['type']] = par_type.get(x['type'], 0) + 1
    print(f'{len(liste)} événements ({", ".join(f"{t} {n}" for t, n in sorted(par_type.items()))}) → {sortie}', file=sys.stderr)


if __name__ == '__main__':
    main()
