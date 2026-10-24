# Parity and finances: the design (Task 229)

Milestone 4¼ (vision §12; hand-off in `docs/tasks.md`). Two simple mechanics so bad teams don't stay bad and players move: **the rookie rule** and **a salary cap with secret motives**. This doc is the design, written with Tom; the numbers come from quick models (throwaway patches measured with `npm run parity`'s metrics, then reverted). Today's baseline is in `docs/simulation.md` §10b.

**Settled with Tom** (2026-10-09; the questions asked with Claude's suggestions): marked ✔ where they land. Still open: the currency's name (❓).

## 1. What the baseline says

- **Cups are already close to luck** (the four-team playoffs shuffle them). The problems are a **sticky table** (teams move 1.75 places a season against luck's 2.6; a bad team in the bottom half 12–14 seasons running against luck's 7½) and **players never moving** (0.1–0.2 moves an off-season; 2% of long careers at two clubs).
- **The gap between top and bottom is small but steady.** A season's champions start with a top five averaging 84.2 overall; the last-placed team 78.5. The difference is mostly stars: the champions carry about 4 players of 80+, the last-placed 2.
- **Rookies are weak.** Draft prospects arrive at 35–60 overall; only the two headline prospects (66–80) are good on arrival, and they go to the top of the lottery.

## 2. The rookie rule

### The rule (Tom)
- Every team **starts a rookie** in every match, **playoffs included**.
- A **rookie** is a **drafted** player in their first season in the League: one who had never played a League match before this season. A Kindling League call-up who hasn't played counts. They stay a rookie for the whole of that season. ✔ **Only drafted players** (Tom): a made-up player filling a position, or an older free agent who somehow never played, never counts.
- **Start and stay:** the rookie comes off only when tired or injured. The sim already substitutes only for those two reasons, so nothing changes there.
- **A keeper counts.**
- **If no rookie is fit,** the rule lapses for that match.

### How the sim does it
- **Who has played:** a new player field, `debutSeason`, set the first time a player starts or comes on. A player is a rookie if they were drafted (`draft` set) and `debutSeason` is unset or equals the current season. The founding season's players were never drafted, so never count.
- **The lineup** (`selectLineup`): pick the five as today. If none of them is a rookie, the team's fit rookie whose swap costs least takes the place of the weakest starter **at the rookie's own position** (a rookie keeper replaces the keeper). The pre-match card uses the same function, so it shows the rookie too.
- **Keeping a rookie on the roster:** through the off-season, a team never releases or sends to the reserves its last player who hasn't played. **Without this the rule does nothing:** picks often go to the reserves, so the rule lapsed in 32% of matches and the parity numbers didn't move.
- **Logged:** the `lineup` event gains `rookieId` (the rookie who started, or null when the rule lapsed); a player's first match can be told from it.
- **Rules by season:** the rule is a rule value (`roster.rookieStarters`, 0 in `data/rules.json`), switched on by the **first rule change, at season 2** (Tom): after the first season the League brings in the draft, and with it the rookie rule. That's why the founding season has none, and HISTORY gets its first landmark.

### Built (Task 230, 2026-10-09)
As designed, with `roster.rookieStarters` brought in at season 2 by `data/ruleChanges.json` ("With its first draft, the League brings in the rookie rule: every side starts a rookie."). The real build matched the quick model below: most Cups 9.0 / 8.6, bottom-half run 8.6 / 12.0, places moved 2.36 / 2.39 (`parity` / `check`); balance met but for two (`balance` and `alt` seeds): **the career median fell to 3** (the forced rookies who play their one season and are let go now count as drafted players who played: 185 of 538 careers on 3 leagues were one season; before, such picks never played; careers past the rookie season still have a median of 9, and a third run 10+), and the best top-scorer season on `alt` reached 67 (limit 65; weak rookies on the pitch, goals 7.0–7.1 a match). Both for Tom.

### Measured (quick model, 5 leagues × 40 seasons on two seed sets)

| | Today `parity` / `check` | With the rule `parity` / `check` | Luck | Target |
|---|---|---|---|---|
| Most Cups by one team | 9.8 / 9.8 | 9.0 / 9.0 | 8.3 | ≤ 9 |
| Longest run in the bottom half | 12.6 / 14.2 | **8.6 / 11.8** | 7.6 | ≤ 8 |
| Places a team moves a season | 1.75 / 1.78 | **2.36 / 2.33** | 2.63 | ≥ 2.2 |
| Longest Cup drought | 29.2 / 30.4 | 24.0 / 28.8 | 27.1 | |
| Goals per match | 6.82 / 6.78 | 7.09 / 7.18 | | 5–8 |

- **How often:** a rookie was already in the five in 13% of lineups (usually a headline prospect), forced in 83%, and the rule lapsed in 4% (injuries, or no rookie left).
- **What it costs:** the forced rookie averages **54 overall, 24 points below the starter they replace**. A rookie keeper was 21% of them (goals rise a little).
- **Who pays:** last season's top half lost about **twice as much** to the rule as the bottom half (396 rating points a season against 206). That's the rubber band.
- **Verdict:** a strong, simple lever. It meets the places-moved target on its own and nearly the bottom-half one; Cups at the target. **The bottom-half run on the `check` seeds (11.8) still needs the money side.** Players still don't move: that's the money's job.

### Settled on the rule
1. ✔ **Only drafted players are rookies** (Tom), above: the founding free agents and the replacement-level players the sim makes when free agency has nobody at a position never count, so no team signs a 70-rated 28-year-old "rookie".
2. ✔ **The founding season is exempt** (Tom): it has no rookies, so the rule lapses in season 1 and starts in season 2; it has almost no effect on anything else. A stand-in for season 1 (a player 21 or younger must start) was considered and not taken.

## 3. The money

### The currency ❓
Tom would like it **familiar to viewers**: **pounds** (closest to soccer) or **crowns** (made up, but a real-sounding currency). Amounts written like `£4.2M` or `4.2M crowns`. *Claude: crowns keeps the world its own without tying it to Britain, still reads as money at a glance, and needs no £ glyph in the pixel font; pounds is the more instantly familiar. Tom to pick; it matters only from Task 231 (logged amounts are plain numbers) and Task 234 (on screen).*

### Wages and the cap
- **A player's market wage comes from their value** (today's `playerValue`: current overall, plus half the growth still to come for the young). It rises steeply, so stars are dear: about **×1.10 per rating point**, with a minimum wage at the bottom. A wage is fixed for the length of a contract; players who develop become bargains and players who decline overpaid, which is what makes moves happen when deals end.
- **One cap for every team,** set against the league's average payroll. Measured: under a ×1.08–1.12 curve, a season's champions start with a payroll of **117–125%** of the league average, the last-placed **71–79%**. A cap at about **105–110% of the average** bites the top three or four teams and leaves the bottom with room. It's a **hard cap**: a team can't go over it to re-sign its own players.
- **A maximum contract** of about **25% of the cap**, so any team can afford one star (on the curve alone, the league's best player would cost 35–50% of an average payroll).
- **Over time:** ✔ **constant** (Tom): no rising values until the league is balanced. The cap and the wage curve are rule values (Task 229b), so inflation can come later as a rule change.

### Contracts
- **Rookie deals:** every draft pick signs a **3-season** deal on a fixed scale by pick (the No. 1 pick paid most, all of them cheap). Matching the Kindling League's 3 seasons of rights. This is a parity lever: a bottom team's top pick is a bargain while their deal lasts.
- **Other contracts: 1–4 seasons,** the young leaning long and veterans short.
- **When a deal ends: the re-signing window** (✔ Tom, Task 231, "variant B"; changed from the first design, below). Before free agency each club looks at its expiring players, most valuable first, with their old wages off its books. It **re-signs one at the market wage if that fits under the cap and no free agent already on the market at his position is worth more for a wage it could afford**; the rest go to free agency (`release`, reason `contract_end`), where any club, theirs included, can sign them. The cap is what breaks a strong side up: stars who've grown cost more than their old deals, and not all of them fit. In Task 232 the player gets a say (his motive, with a small ✔ **familiarity plus** for his club, Tom: about 5% of a wage).
- **Why not "everyone to the market"** (the first design): measured, it moved players (83% of long careers at two clubs) but ended young careers: a rookie deal running out at 22 put a developing player up against veterans for the few open places, and the free-agent pool's limit sent him out of the League. Four versions measured (5 leagues × 30–40 seasons): everyone to the market: 83% at two clubs, career median past the rookie season 3; **B**: 54–56%, 3; re-sign unless the weakest at his position: 7%, 6; keep the developing, veterans to the market: 11%, 8 (before contracts: 7%, 10). The median past the rookie season is the fringe's (about 16 newcomers a season for 80 places, most wash out whatever the rules); **players who got good keep long careers under B**: those who reached 85+ play a median 13 seasons (14 before) and 52% play for two clubs or more (2% before); 75–84: 10 seasons (13), 61% (11%). So the balance report's career target became the careers of drafted players who reached 75+ (Tom).
- **Releases** (today: over the roster limit, making room for a position) stay; a released player's wage stops (no dead money, to keep it simple).
- **The reserves are off the cap** (Claude's suggestion, taken): a pick in the Kindling League keeps their rookie deal, paid by the reserves.

### Built (Task 231, 2026-10-09)
- **Values** (`rules.finances`, thousands a season): cap **20,000** (about 112% of the average payroll, which settles near 17,800; 18,000 and 20,000 measured, within seed noise of each other), minimum wage 250, 400 at a value of 60, ×1.10 a point, maximum contract 25% of the cap (5,000; about one rostered player in ten is on it), rookie deals 3 seasons from 1,200 (No. 1 pick) down to 300, other deals 3–4 seasons to age 24, 2–4 to 30, 1–2 after.
- **The cap evens payrolls:** a season's champions start at 101–104% of the average payroll (111% with no cap).
- **Over the cap** only by rookie deals and minimum-wage fills (a roster must always be full): about one team-season in eight starts a little over.
- **The founding squads fitted to the cap** (Task 251, 2026-10-10): at the market wage, 25 of 40 founding squads (5 leagues) were over the cap, one by 17.6M, and 14 still over in season 2. A squad over it now has every wage above the minimum cut by the same share to fit (`fitToCap`); the rest are left as they are. Season 1's matches are unchanged; results change from the first off-season. Measured before and after (24 parity sets, 12 balance sets, 72 leagues): the richest founding clubs do a little better in seasons 2–5 (the two richest win 1.47 Cups between them to 1.17; fair 1.0), level by season 10; most Cups 8.91 to 9.18 (within noise; the target of 9 already missed in a third of sets) and the bottom-half run 9.31 to 9.13; balance unchanged but for the drift, which measures from the first off-season (squads that kept their stars, -1.1 to -2.3; the last season the same).
- **Parity after it** (10 leagues each, `parity` / `check`): places moved 2.36 / 2.32, moves 4.0 / 3.9 an off-season, long careers at two clubs 56% / 54% (all met); most Cups 11.0 / 9.1 and the bottom-half run 10.5 / 9.5 (not yet: Tasks 232–233).

### Secret motives (Tom)
- Each player has a hidden lean towards **money**, **winning** or **home**, drawn when they're created and **leaning by age**: the young towards money, veterans towards winning, home at any age.
- ✔ **The mix** (Tom): under 25: money 50%, winning 20%, home 30%; 25–30: 35 / 35 / 30; 31 and over: 20 / 50 / 30. These are **shares of the league, not every player's odds**.
- **Each player is different** (Tom asked whether age affects everyone equally: it doesn't, in effect). A player has a **personality**: three hidden weights (money, winning, home) drawn once when they're created. Age then moves everyone's weights by the same amount (money down, winning up, a little each season past the mid-twenties), and **whichever weight is strongest** decides how they choose. So the same nudge lands differently:
  - a **strong home-lover** stays one all career, whatever their age;
  - a **balanced** player tips from money to winning somewhere around 27–30;
  - a **born money-chaser** may chase the biggest offer even at 33.
  The weights' spread and the age nudge are tuned so the league's shares come out as the mix above.
- **How a player scores an offer:**
  - **Money:** the offer itself.
  - **Winning:** the offer plus a bonus for a team **going places**: its strength for the coming season as its roster stands (its best five), not last season's table, so a rising team draws them as much as the champion.
  - **Home:** the offer plus a bonus for their own region's team.
  - The bonuses are worth a **pay cut** of up to about 20–30% (tuned in Task 232).
- **The watch-out (Task 232 measures it):** winning-minded players taking a pay cut to join the champions would stack the strong. The hard cap stops it beyond a point (the champions run out of room), and "going places" spreads them. The motive mix is the knob.
- **Viewers never see the motive.** They infer it from choices; Talk that remembers can say it ("took less to come home"). It's logged (the log is complete; nothing on screen reads it).

### Free agency
After the draft, as today, but with money:
1. **The market:** this off-season's expiring deals, the released and the unsigned.
2. **Best players first:** each team that wants a player (value, need, style, as today) and has room under the cap makes an offer: the market wage, or less if that's all the room it has.
3. **The player picks** the offer that scores best for their motive, and signs (wage and length).
4. Then the next player, until rosters are full. Teams still short sign the cheapest who fit, generated at the minimum wage if needed (as today).

### The local pull eased
`roster.localBonus` (10 today) drops, perhaps to 5 (measured in Task 232), so the draft leans less on region. **Home-minded free agents** bring the regions' flavour back through free agency instead. The home-grown share (about 53% today) is watched in the balance report.

### Logged
- **`contract`**: a deal signed: `teamId`, `playerId`, `wage`, `seasons`, `kind` (`rookie` | `free_agent` | `re_sign`), and the offers turned down (for stories: "turned down more from X").
- **`contract_end`**: a deal ran out (before free agency).
- **`signing`** keeps its place; **`player_created`** gains the player's motive weights.
- **The cap** each season in the season's rules; a team's payroll can be summed from contracts.

### Built (Task 232, 2026-10-09)
- **Personality** (`player.motives`): three weights drawn N(0,1) once from the player's own stream (`motives|<id>`, so nothing else was reshuffled), logged in `player_created`. **Motive** (`players.motiveOf`): every season of age past 27.5 moves 0.06 from money to winning (before it, the other way), home −0.05, the strongest wins. Fitted to Tom's mix; on rosters it comes out 51/21/27 under 25, 34/37/29 at 25–30, 25/48/26 at 31+ (money/winning/home).
- **Offers** (`finances.offerFor`): the market wage; with less room, the room down to 75% of it; nothing below that. **Over the market:** a team with a quarter of the cap free offers up to 20% more for a player worth 2,500+ (never over the maximum contract). Tom: try it, keep it only if parity holds: with it most Cups 9.4 / 9.1 against 10.5 / 9.4 without, and bottom-half runs 10.2 / 9.4 against 10.6 / 9.8, so it stays (21% of market signings are over the market).
- **How a player chooses** (`finances.offerScore`): the wage × (1 + lift): winning-minded +25% × how far the team is going (its best five as the roster stands, 0 the league's weakest to 1 its strongest); home-minded +25% at their region's team; +5% for the club he's just left (the familiarity plus).
- **The re-signing window, the player's say** (`testsMarket`): offered a new deal, he goes to the market instead if what he wants lies elsewhere: money, if another team could offer more than the market wage; winning, if his club is in the bottom half by how far it's going and a team going further could afford him; home, if he isn't at his region's team and it could afford him. His club can still sign him there, with the familiarity plus.
- **Free agency, player-first:** first the reserves fill teams' short positions; then the market: the best free agent first, every team with a place (and a need at his position, if it has one) and the room bids, he signs where his score is best (ties to the worse team); one nobody can afford waits. Then the old fill-up (minimum-wage deals, made-up players). The market doesn't use the team's own local and style leanings (the draft keeps them): home-minded players carry the regions instead.
- **The local pull eased:** `roster.localBonus` 10 → 5 (Tom's ask, with home-minded free agents taking over). Home-grown share on rosters about 40% (53% before).
- **Logged:** `contract` gains `turnedDown` (the other offers, `{ teamId, wage }`) for market signings.

**Measured** (5 leagues × 30 seasons, and parity on 10 leagues per seed set):
- **The watch-out (winning-minded players stacking the champions): not happening.** 25% of winning-minded market signings go to last season's top two, which is exactly their share of the league (2 of 8); "going places" and the cap spread them.
- **Home-minded:** 37% of their market signings are at their region's team (a quarter of a wage isn't always enough, and their team needs a place).
- **Movement:** 8.3 market signings an off-season; 5.5 / 5.6 moves; **73% of long careers at two clubs or more** (target 50%; 54–56% after Task 231).
- **Parity** (`parity` / `check`): most Cups 9.1 / 9.4 (limit 9), longest bottom-half run 9.4 / 10.2 (limit 8), places moved 2.31 / 2.35 (met). For Task 233.
- **Balance:** every target met on the default and alt seeds (goals 7.1 a match, titles 3.5 / 3.3, careers of those who reached 75+ 12 / 11; the 67–69-goal top-scorer seasons gone).

### Balance and parity (Task 233, 2026-10-09)
The last of parity wasn't money: a club's playing style was a permanent edge (the same aggressive, quick clubs won every league). Fixed in the match engine (`docs/simulation.md` §4.7, §10b): tempo flattened, aggression paid for in fatigue. Final numbers: most Cups about 8.9, the bottom-half run about 9.2 (target eased to 10, Tom), places moved 2.37, moves 5.6 an off-season, long careers at two clubs 73%; balance met.

## 4. What viewers see (Task 234; mock-ups first)

**The money:** guilders (Tom, 2026-10-09: a defunct currency suits the world, and crowns would clash with the Royale's crest), written ƒ4.2M a season from a million, ƒ850K below (`src/channel/money.js`); VT323 has the florin sign. **Where:** a MONEY tab in the CHRONICLE pane for team finances (moving to the team panes when It remembers resumes) and an off-season studio card for the League's (Tom). Mock-ups on `finances.html`. **Built** (Task 234, Tom's picks): `docs/channel.md` §21. Open: the maximum contract (about one rostered player in ten is on it, so the biggest deals all read ƒ5.0M); left at 25% of the cap for now.

- **The rookie** marked on the pre-match card and in the Rulebook's rules.
- **The moves board** in the off-season show with each signing's deal (who left whom, for how much, how long).
- **A financial picture:** a team's payroll and cap room, the league's biggest contracts, wherever Tom picks (the CHRONICLE, the team card when It remembers resumes, a studio card).

## 5. The build (from `docs/tasks.md`)
229b rules by season → 230 the rookie rule → 231 contracts, wages and the cap → 232 motives and free agency (the local pull eased) → 233 balance and parity → 234 on screen → 235 the check.
