# Simulation Spec

> **Status:** Approved for Milestone 1 (2026-10-02). **[Default]** = proposed value, easy to change. **[Open]** = still to decide.
> Rules of the sport are in `docs/sport.md`. This doc explains **how the engine resolves them**, plus players, the off-season and the event log.

---

## 1. Principles

- **Matches are computed instantly, then played back.** The engine simulates a whole match in milliseconds and produces a list of events stamped with the game clock. The channel (Milestone 2) replays those events in real time. Fast-forward mode simply skips playback. The visuals never decide anything.
- **Deterministic.** The same league seed always produces the same league. All randomness comes from `src/sim/rng.js`.
- **Pure and DOM-free.** Engine functions take data and return data and events. They never touch the DOM, never read the clock, and never call `Math.random`.
- **Data-driven.** Formulas are general. Coefficients live in data files (see §11).
- **The event log is the source of truth.** Stats, tables and records can be rebuilt from it. Cached totals are allowed for speed but must always match it.

## 2. Randomness

- **Generator:** `sfc32`, seeded through a `cyrb128` string hash. Both are small, fast and well known.
- **Independent streams:** each match gets its own generator, and each off-season step gets its own (`draft`, `schedule`, a player's `motives|<id>` and so on), named by season and key (`s3|s3-r7-m2`). Changing one match therefore doesn't reshuffle every later random roll, which keeps bug reproduction and tuning stable.
- **Where streams come from** (the launch, Task 271; `src/sim/streams.js`, `docs/live.md` §5): the sim asks the league's streams (`streamsOf(league)`), never the seed. From a seed (`seedStreams`: the dev league, every tool), a stream's generator is seeded with the SHA-256 of `"<leagueSeed>|s<season>|<key>"` (`src/sim/sha256.js`, plain JavaScript), one-way, so publishing one reveals neither the seed nor another stream. The live channel plays from **day keys** (`keyStreams`): each day's streams, published by `npm run daykey` from the secret seed; a stream not published throws `MissingKeyError`. Where a stream would give away more than its day, its outcome is published instead (a **value**): whether a team rests its keeper in a round (the season's rest rounds are one shuffle), and the season's seed for drawing lots (`lotsSeedFor`). The streams are kept beside the league (a `WeakMap`), so the league stays plain data; a copy with a seed gets its seed's streams back.
- The RNG API covers floats, ints in a range, weighted picks, normal draws and shuffles.

## 3. Data model

All IDs are stable strings and are never reused.

**Team** (`data/teams.json`, plus runtime state)
```
id, name, city, region, colours {primary, secondary}, crest (placeholder),
personality { tempo: 0–1, aggression: 0–1 },
roster: [playerId], 
```
- **Tempo:** how early the team shoots in the attacking zone. Higher tempo means more, lower-quality shots and fewer burns.
- **Aggression:** how often the team attempts tackles. Higher aggression means more turnovers won and more fouls conceded.

**Player**
```
id, firstName, lastName, region, birthSeason, position (K|D|P|S),
attributes { shooting, passing, dribbling, tackling, pace, composure, stamina, keeping },  // 1–99
potential (hidden, 40–95), peakAge, 
teamId | null (free agent), injury { matchesOut } | null,
draft { season, round, pick, teamId } | null,
status: active | retired
```
- **Age** = current season − birthSeason. **One season counts as one in-world year.**
- **Overall** is derived, never stored: a position-weighted average of attributes (§5).

**Match**
```
id ("s3-r7-m2", playoffs "s3-sf1" / "s3-f"), season, stage (regular|semifinal|final),
round, homeId, awayId, neutral (bool), result { homeGoals, awayGoals, decidedBy: regulation|overtime|shootout }
```

## 4. Match engine

### 4.1 State
Game clock in seconds, team in possession, **zone** (Defensive / Middle / Attacking, relative to the team in possession), **heat** (0–100), score, the 5 players on the pitch for each side with their fatigue, and substitutions used.

### 4.2 The loop
The engine repeats **actions** until the clock passes the end of the half. Each action:
1. Advances the clock by a random **action time** of 5–9 s *(rules)*, adding the same amount to heat (§4.4).
2. If heat ≥ 100, a **burn**: emit `burn`, then turn the ball over in the mirrored zone (§4.3).
3. Otherwise resolves one action from the current zone, as follows.

| Zone | Carrier pick (weighted) | Options |
|---|---|---|
| Defensive | K 15%, D 55%, P 25%, S 5% | **Advance** (pass/carry to Middle) or **recycle** (keep the ball, still burning heat) |
| Middle | D 25%, P 50%, S 25% | **Advance** to Attacking or recycle |
| Attacking | D 15%, P 35%, S 50% (P 40%, S 45% until Task 188b) | **Shoot** or **work it** (try to create a better chance) |

- **Recycle** only happens while the ball is **Cool**, with chance `recycleBase · (1 − tempo)`. Once the ball is warm, teams always push forward. (Recycling a warm ball made burns far too common.)
- **Advance:** a contest of the carrier's best of passing and dribbling against a chosen defender's tackling, nudged by pace. The carrier passes or carries, whichever they're better at, so a lost advance by a better passer is a **steal** (an interception): the `possession_change` (reason `tackle`) has `data.steal: true`, otherwise `false` (Task 37). About half of tackles are steals. Both count as tackles in the stats; the channel shows STEAL! or TACKLE!. Success moves the ball up a zone and emits `advance`, so the channel can animate the ball moving. Failure turns the ball over to the defender, who then has it in the **mirrored zone** (§4.3).
  - Before each advance, the defending team's aggression decides whether it actually contests. An uncontested advance succeeds automatically.
  - **Pressing:** in the carrier's own Defensive zone, the chance of a contest is multiplied by `pressFactor` (0.4), so teams press less high up the pitch. Without this, every tackle there handed the opponent an instant shot, and shot counts couldn't be tuned.
  - **Restarts** (Task 88, Tom): after a goal, miss or held save, while the keeper's team still has the ball in its own Defensive zone (until its first successful advance or a change of possession), the multiplier is `restartPressFactor` (0.12) instead: the opponents drop off and let the keeper restart play. Before, about 6 turnovers a match came straight from a restart, which on screen looked like the keeper passing to an opponent in front of goal.
- **Shoot or work it:** first, does a defender close down the carrier (the same contest chance as an advance)? A carrier with **nobody close who is in range** shoots with `openShotChance` (0.9). A carrier is **in range** once the team has worked the ball successfully in this attack, so scoring range takes an action to reach (Task 37). Otherwise the chance of shooting rises with heat and team tempo: `pShoot = base + tempo·k1 + heatStage·k2`. Working it builds a **chance quality** bonus (+q) that carries into the next shot and brings the ball into range, but also burns heat. This is the core risk/reward of the twist.
  - **Breakaways** (Tom, Task 37): an advance into the attacking zone that nobody challenged becomes a breakaway if the carrier also outruns the defence: a `breakaway` contest of their pace against the fastest outfield defender's (a wide scale of 100, so pace helps but doesn't decide it). The `advance` has `data.breakaway: true` (always present, `false` otherwise). That player keeps the ball, is in range, and nobody is close, so they shoot (always, since Task 152, Tom: with `openShotChance` alone, 1 in 10 worked the ball instead and a teammate well behind could take the next shot; the roll is still made, so other matches are untouched); the shot (`data.breakaway: true`) has **no block step**, and it comes quickly: the action after a breakaway takes `match.breakawaySeconds` (2–4 game-seconds) instead of the usual 5–9 (Task 40). About 3 a match (bias −2.2 since Task 40; it was about 4), converting about 15% (shots overall about 14%). With pace counting more (scale 37.5), fast strikers piled them up and a best top-scorer season reached 77; the save bias went 1.0 → 1.05 to keep goals where they were.
  - *Why in range* (Tom, Task 37): open carriers kept working the ball in prime positions. Letting every open carrier shoot at once pushed goals to 7.4 and the scorcher share down to 21% (shots came on a cool ball). Needing one worked action first keeps the scorcher share near 27%, and the save bias (0.9 → 1.05 with breakaways) absorbs the extra shots as saves.
- **Fouls:** every contested tackle has a foul chance that rises with aggression. A foul by the defenders in their own Defensive zone (that is, the attacker's Attacking zone) gives a **free shot**. Any other foul returns possession to the fouled team at the same spot.

### 4.3 Zones, turnovers and restarts
- **Mirroring:** a team's Attacking zone is the opponent's Defensive zone, and Middle stays Middle. On a turnover, the zone flips and heat resets to 0.
- **After a goal:** the conceding team restarts from its Defensive zone with heat 0.
- **After a miss or a held save:** the defending team restarts from its Defensive zone with heat 0.
- **Kick-off:** possession starts in the Middle zone.

### 4.4 Heat
- Heat increases by `100 / burnSeconds` per game-second of possession *(burnSeconds = 40, rules)*. Passing doesn't reset it; only a change of possession does.
- Stage penalties (`p` = penalty, `c` = composure / 99):
  - **Warm:** advance and pass rolls −`warmPenalty · (1 − c)`
  - **Hot:** advance and pass rolls −`hotPenalty · (1 − c)`. Shots get +`hotPower` and −`hotAccuracy · (1 − c)`.
- The engine emits `heat_stage` when the ball enters Warm or Hot, so the channel can recolour the ball.
- **momentum** (Tasks 236–237, §10c): a scorcher or the other team's burn gives a team `momentum.bonus` (3) on every rating it uses with the ball (`eff`), fading linearly to 0 over `momentum.seconds` (90); `momentum` event `{ teamId, data: { cause: 'scorcher' | 'burn', extended, until } }` (until in game seconds). Never stacked; the other team's takes it over; cleared at each kick-off of a period and before a shootout.

### 4.5 Shot resolution
A shot is resolved in three steps:
1. **Block:** chance from the nearest defender's tackling, against the shooter's shooting.
2. **On target:** chance from shooting, chance quality and heat accuracy. A shot off target is a **miss**.
3. **Save:** the keeper's keeping against shot power (from shooting, plus `hotPower` when Hot). If not saved, it's a **goal**. A goal while Hot is flagged `scorcher: true`.

After a save, the keeper either **holds** the ball (a restart) or **parries** it. A parry creates a loose ball, contested on pace. If the attackers win it they stay in the Attacking zone, heat still running. If the defenders win it they restart. Blocks work the same way. The shooter's teammates are credited with **assists**: the player who made the last successful advance gets one if it happened within the same possession. **Who gets it** (`rules.match.assists`, Tom, 2026-10-28): `lastAdvance`, as played from the start, credits the last player in the team's spell on the ball to move it on (up a zone, or working the chance in the attacking zone), none when that was the scorer, and a free shot keeps the one from before the foul: about 58% of goals assisted. `teammate` credits the last teammate other than the scorer to move it on in that spell, none on a free shot: about 79% (the rest solo runs, the ball won in the attacking zone, free shots). Only who is credited changes, never a result. Measured over 3 leagues of 10 seasons: the Compass's winner changes in about 4 seasons in 10, still a midfielder every time, with 2–6 more assists; the Spark's in about 1 in 10; player of the match in about 6% of matches; the other awards never. Defenders' assists rise most (about 650 to 1,150 a league in 10 seasons), and keepers get about 10 a season between them (none before). Over 40 seasons (2 leagues): three-assist matches 9 to 15 a season, four-assist (LATEST) 2 to 4, the 50th-assist milestones 2.1 to 3.2, retired players past the 225-assist legend bar about the same (1–2 to 2–3), the best career about 235 to 300. **On from season 4** (`teammate_assists` in `data/ruleChanges.json`, Tom, 2026-10-28); LATEST's four-assist bar kept (Tom: 4 a season is still rare).

**Free shot:** the team's best available shooter against the keeper, with the ball reset to Cool. There is no block step, and it uses a separate accuracy bonus *(rules)*, 0 since Task 37: with fouls more frequent, the old bonus of 10 handed strong teams (who have the best shooters) too many goals and broke the titles target. Shootout kicks have their own bonus (`shootoutAccuracyBonus`, 10), so shootouts didn't change.

### 4.6 The contest formula
Every contest uses one function:
```
p = clamp( logistic( (attack − defend) / scale + bias ), pMin, pMax )
```
- `attack` and `defend` are **effective ratings**: attribute × fatigue factor, + home bonus, − heat penalty.
- Each contest type (`advance`, `block`, `onTarget`, `save`, `looseBall`) has its own `scale`, `bias`, `pMin` and `pMax` in `data/rules.json`. `onTarget` is played against a fixed `baseline` rather than a player. Fouls are not contests: they are a flat chance (`tactics.foulBase` + aggression).
- **All starting coefficients are placeholders.** Task 14 tunes them against the balance targets (§10).

### 4.7 Fatigue, substitutions and injuries
- **Fatigue:** each player on the pitch gains fatigue at `rate · (1.5 − stamina/99)` per game-minute; an outfield player's rate leans with his side's aggression (Task 233, pressing is tiring: × (1 + `aggressionRate` × (aggression − 0.5)) above 0.5, `aggressionRelief` below it; *rules: 0.75, 1.75*). Effective ratings are multiplied by `1 − maxFade · fatigue`, with fatigue ranging 0–1 and `maxFade` = 0.15 *(rules)*.
- **Substitutions:** at most 4 per match (3 until Task 37), so the whole bench can come on. A tired player comes off only when it won't look strange (Tom, Task 41): when the action ended in a stoppage (a goal, miss, held save, burn or foul), while the team has the ball in its own defensive zone, or at half-time and before overtime. Injuries are replaced at once. The engine makes them automatically when a player's fatigue passes a threshold or a player is injured, bringing on the best bench player in the same position (or the nearest position if none). Substitutes come on fresh.
  - **Keepers never come off tired** (Tasks 174 and 174b, Tom, the Sim milestone): they tire at half the rate *(rules: `fatigue.keeperRate` 0.5; at most about a 7% fade by full time)* and are left out of fatigue substitutions, so a keeper leaves only through injury, and an outfield player goes in goal only when a keeper is injured with no keeper on the bench (the stand-in wears the keeper's shirt, which goes with the slot). Before Task 174 a keeper came off tired in nearly every match, and a tired keeper with no bench keeper was replaced by an outfield player 558 times in 8,850 matches (5 leagues × 30 seasons, seeds `balance`); now no keeper comes off tired, 198 come off injured, 6 of them for an outfield player.
  - **Never a keeper sent on outfield for a tired player** (Task 174c, Tom): a tired outfield player comes off only for an outfield player from the bench; with none left, they play on. With four substitutions and only three outfield players on a bench of 4, the fourth tired outfielder used to be replaced by the backup keeper: 2,591 times in 8,850 matches before Task 174b, 4,351 after it. The matchday squad grew to the whole roster (10), so the bench is the backup keeper and four outfield players; the rule still guards squads with a third keeper (about a quarter of team-seasons). A keeper may still come on outfield for an injured player when nobody else is left (34 in 8,850 matches).
- **Injuries:** each player has a small chance per match of an injury event, more likely when tired. Severity is drawn from a long-tail table (for example 60% 1 match, 30% 2–4, 9% 5–10, 1% season-ending) *(rules)*. If no substitutions remain, the team plays on with 4 players, and the shorthanded side receives a penalty. **The last player on the pitch plays on hurt** (Task 271): a side never has nobody on (the injury's `data.playsOn`; the match lines, the timeline and the dugout keep them on).

### 4.8 Lineups
A rested keeper (§4.7) sits out only if another fit keeper can start and resting leaves the team its five (Task 271: a squad down to its last fit players started four). Before each match, a team picks its starting 5 as the best fit players (K, D, D, M, S) who are not injured, and its bench as the rest of the matchday squad (all its fit players since Task 174c: 5 when nobody is injured), keeping a backup keeper if one is available. Only one (Task 140, Tom): the rest of the bench is outfield players, and a second spare keeper sits there only if there aren't enough of them (squads that drafted a third keeper put two on the bench, 30 of 118 benches in season 3). **The backup keeper's starts** (Task 174b, Tom): each team's backup keeper starts 1 or 2 regular-season matches a season *(rules: `roster.backupKeeperStarts` { min, max })*, in rounds drawn from the team's own stream for the season (`"<leagueSeed>|s<season>|keeper-rest|<teamId>"`), never the final round and never the playoffs; the first-choice keeper sits on the bench (`restsKeeper`, `keeperRestRounds` in `match.js`). With only one fit keeper, that one starts. The pre-match card asks the same question, so it shows the five who start. Two different keepers started in 1,191 of 1,200 team-seasons (three in 9, through injuries). Other rotation and tactics are left for later.

**The rookie rule** (Task 230, Tom; `sport.md` §4; `docs/finances.md` §2): with `roster.rookieStarters` above 0 *(rules: 0 in `data/rules.json`, 1 from season 2 by `data/ruleChanges.json`)*, the five must include that many rookies (`players.isRookie`: drafted, and `debutSeason` unset or this season; `debutSeason` is stamped by `season.js` on everyone who played, after each match). If the best five have none, the fit rookie whose swap costs least takes the place of the weakest starter at the rookie's own position (a rookie keeper replaces the keeper; `startRookies` in `match.js`); the starter goes to the bench. No fit rookie: the rule lapses. The rested keeper is never swapped in. Substitutions are unchanged (they were only ever for fatigue or injury). **Through the off-season** a team keeps that many rookies on its roster: the release and reserve steps (`leastValuableSurplus`) pass over them unless nobody else can go, and a call-up who isn't a rookie never pushes out the last one (`keepsForRookieRule` in `offseason.js`). Without that the rule lapsed in a third of matches (picks go to the reserves) and did nothing.

### 4.9 Knockout ties
Knockouts follow `sport.md` §13. Golden-goal overtime runs the same loop and ends on the first goal, with nothing after it but the result (until Task 176 a tired player could still be substituted in the same moment). The shootout alternates free shots that start Hot, best of 3, then sudden death, with the order chosen by best shooting.

## 5. Positions and overall rating

Weights are stored in `data/positions.json` **[Default]**:

| | Shoot | Pass | Drib | Tackle | Pace | Comp | Stam | Keep |
|---|---|---|---|---|---|---|---|---|
| K | – | 0.10 | – | – | 0.05 | 0.15 | 0.05 | 0.65 |
| D | 0.05 | 0.15 | 0.05 | 0.40 | 0.15 | 0.10 | 0.10 | – |
| M | 0.15 | 0.35 | 0.15 | 0.05 | 0.10 | 0.15 | 0.05 | – |
| S | 0.40 | 0.05 | 0.20 | – | 0.15 | 0.15 | 0.05 | – |

Players generated for a position get attributes skewed towards its weighted ones. The others stay lower, but not useless, so a defender can still occasionally score.

## 6. Player lifecycle

### 6.1 Generation
- **Draftees** are 18–20 years old, with an overall around 35–60 and a potential drawn from a skewed distribution: most 50–70, a few 80+, roughly one 90+ every few seasons *(rules)*.
- **peakAge** is 26–30 for outfield players and 28–32 for keepers.
- **Name and region:** a region is chosen from `data/regions.json`, weighted, and the first and last names come from that region's pools. A first-and-last-name pair is never repeated while the earlier player is active. **Task 201 (Tom):** nor is a surname: the screens write "C. Penhallow", and with 24 surnames a region about 41 were shared among the 145 or so active players at any time (26 on rosters). Each region now has 70 surnames and 40 first names, and `pickName` draws up to 100 times for a surname no active player has, then settles for any unused full name. Over 90 seasons (three leagues) no surname was ever shared. The extra draws change results from here (balance: every target met on the alt and check seeds and on 15 leagues, the median career 10; the default 5 leagues' median lands on 9, at the target's edge since the Kindling League). The presenters' names are fixed in `data/studio.json` and their looks unchanged; the managers' names change with the longer pools.

### 6.2 Development (each off-season)
- **Before peakAge:** each attribute moves towards its potential-scaled target by about 25% of the gap, ± noise *(rules)*. Players who got more minutes get a small bonus.
- **Peak** (peakAge to peakAge + 2): small random wobble only.
- **Decline after that:** attributes drop each year, accelerating with age. **Physical attributes fall first** (pace, stamina). **Mental and technical ones hold longest** (composure, passing), so veterans become savvy but slow.
- The engine emits `player_development` with each player's overall before and after, so the chronicle can tell stories like "breakout season" or "decline".

### 6.3 Retirement
- The chance to retire is a logistic curve on age, centred around 33 (35 for keepers) *(rules)*. It rises if overall is below replacement level or if the player has been a free agent for 2 or more seasons. Retirement is certain at age 40.
- **Target:** careers of about 10–15 seasons.

## 6a. Season flow (`src/sim/season.js`)

- **Played in steps** (Milestone 2), so the live channel can advance one match at a time:
  - `startSeason` logs `season_start`, builds the schedule and returns a plain-data season state.
  - `nextFixture` gives the next match: regular-season fixtures in round order, then the semifinals once seeded, then the final once both semifinals are played.
  - `playNextMatch` plays it. The step that completes a round also closes it (injuries, standings). The last round's step also seeds the playoffs, and the final's step ends the season.
  - `seasonRecord` returns the finished record.
  - `runSeason` is simply this loop, so fast-forward and the live league share one code path. The split was checked to give a byte-identical event log.
- `season_start` is logged, then the schedule is built from the season's `schedule` stream.
- **Each round:** all matches are simulated, then injuries are updated.
  - Injured players on teams that played count down one match, and `injury_return` is logged when they're fit.
  - New injuries from this round are then applied, so a 1-match injury misses the next round.
  - Season-ending injuries wait for the off-season.
  - Finally a `standings` snapshot of the table is logged.
- **Playoffs:** `playoff_seeding` is logged, then semifinals 1 v 4 and 2 v 3 (the higher seed at home), then the final at the higher seed's ground (home advantage as usual; neutral until 2026-10-05, Tom). The `neutral` field stays in the record format, now always false. Injuries count down the same way.
- **End of season:** `season_end` records the champion, runner-up, Pennant winner (`shieldId`: the Shield until 2026-10-07), final order and top scorers. A compact summary is also added to `league.history`.
- **Awards** (the off-season show, Task 188; `src/sim/awards.js`; Tom, 2026-10-08): right after `season_end`, one `award` event per award, in `rules.awards.list`'s order, and the same in `league.history`'s `awards`. All from the **regular season's** stats; the awards are data (id, name, stat, who can win it):

  | Award | For | Open to |
  |---|---|---|
  | **The Ember Boot** | most goals | everyone |
  | **The Blaze** | most scorchers | everyone |
  | **The Compass** | most assists (the playmaker award) | everyone |
  | **The Quell** | most **STOPS**: tackles (steals are tackles that intercept a pass) plus blocks | defenders |
  | **The Ironclad** | best save percentage: saves over shots on target faced (saves plus goals conceded) | keepers who faced at least `minFacedShare` (half) of the busiest keeper's shots; the two runners-up from two other teams, one a team, while enough teams qualify (`oneATeam`, Tom, 2026-10-18: a team's two keepers had been first and third) |
  | **The Spark** (Task 252) | the best rookie: a blend of what their position does (below) | rookies (drafted, in their first season) with at least `minMinutesShare` (a quarter) of the most minutes anyone played; none in the founding season |

  Ties go to fewer appearances, then a draw from the season's `awards` stream; a stat nobody has gives no award. No MVP or best young player (Tom: young player would nearly always be the No. 1 pick, MVP the top scorer). To make them, the match's player stats gained `blocks` and `conceded` (goals let in while in goal); they're counters only, so results are unchanged (five seasons' events identical apart from the awards; balance targets all met).
  - **The Spark** (Task 252, Tom, 2026-10-10; stat `rookieBlend`): every regular (a quarter of the most minutes) is scored on their position's blend (`blend`, weights by stat): each stat as how many spreads above or below the average of the regulars at that position (so a midfielder's hundred-odd stops don't drown out their goals), times its weight. Strikers goals 1, assists 0.5, scorchers 0.5; midfielders assists 1, goals 0.75, stops 0.5; defenders stops 1, assists 0.5, goals 0.5; keepers `savesAdded` (saves above what the regulars' average save percentage would have made on the same shots). A rookie's standing (`value`, 0–1, kept, never shown) is the share of the other regulars at their position they scored above; the best standing wins, ties to more minutes, then the draw (drawn after the other five, so they're unchanged). The event also carries `position` and `line` (goals, assists, scorchers, stops, saves, faced), and each of the shortlist (the next two rookies) its `line`, for the plinth's card. Over 100 seasons (five leagues): defenders 33, midfielders 34, strikers 19, keepers 9 (about in line with the rookies each position fields); the No. 1 pick 28, the No. 2 31, other first-rounders 27, second-rounders 9. It counts as an award everywhere (legends, MOST AWARDS, the farewells). Only an event added: the balance report identical.
  - **Over 30 seasons** (three leagues, before Task 188b): the Ember Boot went to the same player as the season before 12 times in 27; the Quell's winner about 125–140 stops, the Ironclad's about 76–84% on 130–190 shots. A tie in the stat came up 12 times in the 120 counted awards (none for the Quell), settled by appearances or the draw. **Since Task 188b** (strikers shoot more), over the balance check's 150 seasons: the Ember Boot 127 strikers, 23 midfielders; the Blaze 108 and 42; the Compass 139 midfielders, 11 strikers.
- Playoffs support 2 or 4 teams, matching the semifinal and final stages.

## 7. Off-season (day 7, after the final)

This runs in `src/sim/offseason.js`. Events use the finished season's number and stage `offseason`. The order is fixed, and each step emits events:
1. **Season wrap:** champion, Pennant and final table are recorded (`season_end`, in `season.js`), then the season's awards (`award`, §6a; Task 188).
2. **Retirements** (`retirement`, with age, overall, position and seasons played). Retirements are judged on the season just played.
3. **`league.season` advances by one**, so ages from here on count from the coming season.
4. **Aging and development** (`player_development`).
4a. **The reserves** (the Kindling League, §9c; Task 194b): call-ups, then the reserves whose rights have run out are released.
5. **Draft lottery and draft** (§8).
6. **Releases:** every team has a **roster of 10** *(rules)*, with at least 2 K, 3 D, 2 M and 2 S. A team over the limit lets its least valuable player at a position above its minimum go: one of this draft's own picks is sent to the reserves (`reserve`, §9c), anyone else is released (`release`).
   - Value = current overall, plus half the remaining growth for players still developing.
   - Releases happen *before* free agency, so released players can be signed elsewhere in the same off-season.
7. **Free agency** (§9).
8. **Injury recovery:** a full off-season heals every injury (`injury_return`).

**Retirement detail:** being below replacement level only raises the chance once a player is at or past their peak age. Otherwise raw draftees would retire before they had time to develop.

## 8. Draft

- **Lottery:** the 4 teams that missed the playoffs are drawn for picks 1–4 with weights **40 / 30 / 20 / 10**, worst record first. Playoff teams follow in reverse order of the regular-season table, the top seed last, however the playoffs went (Tom, 2026-10-18, for parity: until then by playoff finish, so an underdog that won its semifinal picked 7th or 8th). *(rules)* **The second round** (`draft.laterRounds`, Tom, 2026-10-25): the first round's order again through season 2's off-season (`lottery`); from season 3's, the regular-season table in reverse, worst first (`table`, season 4's rules in `data/ruleChanges.json`), logged as `draft_lottery`'s `laterOrder`. **The rookie rule in the draft** (`draft.rookieFit`, Tom, 2026-10-28, fix B): since the rule starts a rookie at his own position, every pick leans by `rookieFit` points for each rating point a position's weakest starter sits below the team's average weakest starter (and away from its strongest), so a rookie's start costs the weakest link rather than the star. 0 through season 3; 2 from season 4's rules (`rookie_positions`), first in season 3's off-season draft. Why: in season 3 the Royale's only rookies were both strikers, so the rule benched O. Beaucourt, the league's top scorer. Measured (4 leagues × 20 seasons): a rookie keeping the team's best outfielder on the bench 7.8% of team-matches to 4.5%, an 85+ player 11.9% to 5.2%; every balance target met. Over 40 seasons (30 leagues) a slight tilt to strong sides staying strong, kept by Tom (2026-10-28): most Cups by one club 8.8 to 9.3 (target ≤ 9; 8.7 on the same seeds with the lean from season 1, so within about half a Cup of noise), most Pennants 8.4 to 9.5, places a team moves 2.48 to 2.37; the rule had been evening the league by benching strong sides' stars. Watch it through the Director. At 3 parity suffered (the rule had been quietly benching strong sides' stars); the first pick alone barely helped. Tried and dropped: letting a rookie play out of position (Tom: positions would matter less).
- **2 rounds**, using the same order in each round *(rules)*.
- **Draft class:** `teams × rounds + 4` prospects, so a few go undrafted and join free agency.
- **Headline prospects** (Task 175, Tom: the top picks should be good): each class opens with `draft.headliners`, each from its own ranges *(rules)*: the first 72–80 overall at the draft with potential 86–95, the second 66–73 with 78–88; the rest are raw (`prospectOverall` 35–60, potential about 62). Picks are made as for anyone, so they usually go first and second (headliner 1 first in 123 of 150 drafts; headliner 2 first or second in 122). The No. 1 averages 75 at the draft, 80 a season on, 86 after three, and starts at least half their first season in about half of cases (a regular starter averages about 75); the No. 2 averages 67, 72, 78 and starts half in about a fifth. Before, every draftee arrived at 46–50.
  - **The league settles higher with them:** average overall about 73 from season 16 (66 before), so season 1 starts near it (`league.initialPotentialMean` 72 → 80). Stronger players have more stamina, so `fatigue.ratePerMinute` 0.02 → 0.024 keeps substitutions (5.6 a match) and the bench's minutes, which feed development and careers (without it: 2.6 substitutions, a median career of 9).
- **Pick logic:** teams see each prospect's potential plus scouting noise. Value = `potentialWeight` × scouted potential + the rest × current overall, plus `needBonus` if the team is below a position minimum, plus `roster.localBonus` (10) if the prospect is from the team's region (§9a). A drafted player always signs.
- **A statistical need** (Tom, 2026-10-18, `draft.statNeed`; `draft.js` `statNeeds`): the team that scored least last season adds `bonus` (6) to every striker's value, the one that conceded most the same to every defender, each place better a share less, none from the middle of the table on. The draft only (free agency's filling pass can, `freeAgency`, off). Measured over 10 × 40 seasons: the top club's Cups 9.3 → 8.8, the longest drought 28.4 → 32.0, balance unchanged (`docs/tasks.md`, Tom's note 7).
  - **Team personality** (Task 177): plus `roster.styleWeight` (2) times the prospect's fit with the team's style (§9b). Free agency adds the same.
- **Events:** `draft_lottery` (the resulting order) and `draft_pick`.

## 9. Free agency

- **The pool** holds released players, undrafted prospects and unsigned veterans. Pool players keep aging and developing.
- Teams below the roster size or a position minimum first call up their best reserve who fits (`call_up`, reason `short`; §9c), otherwise sign the best-value free agent at the needed position (`signing`). They go in reverse table order, one signing per pass, until every team is full.
- If no free agent plays a needed position, a replacement-level player is generated (`player_created`), so a roster can never be left invalid.

## 9a. Rosters lean local (Task 176, Tom, the Sim milestone)

- **A preference, not a quota:** when a team drafts or signs, a player from its own region gets `roster.localBonus` *(rules: 10 rating points; 5 from Task 232, Tom, with home-minded free agents carrying the regions, and the market no longer using it, §9d)* added to their value. It tips close calls and never a clear talent gap: in the draft, where value weighs potential by `potentialWeight` (0.7), it covers about 14 points of potential; it never changes a player's ratings. Headline prospects (§8) take it too, so a local star sometimes goes home. Releases don't use it.
- **Why:** without it rosters start about 76% home-grown and drift to about 23% by season 20 (prospects and free agents come from the four regions equally), so the regions' flavour fades. With it the share settles at about 53–54% (63% at season 10), teams ranging 20–100% after 30 seasons.
- **Bonus values tried** (5 leagues × 30 seasons, home-grown share at season 20 / 30): 0: 23% / 23%; 3: 35% / 37%; 6: 43% / 46%; **10: 54% / 53%**; 15: 62% / 63%. Balance was within seed noise at 6, 10 and 12; 10 met every target on the default, alt and check seeds (titles 3.9, 3.8, 3.8; 4.13 on 30 more leagues, about 4.2 before).
- A team with a full roster that is short at a position first releases a surplus player to make room.
- Every player still unsigned at the end gets `seasonsUnsigned + 1`, which feeds the retirement chance.
- Real transfers between teams are left for Milestone 5, where the Director can propose them.

## 9b. Team personality in the draft (Task 177, Tom, the Sim milestone)

- **Style fit** (`styleFit` in `draft.js`): for an outfield player, their style attributes against their own outfield average, leaning by the team's personality. Tempo above 0.5 (direct) favours shooting and pace, below it (patient) passing and composure; aggression above 0.5 favours tackling, below it composure. A middling team (0.5) has no lean; keepers score 0. Typically within ±20 rating points; teams add `roster.styleWeight` *(rules: 2)* times it to a player's value when drafting or signing, beside the local bonus (§9a).
- **What it does** (5 leagues, seasons 10–30): the link between a team's trait and its squad's make-up goes from none (correlation −0.1) to clear: tempo 0.63 (high-tempo squads lean 2.1 points towards shooting and pace, patient ones 5.5 towards passing and composure) and aggression 0.46 (aggressive squads' tackling 4.3 points nearer their average than passive ones'). Weights 0.3–1 barely showed (0.08–0.31).
- **What it doesn't:** match stats hardly move (aggressive teams' tackles +1–3%), because personality already drives tackles and shots in play (§4). Its payoff is identity in the squads: the off-season show's draft (a typical Anvils pick) and It remembers' player profiles.
- **Balance:** titles 4.1, 4.0 and 3.9 on the default, alt and check seeds and 4.03 on 30 more leagues (about 4.1–4.2 before): seed noise. The home-grown share stays 51–53%.

## 9c. The Kindling League: the reserves (Task 194b, Tom, the off-season show)

- **Why:** every team drafts two a year into a roster of 10, so before this the least valuable players went straight back out, and those were usually the picks: 82% of round 2 picks and 39% of round 1 picks were released the off-season they were drafted, and only 34 of 524 ever signed anywhere. On air the draft presented players who never played for the team. Protecting the picks on the roster instead diluted the league (average overall 73.6 → 69.3 over 5 leagues × 30 seasons; median career 2).
- **The reserves:** a pick who doesn't make the 10 goes to the team's reserves (`team.reserves`, `player.reserveUntil`; `reserve` event with `until`), "playing in the Kindling League" *(rules: `reserves.name`)*. The team holds their rights for `reserves.rightsSeasons` *(3)* seasons. Reserves keep their `teamId` but aren't on the roster: they never play, aren't injured, and don't count towards the roster size or the position minimums. No second league is simulated.
- **Development:** as everyone's (§6.2), counting as if they'd played `reserves.playingTimeShare` *(0.5)* of a season's minutes (Tom: between the bench's none and a regular's full bonus).
- **Call-ups** (after development, before the draft): each team, best reserve first, calls up a reserve whose value (§7) is more than `reserves.callUpMargin` *(8)* points above its weakest roster player at the same position; that player is released (`release` reason `call_up`; `call_up` reason `better`). In free agency a team short of a player calls up a reserve before signing anyone (`short`).
- **Rights end:** a reserve not called up within `rightsSeasons` is released to free agency (`release` reason `rights_expired`), in the off-season after their last season held.
- **The margin** (Tom chose 8): 0 gives about 2 call-ups a year but a median career of 8 (each call-up pushes a veteran out early); 4–6 about 1.5 and 9; **8 about 0.9 (0.5 better, 0.4 filling a gap) and 10, every target met**. Over 5 leagues × 30 seasons, seasons 6–30, each off-season: about 9 picks sent down, 0.9 called up (median age 21, overall 59, after 2 seasons down), 8.4 released when their rights end (the weakest in the pool; not shown on air), 4 other releases (2.5 over the limit, 1.1 making room for a position, 0.5 for a call-up), 0.8 signings; about 3.3 reserves a team. League average overall 73.0 (73.6 before), median career 10 (11).

## 9d. Contracts, wages and the cap (Task 231, Parity and finances; `docs/finances.md` §3)

- **Money** (`src/sim/finances.js`, `rules.finances`), in thousands a season. A player's **market wage** is `wageAt60` × `wagePerPoint`^(value − 60), value being `players.playerValue` (current overall plus half the growth to come for the young), between `minWage` and the maximum contract (`maxContractShare` of the cap). **Payroll** is the roster's wages; the reserves are off it.
- **Contracts** (`player.contract`: `{ wage, until }`, the last season covered; null for a free agent). The founding squads start at the market wage with 1 to a full deal's length left (their own stream, `founding-contracts`); a squad whose wages add up to more than the cap has every wage above the minimum cut by the same share to fit (`fitToCap`, Task 251). Draft picks sign **rookie deals** for `rookieSeasons`, paid by overall pick from `rookieScale.first` to `.last`. Other deals run `contractSeasons` by age.
- **The off-season** gains a step after the reserves (2b): **the re-signing window**. Each team looks at its roster's expiring deals, most valuable first, with their wages off its books: it re-signs one at the market wage (stream `re-signing`) if that fits under the cap and no free agent on the market at his position is worth more for a wage it could afford; the rest are released (`contract_end`). After the draft, the picks' rookie deals.
- **Free agency** under the cap: a team signs a free agent whose market wage fits its room, at that wage; with no room, one worth no more than the minimum wage, at the minimum (which may take it over: a roster must be full); failing that, a made-up replacement-level player at the minimum. Order and preferences as before (§9, §9a, §9b).
- **Logged:** `contract` (`data` `{ kind, wage, until }`, kind `founding` | `rookie` | `re_sign` | `free_agent`; `re_sign` too for a free agent signed back by the team that let him go that off-season); `release` gains reason `contract_end`.
- **Motives and the market** (Task 232, `rules.motives`; `docs/finances.md` §3, built 232): each player's hidden personality (`player.motives`, own stream `motives|<id>`) and `players.motiveOf` (money, winning or home, nudged by age). The re-signing window lets a player his club wants go to the market when what he wants lies elsewhere (`testsMarket`). Free agency: the reserves fill short positions; then **the market**, best free agent first, every open team with room bidding (`finances.offerFor`: the market wage, or the room down to `offerFloor`, or over the market for a star from a team with real room), the player signing where `finances.offerScore` is best (winning: a team going places, `finances.outlooks`; home: his region's; the familiarity plus for his old club); then the old fill-up. `contract` gains `turnedDown`; `player_created` gains `motives`.
- **Measured:** `docs/finances.md` §3 (built). Balance's career target counts drafted players who reached 75+ (§10).

## 10. Initial league and balance targets

**Season 1 setup** (`src/sim/league.js`):
- Load teams, then generate each roster with ratings that vary slightly by team (`teamStrengthSpread`, *rules*), so some teams start stronger.
- Each roster gets a **balanced spread of ages** (19–33), so no team starts accidentally young or old.
- About 70% of each team's players come from its home region.
- The roster's extra slot (beyond the position minimums) is always outfield.
- Each player's current overall follows from their hidden peak (potential) and age (`generation`, *rules*).
- A small free-agent pool is also generated, always including a keeper.
- **Specialist attributes:** keeping is a keeper-only skill, so outfield players are poor in goal (`generation.specialists`, *rules*).

**Balance targets** are checked by `npm run balance` (`src/cli/balance.js`). By default it runs 5 seeded leagues × 30 seasons, which takes about 8 s. `--override '{"rules":{...}}'` tries values without editing `data/`. Run it after any change to `rules.json` or `positions.json`.

Results with the current defaults (Task 14, re-tuned in Milestone 2 Task 19 and Match day Tasks 37, 40 and 41; recorded at the Match day close, 2026-10-04):

| Metric | Target | Result |
|---|---|---|
| Goals per match (mean) | 5–8 | 6.59 |
| 0–0 draws | under 1% | 0.2% |
| Home win rate (regular season) | 43–52% | 48.3% (draws 13.8%) |
| Burns per match | 1–4 | 3.37 |
| Scorchers | 20–35% of goals | 25.9% |
| Top scorer goals per season | 20–45 on average; best season ≤ 70 (65 until Task 237) | 38.2 average; best 57 (Task 188b); with momentum 40–42 average, best 61–69 (Task 237) |
| Table winner / bottom team points (of 42) | 26–34 / 5–14 | 31.9 / 8.9 |
| Champions per 10 seasons (average stretch) | at least 4 different teams; the most successful wins at most 4.5 titles (4 until the Sim milestone's close) | 4.7 teams; 3.7 titles |
| Champions per 10 seasons (worst stretch) | information only | 4 teams; 6 titles |
| Career length (drafted players who reached 75+ overall; Task 231, Tom: about 16 newcomers a season for 80 places, so the fringe washes out early whatever the rules, and a median over every drafted player measures that, not careers) | median 10–15 seasons | 12 with contracts. For information: the median past the rookie season (the target from Task 230 to 231) is 3 with contracts (10 before); one-season careers shown apart (before the rookie rule, 65% of retired picks never played a match; 49% after it) |
| League average overall | drift within ±3 | +2.9 (settles around 67) |
| Changes of possession per match | information only (Milestone 2) | about 117 (70 tackles, 40 of them steals); average possession about 20.5 game-s |
| Shots per match | information only (Task 37) | about 51: 16 saved, 18 missed, 9 blocked; 14% scored |
| Breakaways per match | information only (Task 37) | about 3.3, converting about 15% (Task 40) |
| Fouls / free shots per match | information only (Task 37) | about 4.5 / 1.3 |
| Substitutions per match | information only (Task 37) | 5.8 (up to 4 a team); fatigue subs between game-minutes 30 and 40, only at a stoppage or with the ball in their own third (Task 41) |
| Free-agent pool | ≤ 40 | 30 (capped) |

Re-run when the final became a home game for the higher seed (2026-10-05): all targets met; champions per 10 seasons 4.9 different teams and 3.3 titles on average (worst stretch 3 teams, 5 titles); goals 6.46 a match, home wins 47.3%, table winner 31.3 points (these also reflect the Gameplay pass 2 changes since the table above).
Re-run after one backup keeper on the bench (Task 140, 2026-10-06): all targets met but the titles metric, 4.2 on the default seeds (worst stretch 10 titles; it was 3.3). Over 15 leagues on three seed sets the old bench rule gives 3.8, 4.3 and 4.4 and the new one 4.2, 4.4 and 4.4: seed noise, not the change, so no retune (see the note on the titles metric below). Goals 6.38 a match, home wins 47.1%, substitutions 5.90 a match.

Re-run after breakaways always end in the runner's shot (Task 152, 2026-10-06): all targets met but the titles metric again, 4.7 on the default seeds; over 15 leagues the alt and check seed sets give 4.2 and 4.4 (4.4 and 4.4 before), so seed noise. Goals 6.46 a match, home wins 47.0%.

Re-run after tired keepers stay on unless a keeper can come on (Task 174, 2026-10-07): all targets met but the titles metric, as before: 4.5 on the default seeds (4.7 before), 4.2 and 4.5 on the alt and check sets (4.1 and 3.9 before); 4.40 across the three against 4.23, inside the ±0.4 seed noise. Goals 6.47 a match, home wins 46.8%, save percentage (saves of saves plus goals) 72.3% (72.1%).

Re-run after keepers never come off tired and backups start 1–2 matches (Task 174b, 2026-10-07): all targets met on all three seed sets: titles 3.6, 3.9 and 3.8 on the default, alt and check sets (4.5, 4.2 and 4.5 after Task 174). Goals 6.46, 6.24 and 6.15 a match, home wins 46.8–47.9%, save percentage 72.5%, substitutions 4.9 a match (5.7). But see Task 174c's wider check: that dip was a lucky draw.

Re-run after the whole roster dresses and no keeper goes on outfield for a tired player (Task 174c, 2026-10-07): all targets met but the titles metric: 4.4, 4.6 and 3.9 on the default, alt and check sets. Over 30 more leagues (seed sets x1–x3, 10 leagues each) Task 174c gives 3.8, 4.2 and 4.5 (mean 4.17) and Task 174b 4.1, 4.5 and 4.2 (4.27): **the keeper and bench changes leave the titles metric where it was, about 4.2**, a little over its limit, as it has been since Task 140. Goals 6.24, 6.17 and 5.99 a match, home wins 45.2–47.0%, career median 10–11, substitutions 4.7 a match.

Re-run after headline prospects (Task 175, 2026-10-07; with `initialPotentialMean` 80 and `fatigue.ratePerMinute` 0.024): **all targets met** on the default, alt and check seeds. Titles 3.9, 3.7 and 3.7 (4.0, 4.6 and 4.1 on x1–x3: about 4.2 on 30 leagues, as before), career median 10–11, drift 0.2–1.2, goals 6.66–6.91 a match, substitutions 5.6, the league's average overall 73.

Re-run after rosters lean local (`localBonus` 10) and no substitution after a golden goal (Task 176, 2026-10-07): **all targets met** on the default, alt and check seeds: titles 3.9, 3.8 and 3.8, career median 10, drift −0.5 to 1.2, goals 6.85–7.05 a match, substitutions 5.6.

Re-run after team personality in the draft (`styleWeight` 2, Task 177, 2026-10-07): all targets met on the alt and check seeds; on the default seeds titles read 4.1 (limit 4), seed noise (4.03 on 30 more leagues). Career median 10, drift 0.2–1.4.

Re-run after the rookie rule (Task 230, 2026-10-09): **all targets met** on the default seeds with the career metric counted past the rookie season (median 10; Tom). Goals 7.0–7.1 a match; the best top-scorer season reached 67 once on the alt seeds (limit 65; left for Task 233).

**Decisions (Tom, Task 14):**
- **The titles limit raised from 4 to 4.5** (Tom, 2026-10-07, closing the Sim milestone): the metric has sat about 4.1–4.2 on wide checks (30 leagues) since Task 140, and nothing in the Sim milestone moved it; bringing it under 4 would mean re-balancing several things for little gain, and dynasties are stories (the Director's to answer, Milestone 5).
- **Dynasties are judged on the average 10-season stretch.** A rare dynasty is a league story, not a bug. Responding when one team dominates is the Director's job (`vision.md` §8, Milestone 5), not an engine rule.
- **A single record season above 60 goals is welcome** as a record chase. The limit of 65 only catches runaway outliers.

**What Match day Task 37 changed, and why** (Tom, 2026-10-03/04): watching at the new pace, open carriers in prime positions kept working the ball, and runners clear through on goal didn't shoot.
- **Open shots in range** (§4.2): `openShotChance` 0.9, once the team has worked the ball in the attack. Without the in-range rule the scorcher share fell to 21%.
- **Breakaways** (§4.2): an unchallenged entry to the attacking zone plus a pace race (`contests.breakaway`, scale 100 so a fast striker can't run away with the scoring charts); an unblocked shot follows.
- **More saves rather than more goals:** `save.bias` 0.9 → 1.05 (Tom's choice over more misses).
- **Fouls** `foulBase` 0.015 → 0.025. The extra free shots pushed the titles metric over its limit, so `freeShotAccuracyBonus` 10 → 0; shootouts keep theirs as `shootoutAccuracyBonus` 10.
- **Substitutions** `maxSubstitutions` 3 → 4. **Steals** are recorded on tackles (no balance effect).
- The titles metric sits close to its limit and moves ±0.4 between seeds (the Task 36 engine misses it on two of three seeds tried), so a single miss on a different seed isn't on its own a reason to retune.

**What Task 188b changed, and why** (the off-season show, Tom, 2026-10-08: the first awards showed the Ember Boot, the top scorer's award, going to midfielders as often as strikers; he expected strikers to be the main scorers): one midfielder and one striker a side, and in the attacking zone the shooter was picked 45% striker, 40% midfielder; midfielders also carry through the middle, so they took about as many shots as strikers (35,032 to 36,716 over 30 seasons), converted a little better (14.3% to 13.2%) and starting midfielders were rated slightly better shooters (79.5 to 78.0). Over 300 seasons in 12 leagues a striker topped the scoring 49% of the time.
- **Attacking carrier weights** D 15 / P 40 / S 45 → **D 15 / P 35 / S 50**: a striker tops the scoring **74%** of seasons over the same 300 (S 48 gave 62%; S 55 about 85%); in the balance check's 150 seasons the Ember Boot went to a striker 127 times, the Blaze 108, the Compass to a midfielder 139. Sensitive and noisy: seasons in one league are linked (a star wins year after year), so small samples mislead (60 seasons at S 49 read 63%, 40 at S 45 read 33%).
- Every balance target still met (top scorer 38.2 a season on average, best 57); the pitch map's tight checks pass or miss by the same hair as before on the seeds tried. Results change from here on: the same seed plays a different league.

**What Milestone 2 Task 19 changed, and why** (Tom, 2026-10-03): watching the channel, play felt too chaotic, with 145 changes of possession a match (106 tackles, an average possession of 16.5 game-seconds, about 6.6 real seconds on screen).
- `contestBase` 0.7 → 0.5 (defenders challenge less often; fouls fall from 4.7 to 3.4 a match) and the advance `bias` −1.2 → −0.8 (a challenged advance succeeds more often): tackles fall by a third, to 71.
- `shootBase` 0.2 → 0.1 (teams work the ball more before shooting) and the onTarget `bias` 0 → −0.3, so the extra attacks don't push goals past 8.
- `burnSeconds` 36 → 40, so the longer possessions don't burn far more often. Every 38-second version broke the burn or title targets.
- Result: 115 changes a match and an average possession of 20.8 game-seconds (8.3 real seconds). Longer than that ran into the heat ball: more burns or more goals.

**What Task 14 changed, and why:**
- **Contest scales widened about 2.5×** (`advance` 40, the others 37.5), with the shooting biases retuned.
  - Previously, small rating gaps compounded over ~50 shots a match: a star striker scored 100+ goals a season, and tables split into haves and have-nots.
- **Shots spread more evenly** (attacking carrier weights D 15 / P 40 / S 45, previously 10 / 35 / 55).
- **Home bonus raised from 0.5 to 1.2,** to keep the same home advantage on the wider scales.
- **The playing-time bonus is now a fraction of the gap to potential** (0.15), not flat rating points. Before, regular starters developed past their potential.
- **The season-1 league is generated at the steady-state level** (`league.initialPotentialMean` 72). Teams keep the best prospects, so rostered potential settles well above the draft average of 62. Starting lower made the league drift upward for about 12 seasons.
- **Free agency:**
  - The unsigned-retirement boost now applies only at or past peak age, after 1 unsigned season, at +0.4.
  - The free-agent pool is capped at 30 (`league.freeAgentPoolMax`). The least valuable leave the league, logged as `retirement` with `reason: "unsigned"`.
  - The draft class has 2 extra prospects instead of 4.
- **Retirement age centre moved from 33 to 34** (keepers 36), for careers of 10–15 seasons.

## 10b. The long view: parity over 40 seasons (Task 228, Parity and finances)

`npm run parity [-- --seasons 40 --leagues 5 --seed parity --override '{...}']` (about 12 s) plays each league 40 seasons and measures what the 10-season balance targets can't see. Each league's value is its worst team (or its whole share); a target is judged on the average over the leagues, the worst league shown beside it.

- **Cups and Pennants per team**, the most and the fewest; different Cup winners.
- **The longest Cup drought:** the longest run of seasons in a row without a Cup, an open run at the end included (a team that never wins has a drought of every season).
- **The longest run in the bottom half** of the regular-season table (with 8 teams and 4 in the playoffs, the longest run without a playoff place).
- **Places a team moves a season** in the table, on average.
- **Moves:** signings of a player who has played in the League for another club; all signings for information.
- **Careers of 5+ seasons at 2+ clubs:** among players with five or more seasons played (active or retired), the share who played for two clubs or more.
- **Luck beside each:** a league of pure luck (every table a random order, every Cup a random team's; 500 leagues, its worst in brackets), the floor parity can reach. Nobody can do better than luck on Cups and droughts.

**Targets** (Tom, 2026-10-09): most Cups ≤ 9, longest bottom-half run ≤ 8 (≤ 10 from Task 233, Tom), places a team moves a season ≥ 2.2, moves ≥ 2 an off-season, two-club careers ≥ 50%; the longest drought for information. (First set as most Cups ≤ 8 and drought ≤ 15; reset after the baseline, since pure luck misses both. With 4 of 8 teams in the playoffs, the bottom-half run is the drought that matters: the run without a playoff place.)

**Baseline** (2026-10-09, before any change; seeds `parity` and `check`, 5 leagues each):

| Metric | `parity` avg (worst) | `check` avg (worst) | Luck avg (worst) | Target |
|---|---|---|---|---|
| Most Cups by one team | 9.8 (11) | 9.8 (12) | 8.3 (13) | ≤ 9 |
| Fewest Cups by one team | 1.8 (1) | 1.2 (0) | 2.1 (0) | |
| Most Pennants by one team | 10.0 (12) | 10.6 (13) | 8.3 (14) | |
| Longest Cup drought | 29.2 (35) | 30.4 (40) | 27.1 (40) | |
| Longest run in the bottom half | 12.6 (18) | 14.2 (19) | 7.6 (18) | ≤ 8 |
| Places a team moves a season | 1.75 | 1.78 | 2.63 | ≥ 2.2 |
| Moves per off-season | 0.1 | 0.2 | | ≥ 2 |
| Signings per off-season (all) | 0.7 | 0.7 | | |
| Careers of 5+ seasons at 2+ clubs | 1.9% | 2.2% | | ≥ 50% |

**After the rookie rule** (Task 230, 2026-10-09; `parity` / `check`): most Cups 9.0 / 8.6 (met), longest bottom-half run 8.6 / 12.0 (target 8), places moved 2.36 / 2.39 (met), moves 0.4 / 0.5 an off-season, two-club careers 6.1% / 6.8%. The table moves; players still don't (the money's job, Tasks 231–232).

**Task 233: styles were an edge** (2026-10-09). Diagnosing why bottom teams stayed down: in the off-season they already gain on the top teams (best five +0.6 against −0.4), with the same cap room, departures and signings. The cause was permanent: a club's **style** (`personality`, §9b). Over 12 leagues × 30 seasons the same clubs led every league, by aggression: Anvils (0.8) and Stormcrows (0.75) won 65 and 70 Cups, Royale (0.3) 23 (an even share 45). Measured directly (one club at 0.3 and at 0.8, the rest at 0.5, 240 club-seasons): aggression was worth **+2.7 points a season** (its extra contests +4.1, its extra fouls −0.2: winning the ball back outweighs fouling) and tempo **+1.3** (shooting sooner). First flattened (`contestAggression` 0.25 → 0.03, `shootTempo` 0.2 → 0.05, `contestBase` 0.61 and `shootBase` 0.175 so a middling club plays as before): even, but Tom asked whether clubs still **look** different in the box score, and an aggressive club no longer did (tackles 32.5 → 32.6 from 0.3 to 0.8). So aggression got a price instead: **pressing is tiring** (§4.7: `fatigue.aggressionRate` 0.75 above 0.5, `aggressionRelief` 1.75 below; a sitting-back side saves more than a pressing one spends, since a fresh player can only be so fresh) with most of its pressing back (`contestAggression` 0.2, `contestBase` 0.525). Measured (one club at 0.3 and at 0.8, the rest 0.5, 240 club-seasons): aggression 0.8 about −0.1 to +0.2 points, 0.3 about −0.2 to −0.5, Royale's 0.3 / 0.3 within 0.4; box scores from 0.3 to 0.8: tackles 31.0 → 34.6, steals 16.0 → 17.9, fouls 1.7 → 2.9, goals scored 3.8 → 3.4 (tired legs late on); tempo: shots 23.2 → 26.1, burns 2.7 → 0.9, possession 53% → 46%. Tried first: a beaten press leaving a gap (a breakaway), which lifted goals to 8.3 a match and barely brought tackles back. Clubs' average places now 4.28–4.73 (an even 4.5; Royale 4.68, Anvils 4.70). A richer trade-off per style is team identities' (backlog). Tried and dropped (within noise or worse): a steeper lottery (60/25/10/5), a lower cap (18,000), and teams valuing defenders less (a point at D is worth about a quarter of one at K, M or S in the table, but weighting value by it didn't help).

**After Task 233** (10 leagues on `parity` and `check`, 20 on `fresh`): most Cups 9.9 / 8.1 / 8.8 (about 8.9; limit 9), longest bottom-half run 9.3 / 8.9 / 9.3 (limit **10**, eased by Tom: some teams are just bad for a while, as in real leagues; luck 7.6), places moved 2.36 / 2.35 / 2.40, moves about 5.6 an off-season, long careers at two clubs 72–74%. Balance: every target met on the default seeds (goals 6.8 a match, home wins 47.8%, burns 3.5, scorchers 26.8%, titles 3.9, careers of those who reached 75+ 12); on the alt seeds one 66-goal season (limit 65). Substitutions 4.7 a match (5.6 before: tired pressing sides use theirs). The pitch map's targets all met. From the start of the milestone: most Cups 9.8 → about 8.9, bottom-half run 12.6–14.2 → about 9.2, places moved 1.75 → 2.37, moves 0.1 → 5.6, long careers at two clubs 2% → 73%.

**What it shows:** on Cups and droughts the league is already close to luck (the four-team playoffs shuffle the Cup), and luck itself misses those two targets: with 8 teams, a fair league's most successful team averages about 8 Cups in 40 seasons and its longest drought about 27. Where the league is far from luck is the **table**: teams stay put (1.75 places a season against luck's 2.6) and a bad team stays in the bottom half 12–14 seasons running (luck: about 7½). And players **don't move** at all. So the Cups target was eased to 9, the drought kept for information, and a target set for places moved.

## 10c. momentum (Task 236, Momentum; the quick model)

**The rule** (`data/rules.json` momentum; Tom): a scorcher gives the scoring team momentum, a burn gives it to the other team. Every one of that team's players gains `bonus` rating points, read in `eff` like the home bonus, fading steadily from full to nothing over `seconds` game seconds. It doesn't stack: a scorcher or burn in the window starts it again, full, from that moment; the other team's takes it over. It ends with the period and before a shootout. `withBall`: the bonus only while the team has the ball (attacking), not in its defending contests. Logged as a `momentum` event (`cause` scorcher or burn, `extended`, `until`). **On from Task 237** (Tom: +3 × 90 s, with the ball).

**Measured** (4 leagues × 15 seasons each, about 3,600 matches; a near-zero bonus logs the same windows as a baseline):
- **How often:** about 5.4 a match (35% from scorchers, 65% from burns), so on for about 13% of match time at 60 s, 18% at 90 s, 23% at 120 s; 4–10% of windows extended.
- **Whom it helps:** it goes to the stronger side (by last season's points) 51% of the time: neither the strong nor the weak.
- **Every contest** (attacking and defending): mostly defensive. The team with momentum mainly stops the other side scoring. At +2 × 90 s: goals for in a window 2,131 against a baseline 2,122, against 1,875 against 1,930; at +3: for 2,034, against 1,720. Goals per match dip a little (7.44 to 7.05–7.36).
- **With the ball only:** goals for in a window rise and the other side's are unchanged. At +2 × 90 s: for 2,228, against 2,002; at +3: for 2,329 (+10%), against 2,010. Goals per match unchanged (7.4–7.5). At +5, no more than +3 (noise).
- **Balance** (5 × 30 seasons): every target met, both at +2 × 90 s every contest (goals 7.14, burns 3.52, scorchers 27.0%, best top scorer 59) and at +3 × 90 s with the ball (goals 7.05, scorchers 27.0%, best top scorer 62).
- **Tom's pick (Task 237):** +3 × 90 s with the ball, on from now. Balance on four seed sets: goals 6.9–7.1, scorchers 26.7–27.4%, the average top scorer 40–42; the best season 62, 61, 69 and 67 (65 and 58 without momentum on the last two; +2 gave 60 and 61; +3 × 60 s was worse, 61–71, so the best season is mostly noise, one season in 150), so its limit went from 65 to 70 (Tom). Parity met on the default seeds (most Cups 8.8, places moved 2.43).
- **The long view** (`npm run parity`, 5 × 40 seasons): with the ball +3 × 90 s meets every target (most Cups 8.8, places moved 2.43, bottom-half run 8.8). Every contest +2 × 90 s misses most Cups (9.8); so does today's league on this seed set (9.6, against 8.9 in Task 233). Both are within the run-to-run noise.

## 10d. Getting rid of the ball (Task 241, Momentum; measured, then dropped)

**The rule** (`data/rules.json` clearance; Tom): a team with the ball at `heatAt` or more (a burn coming) and not set to shoot (outside the attacking zone, or in it but not yet in range), not on a breakaway, launches it long with chance `chance` an action: `possession_change` reason `clearance` (`playerId` the clearer), always the other team's ball, in their defensive zone; heat starts again; no burn, so no momentum to anyone. Not a stoppage (the ball's live) nor a keeper's restart. **Dropped** (Tom, 2026-10-10; the code removed, results as before it): see below.

**Measured** (4 leagues × 10 seasons each, about 2,400 matches):

| chance, from heat | clearances | burns | momentum from burns | goals | scorchers |
|---|---|---|---|---|---|
| off | 0 | 3.49 | 3.49 | 7.22 | 25.8% |
| 0.2 from 80 | 2.05 | 2.94 | 2.94 | 6.79 | 23.3% |
| 0.4 from 80 | 4.01 | 2.53 | 2.53 | 6.60 | 20.8% |
| 0.6 from 80 | 5.96 | 2.06 | 2.06 | 6.47 | 18.4% |
| 0.3 from 90 | 1.02 | 3.19 | 3.19 | 6.98 | 24.4% |
| 0.6 from 90 | 2.03 | 2.95 | 2.95 | 6.58 | 23.5% |
| 0.9 from 90 | 3.03 | 2.71 | 2.71 | 6.50 | 21.5% |
| 0.6 from 95 | 0.77 | 3.25 | 3.25 | 6.86 | 24.7% |

Each clearance saves only about a quarter of a burn (the other team's possession can burn too), and costs goals and scorchers: it cuts off hot possessions that might still have reached the attack, and sends the other team back to their own end. At 0.6 from 90 (about 2 a match): balance all met (goals 6.77, burns 2.94, scorchers 24.5%); parity: most Cups 9.4 (limit 9; it has run 8.8–9.8 this milestone, today's league 9.6), the rest met.

**Why it was dropped:** Tom picked 0.3 from 90 (about one a match, balance and parity met) and saw it on screen, then asked where they happen: a hot ball is almost never in a team's own half (the sim recycles only while cool; once warm a team always pushes on), so of 59 clearances in a season 58 came from the attacking third (season 2: heat 80 or more 0 times in a team's own third, 58 in the middle, 1,601 in the attacking third). It was a hopeful ball over the top, not clearing your lines. A mock-up of clearing from deep (from heat 70 in a team's own third or the middle, the ball into space in front of the other net, a defender onto it) looked awkward, and it happened less than Tom had pictured: not worth it. Three picture fixes it turned up stay (`docs/channel.md` §22.3).

## 11. Where numbers live

- **`config/settings.json`** holds real-time timing and the live league's identity (its seed, start date and time zone). This covers the real-time length of a match and of half-time, the season calendar and kick-offs, and segment durations (see `docs/channel.md` §12). The match engine doesn't use it at all; it applies to playback and scheduling.
- **`data/rules.json`** holds everything else: game-clock lengths, burn seconds, heat penalties, contest coefficients, points, home bonus, roster sizes, injury table, lottery weights, development and retirement curves. These are **season 1's rules**.
- **`data/ruleChanges.json`** (Task 229b) holds dated changes on top: see §11a.
- **`data/positions.json`** holds the position weights and the carrier and shooter pick weights.
- **`data/teams.json`** and **`data/regions.json`** hold the teams, the regions and the name pools.

## 11a. Rules by season (Task 229b, Parity and finances; the eras' foundation)

Each season is played under its own rules, so the game can be called and played differently across stretches of time (vision §12, eras) and the record books know which rules a season had. Nothing visible changes yet.

- **Where:** `data/ruleChanges.json`, a list of changes, each `{ id, season, reason, changes }`: a lower-case `id`; `season`, the first season played under it (2 or later; season 1 is `data/rules.json`); `reason`, the League's own, in-universe; `changes`, a partial `data/rules.json` merged over the rules before it (objects merge, lists and values replace). Empty today; the rookie rule (Task 230) is to be the first, at season 2, when the first draft brings rookies into the League.
- **Checked like the rules:** each season's merged rules are validated as `data/rules.json` is (shape, unknown keys, every cross-check, the calendar included), so a typo or an impossible value is caught at load; ids are unique.
- **How the sim reads them** (`src/sim/rules.js`): `seasonConfig(config, season)` is the config with that season's rules, merged once and cached; with no change in effect it's the config itself, so a league without changes plays exactly as before. The entry points hand the engine the season's config, so nothing below them needs the season: `startSeason` and `playNextMatch` (the season's), `runOffseason` (the **coming** season's: a change lands in the off-season before it), and the pre-match card (`src/channel/cards.js`, the fixture's season). Other channel code reads `config.rules` as is: none of it reads a value a change touches yet; when one does, that place moves to `seasonConfig`.
- **Logged:** `rule_change` (§12) at the start of its season, right before `season_start`. Each `league.history` entry's `ruleChanges` lists the changes the season was played under (ids, oldest first); the chronicle's season entry keeps the changes that took effect at its start.

## 12. Event log

One JSON object per line (JSONL), written to `output/<runId>/events.jsonl` in fast-forward runs.

```json
{"v":1,"seq":10452,"season":3,"stage":"regular","round":7,"matchId":"s3-r7-m2","clock":734,"type":"goal","teamId":"t-gulls","playerId":"p-000231","data":{"assistId":"p-000198","scorcher":true,"score":[3,2]}}
```

| Field | Meaning |
|---|---|
| `v` | Schema version |
| `seq` | Global sequence number. It increases by 1 with each event and never repeats, so it is the event's permanent ID. |
| `season`, `stage`, `round` | Where the event happened. `stage` is `preseason` (creating the league before season 1), `regular`, `semifinal`, `final` or `offseason`. `round` is set only in the regular season. |
| `matchId`, `clock` | Match and game-clock seconds. Match events must have both, and league events must have neither (both `null`). |
| `type` | Event type (below) |
| `teamId`, `playerId` | Main subject of the event, when there is one |
| `data` | Fields specific to the event type |

**Match types:** see `sport.md` §14 (this includes `match_result`, stamped at the final whistle). Plus `lineup` (the starters, the bench and, from Task 185, `injured`: the squad's injured player ids, who sit in the dugout too; from Task 230, while the rookie rule is in force, `rookieId`: the rookie who started, or null when the rule lapsed). From Task 214: `goal` carries `keeperId` (who was in goal, or null), since a stand-in keeper's move into goal isn't logged; and `player_of_the_match` (`playerId`, `teamId`; picked by `src/sim/potm.js` from the match's stats with its own seeded stream, so logging it changed no results) comes just before `match_result`, which stays a match's last event.
**League types:** `season_start`, `standings` (snapshot after each round), `playoff_seeding`, `season_end`, `award` (Task 188, stage `final`, after `season_end`: `playerId` and `teamId` the winner and their team, `data` `{ award, value, appearances, shortlist }` plus `saves` and `faced` for the Ironclad (`shortlist`, Task 191: the next two in the stat, best first, each `{ playerId, teamId, value }`, for the plinth's card and the record books); `value` is the stat, a share to four places for save percentage), `retirement`, `player_development`, `draft_lottery`, `draft_pick`, `signing`, `release` (`data.reason`, Task 194b: `roster` over the limit, `call_up` making way for one, `rights_expired` a reserve's rights ended, `position` making room for a position the team is short of; Task 231: `contract_end`, a deal not renewed, with `byPlayer` (Task 243) true when the club wanted to keep them and they chose the market), `contract` (Task 231, §9d: `{ kind, wage, until }`), `reserve` (a pick sent to the Kindling League: `position`, `overall`, `until` the last season the rights are held), `call_up` (`position`, `overall`, `reason` `better` or `short`), `player_created`, `injury_return`, `rule_change` (Task 229b, §11a; stage `regular`, right before `season_start`: `data` `{ id, reason, values }`, `values` each changed rule as `{ path, from, to }`, its dotted path in `data/rules.json`), `induction` (Task 262, `docs/director.md` §6; stage `regular`, after the season's rule changes and before `season_start`: a legend inducted by the Director, `playerId` the player, `data` `{ id, reason }`).

**Complete for the chronicle (Task 214, It remembers' audit).** The log is read closely for the first time by It remembers, and the log must be complete before the launch and Milestone 6 (what was never logged can't be recovered for past seasons). Checked:
- **A match's player lines** (who played, starts, minutes, goals, assists, scorchers, shots, on target, saves, conceded, tackles and steals, fouls, burns, blocks), its result, injuries and player of the match are worked out from its events alone by `src/chronicle/matchLines.js`; `tests/matchLines.test.js` holds them to the sim's `MatchSummary` over a season and a half and over 120 knockouts with many injuries (stand-in keepers, players short, overtime, shootouts). Minutes come from whole-second clocks, within a second or two of the sim's.
- **Where every player is** (a roster, a team's reserves, free agency, retired) follows from `player_created` (preseason: a team or the free-agent pool; later: a draft prospect), `draft_pick`, `reserve`, `call_up`, `release`, `signing` and `retirement`: over 25 seasons the log's whereabouts matched the league's state for all 538 players and every one of 29,500 lineup places (a one-off check in the audit).
- **The rest a career or a team's history needs:** birth region, birth season, position and potential (`player_created`; potential never changes), the overall each off-season (`player_development`), how a player joined (founding roster, draft round and pick, signing, call-up), awards with shortlists, the Pennant and Cup (`season_end`), every result and table (`match_result`, `standings`), injuries and returns.
- **The two gaps found and closed** (logging only; ten seasons of `flareball` identical before and after): the goal's `keeperId` and `player_of_the_match`.
- **Not logged, by design:** the attribute breakdown after development (only the overall; cards show no numbers), the channel's presentation choices (the trophy lift's captain, the interview's quote), and wall-clock times (the calendar turns a season and slot into a time, so "on this day" is worked out in the channel).
- **Needed later, when the thing exists:** `team_created` for expansion teams, and trades if they come.

**Validation:** `src/chronicle/eventLog.js` rejects unknown types, unknown fields and bad context, so a typo fails loudly instead of corrupting the chronicle. A new event type must be added to its list there.

**Volume:** about 200–400 match events per match, so roughly 20k events per season. Fine for JSONL. Log levels can be added later if needed.

## 12b. The chronicle (It remembers, Task 215)

`src/chronicle/chronicle.js` is the league's memory, folded from the event log as it's written (`chronicle.add` is an event sink; pure, no DOM). It keeps compact records that outlast the match events the live league drops after a season, so the record books, the CHRONICLE pane and the player and team cards never need a match's events again:
- **Players** (`players`, by id): name, birth region, position, birth season, potential; how they joined (a founding roster, the draft with its round and pick, or a signing; null for a free agent who never signed); where they are now (prospect, roster, reserves, free, retired) and their team; every move in order (draft, reserve, call-up, release, signing, retirement, with reasons); their overall each season (kept for the cards' words, never shown as a number); a line per season, regular season and playoffs apart (the sim's season stats plus steals and player-of-the-match counts); awards; injuries; retirement.
- **Teams** (`teams`): each season's final place, table row and how far they went in the playoffs; the seasons of their Pennants and Cups.
- **Matches** (`matches`): every result, compact (score, how it was decided, the winner, the player of the match); `headToHead(a, b)`.
- **Seasons** (`seasons`): the teams, the table (after each round; the final table once the season's over), the seeds, the matches in order, the champion, runner-up and Pennant, the awards with their shortlists, who retired.
- **Readers:** `seasonStats(season, part)` (the shape of a `SeasonRecord`'s stats), `playoffs(season)`, `career(playerId, part)`.

**Added in Task 216:** each line also counts **winning goals** (the winner's goal that took them one past the loser's final total; a golden goal is one, a shootout has none); each player keeps a running career total (`totals`, both parts); **milestones** (`milestones`: a career total passing a multiple of its step, in the match it came in: goals every 100, assists every 50, appearances every 100, saves every 500, stops every 1,000: about 2–3 of each a season, Tom) and **notable matches** (`performances`: 3 goals, 3 assists or 15 saves in a match), both from `data/chronicle.json`.

**Records broken** (Task 220b): `recordsBroken`, each record changing hands in the match it fell (all-time, the regular season and playoffs together, and single-season, regular season; goals, assists, saves, stops; someone else's best passed, a holder extending their own isn't; logged from `history.recordsFrom`, season 5): about one a season.

**The record books** (`src/chronicle/records.js`, Task 216; pure, ids and numbers only): `records(chronicle, config.chronicle.records, { upTo })` gives, as of the end of season `upTo` (the channel passes the last season that has aired):
- **Players:** career (all-time: the regular season and playoffs together, which the screen says, Tom), season (the regular season, as the leaders) and the playoffs' own, for goals, assists, scorchers, saves, save percentage (at least `seasonMinFaced` or `careerMinFaced` shots on target faced), stops, appearances, player of the match, winning goals and burns (the playoffs: goals, assists, scorchers, saves, appearances); single-match goals, assists and saves from the notable matches.
- **Teams:** every team's Cups, Pennants and all-time won, drawn and lost (a shootout a win or a loss); the most points, most goals and fewest conceded in a season (finished seasons); the biggest wins; the longest runs of wins, unbeaten and without a win, each within a season with the playoffs (Tom, Task 167).
- **Awards:** how many times each player has won each award, and the most in all.
- Lists are `listLength` (10) long, ties to the earlier season, then fewer seasons, then id. `src/channel/recordBook.js` (the mock-ups, `records.html`) now works from the chronicle and these records.

A match is folded when its `match_result` arrives (`matchLines.js`, Task 214). The live league feeds its chronicle every event (`LiveLeague.chronicle`); since the log runs ahead of the screen, whatever reads it on the channel decides what has aired first. **Tests** (`tests/chronicle.test.js`, and `tests/records.test.js` for Task 216: winning goals one per match won in play, every milestone, the notable matches, every list in order, records as of an earlier season): over six seasons, every table, playoff, award and player line equals the sim's own `SeasonRecord` and history; every player's whereabouts, team and awards equal the league's state; the same seed gives the same chronicle; the live league's (its season-1 match events long dropped) equals a fast-forward's. **Cost:** about 2% on top of the sim (50 seasons: 3.2 s in Node, 988 players, about 2.8 MB as JSON). In Chrome (Task 217): the whole rebuild about 80 ms a season; the chronicle as JSON about 70 KB a season (650 KB at 9 seasons, 3.5 MB at 49, 7.0 MB at 99), a rough size for Milestone 6's saved chronicle before compression, beside about 230 league events a season (the match events, about 26,000 a season, are what a saved full log would add).

## 12c. The facts (Talk that remembers, Task 243)

`src/chronicle/facts.js` says what's notable about a match from the chronicle, for the desk and the interview to pick lines by (vision §12 4½: remembering by selection, a generic line played only when the facts say it's true). Pure; ids and numbers only, the words are the channel's. Its bars and weights are `data/chronicle.json` `facts`. A match's own moments (a late winner, a comeback, a hat-trick, the table) stay in `talk.js`'s `matchFacts`; LATEST stays on `notable.js`.

- **`factsAfter(chronicle, config, events)`**, after a match (its events, ending in the `match_result`), the heaviest first, each `{ kind, weight, teamId, opponentId, playerId, value, ... }`:
  - **Two clubs:** `final_rematch` (last season's finalists' first meeting since; `revenge`, `again` when it's the final once more), `head_to_head_ended` (a first win over a club after 5 or more meetings without one), `head_to_head_run` (5 or more wins in a row over one club).
  - **A team:** `win_run` (5 or more; `clubBest`), `winless_ended` (a first win in 6 or more), the final reached (`first_final`, `final_drought_ended` after 5 or more seasons, `finals_in_a_row` 3 or more), the Cup (`first_cup`, `cup_drought_ended` after 8 or more, `cups_in_a_row`, `dynasty`: 3 in 5 seasons).
  - **A player:** `first_goal`, `milestone` and `record` (the chronicle's own, in this match), `back_from_injury` (their first match since an injury of 3 matches or more, or season-ending, and they scored or were player of the match), `one_more_season` (below), `old_club` (Tom: their first win over a club they played 2 or more seasons for since leaving it, starting or scoring; `how`: `let_go` or `left`, from the release: `byPlayer` below), `likely_last` (a long career's likely last match, below).
  - **A late decider** (from 85% of regulation, or a golden goal; a late equaliser counts) that turned on a scorcher (`scorcher_decider`) or came while the scoring team had momentum (`momentum_decider`). Tom: scorchers and momentum only when they decide a match.
- **`factsBefore(chronicle, config, next, aired)`**, before a match: `final_rematch`, `head_to_head_run` (either side), `old_club` (a player facing a club they played 2 or more seasons for, the first meeting since they left).
- **Only what has aired:** the teams' facts read only the matches before theirs, however far the chronicle has run; the players' facts read where a player is now, so they're worked out as the match airs (the live league's chronicle is at most a round ahead then). Before a match, the caller says which matches have aired.
- **A likely last match** (Tom): retirement is rolled at random after the final, so nobody knows; the odds are arithmetic (`retirementChance` in `offseason.js`, the sim's own, by age, position and form). The fact fires at a player's last match of the season (their team out of the playoffs at the regular season's end, a semifinal lost, the final either way; `champion` if they won it) when the odds are 50% or more and the career is 10 or more seasons and 140 or more matches. It's right about 6 times in 10 (13 of 22 over 40 seasons), so its lines say "may". **Why 50% and not 85%:** careers end at 33–35 at odds of 30–70%; only a few play on to 37 and beyond (85%+), so a high bar (85%, 8 seasons, 200 matches) never fired in 20 seasons. **One more season** (`one_more_season`, Tom): when a likely last match wasn't, the player's first match of the next season says so (their previous match met the rule; nothing stored): about once in 6–7 seasons (6 in 40).
- **Logged for it:** a `release` for `contract_end` carries `byPlayer` (the club wanted to keep them and they went to the market for what they want; the motive itself never goes on screen). The chronicle keeps each player's last two matches (`lastMatchId`, `prevMatchId`). Neither changes the league: the same seed gives the same results.
- **How often** (`npm run facts -- --seasons 40`, seed `facts`, 59 matches a season; per 100 matches): after a match, a record 1.2, likely last 0.9, a Cup's fact about 1.2 all told, a final reached 1.3, `final_rematch` 1.7, `old_club` 5.6, milestone 15.8, `scorcher_decider` 5.0, `momentum_decider` 1.8, `head_to_head_ended` 5.4, `head_to_head_run` 5.9, `winless_ended` 3.2, `win_run` 5.1, `back_from_injury` 0.8, `first_goal` 18.1. About half of matches have a fact, about 1 in 9 one weighing 7 or more (the history-making kind). Before a match: `old_club` 4.5, `final_rematch` 1.7, `head_to_head_run` 5.8.
- **For the interview** (Task 245): the match's own moments too, `late_decider` (any late winner, late equaliser or golden goal), `goal_haul` (four goals or more by one player: three come in about 7 matches in 10, so a hat-trick is no story here) and `comeback` (from two down), and `first_goal` only from season 2 (in the founding season everyone's is). The desk's own match moments stay in `talk.js`'s `matchFacts` for now. `src/chronicle/factsLeague.js` (`collectFacts`) runs a league and gathers every match's facts and player of the match, for the report, the tests and `interviews.html`.
- **On the channel** (Task 246a): `FactsLog` (`src/chronicle/factsLog.js`), an event sink with a chronicle of its own fed as the log is written, works out each match's facts the moment it's folded in (so they read the league as it stood after that match, whenever they're asked for) and tops up a final-round match's likely last matches at the playoff seeding (`seasonOverFacts`), which follows the round at once. The live league, the report, the tests and the dev pages all use it. First finals and first Cups count from season 2, like first goals.
- **Tests** (`tests/facts.test.js`): over 25 seasons, every kind checked against the chronicle (bars, finals, Cups, old clubs, the late minute, the odds), the same seed the same facts, the teams' facts the same with the whole league folded in, `byPlayer` both ways.

## 12a. Rough tuning results (Task 9)

Measured over 1,000 matches with the defaults in `data/rules.json`. Formal tuning over full seasons is Task 14.

| Per match | Result |
|---|---|
| Goals | 6.6 |
| Shots | 50 |
| Burns | 4.2 |
| Fouls | 4.5 |
| Free shots | 1.0 |
| Injuries | 0.12 |
| Scorchers | 29% of goals |
| 0–0 draws | 0.8% |
| Draws | 9% |
| Events | about 440 |
| Time to simulate | about 1.5 ms |

## 13. Module map (Milestone 1)

| Module | Responsibility | Task |
|---|---|---|
| `src/config.js` | Load and validate settings and rules | 4 |
| `src/sim/rng.js` | Seeded generator and streams | 5 |
| `src/chronicle/eventLog.js` | Event builder and JSONL writer | 6 |
| `src/sim/players.js` | Generation, overall rating, names | 7 |
| `src/sim/schedule.js` | Double round-robin schedule | 8 |
| `src/sim/match.js` | Match engine | 9 |
| `src/sim/standings.js` | Table, tiebreakers, stats | 10 |
| `src/sim/season.js` | Rounds, playoffs | 11 |
| `src/sim/offseason.js`, `draft.js` | Lifecycle, draft, free agency | 12 |
| `src/cli/ff.js`, `balance.js` | Fast-forward runner, balance report | 13–14 |
| `src/sim/potm.js` | Player of the match (moved from the channel, logged) | 214 |
| `src/chronicle/matchLines.js` | A match's player lines from its events alone (the chronicle's per-match fold) | 214 |
| `src/chronicle/chronicle.js` | The chronicle: players, teams, matches and seasons folded from the log (§12b) | 215 |
| `src/chronicle/records.js` | The record books: player, team and award records from the chronicle (§12b) | 216 |
| `src/chronicle/notable.js` | What's notable: seasons' and off-seasons' stories, landmarks, legends, on this day (channel.md §20.3) | 220 |

## 14. Notes to revisit
- **Two balance values at their edges** (Gameplay pass 2, Task 85; Tom, 2026-10-05: noted, no action): the league average overall's drift reads 3.0 against a limit of 3 on the standard run (5 leagues; 1.8 on seeds `check`), and with 10 leagues the average most titles by one team per 10 seasons reads 4.1 against 4. Both read the same on the code before that milestone's only sim change, so they sit at the edge whatever the sample. Worth a look in a later sim pass (player development, dynasties), not before.

- Position weights (§5) are approved as a starting point. Adjust them if balance runs show odd results.
- The playing-time development bonus (§6.2) stays. With squads this small, watch whether it unfairly holds back bench players or backup keepers, and check this in the Task 14 balance report.
