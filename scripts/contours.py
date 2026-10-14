#!/usr/bin/env python3
"""
Construit public/geo/contours.json : les contours des provinces et départements de la Belgique
et de ses voisins, pour la carte des origines de l'éventail imprimé.

    python3 -I scripts/contours.py <ne_10m_admin_1_states_provinces.geojson> public/geo/contours.json

Source : Natural Earth, Admin 1 – States, Provinces, 1:10m (domaine public),
https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_10m_admin_1_states_provinces.geojson

Format : { "r": { "BE.WHT": [[lon×100, lat×100, lon×100, lat×100, …], …anneaux], … } }
Les clés reprennent les codes GeoNames (voir codeRegion dans src/lib/geo.ts) : province belge
(BE.WHT), département français (FR.59), province néerlandaise et Land allemand (NL.06, DE.02),
district luxembourgeois (LU.D).
"""

import json
import sys

PAYS = {'BE', 'FR', 'NL', 'DE', 'LU'}
TOLERANCE = 0.012  # degrés (≈ 1 km) : bien en dessous de ce que voit l'œil sur la feuille


def garder(p: dict) -> bool:
    if p['iso_a2'] not in PAYS:
        return False
    if p['iso_a2'] == 'FR':
        return p['type_en'] == 'Metropolitan department'
    if p['iso_a2'] == 'NL':
        return p['type_en'] == 'Province'
    return True


def cle(p: dict) -> str:
    if p['iso_a2'] == 'LU':
        return 'LU.' + p['iso_3166_2'].split('-')[1]
    return p['gn_a1_code']


def simplifier(pts: list, tol: float) -> list:
    """Douglas-Peucker"""
    if len(pts) < 4:
        return pts
    garde = [False] * len(pts)
    garde[0] = garde[-1] = True
    pile = [(0, len(pts) - 1)]
    while pile:
        a, b = pile.pop()
        (x1, y1), (x2, y2) = pts[a], pts[b]
        dx, dy = x2 - x1, y2 - y1
        n = (dx * dx + dy * dy) ** 0.5 or 1e-12
        loin, ou = 0.0, -1
        for i in range(a + 1, b):
            x, y = pts[i]
            d = abs(dy * (x - x1) - dx * (y - y1)) / n if (dx or dy) else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
            if d > loin:
                loin, ou = d, i
        if loin > tol:
            garde[ou] = True
            pile += [(a, ou), (ou, b)]
    return [p for p, g in zip(pts, garde) if g]


def principal():
    source, cible = sys.argv[1], sys.argv[2]
    res = {}
    for f in json.load(open(source, encoding='utf-8'))['features']:
        p = f['properties']
        if not garder(p):
            continue
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        anneaux = []
        for poly in polys:
            for anneau in poly:
                s = simplifier(anneau, TOLERANCE)
                if len(s) < 4:
                    continue
                plat = []
                for lon, lat in s:
                    plat += [round(lon * 100), round(lat * 100)]
                anneaux.append(plat)
        if anneaux:
            res.setdefault(cle(p), []).extend(anneaux)
    with open(cible, 'w', encoding='utf-8') as out:
        json.dump({'r': dict(sorted(res.items()))}, out, separators=(',', ':'))
    print(len(res), 'régions')


if __name__ == '__main__':
    principal()
