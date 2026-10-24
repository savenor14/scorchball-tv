# Scorchball TV

**A made-up sport, simulated around the clock and shown as a live pixel-art sports channel.** Watch it at [scorchball.tv](https://scorchball.tv).

Eight invented clubs play Scorchball, a five-a-side game a little like football mixed with hot potato, and the channel shows it live in pixel art: the matches, the table, the studio desk, the ads, and an evening podcast. A season lasts a week; the league remembers every champion, record, and legend.

It's a solo hobby project built with Claude Code: I directed and Claude wrote every line, over three weeks in October 2026. My only coding experience before this was HTML and CSS. The whole story, the workflow, how it works, and the challenges, is in **[How Scorchball TV was built with Claude Code](https://scorchball.tv/how-it-was-built)**.

## What's here

This is a copy of the project's files as they stand, refreshed now and then from the private repo the site deploys from (no history).

- `index.html`: the channel. `about.html` and `how-it-was-built.html`: the pages beside it.
- `src/sim/`: the engine (no DOM): the match, the season, players, the draft, finances, its own maths so every browser agrees.
- `src/chronicle/`: the event log and everything folded from it: the chronicle, the records, the facts the talk is built from.
- `src/channel/`: the channel: the programme, the canvas drawing, the overlays, the sound.
- `src/director/`: the Director: the watchers that propose rule changes, and the desk.
- `src/cli/`: the dev server and the tools (fast-forward, balance, parity, the day keys, publish).
- `config/`, `data/`: every timing, rule, team, and line of commentary.
- `worker/`: the audience service (a Cloudflare Worker): viewer counts, votes, notes, Fan Coins.
- `tests/`: `node:test` files.
- `CLAUDE.md` and `docs/`: the working rules every session read first, and the design docs (the vision, the sport, the simulation, the channel, the finances, the Director, the podcast, the colours, the studio cards). They mention internal planning docs (the task list, the hand-offs, the roadmap) that aren't in this copy.

Not here: the voice clips (`assets/voices/`, made with ElevenLabs; the channel runs without them, silently where the talk would be), the internal docs, and the daily job that publishes the live league's keys from its secret seed.

## Run it

Node 24 and no build step. The channel itself has no dependencies; the dev tools have two (`ffmpeg-static` and `kokoro-js`), and the dev server loads one of them, so install them first:

```
npm install
npm run channel
```

Then open http://localhost:8080/. Without the live league's keys from the future, it plays the published days and then shows BACK SOON; `?seed=anything` plays a league of your own from that seed instead. `npm test` runs the tests; `npm run ff -- --seasons 10 --seed demo` fast-forwards ten seasons and prints them.

## Licence

The code is under the [MIT licence](LICENSE). The league, its teams, players, places, and sponsors are fictional. The lettering is VT323 by Peter Hull, under the SIL Open Font License 1.1 (`assets/fonts/OFL.txt`).
