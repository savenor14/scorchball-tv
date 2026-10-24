// The player card's contents (It remembers, Tasks 221–222; docs/channel.md §20.5): who they are, how they joined, their
// standing in words (Tom: no ratings or numbers behind it), this season, their career season by season, and their
// honours (Tom, Task 221: one scroll, the season its career's top row, no standing season by season, no home-grown).
// Pure: reads the chronicle (only what has aired) and the config; the pane draws it.
import { withoutComments } from '../util.js';
import { legendWhy } from '../chronicle/notable.js';
import { statOf } from '../chronicle/chronicle.js';

export const POSITION_NAME = /** @type {Record<string, string>} */ ({ K: 'KEEPER', D: 'DEFENDER', M: 'MIDFIELDER', S: 'STRIKER' });

/**
 * The stats on a card, after games (GP): goals, assists and stops for every outfield player, the same columns so cards
 * compare at a glance (Tom, Task 221: stops added once the team moved to a heading); a keeper's saves and save %.
 */
const OUTFIELD = /** @type {[string, string][]} */ ([['goals', 'G'], ['assists', 'A'], ['stops', 'ST']]);
export const CARD_STATS = /** @type {Record<string, [string, string][]>} */ ({
  S: OUTFIELD, M: OUTFIELD, D: OUTFIELD,
  K: [['saves', 'SV'], ['savePct', 'SV%']],
});

/** A line's value for a card stat. @param {import('../chronicle/chronicle.js').Line} line @param {string} stat */
export function cardStat(line, stat) {
  if (stat === 'savePct') {
    const faced = line.saves + line.conceded;
    return faced ? line.saves / faced : null;
  }
  return statOf(line, stat);
}

/** Per chronicle: each season's star cut (the overall at the top starShare). */
const cuts = new WeakMap();

/**
 * Their standing in a season, in words: a role (STAR PLAYER, STARTER, SQUAD PLAYER, or RESERVE in the Kindling League)
 * and a tag (RISING when young, VETERAN past their peak), from data/chronicle.json standing.
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle @param {any} options  config.chronicle
 * @param {string} playerId @param {number} season
 * @returns {{ role: string, tag: string | null, words: string } | null}  null if they didn't play that season.
 */
export function standingIn(chronicle, options, playerId, season) {
  const S = withoutComments(options.standing);
  const p = /** @type {import('../chronicle/chronicle.js').PlayerRecord} */ (chronicle.players.get(playerId));
  const line = p.seasons[season]?.regular;
  const age = season - p.birthSeason;
  const tag = age <= S.risingAge ? 'RISING' : age >= p.peakAge + S.veteranYears ? 'VETERAN' : null;
  /** @param {string} role */
  const out = (role) => ({ role, tag, words: tag ? `${tag} ${role}` : role });
  if (!line) return p.status === 'reserves' && season === latestSeason(chronicle) ? out('RESERVE') : null;
  let bySeason = cuts.get(chronicle);
  if (!bySeason) cuts.set(chronicle, (bySeason = new Map()));
  if (!bySeason.has(season)) {
    const all = [...chronicle.players.values()].filter((q) => q.seasons[season]?.regular).map((q) => q.overall[season] ?? 0).sort((a, b) => b - a);
    bySeason.set(season, all[Math.max(0, Math.ceil(all.length * S.starShare) - 1)] ?? Infinity);
  }
  if ((p.overall[season] ?? 0) >= bySeason.get(season)) return out('STAR PLAYER');
  const games = chronicle.season(season).table.find((r) => r.teamId === line.teamId)?.played ?? 0;
  return out(games && line.starts >= S.starterShare * games ? 'STARTER' : 'SQUAD PLAYER');
}

/** The latest season with a match in the chronicle. @param {import('../chronicle/chronicle.js').Chronicle} chronicle */
const latestSeason = (chronicle) => Math.max(0, ...[...chronicle.seasons.values()].filter((e) => e.matchIds.length).map((e) => e.season));

/**
 * Everything the card shows.
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle
 * @param {import('../config.js').Config} config
 * @param {string} playerId
 */
export function playerCard(chronicle, config, playerId) {
  const p = /** @type {import('../chronicle/chronicle.js').PlayerRecord} */ (chronicle.players.get(playerId));
  const opts = config.chronicle;
  const now = latestSeason(chronicle);
  const regions = Object.fromEntries(config.regions.regions.map((/** @type {any} */ r) => [r.id, r.name]));
  const seasons = Object.keys(p.seasons).map(Number).sort((a, b) => a - b);
  const lastTeam = p.teamId ?? (seasons.length ? p.seasons[seasons[seasons.length - 1]].teamId : null);
  const ageAt = p.retired ? p.retired.season : now;
  const awards = /** @type {Record<string, number[]>} */ ({});
  for (const a of p.awards) (awards[a.award] ??= []).push(a.season);
  return {
    id: p.id,
    name: `${p.firstName} ${p.lastName}`,
    position: p.position,
    positionName: POSITION_NAME[p.position] ?? p.position,
    status: p.status,
    teamId: p.teamId,
    lastTeamId: lastTeam,
    retired: p.retired,
    age: ageAt - p.birthSeason,
    region: regions[p.region] ?? p.region,
    joined: p.joined,
    moves: p.moves,
    standing: p.retired ? null : standingIn(chronicle, opts, p.id, seasons.includes(now) ? now : now),
    legend: legendWhy(chronicle, opts, p.id),
    /** This season (the latest with a match), regular season and playoffs. */
    season: { season: now, regular: p.seasons[now]?.regular ?? null, playoffs: p.seasons[now]?.playoffs ?? null },
    /** A row a season, newest first: the team, games, the position's stats (both parts), the standing. */
    career: seasons.slice().reverse().map((s) => {
      const ps = p.seasons[s];
      const both = [ps.regular, ps.playoffs].filter(Boolean);
      const sum = (/** @type {string} */ k) => both.reduce((n, l) => n + statOf(/** @type {any} */ (l), k), 0);
      const line = /** @type {any} */ ({ saves: sum('saves'), conceded: sum('conceded') });
      return {
        season: s, teamId: ps.teamId, games: sum('appearances'),
        stats: CARD_STATS[p.position].map(([k]) => (k === 'savePct' ? cardStat(line, k) : sum(k))),
        potm: sum('potm'),
        cup: chronicle.season(s).championId === ps.teamId,
      };
    }),
    totals: chronicle.career(p.id, 'all'),
    honours: {
      awards: Object.entries(awards).map(([award, won]) => ({ award, seasons: won })),
      cups: seasons.filter((s) => chronicle.season(s).championId === p.seasons[s].teamId),
      records: chronicle.recordsBroken.filter((r) => r.playerId === p.id),
      milestones: chronicle.milestones.filter((m) => m.playerId === p.id && (m.stat !== 'appearances' || m.value >= opts.latest.appearancesFrom)),
    },
  };
}
