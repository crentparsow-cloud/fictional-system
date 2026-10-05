#!/usr/bin/env python3
"""Akana workbook validator.

Usage:
    python3 tools/validate.py content/workbooks/focus.json [more files...]
    python3 tools/validate.py --template content/workbooks/_template.json

Checks, in order:
  1. Structure against content/schema/workbook.schema.json
  2. House style (docs/WB_Voice_and_Tone.md): banned characters, "I"/"We" sentence
     starts, UK spellings, old glossary names, banned phrases, print verbs, breath
     counts without a unit or an optional hold, the "is not X. It is Y." pattern
     (once per workbook at most), and contractions in safety, crisis and consent text.
     Contractions are allowed in all other reader copy.
  3. Claim words that imply treatment, diagnosis or outcomes
  4. Word limits from WB_Workbook_Design_v2 and the product spec
  5. Cross-references: every id used is defined, no duplicates
  6. Counts: 12 weeks, 4 stages, 22-24 exercises, 7-8 repeatable, 8-10 toolkit cards,
     10-12 milestones (skipped with --template)

Exit code 0 means clean. Any error prints and exits 1.
"""
import json
import re
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    sys.exit("jsonschema is required: pip install jsonschema")

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = json.loads((ROOT / "content/schema/workbook.schema.json").read_text(encoding="utf-8"))
_cat = json.loads((ROOT / "content" / "catalog" / "catalog.json").read_text(encoding="utf-8"))
CATALOG = _cat["books"] if isinstance(_cat, dict) else _cat

BANNED_CHARS = {
    "—": "em dash", "–": "en dash", "‒": "figure dash", "―": "horizontal bar",
    "“": "curly double quote", "”": "curly double quote",
    "‘": "curly single quote", "’": "curly single quote", "…": "ellipsis character",
}
EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF]")

# Claim words. Matched as whole words, case-insensitive. Keep this list conservative
# and review with Claims Compliance before changing.
CLAIM_PATTERNS = [
    r"\btreat(s|ed|ing|ment|ments)?\b", r"\bcure(s|d)?\b", r"\bheal(s|ed|ing)?\b",
    r"\bdiagnos\w*", r"\bsymptom(s)? (relief|reduction)\b", r"\breduc\w* (your )?symptoms?\b",
    r"\bclinically (proven|shown)\b", r"\bguarantee\w*",
    # Effectiveness claims (decision 1 Oct 2026: never say how well an exercise works)
    r"\bproven\b", r"\bscientifically\b", r"\b(research|studies|a study|evidence|science) (shows?|suggests?|has shown|have shown|found|finds|says)\b",
    r"\b(most|more|very|highly) effective\b", r"\bworks? better\b", r"\bone of the (best|quickest|fastest|most)\b",
    r"\bmost people find\b", r"\b\d+ ?(percent|%)",
    r"\b(it|this|these|that|doing this) (can |will |may |should |often |usually )?(help|helps|calm|calms|ease|eases|reduce|reduces|improve|improves|lower|lowers|settle|settles|boost|boosts|fix|fixes)\b",
    r"\bcalm(s|ing)? your nervous system\b", r"\b(switch|switches|turn|turns) on (your|the) (body's )?calm", r"\byou (have|may have|probably have) (adhd|anxiety|depression|ptsd|ocd|bipolar)\b",
]
CLAIM_RE = re.compile("|".join(CLAIM_PATTERNS), re.IGNORECASE)
# Negated uses that are allowed, e.g. "This is a personal check, not a diagnosis."
CLAIM_ALLOW = re.compile(r"\bif (it|this|that) (helps|eases|calms)\b|\bnot (a |an )?(diagnos\w*|treatment|medical treatment|cure)\b|\b(does not|doesn't|never) (diagnose|treat)\b", re.IGNORECASE)

# House style from docs/WB_Voice_and_Tone.md. All matched case-insensitively on reader copy.
UK_SPELLINGS = [
    (r"\bcolour\w*", "color"), (r"\borganis\w*", "organize"),
    (r"\bbehaviour\w*", "behavior"), (r"\bfavourite\w*", "favorite"), (r"\bcentre\w*", "center"),
    (r"\bmums?\b", "mom"), (r"\brealis(e|ed|es|ing)\b", "realize"), (r"\bprogramme\w*", "program"),
    (r"\bcancelled\b|\bcancelling\b", "canceled"), (r"\blabelled\b", "labeled"),
    (r"\bstraight away\b", "right away"), (r"\bany more\b", "anymore"),
    (r"\bdissertation\w*", "thesis"),
]
BANNED_PHRASES = [
    # Old glossary names (one name per concept)
    r"\baccountability partner", r"\bdaily operating system", r"\b2-minute version",
    r"\btwo-minute version", r"\bminimum morning", r"\btoolkit cards?\b", r"\blow days\b",
    r"\bdaily check-in\b", r"\bTillstep\b",
    # Deficit wording
    r"\bbad (day|days|patch|week)\b", r"\bfail(s|ed|ing|ure|ures)?\b",
    # Stern or dismissive orders
    r"\bskip the guilt\b", r"\bnothing else\.", r"\bjust that\.", r"\beverything\.\s+everything\b",
    r"\byou must\b", r"\byou should\b",
    # Stock images, overpromises and generic praise
    r"\bout of sight\b", r"\bautopilot\b", r"\bmarathon\b", r"\bembarrassingly\b",
    r"\blook forward to\b", r"\bjourney\b", r"\bgame[ -]?changer\b", r"\bunlock\b",
    r"\bsupercharge\w*", r"\bsimply\b", r"\byou did it\b", r"\bnice steady work\b",
    # Comparison with other people
    r"\bdoing better than\b", r"\bthan other people\b",
    # Print verbs in a tap-based app
    r"\bcircle\b", r"\btick\b",
    # Old stage names in prose
    r"\b(Map|Use) stage\b",
    # Breathing: say inhale and exhale
    r"\bbreathe (in|out)\b",
]
BANNED_RE = [re.compile(p, re.IGNORECASE) for p in BANNED_PHRASES]
UK_RE = [(re.compile(p, re.IGNORECASE), fix) for p, fix in UK_SPELLINGS]
# "X is not Y. It is Z." Allowed at most once per workbook.
NOT_IS_RE = re.compile(r"\b(is not|isn't|are not|aren't)\b[^.]{1,80}\.\s+(It is|It's|They are|They're)\b", re.IGNORECASE)
# Breath counts need a unit ("count to four", "a count of four"), and a hold needs an opt-out.
BREATH_RE = re.compile(r"\b(inhale|exhale|hold)\b[^.]*\b(two|three|four|five|six|seven|eight|\d+)\b", re.IGNORECASE)
HOLD_RE = re.compile(r"\bhold (for|your breath)\b", re.IGNORECASE)
HOLD_OPTOUT_RE = re.compile(r"\bskip\b|\bif it feels\b|\boptional\b", re.IGNORECASE)
# Contractions: n't, 're, 've, 'll, 'd, 'm, and 's only after pronouns (so possessives pass).
CONTRACTION_RE = re.compile(r"\b\w+n't\b|\b\w+'(re|ve|ll|d|m)\b|\b(it|that|there|here|what|who|where|he|she|let)'s\b", re.IGNORECASE)
# Safety, crisis, consent and legal text: no contractions. A string counts as safety text if
# its key is listed here, or if it mentions any of the safety words below.
SAFETY_KEYS = {"extra_safety_note", "higher_tier_note", "safety_note", "consent", "legal", "crisis"}
SAFETY_WORDS_RE = re.compile(
    r"\bhelp now\b|\bdanger\w*|\bcrisis\b|\bemergenc\w*|\bharm\w*|\bhurting yourself\b|\bnot wanting to be here\b"
    r"|\bsafe(ty)?\b|\bdoctor\b|\bhealth professional\b|\bprescri\w*|\bmedication\b|\bsuicid\w*|\bconsent\b",
    re.IGNORECASE)

# Word limits by JSON path pattern. Paths use dotted keys with [] for list items.
LIMITS = {
    "exercises[].title": 6,
    "exercises[].purpose": 20,
    "exercises[].why": 60,
    "exercises[].steps[].text": 20,
    "exercises[].short_version.steps[].text": 20,
    "exercises[].example.text": 120,
    "exercises[].done_when": 20,
    "exercises[].reflect": 25,
    "toolkit[].title": 6,
    "toolkit[].steps[]": 15,
    "toolkit[].when_to_use": 20,
    "stages[].primer.body": 120,
    "stages[].outcome": 25,
    "milestones[].message": 25,
    "selfcheck.items[].text": 20,
    "checkin.fields[].label": 12,
    "start.welcome": 80,
    "tagline": 14,
}

# Fields that are notes for the agency, not reader copy. Skipped by style checks.
NON_READER_KEYS = {"cut_log", "source", "manuscript_file", "id", "trigger", "figure", "status", "set_id",
                   "safety_tier", "schema_version", "area", "stage", "field_id", "plan_section",
                   "toolkit_link", "stuck_alternative", "type", "character"}


def walk(node, path=""):
    """Yield (path, string) for every string in the document."""
    if isinstance(node, dict):
        for k, v in node.items():
            yield from walk(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v, f"{path}[]")
    elif isinstance(node, str):
        yield path, node


def is_reader_copy(path):
    parts = re.split(r"[.\[\]]+", path)
    return not any(p in NON_READER_KEYS for p in parts)


def words(s):
    return len(re.findall(r"[A-Za-z0-9']+", s))


def check_style(doc, errors):
    for path, s in walk(doc):
        if not is_reader_copy(path):
            continue
        for ch, name in BANNED_CHARS.items():
            if ch in s:
                errors.append(f"style: {name} in {path}: {s[:60]!r}")
        if EMOJI.search(s):
            errors.append(f"style: emoji in {path}")
        # Quoted speech is exempt: characters may say "I".
        for sentence in re.split(r"(?<=[.!?])\s+", re.sub(r'"[^"]*"', '"q"', s)):
            if re.match(r"^(I|We)\b", sentence.strip()):
                errors.append(f"style: sentence starts with I/We in {path}: {sentence[:50]!r}")
        if "!" in s:
            errors.append(f"style: exclamation mark in {path}")
        for m in CLAIM_RE.finditer(CLAIM_ALLOW.sub("", s)):
            errors.append(f"claims: '{m.group(0)}' in {path}: {s[:70]!r}")
        for rx, fix in UK_RE:
            for m in rx.finditer(s):
                errors.append(f"style: UK spelling '{m.group(0)}' (use {fix}) in {path}")
        for rx in BANNED_RE:
            for m in rx.finditer(s):
                errors.append(f"style: banned phrase '{m.group(0)}' in {path}: {s[:60]!r}")
        for sentence in re.split(r"(?<=[.!?])\s+", s):
            if BREATH_RE.search(sentence) and not re.search(r"\bcount", sentence, re.IGNORECASE):
                errors.append(f"style: breath count without a unit ('count to four') in {path}: {sentence[:60]!r}")
        if HOLD_RE.search(s) and not HOLD_OPTOUT_RE.search(s):
            errors.append(f"style: breath hold without an opt-out in {path}: {s[:60]!r}")
        parts = set(re.split(r"[.\[\]]+", path))
        if parts & SAFETY_KEYS or SAFETY_WORDS_RE.search(s):
            for m in CONTRACTION_RE.finditer(s):
                errors.append(f"style: contraction '{m.group(0)}' in safety, crisis or consent text in {path}: {s[:60]!r}")
    pattern_hits = [p for p, s in walk(doc) if is_reader_copy(p) and NOT_IS_RE.search(s)]
    if len(pattern_hits) > 1:
        errors.append(f"style: 'is not X. It is Y.' used {len(pattern_hits)} times, at most once per workbook: {pattern_hits}")


def check_limits(doc, errors):
    for path, s in walk(doc):
        if path in LIMITS and words(s) > LIMITS[path]:
            errors.append(f"limit: {path} has {words(s)} words, limit {LIMITS[path]}: {s[:60]!r}")


def check_refs(doc, errors):
    ex_ids = [e["id"] for e in doc["exercises"]]
    tk_ids = [t["id"] for t in doc["toolkit"]]
    st_ids = [s["id"] for s in doc["stages"]]
    plan_ids = [p["id"] for p in doc["plan_sections"]]
    area_ids = [a["id"] for a in doc["selfcheck"]["areas"]]
    for name, ids in [("exercise", ex_ids), ("toolkit", tk_ids), ("stage", st_ids), ("plan", plan_ids), ("area", area_ids)]:
        dupes = {i for i in ids if ids.count(i) > 1}
        if dupes:
            errors.append(f"refs: duplicate {name} ids {sorted(dupes)}")
    used_ex = []
    for w in doc["weeks"]:
        if w["stage"] not in st_ids:
            errors.append(f"refs: week {w['number']} stage {w['stage']} not defined")
        for e in w["exercise_ids"]:
            used_ex.append(e)
            if e not in ex_ids:
                errors.append(f"refs: week {w['number']} uses undefined exercise {e}")
        for t in w.get("new_toolkit_ids", []):
            if t not in tk_ids:
                errors.append(f"refs: week {w['number']} uses undefined toolkit card {t}")
    for e in doc["exercises"]:
        fids = [f["id"] for f in e["fields"]]
        for fid in e["short_version"]["field_ids"]:
            if fid not in fids:
                errors.append(f"refs: {e['id']} short version uses undefined field {fid}")
        for fp in e.get("feeds_plan", []):
            if fp["field_id"] not in fids:
                errors.append(f"refs: {e['id']} feeds_plan uses undefined field {fp['field_id']}")
            if fp["plan_section"] not in plan_ids:
                errors.append(f"refs: {e['id']} feeds undefined plan section {fp['plan_section']}")
        if e.get("toolkit_link") and e["toolkit_link"] not in tk_ids:
            errors.append(f"refs: {e['id']} links undefined toolkit card {e['toolkit_link']}")
        if e.get("stuck_alternative") and e["stuck_alternative"] not in ex_ids:
            errors.append(f"refs: {e['id']} stuck_alternative {e['stuck_alternative']} not defined")
    for w in doc["weeks"]:
        for r in w.get("repeat_ids", []):
            ex = next((x for x in doc["exercises"] if x["id"] == r), None)
            if ex is None:
                errors.append(f"refs: week {w['number']} repeats undefined exercise {r}")
            elif w["number"] not in ex.get("repeat_weeks", []):
                errors.append(f"refs: week {w['number']} repeats {r} but {r}.repeat_weeks does not include it")
    for e in doc["exercises"]:
        for rw in e.get("repeat_weeks", []):
            if not any(w["number"] == rw and e["id"] in w.get("repeat_ids", []) for w in doc["weeks"]):
                errors.append(f"refs: {e['id']} says it repeats in week {rw} but that week does not list it")
    for e in ex_ids:
        if e not in used_ex:
            errors.append(f"refs: exercise {e} is defined but not placed in any week")
    for item in doc["selfcheck"]["items"]:
        if item["area"] not in area_ids:
            errors.append(f"refs: self-check item {item['id']} uses undefined area {item['area']}")
    cids = [f["id"] for f in doc["checkin"]["fields"]]
    for fid in doc["checkin"]["short_field_ids"]:
        if fid not in cids:
            errors.append(f"refs: check-in short field {fid} not defined")
    for r in doc["keep_going"]["refresher_ids"]:
        if r not in ex_ids:
            errors.append(f"refs: keep_going refresher {r} not defined")
    weeks = sorted(w["number"] for w in doc["weeks"])
    if weeks != list(range(1, 13)):
        errors.append(f"refs: weeks must be 1 to 12 exactly once, got {weeks}")
    sc_weeks = sorted(w["number"] for w in doc["weeks"] if w.get("selfcheck"))
    if sc_weeks != [6, 12]:
        errors.append(f"refs: self-check weeks must be 6 and 12, got {sc_weeks}")


def check_counts(doc, errors):
    n_ex = len(doc["exercises"])
    n_rep = sum(1 for e in doc["exercises"] if e.get("repeat_weeks"))
    n_tk = len(doc["toolkit"])
    n_ms = len(doc["milestones"])
    if not 22 <= n_ex <= 24:
        errors.append(f"count: {n_ex} exercises, need 22 to 24")
    if not 7 <= n_rep <= 8:
        errors.append(f"count: {n_rep} repeatable exercises, need 7 to 8")
    if not 8 <= n_tk <= 10:
        errors.append(f"count: {n_tk} toolkit cards, need 8 to 10")
    if not 10 <= n_ms <= 12:
        errors.append(f"count: {n_ms} milestones, need 10 to 12")
    if doc["safety_tier"] == "higher" and not doc["start"].get("higher_tier_note"):
        errors.append("count: higher-tier workbook needs start.higher_tier_note")
    # Decision 1 Oct 2026: every workbook has community exercises done with or for others.
    n_comm = sum(1 for e in doc["exercises"] if e.get("community"))
    if n_comm < 2:
        errors.append(f"count: {n_comm} community exercises, need at least 2")
    if "safety_hub" not in doc:
        errors.append("count: safety_hub section missing")
    # The book title must match the Amazon listing exactly.
    titles = {b["title"] for b in CATALOG}
    if doc["source_book"]["title"] not in titles:
        errors.append(f"refs: source_book.title {doc['source_book']['title']!r} does not match an Amazon title in the catalog")
    total = sum(words(s) for p, s in walk(doc) if is_reader_copy(p))
    # Target set from the finished Focus workbook, approved by Crent on 30 Sep 2026.
    if not 6500 <= total <= 9500:
        errors.append(f"count: {total} reader-facing words, target 7,000 to 9,000")


def validate(path, template=False):
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    errors = []
    v = jsonschema.Draft202012Validator(SCHEMA)
    for err in sorted(v.iter_errors(doc), key=lambda e: list(e.path)):
        loc = "/".join(str(p) for p in err.path)
        errors.append(f"schema: {loc}: {err.message[:140]}")
    if errors:
        return errors
    check_style(doc, errors)
    check_limits(doc, errors)
    check_refs(doc, errors)
    if not template:
        check_counts(doc, errors)
    return errors


def main(argv):
    template = "--template" in argv
    pilot = "--pilot" in argv  # partial content for a test build: count gaps become warnings
    files = [a for a in argv if not a.startswith("--")]
    if not files:
        sys.exit(__doc__)
    failed = False
    for f in files:
        errs = validate(f, template)
        if pilot:
            for w in [e for e in errs if e.startswith("count:")]:
                print(f"WARN {f}: {w}")
            errs = [e for e in errs if not e.startswith("count:")]
        if errs:
            failed = True
            print(f"FAIL {f}: {len(errs)} problem(s)")
            for e in errs:
                print("  -", e)
        else:
            print(f"PASS {f}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv[1:])
