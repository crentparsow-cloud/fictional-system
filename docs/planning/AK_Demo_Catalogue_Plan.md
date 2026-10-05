# Akana demo catalogue plan

Prepared 5 October 2026 by the Editorial Director, with the Naming Strategist, Legal Lead and Clinical Safety Lead. The machine-readable version is `AK_Demo_Catalogue.json` in this folder. The seed loader should read that file, not this one.

## 1. What this plan sets out

The demo catalogue has 50 workbooks. 45 are invented demo workbooks from 18 invented authors in 18 countries. 5 are real public-domain classics turned into new Akana workbooks. Maya Vaughn's 20 workbooks are the real existing author and are counted separately, so the library shows 70 workbooks at launch of the demo.

Every workbook has a listing, a card line, a cover brief (to follow), an outline and a written first week. 20 are marked to be fully written: one per invented author, plus the two shortest classics. The other 30 stop after week one, which matches the free first week a reader sees anyway.

Five invented imprints carry eleven of the authors, so the publisher console has something real to show. Seven authors are independent, so the author portal does too. Every invented person, imprint and book carries `is_demo: true` and a "Demo workbook" badge. Demo content cannot be sold. The classics are different: the text is genuinely public domain and the workbook is new Akana material, so Crent could choose to sell them [Crent].

No prices are set here. Each workbook has a price tier tied to its length: short (4 weeks), standard (6 weeks), extended (8 weeks) and programme (12 weeks). The GBP amount for each tier is for Crent to set.

## 2. Rules applied

Title-first identity: each workbook is its book title, its author and a permanent AK- code, as the naming board decided on 2 October. Codes were minted with the same rule as the first 20 (sha256 of `akana:<key>:n`, five Crockford base32 characters, least significant first) and checked against them. Author and imprint ids use AU- and PB- in the same way. URL slugs follow the board's pattern, for example `/w/the-open-air-ledger-xxxxx`.

Book titles: every invented title was searched on the web on 5 October 2026 as an exact phrase. Titles that matched a real book, a well-known article or a podcast episode were replaced, and the replacement was searched again. The result of each check is in the tables below and in the JSON (`title_check`). A web search is not a full bibliographic or trade mark search, so the Legal Lead still wants an ISBN database check before any demo title is shown publicly [check].

Author names: names were built to be distinctive, often double-barrelled, and searched. Two first choices were real people (one a working author) and two were close to public figures, so all four were replaced. No bio claims a clinical or professional licence, because a demo must not suggest expertise that does not exist.

Imprint names: the first set clashed with real publishers (L'Harmattan, Jacaranda Books, Birchbark Press, Bluegill Press, Elbufer Verlag, Savanna Ink Publishing, Monsoon Books, Tamarind Books, Tidewater Press). All were dropped. The five kept names returned no publisher of the same name.

Themes: new genre Themes follow section 3 of the naming board. Each is positive, two or three words, names a direction rather than a result, avoids condition words and app vocabulary (Today, Path, Progress, My plan, Explore, Build, Practice, Keep, Help now), shares no first word with another Theme on its shelf, does not echo a book title on its shelf, and holds at least three workbooks. Three titles were renamed because they echoed their Theme. Every Theme still needs a register search (UKIPO, USPTO, EUIPO in classes 9, 16, 41 and 44) before launch [check].

Standing rules carried over: wellness not treatment, no effectiveness claims, no scored self-checks in wellbeing workbooks, Help now one tap away in every wellbeing workbook, no streaks that punish, and emails that name only the Theme.

## 3. Shelves, areas and Themes

Two shelves are proposed to cover the genres Crent named that the six fixed shelves do not: Personal Growth (personal development) and Learning and Skills (education and life skills). That makes eight shelves, inside the board's limit of six to ten [Crent]. Business, leadership, career and productivity share Work and Career. Wellbeing demo titles go into existing Mind and Mood Themes beside Maya Vaughn's books, which is exactly the many-authors case the naming board designed for.

| Shelf | Area | Theme | Workbooks | Clearance result |
|---|---|---|---|---|
| Work and Career | Careers and Craft | Work Worth Choosing | 4 | No exact book or app match. Nearby: 'Work That's Worth It' (book quotes page). Rejected first: Meaningful Work (existing book), Career Crossings (college careers service), Work Chapters (coaching site 'Your Next Work Chapter'), Next Career Steps (crowded) [check registers] |
| Work and Career | Careers and Craft | Purposeful Time | 4 | No exact match. Nearby: two books titled 'Purposeful Productivity' and the app 'Purposeful by Kumanu'. Legal to rule on closeness [check]. Rejected first: Purposeful Hours, because it echoes Bennett's title on the same shelf |
| Work and Career | Teams and Ventures | Shared Direction | 6 | No exact book or app match. 'Shared leadership' is a known academic term [check]. Rejected first: Leading Others (Mac Lake book), Generous Leading (close to 'Leading Generously', JHU Press) |
| Work and Career | Teams and Ventures | Ventures Taking Shape | 4 | No exact match found. Rejected first: Growing Ventures (book on school garden businesses) |
| Money | Spending and Saving | Considered Spending | 3 | No exact book or app match found. Rejected first: Thoughtful Money (finance podcast and advisory firm) |
| Money | Spending and Saving | Money for Later | 3 | No exact book or app match found. Rejected first: Planning Ahead (too close to the app word 'My plan') |
| Family and Parenting | Home and Family | Raising With Care | 5 | No exact match found [check registers] |
| Love and Relationships | Couples and Friends | Partners in Step | 3 | No exact book or app match found. Couple apps such as Paired exist with different names |
| Love and Relationships | Couples and Friends | Companionable Days | 3 | No exact match found. Rejected first: Warmer Friendships (echoes the title Friends Worth Calling), Kindred Company (Kindred social apps) |
| Personal Growth (proposed) | Habits and Character | Chosen Habits | 4 | No exact book or app match found. Habit apps are crowded, so a register search matters [check] |
| Learning and Skills (proposed) | Study and Know-How | Unrushed Learning | 3 | No exact match found. Rejected first: Study Craft (app), Patient Study (reads as medical), Study at Ease (book), Thoughtful Study (app), Learning Seasons (echoes two titles) |
| Learning and Skills (proposed) | Study and Know-How | Practical Know-How | 3 | No exact title match. Generic phrase; 'The Little Know-How Book' exists nearby [check] |

Existing Mind and Mood Themes used by demo titles: Noticing More (1); Softer Nights (1); Even Pace (1); Seeing Yourself Fairly (1); Renewing Energy (1). Each already holds a Maya Vaughn workbook, so the three-book rule is met.

Theme page lines, for the header under each Theme name:

- Work Worth Choosing: "Guided workbooks for changing jobs, growing a career and talking about your work."
- Purposeful Time: "Guided workbooks for planning your days, meetings and focused hours."
- Shared Direction: "Guided workbooks for managing people and leading teams."
- Ventures Taking Shape: "Guided workbooks for starting and running a small business."
- Considered Spending: "Guided workbooks for budgets, bills and everyday money choices."
- Money for Later: "Guided workbooks for saving, irregular income and planning ahead."
- Raising With Care: "Guided workbooks for family routines, children and teenagers."
- Partners in Step: "Guided workbooks for couples sharing a life and a home."
- Companionable Days: "Guided workbooks for friendship, family talk and honest conversations."
- Chosen Habits: "Guided workbooks for habits, values and character, old and new."
- Unrushed Learning: "Guided workbooks for study, exams and returning to learning."
- Practical Know-How: "Guided workbooks for running a home and looking after yourself."

## 4. Imprints (all invented, all demo)

| Imprint | Base | Authors |
|---|---|---|
| Okro & Indigo Books (PB-7JEW0) | Lagos, NG | Chidinma Obiora-Lane, Efua Dadzie-Lamptey |
| Ochre Finch Press (PB-5YMGY) | Nairobi, KE | Wanjiru Kamau-Otieno, Thandiwe Mokoena-Dube |
| Kettlebrook Editions (PB-F5VRD) | Manchester, GB | Clodagh Ní Fhaoláin-Burke, Hester Quarrington, Nadia Farouk-Hassan |
| Larchmere Atlas Books (PB-2E6YP) | Chicago, US | Marcus Delacroix-Hayes, Olivier Tremblay-Singh |
| Ipê Azul Edições (PB-640RS) | São Paulo, BR | Rafael Moreira Lins, Ximena Ruiz-Albarrán |

## 5. Authors

| Id | Author | Country | Genre | Imprint | Bio |
|---|---|---|---|---|---|
| AU-9ZG4W | Chidinma Obiora-Lane (demo) | NG | business | Okro & Indigo Books | Ran a fabric stall in Balogun Market before opening two shops. Writes plain guides for traders who keep the books themselves. This author is invented for the Akana demo. |
| AU-8WS7W | Efua Dadzie-Lamptey (demo) | GH | leadership | Okro & Indigo Books | Led a cooperative of cocoa farmers in the Ashanti Region for many years. Writes about leading by listening first. This author is invented for the Akana demo. |
| AU-JKGDQ | Wanjiru Kamau-Otieno (demo) | KE | finance | Ochre Finch Press | A former bank branch manager in Nakuru who now runs money evenings for savings groups. Writes about household money in plain words. This author is invented for the Akana demo. |
| AU-77Q79 | Thandiwe Mokoena-Dube (demo) | ZA | parenting | Ochre Finch Press | A mother of three and former primary school teacher in Soweto. Writes about family life that runs on small routines. This author is invented for the Akana demo. |
| AU-GFYGM | Meenakshi Iyer-Rao (demo) | IN | productivity | Independent (self-published) | Spent fifteen years as a project lead in Bengaluru software firms. Writes about doing fewer things with more care. This author is invented for the Akana demo. |
| AU-PVT1E | Clodagh Ní Fhaoláin-Burke (demo) | IE | relationships | Kettlebrook Editions | A community mediator in Galway who has sat in on a great many kitchen-table arguments. Writes about saying difficult things kindly. This author is invented for the Akana demo. |
| AU-JNCDE | Hester Quarrington (demo) | GB | career | Kettlebrook Editions | Retrained from retail management to further education teaching at forty-one. Writes for people changing direction mid-career. This author is invented for the Akana demo. |
| AU-N2JS0 | Marcus Delacroix-Hayes (demo) | US | leadership | Larchmere Atlas Books | Managed restaurant teams in Chicago before moving into operations for a regional chain. Writes about the everyday work of managing people. This author is invented for the Akana demo. |
| AU-9WVE6 | Matilda Kershaw-Nguyen (demo) | AU | life-skills | Independent (self-published) | A youth worker in Brisbane who helps young people set up their first homes. Writes practical guides for living on your own. This author is invented for the Akana demo. |
| AU-0TKBN | Olivier Tremblay-Singh (demo) | CA | education | Larchmere Atlas Books | A college learning skills adviser in Toronto. Writes about studying in ways that fit around real life. This author is invented for the Akana demo. |
| AU-JKB28 | Friederike Ostwald-Rehm (demo) | DE | personal-development | Independent (self-published) | A Hamburg architect who keeps a notebook of small rules for living. Writes about habits that are easy to start and easy to restart. This author is invented for the Akana demo. |
| AU-1DYWF | Rafael Moreira Lins (demo) | BR | relationships | Ipê Azul Edições | A Recife radio presenter who moved cities three times in ten years. Writes about making and keeping friends as an adult. This author is invented for the Akana demo. |
| AU-PZ9DF | Haruka Tanabe-Ellis (demo) | JP | wellbeing | Independent (self-published) | A Kyoto tea teacher who writes about pauses, evenings and unhurried breaks in a busy week. This author is invented for the Akana demo. |
| AU-45ERA | Ximena Ruiz-Albarrán (demo) | MX | finance | Ipê Azul Edições | A Mexico City illustrator who has freelanced for twenty years. Writes about money when income arrives unevenly. This author is invented for the Akana demo. |
| AU-0KY5N | Ligaya Abellera-Cruz (demo) | PH | parenting | Independent (self-published) | A Quezon City guidance counsellor and mother of two teenagers. Writes about staying close to children as they grow up. This author is invented for the Akana demo. |
| AU-ARMK7 | Sofia Hedlund-Ahl (demo) | SE | relationships | Independent (self-published) | An Uppsala family support worker. Writes about couples sharing the running of a home. This author is invented for the Akana demo. |
| AU-1ZS6X | Tama Rāwiri-Hughes (demo) | NZ | leadership | Independent (self-published) | Coached community rugby clubs and later led volunteer teams across Wellington. Writes about teams that share the work. This author is invented for the Akana demo. |
| AU-7WKXG | Nadia Farouk-Hassan (demo) | EG | wellbeing | Kettlebrook Editions | An Alexandria secondary school teacher who writes about kinder self-talk and weeks that hold too much. This author is invented for the Akana demo. |

Public-domain authors: Arnold Bennett (1867 to 1931) AU-7FGRT; Marcus Aurelius (121 to 180, George Long (1800 to 1879), translator) AU-M0SAD; Benjamin Franklin (1706 to 1790) AU-BXMPD; Charlotte M. Mason (1842 to 1923) AU-P0Q91; Samuel Smiles (1812 to 1904) AU-HX8HW. Maya Vaughn stays AU-2DA6H.

## 6. Workbooks

Depth: full means every week is written; first week means a full listing, cover, outline and a usable week one. Safety: WB means `wellbeing_standard` with Help now. Guardrail and signpost columns are explained in section 8.

### Work and Career (18)

**The Open-Air Ledger**: Simple Books for Market Traders  
Chidinma Obiora-Lane (demo), Okro & Indigo Books. `AK-TJWHK`, id `the-open-air-ledger`.  
Genre business. Theme Ventures Taking Shape. 6 weeks, standard tier. Depth: full. Flags: not legal or tax advice.  
Card line: "Keep a daily cash book, price with margin and know your real takings."  
Weeks 1 to 2: a one-page daily cash book and a weekly count.  
Weeks 3 to 4: working out costs, margins and what each line earns.  
Weeks 5 to 6: setting money aside for stock, rent and slow months.  
Title check, 5 Oct 2026: No exact title found. Results showed Richard Jefferies' 'The Open Air' and unrelated ledgers.

**Customers Who Come Back**: Repeat Trade for Small Shops  
Chidinma Obiora-Lane (demo), Okro & Indigo Books. `AK-A2BXW`, id `customers-who-come-back`.  
Genre business. Theme Ventures Taking Shape. 8 weeks, extended tier. Depth: first week. Flags: not legal or tax advice.  
Card line: "Learn names, follow up and give regulars a reason to return."  
Weeks 1 to 3: knowing who your regulars are and what they buy.  
Weeks 4 to 6: small follow-ups, fair offers and handling complaints.  
Weeks 7 to 8: asking for referrals and reviewing what worked.  
Title check, 5 Oct 2026: No exact title. Nearby: Shep Hyken 'I'll Be Back', 'The Come Back Culture'.

**Selling Beyond the Street**: Taking a Small Shop Online  
Chidinma Obiora-Lane (demo), Okro & Indigo Books. `AK-7BZ6P`, id `selling-beyond-the-street`.  
Genre business. Theme Ventures Taking Shape. 6 weeks, standard tier. Depth: first week. Flags: not legal or tax advice.  
Card line: "Photograph stock, take orders by message and deliver without fuss."  
Weeks 1 to 2: choosing one channel and photographing your best lines.  
Weeks 3 to 4: taking orders, payments and delivery in a set routine.  
Weeks 5 to 6: keeping online and stall stock in one count.  
Title check, 5 Oct 2026: No exact title. 'Beyond the Streets' (graffiti books, Roger Gastman) is a different subject.

**The Elder's Chair**: Leading by Listening First  
Efua Dadzie-Lamptey (demo), Okro & Indigo Books. `AK-2XX1P`, id `the-elders-chair`.  
Genre leadership. Theme Shared Direction. 12 weeks, programme tier. Depth: full.  
Card line: "Hear everyone before you decide, then explain the decision plainly."  
Weeks 1 to 4: listening rounds, notes and noticing who is not heard.  
Weeks 5 to 8: making decisions in the open and explaining them.  
Weeks 9 to 12: handing over authority and growing the next leaders.  
Title check, 5 Oct 2026: No exact title. Results were church eldership books and 'Leading from the Second Chair'.

**Your First Team**: Six Weeks as a New Manager  
Efua Dadzie-Lamptey (demo), Okro & Indigo Books. `AK-6VDBX`, id `your-first-team`.  
Genre leadership. Theme Shared Direction. 6 weeks, standard tier. Depth: first week.  
Card line: "One-to-ones, clear roles and a weekly rhythm for a new manager."  
Weeks 1 to 2: meeting each person and writing down what they need.  
Weeks 3 to 4: agreeing roles, goals and how you will check in.  
Weeks 5 to 6: first feedback conversations and a team review.  
Title check, 5 Oct 2026: No exact title found among first-time manager books [check].

**Letting Go of the Clipboard**: Delegation for Hands-On Leaders  
Efua Dadzie-Lamptey (demo), Okro & Indigo Books. `AK-9XZNH`, id `letting-go-of-the-clipboard`.  
Genre leadership. Theme Shared Direction. 4 weeks, short tier. Depth: first week.  
Card line: "Decide what to hand over, brief it well and resist taking it back."  
Week 1: listing what only you can do and what others could.  
Weeks 2 to 3: briefing a task, agreeing checkpoints and stepping back.  
Week 4: reviewing what changed and what to hand over next.  
Title check, 5 Oct 2026: No exact title. Delegation books use 'letting go' widely; first choice 'Handing Over the Keys' was dropped because a 2023 book of that title exists.

**The Unhurried To-Do List**: Doing Fewer Things Well  
Meenakshi Iyer-Rao (demo), Independent (self-published). `AK-0ATHQ`, id `the-unhurried-to-do-list`.  
Genre productivity. Theme Purposeful Time. 6 weeks, standard tier. Depth: full.  
Card line: "Cut the list to three, plan the week and close each day on time."  
Weeks 1 to 2: emptying your head and choosing three priorities.  
Weeks 3 to 4: weekly planning and saying no politely.  
Weeks 5 to 6: end-of-day shutdowns and a monthly review.  
Title check, 5 Oct 2026: No exact title. Nearby: 'Unhurried' (Samantha Decker, Moody) and unhurried.org.

**Deep Mornings**: Protecting Your Best Hours  
Meenakshi Iyer-Rao (demo), Independent (self-published). `AK-BFTT8`, id `deep-mornings`.  
Genre productivity. Theme Purposeful Time. 4 weeks, short tier. Depth: first week.  
Card line: "Guard one focused block each morning and plan around it."  
Week 1: finding when you think best and what interrupts it.  
Weeks 2 to 3: a protected morning block and a simple start ritual.  
Week 4: keeping the block when the week gets busy.  
Title check, 5 Oct 2026: No exact title. Results were morning routine lists and 'Deep Work'.

**The Agenda on a Postcard**: Shorter Meetings That Decide Things  
Meenakshi Iyer-Rao (demo), Independent (self-published). `AK-AWYB0`, id `the-agenda-on-a-postcard`.  
Genre productivity. Theme Purposeful Time. 4 weeks, short tier. Depth: first week.  
Card line: "Write an agenda that fits a postcard and end with named actions."  
Week 1: auditing a week of meetings and their purpose.  
Weeks 2 to 3: postcard agendas, timeboxes and decision notes.  
Week 4: cancelling, merging and replacing meetings.  
Title check, 5 Oct 2026: No exact title. First choice 'Meetings With a Point' was dropped because it is a Faster Smarter podcast episode title.

**A New Trade at Forty**: Changing Career Mid-Life  
Hester Quarrington (demo), Kettlebrook Editions. `AK-YYD3W`, id `a-new-trade-at-forty`.  
Genre career. Theme Work Worth Choosing. 8 weeks, extended tier. Depth: full.  
Card line: "Map your skills, test a new field cheaply and plan the move."  
Weeks 1 to 3: what you have done, what you enjoyed and what you can carry over.  
Weeks 4 to 6: small tests, conversations and a short course.  
Weeks 7 to 8: a money plan for the move and a first application.  
Title check, 5 Oct 2026: No exact title. First choice 'Changing Lanes at Forty' was dropped because 'Changing Lanes' is crowded in career titles.

**Talking Money with Your Manager**: Preparing for a Pay Conversation  
Hester Quarrington (demo), Kettlebrook Editions. `AK-24T4N`, id `talking-money-with-your-manager`.  
Genre career. Theme Work Worth Choosing. 4 weeks, short tier. Depth: first week.  
Card line: "Gather evidence, rehearse the ask and plan the follow-up."  
Week 1: collecting your results and comparable roles.  
Weeks 2 to 3: writing and rehearsing what you will say.  
Week 4: the meeting, the reply and the follow-up email.  
Title check, 5 Oct 2026: No exact title. Nearby: Jean Chatzky 'Talking Money', 'Talk Money to Me'.

**Your Career in Five Stories**: Preparing Answers for Interviews  
Hester Quarrington (demo), Kettlebrook Editions. `AK-32PNA`, id `your-career-in-five-stories`.  
Genre career. Theme Work Worth Choosing. 4 weeks, short tier. Depth: first week.  
Card line: "Build five true work stories you can adapt to any interview."  
Week 1: choosing five moments from your working life.  
Weeks 2 to 3: shaping each story and matching it to questions.  
Week 4: mock answers out loud and a short reflection.  
Title check, 5 Oct 2026: No exact title. First choice 'Telling Your Work Story' was renamed because it echoed the Theme on the same shelf.

**Feedback Over Coffee**: Everyday Feedback for Managers  
Marcus Delacroix-Hayes (demo), Larchmere Atlas Books. `AK-J85XW`, id `feedback-over-coffee`.  
Genre leadership. Theme Shared Direction. 6 weeks, standard tier. Depth: full.  
Card line: "Give small, specific feedback often, and ask for it back."  
Weeks 1 to 2: noticing what to praise and what to raise.  
Weeks 3 to 4: short feedback conversations and follow-ups.  
Weeks 5 to 6: asking for feedback on your own management.  
Title check, 5 Oct 2026: No exact title. Results were coffee shop guest books.

**Decisions in the Open**: Transparent Choices for Team Leads  
Marcus Delacroix-Hayes (demo), Larchmere Atlas Books. `AK-TJ4ZR`, id `decisions-in-the-open`.  
Genre leadership. Theme Shared Direction. 6 weeks, standard tier. Depth: first week.  
Card line: "Write down what you decided, why, and who it affects."  
Weeks 1 to 2: a simple decision log and who to consult.  
Weeks 3 to 4: explaining decisions and hearing objections.  
Weeks 5 to 6: reviewing past decisions without blame.  
Title check, 5 Oct 2026: No exact title. Nearby: 'Decision Leadership' (Yale) and open-book management.

**Hiring Your First Five**: Building a Small Team  
Marcus Delacroix-Hayes (demo), Larchmere Atlas Books. `AK-1APCY`, id `hiring-your-first-five`.  
Genre business. Theme Ventures Taking Shape. 6 weeks, standard tier. Depth: first week. Flags: not legal or tax advice.  
Card line: "Write the role, interview fairly and plan someone's first month."  
Weeks 1 to 2: deciding what the role is and is not.  
Weeks 3 to 4: fair interviews, references and an offer.  
Weeks 5 to 6: a first-month plan and early check-ins.  
Title check, 5 Oct 2026: No exact title. Nearby: 'Get Your First Five Clients', 'Hiring Your First Employee'.

**Teams That Carry It Together**: Sharing the Work in Volunteer Teams  
Tama Rāwiri-Hughes (demo), Independent (self-published). `AK-HJY00`, id `teams-that-carry-it-together`.  
Genre leadership. Theme Shared Direction. 6 weeks, standard tier. Depth: full.  
Card line: "Share roles, rotate jobs and thank people well."  
Weeks 1 to 2: who does what now and who is carrying too much.  
Weeks 3 to 4: clear roles, rotas and handovers.  
Weeks 5 to 6: recruiting help and thanking people properly.  
Title check, 5 Oct 2026: No exact title. First wording 'Teams That Share the Load' was changed because it echoed the Theme.

**Mentoring Someone New**: A Short Guide for First-Time Mentors  
Tama Rāwiri-Hughes (demo), Independent (self-published). `AK-S3DMK`, id `mentoring-someone-new`.  
Genre career. Theme Work Worth Choosing. 4 weeks, short tier. Depth: first week.  
Card line: "Agree goals, meet regularly and let the mentee lead."  
Week 1: a first meeting and agreeing what the mentee wants.  
Weeks 2 to 3: good questions, sharing stories and small tasks.  
Week 4: reviewing progress and planning the next season.  
Title check, 5 Oct 2026: No exact title. Results were mentoring book lists.

**How to Live on 24 Hours a Day**: A Workbook on the Arnold Bennett Classic  
Arnold Bennett (public domain), Akana Classics (public-domain text, workbook by Akana). `AK-QCRRE`, id `how-to-live-on-24-hours-a-day`.  
Genre productivity. Theme Purposeful Time. 6 weeks, standard tier. Depth: full.  
Card line: "Use Bennett's plan for the hours outside work, one evening at a time."  
Weeks 1 to 2: Bennett's case for the 'day within the day' and your own audit.  
Weeks 3 to 4: his ninety-minute evenings and the morning commute.  
Weeks 5 to 6: reading, reflection and keeping the plan modest.  
Source: Project Gutenberg eBook #2274. First published 1908 (London, New Age Press); expanded edition 1910 [check]. https://www.gutenberg.org/ebooks/2274

### Money (6)

**The Shared Pot**: Running a Savings Group Well  
Wanjiru Kamau-Otieno (demo), Ochre Finch Press. `AK-1V9WQ`, id `the-shared-pot`.  
Genre finance. Theme Money for Later. 6 weeks, standard tier. Depth: full. Flags: money guidance not advice.  
Card line: "Set fair rules, keep clear records and handle late payments calmly."  
Weeks 1 to 2: agreeing group rules, contributions and roles.  
Weeks 3 to 4: record keeping, receipts and monthly reports.  
Weeks 5 to 6: late payments, disputes and planning payouts.  
Title check, 5 Oct 2026: No exact title. Results were Monzo shared pots and savings apps.

**Budgets for Busy Households**: A Monthly Money Routine  
Wanjiru Kamau-Otieno (demo), Ochre Finch Press. `AK-SWX23`, id `budgets-for-busy-households`.  
Genre finance. Theme Considered Spending. 4 weeks, short tier. Depth: first week. Flags: money guidance not advice.  
Card line: "A twenty-minute monthly money meeting for the whole household."  
Week 1: listing income, fixed bills and what usually runs over.  
Weeks 2 to 3: a monthly plan and a weekly spending check.  
Week 4: a household money meeting and next month's changes.  
Title check, 5 Oct 2026: No exact title. Many budget planner notebooks with similar words [check].

**A Little Each Month**: Building a Saving Habit  
Wanjiru Kamau-Otieno (demo), Ochre Finch Press. `AK-4EYKY`, id `a-little-each-month`.  
Genre finance. Theme Money for Later. 6 weeks, standard tier. Depth: first week. Flags: money guidance not advice.  
Card line: "Choose a saving amount you can keep up and protect it from raids."  
Weeks 1 to 2: finding a realistic amount and a safe place for it.  
Weeks 3 to 4: automating the habit and naming what it is for.  
Weeks 5 to 6: what to do in a tight month without giving up.  
Title check, 5 Oct 2026: No exact title. Only a well-known joke quote uses the phrase.

**Lumpy Income, Steady Plans**: Money for Freelancers  
Ximena Ruiz-Albarrán (demo), Ipê Azul Edições. `AK-MBFT8`, id `lumpy-income-steady-plans`.  
Genre finance. Theme Money for Later. 6 weeks, standard tier. Depth: full. Flags: money guidance not advice.  
Card line: "Pay yourself a steady wage from uneven income and keep a buffer."  
Weeks 1 to 2: a year of income at a glance and your real monthly costs.  
Weeks 3 to 4: a holding account, a monthly wage and a buffer.  
Weeks 5 to 6: setting aside for tax and planning quiet months.  
Title check, 5 Oct 2026: No exact title. Nearby: 'The Freelancer's Money Playbook' (two books), 'The Money Book for Freelancers'.

**Invoices, Savings and You**: Getting Paid on Time  
Ximena Ruiz-Albarrán (demo), Ipê Azul Edições. `AK-5X96Z`, id `invoices-savings-and-you`.  
Genre finance. Theme Considered Spending. 4 weeks, short tier. Depth: first week. Flags: money guidance not advice.  
Card line: "Send clear invoices, chase politely and track who owes what."  
Week 1: what you are owed and how long it usually takes.  
Weeks 2 to 3: clear invoices, payment terms and a chasing script.  
Week 4: a monthly money hour for invoices and savings.  
Title check, 5 Oct 2026: No exact title found.

**The Way to Wealth**: A Workbook on Benjamin Franklin's Classic Essay  
Benjamin Franklin (public domain), Akana Classics (public-domain text, workbook by Akana). `AK-3TQX1`, id `the-way-to-wealth`.  
Genre finance. Theme Considered Spending. 4 weeks, short tier. Depth: full. Flags: money guidance not advice.  
Card line: "Test Franklin's sayings on industry and thrift against your own week."  
Week 1: the essay's frame, Father Abraham's speech, and your own spending notes.  
Weeks 2 to 3: 'industry' and 'frugality', read as history and tried as small experiments.  
Week 4: debt, prudence and which sayings still fit modern life.  
Source: 'The Way to Wealth', W. and T. Darton, London, 1810, Project Gutenberg eBook #43855. First published 1758 (preface to Poor Richard's Almanack). https://www.gutenberg.org/files/43855/43855-h/43855-h.htm

### Family and Parenting (5)

**Ubuntu at the Dinner Table**: Family Values in Everyday Routines  
Thandiwe Mokoena-Dube (demo), Ochre Finch Press. `AK-G628R`, id `ubuntu-at-the-dinner-table`.  
Genre parenting. Theme Raising With Care. 8 weeks, extended tier. Depth: full. Flags: family support lines.  
Card line: "Shared meals, small jobs and family talk that builds belonging."  
Weeks 1 to 3: one shared meal a week and a family question jar.  
Weeks 4 to 6: chores as contribution and repairing after arguments.  
Weeks 7 to 8: family values written together and revisited.  
Title check, 5 Oct 2026: No exact title. Results were the Official Ubuntu (Linux) book.

**Screens, Sleep and Sundays**: Gentle Family Routines  
Thandiwe Mokoena-Dube (demo), Ochre Finch Press. `AK-5B1JE`, id `screens-sleep-and-sundays`.  
Genre parenting. Theme Raising With Care. 6 weeks, standard tier. Depth: first week. Flags: family support lines.  
Card line: "Agree screen times, settle bedtimes and protect one slower day."  
Weeks 1 to 2: noticing current routines without blame.  
Weeks 3 to 4: a family screen plan and an evening wind-down.  
Weeks 5 to 6: a slower day each week and a review together.  
Title check, 5 Oct 2026: No exact title. Nearby: 'Screenagers' book, articles on screen-free Sundays.

**The Teenager on the Stairs**: Staying Close as Children Grow Up  
Ligaya Abellera-Cruz (demo), Independent (self-published). `AK-0Y78E`, id `the-teenager-on-the-stairs`.  
Genre parenting. Theme Raising With Care. 8 weeks, extended tier. Depth: full. Flags: family support lines.  
Card line: "Short daily chats, fair house rules and repair after rows."  
Weeks 1 to 3: noticing when your teenager talks and listening more.  
Weeks 4 to 6: house rules agreed together and handling rows.  
Weeks 7 to 8: more independence, check-ins and trust.  
Title check, 5 Oct 2026: No exact title. First choice 'Notes Under the Bedroom Door' was dropped because it is a Scary Mommy article title.

**Homework Without the War**: Calmer Evenings for School Families  
Ligaya Abellera-Cruz (demo), Independent (self-published). `AK-KMWTQ`, id `homework-without-the-war`.  
Genre parenting. Theme Raising With Care. 6 weeks, standard tier. Depth: first week. Flags: family support lines.  
Card line: "Set a homework time and place, then step back a little."  
Weeks 1 to 2: how homework evenings go now.  
Weeks 3 to 4: a set time, place and a short check-in.  
Weeks 5 to 6: working with teachers and handing over responsibility.  
Title check, 5 Oct 2026: No exact title found.

**Home Education**: A Workbook on Charlotte Mason's First Volume  
Charlotte M. Mason (public domain), Akana Classics (public-domain text, workbook by Akana). `AK-B9XEG`, id `home-education`.  
Genre parenting. Theme Raising With Care. 8 weeks, extended tier. Depth: first week. Flags: family support lines.  
Card line: "Try Mason's outdoor hours, short lessons and narration at home."  
Weeks 1 to 3: out-of-door life, nature notebooks and observation.  
Weeks 4 to 6: habit training, short lessons and narration.  
Weeks 7 to 8: reading aloud, living books and reviewing what fits your family.  
Source: Project Gutenberg eBook #71087 (Kegan Paul, Trench, Trübner, 1906). First published 1886; Gutenberg text is from the 1906 Kegan Paul edition. https://www.gutenberg.org/ebooks/71087

### Love and Relationships (6)

**Gently and Straight**: Saying Difficult Things to People You Love  
Clodagh Ní Fhaoláin-Burke (demo), Kettlebrook Editions. `AK-6ECZ7`, id `gently-and-straight`.  
Genre relationships. Theme Companionable Days. 6 weeks, standard tier. Depth: full. Flags: when home is not safe.  
Card line: "Prepare, open, listen and agree a next step in a hard conversation."  
Weeks 1 to 2: what you want to say and what you hope to keep.  
Weeks 3 to 4: opening lines, listening back and staying with it.  
Weeks 5 to 6: repairs, follow-ups and when to step away.  
Title check, 5 Oct 2026: No exact title. First choices 'Saying the Hard Thing Kindly' (too close to 'Say the Hard Thing', Powell 2026), 'Clearing the Air at Home' and 'The Honest Hour' were dropped because of existing books.

**The Long Marriage Notebook**: Small Rituals for Couples  
Clodagh Ní Fhaoláin-Burke (demo), Kettlebrook Editions. `AK-33BZ8`, id `the-long-marriage-notebook`.  
Genre relationships. Theme Partners in Step. 8 weeks, extended tier. Depth: first week. Flags: when home is not safe.  
Card line: "Weekly check-ins, shared memories and plans for the next season."  
Weeks 1 to 3: a weekly check-in and noticing what goes well.  
Weeks 4 to 6: old stories, new plans and fair disagreements.  
Weeks 7 to 8: a shared plan for the year ahead.  
Title check, 5 Oct 2026: No exact title. Nearby: Gill Buchanan novel 'The Long Marriage', Sparks 'The Notebook'.

**Friends Worth Calling**: Keeping Friendships Going as an Adult  
Rafael Moreira Lins (demo), Ipê Azul Edições. `AK-BJ8GJ`, id `friends-worth-calling`.  
Genre relationships. Theme Companionable Days. 6 weeks, standard tier. Depth: full. Flags: when home is not safe.  
Card line: "Make a short list, reach out first and plan regular catch-ups."  
Weeks 1 to 2: who matters to you and when you last spoke.  
Weeks 3 to 4: reaching out, simple invitations and regular plans.  
Weeks 5 to 6: repairing a lapsed friendship and being a good guest.  
Title check, 5 Oct 2026: No exact title. Results were friendship book lists.

**Hello From Number Twelve**: Making Friends in a New Town  
Rafael Moreira Lins (demo), Ipê Azul Edições. `AK-YFD8Z`, id `hello-from-number-twelve`.  
Genre relationships. Theme Companionable Days. 6 weeks, standard tier. Depth: first week. Flags: when home is not safe.  
Card line: "Find regular places, say yes more and follow up with new faces."  
Weeks 1 to 2: mapping where people gather near you.  
Weeks 3 to 4: joining one regular thing and following up.  
Weeks 5 to 6: hosting something small and keeping old friends too.  
Title check, 5 Oct 2026: No exact title. First choice 'Making Friends After Moving' was dropped as a widely used article phrase.

**Two Calendars, One Home**: Planning a Shared Week  
Sofia Hedlund-Ahl (demo), Independent (self-published). `AK-P48WC`, id `two-calendars-one-home`.  
Genre relationships. Theme Partners in Step. 6 weeks, standard tier. Depth: full. Flags: when home is not safe.  
Card line: "A weekly planning chat so both partners know what is coming."  
Weeks 1 to 2: both calendars on one page and a Sunday chat.  
Weeks 3 to 4: dividing errands, lifts and appointments.  
Weeks 5 to 6: protecting time together and reviewing the month.  
Title check, 5 Oct 2026: No exact title found.

**Splitting the Load at Home**: Sharing Chores and the Thinking Behind Them  
Sofia Hedlund-Ahl (demo), Independent (self-published). `AK-YKY7D`, id `splitting-the-load-at-home`.  
Genre relationships. Theme Partners in Step. 4 weeks, short tier. Depth: first week. Flags: when home is not safe.  
Card line: "List every household job, including the planning, and share it out."  
Week 1: listing visible and invisible household jobs.  
Weeks 2 to 3: agreeing who owns what, start to finish.  
Week 4: reviewing the split and adjusting fairly.  
Title check, 5 Oct 2026: No exact title. Nearby: 'The Mental Load' (comic), 'Fair Play'. First choice 'Fair Shares at Home' was dropped because of the children's book 'Fair Shares'.

### Personal Growth (4)

**Small Rules for Ordinary Days**: Habits You Can Restart Any Time  
Friederike Ostwald-Rehm (demo), Independent (self-published). `AK-RPT7D`, id `small-rules-for-ordinary-days`.  
Genre personal-development. Theme Chosen Habits. 6 weeks, standard tier. Depth: full.  
Card line: "Write a few small personal rules and restart them without fuss."  
Weeks 1 to 2: noticing the days that already go well.  
Weeks 3 to 4: writing three small rules and testing them.  
Weeks 5 to 6: restarting after a gap and revising the rules.  
Title check, 5 Oct 2026: No exact title. Nearby: 'The Magic of Ordinary Days', 'Ordinary Days'.

**The Tidy Week**: A Weekly Reset for Home and Mind  
Friederike Ostwald-Rehm (demo), Independent (self-published). `AK-SDSH9`, id `the-tidy-week`.  
Genre personal-development. Theme Chosen Habits. 4 weeks, short tier. Depth: first week.  
Card line: "A thirty-minute weekly reset for your space, diary and inbox."  
Week 1: what clutters your week and what you would clear first.  
Weeks 2 to 3: a weekly reset routine for space and diary.  
Week 4: keeping it short and adjusting it to your life.  
Title check, 5 Oct 2026: No exact title. Nearby: Emily Gravett picture book 'Tidy'.

**Meditations**: A Workbook on Marcus Aurelius, in George Long's Translation  
Marcus Aurelius (public domain), Akana Classics (public-domain text, workbook by Akana). `AK-FN9KB`, id `meditations`.  
Genre personal-development. Theme Chosen Habits. 12 weeks, programme tier. Depth: first week.  
Card line: "One book of the Meditations each week, with a daily reflection."  
Weeks 1 to 4: Books 1 to 4, gratitude, duty and the morning reminder.  
Weeks 5 to 8: Books 5 to 8, work, other people and what is in your control.  
Weeks 9 to 12: Books 9 to 12, change, endings and living by your values.  
Source: 'Thoughts of Marcus Aurelius Antoninus', tr. George Long, Project Gutenberg eBook #15877. First published Written about 170 to 180 CE; Long translation first published 1862 [check]. https://www.gutenberg.org/ebooks/15877

**Self-Help**: A Workbook on Samuel Smiles' Victorian Classic  
Samuel Smiles (public domain), Akana Classics (public-domain text, workbook by Akana). `AK-7SWKN`, id `self-help`.  
Genre personal-development. Theme Chosen Habits. 6 weeks, standard tier. Depth: first week.  
Card line: "Read Smiles' short lives of patient effort and plan one of your own."  
Weeks 1 to 2: Smiles' idea of self-help, read with care for its Victorian limits.  
Weeks 3 to 4: perseverance, attention to small things and use of time.  
Weeks 5 to 6: money, character and the people who helped you along.  
Source: 'Self Help; with Illustrations of Conduct and Perseverance', Project Gutenberg eBook #935 (edition year to confirm) [check]. First published 1859 (John Murray, London). https://www.gutenberg.org/ebooks/935

### Learning and Skills (6)

**First Flat, First Bills**: Setting Up Your First Home  
Matilda Kershaw-Nguyen (demo), Independent (self-published). `AK-4Q9CB`, id `first-flat-first-bills`.  
Genre life-skills. Theme Practical Know-How. 6 weeks, standard tier. Depth: full.  
Card line: "Read a lease, set up bills and run a simple weekly home routine."  
Weeks 1 to 2: the lease, the bond and the first week's list.  
Weeks 3 to 4: bills, direct debits and a monthly check.  
Weeks 5 to 6: cleaning, shopping and sharing jobs with housemates.  
Title check, 5 Oct 2026: No exact title found.

**Supper for One, Most Nights**: Cooking Simply for Yourself  
Matilda Kershaw-Nguyen (demo), Independent (self-published). `AK-ERMC7`, id `supper-for-one-most-nights`.  
Genre life-skills. Theme Practical Know-How. 4 weeks, short tier. Depth: first week.  
Card line: "Plan five easy suppers, shop once and waste less."  
Week 1: a basic cupboard and five meals you already like.  
Weeks 2 to 3: one weekly shop and cooking once for two nights.  
Week 4: using leftovers and adding one new dish.  
Title check, 5 Oct 2026: No exact title. First choice 'Cooking for One Without Fuss' was dropped because 'Cooking for One' titles are crowded.

**Fix It Before You Call Someone**: Small Repairs at Home  
Matilda Kershaw-Nguyen (demo), Independent (self-published). `AK-F3ZA8`, id `fix-it-before-you-call-someone`.  
Genre life-skills. Theme Practical Know-How. 4 weeks, short tier. Depth: first week.  
Card line: "Know which small jobs are yours and when to call a tradesperson."  
Week 1: a basic toolkit and where the stopcock and fuse box are.  
Weeks 2 to 3: dripping taps, blocked sinks and loose fittings.  
Week 4: what never to attempt and how to brief a tradesperson.  
Title check, 5 Oct 2026: No exact title. Results were 'The Fix-It Friends' and repair manuals.

**Exam Season, One Week at a Time**: A Calm Revision Plan  
Olivier Tremblay-Singh (demo), Larchmere Atlas Books. `AK-T1WVV`, id `exam-season-one-week-at-a-time`.  
Genre education. Theme Unrushed Learning. 8 weeks, extended tier. Depth: full.  
Card line: "Map topics, space your revision and practise under real timing."  
Weeks 1 to 3: topic maps, a revision calendar and a starting check.  
Weeks 4 to 6: spaced practice, past papers and fixing weak spots.  
Weeks 7 to 8: timed papers, rest days and exam-day plans.  
Title check, 5 Oct 2026: No exact title. Results were exam season guides and university pages.

**Notes That Actually Help**: Note-Taking for Students  
Olivier Tremblay-Singh (demo), Larchmere Atlas Books. `AK-R4CGT`, id `notes-that-actually-help`.  
Genre education. Theme Unrushed Learning. 4 weeks, short tier. Depth: first week.  
Card line: "Take shorter notes, turn them into questions and review them."  
Week 1: looking at how you take notes now.  
Weeks 2 to 3: question-style notes and weekly summaries.  
Week 4: using notes to test yourself before exams.  
Title check, 5 Oct 2026: No exact title. Results were note-taking blogs and Cornell Notes.

**Back to the Books at Thirty-Five**: Returning to Study as an Adult  
Olivier Tremblay-Singh (demo), Larchmere Atlas Books. `AK-06699`, id `back-to-the-books-at-thirty-five`.  
Genre education. Theme Unrushed Learning. 6 weeks, standard tier. Depth: first week.  
Card line: "Fit study around work and family, and get used to learning again."  
Weeks 1 to 2: why you are going back and when you can study.  
Weeks 3 to 4: reading academic texts and writing your first essay.  
Weeks 5 to 6: asking for help and keeping going in busy weeks.  
Title check, 5 Oct 2026: No exact title. First wording 'Back to Learning at Thirty-Five' was changed because it echoed the Theme.

### Mind and Mood (5)

**The Ten-Minute Pause**: Short Breaks in a Full Day  
Haruka Tanabe-Ellis (demo), Independent (self-published). `AK-Z9KWR`, id `the-ten-minute-pause`.  
Genre wellbeing. Theme Noticing More. 4 weeks, short tier. Depth: full. Flags: WB, Help now.  
Card line: "Take one unhurried ten-minute pause a day and notice what is here."  
Week 1: finding a time and place for a daily pause.  
Weeks 2 to 3: pauses with tea, sound, breath or a short walk.  
Week 4: keeping the pause when the day is crowded.  
Title check, 5 Oct 2026: No exact title. Nearby: 'The 10-Minute Reset', 'The Pause', '15 Minute Pause'.

**Evenings With Less Light**: Gentler Evenings Before Bed  
Haruka Tanabe-Ellis (demo), Independent (self-published). `AK-T7QC9`, id `evenings-with-less-light`.  
Genre wellbeing. Theme Softer Nights. 4 weeks, short tier. Depth: first week. Flags: WB, Help now.  
Card line: "Dim the lights, slow the evening and put screens away earlier."  
Week 1: noticing your evenings as they are now.  
Weeks 2 to 3: a lower-light hour and a simple wind-down.  
Week 4: a routine for late nights and travel.  
Title check, 5 Oct 2026: No exact title. Results were 'The Light of Evening' and night-themed books.

**Tea, Walks and Other Breaks**: Slowing the Pace of a Busy Week  
Haruka Tanabe-Ellis (demo), Independent (self-published). `AK-5HQVZ`, id `tea-walks-and-other-breaks`.  
Genre wellbeing. Theme Even Pace. 4 weeks, short tier. Depth: first week. Flags: WB, Help now.  
Card line: "Put small, real breaks into the week and protect them."  
Week 1: where your week has no breaks at all.  
Weeks 2 to 3: tea breaks, short walks and screen-free lunches.  
Week 4: asking others to respect your breaks.  
Title check, 5 Oct 2026: No exact title. Results were tea reading lists.

**A Friendlier Voice Inside**: Kinder Self-Talk in Everyday Moments  
Nadia Farouk-Hassan (demo), Kettlebrook Editions. `AK-PS66T`, id `a-friendlier-voice-inside`.  
Genre wellbeing. Theme Seeing Yourself Fairly. 6 weeks, standard tier. Depth: full. Flags: WB, Help now.  
Card line: "Notice harsh self-talk and answer it as a fair friend would."  
Weeks 1 to 2: noticing the voice and when it gets loud.  
Weeks 3 to 4: fairer replies and kinder words after mistakes.  
Weeks 5 to 6: keeping the kinder voice in busy weeks.  
Title check, 5 Oct 2026: No exact title. Nearby: 'The Voice Inside' (several books), 'Chatter'. First choice 'Talking to Yourself Like a Friend' was dropped as a common article phrase.

**The Overfull Week**: Making Room When Everything Needs You  
Nadia Farouk-Hassan (demo), Kettlebrook Editions. `AK-KWZPG`, id `the-overfull-week`.  
Genre wellbeing. Theme Renewing Energy. 4 weeks, short tier. Depth: first week. Flags: WB, Help now.  
Card line: "Sort the week into must, should and could, and drop one thing."  
Week 1: seeing the whole week on one page.  
Weeks 2 to 3: must, should and could, and one honest no.  
Week 4: building small pockets of rest into the week.  
Title check, 5 Oct 2026: No exact title found.

## 7. The public-domain classics

The brief asked for 3 to 5 classics that are safely public domain in the UK, US and EU: the author died more than 70 years ago and the work was first published before 1930. All five chosen meet Research 4's Tier A test (published before 1931, and every author and translator died before 1946). Death dates below come from the Project Gutenberg catalogue pages.

| Workbook | Author and translator, with death year | First published | Edition used |
|---|---|---|---|
| How to Live on 24 Hours a Day | Arnold Bennett (author, died 1931) | 1908 (London, New Age Press); expanded edition 1910 [check] | Project Gutenberg eBook #2274 |
| Meditations | Marcus Aurelius (author, died 180), George Long (translator, died 1879) | Written about 170 to 180 CE; Long translation first published 1862 [check] | 'Thoughts of Marcus Aurelius Antoninus', tr. George Long, Project Gutenberg eBook #15877 |
| The Way to Wealth | Benjamin Franklin (author, died 1790) | 1758 (preface to Poor Richard's Almanack) | 'The Way to Wealth', W. and T. Darton, London, 1810, Project Gutenberg eBook #43855 |
| Home Education | Charlotte M. Mason (author, died 1923) | 1886; Gutenberg text is from the 1906 Kegan Paul edition | Project Gutenberg eBook #71087 (Kegan Paul, Trench, Trübner, 1906) |
| Self-Help | Samuel Smiles (author, died 1904) | 1859 (John Murray, London) | 'Self Help; with Illustrations of Conduct and Perseverance', Project Gutenberg eBook #935 (edition year to confirm) [check] |

Legal Lead notes on the classics:

- Each workbook cites the original text, names the edition and links to it. Quotations come from the Gutenberg transcription, not from a modern reprint, because the UK gives a 25-year right in a publisher's typographical arrangement (Research 4).
- Project Gutenberg's licence allows free use of the text, but the Project Gutenberg name is a trade mark. Akana should strip the Gutenberg header and licence and must not use the name in marketing. The acknowledgement can say "text from a public-domain edition" and give the source in the notes [check the current licence wording].
- Bennett died in 1931, so the work is public domain in the UK and EU (life plus 70) and in the US (published before 1931). The 1908 first edition and the 1910 revised edition need confirming against the Gutenberg file [check].
- Long's Marcus Aurelius was chosen over the Gregory Hays and Robin Hard translations, which are in copyright. Seneca (Gummere), The Art of War (Giles) and The Richest Man in Babylon were ruled out by Research 4 and are not used.
- Smiles and Franklin are read as history. The workbooks frame their advice as period views to test, not rules to follow, which also handles the Victorian moralising and the 18th-century money advice. Franklin's workbook carries the money guidance note.
- Mason's Home Education contains period views on children and discipline that would not be published today. The workbook selects the outdoor, habit and narration chapters and says so plainly [Clinical Safety and Editorial to agree the selection].

## 8. Clinical Safety Lead notes

- Five demo workbooks sit on Mind and Mood: The Ten-Minute Pause, Evenings With Less Light, Tea, Walks and Other Breaks, A Friendlier Voice Inside and The Overfull Week. All are `wellbeing_standard`, carry Help now, use no scored self-checks and name no condition. None is a higher-tier topic.
- Evenings With Less Light must not mention insomnia or promise better sleep. A Friendlier Voice Inside must not mention self-esteem as a condition. Their card lines were written to that rule.
- Relationship workbooks carry a "when home is not safe" signpost to domestic abuse lines by market, because a workbook about hard conversations or shared chores may reach someone in an abusive relationship. Gently and Straight also says plainly that the exercises are for relationships where it is safe to speak.
- Parenting workbooks carry a family support signpost (parenting and child protection lines by market). The Teenager on the Stairs adds a short "if you are worried about your child's safety" note in week 1.
- These signposts need new entries in `support_lines.json`, checked by market like the existing ones [check]. The board should decide whether Help now appears on every workbook or only on wellbeing ones [Crent].
- Aurelius and Smiles touch on endurance and hardship. They stay on Personal Growth with no wellbeing claims, and their copy avoids words like resilience therapy or coping.

## 9. Legal Lead notes

- Money workbooks (Considered Spending and Money for Later) carry `money_guidance_not_advice`: they teach budgeting habits and never recommend a product, investment, lender or tax position. The FCA wording for this is not yet researched [check].
- Lumpy Income, Steady Plans talks about setting money aside for tax in general terms only. It does not explain any country's tax rules.
- Hiring Your First Five and the trading workbooks carry `not_legal_or_tax_advice`, because employment law and business tax differ by country.
- The Shared Pot describes informal savings groups. It must not suggest the group take deposits from the public or offer returns, which could be regulated activity in Kenya and elsewhere [check].
- Demo titles, authors and imprints must never be presented as real. Every demo listing, cover and author page shows the demo badge, and the production seed loads demo rows only when the demo flag is on (AK_Architecture section on seeds).
- Covers for demo books will be generated plain-type designs. They must not imitate any real publisher's series design.

## 10. Fully written workbooks

These are the workbooks to write in full during the three weeks. The rest need week one only.

- The Open-Air Ledger, Chidinma Obiora-Lane (6 weeks)
- The Elder's Chair, Efua Dadzie-Lamptey (12 weeks)
- The Shared Pot, Wanjiru Kamau-Otieno (6 weeks)
- Ubuntu at the Dinner Table, Thandiwe Mokoena-Dube (8 weeks)
- The Unhurried To-Do List, Meenakshi Iyer-Rao (6 weeks)
- Gently and Straight, Clodagh Ní Fhaoláin-Burke (6 weeks)
- A New Trade at Forty, Hester Quarrington (8 weeks)
- Feedback Over Coffee, Marcus Delacroix-Hayes (6 weeks)
- First Flat, First Bills, Matilda Kershaw-Nguyen (6 weeks)
- Exam Season, One Week at a Time, Olivier Tremblay-Singh (8 weeks)
- Small Rules for Ordinary Days, Friederike Ostwald-Rehm (6 weeks)
- Friends Worth Calling, Rafael Moreira Lins (6 weeks)
- The Ten-Minute Pause, Haruka Tanabe-Ellis (4 weeks)
- Lumpy Income, Steady Plans, Ximena Ruiz-Albarrán (6 weeks)
- The Teenager on the Stairs, Ligaya Abellera-Cruz (8 weeks)
- Two Calendars, One Home, Sofia Hedlund-Ahl (6 weeks)
- Teams That Carry It Together, Tama Rāwiri-Hughes (6 weeks)
- A Friendlier Voice Inside, Nadia Farouk-Hassan (6 weeks)
- How to Live on 24 Hours a Day, Arnold Bennett (6 weeks)
- The Way to Wealth, Benjamin Franklin (4 weeks)

That is 20 full workbooks with 130 weeks of content between them, plus 30 first weeks. This is a large writing load inside three weeks. The Editorial Director suggests writing the full set in two waves: one per shelf first (seven), so every shelf can show a complete workbook in the demo by the end of week 1, then the rest [Crent].

## 11. Names rejected during checking

Kept as a record so the same names are not proposed again.

- Titles: Saying the Hard Thing Kindly (close to Say the Hard Thing, Powell, 2026); Clearing the Air at Home and The Honest Hour (existing books); Handing Over the Keys (2023 book); Meetings With a Point (podcast episode); Changing Lanes at Forty (Changing Lanes crowded); Cooking for One Without Fuss (Cooking for One crowded); Notes Under the Bedroom Door (Scary Mommy article); Making Friends After Moving and Talking to Yourself Like a Friend (common article phrases); Fair Shares at Home (children's book Fair Shares); The Twenty-Minute Meeting (close to The 20-Minute Networking Meeting).
- Themes: Meaningful Work, Leading Others, Growing Ventures, Thoughtful Money, Study Craft, Study at Ease, Thoughtful Study, Steady Learning, Kindred Company, Generous Leading, Career Crossings, Work Chapters, Next Career Steps (all matched a book, app or service); Purposeful Hours, Warmer Friendships and Learning Seasons (echoed a title on their shelf); Planning Ahead (close to app vocabulary).
- Authors: Hannah Whitcombe and Lena Brandauer (real people, one a published author); Bea Santiago and Aoife Ní Bhriain (public figures with those names).
- Imprints: Harmattan House, Jacaranda Row, Birchbark and Co., Bluegill Press, Elbufer Verlag, Savanna Ink, Monsoon Desk, Tamarind Lantern, Tidewater Saffron, Pinecone Atlas, Mango Kite.

## 12. Questions for Crent

1. Do you approve the two new shelves, Personal Growth and Learning and Skills?
2. Do you approve the twelve new Themes for the demo, before register searches?
3. May the five classic workbooks be sold as real products, or are they demo only? They need no licence, but they do need the full public-domain file signed off.
4. Should Help now, or a lighter support link, appear on relationship and parenting workbooks too, or stay on wellbeing workbooks only?
5. Is twenty fully written workbooks the right number for three weeks, or should the first wave be one per shelf?
6. Should demo workbooks appear on the live production site at all, with the demo badge, or only on preview and sales demo sites?

## 13. Sources

Web searches and catalogue pages consulted on 5 October 2026. Search results are the evidence for each title check; the main pages are listed here.

- https://www.gutenberg.org/ebooks/2274
- https://www.gutenberg.org/ebooks/15877
- https://www.gutenberg.org/ebooks/935
- https://www.gutenberg.org/ebooks/71087
- https://www.gutenberg.org/files/43855/43855-h/43855-h.htm
- https://us.amazon.com/Hard-Thing-Step-Step-Conversations-ebook/dp/B0H2XBKX27
- https://press.uchicago.edu/ucp/books/book/distributed/H/bo257340206.html
- https://www.fastersmarter.io/261-meetings-with-a-point-how-to-design-for-better-decisions/
- https://www.scarymommy.com/notes-under-the-bedroom-door
- https://www.barnesandnoble.com/w/fair-shares-pippa-goodhart/1135473033
- https://www.goodreads.com/book/show/36172238-the-20-minute-networking-meeting
- https://www.amazon.com/Honest-Hour-Time-Based-Billing-Attorneys/dp/0890899029
- https://jamievanek.com/changing-lanes/
- https://www.amazon.com/Leading-Others-Developing-Competency-Discipling/dp/173337275X
- https://www.amazon.com/Growing-Ventures-Starting-School-Business/dp/0915873451
- https://thoughtfulmoney.com/about/
- https://play.google.com/store/apps/details?id=co.lazarus.gzqpm&hl=en_US
- https://www.amazon.com/Study-At-Ease-Straight-Examination/dp/1497469163
- https://apps.apple.com/us/app/thoughtful-long-form-learning/id1462977143
- https://steady-learning.vercel.app/
- https://kindredsocialapp.com/
- https://www.press.jhu.edu/books/title/12787/leading-generously
- https://www.saintmarys.edu/career-crossings
- https://www.yournextworkchapter.com/
- https://www.goodreads.com/book/show/36099996-purposeful-productivity
- https://www.linkedin.com/in/hannahwhitco/
- https://www.booklooker.de/B%C3%BCcher/Konfigurationen/id/A02vAm7i01ZZJ
- https://en.wikipedia.org/wiki/Bea_Santiago
- https://www.birchbarkpress.com/
- https://www.elbufer-verlag.de/
- https://www.savannainkpublishing.com/
- https://en.wikipedia.org/wiki/Monsoon_Books
- https://en.wikipedia.org/wiki/Tamarind_Books
- https://www.tidewaterpress.ca/
- https://www.linkedin.com/in/gemarquez/

Internal sources: `docs/WB_Naming_System_Board.md`, `content/catalog/themes.json`, `content/catalog/catalog.json`, `docs/saas/research_rights.md`, `docs/saas/AK_Architecture.md`.
