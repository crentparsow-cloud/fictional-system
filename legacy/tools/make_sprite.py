"""Build the inline Phosphor icon sprite (MIT licence) used by the app.
Run with the @phosphor-icons/core package path as the first argument."""
import re, sys, pathlib
B = pathlib.Path(sys.argv[1]) / "assets"
OUT = pathlib.Path(__file__).resolve().parent.parent / "app" / "assets" / "sprite.svg"
UI = """house sun-horizon toolbox books user-circle lifebuoy caret-left caret-right caret-down x check check-circle
arrow-square-out fingerprint funnel-simple hourglass bell-simple-slash play stop pause plus printer sign-out trash
globe-hemisphere-west moon-stars lock-key eye eye-slash calendar-plus warning-circle key sparkle clock list-checks
arrow-clockwise envelope-simple device-mobile calendar-blank chart-line-up timer phone lightning arrow-right""".split()
FILL = "house sun-horizon toolbox books user-circle".split()
DUO = """wind hand-palm lightbulb timer hourglass-medium envelope-simple notepad broom hand-heart arrow-counter-clockwise
bell text-aa download-simple handshake lock-key credit-card globe-hemisphere-west question file-text info shield-check
book-open calendar-blank map-trifold target plant anchor clock moon-stars user sparkle sun-horizon door path
pencil-simple-line desk device-mobile device-mobile-slash cards chart-bar kanban folders book-open-text chart-line-up
flag seal-check fingerprint list-checks timer""".split()
inner = lambda p: re.search(r"<svg[^>]*>(.*)</svg>", p.read_text(), re.S).group(1)
out = ['<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">']
sym = lambda i, body: f'<symbol id="{i}" viewBox="0 0 256 256" fill="currentColor">{body}</symbol>'
for n in dict.fromkeys(UI): out.append(sym(f"i-{n}", inner(B / "regular" / f"{n}.svg")))
for n in dict.fromkeys(FILL): out.append(sym(f"f-{n}", inner(B / "fill" / f"{n}-fill.svg")))
for n in dict.fromkeys(DUO): out.append(sym(f"d-{n}", inner(B / "duotone" / f"{n}-duotone.svg")))
out.append("</svg>")
OUT.write_text("".join(out)); print(OUT, len("".join(out)))
