# Sport Rules

> **Status:** Approved for Milestone 1 (2026-10-02). **[Default]** = proposed value, easy to change. **[Open]** = still to decide.
> Every number marked *(setting)* lives in `config/settings.json` or `data/`, not in code.

This doc defines the exact rules the simulation follows. Viewers never need to read it. Everything they need is visible on screen: who has the ball, how hot it is, and the score.

---

## 1. Name

**Scorchball** (decided by Tom, 2026-10-05; the working name was Flareball). "A scorcher" is a fast, hard shot in several sports. Other options were *Emberball*, *Kindle* and *Scorch*.
The name should reflect the heat ball. Commentary vocabulary follows from it: the ball "burns", a team is "running hot", a "scorcher".

## 2. Summary

A fast, walled-pitch, 5-a-side game derived from soccer. The ball heats up the longer one team holds it. When it reaches red, that team must shoot or lose possession. The heat ball sets the tempo, guarantees attacks, and provides the sport's signature stat: how players perform under heat.

## 3. The pitch

- A rectangle with a goal at each end, enclosed by **boards**, as in indoor soccer. The ball stays in play off the boards, so there are no throw-ins or corners and play keeps flowing.
- Each goal has a semicircular **crease**. Only the defending keeper may stand in it.
- For simulation purposes the pitch has three **zones**, named relative to the team in possession: **Defensive**, **Middle** and **Attacking**. The match sim moves the ball between zones; it does not track exact coordinates.
- Visual size is roughly 2:1 (for example 40 × 20 m). This is for the channel only and has no effect on the sim.

## 4. Teams and positions

**5 players per side** on the pitch, with a **matchday squad of 10** *(setting)*: the whole roster of 10, everyone fit (9 until Task 174c, which left one fit player out each match).

| Position | On pitch | In squad | Job |
|---|---|---|---|
| **Keeper (K)** | 1 | 2 | Saves shots, restarts play, may handle the ball in the crease |
| **Defender (D)** | 2 | 3 | Tackles, intercepts, blocks shots |
| **Midfielder (M)** (the playmaker; called P until 2026-10-05, Tom) | 1 | 2 | Moves the ball forward, creates chances, controls tempo |
| **Striker (S)** | 1 | 2 | Finishes chances, presses the opposing defence |

**The rookie rule** (Tom, 2026-10-09; Task 230; from season 2, when the first draft brings rookies in): every team **starts a rookie** in every match, playoffs included. A rookie is a drafted player in their first League season, who had never played a League match before it (a Kindling League call-up who hasn't played counts; a founding player or a free agent who was never drafted doesn't). The rookie stays on unless tired or injured; a keeper counts; with no fit rookie the rule lapses for that match. It costs a strong side most: a bottom team's rookie is usually a top pick who would start anyway, a champion's a late pick.

## 5. Player ratings

Every player has the same set of attributes, rated **1–99**. Each position weights them differently when calculating an overall rating; the weights live in `data/` *(setting)*.

| Attribute | What it drives |
|---|---|
| **Shooting** | Shot accuracy and power |
| **Passing** | Progressing the ball between zones, creating chances |
| **Dribbling** | Beating a tackle while carrying the ball |
| **Tackling** | Winning the ball back, blocking shots |
| **Pace** | Counter-attacks, getting to loose balls |
| **Composure** | Performance as the ball heats up (the twist stat) |
| **Stamina** | How slowly ratings fade during a match |
| **Keeping** | Saves and crease control (matters only for keepers) |

Composure is what separates clutch stars from ordinary players. Shooting and passing penalties under heat are scaled down by it.

## 6. Match length and clock

- **Two halves of 20 game-minutes** each (40 total) *(setting)*. The game clock runs continuously, with no stoppage time.
- Real-time length is set separately *(setting)*. The default plays a 40-minute match in about **16 real minutes**, in line with the vision's 15–20 minute target.
- Half-time is a short break *(setting)*. The other team kicks off the second half.

## 7. Flow of play

1. **Kick-off** from the centre at the start of each half. Home team kicks off the first half.
2. **Possession phases.** The team with the ball tries to move it Defensive → Middle → Attacking, then shoot. Each step is resolved from the involved players' ratings plus a seeded random roll. The steps are carry, pass, tackle, interception and shot; exact formulas go in `docs/simulation.md`.
3. **Possession changes** on: a tackle or interception, a keeper save that is held, a missed shot (keeper restarts from the crease), a **burn** (see §8), a foul by the attacking team, or a goal (see 5).
4. **Shots** end in a **goal**, **save**, **block** (by a defender) or **miss**. Saves and blocks may leave a loose ball, contested on Pace.
5. **After a goal,** the conceding keeper restarts at once from the crease, as in handball, so there is no slow walk back to the centre.

## 8. The heat ball (signature twist)

The ball tracks **heat**, from 0 to 100, which builds the whole time one team has possession.

| Stage | Heat | Ball colour | Effect |
|---|---|---|---|
| **Cool** | 0–49 | White | None |
| **Warm** | 50–79 | Yellow/orange | Small passing penalty, reduced by Composure |
| **Hot** | 80–99 | Red | Bigger passing penalty. Shots get **+power** (harder to save) but **−accuracy**. Both are scaled by Composure. |
| **Burn** | 100 | Flash | **Burn:** possession passes to the opposition where the ball is. Recorded as a turnover against the carrier. |

- Heat rises at a fixed rate per game-second of team possession *(setting)*. The default reaches Burn after **40 game-seconds**. This was raised from 24 to 36 during engine tuning (24 left too little time to build an attack, so burns happened 10–20 times a match instead of a few), then to 40 in Milestone 2 alongside fewer tackles, so the longer possessions don't burn far more often.
- Passing within a team **does not** reset heat. Only a change of possession resets it to 0.
- A shot taken while the ball is Hot that scores is a **scorcher**. This is a tracked stat and a commentary moment.
- Why it works: it forces attacks (helping hit the scoring target), it is readable at a glance (the glowing ball), and it creates the Composure skill and clutch stars.

### momentum (Momentum, Tasks 236–237)
- A **scorcher** gives the scoring team **momentum**; a **burn** gives it to the other team.
- While it lasts, every one of that team's players is a little better (+3 rating points *(rules)*) whenever the team has the ball, fading steadily to nothing over **90 game-seconds** *(rules)*. It doesn't help them defend (measured: on every contest it mostly stopped the other side scoring, rather than leading to attacks).
- It never stacks: a scorcher or burn in the window starts it again, full, from that moment; the other team's takes it over. It ends with the period and before a shootout.
- About 5 times a match, two-thirds of them from burns; it goes to the stronger side about half the time, so it helps neither the strong nor the weak (`docs/simulation.md` §10c).

## 9. Scoring

- Every goal is worth **1 point**. There are no multi-point goals; the twist changes tempo, not points.
- **Target:** about **5–8 total goals per match** *(tuning goal, checked by the balance report)*.

## 10. Fouls and free shots

**[Default]**, kept deliberately small for Milestone 1:
- A failed tackle can be called a **foul** *(setting: probability)*.
- A foul by the defending team in its own Defensive zone gives a **free shot**: one shooter against the keeper from a fixed mark, with the ball reset to Cool.
- Any other foul gives possession to the fouled team where the foul happened.
- No cards in Milestone 1. They can be added later through the same data-driven rules.

## 11. Substitutions, fatigue and injuries

- Ratings fade slightly over the match according to Stamina *(setting)*.
- **Rolling substitutions**, up to **3 per match** *(setting)*. The sim makes them automatically for fatigue or injury.
- **Injuries** are rare events *(setting: rate)*. An injured player leaves the match and may miss future matches; durations are defined in `docs/simulation.md`.

## 12. Results and the table

- **Regular season:** draws are allowed. **Win 3, draw 1, loss 0** *(setting)*.
- **Home advantage:** a small rating bonus for the home team *(setting)*.
- **Tiebreakers** in order: points → goal difference → goals scored → head-to-head points → head-to-head goal difference → drawing lots (seeded RNG).

## 13. Season finale (day 7)

- **Top-4 playoffs:** semifinals 1 v 4 and 2 v 3, then a final. All are single matches.
- The higher seed is the home team in the semifinals and the final, with the usual home advantage (Tom, 2026-10-05: the final was on neutral ground, the only ground that wasn't a team's).
- The **playoff winner is League Champion**. The playoff winner lifts the **Scorch Cup**; the regular-season table winner takes that season's **Pennant** ("the Season 1 Pennant"; Tom, 2026-10-07: it was the Shield). In code and the event log it's still `shieldId`.
- **Knockout ties:** **golden-goal overtime** of 5 game-minutes *(setting)*. If it is still level, a **shootout**: each team takes alternating free shots, best of 3, then sudden death. To fit the twist, each shot starts Hot.

## 14. What the sport emits to the event log

Every match produces events in the shared format defined in `docs/simulation.md`:
`kickoff`, `possession_change`, `heat_stage` (Warm/Hot), `burn`, `momentum` (Task 237: who gained it, by a scorcher or a burn, whether it extended their own, and when it ends), `shot`, `save`, `block`, `miss`, `goal` (flagged `scorcher` when Hot; from Task 214 with `keeperId`, who was in goal), `foul`, `free_shot`, `substitution`, `injury`, `half_time`, `full_time`, `overtime_start`, `shootout_kick`, `player_of_the_match` (Task 214), `match_result`.

## 15. Open items and ideas for later

- [x] Sport name: **Scorchball** (Tom, 2026-10-05; was Flareball, with a flare goal now a scorcher)
- **Less downtime.** Fouls and free shots (§10) may be simplified or cut later so matches have as little dead time as possible. Revisit after watching matches in Milestone 2.
- **Line changes instead of soccer-style subs.** One option is lacrosse- or hockey-style attacking and defending lines that rotate during play. That would make the sport more distinctive but adds complexity. For now, keep the soccer-style substitutions in §11.
