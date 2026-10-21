#!/usr/bin/env python3
"""
Self-hosted faces for the three design directions (1.4, 14.11). Run by hand
when a font version changes, then commit what it writes.

    python3 scripts/build-direction-fonts.py

It packs the pinned Fontsource variable packages (all SIL Open Font Licence
1.1) with `npm pack`, checks the licence field, takes the Latin weight-axis
files, and copies them into apps/web/public/fonts/. Where the licence names a
Reserved Font Name ("Source", Adobe) the copy is a modified version, so the
internal name table is rewritten and the file is called Akana Serif or Akana
Sans. Literata has no Reserved Font Name and ships unchanged. The OFL texts go
to apps/web/public/fonts/LICENCES. docs/FONTS.md records the check.
"""
import json, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path
from fontTools.ttLib import TTFont

VERSION = "5.3.0"
OUT = Path(__file__).resolve().parent.parent / "apps/web/public/fonts"
LIC = OUT / "LICENCES"

# pkg, file stem, styles, rename-to (None keeps the name), licence file slug
FACES = [
    ("literata", "literata", ["normal", "italic"], None, "literata"),
    ("source-serif-4", "source-serif-4", ["normal", "italic"], ("Akana Serif", "AkanaSerif"), "akana-serif-from-source-serif-4"),
    ("source-sans-3", "source-sans-3", ["normal"], ("Akana Sans", "AkanaSans"), "akana-sans-from-source-sans-3"),
]

def rename(font, family, ps):
    for rec in list(font["name"].names):
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID == 4:
            rec.string = family
        elif rec.nameID == 6:
            rec.string = ps
        elif rec.nameID in (3,):
            rec.string = f"{ps};Akana subset"
        elif rec.nameID in (7, 8, 9, 11, 12, 13, 14, 18, 20, 21, 22, 23, 24, 25):
            pass
    # Named instances in fvar keep their style words only; strip the old family from any full names.
    for rec in list(font["name"].names):
        if rec.nameID in (7, 25):
            font["name"].names.remove(rec)

def main():
    LIC.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="akana-dirfonts-"))
    try:
        for pkg, stem, styles, ren, lic in FACES:
            name = subprocess.check_output(["npm", "pack", f"@fontsource-variable/{pkg}@{VERSION}", "--silent"], cwd=work, text=True).strip().splitlines()[-1]
            dest = work / pkg
            dest.mkdir()
            with tarfile.open(work / name) as t:
                t.extractall(dest, filter="data")
            root = dest / "package"
            meta = json.loads((root / "package.json").read_text())
            if meta["license"] != "OFL-1.1":
                sys.exit(f"{pkg}: licence is {meta['license']}, expected OFL-1.1")
            for style in styles:
                src = root / "files" / f"{stem}-latin-wght-{style}.woff2"
                out_stem = (ren[0].lower().replace(" ", "-") if ren else stem)
                dst = OUT / f"{out_stem}-latin-wght-{style}.woff2"
                if ren:
                    f = TTFont(src)
                    rename(f, ren[0], ren[1])
                    f.flavor = "woff2"
                    f.save(dst)
                else:
                    shutil.copyfile(src, dst)
                print(dst.name, dst.stat().st_size)
            shutil.copyfile(root / "LICENSE", LIC / f"{lic}-OFL.txt")
    finally:
        shutil.rmtree(work, ignore_errors=True)

main()
