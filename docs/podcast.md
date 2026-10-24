# The podcast studio segment: ideation (2026-10-20, for Tom to pick from)

Tom's note 14 idea: a casual "podcast" studio segment with two new analyst types. This is the write-up to pick from before any mock-up or voice is made. Nothing here is built.

**What it has to fit (from vision.md and docs/tasks.md):**
- Presentation only: the sim never hears it.
- Every screen shows the same thing at the same moment: topics, lines and picks are seeded by the league and the time, using only what has aired by then.
- The desk speaks, the graphics inform (vision §12). Lines are said only when the facts module says they're true. A line names at most one team (one clip per team, eight clips). Players and numbers go on the graphic under the speaker, never spoken (a new voice would need a clip per surname, and every draft brings new ones).
- New voices are paid ElevenLabs batches: lines for Tom to read first, voices tried by ear on the sound board, `--count`, Tom's balance (about 43,000 credits on 2026-10-19; to ask) and his go before any paid run.

The nearest model is the playoff analyst (§30.2, `data/analyst.json`, `analystTalk.js`). His 243 clips, about 10,900 characters, cost about 4,700 credits at about 0.43 a character. The podcast would be the same machinery with two new voices and its own set.

## 1 · The show

A short, loose chat show, about **8–10 minutes** an episode (PLAYOFF PREVIEW runs about 13). The two talk to each other, not to a host. Bubbles carry the words, as the desk's do; a graphic panel behind them carries the specifics (the table, a player's numbers, a payroll); now and then they turn to a screen for a clip.

**The running order of an episode** (seeded, so no two days run alike):
1. **The cold open:** a line of banter, the title sting.
2. **Three or four topics** dealt from the pool below (about 2 minutes each: six to eight lines and a graphic, sometimes a clip).
3. **PICKS:** each names their winner for the next big match.
4. **The sign-off.**

**A working name** (Tom to pick, or his own): **OFF THE BALL**, **THE KILN** (the heat theme), **THE HOT SEAT** or **TWO ON THE BALL**. Each gets a neon sign on the set and a SCHEDULE line in gold, as PLAYOFF PREVIEW has.

## 2 · Who the two are (three pairs to pick from)

Each pair is two types that rub against each other, from different regions so their voices differ. Each gets a look at the real desk (`studioSet.js` `drawFigure`), as the analyst's candidates did. Names are checked against the surname pools before mock-ups (Brodek was renamed for this).

| Pair | One | The other | What the pair gives |
|---|---|---|---|
| **A · The old pro and the numbers** | **Tamsin** (Polgrean as an analyst candidate), a former keeper from the Gullcoast, sharp and dry (her look is made) | **Samira** (Farrokh as a candidate), a data analyst from Sunreach, quick and precise (her look is made) | Gut against numbers: "I watched it" and "the numbers say otherwise". The graphics suit Samira. |
| **B · The fan and the insider** | A superfan who runs a supporters' club, loud and loyal, from the Kettle Highlands | A former club executive from Varenne, smooth, all money and contracts | Heart against business: the money topics (the cap, signings, payrolls) get a voice, and the fan's outrage is a gift. |
| **C · The tactician and the storyteller** | An ex-coach and whiteboard type from Varenne, who explains how a goal was made | A league historian from the Gullcoast, who knows every record and dynasty | Now against then: the chronicle (records, droughts, dynasties) gets a voice, and the tactician reacts to the clips. |

**Both surnames need changing:** Polgrean and Farrokh are in the Gullcoast's and Sunreach's surname pools (checked 2026-10-20), so a player could share them, as with Krenn. New surnames from no pool come with the mock-ups.

My pick is **A**. Both looks are made and Tom has already seen them on `analyst.html`, the contrast is clear in a sentence, and it shares the analyst's tested setup. B gives the money its only voice, and C leans hardest on the chronicle.

## 3 · What they talk about (the topic pool)

Each topic is a set of line kinds as in `analyst.json`: who says it, the fact that makes it true, and a few ways each. Each analyst says their own ways in their own manner, so the same topic sounds different from each of them.

| Topic | What's said (from what has aired) | On the graphic |
|---|---|---|
| **THE TABLE** | who's top and why, the week's climber (up two places or more), who's in trouble | the table with this week's moves |
| **HOT TAKE** | one makes a bold claim from a fact ("{team} will win the Cup": top and in form; "{team} are in real trouble": bottom, three defeats), the other agrees or pushes back (seeded) | the fact behind it |
| **DID YOU SEE THAT?** | the day's best goal (a scorcher first) played on the screen behind them; they react (no names, "what a hit") | the scorer and match, on the clip |
| **THE MONEY** | a payroll near the cap, the off-season's big signing, a bargain (a top scorer on a small wage) | payrolls, the deal in guilders |
| **FROM THE ARCHIVES** | a drought, a dynasty, a record in sight, a past final | the record book's line |
| **THE KIDS** | the rookies under the rookie rule, a Kindling League call-up | the rookie's numbers |
| **YOUR VOTE** | the AUDIENCE poll open now ("have you voted?"), never its result (that's the League's on UPDATES) | the poll's question |
| **PICKS** | each names a winner for the next big match ({team}); next episode they own up ("got that one wrong", "told you"), true by the result | both picks, then how they did |

PICKS gives the show a memory from one day to the next, the way MOMENTS gives the viewer one. A pick is seeded from the table and form, so it never knows the result ahead.

## 4 · Where and how often

The room is in the re-airs, which are about 57% of a regular-season day, three between each pair of live matches. Three ways:

| Option | When | Lines needed | Feel |
|---|---|---|---|
| **P1 · Daily (my pick)** | a new episode each regular-season day (Monday's a SEASON AHEAD from last season), first in an evening gap in place of a re-air, repeated once overnight; on the night after the final a SEASON REVIEW episode in the repeats | medium: about 30 lines heard a day | a daily show, appointment viewing, PICKS works best |
| **P2 · Twice a day** | two different episodes a day (afternoon and evening), no repeats | about double P1's for the same freshness | busier; costs more to keep fresh |
| **P3 · Specials only** | three a season: SEASON AHEAD (Monday), MIDWEEK (Wednesday or Thursday), SEASON REVIEW (after the final), each repeated in the gaps | fewest | cheapest per airing, but it feels like an event, not a podcast |

The playoffs keep PLAYOFF PREVIEW and FINALS PREVIEW; the podcast stays out of the overnight gap before the semifinals, so they don't compete.

## 5 · What it costs in voices

Estimated at the analyst's rate (about 45 characters a line, about 0.43 credits a character). A team-named way is eight clips. The host-free format means only the two new voices, nothing for Hedrek or Ysolde.

| Size | Kinds × ways | Clips | Characters | Credits | How often a line comes back (P1) |
|---|---|---|---|---|---|
| **Lean** | about 14 × 3 | about 140 | about 6,500 | **about 2,800** | most lines several times a season; repetitive by season 3 |
| **Standard (my pick)** | about 24 × 4 | about 380 | about 17,000 | **about 7,300** | each line about twice a season |
| **Rich** | about 32 × 5 | about 650 | about 29,000 | **about 12,500** | about once a season |

**Plus:** trying voices for the two on the sound board, as the analyst's six were tried (about 1,800 credits then), so about **3,000–3,600** for two roles. **In all, at Standard: about 11,000 credits** of the about 43,000 balance (to confirm with Tom). Clip-end re-voices (the scan flags a few each batch) add a few hundred.

**Graphics first** is also possible, as PLAYOFF PREVIEW was: the set, the graphics, clips and bubbles typed out with no voices. But a talk show without talk doesn't really work, so I'd voice it from the start and keep the mock-ups for the look.

## 6 · What else it needs (not voices)

- **The set** (mock-ups, three looks): **A** a back room, two armchairs, mic arms, the neon name, a shelf with a ball and a pennant; **B** a booth high in a stand looking over the empty pitch, the ground lit by the time of day (ties in with AROUND THE GROUNDS); **C** a sofa in front of a big screen where the clips and graphics play.
- **The screen's clip** (DID YOU SEE THAT?): a goal from the highlights' reels played inside the set's screen, a new piece of drawing (a match drawn into a smaller rect).
- **The programme:** a `podcast` segment placed in the gaps (`programme.js`, as `previewPieces`), a SCHEDULE line, `npm run rundown` showing it.
- **The lines as data** (`data/podcast.json`, validated in `src/config.js`), dealt and sized as the analyst's (`analystTalk.js`, `lineTiming`).
- **Tests:** every line over a few leagues has its clip, from the right seat; it's true when said; each episode is the same on every screen.

## 7 · For Tom to pick

1. **The pair:** A (Polgrean and Farrokh), B (the fan and the insider) or C (the tactician and the historian), or a mix.
2. **The name:** OFF THE BALL, THE KILN, THE HOT SEAT, TWO ON THE BALL, or another.
3. **Where and how often:** P1 daily, P2 twice a day, or P3 specials.
4. **The size:** Lean, Standard or Rich, and the credit balance today.
5. **Topics** to drop or add from the pool.

**Then the plan, one step at a time:**
1. Mock-ups on `podcast.html` over the real channel: the set in three looks, the pair at it, a topic with its graphic.
2. Tom's picks.
3. The lines written into `data/podcast.json` for Tom to read and edit.
4. The voices tried on the sound board (a small paid run, Tom's go).
5. `--count`, then the batch (Tom's go).
6. The build, then the check on the dev server.

## Tom's picks (2026-10-20)

- **The pair: A**, with new surnames from no region's pool: **Tamsin Tregarrow**, a former keeper from the Gullcoast, and **Samira Haddani**, a data analyst from Sunreach (their looks as the analyst's candidates had them).
- **P1, daily:** a new episode each regular-season day (Monday SEASON AHEAD; Saturday's repeat between its matches, the night being PLAYOFF PREVIEW's), and SEASON REVIEW on the night after the final in the repeats: 7 unique episodes a season, about 13–15 airings a week. One build covers every season (more voices only for expansion, freshness top-ups or new things to talk about).
- **Standard size** (about 380 clips, about 7,300 credits, plus about 3,000–3,600 to try voices).
- **The name:** to pick from the mock-ups.

**Mock-ups (2026-10-20):** `podcast.html`: the set in three looks (A the back room, B a booth over the ground, C the sofa and the big screen), each with the pair talking through a draft THE TABLE topic, the bubble and the lower third; the pair magnified; the topic on set C with its screen showing the graphic (the table with today's moves), a clip (the day's scorcher replayed) or the name. `?name=` tries the names on the neon. For Tom: the set, the name.

**Round 2 (2026-10-20, Tom: B the most, with C's screen for the topic):** three booths with a screen on `podcast.html` (1b), the buttons switching what every screen shows (the table's graphic, the day's scorcher, the name): **B1** a monitor hung from the ceiling between them (as in a commentary box; the whole table fits); **B2** a panel of the channel's Glass over the window, the ground round it and faintly through it; **B3** the far stand's big board seen through the window (small with distance: the top of the table and today's climber, or the clip). In B1–B3 the pair sit further apart so the bubbles clear the screen. For Tom: which booth, and the name.

**Round 3 (2026-10-20, Tom's idea):** the window's three panes kept: between topics all three show the ground; during a topic the **middle pane is the screen** (the whole table fits; the clip cropped to the pane, following the ball) and the side panes go neutral, **B4** frosted over in the channel's dark blue or **B5** with slatted blinds down. On `podcast.html` 1b; the third button ("Between topics") shows the clear window.

**Tom's picks (2026-10-20, after round 3):** the set **B4** (the booth over the ground; the window's middle pane the screen during a topic, the side panes frosted; all three clear between topics); the name **OFF THE BALL**; the right seat a man, **Samir Haddani** (Samira until now; the same skin tone and jacket, short hair, a tie). So the pair: **Tamsin Tregarrow** (left, a former keeper from the Gullcoast) and **Samir Haddani** (right, a data analyst from Sunreach).

**Next (the plan's step 3):** the lines written into `data/podcast.json` (each topic's kinds, who says each, the fact that makes it true, their ways, at the Standard size) for Tom to read and edit; then the voices tried on the sound board (a small paid run, Tom's go).

**The lines, a draft (2026-10-20):** `data/podcast.json` (not loaded or validated by the channel yet, nothing voiced), listed on `podcast.html` section 4 with each kind's clips: 58 kinds, about 421 clips, about 19,600 characters, about **8,400 credits** (Tamsin 152 clips, Samir 269: most of the team-named lines are his). How an episode deals them is at the file's top: the opening (daily, SEASON AHEAD on day 1, SEASON REVIEW after the final), three or four topics from THE TABLE, HOT TAKE (with the other agreeing or not), DID YOU SEE THAT?, THE MONEY, FROM THE ARCHIVES (from season 2), THE KIDS (from season 2), YOUR VOTE (while a poll is open), then PICKS (each owning up to yesterday's), the close. **For Tom:** read and edit the lines (on the page or in the file); then the voices tried on the sound board (a small paid run, his go and balance first).

## The bigger show (Tom, 2026-10-20: about 30,000 credits to spend, of about 43,000; about 13,000 kept for the player spotlight and fixes)

An episode: the opening; **the hook**, a short topic tied to what's really going on (the lines above), which picks the theme; **the discussion**, a scripted back-and-forth on that theme, sports talk in Scorchball's own terms, never naming a team or a player, so it's true in any season and voiced once; PICKS and the close. **Eight themes, four discussions each** (32): the kids (hook THE KIDS), the title race (THE TABLE), form (HOT TAKE), scoring and keeping (DID YOU SEE THAT?), money (THE MONEY), history (FROM THE ARCHIVES), the fans (YOUR VOTE), luck and judgement (PICKS some days). A discussion's next one not yet aired, none again until its theme's four have aired (one a day: 32 last about 4½ seasons). The middle pane shows its title, clearing for its last lines. Also: about 15 short back-channel interjections each ("Mm.", "Right.", "Ha!"), played softly under the other's longer lines; ElevenLabs v3 delivery tags used sparingly (`tag`, never shown). **The cost, planned:** about 25,000 credits for the batch, about 28,000 with the voices tried first.

**Batch 1 written (2026-10-20):** the kids (finding their feet, the old hands, the draft, the Kindling League) and the title race (pressure at the top, how a run starts, the last round, the Pennant), in `data/podcast.json` (`themes`, `discussions`), on `podcast.html` section 5: 8 discussions, 112 lines, about 8,500 characters, about 3,700 credits; each about 1½ minutes. Claims checked against the sport (the Cup two matches for a team, a 40-minute match, prospects 18–20, the higher seed at home); Samir's unmeasured numbers said as hunches ("I'd bet"). **For Tom:** read batch 1 (tone, length), send his edits to the hooks; then batch 2.

**Tom's note on batch 1 (2026-10-20):** the tone reads well; make Tamsin a **career backup keeper** (most analysts were never the stars): Samir teases her about the bench ("Says the backup keeper"), and she gets in first, poking fun at herself. Done through batch 1 and the hooks (her one start a season, six seasons beside the first-choice keeper, the third keeper, the best seat in the house, a pie and a lift home). Length kept at about 14 lines (about 1½ minutes; Tom).

**Batch 2 written (2026-10-20):** form (form or class, confidence, a bad run, momentum) and scoring and keeping (the scorcher, keepers, the free shot, the shootout), checked against the sport (momentum two in three from burns, 90 game seconds, not stacking; the burn at 40 seconds; free shots from the defending zone, the ball cool; the shootout's three each then sudden death, every shot hot; the Ironclad among the busier keepers; a backup keeper's one or two starts a season); players neutral (they, their). So far 16 discussions, 224 lines, about 16,600 characters, about 7,150 credits; with the hooks about 645 clips, about 15,600 credits. On this pace all 32 come to about 14,300, the whole batch about 23,000. **Next:** batch 3 (money, history), then batch 4 (the fans, luck and judgement), then the interjections.

**Batch 3 written (2026-10-20):** money (the cap, contracts, why players move, bargains) and history (dynasties, droughts, rivalries, legends), checked against the rules (the cap 20 million guilders, hard and the same for all, the reserves off it; the biggest deal a quarter of it; rookie deals three seasons by pick; under 25s three or four seasons, over 30 one or two; keepers retire about two years later; motives money, winning, home, secret, the young leaning to money and the older to winning, the old club's pull; the lottery for the weaker teams; two clubs in every region). So far 24 discussions, 336 lines, about 24,500 characters, about 10,500 credits; with the hooks about 757 clips, about 19,000 credits. **Next:** batch 4 (the fans, luck and judgement), then the interjections.

**Batch 4 and the interjections written (2026-10-20):** the fans (the grounds, home advantage, what fans want, away days) and luck and judgement (luck or skill, upsets, what the numbers miss, watching or counting), checked against the sport (the home bonus; mostly home fans, a small away end, boos at the away side's fouls; the higher seed at home in the playoffs; polls and notes to the League, which changes things slowly; the lottery's drum; five a side; the rookie rule); 30 interjections (15 each). (`fansWant` says there are polls, so it waits for the first poll to open: `"needs": "poll"`, Tom, 2026-10-21.) **All 32 discussions:** 448 lines, about 32,000 characters, about 13,800 credits. **The whole batch** (the hooks, the discussions, the interjections): about 899 clips, about 51,900 characters, **about 22,300 credits**, about 25,300 with the voices tried first (of Tom's 30,000). **Next:** the voices tried on the sound board for Tamsin and Samir (a small paid run: candidates from the ElevenLabs library, a few of their lines each; Tom's go and balance first), then `--count` and the batch.

**The voices (2026-10-20):** eight ElevenLabs Library voices tried on the sound board (`npm run voices -- --try-11 … --podcast --who tamsin|samir`: three hooks, their half of ROOKIES · FINDING THEIR FEET, three interjections; about 2,750 credits). **Tom's picks: Rachel M** for Tamsin (of Alana, Jo, Rachel M, Blondie) and **Ali (Clear, Smooth and Deep)** for Samir (of Yousef, Nafees, Ali the Levantine, Ali the smooth), in `data/podcast.json` `pair.<who>.voice`. The batch is `npm run voices -- --podcast [--count] --paid` (into `assets/voices/podcast/<who>/`, lengths into `lengths.json`): 899 clips, about 51,200 characters, **about 22,000 credits** (Tamsin 391, Samir 508). **Voiced 2026-10-20** (Tom's go, no hook edits, a balance of about 41,000 before the batch): 899 clips, about 51,200 characters (about 22,000 credits), 19 MB, the lengths written; the clip-end scan flagged 24 at 0.15 or over (all Tamsin's but one), re-voiced (about 1,460 characters with a second take for three), now all under 0.15. **Next:** the build (docs/tasks.md, step 4).

**The build, step 4a (2026-10-20): the lines and the episode.** `data/podcast.json` is loaded and validated (`src/config.js`, `PODCAST_SCHEMA`; the empty `show`s dropped), `settings.podcast` (`at`, `pickHours`, `interjectionChars`, `interjectionShare`), and `src/channel/podcastTalk.js` (pure, no DOM), tested in `tests/podcast.test.js`:
- **When:** each episode is made at `settings.podcast.at` (18:00) from what has aired by then, and every airing of it says the same: SEASON AHEAD on day 1, a daily one on days 2–6, SEASON REVIEW at the final's whistle. Where it airs is step 4b.
- **The theme** comes from a seeded schedule, not from the facts (only this season's and last season's matches are kept, so a schedule that remembered past hooks couldn't be worked out again): each theme once in every run of eight episodes, never twice running; a theme's four discussions all air before one comes back. The hook is the theme's own; one with nothing true to say is left out, and the episode goes from its opening into the discussion (each opens on a question). SEASON AHEAD and REVIEW lead with their own lines, then a discussion too.
- **The hooks**, each line only when true: THE TABLE (the leader and their form, the day's climber and faller, the bottom from round 3, matches left); HOT TAKE (Tamsin's Cup or trouble, Samir's unlucky; Samir always agrees with a take the table shows); DID YOU SEE THAT? (a goal from the day's matches, a scorcher first; the match and goal returned for the screen); THE MONEY (the cap or the most room, a top-five scorer on a bottom-half wage); FROM THE ARCHIVES and THE KIDS from season 2 (the Spark's sum for the best rookie so far); YOUR VOTE while a poll is open; PICKS.
- **PICKS:** the biggest match (the two sides' points together) kicking off within 20 hours; Samir the side higher in the table, Tamsin against him about half the time; the next episode owns up by the result, with each one's record this season on the pane; SEASON REVIEW says how the picks went when they differ.
- **Interjections:** the listener's, under 40% of the other's lines of 70 characters or more, dealt without repeats (their timing is step 4d).
- **Tom's tweaks (2026-10-20):** SEASON AHEAD stays at 18:00 on day 1 (matches have been played by then), so Samir answers Tamsin's opening as on any day (`openReply`); `openAheadReply`'s two lines ("Clean slate", "Everyone starts on zero") came too late and are kept, voiced, unused; the rest of SEASON AHEAD fits the evening. **PICKS:** Tamsin goes against Samir about half the time (likelier when the other side is in better form; 15 of 36 apart over three leagues).

**The build, step 4b (2026-10-20): on air.** Each daily episode airs at the first break from 18:00 (never before; a re-air gives way when it no longer fits) and again overnight from 03:00 (`settings.podcast.repeatAt`), except the last daily one, whose night is PLAYOFF PREVIEW's; SEASON REVIEW opens the night after the final and airs again before its repeats: 13 airings a season. Episodes run about 1¾–2¼ minutes. SCHEDULE has a gold OFF THE BALL line (REP when repeated), `npm run rundown` lists it. For now the pair sit at the desk on set B with their own names, graphics and voices (`docs/channel.md` §34); the booth is 4c. Seeded from `live.looks` (the channel's public look seed) so a day from the keys and from the seed agree (the TV guide's snapshot test found it).

**Tom's notes after hearing 4b (2026-10-20):**
- **A major event of the channel, about 9–10 minutes** (Tom: "even 4 minutes seems low"; it had come to about 2 because the bigger show's shape, one hook and one discussion, was never added up). The plan: the opening; THE DAY (every hook that's true, in turn); a discussion; DID YOU SEE THAT? (the day's goals on the booth's screen, the pair reacting); an ad break with OFF THE BALL's own bumpers; a second discussion; a third; PICKS and the close. **Three discussions an episode** (Tom), so the 32 come round after about 1½ seasons; topped up later. A few new linking lines ("We'll be right back", "Welcome back", "the day's goals"), for Tom to read first.
- **The premiere at 18:00 every day** (Tom: the right time for it), promoted like a big match; the overnight repeat kept.
- **Credits:** about 17,000 until 10 November; Tom will put most of them into this segment; bigger voice additions wait until then.
- **Samir's voice is off beside Tamsin's** (Tom: Tamsin, Rachel M, is realistic and off the cuff; Samir, Ali, sounds read off a script). Re-voicing all of his 508 clips costs about 12,400 credits; with a try-out of new candidates heard in conversation with Tamsin's real clips (about 1,550) and the linking lines (about 500), about 14,450 of the 17,000.

**Samir's try-out in conversation (2026-10-20, Tom's go):** `npm run voices -- --try-11 … --podcast --who samir --talk` voices only his seven lines of ROOKIES · FINDING THEIR FEET; the sound board's grid ("Samir in conversation") has a CONVERSATION button under each voice that plays the whole discussion with Tamsin's real clips between his, and Ali (today's) as the first column to compare. Six candidates, all ElevenLabs Library voices marked conversational: Fadi (Lebanese), Ben Chamsou ("Podcast Host", Algerian), Atlas (relaxed), Cherif Malli (close to the listener), Hayder (Iraqi) and Emmanuel (a Middle Eastern accent). 42 clips, about 4,160 characters, **about 1,790 credits** (estimated 1,550: the lines are longer than guessed). **Next:** Tom's pick; then the linking lines written for him to read; then one batch, Samir's 508 clips again in the new voice with the linking lines (about 12,900).

**Tom's pick (2026-10-20): Fadi** for Samir (in conversation with Tamsin it works), in `data/podcast.json` `pair.samir.voice`. **The linking lines, a draft for Tom to read** (`data/podcast.json`, after `_linking`): bridges into the second and third discussions (`talkIntoTamsin`, `talkIntoSamir`, said by whoever opens it), the day's goals as a reel on the booth's screen (`reelAsk`, `reelReactTamsin`, `reelReactSamir`, `reelEnd`; never naming a scorer), and the break in the middle (`breakInto`, `breakBack`): 29 clips, about 820 characters, about 350 credits. **The batch** (`npm run voices -- --podcast --redo "podcast/samir/" --count`): Samir's 508 clips again in Fadi's voice and the 29 new ones, 537 clips, about 29,600 characters, **about 12,700 credits** of the about 15,200 left.

**Voiced again 2026-10-20 (Tom's go):** Samir's 508 clips in Fadi's voice and the 29 linking lines, 537 clips, about 29,600 characters (about 12,700 credits); the clip-end scan flagged 24 at 0.15 or over (all Samir's but two), re-voiced (about 1,300 characters with a second take for two), now all under 0.15. With the try-out, about 14,700 of the 17,000 spent; about 2,300 left until 10 November. **Next:** the longer show (the episode reworked: THE DAY's hooks, three discussions, the day's goals, the break, PICKS), then the booth.

**The longer episode (2026-10-20, built):** three talks around the day's goals and an ad break (`podcastTalk.js` `parts`; `programme.js` `podcastPieces`): (1) the opening, SEASON AHEAD's or REVIEW's lead, THE DAY (every hook that's true, in turn: the table, the hot take, the money, the archives, the kids, the vote; DID YOU SEE THAT?'s single goal gave way to the reel), the first discussion, "Let's look at the day's goals"; the day's goals, a reel of the day's matches (scorchers first, `settings.podcast.reelClips` 10 at most; the night after the final, the semifinals' and the final's); (2) "And that's the day's goals", "We'll be right back"; the ad break (OFF THE BALL's own, counting as the gap's); (3) "Welcome back", the second and third discussions each brought in by whoever opens it, PICKS, the close. Three themes an episode (`settings.podcast.discussions`), dealt from the schedule so none comes twice in an episode. **About 8½ minutes** (talk 1 about 2½, the goals about 2, the break ½, talk 3 about 3). The pair's reactions over each goal come with the booth (4c). Two trade-offs found by the tests: one or two of a season's first 40 matches now get one re-air instead of two (the episode takes a re-air's place twice a day), and on the night after the final the playoffs' reels go round once, not twice (SEASON REVIEW, twice, takes about 18 minutes of the filler).

**The build, step 4c (2026-10-21): the booth.** `src/channel/podcastBooth.js` draws set B4 in the scene's place (over the ground in Full, the whole screen in Broadcast; laid out from the rect as set B is): the window's three panes over the ground of the day (the next match's home pitch, lit by the time of day), the neon name on its plate, the pair at the counter with their mics and Tamsin's mug. During a topic the side panes frost and the middle pane is the screen: THE TABLE's lines show the table with that day's moves, any other graphic a card (the show's first part its heading, e.g. a discussion's title); a line showing OFF THE BALL (the opening, the break, the close) clears the window. The day's goals play on the middle pane, following the ball, their scorer and match under it, no stings or captions (the reel is the scene's picture, `transitions.js`); as each goal goes in, the one whose turn it is reacts (`reelReactions`, voiced, in the bubble). The lower third says who's talking (OFF THE BALL · TAMSIN TREGARROW · FORMER KEEPER); the bubbles sit outward of the pair, clear of the screen. Checked on the dev server in Full and Broadcast. **Next (4d):** the interjections under the longer lines, the sound (a jingle into the show, the levels pane), the 18:00 premiere promoted (a promo card, the ticker); then Tom watches it, then the push.

**Tom's notes from watching the booth (2026-10-21), done:**
- **Their names** only at the start of the show, back from the break and at the close, each under their own sprite (`NAMED_LINES` in main.js; `.pod-name`); no show name in them (it's on the neon).
- **A beat between topics:** each new topic (a hook, a discussion, the goals, PICKS, the close) waits `settings.podcast.topicBeatSeconds` (1.5 s) before its first line (`beatMs` on a line, honoured by studio.js `timeLines`); the episode is about 9 minutes now. The screen **wipes** on behind an amber edge when its graphic changes (`wipeMs`, 0.5 s).
- **The screen only for real graphics:** THE TABLE (the table with the day's moves), THE MONEY's cap line (every payroll against the cap, the team named lit) and the archives' line (the Cups won, the team named lit); anything else (a heading, a line or two of facts, a discussion's title) goes in a lower third in front of the counter and the window stays clear over the ground.
- **Pointing inwards**, toward the screen.
- **Transitions:** the bumper after the show's own break says BACK TO OFF THE BALL; leaving the show for the studio (a talk, cards) the band comes down with OFF THE BALL · BACK TO THE STUDIO (`transitions.js` `backToStudio`); an ad break after it has its bumper, a match or a re-air its sweep.
- Not the podcast: the roars' cheers no longer use the whistles (small or big; the recipe kept), the small roars half plain, the big ones a third; recordings re-recorded.
- SCHEDULE: OFF THE BALL's time in amber, its name in white.

**The build, step 4d (2026-10-21):**
- **Interjections** played under the longer lines (a little under halfway through, never in the first second), at `settings.podcast.interjectionLevel` (0.45) of the voices' level, through the levels pane's Studio switch (all the show's voices are `speech`, which it silences).
- **The studio jingle opens each airing** (guide.js `studioJingle`), the first line waiting for it.
- **The premiere promoted** for `promoHours` (6) before 18:00: the big matches' poster card (`podcast_promo`, cards.js `podcastPromoCard`: OFF THE BALL stacked in the red column with TONIGHT 18:00 and the countdown; beside it tonight's three discussions and the pair) leading every studio block that isn't a big match's or the post-match show's (LATEST RESULTS still leads that), and a ticker item (TONIGHT 18:00 · OFF THE BALL EP 3, the episode numbered by the day of the season; Tom, 2026-10-21).
- **Tom's tweaks:** the repeat's time in SCHEDULE in the replays' blue (the premiere's in amber); through the day's goals the scorebug stays on the next live match and the side panel as it is in the studio (in-universe highlights, not the channel's).
- **Next:** Tom watches it on the dev server; then `npm run livecheck` and the push.
- **Fix (Tom, 2026-10-21):** the band BACK TO THE STUDIO covered the studio's first seconds, so its first line was never voiced (a desk line starting under a transition isn't, and is too late once it lifts). The whole band now plays in the show's last moments, the last talk kept quiet for it after its last line (podcastScript's outro); the studio starts clean (tested).
- **Tom's tweaks (2026-10-21):** through the day's goals the window behind shows the empty pitch, the match only on the screen (its own canvas); the band back to the studio comes down and shows its name in the show's last 2 seconds and lifts off onto the studio (it had lifted off the booth, then cut), gone before the studio's first line; **the interjections are off** (Tom: they sounded like a bug, the channel's voices otherwise taking turns; `interjectionShare` 0, the clips kept).
