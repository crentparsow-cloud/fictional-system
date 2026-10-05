# Tillstep build repository

Working name, pending trademark clearance. The line name is a config value and is never hard-coded in content.

- `content/schema/workbook.schema.json`: content schema, version 1.0 (build plan B1.1)
- `tools/validate.py`: validator for structure, house style, claim words, word limits, cross-references and counts (B1.2)
- `content/workbooks/_template.json`: empty template workbook, passes `--template` validation (B1.3)
- `tests/broken_sample.json`: deliberately broken file. The validator must reject it.
- `tests/focus_structure_check.json`: Tillstep Focus week and exercise structure from the G3 blueprint, placeholder text only
- `docs/`: agency documents for this build

Run: `pip install jsonschema && python3 tools/validate.py --template content/workbooks/_template.json`
