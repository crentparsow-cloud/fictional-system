# Faith workbooks: research

Prepared 7 October 2026. The machine-readable list is `faith-titles.json` in this folder. Facts come from the sources listed under each section. Anything not established is marked [check] or [confirm]. Nothing here is a legal opinion. The Legal Lead signs off each title through the usual public-domain record in `docs/public-domain/`.

## Summary

27 Christian classics are verified as public domain in both the UK and the US on the evidence below. 26 meet Research 4's Tier A test. In His Steps is Tier B, because Sheldon died in 1946. Four well-known authors are excluded or held back: Oswald Chambers, A. W. Tozer, Dietrich Bonhoeffer and the later Amy Carmichael books.

The edition matters as much as the author. Two traps came up in the checks. Project Gutenberg's best-known Brother Lawrence file (#5657) is a 2002 edition marked copyrighted. Modern translations of Augustine and de Sales are in copyright. Each record below names the edition to use.

For Bible quotations, the recommended default is the World English Bible. It is public domain and has a British Edition. The King James Version is not free to use in the UK. It sits under Crown rights, and Cambridge University Press grants permission for uses other than liturgy.

Akana has no faith genre. Schema v3 lists 11 genres and none is faith. After the freeze, a new allowed value is an additive change, so a `faith` genre can be added later. Until then, the draft taxonomy (`taxonomy.json`, Faith and Spirituality) maps faith subcategories onto existing genres, mostly `personal_development`. This research uses those subcategory slugs.

## 1. Public-domain Christian classics

### The rules applied

These are the rules already used in the demo catalogue plan, section 7, and the five existing records.

- **GB and IE.** Life plus 70 years, counted to the end of the calendar year. The last death among author, translator and editor decides it. For 2026, anyone who died in 1955 or earlier is clear. An anonymous work runs 70 years from publication.
- **US.** Works published before 1 January 1931 are public domain in 2026. Project Gutenberg's "Public domain in the USA" mark is recorded as supporting evidence, not as the test.
- **Tier A (Research 4).** Published before 1931 and every author, translator and editor died before 1946. This leaves a safety margin.
- **CA, AU and NZ.** Not recorded in the repo. The existing records mark them [to confirm]. Every Tier A title here has a last death in 1941 or earlier, so it is expected to pass. The Legal Lead should confirm.
- **Editions.** Quote only from the named transcription or scan. The UK gives publishers a 25-year right in the typographical arrangement of an edition. Modern introductions, notes, forewords and revised Bible text are new copyright. Strip the Project Gutenberg header and licence, and do not use the Gutenberg name in marketing (catalogue plan section 7).
- **CCEL.** Several texts are hosted at the Christian Classics Ethereal Library. CCEL's terms of use were not checked [check]. Where a Gutenberg or HathiTrust copy exists, use that.

### The 27 verified titles

Subcategory slugs come from the draft Faith and Spirituality category in `taxonomy.json`. Tradition labels are explained in section 4.

| # | Author (dates) | Title | First published | Edition to use | UK | US | Units | Subcategory | Tier | Group | Tradition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Brother Lawrence (1611 to 1691) | The Practice of the Presence of God | 1692, French | Revell, New York, anonymous translation, Gutenberg #13871. Not #5657 | Clear | Clear | 6 weeks | rhythms-of-prayer | none | Yes | Catholic |
| 2 | Thomas a Kempis (1380 to 1471) | The Imitation of Christ | about 1418 to 1427, Latin | William Benham translation (Benham died 1910), Gutenberg #1653 | Clear | Clear | 12 weeks | growing-in-faith | none | Yes | Catholic |
| 3 | John Bunyan (1628 to 1688) | The Pilgrim's Progress | 1678 (Part II 1684) | Gutenberg #131 | Clear | Clear | 12 weeks | growing-in-faith | standard | Yes | Protestant |
| 4 | Andrew Murray (1828 to 1917) | Abide in Christ | 1880 (Wikipedia: 1882) [confirm] | 1880 Nisbet or 1895 Revell, HathiTrust | Clear | Clear | 6 weeks | growing-in-faith | none | Yes | Protestant |
| 5 | Andrew Murray | With Christ in the School of Prayer | 1885 | 1885 Revell or 1887 Nisbet, HathiTrust | Clear | Clear | 6 weeks | rhythms-of-prayer | none | Yes | Protestant |
| 6 | Andrew Murray | Humility | 1895 | Gutenberg #57121 | Clear | Clear | 6 weeks | growing-in-faith | none | Yes | Protestant |
| 7 | Andrew Murray | Absolute Surrender | 1895 | Gutenberg #19572 | Clear | Clear | 4 weeks | growing-in-faith | none | Yes | Protestant |
| 8 | C. H. Spurgeon (1834 to 1892) | Morning and Evening | 1865 and 1868 | 19th-century text (CCEL) [confirm source] | Clear | Clear | 12 weeks | rhythms-of-prayer | none | Yes | Protestant |
| 9 | C. H. Spurgeon | All of Grace | 1886 | 1886 London or New York edition [confirm source] | Clear | Clear | 6 weeks | growing-in-faith | none | Yes | Protestant |
| 10 | E. M. Bounds (1835 to 1913) | Power Through Prayer | 1907, as Preacher and Prayer | Marshall Brothers, Gutenberg #65115 | Clear | Clear | 4 weeks | serving-together | none | Yes | Protestant |
| 11 | Augustine of Hippo (354 to 430) | Confessions | AD 397 to 400 | E. B. Pusey translation, 1838 (Pusey died 1882), Gutenberg #3296 | Clear | Clear | 12 weeks | growing-in-faith | standard | Yes | General Christian |
| 12 | Hannah Whitall Smith (1832 to 1911) | The Christian's Secret of a Happy Life | 1875 | 1875 Willard or 1883 Revell, HathiTrust | Clear | Clear | 8 weeks | growing-in-faith | standard | Yes | Protestant |
| 13 | Charles M. Sheldon (1857 to 1946) | In His Steps | 1896 | Gutenberg #4540 | Clear (Tier B) | Clear | 6 weeks | work-as-calling | none | Yes | Protestant |
| 14 | Francis de Sales (1567 to 1622) | Introduction to the Devout Life | 1609, French | M. H. Gill, Dublin, 1885, anonymous revised translation | Clear | Clear | 8 weeks | growing-in-faith | none | Yes | Catholic |
| 15 | William Law (1686 to 1761) | A Serious Call to a Devout and Holy Life | 1729 | 1729 Innys or 19th-century reprint, HathiTrust | Clear | Clear | 8 weeks | growing-in-faith | none | Yes | Protestant |
| 16 | Jonathan Edwards (1703 to 1758) | Religious Affections | 1746 | 1746 Boston or 1821 Philadelphia | Clear | Clear | 12 weeks | growing-in-faith | none | Yes | Protestant |
| 17 | J. C. Ryle (1816 to 1900) | Holiness | 1877, enlarged 1879 | 1879 edition, HathiTrust or archive.org | Clear | Clear | 8 weeks | growing-in-faith | none | Yes | Protestant |
| 18 | J. C. Ryle | Practical Religion | 1878 | Gutenberg #38162 | Clear | Clear | 8 weeks | growing-in-faith | standard | Yes | Protestant |
| 19 | George Müller (1805 to 1898) | A Narrative of Some of the Lord's Dealings with George Müller | In parts, in his lifetime [confirm years] | Gutenberg #20379, #22034, #22148, #20245 | Clear | Clear | 6 weeks | rhythms-of-prayer | none | Yes | Protestant |
| 20 | Julian of Norwich (about 1343 to after 1416) | Revelations of Divine Love | Manuscript; Warrack edition 1901 | Grace Warrack (1855 to 1932), Methuen 1901, Gutenberg #52958 | Clear | Clear | 8 weeks | quiet-contemplation | standard | Yes | General Christian |
| 21 | Henry Drummond (1851 to 1897) | The Greatest Thing in the World | 1890 | Gutenberg #16739 | Clear | Clear | 4 weeks | growing-in-faith | none | Yes | Protestant |
| 22 | G. K. Chesterton (1874 to 1936) | Orthodoxy | 1908 | Gutenberg #130 | Clear | Clear | 8 weeks | growing-in-faith | none | Yes | General Christian |
| 23 | R. A. Torrey (1856 to 1928) | How to Pray | 1900 | 1900 Revell, HathiTrust | Clear | Clear | 4 weeks | rhythms-of-prayer | none | Yes | Protestant |
| 24 | Evelyn Underhill (1875 to 1941) | Practical Mysticism | 1914 | Gutenberg #21774 | Clear | Clear | 6 weeks | quiet-contemplation | none | Yes | General Christian |
| 25 | George MacDonald (1824 to 1905) | Unspoken Sermons | Series I 1867 [confirm II and III] | Gutenberg #9057 | Clear | Clear | 12 weeks | growing-in-faith | none | Yes | Protestant |
| 26 | Ignatius of Loyola (1491 to 1556), adapted by Charles Coppens (1835 to 1920) | The Spiritual Exercises, adapted to an eight days retreat | about 1522 to 1524; Coppens 1916 | B. Herder 1916, Gutenberg #70790 | Clear | Clear | 8 days | quiet-contemplation | standard | Yes | Catholic |
| 27 | Matthew Henry (1662 to 1714) | A Method for Prayer | 1710 | 1710 edition (HathiTrust) or 1834 Glasgow (archive.org) | Clear | Clear | 6 weeks | rhythms-of-prayer | none | Yes | Protestant |

The reasoning for each UK and US conclusion is in `faith-titles.json`. In every case it is the same test: the last relevant death year against life plus 70, and the first publication year against 1931.

### Workbook angles

Each angle below is a starting outline. Lengths match the price tiers in the catalogue plan: 4, 6, 8 and 12 weeks.

1. **The Practice of the Presence of God.** Weeks 1 to 2 on the four conversations, weeks 3 to 6 on the letters. One practice a week of turning to God in ordinary work, with a short daily noticing log.
2. **The Imitation of Christ.** One short chapter a day. Books 1 and 2 over weeks 1 to 5, Book 3 over weeks 6 to 10, Book 4 over weeks 11 to 12.
3. **The Pilgrim's Progress.** Part I, one stage of the journey a week. The reader keeps a map of their own journey. Part II could be a later sequel.
4. **Abide in Christ.** About five of the 31 short chapters a week. One verse to carry through each day.
5. **With Christ in the School of Prayer.** About five of the 31 lessons a week, each ending with Murray's prayer and a journal entry.
6. **Humility.** Two of the twelve chapters a week. A weekly practice of serving someone without being seen.
7. **Absolute Surrender.** Two or three addresses a week, each with one honest question and one small act of trust.
8. **Morning and Evening.** One season of daily readings as the daily check, with a weekly review. A 52-week edition fits the schema's maximum of 52 units.
9. **All of Grace.** For enquirers and new Christians: grace, faith, repentance and assurance.
10. **Power Through Prayer.** For preachers, small group leaders and church teams. Five short chapters a week and a leader's prayer plan.
11. **Confessions.** Books 1 to 9 (the life) over weeks 1 to 9. Books 10 to 13 as a guided study over weeks 10 to 12.
12. **The Christian's Secret of a Happy Life.** Trust, surrender, doubt, temptation and failure. Framed as a devotional, never as a route to happiness.
13. **In His Steps.** A book group. Each week the reader asks "What would Jesus do?" about one real decision at work, at home or with money.
14. **Introduction to the Devout Life.** The five parts over eight weeks. Written for lay people with jobs and families.
15. **A Serious Call.** Law's character sketches (Calidus, Flavia, Miranda) as prompts to audit time and money.
16. **Religious Affections.** A study group. Parts I and II over two weeks, then one of Edwards' twelve signs a week.
17. **Holiness.** Two or three papers a week on sin, sanctification, the fight, cost and growth.
18. **Practical Religion.** The daily duties: self-inquiry, prayer, Bible reading, charity, family and money.
19. **George Müller's Narrative.** Selected passages on prayer and the Bristol orphan houses, with a weekly prayer record.
20. **Revelations of Divine Love.** Two of the sixteen showings a week, read slowly, with a short contemplative exercise.
21. **The Greatest Thing in the World.** 1 Corinthians 13 and Drummond's nine "ingredients" of love, one practised every few days.
22. **Orthodoxy.** A discussion group on reasons for faith, roughly one chapter a week.
23. **How to Pray.** Two chapters a week, building a simple daily prayer pattern.
24. **Practical Mysticism.** Attention, recollection and contemplation, with short guided practices. Framed as prayer, not as a wellbeing technique.
25. **Unspoken Sermons.** Twelve selected sermons, one a week, with a close-reading guide.
26. **The Spiritual Exercises (Coppens).** An eight-day retreat at home, using the `day` unit. Coppens wrote for Jesuits, so the lay framing is new Akana material.
27. **A Method for Prayer.** Henry's parts in order: adoration, confession, petition, thanksgiving, intercession, then a week putting it together.

### Doctrinal and content sensitivities

These are notes for the theological reviewer (section 4). None is a reason to drop a title. Each needs a sentence in the workbook's introduction or a reviewer decision.

- **Brother Lawrence, Kempis, de Sales, Ignatius.** Catholic writers. Lawrence and Kempis are widely read across traditions. Kempis Book 4 and much of Ignatius assume Catholic sacramental practice. Offer Book 4 as optional, and label the Ignatius retreat Catholic.
- **Bunyan.** Puritan and Baptist. Part I includes Giant Pope, which some Catholic readers find hostile. In Doubting Castle, Giant Despair urges the pilgrims to kill themselves. That is why this title is tier `standard`, with Help now [check the passage when writing].
- **Murray.** Dutch Reformed with Keswick holiness emphasis. Murray also wrote on divine healing. Do not use those writings, and add no healing claims.
- **Spurgeon.** Reformed Baptist. Some readings speak about affliction and low spirits. They are devotional, not advice.
- **Bounds.** Methodist. He served as a Confederate chaplain in the American Civil War. Note this plainly in the author page if the title is used [check wording against a biography].
- **Augustine.** Claimed by Catholic and Protestant readers alike. The Orthodox tradition reads him with more caution. Books 2 to 8 discuss sexuality, and Book 4 and Book 9 deal with the deaths of a friend and of his mother. Hence tier `standard`.
- **Hannah Whitall Smith.** Higher Life and Quaker background. The title promises a "happy life". The workbook must not suggest that faith removes low mood or anxiety. Tier `standard`.
- **Sheldon.** Social gospel. Some readers will find the theology thin. It works well as a book group title.
- **Law.** Anglican. His later mystical writing is not used.
- **Edwards.** Reformed. He owned enslaved people. The author page should say so plainly [check wording against a biography].
- **Ryle.** Reformed evangelical Anglican. Some papers contain sharp comments on Roman Catholicism. The paper on sickness in Practical Religion needs Help now.
- **Müller.** Brethren. The narrative records money given in answer to prayer. The workbook must not suggest that prayer replaces money advice, benefits or debt help.
- **Julian.** Catholic anchoress, read across traditions. Her language of God as mother and "all shall be well" draws comment from some reviewers. The visions came during a serious illness, so tier `standard`.
- **Chesterton.** Wrote Orthodoxy as an Anglican, before joining the Catholic Church in 1922 [check]. The chapter "The Maniac" uses dated language about mental illness. Edit around it or explain it.
- **Torrey.** Fundamentalist evangelical. Some of his teaching on the Holy Spirit is disputed between traditions.
- **Underhill.** Anglo-Catholic. Some evangelical readers are wary of "mysticism". Present it as prayer.
- **MacDonald.** Rejects penal substitution and leans towards universal reconciliation, notably in the sermon "Justice". Reformed groups may object. Choose sermons with care and label the selection.
- **Matthew Henry.** English Presbyterian nonconformist. Broadly acceptable across Protestant traditions.

### Excluded or held back

| Author | Title | Why | Source |
|---|---|---|---|
| Oswald Chambers (died 1917) | My Utmost for His Highest | Not safe in the UK or the US. His widow Gertrude "Biddy" Chambers compiled it from her own shorthand notes. She died in 1966. Under Walter v Lane (1900), a verbatim reporter can own copyright in the report, so her rights may run to the end of 2036 [Legal Lead to rule]. In the US, the 1935 Dodd, Mead edition was renewed in 1963, which protects it to the end of 2030. | Wikipedia, My Utmost for His Highest; Wikipedia, Walter v Lane |
| A. W. Tozer (1897 to 1963) | The Pursuit of God (1948) | US only. Gutenberg (#25141) marks it public domain in the USA, but Tozer died in 1963, so it is in copyright in the UK and EU until the end of 2033. | Gutenberg #25141; Wikipedia, A. W. Tozer |
| Dietrich Bonhoeffer (1906 to 1945) | The Cost of Discipleship (1937), Life Together (1939) | The German originals are public domain in the UK and EU, because he died in 1945. The English translations (Fuller 1948; 1954) are in copyright. In the US, works first published in 1937 and 1939 are not yet public domain [confirm the US term for foreign works]. A new Akana translation could be a UK-only option later. | Wikipedia, Dietrich Bonhoeffer; Wikipedia, The Cost of Discipleship |
| Amy Carmichael (1867 to 1951) | If (1938), Gold by Moonlight (1935), Edges of His Ways (1955) | Clear in the UK, because she died in 1951. In the US these were published after 1930, and renewal was not checked. Her pre-1931 books (Things as They Are, Lotus Buds, Made in the Pans) are mission narratives and verse rather than devotional workbooks, and the mission writing carries colonial-era views of Hinduism. | Wikipedia, Amy Carmichael; Online Books Page |
| Hannah Whitall Smith | The God of All Comfort | Not counted. The first publication year was not found in a source this session [check]. | CCEL listing |

## 2. Bible text for quotations inside workbooks

A workbook will quote Scripture often. Many short quotations add up quickly, and Akana is a commercial, digital product. Free-quotation allowances from modern publishers have conditions that need care.

| Version | Status | Free-use allowance | Notice required | Source |
|---|---|---|---|---|
| King James Version (Authorized Version) | Crown rights in the UK, administered by Cambridge University Press as the Crown's patentee under letters patent. Treated as public domain elsewhere. | A Cambridge edition's front matter says permission is not required for liturgical use up to 500 verses (or less than a full book). Permission for other uses must be obtained from Cambridge's Permissions Manager. A commercial workbook is "other use". | "Scripture quotations from The Authorized (King James) Version. Rights in the Authorized Version in the United Kingdom are vested in the Crown. Reproduced by permission of the Crown's patentee, Cambridge University Press." | Cambridge front matter PDF; Yale library guide; Wikipedia, King James Version |
| World English Bible (WEB) and British Edition (WEBBE) | Public domain. "World English Bible" is a trade mark: a changed text must not be called WEB. | No limit. | None required. A courtesy line is recommended. | ebible.org copyright pages |
| American Standard Version (1901) | Public domain ("Copy freely"). | No limit. | None required. | ebible.org ASV page |
| Young's Literal Translation | Public domain. Very literal, hard to read. | No limit. | None required. | ebible.org YLT page |
| NIV | Copyright Biblica. UK, EU and EFTA commercial print rights are handled by Hodder & Stoughton. | Up to 500 verses, not a complete book, and under 25% of the product's text, with the notice. Biblica says commercial uses and AI applications need an explicit licence. | "Scripture quotations taken from The Holy Bible, New International Version® NIV®. Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.™ Used by permission. All rights reserved worldwide." The Anglicised (UK) notice wording was not found this session [check with Hodder]. | biblica.com/permissions; biblia.com |
| ESV | Copyright Crossway. | Up to 500 verses, not more than half of any one book, under 25% of the total text, and not in a commentary. Not in any Creative Commons publication. | "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. ESV Text Edition: 2025. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated in whole or in part into any other language. Used by permission. All rights reserved." | crossway.org/permissions |
| NLT | Copyright Tyndale House Foundation. | Up to 500 verses, not more than 25% of the work. | "Scripture quotations are taken from the Holy Bible, New Living Translation, copyright ©1996, 2004, 2015 by Tyndale House Foundation. Used by permission of Tyndale House Publishers, Carol Stream, Illinois 60188. All rights reserved." | tyndale.com/permissions |
| NRSV (Anglicised) and NRSVue | Copyright National Council of the Churches of Christ in the USA. | Anglicised edition: under 500 verses, less than a whole book, under 25% of the words. NRSVue: under 500 verses, not a complete New Testament book, not over 50% of the publication. | NRSV Anglicised: "New Revised Standard Version Bible: Anglicized Edition, copyright © 1989, 1995 National Council of the Churches of Christ in the United States of America. Used by permission. All rights reserved worldwide." The NRSVue notice should be taken from the publisher [check]. | oremus Bible Browser; Yale library guide |
| CSB | Copyright Holman Bible Publishers. | Up to 1,000 verses, in any form, not more than 50% of the work, not a complete book. | "Scripture quotations marked CSB have been taken from the Christian Standard Bible®, Copyright © 2017 by Holman Bible Publishers. Used by permission. Christian Standard Bible® and CSB® are federally registered trademarks of Holman Bible Publishers." | csbible.com/about/permissions |

### Recommendation

Use the **World English Bible** as Akana's default Bible text. Use the British Edition (WEBBE) for `en-GB` workbooks and the WEB for `en-US`. ebible.org says the British Edition applies British spelling and has its own handling of God's name. There is also a WEBBE edition with the Deuterocanon, which suits Catholic and Orthodox titles.

Reasons:

1. It is public domain, so no verse counts, percentage limits or licence are needed across a catalogue of many workbooks.
2. It avoids the KJV's UK permission step, which would apply to every KJV quotation in a commercial workbook.
3. Modern publishers' allowances are per product and come with conditions. Biblica's note on commercial and AI use needs a direct conversation before Akana relies on the NIV.

Attribution text for the Start screen or the notes page:

- `en-GB`: "Scripture quotations are from the World English Bible British Edition, which is in the public domain."
- `en-US`: "Scripture quotations are from the World English Bible, which is in the public domain."

House rules:

- Do not edit WEB wording. If the text is changed, it can no longer be called the World English Bible.
- When a classic quotes the KJV inside its own text (Bunyan, Spurgeon, Ryle), that wording is part of the public-domain book. Whether quoting KJV verses as they appear inside a public-domain book still needs Cambridge's permission in the UK is a question for the Legal Lead [check].
- A licensed modern author will often want their own translation, usually NIV or ESV. That is handled in their licence. Keep a counter of verses per workbook against the publisher's limit.
- Where a workbook uses more than one version, mark each quotation (WEBBE, NIV and so on) and give each notice.

## 3. Modern Christian publishers: licensing routes

No partnership or conversation exists with any of these publishers. This is a map of routes for later. The business research (`akana-business.md`) already notes that the church offer cannot launch without licensed Christian titles.

| Publisher | Market | What the public record shows | Likely route |
|---|---|---|---|
| SPCK and IVP UK | UK | One rights page covers both. Translation and territorial rights go to rights@spck.org.uk. Other permission requests go through PLSclear. Churches may use limited extracts free in bulletins and newsletters. | An approach to the rights team for an interactive-workbook licence, using the Research 4 heads of terms. PLSclear is for permissions, not new formats. |
| Hodder Faith | UK | Part of John Murray Press at Hachette UK. Also UK administrator for NIV commercial print permissions. | Hodder rights team, for both NIV quotation terms and author licences [check contact]. |
| 10ofThose | UK and US | No public rights or permissions page was found this session [check]. | Direct contact with the publisher. |
| Zondervan and Thomas Nelson (HarperCollins Christian Publishing) | US, with UK reach | A Rights Department handles UK, translation, audio, "electronic reproduction, and other formats". Domestic US and Canada licensing goes through a contact form. | Domestic licensing contact for an electronic-format licence. |
| Crossway | US | Book permissions go through a request form. The page shows no stated limits. | Permissions form for quotation; rights team for a format licence [check contact]. |
| NavPress (The Navigators, published with Tyndale) | US | Has its own permissions and fair-use page within Tyndale's system. | Tyndale permissions and rights. |
| Lifeway | US | Not checked this session [check]. Lifeway already publishes its own group Bible studies, so it may see Akana as a competitor. | Direct approach, with care. |
| Alpha International | UK and worldwide | All Alpha resources are Alpha's copyright and may be used only to run or promote Alpha courses. Commercial reuse and resale are prohibited. Adapted courses may not be published or promoted. | Not a licensing target. A partnership would need Alpha to start it. |

The strongest practical route is the one in the Research 4 heads of terms: the author or their agent licenses the interactive-workbook format, with the publisher's consent where the publisher holds electronic rights. Many contracts give electronic rights to the publisher, so most approaches will need the publisher at the table.

## 4. Theological review and sensitivity

### A review step

Add a theological review to the content pipeline for every faith title, alongside the existing Clinical Safety and Legal checks.

- **Named role: Theological Reviewer.** A person with formal theological training and pastoral experience. The role signs off each faith workbook before it moves from `in_review` to `approved`.
- **Breadth.** One reviewer cannot speak for every church. Keep a small panel: at least one Protestant (evangelical), one Catholic and, for titles marked Orthodox or General Christian, one Orthodox or Anglican reader. A title labelled for one tradition needs a reviewer from that tradition.
- **What they check.** That the workbook represents the author fairly, that new Akana material does not add doctrine the author did not hold, that the tradition label is right, and that sensitivities (section 1) are handled.
- **What they do not do.** They do not sign off safety copy. That stays with the Clinical Safety Lead.
- **Record.** Add the reviewer's name, tradition and date to the workbook's internal block, next to the public-domain record.

### Safety rules still apply

Faith titles follow the same rules as every other workbook.

- **No health claims.** No workbook may say or suggest that prayer, faith or Scripture treats anxiety, depression, grief or illness. Devotional comfort is allowed. A promise of relief is not.
- **Help now.** Any faith workbook that touches grief, suffering, illness, despair or suicide is tier `standard` and carries Help now. In this list that is Pilgrim's Progress, Confessions, The Christian's Secret, Practical Religion, Revelations of Divine Love and the Ignatius retreat. The draft taxonomy already sets the Mercy and Comfort subcategory to `standard`.
- **No higher-tier faith titles** without clinician sign-off, as for any other genre.
- **Pastoral signpost.** Help now lists crisis lines, not churches. A faith workbook may add a line suggesting the reader also talks to a minister or pastoral team. This should never replace the crisis lines.
- **No healing writings.** Exclude works that promise physical healing through faith, such as Murray's writings on divine healing.
- **Money.** Müller and any stewardship title carry no investment or debt advice. Generosity titles that discuss tithing need the `not_financial_advice` note [Legal Lead to decide].
- **Special category data.** Using a faith title can reveal religious belief. The business research already flags that Akana needs explicit consent for this, as for health data [check legal].

### Tradition labels

Use four labels, shown on the listing:

- **Protestant.** Evangelical, Reformed, Baptist, Methodist, Brethren, Anglican evangelical and Quaker-rooted writers.
- **Catholic.** Writers and texts that assume Catholic faith and practice.
- **Orthodox.** Eastern Orthodox. None in this first list. A later phase could look at public-domain translations of the Philokalia or The Way of a Pilgrim [check editions].
- **General Christian.** Texts read widely across traditions, such as Augustine, Julian, Chesterton and Underhill.

Add a short line under each label on the listing: "Written from within the [tradition] tradition. Readers from other churches are welcome." The Theological Reviewer approves the label.

## 5. Other faith traditions (later phase)

Not for now. These are leads only. None was checked this session, and each needs a full public-domain record before use [check all].

- **Judaism.** The 1917 Jewish Publication Society translation of the Hebrew Bible. Older translations of Bahya ibn Paquda's Duties of the Heart.
- **Islam.** Translations of the Qur'an by Marmaduke Pickthall (1930) and Abdullah Yusuf Ali (1934). Their dates need checking against both UK and US rules. Any Islamic title needs a Muslim reviewer.
- **Buddhism.** F. Max Müller's 1881 translation of the Dhammapada.
- **Hinduism.** Edwin Arnold's verse translation of the Bhagavad Gita, The Song Celestial (1885).
- **Sikhism.** M. A. Macauliffe, The Sikh Religion (1909).
- **Taoism.** James Legge's translation of the Tao Te Ching (1891).

The Quiet Contemplation subcategory in the draft taxonomy already covers "across faith traditions". Each tradition would need its own reviewer, its own labels and its own review of sensitive passages.

## Questions for Crent

1. Should Akana add a `faith` genre (an additive change after the freeze), or keep faith titles on existing genres as the draft taxonomy does?
2. Do you approve the World English Bible (British Edition for en-GB) as the default Bible text?
3. Who could act as Theological Reviewer, and do you want a small cross-tradition panel from the start?
4. Should the first faith wave be a handful of short titles for church groups (for example Drummond, Absolute Surrender, Power Through Prayer, How to Pray), or one flagship such as Pilgrim's Progress?
5. May Akana Classics faith titles be sold, as with the five existing classics (catalogue plan, question 3)?

## Sources

Consulted 7 October 2026.

Classics and editions:

- https://www.gutenberg.org/ebooks/13871 and https://www.gutenberg.org/cache/epub/13871/pg13871-images.html (Lawrence, Revell edition)
- https://www.gutenberg.org/ebooks/5657 and https://www.gutenberg.org/cache/epub/5657/pg5657-images.html (Lawrence, 2002 Lightheart edition, copyrighted)
- https://en.wikipedia.org/wiki/The_Practice_of_the_Presence_of_God
- https://www.gutenberg.org/ebooks/1653 and https://www.gutenberg.org/ebooks/26222 (Kempis, Benham)
- https://www.gutenberg.org/ebooks/131 and https://en.wikipedia.org/wiki/The_Pilgrim%27s_Progress
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Murray%2C%20Andrew%2C%201828-1917
- https://en.wikipedia.org/wiki/Andrew_Murray_(minister)
- https://www.gutenberg.org/ebooks/57121, https://www.gutenberg.org/ebooks/19572, https://www.gutenberg.org/ebooks/author/4672
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Spurgeon%2C%20C.%20H.%20%28Charles%20Haddon%29%2C%201834-1892
- https://www.ccel.org/s/spurgeon/morn_eve/morn_eve.html
- https://www.gutenberg.org/ebooks/65115, https://www.gutenberg.org/cache/epub/65115/pg65115-images.html, https://en.wikipedia.org/wiki/E._M._Bounds
- https://www.gutenberg.org/ebooks/3296 and https://en.wikipedia.org/wiki/Confessions_(Augustine)
- https://onlinebooks.library.upenn.edu/webbin/who/Smith%2c%20Hannah%20Whitall%2c%201832%2d1911
- https://www.gutenberg.org/ebooks/4540 and https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Sheldon%2C%20Charles%20Monroe%2C%201857-1946
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Francis%2C%20de%20Sales%2C%20Saint%2C%201567-1622
- https://wesleyscholar.com/wp-content/uploads/2019/01/De-Sales-Introduction-to-Devout-Life-1885.pdf
- https://en.wikipedia.org/wiki/Introduction_to_the_Devout_Life
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Law%2C%20William%2C%201686-1761
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Edwards%2C%20Jonathan%2C%201703-1758
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Ryle%2C%20J.%20C.%20%28John%20Charles%29%2C%201816-1900, https://en.wikipedia.org/wiki/J._C._Ryle, https://www.gutenberg.org/ebooks/38162
- https://www.gutenberg.org/ebooks/20379, https://gutenberg.org/cache/epub/22034/pg22034-images.html
- https://www.gutenberg.org/ebooks/52958, https://gutenberg.org/cache/epub/52958/pg52958-images.html, https://en.wikipedia.org/wiki/Grace_Warrack
- https://www.gutenberg.org/ebooks/16739 and https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Drummond%2C%20Henry%2C%201851-1897
- https://www.gutenberg.org/ebooks/130, https://en.wikipedia.org/wiki/Orthodoxy_(book), https://www.firstthings.com/article/2008/11/orthodoxy-at-a-hundred
- https://onlinebooks.library.upenn.edu/webbin/who/Torrey%2c%20R%2e%20A%2e%20%28Reuben%20Archer%29%2c%201856%2d1928
- https://www.gutenberg.org/ebooks/21774 and https://en.wikipedia.org/wiki/Evelyn_Underhill
- https://www.gutenberg.org/ebooks/9057 and https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=MacDonald%2C%20George%2C%201824-1905
- https://www.gutenberg.org/ebooks/70790
- https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Henry%2C%20Matthew%2C%201662-1714

Excluded titles:

- https://en.wikipedia.org/wiki/My_Utmost_for_His_Highest and https://en.wikipedia.org/wiki/Walter_v_Lane
- https://www.gutenberg.org/ebooks/25141 and https://en.wikipedia.org/wiki/A._W._Tozer
- https://en.wikipedia.org/wiki/Dietrich_Bonhoeffer and https://en.wikipedia.org/wiki/The_Cost_of_Discipleship
- https://en.wikipedia.org/wiki/Amy_Carmichael and https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Carmichael%2C%20Amy%2C%201867-1951

Bible licensing:

- https://assets.cambridge.org/97805211/63347/frontmatter/9780521163347_frontmatter.pdf
- https://guides.library.yale.edu/newtestament/kjv
- https://en.wikipedia.org/wiki/King_James_Version
- https://ebible.org/eng-web/copyright.htm, https://ebible.org/engwebpb/copyright.htm, https://ebible.org/study/content/texts/eng-webbe/about.html
- https://ebible.org/asv/copyright.htm, https://ebible.org/engylt/copyright.htm
- https://www.biblica.com/permissions/ and https://biblia.com/books/niv2011/Ru
- https://www.crossway.org/permissions/
- https://tyndale.com/permissions
- https://bible.oremus.org/nrsvae/permiss.html and https://guides.library.yale.edu/newtestament/nrsvue
- https://csbible.com/about/permissions/

Publishers:

- https://spckpublishing.co.uk/rights-and-permissions
- https://www.johnmurraypress.co.uk/landing-page/hodder-faith-more/
- https://www.harpercollinschristian.com/sales-and-rights/licensing/
- https://www.crossway.org/permissions/book/
- https://www.navpress.com/permissions
- https://alpha.org.uk/copyright

Repo files read: `docs/planning/AK_Demo_Catalogue_Plan.md`, `docs/planning/AK_Demo_Catalogue.json`, `docs/public-domain/AK-3TQX1.md`, `docs/public-domain/AK-FN9KB.md`, `docs/SCHEMA_V3_FREEZE.md`, `packages/schema/src/v3.ts`, `docs/research/taxonomy.json`, `docs/research/akana-business.md`.
