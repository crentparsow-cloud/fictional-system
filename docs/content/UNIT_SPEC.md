# Unit specification

Build list item 14.38. This is the written standard for one unit of an Akana workbook. It is agreed before content starts and every unit is checked against it. The classics (7.1) are the first titles written to it. Maya Vaughn's twenty titles were written before it and are brought into line during the copy pass, not before.

The shape comes from the research annex (Strand 6, content rows): the Blinkist "blink" structure of an introduction, key ideas with sentence headings, and a closing takeaway, read in about fifteen minutes; the Shortform exercise shape of one set-up paragraph and one direct question; and headings written as full sentences, with anything under five words flagged.

## What a unit is

A unit is one week, day, module or chapter of a programme (`structure.unit`). A reader opens it, reads for a few minutes, answers a small number of direct questions, and leaves with one thing to carry. The whole unit, reading and exercises together, takes about fifteen minutes. The short version of each exercise takes a few minutes on a hard day.

## The parts, in order

1. **Title.** A full sentence that says what the unit is about. Not a label. "Marcus begins by naming everyone who taught him how to live", not "Gratitude". Five words or more. The plain English lint flags fewer (`pnpm validate --style`).

2. **Introduction: why this matters.** Two to four sentences. What the reader will be able to do or see by the end of the unit, and why the author thought it mattered. No praise for the book and no promise about results. The claims rules in `packages/validate/src/rules.ts` apply to every sentence.

3. **Key ideas.** Five to ten. Each has three parts:
   - a heading that is a full sentence and makes a claim the reader could disagree with ("A list of six is for reading, one line is for living");
   - an explanation of two to five sentences in the author's terms, not ours;
   - one example, concrete and short, either from the book or from an everyday case. When it comes from the book, it is a quotation from the named source edition, never a paraphrase presented as the author's words.
   A key idea is 60 to 120 words all in. Fewer ideas, done properly, beat ten thin ones. Wellbeing titles sit at the lower end because their per-unit word budget is smaller (see limits below).

4. **Exercises.** One to three per unit. Each exercise is one set-up paragraph and one direct question.
   - The set-up paragraph says what to do and why, in the author's terms. It is not a second explanation of the key idea.
   - The direct question is the field label the reader answers. It is a question, it is specific, and it can be answered in one line. "Which lesson will you pay attention to this week, and where will it show?" Not "Reflect on your lessons".
   - Steps are the mechanics only (read this, think of three people, write one line each). Three steps is normal. Ten is the schema's ceiling and a sign the exercise is two exercises.
   - One field is normal. More than three fields means the question is not direct.
   - Every exercise has a `done_when` line so the reader knows when to stop, and most have a short version for a hard day.

5. **Closing takeaway.** One or two sentences the reader could repeat to someone else. It names what the unit gave them, not what they should feel. For the last unit of a programme this is also `finish.summary`.

## Time and length

About fifteen minutes in total: four to six minutes of reading and eight to ten minutes across the exercises (`exercises[].minutes` summed over the unit). Reading time is worked at 200 words a minute, so the reading part of a unit is 800 to 1,200 words.

The validator sets the reader-facing word budget per unit by genre (`genreProfile` in `rules.ts`):

| Genre or tier | Reader words per unit | Exercises per unit |
|---|---|---|
| Wellbeing, or any title at the standard or higher tier | 540 to 800 | about 2 (1.8 to 2.0 across the programme) |
| Every other genre at tier none | 250 to 1,200 | 1 to 3 |

Reader-facing words are every string the reader sees, divided by the unit count. House notes (`internal`, `source`, ids) are not counted. A classic at 1,200 words a unit is at the cap, so a unit with ten key ideas keeps each one near 80 words.

## Field limits the validator enforces

These are the word limits in `LIMITS` in `packages/validate/src/rules.ts`. A limit here is a limit in the code. If one changes, change both in the same commit.

| JSON path | Words | What it is in this spec |
|---|---|---|
| `card_line` | 18 | The one line on the catalogue card |
| `tagline` | 14 | Optional second line |
| `start.welcome` | 80 | The programme's welcome, not the unit's |
| `structure.stages[].primer.body` | 120 | The introduction to a stage, shown when its first unit opens |
| `structure.stages[].outcome` | 25 | What a stage leaves the reader with |
| `exercises[].title` | 6 | The exercise name on the unit screen |
| `exercises[].purpose` | 20 | One line: what the reader has at the end |
| `exercises[].why` | 60 | The set-up paragraph |
| `exercises[].steps[].text` | 20 | One mechanical step |
| `exercises[].short_version.steps[].text` | 20 | One step of the hard-day version |
| `exercises[].example.text` | 120 | The example |
| `exercises[].done_when` | 20 | When to stop |
| `exercises[].reflect` | 25 | The optional reflection question after saving |
| `toolkit[].title` | 6 | A toolkit card name |
| `toolkit[].when_to_use` | 20 | When to open the card |
| `toolkit[].steps[]` | 15 | One step on a card |
| `milestones[].message` | 25 | A milestone line |
| `selfcheck.items[].text` | 20 | One self-check statement |
| `checkin.fields[].label` | 12 | One check-in question |

Structural limits from the schema (`packages/schema/src/v3.ts`): 1 to 3 exercises per unit; 1 to 10 steps and 1 to 8 fields per exercise; exercise time 1 to 60 minutes; short version 1 to 5 minutes with 1 to 3 steps and 1 or 2 fields; 2 to 5 "how it works" lines on Start; up to 6 stages and 6 plan sections; up to 20 toolkit cards; 2 to 6 columns on a table or two-column field.

## Style rules that apply to every unit

The validator enforces these as errors (`checkStyle` in `packages/validate/src/index.ts`): no em dashes, en dashes, curly quotes or ellipsis characters; no emojis; no exclamation marks; no sentence starting with "I" or "We" outside quoted speech; spelling matching the workbook's `spelling` setting; no claim words for the genre and tier; no breath count without a unit and no breath hold without an opt-out; no contractions in safety, crisis or consent text; the "X is not Y. It is Z." shape at most once per workbook; and the banned phrase list, which includes "you should", "you must", "journey", "unlock", "simply", "fail", "bad day", "tick" and "circle".

The plain English lint (`pnpm validate --style`) adds warnings for sentences over 25 words, negative contractions, a banned word list (utilise, leverage, in order to, delve, tapestry and the rest in `packages/validate/src/plain.ts`) and unit titles under five words. It never fails a build. A quotation from the source edition may run over 25 words; the lint still reports it and the proofreader decides.

Metaphor cannot be linted. The rule is: say the thing. "A list of six is for reading" is fine. "Your list is a compass" is not.

## Where each part lives in the v3 JSON

Schema v3.0 was frozen on 8 October 2026 and only grows by optional fields. It has no container for key ideas with a heading, an explanation and an example, and no per-unit introduction or takeaway field. The engine's unit screen (`packages/engine/src/screens/Unit.tsx`) shows the unit's focus line, the stage primer when the unit opens a stage, and the exercises in full.

What works today, in v3.0:

| Part of this spec | v3.0 home | Note |
|---|---|---|
| Title | `units[].focus` | Full sentence, five words or more |
| Introduction | `structure.stages[].primer.body` | Only when the unit opens a stage. Otherwise the first exercise's `why` carries the why-it-matters |
| Key idea | one exercise: `title` (heading), `why` (explanation), `example` | One to three ideas a unit this way |
| Exercise set-up paragraph | `exercises[].why` | 60 words |
| Direct question | `exercises[].fields[0].label` | One field |
| Closing takeaway | `exercises[].done_when` of the unit's last exercise; `finish.summary` for the final unit | |

Schema 3.1 (10 October 2026, decided by Crent) adds the three containers this spec needs, all optional, so every 3.0 file stays valid: `units[].intro` (the introduction, about 80 words), `units[].ideas` (up to ten `{ heading, body, example }` objects) and `units[].takeaway`. The unit screen renders them in that order, ideas before exercises and the takeaway after. The validator (`checkUnits` in `packages/validate/src/index.ts`) checks them against this spec: five to ten ideas, headings of five words or more, an idea at 120 words or fewer, a question as the first field of each exercise, and a reading time worked from word count at 200 words a minute. The reader-word cap for tier none is now 1,500 a unit. A file that declares `"schema_version": "3.1"` may use the new fields. The v3.0 mapping above still works for older files.

## Worked skeleton: Meditations, week 1

Code AK-FN9KB. The workbook on Marcus Aurelius in George Long's translation of 1862 (Project Gutenberg #15877), house record at `docs/public-domain/AK-FN9KB.md`. Unit 1 is Book 1, in which Marcus lists the people who taught him how to live.

The editorial source for the unit, before it is loaded into JSON, would read:

> **Marcus begins by naming everyone who taught him how to live.**
>
> Introduction. Book 1 is sixteen paragraphs of thanks. Before Marcus writes one line of philosophy he writes down what he owes and to whom. This week does the same. You name the people who taught you something you still use, then choose one lesson to pay attention to.
>
> Key idea 1. *A good life starts as a list of debts.* Marcus names his grandfather, his mother, his tutors, his adoptive father and the gods. Each entry is one thing learned. Example: "From my grandfather Verus I learned good morals and the government of my temper."
>
> Key idea 2. *The lessons that last are small and specific.* Not "be good" but "do not be satisfied with a general idea; read carefully". Example: Rusticus taught him to read a letter twice before answering it.
>
> (Key ideas 3 to 6 follow the same shape: Book 1 as a model of plain living; what he learned from his adoptive father about steadiness; the difference between praise and gratitude; why he thanked the gods last.)
>
> Exercise 1. List the people who shaped you. Set-up: Book 1 is a list of thanks, written as a reminder of what Marcus had been given. Question: Who taught you, and what do you still use from them?
>
> Exercise 2. Choose one lesson to carry. Set-up: a list of six is for reading, one line is for living. Question: Which lesson will you pay attention to this week, and where will it show?
>
> Takeaway. Three people are named, each with one thing you still use, and one of those lessons has a place in your week.

The same unit loaded into the v3.0 shape. This file passes `pnpm validate` (schema, style, claims, limits and references) at `first_unit` depth. Weeks 2 to 12 carry only their title sentence and repeat the Book 1 exercise as a placeholder until each week is written. The `internal` block is never served to a reader.

```json
{
  "schema_version": "3.0",
  "code": "AK-FN9KB",
  "slug": "meditations-fn9kb",
  "title": "Meditations",
  "short_title": "Meditations",
  "card_line": "One book of the Meditations each week, with a daily reflection.",
  "book": {
    "book_id": "meditations",
    "title": "Meditations",
    "subtitle": "The Thoughts of Marcus Aurelius Antoninus, in George Long's translation",
    "year": 1862
  },
  "author": {
    "author_id": "AU-M0SAD",
    "display_name": "Marcus Aurelius"
  },
  "genre": "personal_development",
  "theme_id": "wisdom-for-living",
  "language": "en",
  "spelling": "en-GB",
  "is_demo": false,
  "depth": "first_unit",
  "badge": "public_domain",
  "licence_ref": "public-domain:/public-domain/AK-FN9KB",
  "status": "draft",
  "safety_tier": "none",
  "structure": {
    "unit": "week",
    "count": 12,
    "free_units": 1,
    "stages": [
      {
        "id": "ground",
        "number": 1,
        "name": "Ground",
        "units": [
          1,
          2,
          3,
          4
        ],
        "primer": {
          "title": "Where the book begins",
          "body": "Marcus wrote these notes to himself, not for readers. Book 1 is a list of debts: the people who taught him how to live. The first four weeks follow that lead. You name what you were given, who gave it, and what you want to carry on. Nothing here asks you to be a Stoic. It asks you to look."
        },
        "outcome": "A clear account of the people and habits that shaped you, in your own words."
      }
    ]
  },
  "start": {
    "welcome": "This workbook walks through the Meditations one book a week, for twelve weeks. Each week takes about fifteen minutes. You read a short account of the book, then answer one question in your own words. The text is George Long's translation of 1862, with the spelling brought up to date. Week 1 is free. No card is needed.",
    "how_it_works": [
      "Read the week's key ideas. Five to ten, each a sentence long.",
      "Answer one question for each exercise. A line is enough.",
      "Your answers build a plan you can read at the end."
    ],
    "why_prompt": "What made you pick up a book written eighteen centuries ago? One line is enough."
  },
  "units": [
    {
      "number": 1,
      "stage": "ground",
      "focus": "Marcus begins by naming everyone who taught him how to live",
      "exercise_ids": [
        "debts",
        "one_lesson"
      ]
    },
    {
      "number": 2,
      "stage": "ground",
      "focus": "Each morning, Marcus reminds himself what kind of day to expect",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 3,
      "stage": "ground",
      "focus": "Book 3 asks what you would do if today were the last day",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 4,
      "stage": "ground",
      "focus": "Book 4 is about the quiet place that is already inside you",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 5,
      "focus": "Book 5 starts with getting out of bed to do the work of a human being",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 6,
      "focus": "Book 6 looks at other people and what they can and cannot take from you",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 7,
      "focus": "Book 7 returns again and again to what is in your control",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 8,
      "focus": "Book 8 is a working notebook for a hard stretch",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 9,
      "focus": "Book 9 takes change as the ordinary condition of everything",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 10,
      "focus": "Book 10 asks what you want your character to be known for",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 11,
      "focus": "Book 11 is about endings and how to meet them",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    },
    {
      "number": 12,
      "focus": "Book 12 closes with living by your values until the end",
      "exercise_ids": [
        "debts"
      ],
      "repeat_ids": [
        "debts"
      ]
    }
  ],
  "exercises": [
    {
      "id": "debts",
      "title": "List the people who shaped you",
      "purpose": "A short list of the people who taught you something you still use.",
      "why": "Book 1 is sixteen paragraphs of thanks. From his grandfather Marcus learned good morals and an even temper. From his mother, piety and plain living. From Rusticus, to read carefully and not be satisfied with a general idea. He wrote the list for himself, as a reminder of what he had been given. Yours will do the same work.",
      "source": {
        "chapter": "Book 1, paragraphs 1 to 17",
        "note": "Long translation, Gutenberg #15877"
      },
      "minutes": 8,
      "steps": [
        {
          "text": "Read the week's key ideas first. Then come back here."
        },
        {
          "text": "Think of three people. Family, teachers, colleagues, anyone."
        },
        {
          "text": "For each, write the one thing they taught you that you still use."
        }
      ],
      "example": {
        "character": "Marcus",
        "text": "From my grandfather Verus I learned good morals and the government of my temper. From my mother, piety and beneficence, and abstinence not only from evil deeds but even from evil thoughts, and further, simplicity in my way of living, far removed from the habits of the rich."
      },
      "fields": [
        {
          "id": "people",
          "type": "two_column",
          "label": "Who taught you, and what you still use from them",
          "columns": [
            "The person",
            "What they taught you"
          ],
          "min_items": 1,
          "max_items": 6
        }
      ],
      "done_when": "Three people are named, each with one thing you still use.",
      "reflect": "Which of these lessons did you take for granted until you wrote it down?",
      "repeat_units": [
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12
      ]
    },
    {
      "id": "one_lesson",
      "title": "Choose one lesson to carry",
      "purpose": "One lesson from your list, chosen on purpose, to pay attention to this week.",
      "why": "Marcus did not keep his list for sentiment. He kept it so that the lessons stayed in use. A list of six is for reading. One line is for living. Pick the lesson you have been neglecting, not the one you are proudest of.",
      "source": {
        "chapter": "Book 1, paragraph 17"
      },
      "minutes": 5,
      "steps": [
        {
          "text": "Read your list from the first exercise."
        },
        {
          "text": "Choose one lesson you have let slip."
        }
      ],
      "fields": [
        {
          "id": "lesson",
          "type": "short_text",
          "label": "Which lesson will you pay attention to this week, and where will it show?",
          "prefill_from": "people"
        }
      ],
      "done_when": "One lesson is written down with a place it will show this week.",
      "feeds_plan": [
        {
          "field_id": "lesson",
          "plan_section": "carry"
        }
      ]
    }
  ],
  "toolkit": [],
  "milestones": [
    {
      "id": "first",
      "trigger": "first_exercise",
      "message": "Your first answer is saved. The list is yours to add to all year."
    },
    {
      "id": "week_one",
      "trigger": "unit_complete:1",
      "message": "Book 1 done. Marcus took a lifetime over his list. A week is a fair start."
    }
  ],
  "plan_sections": [
    {
      "id": "carry",
      "title": "Lessons to carry"
    }
  ],
  "finish": {
    "summary": "Twelve books, twelve weeks, and a plan built from your own answers.",
    "book_bridge": "The full text of the Meditations is free to read. Long's translation is the one used here."
  },
  "internal": {
    "manuscript_file": "docs/content/sources/AK-FN9KB/long-1862.txt",
    "notes": "Skeleton for docs/content/UNIT_SPEC.md. Weeks 2 to 12 reuse the Book 1 exercise as a placeholder until each week is written."
  }
}```

## Checklist before a unit leaves the writer

- [ ] Title is a full sentence of five words or more.
- [ ] Introduction says why it matters without a promise or a claim.
- [ ] Five to ten key ideas, each with a sentence heading, an explanation and one example.
- [ ] Every quotation is from the named source edition.
- [ ] Each exercise is one set-up paragraph and one direct question, with a `done_when` line.
- [ ] Closing takeaway could be repeated to someone else.
- [ ] Reading plus exercise minutes come to about fifteen.
- [ ] `pnpm validate` passes. `pnpm validate --style` has been read and each warning either fixed or accepted with a reason.
- [ ] docs/VOICE.md register: content voice, author's terms, no humour on a wellbeing title.
