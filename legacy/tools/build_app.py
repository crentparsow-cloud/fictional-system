"""Build the web app into app/dist.

- Validates every workbook in content/workbooks (except the template).
- Writes each workbook's app data to dist/workbooks/<id>.json, loaded at runtime.
- Inlines Focus as the first-paint workbook, plus the catalogue, markets and icon sprite.
- Regenerates functions/_shared/content.ts (week titles and stages for emails).
- Writes the edge worker to dist/_worker.js.
"""
import json, pathlib, shutil, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST = ROOT / "app" / "src", ROOT / "app" / "dist"
BOOKS = ROOT / "content" / "workbooks"
DEFAULT = "focus"

workbooks = {}
for f in sorted(BOOKS.glob("*.json")):
    if f.name.startswith("_"): continue
    data = json.loads(f.read_text(encoding="utf-8"))
    if data.get("status") == "template": continue
    mode = ["--pilot"] if data["id"] == DEFAULT else []
    if subprocess.run([sys.executable, str(ROOT / "tools" / "validate.py"), str(f), *mode]).returncode:
        sys.exit(f"{f.name} failed validation. Build stopped.")
    workbooks[data["id"]] = data

shutil.rmtree(DIST, ignore_errors=True); DIST.mkdir(parents=True)
for f in SRC.iterdir():
    if f.name == "index.html": continue
    if f.is_dir(): shutil.copytree(f, DIST / f.name)
    else: shutil.copy(f, DIST / f.name)

# Edge worker: /api/locale, /api/locale/geo and the /go/ book links (Cloudflare Pages advanced mode).
worker = (ROOT / "worker" / "worker.src.js").read_text()
assert worker.count("__DATA__") == 1
(DIST / "_worker.js").write_text(worker.replace("__DATA__", (ROOT / "worker" / "data.json").read_text()))

written = lambda x: not str(x.get("title", "")).startswith("[")
KEYS = ["id", "set_id", "safety_tier", "topic_name", "tagline", "start", "selfcheck", "checkin", "daily_check", "weeks", "milestones", "plan_sections", "finish", "stages", "safety_hub", "source_book"]
def app_data(src):
    d = {k: src[k] for k in KEYS if k in src}
    if "source_book" in d: d["source_book"] = {"title": src["source_book"]["title"], "author": src["source_book"]["author"]}
    # Book references and editor notes stay out of what readers download.
    strip = lambda x: {k: v for k, v in x.items() if k not in ("source", "sources", "notes")}
    d["exercises"] = [strip(e) for e in src["exercises"] if written(e)]
    d["exercise_titles"] = {e["id"]: e["title"] for e in src["exercises"]}
    d["toolkit"] = [strip(t) for t in src["toolkit"] if written(t)]
    d["toolkit_titles"] = {t["id"]: t["title"] for t in src["toolkit"]}
    return d

(DIST / "workbooks").mkdir()
for wid, src in workbooks.items():
    (DIST / "workbooks" / f"{wid}.json").write_text(json.dumps(app_data(src), ensure_ascii=False))

safe = lambda obj: json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")
html = (SRC / "index.html").read_text()
catalog = json.loads((ROOT / "content" / "catalog" / "catalog.json").read_text())
for cw in catalog.get("workbooks", []):  # one source of truth for workbook names
    if cw["id"] in workbooks: cw["name"] = workbooks[cw["id"]]["topic_name"]
markets = json.loads((ROOT / "content" / "catalog" / "markets.json").read_text())
sprite = (ROOT / "app" / "assets" / "sprite.svg").read_text()
support = json.loads((ROOT / "content" / "catalog" / "support_lines.json").read_text())
live = [{"id": wid, "topic_name": w["topic_name"], "status": w.get("status")} for wid, w in workbooks.items()]
for token in ("__DATA__", "__CATALOG__", "__MARKETS__", "__SPRITE__", "__LIVE__", "__SUPPORT__"):
    assert html.count(token) == 1, token
html = (html.replace("__CATALOG__", safe(catalog)).replace("__MARKETS__", safe(markets))
            .replace("__LIVE__", safe(live)).replace("__SUPPORT__", safe(support)).replace("__SPRITE__", sprite)
            .replace("__DATA__", safe(app_data(workbooks[DEFAULT]))))
(DIST / "index.html").write_text(html)

# Server content for emails: week titles and stages per workbook.
content = {wid: {"name": w["topic_name"],
                 "weeks": {str(wk["number"]): [next((e["title"] for e in w["exercises"] if e["id"] == x), x) for x in wk["exercise_ids"]] for wk in w["weeks"]},
                 "stages": {st["id"]: {"name": st["name"], "weeks": st["weeks"]} for st in w["stages"]}}
           for wid, w in workbooks.items()}
ts = ("// Generated from content/workbooks/*.json by the build. Do not edit by hand.\n"
      "export const WORKBOOKS: Record<string, {name: string; weeks: Record<string, string[]>; stages: Record<string, {name: string; weeks: number[]}>}> = "
      + json.dumps(content, ensure_ascii=False, indent=1) + ";\n")
old = (ROOT / "functions" / "_shared" / "content.ts").read_text()
tail = old[old.index("};", old.index("export const WORKBOOKS")) + 2:] if "export const WORKBOOKS" in old else ""
(ROOT / "functions" / "_shared" / "content.ts").write_text(ts + tail.lstrip(";\n"))
print("Built", DIST, "workbooks:", ", ".join(workbooks))
