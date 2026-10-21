#!/usr/bin/env python3
"""
Static, subset faces for the Satori renderer (plan 1.2, 1.9; licence check in
docs/FONTS.md). Satori reads TTF, OTF and WOFF but not WOFF2, and wants one
static weight per file, so this takes the variable woff2 files already in
apps/web/public/fonts, pins one weight, keeps Basic Latin, Latin-1 and common
punctuation, and writes WOFF to apps/web/lib/design/og-fonts. The renamed
Akana Serif and Akana Sans keep their new names. Run by hand when a face changes.

    python3 scripts/build-og-fonts.py
"""
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent / "apps/web"
SRC = ROOT / "public/fonts"
OUT = ROOT / "lib/design/og-fonts"
UNICODES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x20AC]

# output name, source file, weight
FACES = [
    ("literata-700", "literata-latin-wght-normal.woff2", 700),
    ("akana-serif-700", "akana-serif-latin-wght-normal.woff2", 700),
    ("akana-sans-600", "akana-sans-latin-wght-normal.woff2", 600),
    ("bricolage-grotesque-600", "bricolage-grotesque-latin-wght-normal.woff2", 600),
    ("lexend-600", "lexend-latin-wght-normal.woff2", 600),
]

OUT.mkdir(parents=True, exist_ok=True)
for name, src, wght in FACES:
    f = TTFont(SRC / src)
    axes = {a.axisTag: a for a in f["fvar"].axes}
    loc = {"wght": wght}
    for tag, a in axes.items():
        if tag != "wght":
            loc[tag] = a.defaultValue
    f = instancer.instantiateVariableFont(f, loc)
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "calt"]
    opts.name_IDs = [0, 1, 2, 3, 4, 6]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(f)
    f.flavor = "woff"
    dst = OUT / f"{name}.woff"
    f.save(dst)
    print(dst.name, dst.stat().st_size)
