// Money on screen (Task 234): guilders, the League's currency (Tom). The sim counts in thousands a season
// (rules.finances); the screens write ƒ4.2M or ƒ850K. VT323 has the florin sign (checked in the browser, Task 234).
export const GUILDER = 'ƒ';

/**
 * Thousands of guilders as words: ƒ4.2M from a million up, ƒ850K below.
 * @param {number} thousands
 */
export function guilders(thousands) {
  return thousands >= 1000 ? `${GUILDER}${(thousands / 1000).toFixed(1)}M` : `${GUILDER}${Math.round(thousands)}K`;
}

/**
 * A team's squad on its deals, as aired (the chronicle's: Task 234), biggest first. The reserves are off the cap.
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle @param {string} teamId
 * @returns {{ playerId: string, wage: number, until: number }[]}
 */
export function teamContracts(chronicle, teamId) {
  const out = [];
  for (const p of chronicle.players.values()) {
    if (p.status === 'roster' && p.teamId === teamId && p.contract) out.push({ playerId: p.id, wage: p.contract.wage, until: p.contract.until });
  }
  return out.sort((a, b) => b.wage - a.wage || a.playerId.localeCompare(b.playerId));
}

/**
 * Every team's payroll, as aired, the biggest first.
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle @param {string[]} teamIds
 * @returns {{ teamId: string, payroll: number }[]}
 */
export function payrolls(chronicle, teamIds) {
  return teamIds.map((teamId) => ({ teamId, payroll: teamContracts(chronicle, teamId).reduce((a, c) => a + c.wage, 0) }))
    .sort((a, b) => b.payroll - a.payroll || a.teamId.localeCompare(b.teamId));
}
