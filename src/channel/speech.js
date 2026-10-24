// Speech at the desk and in the interview (Task 135; docs/channel.md §18.10): which recorded clip goes with a line, and
// whose voice says it. Pure and DOM-free; the clips are made ahead of time by `npm run voices -- --desk/--interviews
// --paid` (vision §12) and played by audio.js. Until a clip exists, its line stays silent, as before.

/**
 * A desk line's clip under assets/voices/, without .mp3: desk/<presenter>/<kind>-<way>[-<team>] (Task 131's clip
 * key); also its key in config.voiceLengths (Task 187).
 * @param {string} presenterId @param {import('./studio.js').Clip} clip
 */
export const deskClipKey = (presenterId, clip) => `desk/${presenterId}/${clip.kind}-${clip.way}${clip.team ? `-${clip.team}` : ''}${clip.surname ? `-${clip.surname.toLowerCase()}` : ''}`;

/** A desk line's clip. @param {string} presenterId @param {import('./studio.js').Clip} clip */
export const deskClipUrl = (presenterId, clip) => `assets/voices/${deskClipKey(presenterId, clip)}.mp3`;

/**
 * The interview's voice for a player (Task 133): their birth region's, a woman's if their first name is one of the
 * region's womensNames, else a man's. Its folder is <region>-<man|woman>.
 * @param {{ firstName: string, region: string } | undefined} player
 * @param {{ id: string, womensNames: string[] }[]} regions
 * @returns {string | null}  null for a player we can't place (no voice: the quote stays silent).
 */
export function interviewVoice(player, regions) {
  const region = player && regions.find((r) => r.id === player.region);
  if (!player || !region) return null;
  return `${region.id}-${region.womensNames.includes(player.firstName) ? 'woman' : 'man'}`;
}

/** A quote's clip under assets/voices/, without .mp3: interview/<voice>/<role>-<result>-<index>. @param {string} voice @param {string} key */
export const interviewClipKey = (voice, key) => `interview/${voice}/${key}`;

/** A quote's clip. @param {string} voice @param {string} key */
export const interviewClipUrl = (voice, key) => `assets/voices/${interviewClipKey(voice, key)}.mp3`;

/**
 * How long something is said for, seconds (Task 187): its clip's length (config.voiceLengths), or without a clip
 * (not made yet), as long as its text takes to type at the usual speed.
 * @param {Record<string, number>} lengths @param {string | null} key  The clip's key, if it has a voice.
 * @param {string} text @param {number} usual  chars a second.
 */
export function saidSeconds(lengths, key, text, usual) {
  const s = key ? lengths[key] : undefined;
  return s && s > 0.3 ? s : text.length / usual;
}

/**
 * How fast a line types so it ends with its voice (Task 135): its length over the clip's length, or the usual speed
 * without a clip.
 * @param {number} chars @param {number | null} seconds  The clip's length, if it's loaded. @param {number} usual  chars a second.
 */
export function typingSpeed(chars, seconds, usual) {
  return seconds && seconds > 0.3 ? chars / seconds : usual;
}
