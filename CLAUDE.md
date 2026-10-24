# CLAUDE.md

## Project
An always-on fictional sports league: an invented, soccer-based sport simulated 24/7 and presented as a pixel-art live sports channel, with a permanent chronicle and audience votes that nudge the league. Read `docs/vision.md` for the full picture before making product decisions.

## Working rules
- **Always confirm with Tom before pushing code.** Never push or add remotes without asking.
- Propose a plan before any change that touches more than a couple of files, and wait for approval.
- If a doc is unclear or silent, ask clarifying questions instead of guessing.
- Work through tasks in `docs/tasks.md` one at a time. Tom decides when to start a new session, usually once the context window is around half full, so it's fine to carry on to the next task in the same session.
- **Pause after every task** (Tom, 2026-10-05), even when told to do several: once a task is committed, stop and report what was done, then outline the plan for the next task, and wait for Tom's go-ahead. Running several tasks in one go risks the context window and usage limits, and Tom may want to tweak things in between.
- If a decision changes the vision, update `docs/vision.md` first, then the detailed docs.

## Folder structure
```
worker/               the audience service: a Cloudflare Worker (audience.js; coins.js, Fan Coins) on scorchball.tv/api/audience/*
                      with a D1 database (migrations/); deployed by npm run worker; never published with the site
.github/workflows/    daykeys.yml: the daily job, tomorrow's day key and a season's snapshot from the SCORCHBALL_SEED secret
config/settings.json  real-time timing, pacing, calendar, the live league's seed/start/time zone, every presentation setting
data/                 the league: teams, regions/name pools, rules.json (season 1's rules) and ruleChanges.json (rules by
                      season), positions.json, decisions.json; the channel's words and pictures: commentary, studio (the
                      desk), interviews, spots (ads), rulebook, chronicle, moments, tour, fanCoins, analyst, podcast; the
                      Director's: polls, director, rejections, roadmap
src/config.js         loads + validates config/ and data/ files (the schemas live here)
src/pack.js           JSON packing that keeps Maps, Sets, shared and frozen objects (snapshots)
src/schema.js, util.js  the small JSON validator; shared helpers (withoutComments, sum, clamp)
src/sim/              the engine, no DOM: rng, streams (a seed or the day keys), match, season, players, draft, awards, rules
                      (by season), finances, fmath (maths alike in every browser), leagueCheck (a league's fingerprint)
src/chronicle/        event log, the chronicle (folded from the log), record books, the facts (what's notable)
src/cli/              the dev server (serve.js, with localD1.js for Fan Coins), ff, balance, parity, director, daykey,
                      livecheck, publish, voices, rundown and the other counts below
src/director/         the Director: watchers.js (measures and proposals), deskPage.js (the desk's script)
src/channel/          the channel: pure logic and canvas drawing; overlays/ the DOM panes and cards; *Sheet.js the dev pages'
index.html            the channel (npm run channel); manifest.webmanifest, Add to Home Screen
check.html            the every-browser check, published: a throwaway league's fingerprint against Node's check.json
about.html            the About page at /about, published (plain HTML for search and link previews; pictures in assets/about/);
                      how-it-was-built.html the write-up beside it (Tom's words; both style from assets/page.css); robots.txt, sitemap.xml
public/               the public copy's own README and LICENSE (MIT), for npm run public
director.html         the Director's desk (dev server only, never published)
tests/                node:test files
assets/               icon/, fonts (VT323 + OFL licence), sounds/ (every synthesized sound recorded ahead, index.json),
                      voices/ (MP3 clips; lengths.json, the clip lengths talk is timed by)
output/               run results (gitignored); output/before/ is colours.html's copy from before the colour changes
keys/, snapshots/     the day keys (keys/s<season>d<day>.json) and each season's snapshot, made by npm run daykey
dist/                 what the host serves, copied by npm run publish (gitignored)
docs/                 design docs (see the doc map)
```
**Dev pages** (dev server only, never published): `kits.html` (every kit and matchup, `?clash=N`), `sounds.html` (the sound board and voice grids), `recordings.html` (record the synthesized sounds), `clipends.html` (voice clips cut off at the end), `teamvoices.html` (every desk clip naming a team, `?team=`), `pitchmap.html` (the motion against its targets), `interviews.html` and `desklines.html` (how often each line is heard), `rulebook.html` (the Rulebook and About, screens per page), `ads.html` (the ident, ads, bumpers, stills), `podcast.html` (OFF THE BALL's lines, clips and cost), `analyst.html` (the playoff analyst's), `kofi.html` (Ko-fi's pictures), `og.html` (the link picture), `colours.html` (the colour changes, before and after), `clips.html` (the vertical camera: the real channel in a tall frame following the ball, the score and caption in bands, for OBS to record; two zooms, arrows nudge, K keeps still, F follows, X hides the controls (clear of the channel's own keys); `src/channel/followCam.js`). The mock-up pages whose picks shipped were retired on 2026-10-21: `docs/history.md` lists them and how to bring one back. A new mock-up page is fine; it goes once its pick ships.

## Doc map
| Doc | Read it when… |
|---|---|
| `docs/vision.md` | Grounding any decision: pillars, scope, milestones |
| `docs/tasks.md` | What's next: the launch plan's remaining tools (the SEO basics, the write-up and the public copy) and the list before sharing (hand-off 2026-10-23); before it, the final QA (done) |
| `docs/live.md` | Working on anything live: presentation vs outcome changes, publishing, the version check, day keys and snapshots, the history check, hosting, the soft launch (§8) |
| `docs/channel.md` | Working on what the channel shows and plays: screen layout, the calendar and programme, sound and voices, Broadcast, between matches (§16), the off-season (§19), the chronicle on screen (§20), money (§21), momentum (§22), AUDIENCE (§23), announcements (§24), MOMENTS (§25), the tour (§26), phones (§28), Fan Coins (§29), the big matches and previews (§30), the light (§31), AROUND THE GROUNDS (§32), FROM THE VAULT (§33), OFF THE BALL (§34) |
| `docs/colours.md` | Working on colours: each one's role (amber the highlight and honours, gold Fan Coins alone, red live, blue replays, white names, grey secondary) |
| `docs/sport.md` | Working on match rules, positions, scoring, the twist |
| `docs/simulation.md` | Working on the engine, ratings, development, draft, the event format, the balance targets (§10), the facts module (§12c) |
| `docs/finances.md` | Working on the rookie rule, wages, the cap, contracts, motives, free agency |
| `docs/director.md` | Working on the Director: decisions as data, the watchers, the desk (its TODAY tab: the daily Bluesky post, its picture and alt text), the roadmap, the weekly rhythm |
| `docs/podcast.md` | Working on OFF THE BALL: the pair, the topics, the lines and voices |
| `docs/moments.md` | Explaining MOMENTS in plain words: how each moment and secret is earned (spoilers) |
| `docs/studio-cards.md` | Working on the studio cards: the decks by phase |
| `docs/roadmap.md` | Planning what comes after the sharing: each update by month, what it needs, its ElevenLabs cost (121,000 credits a month from 10 November), its steps |
| `docs/launch-plan.md` | Getting the word out: the angles, where each audience is and its rules, the calendar from 9 November, the tools it needs |
| `docs/backlog.md` | Planning: what's open, grouped by milestone, and what was dropped |
| `docs/cleanup.md` | Background on the final QA's code clean-up: what was removed and kept, the type check |
| `docs/rehearsal-summary.md` | Background on everything from the launch's groundwork to FAN BOARD (2026-10-11 to 2026-10-21): the dress rehearsal, MOMENTS, the tour, phones, Fan Coins, the security pass, donations, the previews, the new segments, OFF THE BALL; the hand-offs as written in `docs/rehearsal-tasks.md` |
| `docs/*-summary.md`, `docs/*-tasks.md` | Background on an earlier milestone, what it built and why (Milestones 1 and 2, Match day, Stadium and sound, Gameplay pass 2, Between matches, Polish, Sound, Touch-ups, Ad break, Groundwork, Sim, Fixes, the off-season show, It remembers, Parity and finances, Momentum, Talk that remembers, It responds); `docs/stats-check.md` the league's numbers |
| `docs/history.md` | The project's status milestone by milestone as it stood on 2026-10-21, and the retired dev pages |

## Status
Every milestone through **OFF THE BALL** (the podcast) and **FAN BOARD** is built and live on scorchball.tv (the story: `docs/history.md` and the summaries). **The dress rehearsal became the soft launch** (Tom, 2026-10-21): the live league is the rehearsal's own secret seed, season 1 from 2026-10-12, results fixed by the day keys since 2026-10-19; the address is shared from **season 5, Monday 9 November**, and polls wait for it (`docs/live.md` §8). **Now: the final QA before sharing** (`docs/tasks.md`): when to launch, colour alignment, the code clean-up the internal roadmap (`docs/roadmap.md`) and getting the word out (`docs/launch-plan.md`) are planned and done; of the plan's tools, the ?from= count, the clip tool (the vertical camera) and the Director's TODAY tab (the daily Bluesky post and its picture) are built; next, the SEO basics, the write-up and the public copy, and the list before sharing (`docs/tasks.md`, hand-off 2026-10-23). ElevenLabs is at its limit until 10 November. Decided long ago and still true: Canvas 2D plus HTML/CSS overlays (no Phaser), regular-season matches one at a time, no build step, and the browser rebuilds the league from the latest snapshot and the day keys.

## Tech
- Plain JavaScript, ES modules, JSDoc for types. No build step. Node 24 for headless runs; the same modules must also run in the browser.
- Prefer zero dependencies; ask before adding one. So far, dev dependencies only, never shipped to viewers: `kokoro-js` (voice try-outs, Task 122) and `ffmpeg-static` (compressing voice clips to MP3, Task 136).

## Core technical rules
- **Data, not code.** Teams, players, rule values and season structure live in data files. The engine applies general rules to them.
- **All real-time timing in `config/settings.json`** (match playback length, gaps, calendar, segments). Sport and engine values, including game-clock lengths, go in `data/rules.json`. No hard-coded tunable numbers in code.
- **Simulation separate from visuals.** `src/sim` and `src/chronicle` never import from `src/channel` or touch the DOM. Visuals only illustrate what the sim already decided.
- **Adding or renaming a config value** means updating its schema in `src/config.js` too. Unknown keys are rejected (to catch typos). Keys starting with `_` are comments.
- **Seeded randomness only.** All randomness comes from the seeded RNG module, never `Math.random`. Same seed gives the same league.
- **Every meaningful event goes in the event log**, in the one consistent record format defined in `docs/simulation.md`.
- Matches are simulated by possession phases, not physics.

## Testing
- Tom's terminal is Windows PowerShell, which blocks `npm.ps1`. In instructions for Tom, write `npm.cmd …` or `node …`.
- `npm test` runs the unit tests (built-in `node:test`, files are `tests/**/*.test.js`).
- `npm run ff -- --seasons N --seed S [--quiet] [--no-events]` fast-forwards N seasons. It's a dev tool; the live league uses the same engine.
  - It prints each season's table, playoffs, honours and leaders, then an honours summary. `--quiet` prints one line per season.
  - It writes `output/ff-<seed>/events.jsonl` and `summary.json`, overwriting earlier runs with the same seed.
- `npm run livecheck [-- --through <date|today|tomorrow>]` checks that this code makes every published day key and snapshot exactly as published, and runs the history check, in under a second; run it before every push (Git habits).
- `npm run daykey -- --through <YYYY-MM-DD|today|tomorrow> [--out dir] [--force]` writes the day keys and the season snapshots (never rewriting a published one that would come out different; `--force` for a dev league only), the day keys from `SCORCHBALL_SEED` (environment or `.env`; never in the repo or printed) into `keys/` (Task 271, docs/live.md §5). The channel plays from them when `live.mode` is `"keys"` in settings (`"seed"`, the dev league, until the dress rehearsal); `?seed=` plays a seed instead.
- After changing a sound's recipe (`soundRecipes.js`, `musicRecipes.js`) or the sound settings it depends on, open http://localhost:8080/recordings.html and RECORD MISSING AND STALE (the tests fail on a stale recording), then commit `assets/sounds/`. The dev server must have been restarted after any change to `src/channel/recordings.js`.
- `npm run worker` deploys the audience service (Wrangler, Tom's login; `worker/wrangler.jsonc`). Its secrets are set with `npx wrangler secret put`, never in the repo; the desk's `AUDIENCE_TOKEN` is in `.env` (never print it).
- `npm run publish` also writes `version.json` (the channel's update check, Task 274) and `_headers` (caching: voices and font a day, the rest checked each load; from the security pass, on every page a content security policy (enforced from 2026-10-17), `X-Frame-Options: DENY`, `nosniff`, a referrer and a permissions policy, HSTS). It first runs the history check when there are keys (every published day played again with this code must match its fingerprints, or it stops; `src/cli/historyCheck.js`), then copies what the channel needs into `dist/` for Cloudflare Pages (no dev pages, no desk; of `src/`, only the scripts the published pages load, from `ENTRY_SCRIPTS`; checks the host's file limits, and stops if any value from `.env` or the secrets in the environment is in a published file, naming it, never printing it); `npm run channel -- --port 8090 --root dist` serves it as the host will, `_headers` included (Task 269, docs/live.md §7).
- `npm run channel [-- --port 8080]` serves the channel at http://localhost:8080/ (needed because ES modules don't load from `file://`). `.claude/launch.json` lets Claude's browser pane start it.
  - http://localhost:8080/kits.html is the kit review sheet (every team and matchup, `?clash=N`).
  - `?moments=reset` starts this browser's MOMENTS afresh, `?moments=demo` fills in a viewer about two weeks in (docs/channel.md §25).
  - `?coins=reset` starts this browser's Fan Coins afresh, `?coins=rich` gives 500 to spend (docs/channel.md §29; version 1, `fanCoins.enabled`).
  - Fan Coins version 2's calls (`/api/audience/coins/*`) are answered by the audience service's own code over `output/audience/coins.db` (delete it to start afresh; docs/channel.md §29.6).
  - It also takes the AUDIENCE pane's votes and notes (`POST /api/audience/vote`, `/note`) into `output/audience/`, beside the hosted service the live site uses (docs/channel.md §23), and serves the Director's desk (http://localhost:8080/director.html, docs/director.md §8). Restart it after server changes (src/cli/serve.js, directorDesk.js).
- JSDoc types are checked in the editor via `jsconfig.json` (`checkJs`).
- `npm run rundown [-- --day 2 --season 1 --seed S --all]` prints a day's running order between and around matches with start times, lengths and the day's totals (match share, ads); under a second. See `docs/channel.md` §16.14.
- `npm run director [-- --at <date-time> --seed S --override '{...}' --no-check]` rebuilds the live league to its last finished season and proposes rule changes (a measure out of its band three seasons running, checked against the balance targets) and closed polls' results, into `output/director/proposals.json` (about 2 s, plus 16 s a rule change checked). See `docs/director.md` §7.
- `npm run parity [-- --seasons 40 --leagues 5 --seed parity --override '{...}']` checks the long-view parity targets over 40 seasons (Cups, droughts, bottom-half runs, moves, two-club careers) beside a pure-luck league (about 12 s). See `docs/simulation.md` §10b.
- `npm run facts [-- --seasons 20 --seed facts --samples 2]` counts how often each of the facts module's facts turns up after and before a match (about 2 s for 20 seasons), to size the desk's and interview's lines. See `docs/simulation.md` §12c.
- `npm run talk [-- --season 2 --seed S --json]` counts how often each kind of desk line is said a day over a season of the programme, with its ways (about 2 s). See `docs/channel.md` §18.16.
- `npm run repeats [-- --season 2 --seed S --voice desk|commentary|interview --top 40 --json]` ranks every voiced line (the commentators, the desk, the interview) by how soon it's heard again over a season of the programme (about 2 s). See `docs/channel.md` §18.18.
- `npm run coins [-- --from 2 --seasons 2 --seed S --hours 1,3,24 --studio 2,5,10 --samples 40 --json]` splits the air by what earns Fan Coins and counts a day's coins for a viewer watching an hour, a few hours or all day, at a few studio rates (about 3 s). See `docs/tasks.md` (Fan Coins, step 1).
- `npm run moments [-- --from 2 --seasons 4 --seed S --hours 2 --json]` counts each kind of MOMENTS (and the secret candidates) as aired live over some seasons of the programme, with hours of watching to the first and days to each step at a few hours a day (about 2 s a season). See `docs/tasks.md` (MOMENTS, the plan).
- `npm run clip -- --list` lists the moments worth a clip from what has aired (golden goals, shootouts, the final's last goal, five-goal hauls, scorchers) into `output/clips/moments.json` for `clips.html`; `npm run clip -- <file.webm> [--tall] [--title "…
…"] [--trim 1]` makes a recording a wide (1920 × 1080) or tall (1080 × 1920, the title above, SCORCHBALL.TV below) MP4 with ffmpeg-static (`docs/launch-plan.md`).
- `npm run pitchmap [-- --matches 12 --seed baseline --override '{"settings":{"play":{...}}}']` measures the channel's motion (width, corner areas, the tether gap) against the targets in `docs/channel.md` §15.2 (about 5 s); `pitchmap.html` shows the same with heat maps.
- `npm run balance [-- --seasons 30 --leagues 5 --override '{"rules":{...}}']` checks every balance target (about 8 s). Run it after any change to `data/rules.json`, `data/positions.json` or the engine. Targets and current results are in `docs/simulation.md` §10.
- `npm run voices [-- --assets]` speaks the commentary lines with Kokoro: without `--assets`, the audition clips (Kokoro and Piper, from `C:\Users\Tom\tools\piper\`) into `output/voices/` for the sound board; with it, the commentators' clips into `assets/voices/` (docs/channel.md §18). `--desk --interviews [--count] --paid` makes the desk's and the interview's clips (Task 135; with Talk that remembers' reactions, fact sentences and surname lines); `--names` the commentators' calls naming the scorer (Task 247b). `--try <kokoro voice>` and `--try-11 <ElevenLabs voices>` try voices as commentators on the sound board; ElevenLabs needs `ELEVENLABS_API_KEY` in `.env` (Tom's, gitignored; never print it).
- `npm run public -- [--out ../scorchball-tv] [--email <id>+savenor14@users.noreply.github.com] [--dry]` refreshes the public copy (Tom's pick A, MIT): the files at HEAD from the allowlist in `src/cli/publicCopy.js` (no internal docs, no `moments.md`, no voice clips, no daily job), `public/`'s README and LICENSE, one commit in that folder's own repo as the no-reply address only; stops on uncommitted files, a secret from `.env`, or an email address. Never pushes. A new doc or page that should stay private needs no change; one that should be public goes on the allowlist.
- After sim changes, also check that the same seed reproduces identical results (the tests cover this).

## Git habits
- Commit after each working step with a clear message.
- Never push without Tom's confirmation.
- **Before every push, run `npm run livecheck` and don't push if it fails** (2026-10-19). It runs the daily job's own check here (tomorrow's day key and the season's snapshot made from `SCORCHBALL_SEED` in `.env`, compared with the published ones, nothing written) and the history check. The job runs in the cloud after a push and refuses to rewrite published history; a refused run means no new day key and BACK SOON on the channel (it happened once: the grounds' names changed the snapshot's text). Data only the channel shows stays out of the league: list such team fields in `src/sim/league.js` `CHANNEL_ONLY` (docs/live.md §5).
- The remote is a private GitHub repo; Cloudflare Pages deploys `main` on every push, and the daily job commits the day keys to it (docs/live.md §7).
