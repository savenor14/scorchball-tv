# The Director (Milestone 5, It responds)

First draft, 2026-10-11, at It responds' hand-off (vision §8 and §12, item 5). It responds builds the Director **bare bones**: a proof of concept of the loop, so Tom can see it working before deciding more. This doc says what the Director is, how a decision travels from a proposal to the screen, and what it will be like once the channel is live. Details settle task by task (`docs/tasks.md`).

## 1. What it is

The Director is a layer between the league and its audience. It **watches** the league, **proposes** events and choices that fit the moment, and once a choice is approved, the choice is **applied** by changing the league's data. In It responds, Tom approves, standing in for an audience; real viewers vote in Milestone 6.

It never touches a match while it's played and never changes what has already aired. A decision always takes effect at a set point in the future (the next season, as a rule), and from then on the sim simply plays under it.

## 2. How a decision travels

1. **The Director reads the league.** A tool that runs on Tom's side (not in viewers' browsers): it rebuilds the league to now, as the channel does, and checks it against its watch list (§3). Out come **proposals**, each with its evidence ("goals per match have fallen three seasons running: 6.1, 5.8, 5.6") and an in-universe reason for the announcement ("The League lengthens the heat clock to bring back the goals").
2. **Tom decides on the Director's desk**, a page (served by the dev server, like the dev pages): each proposal with its evidence, approve or reject. An approval is written to the league's data files.
3. **The decision is data.** A dated entry: what changes, from when, the reason, and when it's announced. Rule changes already work this way (`data/ruleChanges.json`, Task 229b: each season's rules, logged as `rule_change`). New kinds (a legend's induction, a guest at the desk) get entries of their own.
4. **Every browser applies it.** The channel rebuilds the league from its seed **and its data files** on every load, so a decision in the files is a decision for every viewer, applied identically: the sim plays under it from its date, the event log records it, and the chronicle keeps it (a HISTORY landmark).
5. **Refined in Task 265 (Tom, 2026-10-11): upkeep is quiet.** A rule change from the watchers is never announced (viewers never see the numbers); only what changes the channel or how viewers take part is (§6). As first written: **It's announced, where anyone can see it at any time** (Tom, 2026-10-11): an **UPDATES** tab in the INFO pane (the League's announcements, newest first, each with its date and reason) and an item on the **ticker** for a while after it's announced; a studio card is only a second way (cards air for a small share of the day).

## 3. What the Director watches (first draft)

Bare bones in It responds: one or two watchers per kind of decision, simple thresholds, everything tunable in data.

- **Rule changes (the eras' first step):** a measure drifting out of its band for a few seasons running: goals per match, the scorcher share, burns per match. The proposal names the rule value to change (from the heat and shot values in `data/rules.json`), by how much, and from which season. Measured first with the balance tools, so a proposal never breaks a target.
- **Legend nominations** (backlog, Task 220): the rules in `data/chronicle.json` stay the floor (legends made automatically); the Director could nominate the borderline and the story-made, each with its reason, an approval a dated induction (Task 262 built the induction). **Not yet** (Tom, 2026-10-11): no "just missed" nominations until a good crop of legends has met the original bars; then look again.
- **A guest panellist** (perhaps, presentation only): a retired legend at the desk for a day.
- **Later, not in It responds:** expansion (two teams at a time, an expansion draft: a milestone of its own), trades, bigger teams, award picks, the final round's featured match (a vote in Milestone 6).

## 4. Once the channel is live

What changes is only *where* the files live and *who* decides.

- **Before the launch** (now): the league rebuilds from its seed on every load, so a decision dated in the past simply rewrites history to match; that's fine while nobody's watching.
- **After the launch** (5½): the channel is a static site. A decision reaches viewers when the updated data files are published to the host (as a code update is). From then on a decision must always be dated in the future, and every change to the sim's code must still rebuild old seasons identically, so new mechanics switch on only at a dated decision.
- **A rhythm** (to try): the Director runs after each season's final (perhaps daily for smaller things); Tom reviews the desk; approved decisions are published before the next season starts, announced on UPDATES and the ticker during the off-season, and in force from the new season's first match.
- **With Milestone 6** (a server, viewers with identities): proposals go to a vote instead of to Tom alone, with every viewer one vote (vision §8: money never buys more say); the result is written to the same data, so nothing else changes.

## 5. Rules (from vision §8)

- Curated options first: viewers (and Tom) choose between options the Director generates.
- No real-money betting, ever. Tips, if ever, are cosmetic or honorary.
- Viewer data never feeds the sim (vision §8's audience layer): only approved decisions do, and only as dated data.
- Every decision is in the event log, with its reason, so the record books keep each season's own rules and the chronicle can tell the story.

## 6. Decisions as data (Task 262)

Every decision is a dated entry in a data file, so every browser rebuilds the same league from its seed and the decisions (§2). Dates are a season and a day time in it, like the calendar's (`{ "season": 2, "at": "day 7 22:00" }`).

| Kind | Where | Takes effect | Logged |
|---|---|---|---|
| **Rule change** | `data/ruleChanges.json` (Task 229b) | at its `season`'s start | `rule_change`, right before `season_start` |
| **Legend's induction** | `data/decisions.json` (`kind: "induction"`, `playerId`) | at its `season`'s start | `induction` (the player its subject, `data` `{ id, reason }`), after the season's rule changes |
| **Poll's result** | `data/polls.json` (the poll's `result`: `announced`, `votes`) | it's news only | not logged (polls never feed the sim) |

- **Refined in Task 265 (Tom): rule changes are never announced** (the `announced` date on rule changes was taken out again); announcements are their own entries (`kind: "announcement"` in `data/decisions.json`: a date, a ticker headline, the words for UPDATES, perhaps a roadmap idea), plus each poll's opening and result, worked out from `data/polls.json`; channel.md §24. As first written: **Announced:** each has an `announced` date, no later than it takes effect (a poll's result no earlier than the poll closes). A rule change may leave it out: it's then announced as it takes effect (the rookie rule). The config checks every date.
- **Announcements are worked out, not logged:** `src/channel/announcements.js` (`announcementsAt`) lists what's been announced by a moment, newest first, from the three files; INFO's UPDATES and the ticker read it (Task 265). A poll's tally shows from its result's announcement, not before.
- **An induction** reaches the chronicle as the player's `inducted` (`{ season, id, reason }`) and the season's `inductions`; shown on screen from Task 266. Whether the player exists can't be checked without playing the league: the Director's desk only offers real players (Task 264), and the chronicle skips one it doesn't know.
- **Nothing played changes:** an induction is logged beside the rule changes and touches no randomness, so a league plays exactly as before with it (only the sequence numbers after it move up by one; `tests/decisions.test.js`).
- **The rhythm** (§4): a decision approved after a season's final is announced that night or during the off-season and takes effect at the next season's start.

## 7. The watchers (Task 263; `npm run director`, `src/director/watchers.js`, `data/director.json`)

`npm run director -- [--at <date-time>] [--seed S] [--override '{...}'] [--no-check]` rebuilds the live league to its last finished season at a moment (a season is finished once its off-season show has aired), with the same sim, seed and data the channel uses, so the same league (about 2 s for 25 seasons). It writes `output/director/proposals.json` for the desk (Task 264) and prints the last five seasons' measures and each proposal.

**Measured first (2026-10-11, 240 seasons):**

| Measure | Typical | 90% of seasons | 3-season averages | Moved by |
|---|---|---|---|---|
| Goals per match | 7.0 | 5.4–8.4 | 5.7–7.9 | the save bias (`contests.save.bias`): 0.46 goals a 0.1 step, nothing else |
| Scorcher share | 25% | 22–29% | 23–27% | the heat clock (`heat.burnSeconds`): 1.3 points and 0.4 burns a second; 2 s faster breaks the burns target |
| Burns per match | 3.5 | 3.1–3.9 | 3.3–3.8 | the heat clock (not watched: it barely drifts) |

Goals drift with the league's age as squads turn over; the scorcher share and burns hardly move unless a rule does. Hot power and accuracy barely move anything.

**The watch list** (Tom, 2026-10-11: drift is the league's own direction; the Director only proposes when a measure stays well out, and Tom can always reject):
- **Goals per match, 6.2–7.8:** three finished seasons in a row outside on one side (all played with the save bias at today's value) propose moving it enough 0.1 steps to aim back at 7.0, at most two. About one proposal every 24 seasons (5–6 months live); on today's seed the first after season 36.
- **The scorcher share, 23–28%** (a guard): the heat clock one second, aiming at 25.5%. It fired once in 240 measured seasons, but on today's seed after season 9 (22.2%, 21.5%, 20.5%).
- **No proposal** while a change to the lever is already on its way. Each proposal is the entry the desk would write to `data/ruleChanges.json` (`director_goals_s37`, in force the next season, announced the night after this season's final at `announceAt`, or the next quarter hour once that's passed), with its evidence (the seasons and values) and the measure aimed at.
- **The balance check** (`check`: 5 leagues × 30 seasons, as `npm run balance`; about 16 s a proposal): the change fails only if it breaks a target the unchanged league meets, since some (the titles, rating drift at its edge) wobble on their own. 3 × 20 was too short: careers and rating drift swung on noise.
- **Poll results:** each poll closed without a result gets one proposed, its votes counted from `output/audience/votes.jsonl` (only its options), announced from now.
- **Not here:** legend nominations (§3, not yet); a rejected proposal remembered, so it isn't proposed again the next season (the desk, Task 264).
- `--override` (deep-merged into the config, like `npm run balance`) tries a tighter band or another lever, to see a proposal without waiting for the league to drift.

## 8. The Director's desk (Task 264; `director.html`, `src/director/deskPage.js`, `src/cli/directorDesk.js`)

Tom's page on the dev server (http://localhost:8080/director.html), never published (`docs/live.md` §6). Its endpoints (`/api/director/state`, `run`, `approve`, `reject`, `note`) answer only requests carrying the `x-director` header, which a page from another site can't send, so nothing else on the computer can approve.

- **RUN THE DIRECTOR** runs `npm run director` in its own process (the server keeps serving the channel meanwhile; up to half a minute with a rule change to check), now or at a date-time typed beside it.
- **PROPOSALS:** the last finished seasons' measures, then each proposal. A rule change shows its seasons (the ones out of band in red), the change (the rule, from and to, the season, the aim), when it's announced, the balance check, and **why** (the watcher's reason, editable, kept with the change; never announced, Task 265). A poll's result shows its tally. **APPROVE** writes the entry to its data file (`data/ruleChanges.json`, or the poll's `result` in `data/polls.json`) only if the whole config still validates with it, then takes it off the list: Tom commits and publishes. **REJECT** (with a note) keeps it in `data/rejections.json`.
- **Rejections** (Tom, 2026-10-11): a rejected rule change **silences its watcher until its measure has come back inside the band at least once** (`silenced` in `watchers.js`); three more seasons out would trip it again. A rejected poll result is never proposed again. `data/rejections.json` is committed, so the history stays with the league.
- **POLLS:** every poll, upcoming, open or closed, with its running tally from `output/audience/votes.jsonl` (Tom's eyes only; viewers see nothing until the result is announced).
- **FEEDBACK:** the notes newest first, each with its time and the line sent with it; mark read, tag BUG or IDEA (kept in `output/audience/notes-state.json`); show unread only.
- **VIEWERS** (Task 277e, Tom): counted from the channel's hellos (`src/director/viewers.js`; `docs/live.md` §7), the live site's (from the audience service with the desk's token) and this dev server's apart: watching now (heard within `audience.watchingMinutes`, 15), this week's unique viewers and visits, a typical visit (the median, to its last hello, so up to ten minutes short: "at least"), and each of the last seven days in the league's time zone, a visit on the day it began. A viewer is a connection (a household on one network is one). The tab's label shows how many are watching now. Never on the channel. **Tom left out** (Task 278, Tom: his watching all day would skew a typical visit): under the live figures, WHO WATCHED THIS WEEK lists each viewer's tag, most watched first (visits, time watched, last heard, "now"), with THAT'S ME; a marked tag is left out of every live figure (his household with it), kept in `output/audience/viewers-state.json` on his computer only; a new address means marking the new tag.
- **TODAY** (getting the word out, 2026-10-22; `docs/launch-plan.md`): the league's daily post for Bluesky, for Tom to edit, COPY and post: a finished day's heading, results, one standout (a golden goal, a shootout, the champions, a five-goal haul; else the biggest win or the day's scorchers), the top of the table and `scorchball.tv/?from=bsky`, within 300 characters (too long, the table goes, then the results from the end, "+N more"); with the day's best moment for a clip, opening `clips.html` at it. Built by `src/director/dailyPost.js` from the live league rebuilt on the dev server (`todayPosts` in `directorDesk.js`, `GET /api/director/today`); **a day appears only once its last match is over by the real clock** (the day keys are out 12 hours ahead). This season's days and last season's. **With its picture** (Tom's pick D of four mock-ups, 2026-10-22; `src/director/shareCard.js`): 1200 × 675 in the channel's art, the whole table, the day's results, the champions on the final's day and a **player of the day** (`potm.js` `playerOfTheDay`: each player's player-of-the-match scores added up over the day, a seeded tie-break; not logged), DOWNLOAD as a PNG; the post's text then short (the day in a line, the player of the day, the standout unless it's theirs, the link), and **the picture's alt text** the whole day for COPY ALT. Not posted by itself yet.
- **REJECTIONS:** the history, newest first (when, after which season, the proposal, what it was, the note), and how often each watcher has been rejected.

## 9. Growth and the roadmap (Tom, 2026-10-11; built in Task 265b, 2026-10-11)

The watchers (§7) are **upkeep**: a dial nudged back when a measure stays well out. **Growth** is different: expansion, an extra player per side, the world view, later team identities and eras, divisions. No rule value turns them on. Each:
- **needs building first:** a mini-milestone with Claude Code (hand-off, mock-ups, the sim and the picture), shipped dormant and switched on at a season's start after the launch (`docs/live.md`), tested against the real live league by jumping ahead with `?at=`;
- **needs a long run-up:** announced a season or more ahead, not the night before;
- **is a story told in steps:** announced (UPDATES, the ticker), voted on (the AUDIENCE pane's polls: a city, a name, a kit), its own show where it has one (an expansion draft), then switched on everywhere at once.

**No timeline** (Tom): growth comes down to feel: the channel going stale, Tom's inspiration to dig into an idea, or viewers' notes and votes pointing one way. The Director never says an idea is due; it keeps the ideas in view with the evidence behind each.

**The roadmap** (`data/roadmap.json`, the desk's ROADMAP tab, Task 265b): each idea with what it is, what must be true first, its status (idea, considering, planned, building, done) and Tom's notes; beside it, for judging the feel, how many seasons have been played and how long since the last big change (information, not a deadline); and the viewers' notes Tom has linked to it from FEEDBACK ("12 notes point this way"), later polls too. Picking one up makes it a milestone, as now. The first three (a fourth, **a guest panellist**, moved from Task 267, Tom 2026-10-11): **expansion** (vision §5: two teams at a time, an expansion draft, two divisions once there are enough), **an extra player per side** (`docs/backlog.md`: a sixth on the pitch, bigger squads; worth weighing with expansion, both "the league grows"), **the world view** (`docs/backlog.md`, Worldbuilding: a map of the world and its grounds in the centre).

**Built (Task 265b):** `data/roadmap.json` (read by the desk only, checked in `src/cli/directorDesk.js`; notes left out when empty) holds the three ideas. The desk's **ROADMAP** tab shows the seasons played and since the last idea marked done, then each idea: its status (a pick-list, saved at once; marked done it keeps the last finished season as `doneSeason`, moved off done it loses it), what it is, what it needs, the viewers' notes linked to it ("3 notes point this way", each listed) and the announcements already made for it (`roadmap` on a `kind: "announcement"` decision), and Tom's notes (SAVE NOTES). In **FEEDBACK** each note has a "link to an idea…" pick-list (kept in `output/audience/notes-state.json`). Changes to `data/roadmap.json` are committed like any data.
