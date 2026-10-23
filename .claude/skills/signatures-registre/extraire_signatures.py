#!/usr/bin/env python3
"""Extrait des signatures d'une image de registre en PNG transparents (encre noire).

Usage :
  extraire_signatures.py IMAGE --apercu apercu.png  --zone "x0,y0,x1,y1:Nom" ...
  extraire_signatures.py IMAGE --sortie DOSSIER     --zone "x0,y0,x1,y1:Nom" ...

Chaque zone est un rectangle en pixels de l'image d'origine suivi du nom du
fichier voulu (sans extension) ; pour des signatures imbriquées, une zone peut
réunir plusieurs rectangles : "x0,y0,x1,y1+x0,y0,x1,y1:Nom". Le fond du papier est estimé puis retiré, les
traits réglés horizontaux longs sont effacés, les petites taches sont
supprimées, et la signature est recadrée au plus près.

Ne dépend que de Pillow et numpy.
"""
import argparse
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


def lire_zone(texte):
    """« x0,y0,x1,y1[+x0,y0,x1,y1…]:Nom » → (rectangles, nom)."""
    rect = r"\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*"
    m = re.fullmatch(rf"({rect}(?:\+{rect})*)(?::(.*))?", texte)
    if not m:
        raise argparse.ArgumentTypeError(f"zone invalide : {texte!r} (attendu x0,y0,x1,y1:Nom)")
    rects = []
    for r in m.group(1).split("+"):
        x0, y0, x1, y1 = map(int, r.split(","))
        rects.append((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)))
    nom = (m.group(2) or "").strip() or f"signature_{rects[0][0]}_{rects[0][1]}"
    return rects, nom


def nom_de_fichier(nom):
    nom = re.sub(r'[\\/:*?"<>|]+', "", nom).strip()
    return re.sub(r"\s+", " ", nom) or "signature"


def encre(gris):
    """Intensité d'encre 0..1 après normalisation du fond (papier jauni, ombres)."""
    img = Image.fromarray(gris)
    rayon = max(8, min(gris.shape) // 4)
    # Fond = maximum local adouci : l'encre disparaît, le papier reste.
    fond = img.filter(ImageFilter.MaxFilter(15)).filter(ImageFilter.GaussianBlur(rayon))
    g = gris.astype(np.float32)
    f = np.maximum(np.asarray(fond, dtype=np.float32), 1.0)
    return np.clip(1.0 - g / f, 0.0, 1.0)


def seuil_otsu(valeurs):
    hist, bords = np.histogram(valeurs, bins=256, range=(0.0, 1.0))
    p = hist.astype(np.float64) / max(hist.sum(), 1)
    w = np.cumsum(p)
    mu = np.cumsum(p * bords[:-1])
    var = (mu[-1] * w - mu) ** 2 / np.maximum(w * (1 - w), 1e-12)
    return float(bords[np.argmax(var)])


def traits_horizontaux(masque, longueur):
    """Pixels appartenant à des segments horizontaux d'au moins `longueur` pixels."""
    h, w = masque.shape
    if w < longueur:
        return np.zeros_like(masque)
    # Une ligne légèrement inclinée occupe deux rangées : on fusionne avec la voisine.
    m = masque | np.roll(masque, 1, axis=0) | np.roll(masque, -1, axis=0)
    c = np.concatenate([np.zeros((h, 1), np.int32), np.cumsum(m, axis=1, dtype=np.int32)], axis=1)
    plein = (c[:, longueur:] - c[:, :-longueur]) >= int(0.95 * longueur)
    ligne = np.zeros((h, w), np.int32)
    d = np.concatenate([np.zeros((h, 1), np.int32), np.cumsum(plein, axis=1, dtype=np.int32)], axis=1)
    for x in range(w):
        a, b = max(0, x - longueur + 1), min(x + 1, plein.shape[1])
        if b > a:
            ligne[:, x] = d[:, b] - d[:, a]
    ligne = (ligne > 0) & masque
    # Ne garder que les parties minces (un trait réglé, pas un jambage vertical).
    epaisseur = np.zeros_like(ligne, dtype=np.int32)
    for dy in range(-3, 4):
        epaisseur += np.roll(masque, dy, axis=0)
    return ligne & (epaisseur <= 5)


def composantes(masque):
    """Étiquetage 8-connexe (union-find) ; renvoie étiquettes et tailles."""
    h, w = masque.shape
    parent = {}

    def racine(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    lab = np.zeros((h, w), np.int32)
    suivant = 1
    for y, x in zip(*np.nonzero(masque)):
        voisins = []
        for dy, dx in ((-1, -1), (-1, 0), (-1, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy and 0 <= xx < w and lab[yy, xx]:
                voisins.append(lab[yy, xx])
        if not voisins:
            lab[y, x] = parent[suivant] = suivant
            suivant += 1
        else:
            r = min(racine(v) for v in voisins)
            lab[y, x] = r
            for v in voisins:
                parent[racine(v)] = r
    if suivant == 1:
        return lab, {}
    table = np.zeros(suivant, np.int32)
    for k in range(1, suivant):
        table[k] = racine(k)
    lab = table[lab]
    ids, tailles = np.unique(lab[lab > 0], return_counts=True)
    return lab, dict(zip(ids.tolist(), tailles.tolist()))


def extraire(img, rects, autres=(), echelle=2, garder_lignes=False, marge=6, debord=60):
    """Les traits sont gardés entiers : un tracé qui touche la zone y est rattaché même s'il en
    déborde (hampe d'un « b », barre d'un « t »), sauf s'il appartient surtout à une autre zone
    (`autres`) ou au texte de l'acte."""
    l, h = img.size
    boite = (max(min(r[0] for r in rects) - debord, 0), max(min(r[1] for r in rects) - debord, 0),
             min(max(r[2] for r in rects) + debord, l), min(max(r[3] for r in rects) + debord, h))
    gris = np.asarray(ImageOps.grayscale(img.crop(boite)))
    if echelle != 1:
        gris = np.asarray(Image.fromarray(gris).resize(
            (gris.shape[1] * echelle, gris.shape[0] * echelle), Image.LANCZOS))
    e = encre(gris)

    def union(rs):
        m = np.zeros(e.shape, bool)
        for x0, y0, x1, y1 in rs:
            m[max(y0 - boite[1], 0) * echelle:max(y1 - boite[1], 0) * echelle,
              max(x0 - boite[0], 0) * echelle:max(x1 - boite[0], 0) * echelle] = True
        return m

    dedans = union(rects)
    s = max(seuil_otsu(e[dedans & (e > 0.02)]) if (dedans & (e > 0.02)).any() else 0.2, 0.12)
    masque = e >= s

    if not garder_lignes:
        masque &= ~traits_horizontaux(masque, longueur=max(40 * echelle, masque.shape[1] // 3))

    lab, tailles = composantes(masque)
    if not tailles:
        return None
    n = max(tailles) + 1
    chez_moi = np.bincount(lab[dedans], minlength=n)
    chez_autres = [np.bincount(lab[union(r)], minlength=n) for r in autres]
    plus_grand = max(chez_moi[1:].max(), 1)
    garder = np.zeros(n, bool)
    for k, t in tailles.items():
        moi = chez_moi[k]
        if moi == 0 or t < max(6 * echelle * echelle, 0.02 * plus_grand):
            continue  # hors zone, ou tache de grain du papier
        if any(c[k] > moi for c in chez_autres):
            continue  # tracé d'une signature voisine
        # Texte de l'acte qui ne fait qu'effleurer la zone : écarté
        garder[k] = moi >= 0.25 * t
    # Petite tache isolée (poussière, pâté) à l'écart de l'écriture : écartée. Les points
    # d'initiales (« J. B. ») sont gardés, ils sont proches des lettres.
    grands = np.zeros(n, bool)
    plus_grand_garde = max((tailles[k] for k in tailles if garder[k]), default=0)
    for k in tailles:
        grands[k] = garder[k] and tailles[k] >= 0.1 * plus_grand_garde
    voisinage = Image.fromarray(grands[lab].astype(np.uint8) * 255)
    for _ in range(6):  # environ 15 px de l'image d'origine
        voisinage = voisinage.filter(ImageFilter.MaxFilter(2 * (5 * echelle // 2) + 1))
    voisinage = np.asarray(voisinage) > 0
    proches = np.bincount(lab[voisinage], minlength=n)
    for k in tailles:
        if garder[k] and not grands[k] and proches[k] == 0:
            # Un bout de trait allongé (fin de paraphe estompée) reste ; une tache ronde part.
            ys, xs = np.nonzero(lab == k)
            long_, large = max(np.ptp(xs), np.ptp(ys)) + 1, min(np.ptp(xs), np.ptp(ys)) + 1
            garder[k] = long_ >= 3 * large and long_ >= 8 * echelle
    masque = garder[lab]
    e = np.where(masque | (np.asarray(Image.fromarray(masque.astype(np.uint8) * 255)
                                      .filter(ImageFilter.MaxFilter(3))) > 0), e, 0.0)

    # Alpha doux : bords anti-crénelés autour du masque (dilaté d'un pixel).
    proche = np.asarray(Image.fromarray(masque.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    bas = s * 0.6
    alpha = np.clip((e - bas) / max(s * 1.4 - bas, 1e-3), 0, 1)
    alpha = np.where(masque, np.maximum(alpha, 0.85), np.where(proche, alpha, 0.0))
    alpha = (alpha * 255).astype(np.uint8)

    ys, xs = np.nonzero(alpha > 20)
    if len(xs) == 0:
        return None
    m = marge * echelle
    y0, y1 = max(ys.min() - m, 0), min(ys.max() + m + 1, alpha.shape[0])
    x0, x1 = max(xs.min() - m, 0), min(xs.max() + m + 1, alpha.shape[1])
    alpha = alpha[y0:y1, x0:x1]
    rgba = np.zeros(alpha.shape + (4,), np.uint8)
    rgba[..., 3] = alpha
    return Image.fromarray(rgba, "RGBA")


def apercu(img, zones, chemin):
    a = img.convert("RGB")
    d = ImageDraw.Draw(a)
    couleurs = [(255, 0, 0), (0, 160, 0), (0, 0, 255), (220, 120, 0), (180, 0, 180)]
    for i, (rects, nom) in enumerate(zones, 1):
        c = couleurs[(i - 1) % len(couleurs)]
        for b in rects:
            d.rectangle(b, outline=c, width=3)
        d.text((rects[0][0] + 4, rects[0][1] + 2), f"{i}. {nom}", fill=c)
    a.save(chemin)
    print(chemin)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("image")
    p.add_argument("--zone", action="append", type=lire_zone, required=True)
    p.add_argument("--sortie", help="dossier des PNG")
    p.add_argument("--exclure", action="append", default=[], type=lambda t: lire_zone(t)[0],
                   help="zone à ne pas extraire mais dont les tracés ne doivent pas déborder ailleurs "
                        "(paraphe de l'officier, texte voisin) : x0,y0,x1,y1[+…]")
    p.add_argument("--apercu", help="image de contrôle avec les zones dessinées")
    p.add_argument("--echelle", type=int, default=2, help="agrandissement avant traitement (défaut 2)")
    p.add_argument("--garder-lignes", action="store_true", help="ne pas effacer les traits réglés")
    p.add_argument("--fond-controle", help="dossier où écrire aussi chaque signature sur fond blanc (vérification)")
    a = p.parse_args()

    img = Image.open(a.image)
    img = ImageOps.exif_transpose(img)
    if a.apercu:
        apercu(img, a.zone, a.apercu)
    if not a.sortie:
        return
    os.makedirs(a.sortie, exist_ok=True)
    if a.fond_controle:
        os.makedirs(a.fond_controle, exist_ok=True)
    for i, (rects, nom) in enumerate(a.zone):
        autres = [r for j, (r, _) in enumerate(a.zone) if j != i] + a.exclure
        sig = extraire(img, rects, autres, a.echelle, a.garder_lignes)
        if sig is None:
            print(f"rien trouvé dans {rects} ({nom})", file=sys.stderr)
            continue
        base = nom_de_fichier(nom)
        chemin = os.path.join(a.sortie, base + ".png")
        n = 2
        while os.path.exists(chemin):
            chemin = os.path.join(a.sortie, f"{base} ({n}).png")
            n += 1
        sig.save(chemin, optimize=True)
        print(chemin)
        if a.fond_controle:
            blanc = Image.new("RGBA", sig.size, (255, 255, 255, 255))
            blanc.alpha_composite(sig)
            blanc.convert("RGB").save(os.path.join(a.fond_controle, os.path.basename(chemin)))


if __name__ == "__main__":
    main()
