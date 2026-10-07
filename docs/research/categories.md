# Akana category research: Blinkist and comparable libraries

Prepared 7 October 2026. Research only. No repo file other than this one and `taxonomy.json` was changed.

## Summary

Blinkist browses by 31 main categories. It has no formal subcategories. Each category page instead lists topic tags, and the same tag can sit under several categories. Shortform, Headway and Audible use fewer, broader groups, and they agree on a common core: business and career, leadership, money, health and wellbeing, communication, productivity, relationships and personal growth.

Akana already covers most of that core. Its 7 seeded shelves and 17 Themes cover 5 Blinkist categories fully and 13 partly, and leave 13 uncovered. The largest gaps are faith, health and the body, creativity, communication, marketing, debt and investing, and narrative non-fiction such as history and science.

The proposal is 10 shelves and 51 Themes. It keeps all 7 shelves and 17 Themes and their ids. It adds 3 shelves (Health and Body, Faith and Spirituality, Creativity and Making) and 34 Themes. Ten shelves is the top of the naming board's limit of six to ten, so there is a fallback in section 4. Every new name is pending clearance. None has had a register search.

The changes needed are additive. Shelves, areas and Themes are seed data. A group flag and a new `faith` genre would be additive under the freeze. Two existing checks would fail and must be updated in the same change: the 0002 test that expects 11 genres, and the genre CHECK constraint in migration 0002.

## 1. What the libraries use

### Blinkist

The category index lists 31 categories ("Discover titles and shows in 31 categories"). Below are the topic tags shown on each category page, as captured on 7 October 2026. Blinkist calls these topics, not subcategories, and the lists overlap. "Mindful Work" appears under four categories, for example. A topic list was not captured for every category; those rows say so.

| # | Blinkist category | Topic tags seen on the category page (selection, in page order) |
|---|---|---|
| 1 | Biography & Memoir | Not captured |
| 2 | Book Types | Teen, Social Justice, Book Club, Banned Books, Modern Classic, Easy Reading, Nobel, New York Times Bestseller (a format list, not a subject) |
| 3 | Career & Success | Negotiations, Promotion, Mindful Work, Coaching, Networking, Critical Thinking & Problem Solving, Job Hunt, Career Progress, Presentations & Public Speaking, Personal Branding, Consulting, several Law topics |
| 4 | Communication Skills | Body Language, Interviewing, Negotiations, NLP, Listening, Resolving Conflict, Networking, Persuasion, Presentations & Public Speaking, Storytelling, Business Communication, Pitching |
| 5 | Corporate Culture | Emotional Intelligence, Promotion, Mindful Work, Diversity & Inclusion, Work Culture, Hiring, Working from Home, Scrum & Agile, New Work, Talent Development, Business Ethics, Human Resources |
| 6 | Creativity | Writing, Design Thinking, Creative Flow, Innovation, Design, Literature, Storytelling, Comedy, Humor, Mythology |
| 7 | Economics | Not captured |
| 8 | Education | Schools, Higher Education, Learning, General Knowledge, Mathematics, Teaching, Poetry, College, Linguistics, Homeschooling |
| 9 | Entrepreneurship | Leadership, Small Businesses, Start-Ups, Design Thinking, Innovation, Strategy, Work Culture, Product Management, Growth Hacking, Money, Business Planning, Franchise |
| 10 | Fantasy | Not captured (fiction) |
| 11 | Fiction | Not captured (fiction) |
| 12 | Fiction Authors | Not captured (author list) |
| 13 | Health & Nutrition | Healthy Living, The Body, Medicine & Natural Remedies, Sports, Weight Loss, Diseases & Illnesses, Mental Health, Sleep, Men's Health, Cook Books, Self-Care, Women's Health & Maternity, Trauma & Healing, Overcoming Addiction, Aging, Diet, Anxiety, Depression |
| 14 | History | Not captured |
| 15 | Management & Leadership | Leadership, Digital Transformation, Decision-Making, Teamwork, Coaching, Strategy, Work Culture, Product Management, Talent Development, Project Management, Mentoring, Recruiting, Lean Management, Operations Management, Supply Chain |
| 16 | Marketing & Sales | Neuromarketing, Branding, Persuasion, Presentations & Public Speaking, Marketing, Sales, Storytelling, Growth Hacking, Copywriting, Digital Marketing, Social Media Marketing, Public Relations, Advertising |
| 17 | Mindfulness & Happiness | Healthy Living, Meaningful Living, Mindful Loving, Mindful Work, Happy, Stress Reduction, Self-Care, Meditation, Buddhism, Feng Shui, Positivity, Mindfulness, Yoga |
| 18 | Money & Investments | Retirement, Wealth, Investments, Venture Capital, The Psychology of Money, Personal Finances, Stock Trading, Risk Management, Accounting, Budgeting, Bookkeeping, Cryptocurrency, Money Management, Investing, Passive Income |
| 19 | Motivation & Inspiration | Memoirs, Meaningful Living, Decision-Making, Creative Flow, Goals, Wisdom, Inspiration, Confidence, Storytelling, Wanderlust |
| 20 | Nature & the Environment | Life Sciences, Plants & Trees, Climate Change, Natural Sciences, Animals, Sustainability, Wildlife, Gardening |
| 21 | Parenting | Emotional Intelligence, Family Life, Family Planning, Education & Upbringing, Women's Health & Maternity, Adoption, Fatherhood, Fertility, Motherhood, Pregnancy, Baby, Toddler Parenting, Grandparenting, Step-Parenting, Christian Parenting |
| 22 | Personal Development | Body Language, NLP, Self-Help, Routines & Habits, Decision-Making, Learning, Goals, Confidence, Success, Assertiveness, Empathy, Discipline, Emotions, Finding Yourself, Identity, Loneliness, Meaning of Life, Mindset, Minimalism, Problem Solving |
| 23 | Philosophy | Social Philosophy, Ethics & Morality, Western Philosophy, Political Philosophy, Critical Thinking, Wisdom, The Human Condition, Theology, Eastern Philosophy, Stoicism, Existentialism, Metaphysics |
| 24 | Politics | Not captured |
| 25 | Productivity | Focus, Routines & Habits, Time Management, Mindful Work, Stress Reduction, Effectiveness, Goals, Scrum & Agile, Success |
| 26 | Psychology | Emotional Intelligence, The Brain, Social Psychology, Mental Health, The Psychology of Money, Self-Care, The Psychology of Love, Trauma & Healing, Confidence, Personality, Child Psychology, Behavioral Psychology, Cognitive Psychology |
| 27 | Religion & Spirituality | Christianity, Islam, Judaism, Buddhism, Hinduism, Meditation, Prayer, Yoga, Zen, Bible Study, Church History, Christian Leadership, plus esoteric topics (astrology, tarot, crystals). The page lists more than 80 topics |
| 28 | Science | Not captured |
| 29 | Sex & Relationships | Family Life, Sex, Mindful Loving, Resolving Conflict, Love, Friendship, Marriage, Dating, Death, Relationships, Breakup, Blended Families, Divorce, Etiquette, Wedding, Making Friends, Bullying |
| 30 | Society & Culture | Social Philosophy, Race, Alternative Perspectives, Social Media, Class, The Internet, Media, Big Tech |
| 31 | Technology & the Future | Big Data, Digital Transformation, Social Media, The Internet, Big Tech, Artificial Intelligence, Science Fiction, Machine Learning, Futurism, Cyber Security |

### Comparable libraries

| Library | Main categories seen | Note |
|---|---|---|
| Shortform | Management & Leadership, Business, Entrepreneurship, Money & Finance, Career & Success, Productivity, Health & Well-Being, Communication | The 8 "Popular Categories" on the summaries page. A full category page did not load |
| Headway | Self-growth, Business & Career, Psychology, Communication, Relationships, Productivity, Well-being, Health, Intimacy & dating, Success | Labels on the home page. No formal category index was found |
| Audible (US) | Arts & Entertainment, Biographies & Memoirs, Business & Careers, Children's, Comedy & Humor, Computers & Technology, Education & Learning, Erotica, Health & Wellness, History, Home & Garden, LGBTQ+, Literature & Fiction, Money & Finance, Mystery Thriller & Suspense, Politics & Social Sciences | The page says 24 categories. Only the first 16 were captured. The UK site returned an error |
| BISAC (trade subject codes) | Self-Help has 53 headings, including Personal Growth (Happiness, Self-Esteem, Success), Self-Management (Stress, Time, Anger), Communication & Social Skills, Creativity, Journaling, Spiritual. Religion has Christian Living (23 headings), Biblical Studies (including Bible Study Guides) and Christian Ministry (including Discipleship, Adult, Youth) | Useful as the publisher's view. Christian Living reads almost like a list of workbook Themes |

What they share. All four consumer libraries lead with business and career, money, health or wellbeing, and communication or relationships. The summary apps (Shortform, Headway) cut the list to a self-improvement core. Blinkist and Audible add narrative subjects (history, science, politics, fiction). Religion appears as a main category in Blinkist and as a full branch in BISAC.

## 2. Blinkist categories mapped to Akana

Coverage is judged against the 7 seeded shelves and 17 Themes in `supabase/seed/seed.sql` and `content/registry/themes.json`. Covered means an existing Theme takes most of the category's practical topics. Partly means some topics have a home and clear gaps remain. Not covered means no Theme fits.

| Blinkist category | Akana shelf and Theme today | Coverage | Gap |
|---|---|---|---|
| Biography & Memoir | None | Not covered | Life-story writing has no home |
| Book Types | None | Not covered | A format list, not a subject. No mapping needed |
| Career & Success | Work and Career: Work Worth Choosing | Partly | Networking, personal branding, public speaking, negotiation |
| Communication Skills | Love and Relationships: Companionable Days (difficult conversations); Work and Career: Shared Direction (feedback) | Partly | Public speaking, negotiation, persuasion, listening |
| Corporate Culture | Work and Career: Shared Direction | Partly | Inclusion, hiring, remote working, ethics |
| Creativity | None | Not covered | Writing and creative practice |
| Economics | None (Money is household money) | Not covered | Only as study companions |
| Education | Learning and Skills: Unrushed Learning | Partly | Teaching, home education |
| Entrepreneurship | Work and Career: Ventures Taking Shape | Covered | Marketing sits elsewhere |
| Fantasy | None | Not covered | Fiction |
| Fiction | None | Not covered | Fiction |
| Fiction Authors | None | Not covered | Author list |
| Health & Nutrition | Mind and Mood holds Maya Vaughn's sleep, food and exercise titles (Rest to Reset, Nourished, Moving Through It); Softer Nights | Partly | Movement, food and later life outside a mental health frame |
| History | None | Not covered | Only as study companions |
| Management & Leadership | Work and Career: Shared Direction | Covered | Strategy and project management fit inside it |
| Marketing & Sales | Work and Career: Ventures Taking Shape (customers) | Partly | Marketing, selling, branding |
| Mindfulness & Happiness | Mind and Mood: Noticing More, Even Pace, Renewing Energy | Covered | None at launch |
| Money & Investments | Money: Considered Spending, Money for Later | Partly | Debt, pensions and investing |
| Motivation & Inspiration | Personal Growth: Chosen Habits | Partly | Goals, meaning, purpose |
| Nature & the Environment | None (gardening sits loosely under Practical Know-How) | Not covered | Green living habits, nature narrative |
| Parenting | Family and Parenting: Raising With Care | Covered | Pregnancy, step-families and grandparents are thin |
| Personal Development | Personal Growth: Chosen Habits; Mind and Mood: Seeing Yourself Fairly | Partly | Confidence, decisions, goals, purpose |
| Philosophy | Personal Growth: Chosen Habits (stoicism in its topics) | Partly | Practical philosophy as its own Theme |
| Politics | None | Not covered | Not proposed (see section 3) |
| Productivity | Work and Career: Purposeful Time | Covered | None |
| Psychology | Mind and Mood (all Themes) | Partly | Academic psychology has no home and needs none |
| Religion & Spirituality | None | Not covered | Bible study, prayer, discipleship, church teams |
| Science | None | Not covered | Only as study companions |
| Sex & Relationships | Love and Relationships: Partners in Step, Companionable Days | Partly | Dating, separation, divorce. Sex not proposed |
| Society & Culture | None | Not covered | Only as discussion guides |
| Technology & the Future | Learning and Skills: Practical Know-How (loosely) | Partly | Screen habits, online safety, everyday AI tools |

Tally: 5 covered, 13 partly covered, 13 not covered (31 in all).

## 3. Which categories suit the workbook format

An Akana workbook asks the reader to do something each week and keep a record. A category suits the format when its books already give the reader steps to take. It suits less well when the book's value is the story or the argument.

| Blinkist category | Fit | Reason |
|---|---|---|
| Personal Development | Strong | Most titles already prescribe weekly practice: habits, confidence, goals |
| Productivity | Strong | Planning exercises repeat well week by week and can be checked against real diaries |
| Mindfulness & Happiness | Strong | Daily short practice is the core of the genre. Wellbeing safety rules apply |
| Parenting | Strong | Parents try one change a week and review it. Groups of parents run well |
| Sex & Relationships | Strong for couples, friendship and separation | Shared exercises for couples work well. Sexual content is left out because it needs a different safety and age approach |
| Career & Success | Strong | Job search, pay talks and networking are tasks with clear weekly steps. Law topics are left out |
| Communication Skills | Strong | Speaking and negotiation improve with rehearsal and review, which a workbook can schedule |
| Management & Leadership | Strong | Managers can try one practice with their team each week. Suits team plans |
| Corporate Culture | Good for teams | Culture work needs a group doing it together. Weak for a lone reader |
| Entrepreneurship | Strong | Business plans, pricing and first customers are staged tasks. Income promise rules apply |
| Money & Investments | Strong for budgeting, debt and pensions | Weekly money tasks are concrete. Stock trading, crypto and passive income are left out because of income promise rules and regulation |
| Religion & Spirituality | Strong for Christian study and practice | Bible study guides and small group courses are already workbooks in all but name. Esoteric topics are left out |
| Health & Nutrition | Good, with care | Movement and meal planning suit weekly steps. Medical topics, weight loss promises and eating disorders are left out of everyday Themes |
| Creativity | Strong | Writing and art improve with a schedule and a record. Writing groups suit |
| Motivation & Inspiration | Moderate | Inspirational books carry little method. They work when the workbook adds goals and reflection |
| Psychology | Moderate | Pop psychology suits as reflection. Academic psychology does not |
| Philosophy | Moderate to strong for practical philosophy | Stoic texts such as Meditations (already an Akana public-domain record) are built for daily practice. Theory suits only as study |
| Education | Moderate | Study skills and teaching suit. Subject content suits only as a study companion |
| Technology & the Future | Moderate for everyday skills | Screen habits and online safety suit. Futurism does not |
| Nature & the Environment | Weak to moderate | Green living and gardening can be weekly habits. Nature writing works only as reflection |
| Biography & Memoir | Weak as reading, good as writing | Reading a life gives few tasks. Writing your own life story suits well |
| History | Weak | Narrative. Suits only as a study or reading-group companion |
| Science | Weak | Narrative or explanation. Suits only as a study companion |
| Economics | Weak | Argument, not method. Suits only as a study companion |
| Society & Culture | Weak | Argument. Suits only as a discussion guide for groups |
| Politics | Not suited | Partisan risk and no clear reader task. Not proposed |
| Fiction, Fantasy, Fiction Authors | Not suited at launch | The value is the story. Reading-group guides are possible later under Curious Reading |
| Book Types | Not applicable | A format list |

## 4. Proposed taxonomy

### Rules applied

Shelves are the main categories and Themes are the subcategories, as the brief asks. Areas still sit between them in the database. They are noted where they matter but are not part of the JSON shape.

Each Theme name follows section 3 of the naming board as quoted in `AK_Demo_Catalogue_Plan.md`. It is positive, two or three words, names a direction rather than a result, avoids condition words and app words (Today, Path, Progress, My plan, Explore, Build, Practice, Keep, Help now), and shares no first word with another Theme on its shelf. A build script checked the slug format, uniqueness, word count, first words and app words. Problem words such as anxiety, debt or divorce appear only in hidden topics.

All 17 existing Themes keep their names, slugs and shelves. Hidden topics were added to most existing Themes where the gap analysis found missing terms. One term moves: stoicism leaves Chosen Habits for the new Wisdom for Living. No other existing topic is removed. The five Mind and Mood Themes have no line or topics in the repo, so the lines and topics given for them are proposals.

Safety tier follows the schema: none, standard (Help now on every screen, health data consent) or higher (keeps the Start gate and needs clinician sign-off). Wellbeing Themes are standard at minimum. Themes that name clinical conditions in their topics are higher. Non-wellbeing Themes are standard where readers may be in distress: debt, separation, caring, new babies, step-families and grief.

"Groups" means the Theme works when a team, church or small group follows the same weekly plan together while each person's answers stay private. Higher tier Themes are marked No, because group delivery of clinical material needs its own safety design.

### Faith and Spirituality

The shelf starts with Christian, Bible-based Themes. Their scope follows BISAC Christian Living and Biblical Studies, and Blinkist's own Christianity, Bible Study and Christian Leadership topics. Quiet Contemplation is a holding Theme for other traditions. When a second tradition has three titles, give it its own Theme rather than mixing traditions in one. No genre in the current 11 is a natural home, so each Theme carries the nearest one. Section 5 sets out an optional `faith` genre.

### Akana Business (teams, churches, small groups)

Strongest fit: all of Work and Career, Faith and Spirituality (Serving Together, Reading Scripture and Rhythms of Prayer for church small groups), Money (employee money wellbeing), Health and Body (workplace wellbeing), and Learning and Skills (Guiding Learners for schools). Some Mind and Mood Themes fit workplace wellbeing (Noticing More, Even Pace, Renewing Energy), because the architecture already limits team admins to aggregate uptake counts. The higher tier Mind and Mood Themes and New Chapters are not for groups.

### Shelf count and fallback

The board allows six to ten shelves. This proposal uses ten. If Crent wants a spare slot, fold Creativity and Making into Learning and Skills as an area called Creative Craft, and move Life Stories to Personal Growth. Note that the demo catalogue plan refers to "six fixed shelves", but only five non-proposed shelves are in the seed and registry. The sixth is not in the repo [check with Crent].

### Mind and Mood reconciliation

Mind and Mood holds the 20 Maya Vaughn workbooks across five areas (Worry and Fear, Mood and Energy, Stress and Overload, Loss and Recovery, Self and Connection). Only five Mind and Mood Themes are in the repo. Settled Mind, Brighter Days and Gentle Mending are proposed to give the anxiety, low mood and loss titles a positive home. They must be checked against the original themes registry, which the repo does not hold, before any id is minted. Separately, those area names contain problem words (Worry, Fear, Stress, Overload, Loss). If areas are ever shown to readers, they break the positive naming rule.

### Themes by shelf

### 1. Mind and Mood (`mind-and-mood`)

Guided workbooks for calmer days, steadier moods and kinder thoughts. Status: existing shelf. Suits groups: No.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Noticing More | `noticing-more` | Guided workbooks for slowing down and paying attention to the moment. | mindfulness, meditation, breathing, attention, present moment, pausing, grounding | wellbeing | standard | Yes | existing |
| Softer Nights | `softer-nights` | Guided workbooks for gentler evenings and better rest. | sleep, insomnia, bedtime routine, wind-down, night waking, screens at night, tiredness | wellbeing | standard | No | existing |
| Even Pace | `even-pace` | Guided workbooks for a steadier pace through busy weeks. | stress, overload, pressure, breaks, workload, overwhelm, slowing down | wellbeing | standard | Yes | existing |
| Seeing Yourself Fairly | `seeing-yourself-fairly` | Guided workbooks for kinder self-talk and fairer self-judgement. | self-esteem, self-criticism, self-compassion, inner critic, perfectionism, shame, self-worth | wellbeing | standard | No | existing |
| Renewing Energy | `renewing-energy` | Guided workbooks for making room, resting and getting your energy back. | burnout, exhaustion, fatigue, overcommitment, rest, saying no, recovery | wellbeing | standard | Yes | existing |
| Settled Mind | `settled-mind` | Guided workbooks for meeting worry and fear with steadier steps. | worry, anxiety, panic attacks, social anxiety, OCD, intrusive thoughts, health anxiety, fear | wellbeing | higher | No | new |
| Brighter Days | `brighter-days` | Guided workbooks for lifting low days and keeping mood steady. | low mood, depression, sadness, motivation, mood swings, bipolar, winter blues | wellbeing | higher | No | new |
| Gentle Mending | `gentle-mending` | Guided workbooks for living with loss and rebuilding after hard times. | grief, bereavement, trauma, PTSD, childhood trauma, addiction recovery, drinking less, loss | wellbeing | higher | No | new |

### 2. Health and Body (`health-and-body`)

Guided workbooks for moving, eating well and looking after your body. Status: new shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Everyday Movement | `everyday-movement` | Guided workbooks for moving more in ways that fit your week. | exercise, walking, fitness, strength, stretching, running, active habits, movement and mood | wellbeing | standard | Yes | new |
| Nourishing Meals | `nourishing-meals` | Guided workbooks for planning, cooking and enjoying everyday food. | healthy eating, nutrition, meal planning, cooking at home, food and mood, sugar, hydration | wellbeing | standard | Yes | new |
| Ageing Well | `ageing-well` | Guided workbooks for staying active, curious and connected in later life. | ageing, later life, menopause, memory, balance, retirement, staying active | wellbeing | standard | Yes | new |

### 3. Personal Growth (`personal-growth`)

Guided workbooks for habits, confidence, purpose and good decisions. Status: proposed shelf, already seeded. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Chosen Habits | `chosen-habits` | Guided workbooks for habits, values and character, old and new. | habits, routines, values, self-improvement, discipline, minimalism, morning routine | personal_development | none | Yes | existing |
| Quiet Confidence | `quiet-confidence` | Guided workbooks for speaking up, setting limits and trusting yourself. | confidence, assertiveness, shyness, imposter syndrome, boundaries, self-belief, people pleasing | personal_development | none | Yes | new |
| Clearer Choices | `clearer-choices` | Guided workbooks for setting goals and making good decisions. | decision-making, goals, goal setting, problem solving, critical thinking, priorities, life planning | personal_development | none | Yes | new |
| Living With Purpose | `living-with-purpose` | Guided workbooks for finding what matters and shaping life around it. | purpose, meaning of life, midlife, finding yourself, identity, life lessons, new chapter, legacy | personal_development | none | Yes | new |
| Wisdom for Living | `wisdom-for-living` | Guided workbooks that turn old philosophy into daily habits. | stoicism, philosophy, ethics, virtue, Marcus Aurelius, Seneca, Epictetus, existentialism | personal_development | none | Yes | new |

### 4. Love and Relationships (`love-and-relationships`)

Guided workbooks for couples, friends and honest conversations. Status: existing shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Partners in Step | `partners-in-step` | Guided workbooks for couples sharing a life and a home. | couples, marriage, household chores, shared calendar, newlyweds, couple communication, marriage preparation | relationships | none | Yes | existing |
| Companionable Days | `companionable-days` | Guided workbooks for friendship, family talk and honest conversations. | friendship, making friends, moving city, difficult conversations, resolving conflict, listening, etiquette | relationships | none | Yes | existing |
| New Chapters | `new-chapters` | Guided workbooks for dating, separating and starting again. | dating, breakup, divorce, separation, single life, starting again, heartbreak | relationships | standard | No | new |

### 5. Family and Parenting (`family-and-parenting`)

Guided workbooks for raising children and caring for family. Status: existing shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Raising With Care | `raising-with-care` | Guided workbooks for family routines, children and teenagers. | parenting, family routines, teenagers, screens, homework, toddlers, behaviour, siblings | parenting | none | Yes | existing |
| Early Days | `early-days` | Guided workbooks for pregnancy, a new baby and the first year. | pregnancy, new baby, new parents, first year, fatherhood, motherhood, baby sleep, postnatal | parenting | standard | Yes | new |
| Changing Families | `changing-families` | Guided workbooks for step-families, adoption and new family shapes. | step-parenting, blended families, adoption, fostering, co-parenting, grandparenting, kinship care | parenting | standard | Yes | new |
| Caring Hands | `caring-hands` | Guided workbooks for people who look after a relative or friend. | carers, caring for parents, dementia, elderly parent, respite, sandwich generation, young carers | life_skills | standard | Yes | new |

### 6. Work and Career (`work-and-career`)

Guided workbooks for careers, teams and small businesses. Status: existing shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Work Worth Choosing | `work-worth-choosing` | Guided workbooks for changing jobs, growing a career and talking about your work. | career change, job search, interviews, pay conversations, mentoring, promotion, CV | career | none | Yes | existing |
| Purposeful Time | `purposeful-time` | Guided workbooks for planning your days, meetings and focused hours. | productivity, time management, planning, meetings, focus, procrastination, deep work | productivity | none | Yes | existing |
| Words That Land | `words-that-land` | Guided workbooks for speaking, writing and negotiating at work. | public speaking, presentations, negotiation, persuasion, storytelling, pitching, business writing, networking | career | none | Yes | new |
| Shared Direction | `shared-direction` | Guided workbooks for managing people and leading teams. | leadership, management, delegation, feedback, teams, coaching, strategy, project management | leadership | none | Yes | existing |
| Welcoming Workplaces | `welcoming-workplaces` | Guided workbooks for team culture, hiring and fair ways of working. | work culture, inclusion, hiring, onboarding, remote work, hybrid working, psychological safety, business ethics | leadership | none | Yes | new |
| Ventures Taking Shape | `ventures-taking-shape` | Guided workbooks for starting and running a small business. | small business, trading, customers, bookkeeping, hiring, start-up, business plan | business | none | Yes | existing |
| Wider Reach | `wider-reach` | Guided workbooks for marketing, selling and finding customers. | marketing, sales, branding, social media marketing, copywriting, pricing, newsletters | business | none | Yes | new |

### 7. Money (`money`)

Guided workbooks for everyday money, saving and planning ahead. Status: existing shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Considered Spending | `considered-spending` | Guided workbooks for budgets, bills and everyday money choices. | budgeting, spending, bills, household money, cost of living, shopping habits | finance | none | Yes | existing |
| Money for Later | `money-for-later` | Guided workbooks for saving, irregular income and planning ahead. | saving, savings groups, freelance income, emergency fund, sinking funds, irregular pay | finance | none | Yes | existing |
| Paying It Down | `paying-it-down` | Guided workbooks for clearing what you owe, one step at a time. | debt, credit cards, loans, overdraft, arrears, money worries, credit score | finance | standard | Yes | new |
| Patient Investing | `patient-investing` | Guided workbooks for pensions, long-term saving and learning how investing works. | investing, index funds, pensions, ISA, retirement planning, compound interest, risk | finance | none | Yes | new |

### 8. Learning and Skills (`learning-and-skills`)

Guided workbooks for study, teaching and practical skills. Status: proposed shelf, already seeded. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Unrushed Learning | `unrushed-learning` | Guided workbooks for study, exams and returning to learning. | study skills, exams, note-taking, adult learning, revision, memory techniques, languages | education | none | Yes | existing |
| Practical Know-How | `practical-know-how` | Guided workbooks for running a home and looking after yourself. | life skills, first home, cooking, bills, repairs, cleaning, renting | life_skills | none | Yes | existing |
| Digital Ease | `digital-ease` | Guided workbooks for everyday tech, online safety and screen habits. | screen time, digital habits, phone use, online safety, scams, AI tools, spreadsheets | life_skills | none | Yes | new |
| Guiding Learners | `guiding-learners` | Guided workbooks for teachers, tutors and home educators. | teaching, homeschooling, tutoring, lesson planning, classroom, home education, Sunday school | education | none | Yes | new |
| Curious Reading | `curious-reading` | Guided study companions for big books on history, science and society. | history, science, economics, society, technology, nature, biography, study guide, book club | education | none | Yes | new |

### 9. Faith and Spirituality (`faith-and-spirituality`)

Guided workbooks for Bible study, prayer and growing in faith. Status: new shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Reading Scripture | `reading-scripture` | Guided workbooks for reading and studying the Bible week by week. | Bible study, Bible reading plan, Gospels, Psalms, Proverbs, Old Testament, New Testament, Paul's letters, inductive study | education | none | Yes | new |
| Rhythms of Prayer | `rhythms-of-prayer` | Guided workbooks for building a steady habit of prayer. | prayer, quiet time, Lord's Prayer, praying the Psalms, intercession, fasting, prayer journal | personal_development | none | Yes | new |
| Growing in Faith | `growing-in-faith` | Guided workbooks for discipleship and the Christian life. | discipleship, spiritual growth, Christian living, new Christian, baptism preparation, confirmation, fruit of the Spirit, spiritual disciplines | personal_development | none | Yes | new |
| Faith at Home | `faith-at-home` | Guided workbooks for marriage, parenting and family life shaped by faith. | Christian marriage, Christian parenting, family devotions, marriage preparation, family prayer, raising children in faith | relationships | none | Yes | new |
| Work as Calling | `work-as-calling` | Guided workbooks for faith, vocation and rest in working life. | calling, vocation, faith and work, Sabbath, integrity at work, Christian leadership, rest | career | none | Yes | new |
| Generous Living | `generous-living` | Guided workbooks for giving, stewardship and contentment. | stewardship, giving, tithing, generosity, contentment, simplicity, money and faith | personal_development | none | Yes | new |
| Mercy and Comfort | `mercy-and-comfort` | Guided workbooks for forgiveness, grief and hope in hard seasons. | forgiveness, grief, bereavement, lament, suffering, doubt, hope, loss | personal_development | standard | Yes | new |
| Serving Together | `serving-together` | Guided workbooks for small group leaders, volunteers and church teams. | small group leaders, church leadership, volunteers, ministry teams, pastoral care, youth work, eldership, welcome teams | leadership | none | Yes | new |
| Quiet Contemplation | `quiet-contemplation` | Guided workbooks for contemplative practice across faith traditions. | contemplation, meditation, Christian mysticism, silence, Buddhism, Judaism, Islam, interfaith | personal_development | none | Yes | new |

### 10. Creativity and Making (`creativity-and-making`)

Guided workbooks for writing, making and creative practice. Status: new shelf. Suits groups: Yes.

| Theme | Slug | Line | Hidden topics | Genre | Safety | Groups | Status |
|---|---|---|---|---|---|---|---|
| Steady Writing | `steady-writing` | Guided workbooks for a steady writing habit and better stories. | creative writing, journaling, poetry, fiction writing, novel, short stories, writer's block, writing habit | education | none | Yes | new |
| Life Stories | `life-stories` | Guided workbooks for writing your memories and family history. | memoir, life story, family history, legacy letters, reminiscence, ancestry, autobiography | personal_development | none | Yes | new |
| Creative Habits | `creative-habits` | Guided workbooks for making time to draw, play and create. | creativity, creative block, drawing, art, music practice, crafts, photography, design thinking | personal_development | none | Yes | new |

### Suggested areas for new Themes

Every seeded Theme has an area, so new Themes should too. Area names are internal labels here. Positive names are used anyway in case they are ever shown.

| Shelf | Area (new unless marked) | Themes |
|---|---|---|
| Mind and Mood | worry, mood, heal (existing) | Settled Mind (worry), Brighter Days (mood), Gentle Mending (heal) |
| Health and Body | Everyday Health (`everyday-health`) | Everyday Movement, Nourishing Meals, Ageing Well |
| Personal Growth | Habits and Character (existing) | Quiet Confidence, Wisdom for Living |
| Personal Growth | Direction and Meaning (`direction-and-meaning`) | Clearer Choices, Living With Purpose |
| Love and Relationships | Couples and Friends (existing) | New Chapters |
| Family and Parenting | Home and Family (existing) | Early Days, Changing Families, Caring Hands |
| Work and Career | Careers and Craft (existing) | Words That Land |
| Work and Career | Teams and Ventures (existing) | Welcoming Workplaces, Wider Reach |
| Money | Spending and Saving (existing) | Paying It Down |
| Money | Long-Term Money (`long-term-money`) | Patient Investing |
| Learning and Skills | Study and Know-How (existing) | Digital Ease, Guiding Learners, Curious Reading |
| Faith and Spirituality | Scripture and Prayer (`scripture-and-prayer`) | Reading Scripture, Rhythms of Prayer, Quiet Contemplation |
| Faith and Spirituality | Faith in Daily Life (`faith-in-daily-life`) | Growing in Faith, Faith at Home, Work as Calling, Generous Living, Mercy and Comfort |
| Faith and Spirituality | Church and Groups (`church-and-groups`) | Serving Together |
| Creativity and Making | Writing and Making (`writing-and-making`) | Steady Writing, Life Stories, Creative Habits |

## 5. Schema and code changes

### Data only (no schema change)

1. Add 3 shelf rows with status `proposed`: `health-and-body`, `faith-and-spirituality`, `creativity-and-making`. Add them to `content/registry/shelves.json` and let the seed loader write them. The current sort runs 1 to 7. Suggested order: Health and Body after Mind and Mood, Faith and Spirituality and Creativity and Making at the end. Changing `sort` on existing rows is a data update.
2. Add 7 area rows (table above) to `content/registry/areas.json`.
3. Add 34 Theme rows to `content/registry/themes.json`, each with `clearance_status` pending and `min_books` 3. The `themes` table needs no new column for name, line, shelf, area or topics.
4. Fill `line` and `topics` for the five Mind and Mood Themes, which are null and empty today. Add the extra topics to the existing Themes as listed. Move `stoicism` from Chosen Habits to Wisdom for Living.
5. Run the 34 new names through the same clearance as the first 12: an exact-phrase web search, then UKIPO, USPTO and EUIPO register searches in classes 9, 16, 41 and 44. None has been searched. "Ageing Well", "Early Days", "New Chapters" and "Living With Purpose" are common phrases and are the most likely to be crowded.

### Additive schema changes (allowed by the freeze)

6. **Group flag.** Nothing in the schema or database records whether a Theme suits groups. The registry JSON can carry `group_suitable` with no migration. If the app should filter by it, add a new migration (0011 or later) with `alter table public.themes add column group_suitable boolean not null default false`. That is additive. A workbook-level flag would be a new optional field in v3, which the freeze allows. It must stay optional.
7. **Optional `faith` genre.** The 11 genres have no natural home for Bible study and prayer. The proposal maps each faith Theme to the nearest existing genre, so it works without this change. A `faith` genre is worth adding if faith titles need their own rules: no healing or answered-prayer claims, a signpost to pastoral care, and a scripture licence check. Adding a genre value is additive under the freeze. It touches:
   - `GENRES` in `packages/schema/src/v3.ts` (append only, never reorder or rename).
   - `content/registry/genres.json` and the genre profile in `@akana/validate`.
   - The genres table. Migration 0002 has a CHECK constraint listing the 11 ids. A new migration must drop and recreate that constraint with 12 ids, then insert the row. Do not edit 0002. Dropping and recreating a CHECK with a larger list removes no allowed value, so the effect is additive.
   - `GENRE_LABELS` in `apps/web/app/publish/options.ts`. It is typed `Record<Genre, string>`, so the build fails until a label is added. That is a useful guard.
   - Workbook genre in the seed builder (`packages/seed/src/build.ts`) needs no change, because it reads `GENRES`.

### Existing checks that would fail

8. `supabase/tests/0002_catalogue.sql` line 109 expects exactly 11 genres. It fails as soon as a 12th genre is seeded. Update it in the same change.
9. `scripts/check-registry.ts` (`toGenre`) silently treats any unknown genre as `wellbeing`. If a `faith` title reaches the registry before the schema change, it is checked as wellbeing, with the full claims check and Help now. Make it throw on an unknown genre, or land the schema change first.

### What would break the freeze, and is not proposed

10. Renaming or removing an existing shelf, area or Theme id. Workbooks reference `theme_id`, and Theme ids go into emails. All 17 ids are kept.
11. Making `group_suitable`, or any new field, required.
12. Removing, renaming or reordering a genre value.
13. Moving a live workbook to a different genre or safety tier. That is allowed but changes a safety line, gives `SAFETY_CHANGED` and needs safety sign-off again. It matters if a Maya Vaughn title is ever moved into Health and Body or re-tiered to higher.

### Other flags

14. **Bible text rights [check with lawyer].** In the UK the King James Version is not in the public domain. It is held under Crown letters patent. Modern translations such as the NIV and ESV are licensed, with publisher quotation limits. A public-domain text such as the World English Bible avoids both. Reading Scripture workbooks need a translation decision before the first one is built.
15. **Hidden topic leaks and crisis words.** The new hidden topics include condition words (depression, OCD, PTSD, debt, divorce). The existing build check that fails on any topic word in public metadata must cover the new Themes. Several higher tier topics overlap the crisis word list, so those searches should show the Help now card above results, as the feature list already says.
16. **Three-book rule.** No new Theme shows as a shelf until it holds three workbooks. The three new shelves start empty. Faith and Spirituality alone needs 27 titles to fill all nine Themes, so start with Reading Scripture, Rhythms of Prayer and Growing in Faith.
17. **Health limits.** Keep weight loss promises, medical treatment and eating disorder terms out of Nourishing Meals and Everyday Movement. Women's health and fertility are not proposed at launch for the same reason.

## Sources

Fetched 7 October 2026.

- Blinkist category index: https://www.blinkist.com/en/content/categories
- Blinkist category pages (topic tags): https://www.blinkist.com/content/categories/personal-growth-and-self-improvement-en, /mindfulness-and-happiness-en, /health-and-fitness-en, /money-and-investments-en, /relationships-and-parenting-en, /management-and-leadership-en, /career-and-success-en, /communication-and-social-skills-en, /productivity-and-time-management-en, /entrepreneurship-and-small-business-en, /parenting-en, /psychology-en, /creativity-en, /education-en, /motivation-and-inspiration-en, /corporate-culture-en, /marketing-and-sales-en, /philosophy-en, /nature-and-environment-en, /technology-and-the-future-en, /society-and-culture-en, /book-types-en, /religion-and-spirituality-en
- Shortform summaries page: https://www.shortform.com/summaries
- Headway home page: https://makeheadway.com/
- Audible categories (US): https://www.audible.com/categories
- BISAC Self-Help headings: https://www.bisg.org/self-help
- BISAC Religion headings: https://www.bisg.org/religion
- Repo: `docs/planning/AK_Demo_Catalogue.json`, `docs/planning/AK_Demo_Catalogue_Plan.md`, `docs/planning/AK_Architecture.md`, `docs/SCHEMA_V3_FREEZE.md`, `packages/schema/src/v3.ts`, `supabase/migrations/0002_catalogue.sql`, `supabase/seed/seed.sql`, `content/registry/*.json`, `content/catalog/catalog.json`

The KJV point in flag 14 is general knowledge, not from a page fetched for this note. Confirm it before relying on it.
