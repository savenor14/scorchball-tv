# Vision Doc — Always-On Sim League (working title)

> **Status:** First draft for review. Anything marked **[Default]** is a placeholder assumption to confirm or change before building. Anything marked **[Open]** is undecided.

---

## 1. How to use this document

This is the top-level vision doc for the project. It explains *what* we're making and *why*, at a level that rarely changes. It is not a build spec. More detailed docs (the sport's rules, the simulation spec, the channel spec, the milestone task list) will be written separately and will sit alongside this one in the `docs/` folder.

Claude Code will read this file at the start of the project and refer back to it whenever a decision needs grounding. If something here changes, update this file first, then the detailed docs.

---

## 2. The pitch

A fictional sports league that never stops. An invented, soccer-based sport plays out 24/7 in pixel art: matches, standings, transfers, drafts, awards, retirements, and a growing history that remembers everything. It's presented as a live sports channel, with a featured match on screen, scores from other games ticking along, and programming between matches.

People can drop in and simply watch, click into any team or player to read their story, or nudge the league's direction through votes. Over weeks and months, the league builds a real history: dynasties, rivalries, legends, and record books that no one scripted.

**Inspiration:** PNN (Pixel News Network) proved that an always-on, AI-assisted, pixel-art "channel" can be compelling. This project borrows the always-on channel format but builds it on a simulation rather than on news.

---

## 3. Pillars

These five ideas define the project. If a feature doesn't serve at least one of them, it probably doesn't belong.

1. **Always on.** The league runs continuously whether or not anyone is watching. There is always something happening or about to happen. **North star (Tom, 2026-10-03): tune in at any random time of day and a match is more likely to be playing than not.** Matches stay spread around the clock, because viewers live in every time zone.
2. **A league, presented as a channel.** The simulation and the broadcast are separate. The league plays every match; the channel decides what to show.
3. **History that never forgets.** Every result, goal, transfer, and retirement is recorded permanently. The chronicle is a core pillar, not an add-on.
4. **The audience can nudge, not control.** Viewers vote on choices the system offers. They shape the story without breaking it.
5. **Fictional and original.** Invented sport, invented teams, invented players. No real leagues, teams, or people.

---

## 4. The sport

The sport is invented but built on a soccer foundation, chosen for its global feel, continuous flowing action, and readable visuals.

**What it keeps from soccer**

- A bright pitch with a goal at each end
- Continuous, flowing play
- Two teams in distinct, colourful kits

**What it changes**

- **Higher scoring.** Target roughly **5–8 scoring events per match** **[Default]**, closer to handball or water polo than to soccer. Frequent enough that a drop-in viewer sees something happen; rare enough that every score matters.
- **A signature twist: the heat ball.** The ball heats up the longer one team holds it. At red, that team must shoot or lose possession (a "burn"). This gives the sport its own identity and gives commentators something unique to talk about. Full rules are in `docs/sport.md`.
- **5-a-side on a walled pitch,** so play keeps flowing.

**What viewers need to know:** Nothing beyond what's on screen. Who has the ball, where it is, and who's winning. There is no rulebook to learn.

**What the simulation needs to know:** A small set of exact rules, defined in a separate `docs/sport.md`. At minimum: the field, how possession changes, how scoring works, match length, and player roles.

**Player roles:** Four positions (Keeper, Defender, Midfielder, Striker) with distinct ratings, so that players feel different and stars have something to be great at. Defined in `docs/sport.md`.

---

## 5. The league

- **Teams:** 8 **[Default]**, each with a name, home city, colours, kit, crest, and personality.
- **Format:** Double round-robin. Each team plays every other team home and away, for 14 rounds of 4 matches **[Default]**.
- **Season finale:** Top-4 playoffs on day 7. The playoff winner is League Champion and lifts the Scorch Cup; the regular-season table winner takes that season's Pennant (Tom, 2026-10-07; it was the Shield).
- **Setting:** An invented world, with fictional cities and countries. No real places.
- **Players:** Each player has ratings, a position, an age, a career history, and personal records. Players are drafted young, develop, peak, decline, and retire.
- **Renewal:** A draft brings new young players into the league each off-season, so the league is always refreshing itself.
- **Expansion:** New teams can join over time, potentially chosen by viewer vote. A second division of 8 is the likely way to grow, as an in-world story later (Tom, 2026-10-03). Its live matches would take over some of the re-air slots (§6), so the season keeps its shape.
  - **No reset needed, but it's a dated change:** until the server (Milestone 6), every browser rebuilds the league from its seed, so new teams must be written as "from season N, these teams join". Earlier seasons then rebuild exactly as they happened. Applying that kind of change is the Director's job (Milestone 5).
  - **How (Tom, 2026-10-08, the ideation session):** a Director event, after the launch; **two teams at a time** (the league stays even); they get players through an **expansion draft** (each team protects a list and loses a player), sized so it doesn't dilute the league too much (the Kindling League's reserves could be part of the pool); **two divisions** once there are enough teams. Names kept for reference, each with a city or place before it: **X Swords**, **X United**, **X Aero** (perhaps from a region in the sky). The schedule, the playoffs, the screen (ticker, table, picker), the ads (three brands per region) and the balance targets all assume 8 teams today, and every team-named voice line needs clips for each new team: a small milestone of its own.

---

## 6. The season calendar

A season lasts **one real-world week** **[Default]**. This is a first attempt; the right pace will only become clear by watching, so all timing values must be easy to change (see Section 10).

| Period | What happens |
|---|---|
| Days 1–6 | Regular season. Matches play **one at a time**, spread evenly around the clock (roughly one every 2h40m), so every match is shown live. Each live match has an **hour slot** around it; **full re-airs** of earlier matches fill the time until the next one. |
| Final round | All matches kick off at the same time, so the last day's races play out together. (The table itself only updates at full time: Tom decided against live tables, 2026-10-03.) |
| Day 7 | Playoffs, then the awards show, retirements, Hall of Fame inductions, the draft, and votes for next season. |

**Season shape (decided 2026-10-03, Tom): live matches plus full re-airs.** The season stays a week with the same 56 matches.
- **Match length: about 20 minutes** of real time (two 10-minute halves). The game clock pauses for goals and substitutions, a few seconds each, for the celebration or the sub coming on. The sim is unchanged; only the playback is faster than the 60 minutes tried in Milestone 2.
- **The hour slot** around each live match: pre-match and the walk-out, the match with a short half-time, handshakes, then a post-match show (player of the match, this match's highlights, studio). About 40 minutes in all.
- **Re-airs:** the rest of each gap holds full re-airs of earlier matches at normal speed, labelled REPLAY, with trimmed ceremonies, so a missed match can be watched in full. Short studio segments sit between them.
- **North star check:** with about 4 re-airs per gap, a match (live or re-aired) is on screen about 60–75% of the time.
- **Why this shape:** seasons more often would shorten careers to about 6 weeks, and more matches per season would inflate stats and need a re-tune. Neither gets past about a third of airtime from live matches alone, because a 20-minute match in an hour slot can't. Re-airs touch neither the sim nor balance, and a later second division (§5) fits into the same slots.
- Every number here lives in `config/settings.json` and can change after watching.

**Knock-on effects to keep in mind**

- A player whose career spans 10–15 seasons has a full career arc of roughly two to three months.
- Most viewers will catch slices of the league, not all of it. The score ticker, results round-ups, and chronicle exist to help people catch up.

---

## 7. The channel

The channel is the presentation layer that sits on top of the league.

**Core idea:** the league plays every match whether anyone is watching or not. In the regular season, matches are staggered one at a time, so the channel shows each one live. The ticker carries recent results and upcoming fixtures. When matches overlap (the simultaneous final round), the channel features one live, while the others appear as live ticker scores and goal alerts.

**Choosing the featured match:** This only applies when matches overlap. In Milestone 2, a simple rule picks the match with the biggest table stakes. Later, the Director (Section 8) picks it, or viewers vote on it.

**Programming**, introduced in layers so scope stays manageable:

| Layer | Segments |
|---|---|
| Core | Live featured match in its hour slot (walk-out, match, handshakes, post-match show), score ticker, league table, full re-airs of earlier matches between live ones (so a missed match can be watched in full), highlights packages in the post-match show |
| Next | Results round-ups (a goal-rush segment cutting between the live matches was dropped, 2026-10-06: the picker and multi-view cover it) |
| Later | Pre-match previews, studio desk with pixel pundits, player interviews, player spotlights, "on this day" history segments, joke in-world adverts |
| Season events | Transfer window rumours and signings, awards night, trophy lift, draft day, expansion reveals |

**Clickable details:** Viewers can click any team or player to see their profile, stats, and history.

---

## 8. The Director and audience interaction

**The Director** is a system layer between the league and the audience. It:

1. Watches the league (Is one team dominating? Is the title race dull? Has nothing dramatic happened lately?)
2. Proposes events and choices that fit the moment
3. Puts options to a vote, then applies the winning choice by changing the league's data

**Things viewers could vote on**

- Which match gets featured
- All-star and award selections (MVP, best young player, and so on)
- Expansion team cities and names
- Rule changes between seasons
- Approving or blocking major transfers

**Other interaction**

- **Picking a team to follow,** so fanbases and rivalries form among viewers
- **Free prediction games** (pick'em, brackets) with a points leaderboard

**Rules for interaction**

- **Curated options first.** Viewers choose between options the system generates. Write-in suggestions come later, and only with filtering and approval, since any viewer text shown on screen needs moderation.
- **No real-money betting** on outcomes, ever.
- **Tips, if added later, are cosmetic or honorary only** (naming an arena, designing a kit, sponsoring an award). Paying to change results would feel like match-fixing and undermine the league.

**Upkeep and growth** (Tom, 2026-10-11, It responds). The Director does two jobs. **Upkeep:** watching the league's numbers and proposing a rule change when one stays well out of its band (drift is otherwise the league's own direction). **Growth:** the new chapters that no rule value turns on (expansion, an extra player per side, the world view): each needs building first (a mini-milestone with Claude Code, behind a dated switch after the launch), a long run-up and a story told in steps (announced, voted on in the AUDIENCE pane, switched on at a set moment). **No timeline for growth:** it comes down to feel (the channel going stale, Tom's inspiration, viewers' notes and votes pointing one way), so the Director keeps a **roadmap** of ideas in view on its desk, each with its status and the evidence gathered behind it, and never says one is due.

**What's announced** (Tom, 2026-10-11, Task 265). **Upkeep is quiet:** a rule change from the watchers is an invisible fix (viewers never see the numbers), logged and played under but never announced; the Rulebook simply stays true to the season's rules. **Announced** (INFO's UPDATES tab and a ticker headline): roadmap items and their run-up steps, polls (a new one opening, its result), changes to how viewers take part (following a team, becoming a fan, what grows from it), later perhaps legends inducted. No studio card (cards air too rarely; the ticker is constant and UPDATES keeps everything).

**Polls and feedback come first, before the server** (Tom, 2026-10-11, It responds): the dimmed **Audience** button beside INFO opens an **AUDIENCE** pane, where everything viewer-related lives. **Polls:** one at a time, written as dated data (the question, the options, when it opens and closes), so every browser shows the same; the first a one-off "your favourite team" (a standing "your team" choice that viewers can change, §8's following, to explore later). Tallies stay hidden (Tom: few voters at first); the result is announced on INFO's UPDATES once the poll closes. **Feedback:** a viewer types a note and sends it, with what was on air at the time attached; it's collected on the Director's desk for Tom, never shown on air. **One vote each:** the browser remembers it voted (stops honest repeats); at the launch the service adds one vote per connection per poll (a scrambled IP, never stored as is) and a rate limit; true one-per-person waits for accounts (Milestone 6). **Where it lands:** viewers' votes and notes need somewhere shared, but not a server of our own: until the launch the dev server collects them in files (no viewers yet); at the launch a small hosted service (a serverless function and a tiny database, chosen with the host) answers the same calls, so only an address changes. None of it feeds the sim.

**Ticket stubs** (Tom, 2026-10-12, at the dress rehearsal: polls and notes prove the idea but don't hold viewers; the channel needs reasons to keep it open and come back). A viewer collects a **ticket stub** for each kind of moment they were watching when it aired: a golden goal, a shootout, a scorcher, a record broken on air, a season's final, the trophy lift, the draft's first pick, a whole match from kick-off to the whistle, matches watched, days tuned in. Passive, not a game: nothing to do but watch. **Every stub is repeatable** (Tom): about the viewer, never a moment in the league's history ("watched a season's final", never "the season 1 final"), so a viewer arriving in season 40 can earn them all and nothing closes. "Watching" means the channel showing (the tab visible), sound on or off. Kept in the viewer's browser (no accounts, nothing sent), a quiet notice when one is earned, a scrapbook to browse; presentation only, never a sim input. **At the launch**, so the first viewers have a reason to return. Refined at the hand-off (Tom, 2026-10-12): called **MOMENTS** on screen (each looks like a ticket stub, without the name), in the AUDIENCE pane (perhaps renamed FANS); **cumulative**, one moment per kind levelling up (a goal seen, then 10, 50, 100), no tiers; live only; the big occasions (the final, the lift, the draft) left out for now, since they fall at the same time each week; every count kept in the browser from the start, so the totals can be sent to the desk later if wanted. **Tied to the browser, not the viewer** (Tom, 2026-10-12): an IP address was weighed and dropped (it changes on a phone and over time, a household and strangers on mobile networks share one, and it would need each address's history kept on a server); no accounts (a step few would take just to watch). So each device keeps its own moments, clearing site data loses them, a private window keeps nothing, and Safari deletes a site's data after 7 days of use without a visit; the pane says so in plain words. Moments are kept as what was seen (each goal's match and minute, each day tuned in), not just totals, so two devices can later be joined without counting a goal twice: a **link-a-device code** (no email, no password; `docs/backlog.md`) if viewers ask. **Following a team** waits (Tom: first see how many watch); with it, stubs for one's own team (watched them win, lift the Cup, draft first overall).

**Fan Coins** (Tom, 2026-10-15, during the dress rehearsal: a reason to keep the channel on beyond live matches, and something to *do* as well as collect). A viewer earns **Fan Coins** by watching (most for live matches, fewer for re-airs, highlights and the studio; only while the tab shows; a daily cap, perhaps later raised by one's MOMENTS) and **spends** them on the channel: a chant or a flag in the stands in Broadcast, something on the studio's back screen, a message on the ticker chosen from set ones, later votes such as a Fan Award. Spends are limited in time so a few viewers can't flood the channel. **Two versions:** **version 1**, a test during the dress rehearsal only (Tom): kept in the browser like MOMENTS, and a spend seen and heard by the spender alone, to find out whether earning and spending feels good; never on the launched channel. **Version 2**: spends seen and heard by everyone watching, the earning counted by the audience service (browser-kept Fan Coins can be faked, harmless only while a spend touches no one else), so they can also count as votes. **Version 2 at the launch** (Tom, 2026-10-17; was among the first updates after it): with MOMENTS, Fan Coins are what give a first viewer a reason to stay, so the launch waits for them (the rehearsal runs a few days longer; nothing is lost, since the launch starts from season 1 with the real seed whenever it comes). The rates stay version 1's (a coin a minute of a live match or the off-season show as it airs, one a highlights package watched whole, one every 5 minutes of everything else; 100 a day): the channel counts by them and reports with its check-ins, and the service refuses anything faster than the fastest rate and holds each household to the daily cap. Version 1's coins are reset at the launch (only Tom's). Cloudflare's **Workers Paid** ($5 a month, 10 million requests) switched on before the launch, so a launch-day crowd can't run the service out of free requests for the day.

**Donations** (Tom, 2026-10-17; its own milestone, around the launch): a way for viewers to support the channel, in AUDIENCE (beside FEEDBACK): a short line and a link out to **Ko-fi** (no fee on one-time tips, unlike Buy Me a Coffee's 5%; pays out through PayPal, which Tom already uses). The channel never handles money or payment details; it only links out. Never a sim input, and nothing on air depends on giving. **Never a sim input for now** (Tom: cautiously open to testing it later): every match is decided ahead from the day keys, so viewers' spends can't touch a match being watched; any influence would have to be gathered on our side and folded into a later day's key, a deliberate step of its own.

**The audience layer** (Tom, 2026-10-08, the ideation session; Milestone 6 and after, since it needs a server and viewers with identities). With hundreds of viewers at once, no single viewer can be given a lever on the league, but there's room to take part in other ways:
- **Viewer data lives in its own layer, outside the seeded league.** Follows, cheers, names and tips are never inputs to the sim, so the league stays rebuildable from its seed and nothing a crowd does can tilt a result (and gaming it with many accounts only makes a player famous).
- **Light interactions:** following a team (its follower count on the team card; perhaps the pixel crowd leaning towards followed teams' colours, visual only); **cheering a player** (one cheer per viewer per match or day) so that over time some become **fan favourites**: a FANS line on the player card, a Fans' Favourite award in the off-season show (the one award voted, not counted), banners in the stands, a bigger roar when they score, a place in the chronicle's HISTORY when they retire; **your name in the world** (a team's season-ticket list, a banner, the off-season show's credits), moderated like any viewer text (Claude can pre-sort, Tom approves).
- **Support made immersive** (cosmetic or honorary, above): a supporter's kit (a team's alternate kit for a season, from curated designs so clashes stay readable), an award presented by a supporter for a season, a named stand or a line on the pitchside boards, a supporters' roll at the off-season show's sign-off. **Start manual:** tips through an off-the-shelf service, perks applied by hand in a data file, no payment code until it's clearly worth it (rules on perks for money vary by country: check when the time comes). **Money never buys more say:** every viewer has the same one vote on Director choices.

---

## 9. The chronicle

The league's permanent memory.

- **Nothing is deleted.** Every match, goal, transfer, injury, award, and retirement is written to a permanent event log.
- **Record books** build up automatically: all-time scorers, longest winning streaks, most titles, and so on.
- **Hall of Fame** for retired legends.
- **Browsable history:** past seasons, past champions, and the full story of any team or player.
- **The chronicle feeds the channel.** "On this day" segments, rivalry history in pre-match shows, and commentary references all draw on it.

**On screen** (Tom, 2026-10-08, the ideation session): the chronicle shows up two ways, something you browse and something the channel says.
- **Browsed: the CHRONICLE pane,** replacing the RECORDS button, a pop-up pane like SCHEDULE, RULEBOOK and INFO, **in Full only** (Broadcast mode has none of these panes). Three tabs: **LATEST** (what's notable now, this week and season, ageing out: streaks, milestones, call-ups, firsts), **HISTORY** (what lasts, as a timeline: the first season, expansion teams joining, rule changes, dynasties and droughts ended, legends retiring with their career lines, so it doubles as the Hall of Fame; "on this day" at its top; and every past season at its foot, one line each with the champion, opening its table, playoffs and leaders) and **RECORDS** (all-time and single-season records, award counts). Everything opens inside the pane.
- **Player and team cards** in the same 86 px right-hand edge, never over the heart of the channel: a player's details and their season and career; a team's roster and history. Names are selectable in the panes (the table, STATS, the CHRONICLE, the schedule); not on the pitch, the bubbles or the ticker. **One level only** (Tom, 2026-10-08, It remembers' hand-off): a card opens in the pane's place with a ← back to that pane, and nothing on a card opens another card, so there is never a trail to climb back out of. **No ratings or attribute numbers** on a card (Tom): a player's standing in words, as the draft card does (STAR PLAYER, STARTER, SQUAD PLAYER…). Studio cards: since Broadcast has no panes, selectable names there would make the two modes differ; whether they have any is open (It remembers' hand-off, `docs/tasks.md`).
- **Said: the desk, the interview, studio cards and the ticker,** from one facts module (Talk that remembers, §12).
- **A map** (worldbuilding, after the launch) would be a picture, so it would take the centre (the pitch's place in Full, bigger in Broadcast or whatever it's called by then), with the edge panes kept; nothing the chronicle puts on the edges would move. Whether a map you navigate changes the channel into a world you choose from is its own vision question, for when worldbuilding comes up.

---

## 10. Technical approach

These principles matter more than any specific tool choice.

**Everything is data, not code.** Teams, players, rules values, and season structure live in data files. The simulation applies general rules to whatever data it's given, so adding a team or changing a rule doesn't require rewriting the engine.

**All timing lives in one settings file.** Season length, match length, gaps between rounds, and segment durations are adjustable numbers in a single config file. Retuning the pace is a one-line edit.

**The simulation is separate from the visuals.** The league can run with no display at all. The visuals only illustrate what the simulation has already decided.

**Fast-forward mode is essential.** The simulation must be able to run a whole season in minutes, or many seasons overnight, to test balance: Do the same teams always win? Do careers last a sensible length? Is scoring in the target range?

**Matches are simulated by possession phases,** not physics. Each phase (build-up, attack, shot, save or goal) is resolved from player ratings and a random roll.

**Seeded randomness.** The simulation uses a seeded random generator so a season can be replayed exactly, which makes bugs reproducible.

**Event log from day one.** Every meaningful event is recorded in a consistent format, even in the first milestone, so the chronicle and a future server can use the same structure.

**Platform:** Browser-based (HTML, JavaScript, CSS). **Decided (2026-10-02):** the pitch is drawn with plain Canvas 2D, and every overlay (scorebug, ticker, table, captions) is HTML/CSS. Phaser was not chosen: the sim has no physics, it would be the first dependency, and HTML suits overlays and clickable profiles better. Details are in `docs/channel.md`.

**Server:** Not needed until shared state and voting (Milestone 6). Neither It responds nor the launch needs one: the Director's decisions are data files the browser reads, and watching is a static site (§12, 5 and 5½). Early milestones run entirely in the browser. Until then, the browser rebuilds the league from its seed and start date on every load, so nothing needs saving. Save and load arrive with the server.

---

## 11. Visual direction

- Pixel art throughout
- Bright, saturated turf and high-contrast kits, so teams are instantly distinguishable at a glance
- Broadcast-style overlays: scoreboard, ticker, league table, lower-third captions
- Each team has a distinct colour identity and crest
- Review the team colours once they're on screen in Milestone 2. Avoid any kit or name that closely evokes a real sports team, or another game's names or places. An exact match with every real colour pairing can't be avoided, but no team should read as a copy.

Art tooling (such as Aseprite) is deferred until the simulation is proven. Early milestones use simple shapes and placeholder sprites.

---

## 12. Milestones

Each milestone should be fun or useful on its own before moving on.

1. **The league runs.** Teams, players, and the match simulation run with no visuals. Fast-forward a full season and output results, a final table, and top scorers. *Done when:* ten simulated seasons produce believable, varied results.
2. **You can watch it.** A pixel pitch showing the featured match, a score ticker for other matches, and the league table, running on the one-week calendar. *Done when:* it's pleasant to leave open on a second monitor. *(Closed 2026-10-03: runs well, but the pacing wasn't there yet. See `docs/milestone-2-summary.md`.)*
2½. **Match day.** Added at the Milestone 2 check (Tom, 2026-10-03). An hour-long slot around each match: about 20-minute matches with the clock paused for goals and subs, walk-outs and handshakes, a post-match segment, highlights and studio. Plus the season's shape (decided: live matches plus full re-airs, §6, so matches are on more often than not), a bigger pitch with sidelines and one broadcast frame, and a gameplay pass (shooting from prime positions, sensible passing, keepers tracking the ball). *Done when:* tuning in at a random time usually finds a match, and an hour of the channel feels like a real broadcast. *(Closed 2026-10-04: met; the studio desk, talking heads and interviews come later. See `docs/match-day-summary.md`.)*
3. **Stadium and sound.** Added at the Match day check (Tom, 2026-10-04). The ground comes alive and can be heard:
   - **Sound,** designed in code and synthesized with the Web Audio API: whistles, kicks, shots, nets, a crowd that swells with the play and roars at goals, short team anthems. Off until the viewer turns it on (browsers require a click first), with a mute key. **Recorded ahead** (Tom, 2026-10-13, phones): every synthesized sound is rendered once on our side into small files, as the voices are, and the channel only plays them; building them in the browser made the crowd and the music chop on a phone (Firefox), and Firefox played the ball's short sounds too softly. The recipes stay the sounds' source: a recipe changed means the sound recorded again.
   - **Broadcast mode,** chosen by the viewer: the side panel and ticker give way to stands with a pixel crowd that reacts with the sound, and the scorebug sits above the stands, like a TV picture. Today's layout stays as the other mode.
   - **Pitchside life:** a tunnel between the dugouts that players and managers use, a manager per team in a suit in team colours pacing the touchline, a referee following play, dugout props, a home-team mark on the pitch.
   - **Instant goal replays** in a small zoomed inset during the goal pause.
   - **A studio proof of concept** (not the priority): a first pixel studio desk with talking heads in place of one studio card.

   *Done when:* with sound on and Broadcast mode, an evening of the channel feels like being at the ground, not just watching a scoreboard. *(Closed 2026-10-05: met. See `docs/stadium-summary.md`.)*
3½. **Gameplay pass 2.** Proposed at the Stadium and sound check, approved by Tom (2026-10-05). One more pass on what's on the pitch before It remembers, because empty flanks and idle attackers are now the most visible gap:
   - **Use the width:** attacks spread to the flanks and the corners get used (presentation first, the sim only if needed).
   - **Loose balls:** now and then the ball breaks loose into open space and players race onto it.
   - **A soft offside:** no rule; the last attacker and the last defender stay tethered, so nobody stands hugely offside and unused.
   - **The bubble attribution check:** each bubble's player matches what the picture showed.
   - **The crowd fills and empties** round each match (arriving through the pre-match and walk-out, drifting away after the handshakes, empty on cards), so Broadcast can stay on all the time.
   - **Then a decision on bigger teams** (the study in `docs/backlog.md`), with the width fixes in hand.

   *Done when:* watching a match, play uses the whole pitch, loose balls and races for them happen, and nobody stands idle far upfield; balance still meets every target. *(Closed 2026-10-05: met. Bigger teams: after launch, maybe as a Director rule change. See `docs/gameplay-summary.md`.)*
3¾. **Between matches.** Added at the Gameplay pass 2 check (Tom, 2026-10-05), placed before It remembers. Everything on screen between matches, live or re-aired, mock-ups first:
   - **A pixel "scene"** covering the pitch between matches: an abstract, animated sportscast look (the glassy motion graphics of sports channels, pixelated), with the empty stands round it. It also hides the home name on the turf outside matches.
   - **After a match:** the full-time card over the stadium as the fans leave (all gone by its end); then the scene, with the talking heads discussing the match, teeing up a **player-of-the-match interview** and wrapping up; then the match's highlights; then back to the scene for studio cards.
   - **Talking heads** that don't repeat: other clips on the standings, top scorers and upcoming games, and one teeing up the next live match when it's a few minutes away.
   - **More studio cards**, other matches' highlights interspersed, the next live match teed up over the empty stadium, **transitions** (between highlight clips, and into and out of the scene), and **in-universe pixel ads** (about 10 s each, about 30 s a break).

   *Done when:* the time between matches feels like a sports channel's own programming, not a holding screen. *(Closed 2026-10-05: met. The final became a home game for the higher seed. See `docs/between-summary.md`.)*
3⅞. **Polish.** Added at the start of the session after Between matches closed (Tom, 2026-10-05), placed before It remembers. Small visual fixes from Tom's Between matches watch, mock-ups first:
   - **Full mode's empty areas:** the strip right of the scorebug and the bar between the pitch and the ticker, both during match pictures (live, re-air, highlights; right of the scorebug only outside the final round, whose match picker already uses it) and during everything else (ads, studio talk, interviews, cards).
   - **Pop-up panes for the button row,** starting with a **TV guide:** each button below the side panel opens a pane over everything else, like a help pop-up on a website, with its information and choices. The TV guide shows the channel's day.
   - **Playoff and final turf:** a home pitch that marks a semifinal or the final.
   - **Players a touch more alive** (visual only): stride pace following speed, the ball switching feet on a real change of direction, a kick pose, a keeper's dive.
   - **The playoffs promo** only from midway through the regular season, never in the off-season.

   *Done when:* in Full mode no area of the screen sits empty, the TV guide answers "what's on and when", the playoffs look like the playoffs, and the players look like they're playing. *(Closed 2026-10-05: met. Playoff pitches got SEMIFINALS / FINALS painted on them and gold boards for the final; players got a run by speed, kicks, a keeper's leap and turf kicked up. See `docs/polish-summary.md`.)*
- **Sound** (Tom, 2026-10-05, before It remembers; its number never set). The sound items held back from Polish: the studio bed (re-voiced or dropped), speech blips, a bumper sound, variations of each sound, commentary exclamations, volume controls, and voices (the voice-over plan). *(Closed 2026-10-06: four commentators, the desk and the interview voiced with ElevenLabs, a levels pane, a studio jingle; the bed and blips dropped. See `docs/sound-summary.md`.)*
   - **Voices are in scope** (Tom, 2026-10-05). **Viewers never download anything** to hear them: no speech model in the page and no extension, only small audio clips like any website's sounds. So voices are made **on our side**:
     - **Ahead of time:** a dev tool speaks a fixed list of lines once and saves them as small clips in `assets/`. Every other sound is synthesized, and since 2026-10-13 recorded ahead too (§12 item 3).
     - **The voices: ElevenLabs** (Tom, 2026-10-06, after auditioning Kokoro, Piper, the browser's speech and ElevenLabs' free plan): v3 with delivery tags. **Only clips made during a paid month go on air** (they keep a commercial licence for good; anything made outside a subscription needs attribution), so free-plan clips are for auditioning only. A paid month is taken when there's a batch to make, not kept running. Kokoro's clips stand in until then.
     - **First voice: commentary exclamations** ("GOAL!", "WHAT A SAVE!"): few lines, the most impact.
     - **The launch's rule** (Tom, 2026-10-06): **every voiced line is made ahead of time, with no ongoing subscription.** So voiced lines never use **player names** (too many, new every draft). *Amended for Talk that remembers:* surnames are voiced after all (Task 244, Tom, 2026-10-10): every surname comes from the regions' pools (280), so all can be made ahead. A name is said **alone**, never joined onto the end of a line (joins sounded stitched beside a single take); the one exception is a name opening "What a scorcher!", joined with no gap. Whole sentences with a name inside sound best and are worth it where a name matters most, sized by their cost. **Team names** are fine (fixed; their pronunciation checked by ear). **Numbers** only where a small set can be made ahead; otherwise the line isn't voiced. Lines built from facts (the desk talk, interviews, quotes) are voiced only as far as they can be assembled from pieces made ahead; we're choosy about which kinds of lines get a voice.
     - **The desk speaks, the graphics inform** (Tom, 2026-10-06): the presenters' talk is reworked so every spoken line can be made ahead (fixed, or naming one team); names, scores and figures move to on-screen text and graphics beside the talk, as on real TV. Desk voices: Raymond and Alice (one presenter drawn as a woman).
     - **The interview: the player's voice follows their birth region** (Tom, 2026-10-06; it was one voice per team): two voices per region, accents to fit, so a player sounds right whatever team they play for, through the draft, free agency and any later trades. The quotes don't name the team or give numbers (the lower third shows them), so each is one clip per voice.
     - **Much later, after the launch:** live voices on a server, so player names and any line can be spoken (an ongoing cost). Tabled.
- **Touch-ups** (Tom, 2026-10-06, before It remembers; no number, like Sound): fixes and additions from Tom's notes (the playoffs ad, the highlight transitions in Full, dugout players, stats across the playoffs, free shots staged properly with a box, a short restart after ordinary fouls, two new ads) and more commentary (tackles and steals, holding the ball, fouls, playoff endings). Tasks 138–156. *(Closed 2026-10-06: free shots and fouls staged, golden goals celebrated, Tickets and Season tickets, the slate of twelve, more commentary, the studio in the playoffs, two sim fixes (one backup keeper on the bench, breakaways end in the runner's shot), a stats check. See `docs/touch-ups-summary.md`.)*
   - **Season leaders count the regular season only** (Tom, 2026-10-06), on screen and in the record, as in most real leagues; during the playoffs the channel shows playoff leaders apart. It remembers' record books keep both.
   - **Free shots are staged** (Tom, 2026-10-06): about 8 s on screen (a setting): the referee carries the ball to the spot, the players clear, a beat, then the kick.
   - **More ads:** Tom pictures about a dozen more. Touch-ups plans the slate of twelve and builds tickets and season tickets; the other ten wait for a later ad milestone.
- **Ad break** (Tom, 2026-10-06; unnumbered): the rest of the ad slate settled in Touch-ups (ten ads), built as animated scenes with stills like the first ones. *(Closed 2026-10-06: 18 ads, three brands per region and six of the league's own, each gap shuffling them into its own seeded order. See `docs/ad-break-summary.md`.)*
- **Groundwork** (Tom, 2026-10-06; unnumbered): the last pieces before the sim is settled. The Rulebook and About panes; mock-ups of the Record book (not live: it ships with It remembers); team crests in the current pixel style; a bumper sound matched to the studio's cues; passes that take longer the further they go; shooters sometimes taking a touch or a few steps before shooting (73% of goals are first-time today); the pass towards a keeper still coming on at a goal's restart, if it's a small fix. Presentation only: the sim is untouched. *(Closed 2026-10-07: the Rulebook in four tabs and the INFO pane (ABOUT, and a GUIDE to the screen and the channel's rhythm; the TV guide became SCHEDULE); the Pennant and the Scorch Cup; crests on the cards, the interview and the centre circle; Record book mock-ups (not live); a bumper sound; passes that take longer the further they go; about half of goals first time; the keeper case already fixed; the score at the top of STATS. See `docs/groundwork-summary.md`.)*
- **The Sim milestone** (Tom, 2026-10-06; unnumbered; after Groundwork, before It remembers; **closed 2026-10-07**, `docs/sim-summary.md`): sim changes that are hard to make once the league has a history, each to be done or dropped there: keepers and substitutions (tired keepers coming off with no keeper on the bench, how many keepers a squad carries, how sensitive the dynasty metric is), rosters leaning local (home-region drafting and signing), team personality in the draft. Line changes and derbies in the final round were dropped (Tom, 2026-10-07). Done: keepers come off only injured (the backup starting one or two a season), the whole roster dresses, two headline prospects a draft (Tom), rosters lean local (about half home-grown), squads drafted to their team's style.
- **Fixes** (Tom, 2026-10-07; unnumbered, like Touch-ups; before the off-season show; **closed 2026-10-08**, `docs/fixes-summary.md`): bugs and small touches from Tom's watch. Done: commentary never talks over itself (and no holding lines while play waits), the studio jingle never over the desk or a bumper, a hidden tab goes quiet (not kept running: the talk isn't meant to be heard without the picture, Tom), switching final-round feeds eases in with the roars silenced a moment, the Pennant's swatch and SEASON TICKETS in gold, BLOCKS in STATS, the desk's lines dealt without repeats (more win and draw lines), injured players in the dugout in dark team tracksuits.
- **The off-season show** (Tom, 2026-10-07; unnumbered; after Fixes, before It remembers; **closed 2026-10-08**, `docs/offseason-summary.md`): the off-season becomes a show of about 40 minutes after the final instead of a champions card and three looping cards: a trophy lift at the final's ground, an awards show (top scorer, most scorchers, best save percentage, a defenders' award for blocks), farewells for notable retirements, the draft lottery drawn on screen, the draft in a draft hall (round 1 pick by pick, round 2 quicker), the releases and signings, and a sign-off. From then until the new season the channel shows only repeats of the final and of the off-season show, with the semifinals' highlights if needed. Also the desk's long pauses between lines, tightened everywhere. After the Sim milestone because that milestone changes the draft, the rosters and the keepers this show depicts; before It remembers so its awards become the record books' first entries. Player names are never voiced (captions carry them); team names can be. Done: the desk's pauses tightened; the trophy lift live; the awards (the Ember Boot, the Blaze, the Compass, the Quell, the Ironclad), farewells, the lottery, the draft, the moves and a sign-off; the night of repeats ending on the ads; its own music, the lottery's and the ads' sounds; and along the way a sim change, the Kindling League (draft picks who don't make the squad go to their team's reserves rather than being released), unique surnames among active players, and every graphic's text sharp.
- **Where history starts to count** (Tom and Claude, 2026-10-06): It remembers is the soft line: from then on the record books, profiles and chronicle stories are designed and tested against how the sim behaves, so a sim change means re-checking them all; that's why the Sim milestone comes first. The hard line is the launch: a secret live seed (Tom, 2026-10-05: the seed `flareball` stays until then; from 2026-10-21 the dress rehearsal's seed, the rehearsal having become the soft launch, its history bound since 2026-10-19) and, with Milestone 6, a saved league; until then the browser rebuilds the league from its seed on every load, so nothing is lost by a change. After launch, the sim changes only by dated rule changes in the event log (the Director's route), so old seasons keep their rules in the record books.
4. **It remembers.** The chronicle, record books, player and team profiles, and clickable details. *Done when:* you can click any player and read their career. **Closed 2026-10-09** (`docs/it-remembers-summary.md`).
   - **Settled at the ideation session** (Tom, 2026-10-08): Tom's player and team cards are It remembers' own (they are its "done when"), in the 86 px right-hand edge; the CHRONICLE pane (LATEST, HISTORY, RECORDS) replaces the RECORDS button, Full only (§9). Roughly 12–16 tasks: the chronicle's data layer (each season folded into compact records as it ends, since the browser drops match events; careers, team histories, head-to-heads, records, milestones), load time as seasons pile up, the pane, the cards, selectable names, a career stats card at the desk, the check. **No seed restart:** until the launch the league rebuilds from its seed, so a sim change rebuilds all of history to match; the soft line means re-checking the stories, not starting over. The real pressure is an **event log complete before the launch**, and above all before Milestone 6 saves the league, since what was never logged can't be recovered for past seasons; It remembers, the first close reader of the log, is where the gaps show.
   - **Paused** (Tom, 2026-10-09, after Task 222): the player cards showed that good players never change clubs (3% of long careers span two clubs; 7 moves in 40 seasons) and that parity is weak over the long run (five seeds, 40 seasons: one team 8–14 Cups, droughts of 24–39 seasons, a team in the bottom half 10–14 seasons running). It remembers resumes after **Parity and finances** (4¼) with the team card, names across the panes, the desk's career card and its check, in a league where players move.
4¼. **Parity and finances** (Tom, 2026-10-09; before It remembers resumes; a sim change, so before the launch). Make the league move: stars change clubs now and then, and bad teams don't stay bad for decades. Its hand-off is in `docs/tasks.md`. **Slimmed** (Tom, 2026-10-09, the session after): rather than bolt many new mechanics onto one problem, each needing its own tuning, two simple ones:
   - **The rookie rule** (parity): every team starts a rookie in every match, playoffs too. A rookie is a drafted player who has never played in the Scorchball League (first season only; a Kindling League call-up counts; never a made-up or older free agent; the founding season exempt). The rookie starts and stays on unless tired or injured; a keeper counts. A bottom team's rookie is a top pick who would start anyway; a champion's is a late pick, so the rule costs the strong most. A rule of the sport, held in the season's rules (Task 229b).
   - **A salary cap with secret motives** (movement): the same cap for every team, contracts and wages, a maximum contract so any team can afford a star (a Bonnefoy). Each player has a hidden lean towards **money** (the best offer, wherever), **winning** (a pay cut for a team going places) or **home** (a pay cut to play for their region), **leaning by age** (the young towards money, veterans towards winning, home at any age). Viewers infer a motive from the choices made; Talk that remembers can say it out loud. The draft's local pull is eased, so the regions' flavour comes back through home-minded free agents instead. Watch-out: winning-minded players drifting to the champion work against parity; a hard cap and "going places" (not last season's table) keep it in check.
   - **Not here** (Tom): trades, scorcher bonuses and momentum (backlog; **Scorchers and momentum** perhaps a milestone of its own later). A financial picture of the league and its teams on screen stays, even if fabricated (Tom: viewers like that).
   - **Team identities** (a later update): each team a long-term way to compete ("Moneyball": a team that isn't a big spender winning another way), building on the draft's tempo and aggression (Task 177).
   - **Eras** (Tom, 2026-10-09): like the NHL's dead-puck era or basketball's shift from big men to threes, the game is called and played a little differently across stretches of time, so a team's identity has its golden age. An era is a set of rule values (how fast heat builds, how hard a Hot shot is to place, blocks, how strictly fouls are called): a "dead ball era" of slow heat and low scores, a "scorch era" of fast heat and scorchers flying. Each change a dated `rule_change` event; every season keeps its own rules, so the record books have chapters ("most goals in the Scorch Era") and HISTORY its landmarks ("The League shortened the heat clock"). **In three steps:** the **foundation in Parity and finances** (rules that can differ by season, the `rule_change` event, the chronicle knowing a season's rules; no visible change, and the cap rising over time needs it anyway); **eras themselves with team identities** later (the League changing a rule when its numbers drift, with an in-universe reason, the Director in miniature; identities that pay off in the right era, clubs slowly adapting); and **the Director proposing rule changes** for Tom's approval in It responds (5).
4⅜. **Momentum** (Tom, 2026-10-09; **closed 2026-10-10**, `docs/momentum-summary.md`; after It remembers, before Talk that remembers; a sim change, so before the launch, and the last before the milestones that wait). **momentum** (lower case, like scorchers and burns): a scorcher gives the scoring team a small rating bonus for every player that fades back to nothing over a game minute or two; a burn gives it to the other team; it never stacks, a second scorcher or burn in the window starts it again from that moment. Measured for balance and for whom it helps (parity). Shown on screen (a scorebug mark with its timing; perhaps a moment of glow round the team's players), not called by the commentators (the scorcher already says it). Also: the big kick (keepers' long restarts drawn as a high ball), clear chances in front of goal (the picture never showing an attacker alone in front of goal with no shot coming, while keeping the real chances; a sim fix if the picture can't), and, last and droppable, getting rid of the ball (a long clearance before a burn that always gives the ball away; **dropped**, Tom 2026-10-10: a hot ball is almost never in a team's own half, so it could only be a ball over the top). Its hand-off is in `docs/tasks.md`; the backlog's "Scorchers and momentum" becomes it (scorcher bonuses for players stay in the backlog).
4½. **Talk that remembers** (Tom, 2026-10-08; straight after It remembers, before the launch; presentation only; **closed 2026-10-10**, `docs/talk-summary.md`). **Scope settled at its start (Tom, 2026-10-10): remembering by selection.** Voices made ahead can't say anything specific, so the memory lives in *when* a line is chosen, not in its words: a generic sentence ("That's a long time coming for this club") played only when the facts say it's true (a twelve-season drought just ended) is the channel remembering. Such lines are rare by design, so they never wear out; the bulk of what viewers hear stays the general pool, which gets more variety too. One **facts module** (a pure function over the match, the league and the chronicle, only what has aired: what's true and notable now) that the desk and the interview read; the CHRONICLE's LATEST stays as it is (it works), the facts module beside it.
   - **Lines from history:** the desk's new kinds come from the facts (droughts, streaks, dynasties, head-to-heads, milestones, records, award winners, old clubs, Kindling call-ups), said with team names and small numbers where a small set can be made ahead ("The Gulls have now won five straight"), the desk's graphic carrying the specifics (names, seasons, the record), as the desk already works (the desk speaks, the graphics inform).
   - **More variety:** more ways for every existing kind of desk line (most have 2–3 today).
   - **The interview in two sentences** (Tom): a reaction, then a fact when there is one ("Coming back here, that one meant something."), otherwise a second reaction; whole sentences, one clip each in the player's regional voice, played back to back.
   - **Surnames** (Task 244's try-out, Tom, 2026-10-10): every player's surname comes from the regions' pools (70 each, 280 in all), so all can be voiced ahead, covering every player the league will ever have (while no new region arrives). Tried with twelve names in four voices: the names **alone** sound good and the pronunciations natural (two voices saying a name a little differently sounds like two people), but **joins** (a name ending a line made apart from it) are hit or miss and always worse than the same line in one take. So: a commentator may call a scorer by name **alone** ("Bonnefoy!", in place of "Goal!", not after it); a name may open "What a scorcher!" (joined with no gap, the one join that works); the desk can pass a name between presenters ("And the player of the match?" "Bonnefoy."); and **whole sentences** with a name inside, which sound best, where a name matters most (each line costs a clip per name per voice, so they're chosen by their count). Names on two commentators only, George and the Announcer (Tom: half the cost), and both presenters; whole lines wherever a name is spoken.
   - **One paid batch** (or two, across months), counted first, Tom's go. Credits run at under half the character count (about 0.43 a character).
   - **Not here:** a guest panellist (a retired legend at the desk) moves to It responds, as a Director event.
5. **It responds.** The Director proposes events and choices; you approve them yourself, standing in for an audience. *Done when:* the full "Director proposes, choice applied, league reacts" loop works. **Closed 2026-10-11** (`docs/it-responds-summary.md`): the AUDIENCE pane (polls, notes), decisions as data, the watchers (quiet upkeep), the Director's desk, announcements on air (UPDATES, the ticker), the roadmap; the check passed, and found goals come in decade-long waves (generations of strikers and keepers), so corrections go one step at a time.
   - **Settled at its hand-off** (Tom, 2026-10-11): **bare bones, a proof of concept** of the loop, not a finished Director; Tom wants to see it running before deciding much more about it. **No server:** an approved decision is data, like `data/ruleChanges.json` today (a dated entry the sim applies at its date and logs), so every browser still rebuilds the same league from its seed and the decisions. **The first decisions:** rule changes (the eras' first step) and legend nominations, perhaps the guest panellist; expansion and trades later. **Tom approves on a page** (a Director's desk: each proposal with its reason, approve or reject). **Announcements are always visible** (Tom: a studio card airs for a small share of the day): an **UPDATES** tab in the INFO pane (the League's announcements, newest first) and an item on the ticker, a studio card only as a second way. How it works once live is in `docs/director.md`. **Refined in Task 265** (Tom): only what changes the channel or how viewers take part is announced (roadmap items, polls, new ways to take part); the watchers' rule changes are quiet; ticker headlines, UPDATES last in INFO with a dot on the button until seen, no studio card (§8). **The roadmap** (Tom, 2026-10-11): a ROADMAP tab on the Director's desk keeps the growth ideas in view (expansion, an extra player per side, the world view), with no timeline (§8). **Polls and feedback first** (Tom, 2026-10-11): It responds opens with the AUDIENCE pane (a one-off favourite-team poll, tallies hidden, the result on UPDATES; a feedback form, collected on the Director's desk), on the dev server until the launch's hosted service (§8).
5½. **The launch** (Tom, 2026-10-11: after It responds, before Others can join in; its name and scope to be set). Going public as a static site (no server needed to watch): a host and domain, the league's and project's names (§15), a fresh live seed and start date, how updates are published, the voice files' size, and load time as seasons pile up (each browser replays every season; snapshots in time). After it, every sim change must rebuild old seasons identically (new mechanics switch on only at a dated decision). **How the live channel runs** (Tom, 2026-10-11; `docs/live.md`): the local folder stays the test copy and a publish step is added; presentation changes go live any time, outcome changes (the sim, rules, decisions) only from a future date; a history check before every publish; the channel checks for a new version and reloads itself when hidden or silent, otherwise offers an "update ready" notice; events switch on everywhere at a set moment, announced ahead on the ticker; snapshots of each season (built for the launch) keep loading fast and freeze the past, so sim changes need only leave the current week alone; no dev tools (`?at=`, the dev panel) on air.
   - **Settled at its hand-off** (Tom, 2026-10-11; `docs/live.md` §5, §7, §8): **Cloudflare** (the site on Pages, votes and notes on a Worker and D1) from a **private GitHub repo**, all free; the domain **scorchball.tv** (scorchball.com sending viewers to it); costs beyond the voices and Claude kept at or near $0. **Spoilers guarded:** the live seed is secret, and a daily cloud job publishes each day's **day key** (that day's random streams) about 12 hours ahead, with a snapshot every Monday, so no one can run the league further ahead than the keys allow. **From season 1**, after a week's dress rehearsal on the real host with a throwaway seed; no public moment, the address shared once the first matches have played cleanly. **Changed 2026-10-21 (Tom):** the rehearsal *is* the launch, a true soft launch on its own seed (secret, strong, never written down), its season 1 from 2026-10-12; the address shared **a few seasons in, from season 5 (Monday 9 November)**, so the first visitors find a finished season, a chronicle and records (`docs/live.md` §8). **A YouTube stream later**, once the channel has run a while.
   - **Before it, decided 2026-10-17 (Tom):** **Fan Coins version 2** (shared spends, earning counted by the service; §8) built and checked on the rehearsal site, with Workers Paid on (the one running cost beside the voices and Claude, $5 a month); and **donations** (a Ko-fi link in AUDIENCE; §8), its own small milestone, at the launch or just after.
6. **Others can join in.** A server holding one shared league, with real viewer votes. *Done when:* two people on different computers see the same match and can vote.

**Renumbered (2026-10-04):** Stadium and sound became Milestone 3, so It remembers, It responds and Others can join in moved from 3–5 to 4–6. Docs written before then (`docs/milestone-1-summary.md`, `docs/milestone-2-summary.md`, `docs/milestone-2-tasks.md`, Match day's task notes) use the old numbers.

**Planned** (Tom, 2026-10-06; the off-season show added 2026-10-07; updated 2026-10-08): Groundwork, then the Sim milestone, then Fixes, then the off-season show (all closed), then an ideation session on the plans for after the launch (no coding; held 2026-10-08), then It remembers, with the CHRONICLE pane in the Record book button's place (a pop-up pane, like the TV guide; its RECORDS tab mocked up in Groundwork), the player and team cards and a career stats card (the blocks stat came early, in Fixes), then Talk that remembers, then It responds. **Updated 2026-10-09 (Tom):** It remembers paused after the player card (Task 222) for **Parity and finances** (4¼); then It remembers resumes, then Talk that remembers, then It responds.

**After the launch, an art and sound pass** (Tom, 2026-10-06; a live update): Aseprite sprites, variations of each synthesized sound, perhaps ElevenLabs sound effects beside the synthesized crowd, perhaps music from Suno (8-bit, sparse).

**Dropped** (Tom, 2026-10-06): the final-round picker moving into the WEEK tab (the top of Full and Broadcast is settled); a goal-rush segment cutting to each goal in the final round (the picker and the multi-view cover it); regional ads at their own grounds (the ads are the channel's, not the stadium's).

**After the launch, a version for phones** (Tom, 2026-10-12, at the dress rehearsal): the channel is built for desktops; on a phone it's serviceable (about 75%) but small, hard to tap, less smooth and its sound stutters (`docs/backlog.md`, Phones). A YouTube stream would fix phones' picture and sound but not their interactivity (the panes, the cards, changing views, voting), which matters as much, so it isn't the answer for phones. Instead, a version of the channel designed for phones, perhaps over a few milestones in a row; when and how to be decided when it comes up.

**Later, not now:** AI commentary and pundits, AI-written news and player quotes, voices spoken live on a server (Milestone 6), YouTube streaming, tips and the rest of the audience layer (§8).

**Ideas for the player-of-the-match interview** (Tom, 2026-10-03; Match day ships a card with a canned quote):
- **A filmed pixel interview:** a small animated scene (the player in front of a sponsor board, a reporter's microphone) in place of the card, voiced once there's audio. Same segment and pick; only the presentation changes.
- **Generated quotes before AI quotes:** a seeded quote generator, like the name generator: a grammar of sentence fragments filled with real facts from the match and season (the opponent, a late winner, a scorcher, a comeback, a streak, the table). Every quote is new but still the same on every screen, with no server. AI-written quotes come after, with the server, saved in the chronicle so a rebuild doesn't change them. *(Planned for Talk that remembers, 4½ above, as whole sentences rather than fragments so the voices still work.)*

---

## 13. CLAUDE.md

`CLAUDE.md` is the project's rulebook for Claude Code. Claude reads it automatically at the start of every session, so it's how the project "remembers" its rules and structure between sessions. It must be created in the **first Claude Code session, before any game code is written.**

**What it should contain**

- **Project summary:** two or three sentences on what this is, pointing to `docs/vision.md` for the full picture.
- **Working rules:**
  - Always confirm with Tom before pushing code.
  - Propose a plan before any change that touches more than a couple of files, and wait for approval.
  - Ask clarifying questions rather than guessing when a doc is unclear or silent.
  - One task per session.
- **Folder structure:** what lives where (`docs/`, `data/`, `src/`, `assets/`, and so on).
- **Doc map:** which doc covers what, and which one to read for a given kind of task.
- **Core technical rules** from Section 10: data not code, all timing in the settings file, simulation separate from visuals, seeded randomness, every event goes in the event log.
- **Testing:** how to run fast-forward mode and what to check after changes.
- **Git habits:** commit after each working step with a clear message.

**Suggested first-session prompt**

> Read `docs/vision.md`. Don't write any game code yet. Initialize git, create a `CLAUDE.md` with project rules (including: always confirm with me before pushing code), propose a folder structure, and propose a numbered task list for Milestone 1. Then wait for my review.

`CLAUDE.md` should be kept short and updated whenever a rule or structure changes.

---

## 14. Planned documents

| File | Purpose | When |
|---|---|---|
| `docs/vision.md` | This document | Now |
| `CLAUDE.md` | Rules and structure for Claude Code | First session |
| `docs/sport.md` | Exact rules of the invented sport, roles, signature twist | Before Milestone 1 |
| `docs/simulation.md` | How matches, players, development, and the draft work | Before Milestone 1 |
| `docs/tasks.md` | Numbered, checkable task list for the current milestone | Each milestone |
| `docs/channel.md` | Screen layout, segments, scheduling | Before Milestone 2 |
| `docs/director.md` | Events, voting, how choices change the league | Before Milestone 5 |

---

## 15. Open questions and defaults to confirm

- [x] Working title for the project and name of the league: the channel is **Scorchball TV** (scorchball.tv), the league **the Scorch League** (Tom, 2026-10-12: beside the Scorch Cup and the Kindling League; on air it stays "the League")
- [x] Name of the sport: **Scorchball** (Tom, 2026-10-05; the working name was Flareball, and a flare goal is now a scorcher)
- [x] The signature twist: the heat ball
- [ ] Number of teams (default: 8)
- [x] Number of player positions: 4 (5-a-side)
- [ ] Scoring target (default: 5–8 per match)
- [ ] Match length: about 20 minutes inside an hour slot (Match day milestone; 60 was tried and felt long)
- [x] Season shape: one week, the same 56 matches, live matches plus full re-airs (§6)
- [x] Playoffs or cup final on day 7: top-4 playoffs
- [x] Phaser or plain HTML canvas for visuals: Canvas 2D plus HTML/CSS overlays
- [x] Setting flavour: an invented world

---

## 16. Out of scope for now

- Real leagues, teams, players, or likenesses
- Real-money betting of any kind
- Viewer write-ins shown on screen without moderation
- Full animated player physics
- YouTube streaming, AI voices generated live by a service or server, and payments (planned for later, not the first build). Voices made ahead of time on our side are in scope from Sound (§12).
- Anything a viewer has to download or install to watch or hear the channel (speech models, extensions)
