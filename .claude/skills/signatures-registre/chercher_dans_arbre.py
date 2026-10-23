#!/usr/bin/env python3
"""Cherche dans un GEDCOM les personnes qui correspondent aux signataires d'un acte.

Usage :
  chercher_dans_arbre.py [--ged FICHIER] "Louis De Maseneire" "M. De Maseneire" "Vanhove" ...

Pour chaque nom, liste les candidats les plus proches (orthographe tolérante :
« Demaeseneire » trouve « De Maseneire », « M. » trouve « Marie »…), avec dates,
parents, conjoints et l'état de leur média principal : signature (PNG), photo, ou rien.

Sans --ged, prend le plus récent bveyckemans_*.ged sous ~/Cricket.
"""
import argparse
import difflib
import glob
import os
import re
import unicodedata


def dernier_gedcom():
    fichiers = glob.glob(os.path.expanduser("~/Cricket/**/bveyckemans_*.ged"), recursive=True)
    return max(fichiers, key=os.path.getmtime) if fichiers else None


def lire(chemin):
    individus, familles, objets = {}, {}, {}
    rec = None
    pile = []
    with open(chemin, encoding="utf-8-sig", errors="replace") as f:
        for ligne in f:
            m = re.match(r"\s*(\d+)\s+(@[^@]+@\s+)?(\S+)\s?(.*)", ligne.rstrip("\r\n"))
            if not m:
                continue
            niv, xref, tag, val = int(m.group(1)), (m.group(2) or "").strip(), m.group(3), m.group(4)
            if niv == 0:
                rec = None
                if tag == "INDI":
                    rec = individus[xref] = {"id": xref, "nom": "", "prenom": "", "naiss": "", "deces": "",
                                             "media": [], "famc": [], "fams": []}
                elif tag == "FAM":
                    rec = familles[xref] = {"HUSB": None, "WIFE": None, "CHIL": []}
                elif tag == "OBJE":
                    rec = objets[xref] = {"FILE": ""}
                pile = [tag]
                continue
            if rec is None:
                continue
            pile = pile[:niv] + [tag]
            chemin_tag = "/".join(pile[1:])
            if "INDI" == pile[0]:
                if chemin_tag == "NAME" and not rec["nom"] and not rec["prenom"]:
                    n = re.match(r"([^/]*)(?:/([^/]*)/?)?(.*)", val)
                    rec["prenom"] = re.sub(r"\s+", " ", (n.group(1) + " " + n.group(3)).strip())
                    rec["nom"] = (n.group(2) or "").strip()
                elif chemin_tag == "BIRT/DATE":
                    rec["naiss"] = val.strip()
                elif chemin_tag == "DEAT/DATE":
                    rec["deces"] = val.strip()
                elif chemin_tag == "OBJE":
                    rec["media"].append(val.strip() or {"FILE": ""})
                elif chemin_tag == "OBJE/FILE" and rec["media"] and isinstance(rec["media"][-1], dict):
                    rec["media"][-1]["FILE"] = val.strip()
                elif chemin_tag == "FAMC":
                    rec["famc"].append(val.strip())
                elif chemin_tag == "FAMS":
                    rec["fams"].append(val.strip())
            elif pile[0] == "FAM" and niv == 1:
                if tag in ("HUSB", "WIFE"):
                    rec[tag] = val.strip()
                elif tag == "CHIL":
                    rec["CHIL"].append(val.strip())
            elif pile[0] == "OBJE" and chemin_tag == "FILE":
                rec["FILE"] = val.strip()
    for p in individus.values():
        p["media"] = [(objets.get(m, {}).get("FILE", "") if isinstance(m, str) else m["FILE"]) for m in p["media"]]
    return individus, familles


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("ij", "y").replace("ck", "k").replace("ch", "k").replace("ae", "a")
    return re.sub(r"[^a-z ]+", " ", s).split()


def proche(a, b):
    return difflib.SequenceMatcher(None, a, b).ratio()


def score(signe, p):
    """Meilleure correspondance entre le nom signé et la personne, sur tous les découpages prénom/nom."""
    mots = [m for m in norm(signe)]
    nom_p = "".join(norm(p["nom"]))
    prenoms_p = norm(p["prenom"])
    if not mots or not nom_p:
        return 0.0
    meilleur = 0.0
    for k in range(0, len(mots)):
        prenoms, nom = mots[:k], "".join(mots[k:])
        s_nom = proche(nom, nom_p)
        if s_nom < 0.75:
            continue
        s = s_nom
        for pr in prenoms:
            if len(pr) == 1:  # initiale
                ok = any(x.startswith(pr) for x in prenoms_p)
                s += 0.15 if ok else -0.5
            else:
                # « Elisa » pour « Elisabeth » : un début de prénom compte presque comme le prénom
                r = max((max(proche(pr, x), 0.85 if len(pr) >= 3 and x.startswith(pr) else 0) for x in prenoms_p), default=0)
                s += 0.3 * r if r >= 0.8 else -0.5
        meilleur = max(meilleur, s)
    # Signé dans l'autre ordre (« Vanackter Aloïse ») : retenter en inversant
    if len(mots) > 1 and not signe.startswith("~"):
        meilleur = max(meilleur, score("~" + " ".join(mots[-1:] + mots[:-1]), p) - 0.01)
    return meilleur


def annee(date):
    m = re.search(r"(\d{4})", date)
    return int(m.group(1)) if m else None


def selon_epoque(s, p, vers):
    """Avec l'année de l'acte : pénalise qui n'était pas né ou était mort, préfère les adultes."""
    if not vers:
        return s
    n, d = annee(p["naiss"]), annee(p["deces"])
    if (n and n > vers - 5) or (d and d < vers):
        return s - 1
    return s - (abs(vers - 35 - n) / 1000 if n else 0.02)


def etat_media(p):
    png = [u for u in p["media"] if re.search(r"\.png(\?|#|$)", u, re.I)]
    if png:
        return "SIGNATURE PRÉSENTE (média PNG)"
    if any(p["media"]):
        return "photo (JPG), pas de signature en média principal"
    return "aucun média"


def nom_complet(individus, i):
    p = individus.get(i)
    return f"{p['prenom']} {p['nom']}".strip() if p else "?"


def contexte(individus, familles, p):
    parents, conjoints = [], []
    for f in p["famc"]:
        fam = familles.get(f, {})
        parents += [nom_complet(individus, fam[r]) for r in ("HUSB", "WIFE") if fam.get(r)]
    for f in p["fams"]:
        fam = familles.get(f, {})
        conjoints += [nom_complet(individus, fam[r]) for r in ("HUSB", "WIFE") if fam.get(r) and fam[r] != p["id"]]
    return parents, conjoints


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("noms", nargs="+")
    ap.add_argument("--ged")
    ap.add_argument("--max", type=int, default=5)
    ap.add_argument("--vers", type=int, help="année de l'acte : écarte les personnes nées après, départage les homonymes")
    a = ap.parse_args()
    ged = a.ged or dernier_gedcom()
    if not ged:
        raise SystemExit("Aucun GEDCOM trouvé : passer --ged")
    individus, familles = lire(ged)
    print(f"GEDCOM : {ged} (modifié le {__import__('time').strftime('%Y-%m-%d', __import__('time').localtime(os.path.getmtime(ged)))}, {len(individus)} personnes)\n")
    for signe in a.noms:
        cands = sorted(((selon_epoque(score(signe, p), p, a.vers), p) for p in individus.values()), key=lambda t: -t[0])
        cands = [(s, p) for s, p in cands if s >= 0.8][: a.max]
        print(f"== {signe}")
        if not cands and len(norm(signe)) > 1:
            # Prénom introuvable : montrer les porteurs du nom (le prénom signé est peut-être mal lu)
            # (sans le premier mot, ou sans le dernier si la signature commence par le nom)
            mots = norm(signe)
            noms = [" ".join(mots[1:]), " ".join(mots[:-1])]
            cands = sorted(((selon_epoque(max(score(n, p) for n in noms), p, a.vers), p) for p in individus.values()),
                           key=lambda t: -t[0])
            cands = [(s, p) for s, p in cands if s >= 0.85][: a.max]
            nom = " / ".join(noms)
            if cands:
                print(f"   prénom introuvable ; porteurs du nom « {nom} » :")
        if not cands:
            print("   aucun candidat\n")
            continue
        for s, p in cands:
            parents, conjoints = contexte(individus, familles, p)
            dates = f"{p['naiss'] or '?'} – {p['deces'] or '?'}"
            print(f"   [{s:.2f}] {p['id']} {p['prenom']} {p['nom']} ({dates}) : {etat_media(p)}")
            if parents:
                print(f"          parents : {', '.join(parents)}")
            if conjoints:
                print(f"          conjoint(s) : {', '.join(conjoints)}")
        print()


if __name__ == "__main__":
    main()
