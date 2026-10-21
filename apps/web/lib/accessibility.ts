/**
 * The public accessibility statement (11.5). Everything here is taken from
 * docs/ACCESSIBILITY.md: the automated sweep that has run, the manual pass
 * that has not yet been recorded, and the known gaps. Do not add a claim of
 * conformance that the manual pass has not shown. When the pass is recorded,
 * move its lines from `notYetTested` to `tested` and update `reviewed`.
 */
export const ACCESSIBILITY = {
  standard: "WCAG 2.2 level AA",
  reviewed: "10 October 2026",
  sweepRun: "8 October 2026",
  aim: "We aim for every page and every reader screen to meet WCAG 2.2 level AA. We do not yet claim that we do. This page says what we have checked, what we have not, and what we know falls short.",
  tested: [
    {
      title: "Automated checks on public pages",
      body: "An axe sweep runs against the home page, search, the help centre, this page, the trust page, pricing, the legal pages, the public-domain records, Help now, sign-in and the 404 page. Each page is checked in light and dark, at 320 pixels wide (a phone) and 1280 pixels wide (a desktop). The sweep fails on any serious or critical problem against WCAG 2.0, 2.1 and 2.2 level A and AA rules. At the last run, on 8 October 2026, it found two problems, both fixed: wide tables that could not be scrolled with a keyboard, and a 404 page with no main landmark.",
    },
    {
      title: "Structure on every page checked",
      body: "One main landmark, one level-one heading and no content outside a landmark. A skip link on reader, Studio and organisation pages.",
    },
    {
      title: "Touch and colour",
      body: "Buttons and links on reader screens are at least 44 pixels tall. The site follows your device's light or dark setting, and your reduced-motion setting.",
    },
  ],
  notYetTested: [
    {
      title: "A manual pass with a keyboard, VoiceOver and TalkBack",
      body: "The checklist is written and has not yet been run and recorded. It covers moving through every field type with a keyboard alone, focus after Next and Back, dialogs, screen reader names and announcements on iPhone and Mac, TalkBack on Android, 200 percent zoom, text spacing, reduced motion and forced colours. Until it is done, we do not say the reader screens meet level AA.",
    },
    {
      title: "Signed-in screens in the automated sweep",
      body: "The player, Library, You, Studio and organisation screens need a signed-in test reader. They are covered only by the manual pass for now.",
    },
  ],
  knownIssues: [
    {
      title: "Reader screens are unconfirmed",
      body: "Ranked lists, tables, the decision matrix and the weekly grid are built to work from a keyboard. We have not yet confirmed how each reads in a screen reader.",
    },
    {
      title: "Stripe's payment page",
      body: "Payment happens on a page run by Stripe. Its accessibility is Stripe's to maintain, and we have not tested it ourselves.",
    },
    {
      title: "Workbook text",
      body: "Authors write the words inside a workbook. We check structure, but we do not yet check every author's choice of wording for plain language.",
    },
  ],
  conformance: "A conformance report in the VPAT layout is published, criterion by criterion. It is partial: it says Partially supports where the manual pass has not yet confirmed a criterion. We share it with organisations that ask for a conformance report before they buy, and we will update it when the manual pass is done.",
  conformancePath: "/accessibility/conformance",
  contact: {
    route: "/contact",
    howTo: "Open the contact form, choose \"Something else\" and start your message with the word Accessibility. Say which page you were on and what stopped you. You do not need to give a diagnosis or any health detail.",
    reply: "We read messages in working hours and cannot always reply straight away. A problem that stops someone using a workbook is fixed before new work.",
  },
} as const;
