# Colours: the audit (the final QA, item 2)

2026-10-21, before the launch. Every colour on air, what it means, and where it breaks the rule "one colour, one purpose". **Presentation only:** nothing here changes a result. Nothing is changed yet: this is for Tom to decide (the questions at the end), then the changes, with a before-and-after dev page.

**How it was done:** every colour in what airs was listed with its file, line and the line itself (2,053 uses in `index.html` and 132 files in `src/channel/`, not counting the dev pages' `*Sheet.js`, the ads' `spot*.js`, team kits and crests, or scenery: turf, stands, skin, sky, floodlights). Each signal colour (text, highlights, status, chrome) was read in its context, and what it styles on screen was found by its class. On the dev server, the colours as drawn were read from the page in Full (a live match, SCHEDULE, the ticker, the side panel, a studio card, the OFF THE BALL booth). Broadcast and the phone share the same CSS and canvas code, so the code read covers them. They weren't looked at separately.

## Tom's answers (2026-10-21)

**Gold is Fan Coins' alone** ("coin = gold"): COINS, the balance, prices, the queue, FAN BOARD, the ticker's FANS items. **MOMENTS and polls stay amber**, so MOMENTS' secrets move from gold to amber too (their paper, `#fff4c9`, still sets them apart), and breaks 11–12 below are dropped (13 stays: those are Fan Coins). **Red stays live's** (question 4): red for live is the broadcast convention (the LIVE bug, the recording light), and amber is already the highlight, so live in amber would read as "highlighted" rather than "live" and the scorebug's LIVE, REPLAY and NEXT would lose their difference. The other reds are a loss (the L chip, a convention like W green) and being over the cap: chips and bars, never text. The heart goes to the team's colour. Everything else as recommended: honours and big matches to amber, donations amber, team names white, the in-world screens kept with amber lit rows, the clock's time white.

## The headline

**Gold today is mostly *not* the audience's.** Gold (`#ffd23f`, the same hex as the heat ball's `heatWarm`, written out about 50 times, plus near-golds `#f2c230`, `#ffb627`, `#b88a10`) marks **honours and big occasions**: records broken, Cups, legends, champions, the previews, the big-match promos and ticker items, SCHEDULE's PLAYOFF PREVIEW line, the award, draft and moves cards. Meanwhile **most of the audience's things are amber:** polls, MOMENTS' ordinary stubs and progress, donations (Tom moved it from gold to amber on 2026-10-18: "the gold was jarring"). Only Fan Coins, FAN BOARD's general boards, the ticker's FANS items and MOMENTS' secrets are gold.

So Tom's rule moves gold both ways: honours and big matches off it, polls and MOMENTS onto it. Amber would then carry the honours too. That fits, because amber is already the channel's own highlight.

**Smaller patterns:**
- **Live is amber in two places** where it should be red: the side panel's head ("LIVE 15'") and the ticker's live scores. **Replay is amber** in the side panel's head too ("REPLAY").
- **Names in grey:** the ticker's TOP SCORER and TOP items (the whole item grey, Tom's example), the runners-up on the award card, the record holder on RECORDS WATCH. Names in amber or heat orange: the promo cards' winners and TO WATCH names, the race tags, OFF THE BALL's hosts on its promo.
- **The old accent survives:** `#ffb627` (amber before Task 277d) in THE TABLE'S STORY's cut line, SCHEDULE's now-row tint and the ads' light bars.
- **Literals for palette colours:** `#9aa1b2` (grey), `#151924` and `rgba(21,25,36,…)` (the panel), `#ff8f1c` (amber), `#0d1016` (a dark well, really the tunnel's scenery colour), `#fff` beside `#f2efe6` (white), `#111` and `#1a1d26` (dark ink on chips).

## The roles (proposed)

| Colour | Means | Where now | Changes |
|---|---|---|---|
| **Amber** `accent` #ff8f1c | The channel's highlight: pane heads, tabs on, the active row, the ticker's tag, tooltips, key numbers (`hi`), the glass card's head; **and honours and big occasions** (records, Cups, legends, previews, big matches) | 125 CSS uses, the off-season cards' heads, the booth's neon | Takes the honours and big matches from gold; gives polls and MOMENTS to gold; gives live and replay back to red and blue |
| **Gold** `gold` #ffd23f (new token) | **Fan Coins alone** (Tom): COINS, the balance, prices, the queue, FAN BOARD, the ticker's FANS items | Fan Coins and MOMENTS' secrets | Its own palette token (no longer shared with the heat ball); MOMENTS' secrets to amber; everything else off it |
| **Red** `live` #e8392f | Live | The scorebug's bug, SCHEDULE's and THIS WEEK's live times, goal flashes | Also the side panel's LIVE head, the ticker's live scores |
| **Blue** `replay` #3a7bd5 | Replays and re-airs | The scorebug, SCHEDULE's REP and vault times, OFF THE BALL's repeat | Also the side panel's REPLAY head |
| **White** `panelInk` #f2efe6 | Names (players and teams) and primary values | The side panel, results, cards | Names out of grey, amber, gold and heat orange (below); `#fff` literals onto it |
| **Grey** `panelMuted` #9aa1b2 | Secondary: labels, times, positions, notes | Labels, SCHEDULE's times, ticker fixtures | A few secondary lines out of white (below) |
| **Heat** `heatWarm/Orange/Hot` | Scorchers, burns, momentum; the big match's fire (the promo column's flame, the ticker's BIG tag) | Those, plus some titles and race lines | Kept for fire; names in those lines go white |
| **World gold** `#f2c230` and its light and shade | Physical gold in the world: the Scorch Cup, the final's gold boards, the lift's podium, arch and confetti, prizes, the plinth, the lottery's ring, golden-goal confetti | `playoffArt.js`, `liftArt.js`, `awardArt.js`, `main.js` | Kept: it's the world, not the interface |

## The breaks

Grouped by the role broken; most visible first. Line numbers are as of commit `05320cd3`.

### Gold outside the audience → amber (or white for names)
1. **Ticker big-match items** (FINAL ROUND, SEMIFINAL 1, THE FINAL) — `index.html:677 .tick.big`, `ticker.js:60,66` → the text in white, the fiery tag kept.
2. **SCHEDULE's PLAYOFF / FINALS PREVIEW time** — `index.html:465 .guide-row.preview .when` → amber, as OFF THE BALL's time already is.
3. **Studio cards' `.gold`** — `index.html:785`, `cardPanel.js` 173, 181, 216, 278, 288: preview and finals titles, RECORDS AND MILESTONES' records, THE FINAL box and semifinal scores, the vault's WHY IT MATTERS, THEN and headline, UPDATES' IN FORCE FROM → amber for heads and records, white for scores.
4. **Table and honours cards** — `index.html:836 .card-grid .gold`, `cardPanel.js:445,446,457,485,487,500`: the champion's or top team's name, playoff marks, the CUP head, RECORD head and value → the name white, heads and the record amber.
5. **Promo cards** — `index.html:758, 761, 771, 776`, `cardPanel.js:144`, `cards.js:384`: the column's gold edge, SEASON N / the time, the "v", TO WATCH names → amber for the edge, time and "v"; names white.
6. **A record broken on air** (the lower third's title and stripe) — `index.html:103`, `caption.js:7,27` (`RECORD_GOLD`) → amber, with an amber glow.
7. **The player card's LEGEND, Cup seasons; the team card's Cups, the Pennant** — `index.html:525, 533, 538`, `playerCardView.js:51,80`, `teamCardView.js:58,83,165–166` → amber.
8. **PLAYERS TO WATCH and THE ROAD TO THE FINAL** — `index.html:814, 820, 824, 825` (the keeper's save %, the road boxes) → amber, like the scorer's number beside it.
9. **The off-season cards:** the award card's edge, name and team · stat (`awardArt.js:100,102,108`; the other off-season cards' edges are amber); the draft's PROJECTED role (`draftArt.js:65`; the studio's draft card shows it amber); the farewells' AWARDS line (`farewellArt.js:90`; grey on the studio's card); the moves board's deal length and awards (`movesArt.js:61,63`) → amber, the award's team · stat grey.
10. **SCHEDULE's now-row tint** — `index.html:472` rgb(255 182 39 / 0.16), the old accent → the accent's own tint.

### The audience's things not in gold → gold (Tom: Fan Coins only; 11–12 dropped, MOMENTS' secrets to amber)
11. **Polls:** the question, the current poll, my vote, the winning share (`index.html:193, 209, 214–215, 222–223`); UPDATES' POLL chip (429, a white chip), the winner and VOTE IN AUDIENCE (`.upd-win`, `.upd-gold`, 431–432: the class is called gold but is amber); `audiencePane.js:194`, `bookPanes.js:131–132`.
12. **MOMENTS:** the stubs' and tiles' amber parts, the progress bar, the steps got, NOTICES ON (`index.html:231, 266, 279, 283, 290`). The secrets keep their paper (`#fff4c9`) to stand apart.
13. **Fan Coins' leftovers in amber:** the spend's status line (`index.html:317 .fc-row .st.ok`), the queue's NOW slot (331).
14. **Donations** (SUPPORT THE CHANNEL, DONATE, `index.html:200–203`): amber by Tom's call on 2026-10-18. **Recommend keeping it amber** (question 2).

### Live and replay
15. **The side panel's head**, LIVE 15' and REPLAY in amber — `index.html:114 .side-status` → red for live, blue for a replay (FULL TIME and UP NEXT stay amber); a class from `sidePanel.js`.
16. **The ticker's live scores** — `index.html:671 .tick.live`, amber → a red LIVE and the minute, the score in white.
17. **Red's second meaning:** the L form chip (`index.html:735`), the MONEY bar over the cap (504, `chroniclePane.js:298`), the shout's heart (`#d8233a`, 360). **Recommend allowing it** for a loss or being over a limit (chips and bars, never text, so they don't read as live), the heart to the team's colour (question 4).

### Names and grey
18. **Ticker TOP SCORER and TOP** — `index.html:673 .tick.scorer / .tick.leader` (all grey) → the player's name and the team in white, the rest grey.
19. **Promo results:** the winner's name amber, the loser's grey (`index.html:768`, `cardPanel.js:132`) → both white, the win carried by the score.
20. **Heat-orange name lines:** the race tags (PENNANT / PLAYOFFS racers), OFF THE BALL's hosts on its promo (`cardPanel.js:110,156`, `cards.js:299,349`) → names white, the label in heat.
21. **The award card's runners-up** (`awardArt.js:115`, whole line grey) and **the record holder on RECORDS WATCH** (`cardPanel.js:487`) → names white.
22. **Secondary in white:** the farewells' N SEASONS · LAST WITH (`farewellArt.js:89`); SCHEDULE's OFF THE BALL row (`index.html:469`, a pure `#ffffff` where other shows are grey) → grey; the side panel's goal minute (133) → grey, the name staying white.
23. **The clock** (the scorebug's time grey, the period white, `index.html:87–88`): primary information in grey. **Recommend the time white** (question 5; small).

### Tidy-ups (the same look, one source)
24. New palette tokens: `gold` and `goldShade` (#b88a10) apart from `heatWarm`; `well` (#0d1016) apart from `tunnel`; `chipInk` for dark text on chips (#111, #1a1d26); `good` for the W chip (#5fd35f) and the moves board's kinds (#7ddc6a, #ff6b5e, #8fd3ff, #ff9e5e, the booth's #7fe08a and #ff7a6a: one shared set of up, down and other).
25. Literals → tokens: `#9aa1b2` (`podcastBooth.js:145,150`), `#151924` and `rgba(21,25,36,…)` (the off-season card backs, `interview.js:157`, `lotteryArt.js:57`, `sceneArt.js:151`), `#ff8f1c` (`perfView.js`), `#fff` beside the ink (`index.html` 78, 561, 661, 672, 678, 700, 706: white inside speech bubbles and on the red bug stays), the scene's colours copied into `sceneArt.js:164–181`.
26. **The old accent:** `cardPanel.js:241` (THE TABLE'S STORY's cut line, `#ffb627`) and `sceneArt.js:176` (the ads' light bars) → the accent.
27. **The tour's pulse** (`index.html:385, 400`) writes the accent out, so it ignores `?accent=` → mixed from the variable.
28. **The in-world screens** (the studio's side screens, the booth's): their own ink (`#ffffff`, `#cfe6ff`, the peach `#ffd2a0` for lit rows, `studioSet.js:283,296`, `podcastBooth.js:122–150`). They're screens in the world, so their own blue-white look stays; the peach lit rows go amber (question 6).
29. The dev panel's stale fallback `var(--accent, #ffc23d)` (`index.html:867`): dev only, the right accent.

### No rule yet (each with a recommendation)
- **Golden goal** (the caption and the callout, `index.html:103, 859`, gold): it's literally golden, but it isn't the audience's. **Amber**, keeping the gold confetti (world gold).
- **FOUL!** (`index.html:856`, gold): a referee's yellow. **Keep it**, as world yellow (it isn't gold in meaning).
- **The Kindling League and called-up tags** (#8fd3ff): into the shared set in 24.
- **Momentum** (the swatch's glow, the rings): heat. Already fine.

## Questions for Tom

1. **Honours and big matches (records, Cups, legends, champions, previews, promos) from gold to amber?** Recommended: yes. Gold then means "yours" alone, and amber is already the channel's highlight. *The alternative:* a third colour for honours (a pale gold), which brings back the confusion.
2. **Donations:** stay amber (your 2026-10-18 call), or gold with the rest of the audience's things? Recommended: **amber**. It's a link out, not something earned or spent on the channel, and the gold box was jarring.
3. **MOMENTS all gold** (the stubs, the progress, the steps), the secrets standing apart by their paper? Recommended: yes, so COINS and MOMENTS read as one family.
4. **Red for a loss or over a limit** (the L chip, MONEY over the cap) beside live? Recommended: yes, in chips and bars only. *The alternative:* heat-hot for them.
5. **Team names white like player names** (the ticker's TOP, the champion on the table card, the promo results)? Recommended: yes. The side panel and the results already do it.
6. **The in-world screens** (the studio's side screens, the booth's) keep their own blue-white ink, the peach lit rows to amber? Recommended: yes.
7. **The scorebug's clock time white?** Recommended: yes (small).

## Built (2026-10-21)

In five commits, each with `npm test` passing: **1** the tokens (`gold`, `goldShade`, `well`, `chipInk`, `good`, `up`, `down`, `aside` in `palette.js`; the literals onto them; the dark ink `#111` became `chipInk`, a shade bluer); **2** gold off honours and big occasions (the card class `gold` renamed `honour`, drawn amber; MOMENTS' secrets amber; FOUL! in the kick plates' yellow; also the interview's fact strip, which the audit missed); **3** live red and replays blue (the side panel's head, the ticker's live scores); **4** names white, secondary grey (the ticker's TOP and TOP SCORER, the promo results, the award card's runners-up, the goals' minutes, the farewells' seasons line, the clock); **5** the rest (the old accent, the booth's lit rows, the shout's heart, the queue's slots). Not changed, on purpose: SCHEDULE's OFF THE BALL row stays white like AROUND THE GROUNDS and FROM THE VAULT (break 22 was wrong there); the booth's neon glow; white text on the red and blue chips. **`colours.html`** shows thirteen moments before and after (Broadcast too), over a copy of the channel before the changes in `output/before/` (the command to make it is on the page). Checked on the dev server: the live match, a promo card, an award, MOMENTS. Not looked at on a phone.

## Then (as planned)

On Tom's answers: the tokens first (24, no visible change), then the breaks role by role, each a commit. A dev page, `colours.html`, shows each changed graphic before and after over the real channel (the ticker, SCHEDULE, the side panel's head, a studio card, a promo, the record lower third, the award card, the AUDIENCE pane). `npm test` and `npm run livecheck` after each; Tom's look on the dev server; then the push.
